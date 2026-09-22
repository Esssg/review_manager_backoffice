-- 리뷰받기 상세도 선택된 데이터 범위를 사용하고, 초기에는 submission별 대표 사진만 반환한다.
-- 전체 사진은 사용자가 사진 미리보기를 연 뒤 별도 요청으로 조회한다.

create or replace function public.get_admin_review_receive_detail_v2(
  p_actor_admin_id text,
  p_product_id bigint,
  p_force_personal_scope boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_product public.products;
  v_bundle_id bigint;
  v_product_ids bigint[];
  v_products jsonb;
  v_submissions jsonb;
begin
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'product.read');
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.read');

  select products.* into v_product
  from public.products as products
  where products.id = p_product_id;

  if not found then
    raise exception '상품을 찾지 못했습니다.' using errcode = '22023';
  end if;

  if not public.admin_gateway_product_allowed(
    p_actor_admin_id,
    p_product_id,
    'product.read',
    p_force_personal_scope
  ) then
    raise exception '상품 조회 범위가 아닙니다.' using errcode = '42501';
  end if;

  v_bundle_id := coalesce(v_product.bundle_id::bigint, v_product.id);

  select coalesce(array_agg(products.id order by products.id), '{}'::bigint[])
  into v_product_ids
  from public.products as products
  where (
    (v_product.bundle_id is null and products.id = v_product.id)
    or (v_product.bundle_id is not null and products.bundle_id::bigint = v_bundle_id)
  )
  and public.admin_gateway_product_allowed(
    p_actor_admin_id,
    products.id,
    'product.read',
    p_force_personal_scope
  );

  select coalesce(
    jsonb_agg(to_jsonb(product_rows) order by product_rows.id),
    '[]'::jsonb
  )
  into v_products
  from (
    select
      products.id,
      products.title,
      products.product_name,
      products.description,
      products.product_link,
      products.company_name,
      products.option_name,
      products.review_type,
      products.planned_depositor_name,
      products.manager_id,
      products.product_date,
      products.created_at,
      products."deposit_GB",
      products.bundle_id
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
      submissions.purchase_account,
      submissions.contact,
      submissions.address,
      submissions.bank_name,
      submissions.bank_account,
      submissions.account_holder,
      submissions.amount,
      submissions.review_fee,
      submissions.is_purchase_verified,
      submissions.is_review_verified,
      submissions.is_deposit_verified,
      submissions.deposited_at,
      submissions.actual_depositor_name,
      submissions.created_at
    from public.submissions as submissions
    where submissions.product_id = any(v_product_ids)
      and public.admin_gateway_submission_allowed(
        p_actor_admin_id,
        submissions.id,
        'submission.read',
        p_force_personal_scope
      )
  ) as submission_rows;

  return jsonb_build_object(
    'product', to_jsonb(v_product),
    'products', v_products,
    'submissions', v_submissions,
    'scope', public.admin_gateway_scope_json(
      p_actor_admin_id,
      array['product.read', 'submission.read']::text[],
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
begin
  return public.get_admin_evidence_photos_v2(
    p_actor_admin_id,
    p_submission_ids,
    p_photo_type,
    p_force_personal_scope,
    false
  );
end;
$function$;

create or replace function public.get_admin_evidence_photos_v2(
  p_actor_admin_id text,
  p_submission_ids bigint[],
  p_photo_type text,
  p_force_personal_scope boolean,
  p_preview_only boolean
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
      ranked_photos.id,
      ranked_photos.submission_id,
      ranked_photos.photo_type,
      ranked_photos.image_url,
      ranked_photos.created_at
    from (
      select
        evidence_photos.id,
        evidence_photos.submission_id,
        evidence_photos.photo_type,
        evidence_photos.image_url,
        evidence_photos.created_at,
        row_number() over (
          partition by evidence_photos.submission_id
          order by evidence_photos.created_at, evidence_photos.id
        ) as photo_rank
      from public.evidence_photos as evidence_photos
      where evidence_photos.submission_id = any(v_ids)
        and (v_photo_type is null or evidence_photos.photo_type = v_photo_type)
    ) as ranked_photos
    where not coalesce(p_preview_only, false) or ranked_photos.photo_rank = 1
  ) as photo_rows;

  return jsonb_build_object(
    'photos', v_photos,
    'scope', public.admin_gateway_scope_json(
      p_actor_admin_id,
      array['submission.photo.read']::text[],
      p_force_personal_scope
    )
  );
end;
$function$;

revoke all on function public.get_admin_review_receive_detail_v2(text, bigint, boolean) from public, anon, authenticated;
grant execute on function public.get_admin_review_receive_detail_v2(text, bigint, boolean) to service_role;

revoke all on function public.get_admin_evidence_photos_v2(text, bigint[], text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.get_admin_evidence_photos_v2(text, bigint[], text, boolean, boolean) to service_role;
