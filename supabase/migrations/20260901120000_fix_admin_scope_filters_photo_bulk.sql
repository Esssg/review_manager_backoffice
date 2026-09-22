-- 상품/권한/성능 3건: 요청 scope를 서버에서 clamp하고, 상품전체보기 필터/사진 응답과
-- 상품·리뷰어 일괄 입력을 배치 처리한다.
-- 기존 RPC는 rollback 호환성을 위해 유지하고, gateway operation만 v2 RPC를 사용한다.

create index if not exists evidence_photos_review_submission_created_idx
  on public.evidence_photos (submission_id, created_at, id)
  where photo_type = 'review';

create or replace function public.admin_gateway_scope_json(
  p_actor_admin_id text,
  p_permission_codes text[],
  p_force_personal_scope boolean default false
)
returns jsonb
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
  v_scope := public.admin_gateway_common_scope(
    p_actor_admin_id,
    p_permission_codes,
    p_force_personal_scope
  );

  return jsonb_build_object(
    'adminId', v_actor.login_id,
    'managerIds', '[]'::jsonb,
    'companyId', v_actor.company_id,
    'companyName', v_actor.company,
    'role', v_actor.role,
    'includeCompanyData', v_scope in ('company', 'all'),
    'scopePolicy', coalesce(v_scope, 'personal'),
    'isCompanyScopeAvailable', v_scope in ('company', 'all'),
    'isServerResolved', true
  );
end;
$function$;

