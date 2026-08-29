-- 상품 생성에서는 bundle_id를 기존 묶음 연결 입력으로 허용하되,
-- 대상 묶음의 상품 범위를 actor 기준으로 확인한다.
-- 상품 수정 RPC는 bundle_id를 계속 허용하지 않으며, 클라이언트도 수정 payload에서 제거한다.

create or replace function public.create_admin_review_receive_product(
  p_actor_admin_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor public.admins;
  v_product public.products;
  v_product_id bigint;
  v_bundle_id bigint;
  v_bundle_anchor_id bigint;
begin
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'product.create');
  perform public.admin_gateway_validate_payload_keys(
    p_payload,
    array[
      'title', 'product_name', 'description', 'product_link', 'deposit_date',
      'product_date', 'is_real_shipping', 'company_name', 'option_name',
      'review_type', 'planned_depositor_name', 'deposit_GB', 'bundle_id'
    ]::text[]
  );
  v_actor := public.admin_gateway_actor(p_actor_admin_id);

  v_bundle_id := nullif(btrim(p_payload ->> 'bundle_id'), '')::bigint;

  if v_bundle_id is not null then
    select
      products.id,
      coalesce(products.bundle_id::bigint, products.id)
    into v_bundle_anchor_id, v_bundle_id
    from public.products as products
    where products.id = v_bundle_id;

    if not found then
      raise exception '연결할 상품 묶음을 찾지 못했습니다.' using errcode = '22023';
    end if;

    if not public.admin_gateway_product_allowed(
      p_actor_admin_id,
      v_bundle_anchor_id,
      'product.create'
    ) then
      raise exception '상품 묶음에 품목을 추가할 권한이 없습니다.' using errcode = '42501';
    end if;
  end if;

  insert into public.products (
    manager_id,
    title,
    product_name,
    description,
    product_link,
    deposit_date,
    product_date,
    is_real_shipping,
    company_name,
    option_name,
    review_type,
    planned_depositor_name,
    "deposit_GB",
    bundle_id
  )
  values (
    v_actor.login_id,
    p_payload ->> 'title',
    p_payload ->> 'product_name',
    p_payload ->> 'description',
    p_payload ->> 'product_link',
    case when p_payload ? 'deposit_date' and jsonb_typeof(p_payload -> 'deposit_date') <> 'null'
      then (p_payload ->> 'deposit_date')::date else null end,
    case when p_payload ? 'product_date' and jsonb_typeof(p_payload -> 'product_date') <> 'null'
      then (p_payload ->> 'product_date')::date else current_date end,
    coalesce((p_payload ->> 'is_real_shipping')::boolean, true),
    p_payload ->> 'company_name',
    p_payload ->> 'option_name',
    p_payload ->> 'review_type',
    p_payload ->> 'planned_depositor_name',
    coalesce((p_payload ->> 'deposit_GB')::integer, 1),
    v_bundle_id::integer
  )
  returning id into v_product_id;

  if v_bundle_id is null then
    update public.products
    set bundle_id = v_product_id
    where id = v_product_id;
  end if;

  select products.* into v_product
  from public.products as products
  where products.id = v_product_id;

  return jsonb_build_object(
    'product', to_jsonb(v_product),
    'scope', public.admin_gateway_scope_json(p_actor_admin_id, array['product.create']::text[])
  );
end;
$function$;

revoke all on function public.create_admin_review_receive_product(text, jsonb) from public, anon, authenticated;
grant execute on function public.create_admin_review_receive_product(text, jsonb) to service_role;
