-- 관리자 gateway read RPC 성능 보강
--
-- 기존 gateway read RPC는 상품/제출 행마다 actor와 permission binding을 다시
-- 조회했다. 데이터가 큰 company scope에서는 동일한 권한 계산이 수천 번
-- 반복되어 PostgREST의 8초 statement_timeout에 걸릴 수 있다.
--
-- 이 migration은 권한 의미와 반환 shape를 바꾸지 않고, 요청 시작 시
-- permission별 허용 manager ID를 한 번 계산해 dashboard/review RPC가
-- 재사용하도록 한다. 기존 RPC의 execute 권한은 service_role에만 남긴다.

create or replace function public.admin_gateway_allowed_manager_ids(
  p_actor_admin_id text,
  p_permission_code text,
  p_force_personal_scope boolean default false
)
returns table (login_id text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor public.admins;
  v_scope text;
begin
  v_actor := public.admin_gateway_actor(p_actor_admin_id);
  v_scope := public.admin_gateway_effective_scope(
    p_actor_admin_id,
    p_permission_code,
    p_force_personal_scope
  );

  if v_scope is null then
    return;
  end if;

  -- all scope는 기존 manager_allowed 함수와 같이 비어 있지 않은
  -- manager_id를 모두 허용한다. 활성 관리자도 함께 반환해 admin member
  -- 조회가 상품이 없는 관리자까지 누락하지 않게 한다.
  if v_scope = 'all' then
    return query
    select all_managers.login_id
    from (
      select btrim(admins.login_id) as login_id
      from public.admins as admins
      where coalesce(admins.is_active, true) = true

      union

      select distinct btrim(products.manager_id) as login_id
      from public.products as products
      where nullif(btrim(products.manager_id), '') is not null
    ) as all_managers
    where nullif(all_managers.login_id, '') is not null;
    return;
  end if;

  return query
  select btrim(admins.login_id)
  from public.admins as admins
  where coalesce(admins.is_active, true) = true
    and (
      (
        v_scope = 'personal'
        and admins.login_id = v_actor.login_id
      )
      or (
        v_scope = 'company'
        and coalesce(admins.company_id::text, nullif(btrim(admins.company), ''))
          = coalesce(v_actor.company_id::text, nullif(btrim(v_actor.company), ''))
      )
    );
end;
$function$;

revoke all on function public.admin_gateway_allowed_manager_ids(text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_gateway_allowed_manager_ids(text, text, boolean) to service_role;

create or replace function public.admin_gateway_get_products(
  p_actor_admin_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_manager_ids text[];
  v_products jsonb;
begin
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'product.read');

  select coalesce(array_agg(manager_ids.login_id order by manager_ids.login_id), '{}'::text[])
  into v_manager_ids
  from public.admin_gateway_allowed_manager_ids(
    p_actor_admin_id,
    'product.read'
  ) as manager_ids;

  select coalesce(
    jsonb_agg(to_jsonb(product_rows) order by product_rows.id desc),
    '[]'::jsonb
  )
  into v_products
  from (
    select
      products.id,
      products.title,
      products.product_name,
      products.manager_id,
      products.deposit_date,
      products.product_date,
      products.is_real_shipping,
      products.created_at,
      products.company_name,
      products.option_name,
      products.review_type,
      products.planned_depositor_name,
      products."deposit_GB",
      products.bundle_id
    from public.products as products
    where btrim(products.manager_id) = any(v_manager_ids)
  ) as product_rows;

  return jsonb_build_object(
    'products', v_products,
    'scope', public.admin_gateway_scope_json(p_actor_admin_id, array['product.read']::text[])
  );
end;
$function$;

revoke all on function public.admin_gateway_get_products(text)
  from public, anon, authenticated;
grant execute on function public.admin_gateway_get_products(text) to service_role;

create or replace function public.get_admin_review_receive_product_summaries_gateway(
  p_actor_admin_id text,
  p_include_company_data boolean default false,
  p_view_mode text default 'all',
  p_filters jsonb default '{}'::jsonb,
  p_page_size integer default 50,
  p_cursor_product_date date default null,
  p_cursor_product_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_page_size integer := least(greatest(coalesce(p_page_size, 50), 1), 200);
  v_view_mode text := coalesce(nullif(lower(btrim(p_view_mode)), ''), 'all');
  v_product_manager_ids text[];
  v_submission_manager_ids text[];
  v_rows jsonb;
  v_total_count bigint := 0;
begin
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'product.read');
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.read');

  if v_view_mode not in ('all', 'in_progress', 'completed') then
    raise exception '리뷰받기 목록 상태값이 올바르지 않습니다.' using errcode = '22023';
  end if;

  select coalesce(array_agg(manager_ids.login_id order by manager_ids.login_id), '{}'::text[])
  into v_product_manager_ids
  from public.admin_gateway_allowed_manager_ids(
    p_actor_admin_id,
    'product.read'
  ) as manager_ids;

  select coalesce(array_agg(manager_ids.login_id order by manager_ids.login_id), '{}'::text[])
  into v_submission_manager_ids
  from public.admin_gateway_allowed_manager_ids(
    p_actor_admin_id,
    'submission.read'
  ) as manager_ids;

  with scoped_products as materialized (
    select
      products.*,
      coalesce(products.bundle_id::bigint, products.id) as bundle_key,
      coalesce(products.product_date, products.created_at::date, date '0001-01-01') as sort_date,
      not (
        nullif(btrim(coalesce(products.title, '')), '') is null
        and nullif(btrim(coalesce(products.product_name, '')), '') is null
        and nullif(btrim(coalesce(products.option_name, '')), '') is null
        and nullif(btrim(coalesce(products.review_type, '')), '') is null
        and nullif(btrim(coalesce(products.description, '')), '') is null
        and nullif(btrim(coalesce(products.product_link, '')), '') is null
        and nullif(btrim(coalesce(products.planned_depositor_name, '')), '') is null
      ) as is_visible_product
    from public.products as products
    where btrim(products.manager_id) = any(v_product_manager_ids)
  ), product_counts as (
    select
      scoped_products.id as product_id,
      count(submissions.id)::integer as submission_count,
      count(submissions.id) filter (
        where coalesce(submissions.is_review_verified, false) = false
      )::integer as purchase_count,
      count(submissions.id) filter (
        where coalesce(submissions.is_review_verified, false) = true
          and coalesce(submissions.is_deposit_verified, false) = false
      )::integer as review_count,
      count(submissions.id) filter (
        where coalesce(submissions.is_review_verified, false) = true
          and coalesce(submissions.is_deposit_verified, false) = true
      )::integer as complete_count
    from scoped_products
    left join public.submissions as submissions
      on submissions.product_id = scoped_products.id
      and btrim(scoped_products.manager_id) = any(v_submission_manager_ids)
    group by scoped_products.id
  ), product_rows as (
    select
      scoped_products.*,
      coalesce(product_counts.submission_count, 0) as submission_count,
      coalesce(product_counts.purchase_count, 0) as purchase_count,
      coalesce(product_counts.review_count, 0) as review_count,
      coalesce(product_counts.complete_count, 0) as complete_count
    from scoped_products
    left join product_counts
      on product_counts.product_id = scoped_products.id
  ), bundle_meta as (
    select
      product_rows.bundle_key,
      min(product_rows.id) as representative_product_id,
      min(product_rows.id) filter (where product_rows.is_visible_product) as first_visible_product_id,
      count(*)::integer as bundle_product_count,
      count(*) filter (where product_rows.is_visible_product)::integer as bundle_item_count
    from product_rows
    group by product_rows.bundle_key
  ), bundle_rows as (
    select
      representative.id,
      representative.bundle_key as bundle_id,
      coalesce(first_visible.title, representative.title) as title,
      first_visible.product_name,
      first_visible.description,
      first_visible.product_link,
      representative.company_name,
      first_visible.option_name,
      first_visible.review_type,
      coalesce(first_visible.planned_depositor_name, representative.planned_depositor_name) as planned_depositor_name,
      representative.manager_id,
      representative.product_date,
      representative.created_at,
      coalesce(first_visible."deposit_GB", representative."deposit_GB") as "deposit_GB",
      representative.sort_date as cursor_product_date,
      coalesce(sum(product_rows.purchase_count) filter (where product_rows.is_visible_product), 0)::integer as purchase_count,
      coalesce(sum(product_rows.review_count) filter (where product_rows.is_visible_product), 0)::integer as review_count,
      coalesce(sum(product_rows.complete_count) filter (where product_rows.is_visible_product), 0)::integer as complete_count,
      coalesce(sum(product_rows.submission_count) filter (where product_rows.is_visible_product), 0)::integer as submission_count,
      bundle_meta.bundle_product_count,
      bundle_meta.bundle_item_count,
      jsonb_agg(
        jsonb_build_object(
          'id', product_rows.id,
          'bundle_id', product_rows.bundle_key,
          'title', product_rows.title,
          'product_name', product_rows.product_name,
          'description', product_rows.description,
          'product_link', product_rows.product_link,
          'company_name', product_rows.company_name,
          'option_name', product_rows.option_name,
          'review_type', product_rows.review_type,
          'planned_depositor_name', product_rows.planned_depositor_name,
          'manager_id', product_rows.manager_id,
          'product_date', product_rows.product_date,
          'created_at', product_rows.created_at,
          'deposit_GB', product_rows."deposit_GB",
          'purchase_count', product_rows.purchase_count,
          'review_count', product_rows.review_count,
          'complete_count', product_rows.complete_count,
          'submission_count', product_rows.submission_count,
          'status', case
            when product_rows.submission_count > 0
              and product_rows.complete_count = product_rows.submission_count
              then 'completed'
            else 'in_progress'
          end
        ) order by product_rows.id
      ) as bundle_items,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', product_rows.id,
            'bundle_id', product_rows.bundle_key,
            'title', product_rows.title,
            'product_name', product_rows.product_name,
            'description', product_rows.description,
            'product_link', product_rows.product_link,
            'company_name', product_rows.company_name,
            'option_name', product_rows.option_name,
            'review_type', product_rows.review_type,
            'planned_depositor_name', product_rows.planned_depositor_name,
            'manager_id', product_rows.manager_id,
            'product_date', product_rows.product_date,
            'created_at', product_rows.created_at,
            'deposit_GB', product_rows."deposit_GB",
            'purchase_count', product_rows.purchase_count,
            'review_count', product_rows.review_count,
            'complete_count', product_rows.complete_count,
            'submission_count', product_rows.submission_count,
            'status', case
              when product_rows.submission_count > 0
                and product_rows.complete_count = product_rows.submission_count
                then 'completed'
              else 'in_progress'
            end
          ) order by product_rows.id
        ) filter (where product_rows.is_visible_product),
        '[]'::jsonb
      ) as bundle_visible_items
    from bundle_meta
    join product_rows as representative
      on representative.id = bundle_meta.representative_product_id
    left join product_rows as first_visible
      on first_visible.id = bundle_meta.first_visible_product_id
    join product_rows
      on product_rows.bundle_key = bundle_meta.bundle_key
    group by
      representative.id,
      representative.bundle_key,
      representative.title,
      representative.company_name,
      representative.manager_id,
      representative.product_date,
      representative.created_at,
      representative.sort_date,
      representative.planned_depositor_name,
      representative."deposit_GB",
      first_visible.title,
      first_visible.product_name,
      first_visible.description,
      first_visible.product_link,
      first_visible.option_name,
      first_visible.review_type,
      first_visible.planned_depositor_name,
      first_visible."deposit_GB",
      bundle_meta.bundle_product_count,
      bundle_meta.bundle_item_count
  ), status_rows as (
    select
      bundle_rows.*,
      case
        when bundle_rows.submission_count > 0
          and bundle_rows.complete_count = bundle_rows.submission_count
          then 'completed'
        else 'in_progress'
      end as status,
      case when bundle_rows."deposit_GB" in (3, 4) then '업체입금' else '자체입금' end as product_fee_deposit_label,
      case when bundle_rows."deposit_GB" in (2, 4) then '없음' else '자체입금' end as review_fee_deposit_label
    from bundle_rows
  ), filtered_rows as (
    select status_rows.*
    from status_rows
    where (
      v_view_mode = 'all'
      or (v_view_mode = 'completed' and status_rows.status = 'completed')
      or (v_view_mode = 'in_progress' and status_rows.status = 'in_progress')
    )
    and (
      nullif(coalesce(p_filters, '{}'::jsonb) #>> '{registered_date,start}', '') is null
      or status_rows.cursor_product_date >= (coalesce(p_filters, '{}'::jsonb) #>> '{registered_date,start}')::date
    )
    and (
      nullif(coalesce(p_filters, '{}'::jsonb) #>> '{registered_date,end}', '') is null
      or status_rows.cursor_product_date <= (coalesce(p_filters, '{}'::jsonb) #>> '{registered_date,end}')::date
    )
    and (
      nullif(public.normalize_review_receive_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'company_name'), '') is null
      or public.normalize_review_receive_filter_text(status_rows.company_name)
        like '%' || public.normalize_review_receive_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'company_name') || '%'
    )
    and (
      nullif(public.normalize_review_receive_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'product_name'), '') is null
      or public.normalize_review_receive_filter_text(case when status_rows.bundle_item_count = 0 then '품목 미등록' else status_rows.product_name end)
        like '%' || public.normalize_review_receive_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'product_name') || '%'
    )
    and (
      nullif(public.normalize_review_receive_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'option_name'), '') is null
      or public.normalize_review_receive_filter_text(case when status_rows.bundle_item_count = 0 then '품목 미등록' else status_rows.option_name end)
        like '%' || public.normalize_review_receive_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'option_name') || '%'
    )
    and (
      nullif(public.normalize_review_receive_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'review_type'), '') is null
      or public.normalize_review_receive_filter_text(case when status_rows.bundle_item_count = 0 then '품목 미등록' else status_rows.review_type end)
        like '%' || public.normalize_review_receive_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'review_type') || '%'
    )
    and (
      nullif(public.normalize_review_receive_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'product_fee_deposit_GB'), '') is null
      or public.normalize_review_receive_filter_text(case when status_rows.bundle_item_count = 0 then '품목 미등록' else status_rows.product_fee_deposit_label end)
        like '%' || public.normalize_review_receive_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'product_fee_deposit_GB') || '%'
    )
    and (
      nullif(public.normalize_review_receive_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'review_fee_deposit_GB'), '') is null
      or public.normalize_review_receive_filter_text(case when status_rows.bundle_item_count = 0 then '품목 미등록' else status_rows.review_fee_deposit_label end)
        like '%' || public.normalize_review_receive_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'review_fee_deposit_GB') || '%'
    )
    and (
      nullif(public.normalize_review_receive_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'product_link'), '') is null
      or public.normalize_review_receive_filter_text(case when status_rows.bundle_item_count = 0 then '품목 미등록' else status_rows.product_link end)
        like '%' || public.normalize_review_receive_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'product_link') || '%'
    )
    and (
      nullif(public.normalize_review_receive_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'manager_id'), '') is null
      or public.normalize_review_receive_filter_text(status_rows.manager_id)
        like '%' || public.normalize_review_receive_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'manager_id') || '%'
    )
    and (
      p_cursor_product_date is null
      or p_cursor_product_id is null
      or status_rows.cursor_product_date < p_cursor_product_date
      or (
        status_rows.cursor_product_date = p_cursor_product_date
        and status_rows.id < p_cursor_product_id
      )
    )
  ), paged_rows as (
    select filtered_rows.*, count(*) over() as total_count
    from filtered_rows
    order by filtered_rows.cursor_product_date desc, filtered_rows.id desc
    limit v_page_size + 1
  )
  select
    coalesce(max(paged_rows.total_count), 0),
    coalesce(
      jsonb_agg((to_jsonb(paged_rows) - 'total_count') order by paged_rows.cursor_product_date desc, paged_rows.id desc),
      '[]'::jsonb
    )
  into v_total_count, v_rows
  from paged_rows;

  return jsonb_build_object(
    'rows', v_rows,
    'scope', public.admin_gateway_scope_json(
      p_actor_admin_id,
      array['product.read', 'submission.read']::text[]
    ),
    'pageInfo', jsonb_build_object(
      'hasMore', v_total_count > v_page_size,
      'nextCursor', null,
      'pageSize', v_page_size,
      'totalCount', v_total_count
    )
  );