create or replace function public.get_admin_review_receive_product_summaries_gateway_v2(
  p_actor_admin_id text,
  p_include_company_data boolean default false,
  p_force_personal_scope boolean default false,
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
    'product.read',
    p_force_personal_scope
  ) as manager_ids;

  select coalesce(array_agg(manager_ids.login_id order by manager_ids.login_id), '{}'::text[])
  into v_submission_manager_ids
  from public.admin_gateway_allowed_manager_ids(
    p_actor_admin_id,
    'submission.read',
    p_force_personal_scope
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
      array['product.read', 'submission.read']::text[],
      p_force_personal_scope
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


create or replace function public.get_admin_product_overview_rows_gateway_v2(
  p_actor_admin_id text,
  p_include_company_data boolean default false,
  p_force_personal_scope boolean default false,
  p_status text default 'all',
  p_filters jsonb default '{}'::jsonb,
  p_page_size integer default 300,
  p_cursor_product_created_at timestamptz default null,
  p_cursor_product_id bigint default null,
  p_cursor_submission_created_at timestamptz default null,
  p_cursor_submission_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_status text := coalesce(nullif(lower(btrim(p_status)), ''), 'all');
  v_page_size integer := least(greatest(coalesce(p_page_size, 300), 1), 1000);
  v_rows jsonb;
  v_total_count bigint := 0;
  v_product_manager_ids text[] := '{}'::text[];
  v_submission_manager_ids text[] := '{}'::text[];
  v_photo_manager_ids text[] := '{}'::text[];
  v_can_read_photos boolean := false;
begin
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'product.read');
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.read');

  if v_status not in ('all', 'purchase', 'review', 'complete') then
    raise exception '상품전체보기 상태값이 올바르지 않습니다.' using errcode = '22023';
  end if;

  select coalesce(array_agg(manager_ids.login_id order by manager_ids.login_id), '{}'::text[])
  into v_product_manager_ids
  from public.admin_gateway_allowed_manager_ids(
    p_actor_admin_id,
    'product.read',
    p_force_personal_scope
  ) as manager_ids;

  select coalesce(array_agg(manager_ids.login_id order by manager_ids.login_id), '{}'::text[])
  into v_submission_manager_ids
  from public.admin_gateway_allowed_manager_ids(
    p_actor_admin_id,
    'submission.read',
    p_force_personal_scope
  ) as manager_ids;

  v_can_read_photos := public.admin_gateway_permission_scope(
    p_actor_admin_id,
    'submission.photo.read'
  ) is not null;

  if v_can_read_photos then
    select coalesce(array_agg(manager_ids.login_id order by manager_ids.login_id), '{}'::text[])
    into v_photo_manager_ids
    from public.admin_gateway_allowed_manager_ids(
      p_actor_admin_id,
      'submission.photo.read',
      p_force_personal_scope
    ) as manager_ids;
  end if;

  with base_rows as (
    select
      products.id as product_id,
      submissions.id as submission_id,
      products.created_at as product_created_at,
      submissions.created_at as submission_created_at,
      products.created_at as product_sort_at,
      submissions.created_at as submission_sort_at,
      products.manager_id,
      products.title,
      products.product_name,
      products.deposit_date,
      products.description,
      products.product_link,
      products.is_real_shipping,
      products.company_name,
      products.option_name,
      products.review_type,
      products.planned_depositor_name,
      products."deposit_GB",
      submissions.assign_name,
      case
        when v_can_read_photos
          and btrim(products.manager_id) = any(v_photo_manager_ids)
          and exists (
            select 1
            from public.evidence_photos as evidence_photos
            where evidence_photos.submission_id = submissions.id
              and evidence_photos.photo_type = 'review'
          )
          then true
        else false
      end as has_review_photos,
      submissions.order_number,
      submissions.buyer_name,
      submissions.recipient_name,
      submissions.purchase_account,
      submissions.contact,
      submissions.address,
      submissions.bank_name,
      submissions.bank_account,
      submissions.account_holder,
      submissions.amount,
      submissions.review_fee,
      coalesce(submissions.is_purchase_verified, false) as is_purchase_verified,
      coalesce(submissions.is_review_verified, false) as is_review_verified,
      coalesce(submissions.is_deposit_verified, false) as is_deposit_verified,
      submissions.deposited_at,
      submissions.actual_depositor_name,
      case when products."deposit_GB" in (3, 4) then '업체입금' else '자체입금' end as product_fee_deposit_GB,
      case when products."deposit_GB" in (2, 4) then '없음' else '자체입금' end as review_fee_deposit_GB
    from public.products as products
    join public.submissions as submissions on submissions.product_id = products.id
    where btrim(products.manager_id) = any(v_product_manager_ids)
      and btrim(products.manager_id) = any(v_submission_manager_ids)
  ), filtered_rows as (
    select base_rows.*
    from base_rows
    where (
      v_status = 'all'
      or (v_status = 'purchase' and base_rows.is_review_verified = false)
      or (v_status = 'review' and base_rows.is_review_verified = true and base_rows.is_deposit_verified = false)
      or (v_status = 'complete' and base_rows.is_review_verified = true and base_rows.is_deposit_verified = true)
    )
    and (
      nullif(public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'manager_id'), '') is null
      or public.normalize_product_overview_filter_text(base_rows.manager_id)
        like '%' || public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'manager_id') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'title'), '') is null
      or public.normalize_product_overview_filter_text(base_rows.title)
        like '%' || public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'title') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'product_name'), '') is null
      or public.normalize_product_overview_filter_text(base_rows.product_name)
        like '%' || public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'product_name') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'company_name'), '') is null
      or public.normalize_product_overview_filter_text(base_rows.company_name)
        like '%' || public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'company_name') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'option_name'), '') is null
      or public.normalize_product_overview_filter_text(base_rows.option_name)
        like '%' || public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'option_name') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'review_type'), '') is null
      or public.normalize_product_overview_filter_text(base_rows.review_type)
        like '%' || public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'review_type') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'assign_name'), '') is null
      or public.normalize_product_overview_filter_text(base_rows.assign_name)
        like '%' || public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'assign_name') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'order_number'), '') is null
      or public.normalize_product_overview_filter_text(base_rows.order_number)
        like '%' || public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'order_number') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'buyer_name'), '') is null
      or public.normalize_product_overview_filter_text(base_rows.buyer_name)
        like '%' || public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'buyer_name') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'recipient_name'), '') is null
      or public.normalize_product_overview_filter_text(base_rows.recipient_name)
        like '%' || public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'recipient_name') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'description'), '') is null
      or public.normalize_product_overview_filter_text(base_rows.description)
        like '%' || public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'description') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'product_link'), '') is null
      or public.normalize_product_overview_filter_text(base_rows.product_link)
        like '%' || public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'product_link') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'purchase_account'), '') is null
      or public.normalize_product_overview_filter_text(base_rows.purchase_account)
        like '%' || public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'purchase_account') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'contact'), '') is null
      or public.normalize_product_overview_filter_text(base_rows.contact)
        like '%' || public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'contact') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'address'), '') is null
      or public.normalize_product_overview_filter_text(base_rows.address)
        like '%' || public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'address') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'bank_name'), '') is null
      or public.normalize_product_overview_filter_text(base_rows.bank_name)
        like '%' || public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'bank_name') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'bank_account'), '') is null
      or public.normalize_product_overview_filter_text(base_rows.bank_account)
        like '%' || public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'bank_account') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'account_holder'), '') is null
      or public.normalize_product_overview_filter_text(base_rows.account_holder)
        like '%' || public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'account_holder') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'amount'), '') is null
      or public.normalize_product_overview_filter_text(coalesce(base_rows.amount::text, ''))
        like '%' || public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'amount') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'review_fee'), '') is null
      or public.normalize_product_overview_filter_text(coalesce(base_rows.review_fee::text, ''))
        like '%' || public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'review_fee') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'planned_depositor_name'), '') is null
      or public.normalize_product_overview_filter_text(base_rows.planned_depositor_name)
        like '%' || public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'planned_depositor_name') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'deposited_at'), '') is null
      or public.normalize_product_overview_filter_text(coalesce(base_rows.deposited_at::text, '')) =
        public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'deposited_at')
    )
    and (
      nullif(public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'actual_depositor_name'), '') is null
      or public.normalize_product_overview_filter_text(base_rows.actual_depositor_name)
        like '%' || public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'actual_depositor_name') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'product_fee_deposit_GB'), '') is null
      or public.normalize_product_overview_filter_text(base_rows.product_fee_deposit_GB)
        like '%' || public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'product_fee_deposit_GB') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'review_fee_deposit_GB'), '') is null
      or public.normalize_product_overview_filter_text(base_rows.review_fee_deposit_GB)
        like '%' || public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'review_fee_deposit_GB') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'is_review_verified'), '') is null
      or (
        public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'is_review_verified') in ('true', '1', '예', 'y', 'yes')
        and base_rows.is_review_verified
      )
      or (
        public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'is_review_verified') in ('false', '0', '아니오', 'n', 'no')
        and not base_rows.is_review_verified
      )
    )
    and (
      nullif(public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'is_deposit_verified'), '') is null
      or (
        public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'is_deposit_verified') in ('true', '1', '예', 'y', 'yes')
        and base_rows.is_deposit_verified
      )
      or (
        public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'is_deposit_verified') in ('false', '0', '아니오', 'n', 'no')
        and not base_rows.is_deposit_verified
      )
    )
    and (
      nullif(public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'review_photos'), '') is null
      or (
        public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'review_photos') in ('has', '사진있음')
        and base_rows.has_review_photos
      )
      or (
        public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'review_photos') in ('none', '사진없음')
        and not base_rows.has_review_photos
      )
    )
  ), paged_rows as (
    select filtered_rows.*, count(*) over() as total_count
    from filtered_rows
    where p_cursor_product_id is null
      or filtered_rows.product_sort_at < coalesce(p_cursor_product_created_at, '-infinity'::timestamptz)
      or (
        filtered_rows.product_sort_at = coalesce(p_cursor_product_created_at, '-infinity'::timestamptz)
        and filtered_rows.product_id > p_cursor_product_id
      )
      or (
        filtered_rows.product_sort_at = coalesce(p_cursor_product_created_at, '-infinity'::timestamptz)
        and filtered_rows.product_id = p_cursor_product_id
        and filtered_rows.submission_sort_at > coalesce(p_cursor_submission_created_at, 'infinity'::timestamptz)
      )
      or (
        filtered_rows.product_sort_at = coalesce(p_cursor_product_created_at, '-infinity'::timestamptz)
        and filtered_rows.product_id = p_cursor_product_id
        and filtered_rows.submission_sort_at = coalesce(p_cursor_submission_created_at, 'infinity'::timestamptz)
        and filtered_rows.submission_id > coalesce(p_cursor_submission_id, 0)
      )
    order by filtered_rows.product_sort_at desc, filtered_rows.product_id asc,
      filtered_rows.submission_sort_at asc, filtered_rows.submission_id asc
    limit v_page_size + 1
  )
  select
    coalesce(max(paged_rows.total_count), 0),
    coalesce(
      jsonb_agg(
        (
          (to_jsonb(paged_rows) - 'total_count' - 'has_review_photos')
          || jsonb_build_object(
            'review_photos',
            case
              when v_can_read_photos and paged_rows.has_review_photos then coalesce(
                (
                  select jsonb_agg(to_jsonb(photo_rows) order by photo_rows.created_at, photo_rows.id)
                  from (
                    select
                      evidence_photos.id,
                      evidence_photos.submission_id,
                      evidence_photos.photo_type,
                      evidence_photos.image_url,
                      evidence_photos.created_at
                    from public.evidence_photos as evidence_photos
                    where evidence_photos.submission_id = paged_rows.submission_id
                      and evidence_photos.photo_type = 'review'
                    order by evidence_photos.created_at, evidence_photos.id
                    limit 1
                  ) as photo_rows
                ),
                '[]'::jsonb
              )
              else '[]'::jsonb
            end
          )
        )
        order by paged_rows.product_sort_at desc, paged_rows.product_id asc, paged_rows.submission_sort_at asc, paged_rows.submission_id asc
      ),
      '[]'::jsonb
    )
  into v_total_count, v_rows
  from paged_rows;

  return jsonb_build_object(
    'rows', v_rows,
    'scope', public.admin_gateway_scope_json(
      p_actor_admin_id,
      array['product.read', 'submission.read']::text[],
      p_force_personal_scope
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


create or replace function public.get_admin_dashboard_data_v2(
  p_actor_admin_id text,
  p_include_company_data boolean default false,
  p_date_filter jsonb default null,
  p_period jsonb default null,
  p_force_personal_scope boolean default false
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
  from public.admin_gateway_allowed_manager_ids(p_actor_admin_id, 'product.read', p_force_personal_scope) as manager_ids;

  select coalesce(array_agg(manager_ids.login_id order by manager_ids.login_id), '{}'::text[])
  into v_submission_manager_ids
  from public.admin_gateway_allowed_manager_ids(p_actor_admin_id, 'submission.read', p_force_personal_scope) as manager_ids;

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
    from public.admin_gateway_allowed_manager_ids(p_actor_admin_id, 'application.read', p_force_personal_scope) as manager_ids;

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
    from public.admin_gateway_allowed_manager_ids(p_actor_admin_id, 'submission.photo.read', p_force_personal_scope) as manager_ids;

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
    from public.admin_gateway_allowed_manager_ids(p_actor_admin_id, 'admin_member.read', p_force_personal_scope) as manager_ids;

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
      array['menu.dashboard', 'product.read', 'submission.read']::text[],
      p_force_personal_scope
    )
  );
end;
$function$;


create or replace function public.get_admin_photo_export_data_v2(
  p_actor_admin_id text,
  p_include_company_data boolean default false,
  p_filters jsonb default '{}'::jsonb,
  p_product_id bigint default null,
  p_force_personal_scope boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_product_manager_ids text[];
  v_submission_manager_ids text[];
  v_photo_manager_ids text[];
  v_product_ids bigint[];
  v_products jsonb;
  v_submissions jsonb;
  v_evidence_photos jsonb;
begin
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'export.execute');
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.photo.read');
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'product.read');
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.read');

  select coalesce(array_agg(manager_ids.login_id order by manager_ids.login_id), '{}'::text[])
  into v_product_manager_ids
  from public.admin_gateway_allowed_manager_ids(p_actor_admin_id, 'product.read', p_force_personal_scope) as manager_ids;

  select coalesce(array_agg(manager_ids.login_id order by manager_ids.login_id), '{}'::text[])
  into v_submission_manager_ids
  from public.admin_gateway_allowed_manager_ids(p_actor_admin_id, 'submission.read', p_force_personal_scope) as manager_ids;

  select coalesce(array_agg(manager_ids.login_id order by manager_ids.login_id), '{}'::text[])
  into v_photo_manager_ids
  from public.admin_gateway_allowed_manager_ids(p_actor_admin_id, 'submission.photo.read', p_force_personal_scope) as manager_ids;

  select coalesce(array_agg(products.id order by products.created_at desc, products.id), '{}'::bigint[])
  into v_product_ids
  from public.products as products
  where (p_product_id is null or products.id = p_product_id)
    and btrim(products.manager_id) = any(v_product_manager_ids);

  select coalesce(
    jsonb_agg(to_jsonb(product_rows) order by product_rows.created_at desc, product_rows.id),
    '[]'::jsonb
  )
  into v_products
  from (
    select
      products.id,
      products.manager_id,
      products.product_date,
      products.title,
      products.description,
      products.product_link,
      products.product_name,
      products.company_name,
      products.option_name,
      products.review_type,
      products.planned_depositor_name,
      products."deposit_GB",
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
      submissions.is_review_verified,
      submissions.is_deposit_verified,
      submissions.created_at
    from public.submissions as submissions
    join public.products as products on products.id = submissions.product_id
    where submissions.product_id = any(v_product_ids)
      and btrim(products.manager_id) = any(v_submission_manager_ids)
  ) as submission_rows;

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
      evidence_photos.image_url,
      evidence_photos.created_at
    from public.evidence_photos as evidence_photos
    join public.submissions as submissions on submissions.id = evidence_photos.submission_id
    join public.products as products on products.id = submissions.product_id
    where submissions.product_id = any(v_product_ids)
      and btrim(products.manager_id) = any(v_submission_manager_ids)
      and btrim(products.manager_id) = any(v_photo_manager_ids)
  ) as photo_rows;

  return jsonb_build_object(
    'products', v_products,
    'submissions', v_submissions,
    'evidencePhotos', v_evidence_photos,
    'scope', public.admin_gateway_scope_json(
      p_actor_admin_id,
      array['export.execute', 'product.read', 'submission.read', 'submission.photo.read']::text[],
      p_force_personal_scope
    )
  );
