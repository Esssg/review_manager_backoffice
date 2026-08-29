-- 관리자 gateway export read RPC 성능 보강
--
-- export RPC는 상품/제출/사진/신청자 행마다 actor와 permission binding을
-- 다시 계산하고 있었다. company scope에서 같은 manager 범위를 반복 계산하지
-- 않도록 permission별 manager ID 배열을 한 번 만든 뒤 재사용한다.
-- 반환 shape와 필터 의미는 기존 gateway RPC와 유지하고, service_role 전용
-- execute 권한도 그대로 유지한다.

create or replace function public.get_admin_export_data(
  p_actor_admin_id text,
  p_include_company_data boolean default false,
  p_force_personal_scope boolean default false,
  p_include_applications boolean default false,
  p_date_filter jsonb default null,
  p_product_id bigint default null,
  p_deposit_only boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_product_manager_ids text[];
  v_submission_manager_ids text[];
  v_photo_manager_ids text[] := '{}'::text[];
  v_application_manager_ids text[] := '{}'::text[];
  v_product_ids bigint[];
  v_products jsonb;
  v_submissions jsonb;
  v_evidence_photos jsonb := '[]'::jsonb;
  v_applications jsonb := '[]'::jsonb;
  v_date_field text := nullif(btrim(p_date_filter ->> 'field'), '');
  v_start_date date := nullif(btrim(p_date_filter ->> 'startDate'), '')::date;
  v_end_date date := nullif(btrim(p_date_filter ->> 'endDate'), '')::date;
  v_force_personal_scope boolean := coalesce(p_force_personal_scope, false);
begin
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'export.execute');
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'product.read');
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.read');

  if v_date_field is not null and v_date_field not in ('created_at', 'deposited_at') then
    raise exception '내보내기 날짜 필드가 올바르지 않습니다.' using errcode = '22023';
  end if;

  select coalesce(array_agg(manager_ids.login_id order by manager_ids.login_id), '{}'::text[])
  into v_product_manager_ids
  from public.admin_gateway_allowed_manager_ids(
    p_actor_admin_id,
    'product.read',
    v_force_personal_scope
  ) as manager_ids;

  select coalesce(array_agg(manager_ids.login_id order by manager_ids.login_id), '{}'::text[])
  into v_submission_manager_ids
  from public.admin_gateway_allowed_manager_ids(
    p_actor_admin_id,
    'submission.read',
    v_force_personal_scope
  ) as manager_ids;

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
      products.deposit_date,
      products.company_name,
      products.option_name,
      products.review_type,
      products.planned_depositor_name,
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
      submissions.assign_name,
      submissions.is_purchase_verified,
      submissions.is_review_verified,
      submissions.is_deposit_verified,
      submissions.deposited_at,
      submissions.actual_depositor_name,
      submissions.created_at
    from public.submissions as submissions
    join public.products as products on products.id = submissions.product_id
    where submissions.product_id = any(v_product_ids)
      and btrim(products.manager_id) = any(v_submission_manager_ids)
      and (
        v_date_field is null
        or v_date_field <> 'created_at'
        or v_start_date is null
        or submissions.created_at >= v_start_date::timestamptz
      )
      and (
        v_date_field is null
        or v_date_field <> 'created_at'
        or v_end_date is null
        or submissions.created_at < (v_end_date + 1)::timestamptz
      )
      and (
        v_date_field is null
        or v_date_field <> 'deposited_at'
        or v_start_date is null
        or submissions.deposited_at >= v_start_date
      )
      and (
        v_date_field is null
        or v_date_field <> 'deposited_at'
        or v_end_date is null
        or submissions.deposited_at <= v_end_date
      )
      and (
        not coalesce(p_deposit_only, false)
        or (
          submissions.is_deposit_verified = true
          and submissions.deposited_at is not null
        )
      )
  ) as submission_rows;

  if public.admin_gateway_permission_scope(p_actor_admin_id, 'submission.photo.read') is not null then
    select coalesce(array_agg(manager_ids.login_id order by manager_ids.login_id), '{}'::text[])
    into v_photo_manager_ids
    from public.admin_gateway_allowed_manager_ids(
      p_actor_admin_id,
      'submission.photo.read',
      v_force_personal_scope
    ) as manager_ids;

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

  if coalesce(p_include_applications, false) then
    perform public.admin_gateway_assert_permission(p_actor_admin_id, 'application.read');

    select coalesce(array_agg(manager_ids.login_id order by manager_ids.login_id), '{}'::text[])
    into v_application_manager_ids
    from public.admin_gateway_allowed_manager_ids(
      p_actor_admin_id,
      'application.read',
      v_force_personal_scope
    ) as manager_ids;

    select coalesce(
      jsonb_agg(to_jsonb(application_rows) order by application_rows.created_at, application_rows.id),
      '[]'::jsonb
    )
    into v_applications
    from (
      select applications.id, applications.product_id, applications.applicant_name,
        applications.is_confirmed, applications.created_at
      from public.applications as applications
      join public.products as products on products.id = applications.product_id
      where applications.product_id = any(v_product_ids)
        and btrim(products.manager_id) = any(v_application_manager_ids)
    ) as application_rows;
  end if;

  return jsonb_build_object(
    'products', v_products,
    'submissions', v_submissions,
    'evidencePhotos', v_evidence_photos,
    'applications', v_applications,
    'scope', public.admin_gateway_scope_json(
      p_actor_admin_id,
      case when p_include_applications
        then array['export.execute', 'product.read', 'submission.read', 'application.read']::text[]
        else array['export.execute', 'product.read', 'submission.read']::text[]
      end,
      v_force_personal_scope
    )
  );
end;
$function$;

revoke all on function public.get_admin_export_data(text, boolean, boolean, boolean, jsonb, bigint, boolean)
  from public, anon, authenticated;
grant execute on function public.get_admin_export_data(text, boolean, boolean, boolean, jsonb, bigint, boolean) to service_role;

create or replace function public.get_admin_photo_export_data(
  p_actor_admin_id text,
  p_include_company_data boolean default false,
  p_filters jsonb default '{}'::jsonb,
  p_product_id bigint default null
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
  from public.admin_gateway_allowed_manager_ids(p_actor_admin_id, 'product.read') as manager_ids;

  select coalesce(array_agg(manager_ids.login_id order by manager_ids.login_id), '{}'::text[])
  into v_submission_manager_ids
  from public.admin_gateway_allowed_manager_ids(p_actor_admin_id, 'submission.read') as manager_ids;

  select coalesce(array_agg(manager_ids.login_id order by manager_ids.login_id), '{}'::text[])
  into v_photo_manager_ids
  from public.admin_gateway_allowed_manager_ids(p_actor_admin_id, 'submission.photo.read') as manager_ids;

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
      array['export.execute', 'product.read', 'submission.read', 'submission.photo.read']::text[]
    )
  );
end;
$function$;

revoke all on function public.get_admin_photo_export_data(text, boolean, jsonb, bigint)
  from public, anon, authenticated;
grant execute on function public.get_admin_photo_export_data(text, boolean, jsonb, bigint) to service_role;