end;
$function$;

revoke all on function public.get_admin_review_receive_product_summaries_gateway(
  text, boolean, text, jsonb, integer, date, bigint
) from public, anon, authenticated;
grant execute on function public.get_admin_review_receive_product_summaries_gateway(text, boolean, text, jsonb, integer, date, bigint) to service_role;

create or replace function public.get_admin_dashboard_data(
  p_actor_admin_id text,
  p_include_company_data boolean default false,
  p_date_filter jsonb default null,
  p_period jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_product_manager_ids text[];
  v_submission_manager_ids text[];
  v_application_manager_ids text[] := '{}'::text[];
  v_photo_manager_ids text[] := '{}'::text[];
  v_member_manager_ids text[] := '{}'::text[];
  v_product_ids bigint[];
  v_products jsonb;
  v_submissions jsonb;
  v_applications jsonb := '[]'::jsonb;
  v_evidence_photos jsonb := '[]'::jsonb;
  v_company_members jsonb := '[]'::jsonb;
  v_can_read_applications boolean;
  v_can_read_photos boolean;
  v_can_read_members boolean;
begin
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'menu.dashboard');
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'product.read');
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.read');

  select coalesce(array_agg(manager_ids.login_id order by manager_ids.login_id), '{}'::text[])
  into v_product_manager_ids
  from public.admin_gateway_allowed_manager_ids(p_actor_admin_id, 'product.read') as manager_ids;

  select coalesce(array_agg(manager_ids.login_id order by manager_ids.login_id), '{}'::text[])
  into v_submission_manager_ids
  from public.admin_gateway_allowed_manager_ids(p_actor_admin_id, 'submission.read') as manager_ids;

  select coalesce(array_agg(products.id order by products.created_at desc, products.id), '{}'::bigint[])
  into v_product_ids
  from public.products as products
  where btrim(products.manager_id) = any(v_product_manager_ids);

  select coalesce(
    jsonb_agg(to_jsonb(product_rows) order by product_rows.created_at desc, product_rows.id),
    '[]'::jsonb
  )
  into v_products
  from (
    select
      products.id,
      products.manager_id,
      products.title,
      products.product_name,
      products.review_type,
      products.company_name,
      products.option_name,
      products.is_real_shipping,
      products.created_at
    from public.products as products
    where products.id = any(v_product_ids)
  ) as product_rows;

  select coalesce(
    jsonb_agg(to_jsonb(submission_rows) order by submission_rows.created_at, submission_rows.id),
    '[]'::jsonb
  )
  into v_submissions
  from (
    select
      submissions.id,
      submissions.product_id,
      submissions.assign_name,
      submissions.order_number,
      submissions.buyer_name,
      submissions.recipient_name,
      submissions.review_fee,
      submissions.is_review_verified,
      submissions.is_deposit_verified,
      submissions.deposited_at,
      submissions.created_at
    from public.submissions as submissions
    join public.products as products on products.id = submissions.product_id
    where submissions.product_id = any(v_product_ids)
      and btrim(products.manager_id) = any(v_submission_manager_ids)
  ) as submission_rows;

  v_can_read_applications := public.admin_gateway_permission_scope(
    p_actor_admin_id,
    'application.read'
  ) is not null;

  if v_can_read_applications then
    select coalesce(array_agg(manager_ids.login_id order by manager_ids.login_id), '{}'::text[])
    into v_application_manager_ids
    from public.admin_gateway_allowed_manager_ids(p_actor_admin_id, 'application.read') as manager_ids;

    select coalesce(
      jsonb_agg(to_jsonb(application_rows) order by application_rows.created_at, application_rows.id),
      '[]'::jsonb
    )
    into v_applications
    from (
      select applications.id, applications.product_id, applications.is_confirmed, applications.created_at
      from public.applications as applications
      join public.products as products on products.id = applications.product_id
      where applications.product_id = any(v_product_ids)
        and btrim(products.manager_id) = any(v_application_manager_ids)
    ) as application_rows;
  end if;

  v_can_read_photos := public.admin_gateway_permission_scope(
    p_actor_admin_id,
    'submission.photo.read'
  ) is not null;

  if v_can_read_photos then
    select coalesce(array_agg(manager_ids.login_id order by manager_ids.login_id), '{}'::text[])
    into v_photo_manager_ids
    from public.admin_gateway_allowed_manager_ids(p_actor_admin_id, 'submission.photo.read') as manager_ids;

    select coalesce(
      jsonb_agg(to_jsonb(photo_rows) order by photo_rows.created_at, photo_rows.id),
      '[]'::jsonb
    )
    into v_evidence_photos
    from (
      select
        evidence_photos.id,
        evidence_photos.submission_id,
        evidence_photos.photo_type,
        evidence_photos.created_at
      from public.evidence_photos as evidence_photos
      join public.submissions as submissions on submissions.id = evidence_photos.submission_id
      join public.products as products on products.id = submissions.product_id
      where submissions.product_id = any(v_product_ids)
        and btrim(products.manager_id) = any(v_submission_manager_ids)
        and btrim(products.manager_id) = any(v_photo_manager_ids)
    ) as photo_rows;
  end if;

  v_can_read_members := public.admin_gateway_permission_scope(
    p_actor_admin_id,
    'admin_member.read'
  ) is not null;

  if v_can_read_members then
    select coalesce(array_agg(manager_ids.login_id order by manager_ids.login_id), '{}'::text[])
    into v_member_manager_ids
    from public.admin_gateway_allowed_manager_ids(p_actor_admin_id, 'admin_member.read') as manager_ids;

    select coalesce(
      jsonb_agg(to_jsonb(member_rows) order by member_rows.company, member_rows.login_id),
      '[]'::jsonb
    )
    into v_company_members
    from (
      select admins.login_id, admins.username, admins.company
      from public.admins as admins
      where coalesce(admins.is_active, true) = true
        and btrim(admins.login_id) = any(v_member_manager_ids)
    ) as member_rows;
  end if;

  return jsonb_build_object(
    'products', v_products,
    'submissions', v_submissions,
    'applications', v_applications,
    'evidencePhotos', v_evidence_photos,
    'companyMembers', v_company_members,
    'scope', public.admin_gateway_scope_json(
      p_actor_admin_id,
      array['menu.dashboard', 'product.read', 'submission.read']::text[]
    )
  );
end;
$function$;

revoke all on function public.get_admin_dashboard_data(text, boolean, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.get_admin_dashboard_data(text, boolean, jsonb, jsonb) to service_role;