end;
$function$;


create or replace function public.get_admin_bulk_edit_rows_v2(
  p_actor_admin_id text,
  p_submission_ids bigint[],
  p_force_personal_scope boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_ids bigint[] := coalesce(p_submission_ids, '{}'::bigint[]);
  v_rows jsonb;
begin
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'bulk_edit.execute');
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.read');

  if exists (
    select 1
    from unnest(v_ids) as requested(id)
    where not public.admin_gateway_submission_allowed(p_actor_admin_id, requested.id, 'submission.read', p_force_personal_scope)
  ) then
    raise exception '일괄수정 조회 범위를 벗어난 제출 ID가 포함되어 있습니다.' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(row_data) order by row_data.created_at, row_data.submission_id),
    '[]'::jsonb
  )
  into v_rows
  from (
    select
      submissions.id as submission_id,
      submissions.product_id,
      submissions.assign_name,
      submissions.order_number,
      submissions.buyer_name,
      submissions.recipient_name,
      submissions.purchase_account,
      submissions.contact,
      submissions.address,
      submissions.bank_name,
      submissions.bank_account,
      submissions.account_holder,
      submissions.amount,
      submissions.review_fee,
      submissions.is_review_verified,
      submissions.is_deposit_verified,
      submissions.deposited_at,
      submissions.actual_depositor_name,
      submissions.created_at
    from public.submissions as submissions
    where submissions.id = any(v_ids)
  ) as row_data;

  return jsonb_build_object(
    'rows', v_rows,
    'submissions', v_rows,
    'scope', public.admin_gateway_scope_json(
      p_actor_admin_id,
      array['bulk_edit.execute', 'submission.read']::text[],
      p_force_personal_scope
    )
  );
end;
$function$;


create or replace function public.get_admin_evidence_photos_v2(
  p_actor_admin_id text,
  p_submission_ids bigint[],
  p_photo_type text default null,
  p_force_personal_scope boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_photos jsonb;
  v_ids bigint[] := coalesce(p_submission_ids, '{}'::bigint[]);
  v_photo_type text := nullif(btrim(p_photo_type), '');
begin
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.photo.read');

  if v_photo_type is not null and v_photo_type not in ('purchase', 'review') then
    raise exception '사진 종류가 올바르지 않습니다.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(v_ids) as requested(id)
    where not public.admin_gateway_submission_allowed(
      p_actor_admin_id,
      requested.id,
      'submission.photo.read',
      p_force_personal_scope
    )
  ) then
    raise exception '사진 조회 범위를 벗어난 제출 ID가 포함되어 있습니다.' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(photo_rows) order by photo_rows.created_at, photo_rows.id),
    '[]'::jsonb
  )
  into v_photos
  from (
    select
      evidence_photos.id,
      evidence_photos.submission_id,
      evidence_photos.photo_type,
      evidence_photos.image_url,
      evidence_photos.created_at
    from public.evidence_photos
    where evidence_photos.submission_id = any(v_ids)
      and (v_photo_type is null or evidence_photos.photo_type = v_photo_type)
  ) as photo_rows;

  return jsonb_build_object(
    'photos', v_photos,
    'scope', public.admin_gateway_scope_json(p_actor_admin_id, array['submission.photo.read']::text[], p_force_personal_scope)
  );
end;
$function$;


create or replace function public.update_admin_permission_pair(
  p_actor_admin_id text,
  p_target_admin_id text,
  p_permissions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_permission jsonb;
  v_code text;
  v_scope text;
  v_shared_scope text;
  v_codes text[] := '{}'::text[];
  v_results jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if p_permissions is null
    or jsonb_typeof(p_permissions) <> 'array'
    or jsonb_array_length(p_permissions) <> 2 then
    raise exception '상품 조회·제출 조회 권한은 항상 한 쌍으로 저장해야 합니다.' using errcode = '22023';
  end if;

  for v_permission in
    select value from jsonb_array_elements(p_permissions) as values(value)
  loop
    if jsonb_typeof(v_permission) <> 'object' then
      raise exception '권한 쌍의 항목 형식이 올바르지 않습니다.' using errcode = '22023';
    end if;

    v_code := lower(nullif(btrim(v_permission ->> 'permissionCode'), ''));
    if v_code is null or v_code not in ('product.read', 'submission.read') then
      raise exception '상품 조회·제출 조회 권한만 쌍으로 저장할 수 있습니다.' using errcode = '22023';
    end if;

    if v_code = any(v_codes) then
      raise exception '상품 조회·제출 조회 권한이 중복되었습니다.' using errcode = '22023';
    end if;
    v_codes := array_append(v_codes, v_code);

    v_scope := lower(nullif(btrim(v_permission ->> 'dataScope'), ''));
    if v_scope is null or v_scope not in ('personal', 'company', 'all') then
      raise exception '상품 조회·제출 조회 데이터 범위가 올바르지 않습니다.' using errcode = '22023';
    end if;

    if v_shared_scope is null then
      v_shared_scope := v_scope;
    elsif v_shared_scope <> v_scope then
      raise exception '상품 조회·제출 조회 데이터 범위는 같아야 합니다.' using errcode = '22023';
    end if;
  end loop;

  if not ('product.read' = any(v_codes) and 'submission.read' = any(v_codes)) then
    raise exception '상품 조회·제출 조회 권한을 모두 지정해야 합니다.' using errcode = '22023';
  end if;

  for v_permission in
    select value from jsonb_array_elements(p_permissions) as values(value)
  loop
    v_code := lower(nullif(btrim(v_permission ->> 'permissionCode'), ''));
    v_result := public.update_admin_permission(
      p_actor_admin_id,
      p_target_admin_id,
      v_code,
      nullif(lower(btrim(v_permission ->> 'effect')), ''),
      v_shared_scope,
      coalesce((v_permission ->> 'remove')::boolean, false)
    );
    v_results := v_results || jsonb_build_array(v_result);
  end loop;

  return jsonb_build_object(
    'targetAdminId', p_target_admin_id,
    'permissions', v_results,
    'dataScope', v_shared_scope
  );
end;
$function$;

create or replace function public.create_admin_review_receive_product_reviewer_bulk(
  p_actor_admin_id text,
  p_groups jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_group jsonb;
  v_product_payload jsonb;
  v_reviewer jsonb;
  v_product_result jsonb;
  v_product jsonb;
  v_submission jsonb;
  v_product_id bigint;
  v_bundle_id bigint;
  v_group_index integer := 0;
  v_reviewer_index integer;
  v_error_message text;
  v_products jsonb := '[]'::jsonb;
  v_submissions jsonb := '[]'::jsonb;
  v_errors jsonb := '[]'::jsonb;
begin
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'product.create');
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.create');

  if p_groups is null
    or jsonb_typeof(p_groups) <> 'array'
    or jsonb_array_length(p_groups) = 0 then
    raise exception '일괄 입력 품목 목록이 비어 있습니다.' using errcode = '22023';
  end if;

  if jsonb_array_length(p_groups) > 1000 then
    raise exception '한 번에 등록할 수 있는 품목 수를 초과했습니다.' using errcode = '22023';
  end if;

  for v_group in
    select value from jsonb_array_elements(p_groups) as values(value)
  loop
    v_group_index := v_group_index + 1;

    if jsonb_typeof(v_group) <> 'object'
      or jsonb_typeof(v_group -> 'product') <> 'object'
      or jsonb_typeof(v_group -> 'reviewers') <> 'array' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'groupIndex', v_group_index,
        'message', '품목과 리뷰어 목록 형식이 올바르지 않습니다.'
      ));
      continue;
    end if;

    v_product_payload := v_group -> 'product';
    if v_bundle_id is not null then
      v_product_payload := v_product_payload || jsonb_build_object('bundle_id', v_bundle_id);
    end if;

    begin
      v_product_result := public.create_admin_review_receive_product(
        p_actor_admin_id,
        v_product_payload
      );
      v_product := v_product_result -> 'product';
      v_product_id := nullif(v_product ->> 'id', '')::bigint;

      if v_product_id is null then
        raise exception '상품 생성 결과를 확인하지 못했습니다.' using errcode = 'XX000';
      end if;

      v_bundle_id := coalesce(
        nullif(v_product ->> 'bundle_id', '')::bigint,
        v_product_id
      );
      v_products := v_products || jsonb_build_array(v_product);
    exception
      when others then
        get stacked diagnostics v_error_message = message_text;
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'groupIndex', v_group_index,
          'message', coalesce(v_error_message, '품목 저장 중 오류가 발생했습니다.')
        ));
        continue;
    end;

    v_reviewer_index := 0;
    for v_reviewer in
      select value from jsonb_array_elements(v_group -> 'reviewers') as values(value)
    loop
      v_reviewer_index := v_reviewer_index + 1;
      begin
        v_submission := public.admin_gateway_insert_submission(
          p_actor_admin_id,
          v_product_id,
          v_reviewer
        );
        v_submissions := v_submissions || jsonb_build_array(v_submission);
      exception
        when others then
          get stacked diagnostics v_error_message = message_text;
          v_errors := v_errors || jsonb_build_array(jsonb_build_object(
            'groupIndex', v_group_index,
            'reviewerIndex', v_reviewer_index,
            'message', coalesce(v_error_message, '리뷰어 저장 중 오류가 발생했습니다.')
          ));
      end;
    end loop;
  end loop;

  return jsonb_build_object(
    'products', v_products,
    'submissions', v_submissions,
    'errors', v_errors,
    'scope', public.admin_gateway_scope_json(
      p_actor_admin_id,
      array['product.create', 'submission.create']::text[]
    )
  );
end;
$function$;

revoke all on function public.get_admin_review_receive_product_summaries_gateway_v2(text, boolean, boolean, text, jsonb, integer, date, bigint) from public, anon, authenticated;
grant execute on function public.get_admin_review_receive_product_summaries_gateway_v2(text, boolean, boolean, text, jsonb, integer, date, bigint) to service_role;

revoke all on function public.get_admin_product_overview_rows_gateway_v2(text, boolean, boolean, text, jsonb, integer, timestamptz, bigint, timestamptz, bigint) from public, anon, authenticated;
grant execute on function public.get_admin_product_overview_rows_gateway_v2(text, boolean, boolean, text, jsonb, integer, timestamptz, bigint, timestamptz, bigint) to service_role;

revoke all on function public.get_admin_dashboard_data_v2(text, boolean, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.get_admin_dashboard_data_v2(text, boolean, jsonb, jsonb, boolean) to service_role;

revoke all on function public.get_admin_photo_export_data_v2(text, boolean, jsonb, bigint, boolean) from public, anon, authenticated;
grant execute on function public.get_admin_photo_export_data_v2(text, boolean, jsonb, bigint, boolean) to service_role;

revoke all on function public.get_admin_bulk_edit_rows_v2(text, bigint[], boolean) from public, anon, authenticated;
grant execute on function public.get_admin_bulk_edit_rows_v2(text, bigint[], boolean) to service_role;

revoke all on function public.get_admin_evidence_photos_v2(text, bigint[], text, boolean) from public, anon, authenticated;
grant execute on function public.get_admin_evidence_photos_v2(text, bigint[], text, boolean) to service_role;

revoke all on function public.update_admin_permission_pair(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.update_admin_permission_pair(text, text, jsonb) to service_role;

revoke all on function public.create_admin_review_receive_product_reviewer_bulk(text, jsonb) from public, anon, authenticated;
grant execute on function public.create_admin_review_receive_product_reviewer_bulk(text, jsonb) to service_role;
