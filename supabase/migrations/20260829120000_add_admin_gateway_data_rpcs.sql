-- 관리자 data gateway 전용 RPC 초안
--
-- 이 migration은 운영 DB에 아직 적용하지 않았다. 기존 legacy RPC의 시그니처와
-- 반환값을 바꾸지 않고 gateway 전용 함수와 공통 권한 검사를 additive하게
-- 추가한다. 실제 적용 전에는 staging에서 seed/backfill된 permission_bindings,
-- row-count, RPC 반환 계약, 공개 review-receive 경로를 함께 검증해야 한다.

-- 정규화 access migration이 먼저 적용되는 환경을 전제로 하지만, 정의가
-- 누락된 부분이 있는 경우에도 RPC 계약이 이름만으로 깨지지 않도록 idempotent하게
-- 보강한다. binding은 현재 운영 데이터의 Q49 스냅샷 확인 전에는 자동 허용하지 않는다.
insert into public.permission_definitions (code, label, resource, action, default_data_scope)
values
  ('product.read', '상품 조회', 'product', 'read', 'personal'),
  ('product.create', '상품 생성', 'product', 'create', 'personal'),
  ('product.update', '상품 수정', 'product', 'update', 'personal'),
  ('product.delete', '상품 삭제', 'product', 'delete', 'personal'),
  ('product_step.read', '상품 단계 조회', 'product_step', 'read', 'personal'),
  ('product_step.create', '상품 단계 생성', 'product_step', 'create', 'personal'),
  ('product_step.update', '상품 단계 수정', 'product_step', 'update', 'personal'),
  ('product_step.delete', '상품 단계 삭제', 'product_step', 'delete', 'personal'),
  ('application.read', '신청자 조회', 'application', 'read', 'personal'),
  ('application.create', '신청자 생성', 'application', 'create', 'personal'),
  ('application.update', '신청자 수정', 'application', 'update', 'personal'),
  ('application.delete', '신청자 삭제', 'application', 'delete', 'personal'),
  ('application.confirm', '신청자 확정', 'application', 'confirm', 'personal'),
  ('submission.read', '제출 조회', 'submission', 'read', 'personal'),
  ('submission.create', '제출 생성', 'submission', 'create', 'personal'),
  ('submission.update', '제출 수정', 'submission', 'update', 'personal'),
  ('submission.delete', '제출 삭제', 'submission', 'delete', 'personal'),
  ('submission.deposit.verify', '입금 확인', 'submission', 'deposit.verify', 'personal'),
  ('submission.depositor_name.update', '예정 입금자명 수정', 'submission', 'depositor_name.update', 'personal'),
  ('submission.photo.read', '증빙 사진 조회', 'submission', 'photo.read', 'personal'),
  ('submission.photo.upload', '증빙 사진 업로드', 'submission', 'photo.upload', 'personal'),
  ('submission.photo.delete', '증빙 사진 삭제', 'submission', 'photo.delete', 'personal'),
  ('export.execute', '내보내기 실행', 'export', 'execute', 'personal'),
  ('bulk_edit.execute', '일괄수정 실행', 'bulk_edit', 'execute', 'personal')
on conflict (code) do nothing;

-- 모든 data RPC는 이 actor 조회를 통해 active admins.login_id를 확인한다.
-- 브라우저가 보낸 manager_id/admin_id는 이 함수들의 권한 근거가 아니다.
create or replace function public.admin_gateway_actor(p_actor_admin_id text)
returns public.admins
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor public.admins;
begin
  select admins.*
  into v_actor
  from public.admins as admins
  where admins.login_id = nullif(btrim(p_actor_admin_id), '')
    and coalesce(admins.is_active, true) = true;

  if not found then
    raise exception '관리자 정보를 찾지 못했습니다.' using errcode = '28000';
  end if;

  return v_actor;
end;
$function$;

-- global < company < role < admin, 동일 rank에서는 priority가 높은 binding을
-- 선택하고 같은 rank의 deny를 우선한다. 허용 binding이 여러 개면 가장 넓은
-- data_scope를 사용하되 role의 최대 범위(employee=personal,
-- company_admin=company)는 넘지 못하게 한다.
create or replace function public.admin_gateway_permission_scope(
  p_actor_admin_id text,
  p_permission_code text
)
returns text
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

  with candidates as (
    select
      bindings.effect,
      bindings.data_scope,
      bindings.priority,
      case bindings.subject_type
        when 'global' then 0
        when 'company' then 10
        when 'role' then 20
        when 'admin' then 30
      end as specificity
    from public.permission_bindings as bindings
    where bindings.permission_code = p_permission_code
      and (
        bindings.subject_type = 'global'
        or (bindings.subject_type = 'company' and bindings.subject_id = v_actor.company_id::text)
        or (bindings.subject_type = 'role' and lower(bindings.subject_id) = lower(v_actor.role))
        or (bindings.subject_type = 'admin' and bindings.subject_id = v_actor.login_id)
      )
  ), selected as (
    select candidates.*
    from candidates
    where candidates.specificity = (select max(rank.specificity) from candidates as rank)
      and candidates.priority = (
        select max(rank.priority)
        from candidates as rank
        where rank.specificity = (select max(rank2.specificity) from candidates as rank2)
      )
  )
  select case
    when count(*) = 0 or bool_or(selected.effect = 'deny') then null
    when max(case selected.data_scope when 'all' then 3 when 'company' then 2 else 1 end) = 3 then 'all'
    when max(case selected.data_scope when 'all' then 3 when 'company' then 2 else 1 end) = 2 then 'company'
    else 'personal'
  end
  into v_scope
  from selected;

  if v_scope = 'all' and v_actor.role = 'company_admin' then
    v_scope := 'company';
  elsif v_scope = 'all' and v_actor.role = 'employee' then
    v_scope := 'personal';
  elsif v_scope is not null and v_actor.role not in ('developer', 'company_admin', 'employee') then
    v_scope := 'personal';
  end if;

  return v_scope;
end;
$function$;

create or replace function public.admin_gateway_effective_scope(
  p_actor_admin_id text,
  p_permission_code text,
  p_force_personal_scope boolean default false
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_scope text;
begin
  v_scope := public.admin_gateway_permission_scope(p_actor_admin_id, p_permission_code);

  if v_scope is null then
    return null;
  end if;

  if coalesce(p_force_personal_scope, false) then
    return 'personal';
  end if;

  return v_scope;
end;
$function$;

create or replace function public.admin_gateway_common_scope(
  p_actor_admin_id text,
  p_permission_codes text[],
  p_force_personal_scope boolean default false
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_permission_code text;
  v_scope text;
  v_min_rank integer := 3;
  v_rank integer;
begin
  foreach v_permission_code in array coalesce(p_permission_codes, '{}'::text[]) loop
    v_scope := public.admin_gateway_effective_scope(
      p_actor_admin_id,
      v_permission_code,
      p_force_personal_scope
    );

    if v_scope is null then
      return null;
    end if;

    v_rank := case v_scope when 'all' then 3 when 'company' then 2 else 1 end;
    v_min_rank := least(v_min_rank, v_rank);
  end loop;

  return case v_min_rank when 3 then 'all' when 2 then 'company' else 'personal' end;
end;
$function$;

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
    'isCompanyScopeAvailable', (
      v_actor.company_id is not null
      or nullif(btrim(v_actor.company), '') is not null
    ),
    'isServerResolved', true
  );
end;
$function$;

create or replace function public.admin_gateway_assert_permission(
  p_actor_admin_id text,
  p_permission_code text
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
begin
  if public.admin_gateway_permission_scope(p_actor_admin_id, p_permission_code) is null then
    raise exception '권한이 없습니다: %', p_permission_code using errcode = '42501';
  end if;
end;
$function$;

create or replace function public.admin_gateway_manager_allowed(
  p_actor_admin_id text,
  p_permission_code text,
  p_manager_id text,
  p_force_personal_scope boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor public.admins;
  v_manager public.admins;
  v_scope text;
  v_actor_company text;
  v_manager_company text;
begin
  v_actor := public.admin_gateway_actor(p_actor_admin_id);
  v_scope := public.admin_gateway_effective_scope(
    p_actor_admin_id,
    p_permission_code,
    p_force_personal_scope
  );

  if v_scope is null or nullif(btrim(p_manager_id), '') is null then
    return false;
  end if;

  if v_scope = 'personal' then
    return btrim(p_manager_id) = v_actor.login_id;
  end if;

  if v_scope = 'all' then
    return true;
  end if;

  select admins.*
  into v_manager
  from public.admins as admins
  where admins.login_id = btrim(p_manager_id)
    and coalesce(admins.is_active, true) = true;

  if not found then
    return false;
  end if;

  v_actor_company := coalesce(v_actor.company_id::text, nullif(btrim(v_actor.company), ''));
  v_manager_company := coalesce(v_manager.company_id::text, nullif(btrim(v_manager.company), ''));

  return v_actor_company is not null
    and v_manager_company is not null
    and v_actor_company = v_manager_company;
end;
$function$;

create or replace function public.admin_gateway_product_allowed(
  p_actor_admin_id text,
  p_product_id bigint,
  p_permission_code text,
  p_force_personal_scope boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1
    from public.products as products
    where products.id = p_product_id
      and public.admin_gateway_manager_allowed(
        p_actor_admin_id,
        p_permission_code,
        products.manager_id,
        p_force_personal_scope
      )
  );
$function$;

create or replace function public.admin_gateway_submission_allowed(
  p_actor_admin_id text,
  p_submission_id bigint,
  p_permission_code text,
  p_force_personal_scope boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1
    from public.submissions as submissions
    join public.products as products on products.id = submissions.product_id
    where submissions.id = p_submission_id
      and public.admin_gateway_manager_allowed(
        p_actor_admin_id,
        p_permission_code,
        products.manager_id,
        p_force_personal_scope
      )
  );
$function$;

create or replace function public.admin_gateway_application_allowed(
  p_actor_admin_id text,
  p_application_id bigint,
  p_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1
    from public.applications as applications
    join public.products as products on products.id = applications.product_id
    where applications.id = p_application_id
      and public.admin_gateway_manager_allowed(
        p_actor_admin_id,
        p_permission_code,
        products.manager_id
      )
  );
$function$;

create or replace function public.admin_gateway_photo_allowed(
  p_actor_admin_id text,
  p_photo_id bigint,
  p_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1
    from public.evidence_photos as photos
    join public.submissions as submissions on submissions.id = photos.submission_id
    join public.products as products on products.id = submissions.product_id
    where photos.id = p_photo_id
      and public.admin_gateway_manager_allowed(
        p_actor_admin_id,
        p_permission_code,
        products.manager_id
      )
  );
$function$;

create or replace function public.admin_gateway_validate_payload_keys(
  p_payload jsonb,
  p_allowed_keys text[]
)
returns void
language plpgsql
immutable
security definer
set search_path = pg_catalog, public
as $function$
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'payload는 JSON object여야 합니다.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_payload) as payload_keys(key)
    where not (payload_keys.key = any(coalesce(p_allowed_keys, '{}'::text[])))
  ) then
    raise exception '허용되지 않은 payload 필드가 포함되어 있습니다.' using errcode = '22023';
  end if;
end;
$function$;

create or replace function public.admin_gateway_get_products(
  p_actor_admin_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_products jsonb;
begin
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'product.read');

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
    where public.admin_gateway_manager_allowed(
      p_actor_admin_id,
      'product.read',
      products.manager_id
    )
  ) as product_rows;

  return jsonb_build_object(
    'products', v_products,
    'scope', public.admin_gateway_scope_json(p_actor_admin_id, array['product.read']::text[])
  );
end;
$function$;

revoke all on function public.admin_gateway_actor(text) from public, anon, authenticated;
revoke all on function public.admin_gateway_permission_scope(text, text) from public, anon, authenticated;
revoke all on function public.admin_gateway_effective_scope(text, text, boolean) from public, anon, authenticated;
revoke all on function public.admin_gateway_common_scope(text, text[], boolean) from public, anon, authenticated;
revoke all on function public.admin_gateway_scope_json(text, text[], boolean) from public, anon, authenticated;
revoke all on function public.admin_gateway_assert_permission(text, text) from public, anon, authenticated;
revoke all on function public.admin_gateway_manager_allowed(text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.admin_gateway_product_allowed(text, bigint, text, boolean) from public, anon, authenticated;
revoke all on function public.admin_gateway_submission_allowed(text, bigint, text, boolean) from public, anon, authenticated;
revoke all on function public.admin_gateway_application_allowed(text, bigint, text) from public, anon, authenticated;
revoke all on function public.admin_gateway_photo_allowed(text, bigint, text) from public, anon, authenticated;
revoke all on function public.admin_gateway_validate_payload_keys(jsonb, text[]) from public, anon, authenticated;
revoke all on function public.admin_gateway_get_products(text) from public, anon, authenticated;

grant execute on function public.admin_gateway_get_products(text) to service_role;

create or replace function public.admin_gateway_insert_submission(
  p_actor_admin_id text,
  p_product_id bigint,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor public.admins;
  v_submission public.submissions;
  v_product_id bigint := p_product_id;
  v_is_deposit_verified boolean := false;
  v_deposited_at date;
  v_actual_depositor_name text;
begin
  perform public.admin_gateway_validate_payload_keys(
    p_payload,
    array[
      'product_id', 'assign_name', 'order_number', 'buyer_name', 'recipient_name',
      'purchase_account', 'contact', 'address', 'bank_name', 'bank_account',
      'account_holder', 'amount', 'review_fee', 'is_purchase_verified',
      'is_review_verified', 'is_deposit_verified', 'deposited_at',
      'actual_depositor_name'
    ]::text[]
  );

  v_actor := public.admin_gateway_actor(p_actor_admin_id);
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.create');
  if v_product_id is null then
    v_product_id := (p_payload ->> 'product_id')::bigint;
  elsif p_payload ? 'product_id'
    and (p_payload ->> 'product_id')::bigint is distinct from v_product_id then
    raise exception 'product_id가 요청 대상과 일치하지 않습니다.' using errcode = '22023';
  end if;

  if v_product_id is null
    or not public.admin_gateway_product_allowed(p_actor_admin_id, v_product_id, 'submission.create') then
    raise exception '제출을 생성할 상품 범위가 아닙니다.' using errcode = '42501';
  end if;

  v_is_deposit_verified := coalesce((p_payload ->> 'is_deposit_verified')::boolean, false);
  v_deposited_at := case
    when p_payload ? 'deposited_at' and jsonb_typeof(p_payload -> 'deposited_at') <> 'null'
      then (p_payload ->> 'deposited_at')::date
    else null
  end;
  v_actual_depositor_name := nullif(btrim(p_payload ->> 'actual_depositor_name'), '');

  if v_is_deposit_verified or v_deposited_at is not null then
    perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.deposit.verify');
    if not public.admin_gateway_product_allowed(p_actor_admin_id, v_product_id, 'submission.deposit.verify')
      or not coalesce(v_actor.can_verify_deposit, true) then
      raise exception '입금 확인 권한이 없습니다.' using errcode = '42501';
    end if;
  end if;

  if v_actual_depositor_name is not null then
    perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.depositor_name.update');
    if not public.admin_gateway_product_allowed(p_actor_admin_id, v_product_id, 'submission.depositor_name.update') then
      raise exception '실제 입금자명 수정 범위가 아닙니다.' using errcode = '42501';
    end if;
  end if;

  insert into public.submissions (
    product_id,
    assign_name,
    order_number,
    buyer_name,
    recipient_name,
    purchase_account,
    contact,
    address,
    bank_name,
    bank_account,
    account_holder,
    amount,
    review_fee,
    is_purchase_verified,
    is_review_verified,
    is_deposit_verified,
    deposited_at,
    actual_depositor_name
  )
  values (
    v_product_id,
    p_payload ->> 'assign_name',
    p_payload ->> 'order_number',
    p_payload ->> 'buyer_name',
    p_payload ->> 'recipient_name',
    p_payload ->> 'purchase_account',
    p_payload ->> 'contact',
    p_payload ->> 'address',
    p_payload ->> 'bank_name',
    p_payload ->> 'bank_account',
    p_payload ->> 'account_holder',
    case when p_payload ? 'amount' and jsonb_typeof(p_payload -> 'amount') <> 'null'
      then (p_payload ->> 'amount')::integer else null end,
    case when p_payload ? 'review_fee' and jsonb_typeof(p_payload -> 'review_fee') <> 'null'
      then (p_payload ->> 'review_fee')::integer else null end,
    coalesce((p_payload ->> 'is_purchase_verified')::boolean, false),
    coalesce((p_payload ->> 'is_review_verified')::boolean, false),
    v_is_deposit_verified,
    v_deposited_at,
    v_actual_depositor_name
  )
  returning * into v_submission;

  return to_jsonb(v_submission);
end;
$function$;

create or replace function public.admin_gateway_update_submission(
  p_actor_admin_id text,
  p_submission_id bigint,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor public.admins;
  v_submission public.submissions;
  v_next_deposit_verified boolean;
  v_next_deposited_at date;
  v_next_actual_depositor_name text;
  v_has_regular_update boolean := false;
  v_has_updatable_field boolean := false;
begin
  perform public.admin_gateway_validate_payload_keys(
    p_payload,
    array[
      'product_id', 'assign_name', 'order_number', 'buyer_name', 'recipient_name', 'purchase_account',
      'contact', 'address', 'bank_name', 'bank_account', 'account_holder', 'amount',
      'review_fee', 'is_purchase_verified', 'is_review_verified',
      'is_deposit_verified', 'deposited_at', 'actual_depositor_name'
    ]::text[]
  );

  v_actor := public.admin_gateway_actor(p_actor_admin_id);
  select submissions.*
  into v_submission
  from public.submissions as submissions
  where submissions.id = p_submission_id
  for update;

  if not found then
    raise exception '제출 데이터를 찾지 못했습니다.' using errcode = '22023';
  end if;

  if p_payload ? 'product_id'
    and (p_payload ->> 'product_id')::bigint is distinct from v_submission.product_id then
    raise exception '제출의 product_id는 변경할 수 없습니다.' using errcode = '22023';
  end if;

  if not public.admin_gateway_submission_allowed(
    p_actor_admin_id,
    p_submission_id,
    'submission.update'
  ) then
    -- deposit/name 전용 변경은 아래의 더 좁은 권한으로 별도 허용한다.
    v_has_regular_update := false;
  else
    v_has_regular_update := true;
  end if;

  v_has_updatable_field := p_payload ?| array[
    'assign_name', 'order_number', 'buyer_name', 'recipient_name', 'purchase_account',
    'contact', 'address', 'bank_name', 'bank_account', 'account_holder', 'amount',
    'review_fee', 'is_purchase_verified', 'is_review_verified',
    'is_deposit_verified', 'deposited_at', 'actual_depositor_name'
  ]::text[];

  if p_payload ? 'is_purchase_verified'
    or p_payload ? 'is_review_verified'
    or p_payload ? 'assign_name'
    or p_payload ? 'order_number'
    or p_payload ? 'buyer_name'
    or p_payload ? 'recipient_name'
    or p_payload ? 'purchase_account'
    or p_payload ? 'contact'
    or p_payload ? 'address'
    or p_payload ? 'bank_name'
    or p_payload ? 'bank_account'
    or p_payload ? 'account_holder'
    or p_payload ? 'amount'
    or p_payload ? 'review_fee' then
    if not v_has_regular_update then
      perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.update');
      if not public.admin_gateway_submission_allowed(p_actor_admin_id, p_submission_id, 'submission.update') then
        raise exception '제출 수정 범위가 아닙니다.' using errcode = '42501';
      end if;
    end if;
  end if;

  if not v_has_updatable_field then
    perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.update');
    if not public.admin_gateway_submission_allowed(p_actor_admin_id, p_submission_id, 'submission.update') then
      raise exception '제출 수정 범위가 아닙니다.' using errcode = '42501';
    end if;
  end if;

  v_next_deposit_verified := case
    when p_payload ? 'is_deposit_verified'
      then coalesce((p_payload ->> 'is_deposit_verified')::boolean, false)
    else v_submission.is_deposit_verified
  end;
  v_next_deposited_at := case
    when p_payload ? 'deposited_at' and jsonb_typeof(p_payload -> 'deposited_at') <> 'null'
      then (p_payload ->> 'deposited_at')::date
    when p_payload ? 'deposited_at' then null
    else v_submission.deposited_at
  end;
  v_next_actual_depositor_name := case
    when p_payload ? 'actual_depositor_name' then nullif(btrim(p_payload ->> 'actual_depositor_name'), '')
    else v_submission.actual_depositor_name
  end;

  if p_payload ? 'is_deposit_verified'
    then
    perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.deposit.verify');
    if not public.admin_gateway_submission_allowed(p_actor_admin_id, p_submission_id, 'submission.deposit.verify')
      or not coalesce(v_actor.can_verify_deposit, true) then
      raise exception '입금 확인 범위가 아닙니다.' using errcode = '42501';
    end if;
  end if;

  if p_payload ? 'deposited_at'
    then
    perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.deposit.verify');
    if not public.admin_gateway_submission_allowed(p_actor_admin_id, p_submission_id, 'submission.deposit.verify')
      or not coalesce(v_actor.can_verify_deposit, true) then
      raise exception '입금일 수정 범위가 아닙니다.' using errcode = '42501';
    end if;
  end if;

  if p_payload ? 'actual_depositor_name'
    then
    perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.depositor_name.update');
    if not public.admin_gateway_submission_allowed(
      p_actor_admin_id,
      p_submission_id,
      'submission.depositor_name.update'
    ) then
      raise exception '실제 입금자명 수정 범위가 아닙니다.' using errcode = '42501';
    end if;
  end if;

  update public.submissions
  set
    assign_name = case when p_payload ? 'assign_name' then p_payload ->> 'assign_name' else assign_name end,
    order_number = case when p_payload ? 'order_number' then p_payload ->> 'order_number' else order_number end,
    buyer_name = case when p_payload ? 'buyer_name' then p_payload ->> 'buyer_name' else buyer_name end,
    recipient_name = case when p_payload ? 'recipient_name' then p_payload ->> 'recipient_name' else recipient_name end,
    purchase_account = case when p_payload ? 'purchase_account' then p_payload ->> 'purchase_account' else purchase_account end,
    contact = case when p_payload ? 'contact' then p_payload ->> 'contact' else contact end,
    address = case when p_payload ? 'address' then p_payload ->> 'address' else address end,
    bank_name = case when p_payload ? 'bank_name' then p_payload ->> 'bank_name' else bank_name end,
    bank_account = case when p_payload ? 'bank_account' then p_payload ->> 'bank_account' else bank_account end,
    account_holder = case when p_payload ? 'account_holder' then p_payload ->> 'account_holder' else account_holder end,
    amount = case
      when p_payload ? 'amount' and jsonb_typeof(p_payload -> 'amount') <> 'null'
        then (p_payload ->> 'amount')::integer
      when p_payload ? 'amount' then null
      else amount
    end,
    review_fee = case
      when p_payload ? 'review_fee' and jsonb_typeof(p_payload -> 'review_fee') <> 'null'
        then (p_payload ->> 'review_fee')::integer
      when p_payload ? 'review_fee' then null
      else review_fee
    end,
    is_purchase_verified = case when p_payload ? 'is_purchase_verified'
      then coalesce((p_payload ->> 'is_purchase_verified')::boolean, false) else is_purchase_verified end,
    is_review_verified = case when p_payload ? 'is_review_verified'
      then coalesce((p_payload ->> 'is_review_verified')::boolean, false) else is_review_verified end,
    is_deposit_verified = v_next_deposit_verified,
    deposited_at = v_next_deposited_at,
    actual_depositor_name = v_next_actual_depositor_name
  where id = v_submission.id;

  select submissions.* into v_submission
  from public.submissions as submissions
  where submissions.id = p_submission_id;

  return to_jsonb(v_submission);
end;
$function$;

revoke all on function public.admin_gateway_insert_submission(text, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.admin_gateway_update_submission(text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.admin_gateway_insert_submission(text, bigint, jsonb) to service_role;
grant execute on function public.admin_gateway_update_submission(text, bigint, jsonb) to service_role;

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
  v_rows jsonb;
  v_total_count bigint := 0;
begin
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'product.read');
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.read');

  if v_view_mode not in ('all', 'in_progress', 'completed') then
    raise exception '리뷰받기 목록 상태값이 올바르지 않습니다.' using errcode = '22023';
  end if;

  with scoped_products as (
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
    where public.admin_gateway_product_allowed(
      p_actor_admin_id,
      products.id,
      'product.read'
    )
  ), product_rows as (
    select
      scoped_products.*,
      (
        select count(*)::integer
        from public.submissions as submissions
        where submissions.product_id = scoped_products.id
          and public.admin_gateway_submission_allowed(
            p_actor_admin_id,
            submissions.id,
            'submission.read'
          )
      ) as submission_count,
      (
        select count(*) filter (where coalesce(submissions.is_review_verified, false) = false)::integer
        from public.submissions as submissions
        where submissions.product_id = scoped_products.id
          and public.admin_gateway_submission_allowed(
            p_actor_admin_id,
            submissions.id,
            'submission.read'
          )
      ) as purchase_count,
      (
        select count(*) filter (
          where coalesce(submissions.is_review_verified, false) = true
            and coalesce(submissions.is_deposit_verified, false) = false
        )::integer
        from public.submissions as submissions
        where submissions.product_id = scoped_products.id
          and public.admin_gateway_submission_allowed(
            p_actor_admin_id,
            submissions.id,
            'submission.read'
          )
      ) as review_count,
      (
        select count(*) filter (
          where coalesce(submissions.is_review_verified, false) = true
            and coalesce(submissions.is_deposit_verified, false) = true
        )::integer
        from public.submissions as submissions
        where submissions.product_id = scoped_products.id
          and public.admin_gateway_submission_allowed(
            p_actor_admin_id,
            submissions.id,
            'submission.read'
          )
      ) as complete_count
    from scoped_products
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

revoke all on function public.get_admin_review_receive_product_summaries_gateway(text, boolean, text, jsonb, integer, date, bigint) from public, anon, authenticated;
grant execute on function public.get_admin_review_receive_product_summaries_gateway(text, boolean, text, jsonb, integer, date, bigint) to service_role;

create or replace function public.get_admin_review_receive_detail(
  p_actor_admin_id text,
  p_product_id bigint
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

  if not public.admin_gateway_product_allowed(p_actor_admin_id, p_product_id, 'product.read') then
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
  and public.admin_gateway_product_allowed(p_actor_admin_id, products.id, 'product.read');

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
        'submission.read'
      )
  ) as submission_rows;

  return jsonb_build_object(
    'product', to_jsonb(v_product),
    'products', v_products,
    'submissions', v_submissions,
    'scope', public.admin_gateway_scope_json(
      p_actor_admin_id,
      array['product.read', 'submission.read']::text[]
    )
  );
end;
$function$;

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
begin
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'product.create');
  perform public.admin_gateway_validate_payload_keys(
    p_payload,
    array[
      'title', 'product_name', 'description', 'product_link', 'deposit_date',
      'product_date', 'is_real_shipping', 'company_name', 'option_name',
      'review_type', 'planned_depositor_name', 'deposit_GB'
    ]::text[]
  );
  v_actor := public.admin_gateway_actor(p_actor_admin_id);

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
    null
  )
  returning id into v_product_id;

  update public.products
  set bundle_id = v_product_id
  where id = v_product_id;

  select products.* into v_product
  from public.products as products
  where products.id = v_product_id;

  return jsonb_build_object(
    'product', to_jsonb(v_product),
    'scope', public.admin_gateway_scope_json(p_actor_admin_id, array['product.create']::text[])
  );
end;
$function$;

create or replace function public.update_admin_review_receive_product(
  p_actor_admin_id text,
  p_product_id bigint,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_product public.products;
begin
  perform public.admin_gateway_validate_payload_keys(
    p_payload,
    array[
      'title', 'product_name', 'description', 'product_link', 'deposit_date',
      'product_date', 'is_real_shipping', 'company_name', 'option_name',
      'review_type', 'planned_depositor_name', 'deposit_GB'
    ]::text[]
  );
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'product.update');
  if not public.admin_gateway_product_allowed(p_actor_admin_id, p_product_id, 'product.update') then
    raise exception '상품 수정 범위가 아닙니다.' using errcode = '42501';
  end if;

  update public.products
  set
    title = case when p_payload ? 'title' then p_payload ->> 'title' else title end,
    product_name = case when p_payload ? 'product_name' then p_payload ->> 'product_name' else product_name end,
    description = case when p_payload ? 'description' then p_payload ->> 'description' else description end,
    product_link = case when p_payload ? 'product_link' then p_payload ->> 'product_link' else product_link end,
    deposit_date = case
      when p_payload ? 'deposit_date' and jsonb_typeof(p_payload -> 'deposit_date') <> 'null'
        then (p_payload ->> 'deposit_date')::date
      when p_payload ? 'deposit_date' then null
      else deposit_date
    end,
    product_date = case
      when p_payload ? 'product_date' and jsonb_typeof(p_payload -> 'product_date') <> 'null'
        then (p_payload ->> 'product_date')::date
      else product_date
    end,
    is_real_shipping = case when p_payload ? 'is_real_shipping'
      then coalesce((p_payload ->> 'is_real_shipping')::boolean, is_real_shipping) else is_real_shipping end,
    company_name = case when p_payload ? 'company_name' then p_payload ->> 'company_name' else company_name end,
    option_name = case when p_payload ? 'option_name' then p_payload ->> 'option_name' else option_name end,
    review_type = case when p_payload ? 'review_type' then p_payload ->> 'review_type' else review_type end,
    planned_depositor_name = case when p_payload ? 'planned_depositor_name'
      then p_payload ->> 'planned_depositor_name' else planned_depositor_name end,
    "deposit_GB" = case
      when p_payload ? 'deposit_GB' and jsonb_typeof(p_payload -> 'deposit_GB') <> 'null'
        then (p_payload ->> 'deposit_GB')::integer
      else "deposit_GB"
    end
  where id = p_product_id;

  select products.* into v_product
  from public.products as products
  where products.id = p_product_id;

  return jsonb_build_object(
    'product', to_jsonb(v_product),
    'scope', public.admin_gateway_scope_json(p_actor_admin_id, array['product.update']::text[])
  );
end;
$function$;

create or replace function public.get_admin_product_detail_meta(
  p_actor_admin_id text,
  p_product_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_product jsonb;
  v_steps jsonb;
begin
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'product.read');
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'product_step.read');

  if not public.admin_gateway_product_allowed(p_actor_admin_id, p_product_id, 'product.read') then
    raise exception '상품 조회 범위가 아닙니다.' using errcode = '42501';
  end if;

  select to_jsonb(product_rows)
  into v_product
  from (
    select
      products.id,
      products.title,
      products.product_name,
      products.description,
      products.product_link,
      products.manager_id
    from public.products as products
    where products.id = p_product_id
  ) as product_rows;

  select coalesce(
    jsonb_agg(to_jsonb(step_rows) order by step_rows.step_number, step_rows.id),
    '[]'::jsonb
  )
  into v_steps
  from (
    select product_steps.id, product_steps.step_number
    from public.product_steps
    where product_steps.product_id = p_product_id
  ) as step_rows;

  return jsonb_build_object(
    'product', v_product,
    'steps', v_steps,
    'scope', public.admin_gateway_scope_json(
      p_actor_admin_id,
      array['product.read', 'product_step.read']::text[]
    )
  );
end;
$function$;

create or replace function public.get_admin_product_applications(
  p_actor_admin_id text,
  p_product_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_applications jsonb;
begin
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'application.read');
  if not public.admin_gateway_product_allowed(p_actor_admin_id, p_product_id, 'application.read') then
    raise exception '신청자 조회 범위가 아닙니다.' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(application_rows) order by application_rows.created_at, application_rows.id),
    '[]'::jsonb
  )
  into v_applications
  from (
    select applications.id, applications.product_id, applications.applicant_name,
      applications.is_confirmed, applications.created_at
    from public.applications as applications
    where applications.product_id = p_product_id
  ) as application_rows;

  return jsonb_build_object(
    'applications', v_applications,
    'scope', public.admin_gateway_scope_json(p_actor_admin_id, array['application.read']::text[])
  );
end;
$function$;

create or replace function public.get_admin_product_submissions(
  p_actor_admin_id text,
  p_product_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_submissions jsonb;
begin
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.read');
  if not public.admin_gateway_product_allowed(p_actor_admin_id, p_product_id, 'submission.read') then
    raise exception '제출 조회 범위가 아닙니다.' using errcode = '42501';
  end if;

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
      submissions.is_purchase_verified,
      submissions.is_review_verified,
      submissions.created_at
    from public.submissions as submissions
    where submissions.product_id = p_product_id
      and public.admin_gateway_submission_allowed(p_actor_admin_id, submissions.id, 'submission.read')
  ) as submission_rows;

  return jsonb_build_object(
    'submissions', v_submissions,
    'scope', public.admin_gateway_scope_json(p_actor_admin_id, array['submission.read']::text[])
  );
end;
$function$;

create or replace function public.get_admin_evidence_photos(
  p_actor_admin_id text,
  p_submission_ids bigint[],
  p_photo_type text default null
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
      'submission.photo.read'
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
    'scope', public.admin_gateway_scope_json(p_actor_admin_id, array['submission.photo.read']::text[])
  );
end;
$function$;

create or replace function public.update_admin_application_confirmed(
  p_actor_admin_id text,
  p_application_id bigint,
  p_product_id bigint,
  p_checked boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_application public.applications;
begin
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'application.confirm');

  if not public.admin_gateway_application_allowed(
    p_actor_admin_id,
    p_application_id,
    'application.confirm'
  ) then
    raise exception '신청자 확정 범위가 아닙니다.' using errcode = '42501';
  end if;

  select applications.* into v_application
  from public.applications as applications
  where applications.id = p_application_id
    and applications.product_id = p_product_id
  for update;

  if not found then
    raise exception '신청자 데이터를 찾지 못했습니다.' using errcode = '22023';
  end if;

  update public.applications
  set is_confirmed = coalesce(p_checked, false)
  where id = p_application_id;

  select applications.* into v_application
  from public.applications as applications
  where applications.id = p_application_id;

  return jsonb_build_object(
    'application', to_jsonb(v_application),
    'scope', public.admin_gateway_scope_json(p_actor_admin_id, array['application.confirm']::text[])
  );
end;
$function$;

create or replace function public.update_admin_submission_verified(
  p_actor_admin_id text,
  p_submission_id bigint,
  p_target_column text,
  p_checked boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_permission_code text;
  v_actor public.admins;
  v_submission jsonb;
begin
  if p_target_column not in ('is_purchase_verified', 'is_review_verified', 'is_deposit_verified') then
    raise exception '허용되지 않은 검증 항목입니다.' using errcode = '22023';
  end if;

  v_permission_code := case
    when p_target_column = 'is_deposit_verified' then 'submission.deposit.verify'
    else 'submission.update'
  end;
  perform public.admin_gateway_assert_permission(p_actor_admin_id, v_permission_code);
  v_actor := public.admin_gateway_actor(p_actor_admin_id);

  if not public.admin_gateway_submission_allowed(
    p_actor_admin_id,
    p_submission_id,
    v_permission_code
  ) then
    raise exception '제출 검증 범위가 아닙니다.' using errcode = '42501';
  end if;

  if p_target_column = 'is_deposit_verified' and not coalesce(v_actor.can_verify_deposit, true) then
    raise exception '입금 확인 권한이 없습니다.' using errcode = '42501';
  end if;

  v_submission := public.admin_gateway_update_submission(
    p_actor_admin_id,
    p_submission_id,
    jsonb_build_object(p_target_column, coalesce(p_checked, false))
  );

  return jsonb_build_object(
    'submission', v_submission,
    'scope', public.admin_gateway_scope_json(p_actor_admin_id, array[v_permission_code]::text[])
  );
end;
$function$;

create or replace function public.set_admin_product_step(
  p_actor_admin_id text,
  p_product_id bigint,
  p_step_number integer,
  p_checked boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_action_permission text;
  v_step public.product_steps;
begin
  if p_step_number is null or p_step_number < 1 then
    raise exception '단계 번호가 올바르지 않습니다.' using errcode = '22023';
  end if;

  v_action_permission := case
    when coalesce(p_checked, false) then 'product_step.create'
    else 'product_step.delete'
  end;
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'product_step.update');
  perform public.admin_gateway_assert_permission(p_actor_admin_id, v_action_permission);

  if not public.admin_gateway_product_allowed(
    p_actor_admin_id,
    p_product_id,
    v_action_permission
  ) then
    raise exception '상품 단계 변경 범위가 아닙니다.' using errcode = '42501';
  end if;

  if coalesce(p_checked, false) then
    if not exists (
      select 1 from public.product_steps
      where product_id = p_product_id and step_number = p_step_number
    ) then
      insert into public.product_steps (product_id, step_number)
      values (p_product_id, p_step_number);
    end if;

    select product_steps.* into v_step
    from public.product_steps
    where product_id = p_product_id and step_number = p_step_number
    order by id desc
    limit 1;
  else
    delete from public.product_steps
    where product_id = p_product_id and step_number = p_step_number;
    v_step := null;
  end if;

  return jsonb_build_object(
    'step', case when v_step.id is null then null else to_jsonb(v_step) end,
    'checked', coalesce(p_checked, false),
    'scope', public.admin_gateway_scope_json(
      p_actor_admin_id,
      array['product_step.update', v_action_permission]::text[]
    )
  );
end;
$function$;

create or replace function public.get_admin_submission_by_order_number(
  p_actor_admin_id text,
  p_product_id bigint,
  p_order_number text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_submission public.submissions;
  v_count integer;
begin
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.read');
  if not public.admin_gateway_product_allowed(p_actor_admin_id, p_product_id, 'submission.read') then
    raise exception '제출 조회 범위가 아닙니다.' using errcode = '42501';
  end if;

  select count(*)::integer into v_count
  from public.submissions
  where product_id = p_product_id
    and order_number = p_order_number;

  if v_count > 1 then
    raise exception '주문번호에 해당하는 제출 데이터가 여러 건입니다.' using errcode = '21000';
  end if;

  select submissions.* into v_submission
  from public.submissions as submissions
  where submissions.product_id = p_product_id
    and submissions.order_number = p_order_number
  limit 1;

  return jsonb_build_object(
    'submission', case when v_submission.id is null then null else to_jsonb(v_submission) end,
    'scope', public.admin_gateway_scope_json(p_actor_admin_id, array['submission.read']::text[])
  );
end;
$function$;

create or replace function public.create_admin_review_receive_submission(
  p_actor_admin_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_submission jsonb;
  v_product_id bigint;
begin
  v_product_id := (p_payload ->> 'product_id')::bigint;
  v_submission := public.admin_gateway_insert_submission(
    p_actor_admin_id,
    v_product_id,
    p_payload
  );

  return jsonb_build_object(
    'submission', v_submission,
    'scope', public.admin_gateway_scope_json(p_actor_admin_id, array['submission.create']::text[])
  );
end;
$function$;

create or replace function public.create_admin_submission(
  p_actor_admin_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_submission jsonb;
  v_product_id bigint;
begin
  v_product_id := (p_payload ->> 'product_id')::bigint;
  v_submission := public.admin_gateway_insert_submission(
    p_actor_admin_id,
    v_product_id,
    p_payload
  );

  return jsonb_build_object(
    'submission', v_submission,
    'scope', public.admin_gateway_scope_json(p_actor_admin_id, array['submission.create']::text[])
  );
end;
$function$;

create or replace function public.update_admin_review_receive_submission(
  p_actor_admin_id text,
  p_submission_id bigint,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_submission jsonb;
begin
  v_submission := public.admin_gateway_update_submission(
    p_actor_admin_id,
    p_submission_id,
    p_payload
  );

  return jsonb_build_object(
    'submission', v_submission,
    'scope', public.admin_gateway_scope_json(p_actor_admin_id, array['submission.update']::text[])
  );
end;
$function$;

create or replace function public.update_admin_review_receive_submission_status(
  p_actor_admin_id text,
  p_submission_id bigint,
  p_updates jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_submission jsonb;
begin
  perform public.admin_gateway_validate_payload_keys(
    p_updates,
    array[
      'is_purchase_verified', 'is_review_verified', 'is_deposit_verified',
      'deposited_at', 'actual_depositor_name'
    ]::text[]
  );
  v_submission := public.admin_gateway_update_submission(
    p_actor_admin_id,
    p_submission_id,
    p_updates
  );

  return jsonb_build_object(
    'submission', v_submission,
    'scope', public.admin_gateway_scope_json(p_actor_admin_id, array['submission.update']::text[])
  );
end;
$function$;

create or replace function public.get_admin_product_overview_rows_gateway(
  p_actor_admin_id text,
  p_include_company_data boolean default false,
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
begin
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'product.read');
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.read');

  if v_status not in ('all', 'purchase', 'review', 'complete') then
    raise exception '상품전체보기 상태값이 올바르지 않습니다.' using errcode = '22023';
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
        when public.admin_gateway_submission_allowed(p_actor_admin_id, submissions.id, 'submission.photo.read') then coalesce(
          (
            select jsonb_agg(to_jsonb(photo_rows) order by photo_rows.created_at, photo_rows.id)
            from (
              select
                evidence_photos.id,
                evidence_photos.submission_id,
                evidence_photos.photo_type,
                evidence_photos.image_url,
                evidence_photos.created_at
              from public.evidence_photos
              where evidence_photos.submission_id = submissions.id
                and evidence_photos.photo_type = 'review'
            ) as photo_rows
          ),
          '[]'::jsonb
        )
        else '[]'::jsonb
      end as review_photos,
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
    where public.admin_gateway_product_allowed(p_actor_admin_id, products.id, 'product.read')
      and public.admin_gateway_submission_allowed(p_actor_admin_id, submissions.id, 'submission.read')
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
        and jsonb_array_length(base_rows.review_photos) > 0
      )
      or (
        public.normalize_product_overview_filter_text(coalesce(p_filters, '{}'::jsonb) ->> 'review_photos') in ('none', '사진없음')
        and jsonb_array_length(base_rows.review_photos) = 0
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
      jsonb_agg((to_jsonb(paged_rows) - 'total_count') order by paged_rows.product_sort_at desc, paged_rows.product_id asc, paged_rows.submission_sort_at asc, paged_rows.submission_id asc),
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

revoke all on function public.get_admin_product_overview_rows_gateway(text, boolean, text, jsonb, integer, timestamptz, bigint, timestamptz, bigint) from public, anon, authenticated;
grant execute on function public.get_admin_product_overview_rows_gateway(text, boolean, text, jsonb, integer, timestamptz, bigint, timestamptz, bigint) to service_role;

create or replace function public.admin_gateway_delete_submission_ids(
  p_actor_admin_id text,
  p_submission_ids bigint[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_ids bigint[];
  v_deleted_evidence jsonb;
  v_deleted_submissions jsonb;
begin
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.delete');
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.photo.delete');

  select coalesce(array_agg(distinct requested.id order by requested.id), '{}'::bigint[])
  into v_ids
  from unnest(coalesce(p_submission_ids, '{}'::bigint[])) as requested(id)
  where requested.id is not null;

  if cardinality(v_ids) = 0 then
    return jsonb_build_object(
      'data', '[]'::jsonb,
      'partial', false,
      'completedSteps', '[]'::jsonb,
      'deletedEvidenceSubmissionIds', '[]'::jsonb,
      'deletedSubmissionIds', '[]'::jsonb
    );
  end if;

  if exists (
    select 1
    from unnest(v_ids) as requested(id)
    where not public.admin_gateway_submission_allowed(
      p_actor_admin_id,
      requested.id,
      'submission.delete'
    )
    or not public.admin_gateway_submission_allowed(
      p_actor_admin_id,
      requested.id,
      'submission.photo.delete'
    )
  ) then
    raise exception '삭제 범위를 벗어난 제출 ID가 포함되어 있습니다.' using errcode = '42501';
  end if;

  with deleted as (
    delete from public.evidence_photos
    where submission_id = any(v_ids)
    returning submission_id
  )
  select coalesce(jsonb_agg(ids.submission_id order by ids.submission_id), '[]'::jsonb)
  into v_deleted_evidence
  from (select distinct deleted.submission_id from deleted) as ids;

  with deleted as (
    delete from public.submissions
    where id = any(v_ids)
    returning id
  )
  select coalesce(jsonb_agg(deleted.id order by deleted.id), '[]'::jsonb)
  into v_deleted_submissions
  from deleted;

  return jsonb_build_object(
    'data', v_deleted_submissions,
    'partial', false,
    'completedSteps', case
      when jsonb_array_length(v_deleted_evidence) > 0 and jsonb_array_length(v_deleted_submissions) > 0
        then jsonb_build_array('evidence_photos', 'submissions')
      when jsonb_array_length(v_deleted_evidence) > 0 then jsonb_build_array('evidence_photos')
      when jsonb_array_length(v_deleted_submissions) > 0 then jsonb_build_array('submissions')
      else '[]'::jsonb
    end,
    'deletedEvidenceSubmissionIds', v_deleted_evidence,
    'deletedSubmissionIds', v_deleted_submissions
  );
end;
$function$;

create or replace function public.admin_gateway_delete_product_ids(
  p_actor_admin_id text,
  p_product_ids bigint[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_product_ids bigint[];
  v_submission_ids bigint[];
  v_deleted_evidence jsonb;
  v_deleted_submissions jsonb;
  v_deleted_submission_products jsonb;
  v_deleted_applications jsonb;
  v_deleted_steps jsonb;
  v_deleted_products jsonb;
begin
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'product.delete');
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.delete');
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.photo.delete');
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'application.delete');
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'product_step.delete');

  select coalesce(array_agg(distinct requested.id order by requested.id), '{}'::bigint[])
  into v_product_ids
  from unnest(coalesce(p_product_ids, '{}'::bigint[])) as requested(id)
  where requested.id is not null;

  if cardinality(v_product_ids) = 0 then
    raise exception '삭제할 상품을 찾지 못했습니다.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(v_product_ids) as requested(id)
    where not public.admin_gateway_product_allowed(
      p_actor_admin_id,
      requested.id,
      'product.delete'
    )
  ) then
    raise exception '삭제 범위를 벗어난 상품 ID가 포함되어 있습니다.' using errcode = '42501';
  end if;

  if exists (
    select 1
    from unnest(v_product_ids) as requested(id)
    where not exists (select 1 from public.products where products.id = requested.id)
  ) then
    raise exception '삭제할 상품을 찾지 못했습니다.' using errcode = '22023';
  end if;

  select coalesce(array_agg(submissions.id order by submissions.id), '{}'::bigint[])
  into v_submission_ids
  from public.submissions as submissions
  where submissions.product_id = any(v_product_ids);

  if exists (
    select 1
    from unnest(coalesce(v_submission_ids, '{}'::bigint[])) as requested(id)
    where not public.admin_gateway_submission_allowed(p_actor_admin_id, requested.id, 'submission.delete')
      or not public.admin_gateway_submission_allowed(p_actor_admin_id, requested.id, 'submission.photo.delete')
  ) then
    raise exception '상품에 속한 제출 삭제 범위를 벗어났습니다.' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.applications as applications
    where applications.product_id = any(v_product_ids)
      and not public.admin_gateway_application_allowed(
        p_actor_admin_id,
        applications.id,
        'application.delete'
      )
  ) then
    raise exception '상품에 속한 신청자 삭제 범위를 벗어났습니다.' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.product_steps as product_steps
    where product_steps.product_id = any(v_product_ids)
      and not public.admin_gateway_product_allowed(
        p_actor_admin_id,
        product_steps.product_id,
        'product_step.delete'
      )
  ) then
    raise exception '상품 단계 삭제 범위를 벗어났습니다.' using errcode = '42501';
  end if;

  with deleted as (
    delete from public.evidence_photos
    where submission_id = any(coalesce(v_submission_ids, '{}'::bigint[]))
    returning submission_id
  )
  select coalesce(jsonb_agg(ids.submission_id order by ids.submission_id), '[]'::jsonb)
  into v_deleted_evidence
  from (select distinct deleted.submission_id from deleted) as ids;

  with deleted as (
    delete from public.submissions
    where product_id = any(v_product_ids)
    returning id, product_id
  )
  select
    coalesce(jsonb_agg(deleted.id order by deleted.id), '[]'::jsonb),
    coalesce(jsonb_agg(distinct deleted.product_id order by deleted.product_id), '[]'::jsonb)
  into v_deleted_submissions, v_deleted_submission_products
  from deleted;

  with deleted as (
    delete from public.applications
    where product_id = any(v_product_ids)
    returning product_id
  )
  select coalesce(jsonb_agg(ids.product_id order by ids.product_id), '[]'::jsonb)
  into v_deleted_applications
  from (select distinct deleted.product_id from deleted) as ids;

  with deleted as (
    delete from public.product_steps
    where product_id = any(v_product_ids)
    returning product_id
  )
  select coalesce(jsonb_agg(ids.product_id order by ids.product_id), '[]'::jsonb)
  into v_deleted_steps
  from (select distinct deleted.product_id from deleted) as ids;

  with deleted as (
    delete from public.products
    where id = any(v_product_ids)
    returning id
  )
  select coalesce(jsonb_agg(deleted.id order by deleted.id), '[]'::jsonb)
  into v_deleted_products
  from deleted;

  return jsonb_build_object(
    'data', v_deleted_products,
    'partial', false,
    'completedSteps', jsonb_build_array(
      'evidence_photos', 'submissions', 'applications', 'product_steps', 'products'
    ),
    'deletedEvidenceSubmissionIds', v_deleted_evidence,
    'deletedSubmissionIds', v_deleted_submissions,
    'deletedSubmissionProductIds', v_deleted_submission_products,
    'deletedApplicationProductIds', v_deleted_applications,
    'deletedProductStepProductIds', v_deleted_steps,
    'deletedProductIds', v_deleted_products
  );
end;
$function$;

create or replace function public.delete_admin_review_receive_submission(
  p_actor_admin_id text,
  p_submission_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  return public.admin_gateway_delete_submission_ids(
    p_actor_admin_id,
    array[p_submission_id]::bigint[]
  );
end;
$function$;

create or replace function public.delete_admin_product_overview_submissions(
  p_actor_admin_id text,
  p_submission_ids bigint[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  return public.admin_gateway_delete_submission_ids(p_actor_admin_id, p_submission_ids);
end;
$function$;

create or replace function public.delete_admin_submissions_with_evidence_photos(
  p_actor_admin_id text,
  p_submission_ids bigint[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  return public.admin_gateway_delete_submission_ids(p_actor_admin_id, p_submission_ids);
end;
$function$;

create or replace function public.delete_admin_review_receive_product(
  p_actor_admin_id text,
  p_product_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  return public.admin_gateway_delete_product_ids(
    p_actor_admin_id,
    array[p_product_id]::bigint[]
  );
end;
$function$;

create or replace function public.delete_admin_review_receive_product_bundle(
  p_actor_admin_id text,
  p_bundle_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_product_ids bigint[];
begin
  select coalesce(array_agg(products.id order by products.id), '{}'::bigint[])
  into v_product_ids
  from public.products as products
  where products.bundle_id::bigint = p_bundle_id;

  if cardinality(v_product_ids) = 0 then
    raise exception '삭제할 묶음 상품을 찾지 못했습니다.' using errcode = '22023';
  end if;

  return public.admin_gateway_delete_product_ids(p_actor_admin_id, v_product_ids);
end;
$function$;

create or replace function public.delete_admin_products_with_related_data(
  p_actor_admin_id text,
  p_product_ids bigint[],
  p_submission_ids bigint[] default '{}'::bigint[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  -- p_submission_ids는 legacy 클라이언트 호환용으로 받지만 신뢰하지 않는다.
  -- 실제 관련 submission은 product_id 관계를 서버에서 다시 계산한다.
  return public.admin_gateway_delete_product_ids(p_actor_admin_id, p_product_ids);
end;
$function$;

create or replace function public.delete_admin_evidence_photo(
  p_actor_admin_id text,
  p_photo_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_photo public.evidence_photos;
begin
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.photo.delete');
  if not public.admin_gateway_photo_allowed(
    p_actor_admin_id,
    p_photo_id,
    'submission.photo.delete'
  ) then
    raise exception '사진 삭제 범위가 아닙니다.' using errcode = '42501';
  end if;

  delete from public.evidence_photos
  where id = p_photo_id
  returning * into v_photo;

  return jsonb_build_object(
    'photo', case when v_photo.id is null then null else to_jsonb(v_photo) end,
    'scope', public.admin_gateway_scope_json(p_actor_admin_id, array['submission.photo.delete']::text[])
  );
end;
$function$;

create or replace function public.get_admin_bulk_edit_rows(
  p_actor_admin_id text,
  p_submission_ids bigint[]
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
    where not public.admin_gateway_submission_allowed(p_actor_admin_id, requested.id, 'submission.read')
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
      array['bulk_edit.execute', 'submission.read']::text[]
    )
  );
end;
$function$;

create or replace function public.apply_admin_bulk_submission_updates_gateway(
  p_actor_admin_id text,
  p_updates jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_change jsonb;
  v_submission_id bigint;
  v_payload jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_ids bigint[] := '{}'::bigint[];
  v_updated jsonb;
begin
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'bulk_edit.execute');
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.update');

  if p_updates is null or jsonb_typeof(p_updates) <> 'array' then
    raise exception '일괄수정 payload는 JSON array여야 합니다.' using errcode = '22023';
  end if;

  for v_change in select value from jsonb_array_elements(p_updates) as values(value) loop
    if jsonb_typeof(v_change) <> 'object'
      or not (v_change ? 'submission_id')
      or jsonb_typeof(v_change -> 'submission_id') not in ('number', 'string') then
      raise exception '일괄수정 행의 submission_id가 올바르지 않습니다.' using errcode = '22023';
    end if;

    v_submission_id := (v_change ->> 'submission_id')::bigint;
    if v_submission_id = any(v_ids) then
      raise exception '일괄수정 submission_id가 중복되었습니다.' using errcode = '22023';
    end if;
    v_ids := array_append(v_ids, v_submission_id);
  end loop;

  for v_change in select value from jsonb_array_elements(p_updates) as values(value) loop
    v_submission_id := (v_change ->> 'submission_id')::bigint;
    v_payload := v_change - 'submission_id';
    v_updated := public.admin_gateway_update_submission(
      p_actor_admin_id,
      v_submission_id,
      v_payload
    );
    v_rows := v_rows || jsonb_build_array(v_updated);
  end loop;

  return jsonb_build_object(
    'rows', v_rows,
    'submissions', v_rows,
    'updated', v_rows,
    'scope', public.admin_gateway_scope_json(
      p_actor_admin_id,
      array['bulk_edit.execute', 'submission.update']::text[]
    )
  );
end;
$function$;

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
  v_product_ids bigint[];
  v_products jsonb;
  v_submissions jsonb;
  v_evidence_photos jsonb := '[]'::jsonb;
  v_applications jsonb := '[]'::jsonb;
  v_date_field text := nullif(btrim(p_date_filter ->> 'field'), '');
  v_start_date date := nullif(btrim(p_date_filter ->> 'startDate'), '')::date;
  v_end_date date := nullif(btrim(p_date_filter ->> 'endDate'), '')::date;
begin
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'export.execute');
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'product.read');
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.read');

  if v_date_field is not null and v_date_field not in ('created_at', 'deposited_at') then
    raise exception '내보내기 날짜 필드가 올바르지 않습니다.' using errcode = '22023';
  end if;

  select coalesce(array_agg(products.id order by products.created_at desc, products.id), '{}'::bigint[])
  into v_product_ids
  from public.products as products
  where (p_product_id is null or products.id = p_product_id)
    and public.admin_gateway_product_allowed(
      p_actor_admin_id,
      products.id,
      'product.read',
      coalesce(p_force_personal_scope, false)
    );

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
    where submissions.product_id = any(v_product_ids)
      and public.admin_gateway_submission_allowed(
        p_actor_admin_id,
        submissions.id,
        'submission.read',
        coalesce(p_force_personal_scope, false)
      )
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
      from public.evidence_photos
      where evidence_photos.submission_id in (
        select submissions.id
        from public.submissions as submissions
        where submissions.product_id = any(v_product_ids)
          and public.admin_gateway_submission_allowed(
            p_actor_admin_id,
            submissions.id,
            'submission.read',
            coalesce(p_force_personal_scope, false)
          )
      )
      and public.admin_gateway_submission_allowed(
        p_actor_admin_id,
        evidence_photos.submission_id,
        'submission.photo.read',
        coalesce(p_force_personal_scope, false)
      )
    ) as photo_rows;
  end if;

  if coalesce(p_include_applications, false) then
    perform public.admin_gateway_assert_permission(p_actor_admin_id, 'application.read');
    select coalesce(
      jsonb_agg(to_jsonb(application_rows) order by application_rows.created_at, application_rows.id),
      '[]'::jsonb
    )
    into v_applications
    from (
      select applications.id, applications.product_id, applications.applicant_name,
        applications.is_confirmed, applications.created_at
      from public.applications as applications
      where applications.product_id = any(v_product_ids)
        and public.admin_gateway_product_allowed(
          p_actor_admin_id,
          applications.product_id,
          'application.read',
          coalesce(p_force_personal_scope, false)
        )
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
      coalesce(p_force_personal_scope, false)
    )
  );
end;
$function$;

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
  v_product_ids bigint[];
  v_products jsonb;
  v_submissions jsonb;
  v_evidence_photos jsonb;
begin
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'export.execute');
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.photo.read');
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'product.read');
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.read');

  select coalesce(array_agg(products.id order by products.created_at desc, products.id), '{}'::bigint[])
  into v_product_ids
  from public.products as products
  where (p_product_id is null or products.id = p_product_id)
    and public.admin_gateway_product_allowed(p_actor_admin_id, products.id, 'product.read');

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
    where submissions.product_id = any(v_product_ids)
      and public.admin_gateway_submission_allowed(p_actor_admin_id, submissions.id, 'submission.read')
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
    from public.evidence_photos
    where evidence_photos.submission_id in (
      select submissions.id
      from public.submissions as submissions
      where submissions.product_id = any(v_product_ids)
        and public.admin_gateway_submission_allowed(p_actor_admin_id, submissions.id, 'submission.read')
    )
      and public.admin_gateway_submission_allowed(
        p_actor_admin_id,
        evidence_photos.submission_id,
        'submission.photo.read'
      )
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
  v_product_ids bigint[];
  v_products jsonb;
  v_submissions jsonb;
  v_applications jsonb := '[]'::jsonb;
  v_evidence_photos jsonb := '[]'::jsonb;
  v_company_members jsonb := '[]'::jsonb;
begin
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'menu.dashboard');
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'product.read');
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.read');

  select coalesce(array_agg(products.id order by products.created_at desc, products.id), '{}'::bigint[])
  into v_product_ids
  from public.products as products
  where public.admin_gateway_product_allowed(p_actor_admin_id, products.id, 'product.read');

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
    where submissions.product_id = any(v_product_ids)
      and public.admin_gateway_submission_allowed(p_actor_admin_id, submissions.id, 'submission.read')
  ) as submission_rows;

  if public.admin_gateway_permission_scope(p_actor_admin_id, 'application.read') is not null then
    select coalesce(
      jsonb_agg(to_jsonb(application_rows) order by application_rows.created_at, application_rows.id),
      '[]'::jsonb
    )
    into v_applications
    from (
      select applications.id, applications.product_id, applications.is_confirmed, applications.created_at
      from public.applications as applications
      where applications.product_id = any(v_product_ids)
        and public.admin_gateway_product_allowed(p_actor_admin_id, applications.product_id, 'application.read')
    ) as application_rows;
  end if;

  if public.admin_gateway_permission_scope(p_actor_admin_id, 'submission.photo.read') is not null then
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
      from public.evidence_photos
      where evidence_photos.submission_id in (
        select submissions.id
        from public.submissions as submissions
        where submissions.product_id = any(v_product_ids)
          and public.admin_gateway_submission_allowed(p_actor_admin_id, submissions.id, 'submission.read')
      )
        and public.admin_gateway_submission_allowed(
          p_actor_admin_id,
          evidence_photos.submission_id,
          'submission.photo.read'
        )
    ) as photo_rows;
  end if;

  if public.admin_gateway_permission_scope(p_actor_admin_id, 'admin_member.read') is not null then
    select coalesce(
      jsonb_agg(to_jsonb(member_rows) order by member_rows.company, member_rows.login_id),
      '[]'::jsonb
    )
    into v_company_members
    from (
      select admins.login_id, admins.username, admins.company
      from public.admins
      where coalesce(admins.is_active, true) = true
        and public.admin_gateway_manager_allowed(
          p_actor_admin_id,
          'admin_member.read',
          admins.login_id
        )
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

create or replace function public.apply_admin_file_upload(
  p_actor_admin_id text,
  p_parse_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_product_item jsonb;
  v_submission_item jsonb;
  v_product_payload jsonb;
  v_submission_payload jsonb;
  v_product public.products;
  v_product_id bigint;
  v_existing_submission_id bigint;
  v_existing_count integer;
  v_saved_submission jsonb;
  v_product_key text;
  v_product_title text;
  v_result jsonb := jsonb_build_object(
    'createdProducts', '[]'::jsonb,
    'insertedSubmissions', '[]'::jsonb,
    'updatedSubmissions', '[]'::jsonb,
    'errors', '[]'::jsonb
  );
  v_error_message text;
begin
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'product.create');
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.create');
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.update');

  if p_parse_result is null or jsonb_typeof(p_parse_result) <> 'object'
    or jsonb_typeof(p_parse_result -> 'products') <> 'array' then
    raise exception '파일 업로드 결과가 올바르지 않습니다.' using errcode = '22023';
  end if;

  for v_product_item in
    select value from jsonb_array_elements(p_parse_result -> 'products') as products(value)
  loop
    v_product_payload := coalesce(v_product_item -> 'payload', '{}'::jsonb);
    v_product_key := nullif(btrim(v_product_item ->> 'clientProductKey'), '');
    v_product_title := coalesce(
      nullif(btrim(v_product_payload ->> 'title'), ''),
      nullif(btrim(v_product_payload ->> 'product_name'), ''),
      v_product_key,
      '상품'
    );

    begin
      perform public.admin_gateway_validate_payload_keys(
        v_product_payload,
        array[
          'title', 'product_name', 'description', 'product_link', 'deposit_date',
          'product_date', 'is_real_shipping', 'company_name', 'option_name',
          'review_type', 'planned_depositor_name', 'deposit_GB'
        ]::text[]
      );

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
        p_actor_admin_id,
        v_product_payload ->> 'title',
        v_product_payload ->> 'product_name',
        v_product_payload ->> 'description',
        v_product_payload ->> 'product_link',
        case when v_product_payload ? 'deposit_date' and jsonb_typeof(v_product_payload -> 'deposit_date') <> 'null'
          then (v_product_payload ->> 'deposit_date')::date else null end,
        case when v_product_payload ? 'product_date' and jsonb_typeof(v_product_payload -> 'product_date') <> 'null'
          then (v_product_payload ->> 'product_date')::date else current_date end,
        coalesce((v_product_payload ->> 'is_real_shipping')::boolean, true),
        v_product_payload ->> 'company_name',
        v_product_payload ->> 'option_name',
        v_product_payload ->> 'review_type',
        v_product_payload ->> 'planned_depositor_name',
        coalesce((v_product_payload ->> 'deposit_GB')::integer, 1),
        null
      )
      returning id into v_product_id;

      update public.products
      set bundle_id = v_product_id
      where id = v_product_id;

      select products.* into v_product
      from public.products as products
      where products.id = v_product_id;

      v_result := jsonb_set(
        v_result,
        '{createdProducts}',
        (v_result -> 'createdProducts') || jsonb_build_array(jsonb_build_object(
          'clientProductKey', v_product_key,
          'sourceRowNumbers', v_product_item -> 'sourceRowNumbers',
          'data', to_jsonb(v_product)
        )),
        true
      );

      if jsonb_typeof(v_product_item -> 'submissions') = 'array' then
        for v_submission_item in
          select value from jsonb_array_elements(v_product_item -> 'submissions') as submissions(value)
        loop
          begin
            v_submission_payload := coalesce(v_submission_item -> 'payload', '{}'::jsonb);
            perform public.admin_gateway_validate_payload_keys(
              v_submission_payload,
              array[
                'product_id', 'assign_name', 'order_number', 'buyer_name', 'recipient_name',
                'purchase_account', 'contact', 'address', 'bank_name', 'bank_account',
                'account_holder', 'amount', 'review_fee', 'is_purchase_verified',
                'is_review_verified', 'is_deposit_verified', 'deposited_at',
                'actual_depositor_name'
              ]::text[]
            );

            select count(*)::integer, min(submissions.id)
            into v_existing_count, v_existing_submission_id
            from public.submissions as submissions
            where nullif(btrim(v_submission_payload ->> 'order_number'), '') is not null
              and submissions.order_number = v_submission_payload ->> 'order_number';

            if v_existing_count > 1 then
              raise exception '주문번호에 해당하는 제출 데이터가 여러 건입니다.' using errcode = '21000';
            elsif v_existing_count = 1 then
              v_saved_submission := public.admin_gateway_update_submission(
                p_actor_admin_id,
                v_existing_submission_id,
                v_submission_payload - 'product_id'
              );
              v_result := jsonb_set(
                v_result,
                '{updatedSubmissions}',
                (v_result -> 'updatedSubmissions') || jsonb_build_array(jsonb_build_object(
                  'sourceRowNumber', v_submission_item -> 'sourceRowNumber',
                  'clientProductKey', v_product_key,
                  'data', v_saved_submission
                )),
                true
              );
            else
              v_saved_submission := public.admin_gateway_insert_submission(
                p_actor_admin_id,
                v_product_id,
                v_submission_payload - 'product_id'
              );
              v_result := jsonb_set(
                v_result,
                '{insertedSubmissions}',
                (v_result -> 'insertedSubmissions') || jsonb_build_array(jsonb_build_object(
                  'sourceRowNumber', v_submission_item -> 'sourceRowNumber',
                  'clientProductKey', v_product_key,
                  'data', v_saved_submission
                )),
                true
              );
            end if;
          exception when others then
            get stacked diagnostics v_error_message = message_text;
            v_result := jsonb_set(
              v_result,
              '{errors}',
              (v_result -> 'errors') || jsonb_build_array(jsonb_build_object(
                'sourceRowNumber', v_submission_item -> 'sourceRowNumber',
                'productTitle', v_product_title,
                'orderNumber', v_submission_item -> 'payload' ->> 'order_number',
                'code', 'SUBMISSION_SAVE_FAILED',
                'message', v_error_message
              )),
              true
            );
          end;
        end loop;
      end if;
    exception when others then
      get stacked diagnostics v_error_message = message_text;
      v_result := jsonb_set(
        v_result,
        '{errors}',
        (v_result -> 'errors') || jsonb_build_array(jsonb_build_object(
          'sourceRowNumber', (v_product_item -> 'sourceRowNumbers' -> 0),
          'productTitle', v_product_title,
          'code', 'PRODUCT_INSERT_FAILED',
          'message', v_error_message
        )),
        true
      );
    end;
  end loop;

  return v_result || jsonb_build_object(
    'partial', jsonb_array_length(v_result -> 'errors') > 0,
    'summary', jsonb_build_object(
      'createdProductCount', jsonb_array_length(v_result -> 'createdProducts'),
      'insertedSubmissionCount', jsonb_array_length(v_result -> 'insertedSubmissions'),
      'updatedSubmissionCount', jsonb_array_length(v_result -> 'updatedSubmissions'),
      'errorCount', jsonb_array_length(v_result -> 'errors')
    )
  );
end;
$function$;

create or replace function public.get_admin_tutorial_progress(
  p_actor_admin_id text,
  p_tutorial_version text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_progress jsonb;
begin
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'personal_setting.read');
  if nullif(btrim(p_tutorial_version), '') is null then
    raise exception '튜토리얼 버전이 필요합니다.' using errcode = '22023';
  end if;

  select to_jsonb(progress_rows)
  into v_progress
  from (
    select
      progress.admin_id,
      progress.tutorial_version,
      progress.status,
      progress.recorded_at
    from public.admin_tutorial_progress as progress
    where progress.admin_id = p_actor_admin_id
      and progress.tutorial_version = p_tutorial_version
  ) as progress_rows;

  return jsonb_build_object(
    'progress', v_progress,
    'scope', public.admin_gateway_scope_json(p_actor_admin_id, array['personal_setting.read']::text[])
  );
end;
$function$;

create or replace function public.save_admin_tutorial_progress(
  p_actor_admin_id text,
  p_tutorial_version text,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_progress jsonb;
begin
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'personal_setting.update');
  if nullif(btrim(p_tutorial_version), '') is null
    or p_status not in ('skipped', 'completed') then
    raise exception '튜토리얼 진행 상태가 올바르지 않습니다.' using errcode = '22023';
  end if;

  insert into public.admin_tutorial_progress (
    admin_id,
    tutorial_version,
    status,
    recorded_at
  )
  values (
    p_actor_admin_id,
    p_tutorial_version,
    p_status,
    now()
  )
  on conflict (admin_id, tutorial_version)
  do update set
    status = excluded.status,
    recorded_at = excluded.recorded_at;

  select to_jsonb(progress_rows)
  into v_progress
  from (
    select
      progress.admin_id,
      progress.tutorial_version,
      progress.status,
      progress.recorded_at
    from public.admin_tutorial_progress as progress
    where progress.admin_id = p_actor_admin_id
      and progress.tutorial_version = p_tutorial_version
  ) as progress_rows;

  return jsonb_build_object(
    'progress', v_progress,
    'scope', public.admin_gateway_scope_json(p_actor_admin_id, array['personal_setting.update']::text[])
  );
end;
$function$;

-- gateway 공개 진입점은 service_role만 실행할 수 있다. Edge Function이 세션
-- principal을 검증한 뒤 호출하며, anon/authenticated의 직접 RPC 호출은 허용하지 않는다.
revoke all on function public.admin_gateway_get_products(text) from public, anon, authenticated;
revoke all on function public.admin_gateway_insert_submission(text, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.admin_gateway_update_submission(text, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.get_admin_review_receive_product_summaries_gateway(text, boolean, text, jsonb, integer, date, bigint) from public, anon, authenticated;
revoke all on function public.get_admin_review_receive_detail(text, bigint) from public, anon, authenticated;
revoke all on function public.create_admin_review_receive_product(text, jsonb) from public, anon, authenticated;
revoke all on function public.update_admin_review_receive_product(text, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.get_admin_product_detail_meta(text, bigint) from public, anon, authenticated;
revoke all on function public.get_admin_product_applications(text, bigint) from public, anon, authenticated;
revoke all on function public.get_admin_product_submissions(text, bigint) from public, anon, authenticated;
revoke all on function public.get_admin_evidence_photos(text, bigint[], text) from public, anon, authenticated;
revoke all on function public.update_admin_application_confirmed(text, bigint, bigint, boolean) from public, anon, authenticated;
revoke all on function public.update_admin_submission_verified(text, bigint, text, boolean) from public, anon, authenticated;
revoke all on function public.set_admin_product_step(text, bigint, integer, boolean) from public, anon, authenticated;
revoke all on function public.get_admin_submission_by_order_number(text, bigint, text) from public, anon, authenticated;
revoke all on function public.create_admin_review_receive_submission(text, jsonb) from public, anon, authenticated;
revoke all on function public.create_admin_submission(text, jsonb) from public, anon, authenticated;
revoke all on function public.update_admin_review_receive_submission(text, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.update_admin_review_receive_submission_status(text, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.get_admin_product_overview_rows_gateway(text, boolean, text, jsonb, integer, timestamptz, bigint, timestamptz, bigint) from public, anon, authenticated;
revoke all on function public.admin_gateway_delete_submission_ids(text, bigint[]) from public, anon, authenticated;
revoke all on function public.admin_gateway_delete_product_ids(text, bigint[]) from public, anon, authenticated;
revoke all on function public.delete_admin_review_receive_submission(text, bigint) from public, anon, authenticated;
revoke all on function public.delete_admin_product_overview_submissions(text, bigint[]) from public, anon, authenticated;
revoke all on function public.delete_admin_submissions_with_evidence_photos(text, bigint[]) from public, anon, authenticated;
revoke all on function public.delete_admin_review_receive_product(text, bigint) from public, anon, authenticated;
revoke all on function public.delete_admin_review_receive_product_bundle(text, bigint) from public, anon, authenticated;
revoke all on function public.delete_admin_products_with_related_data(text, bigint[], bigint[]) from public, anon, authenticated;
revoke all on function public.delete_admin_evidence_photo(text, bigint) from public, anon, authenticated;
revoke all on function public.get_admin_bulk_edit_rows(text, bigint[]) from public, anon, authenticated;
revoke all on function public.apply_admin_bulk_submission_updates_gateway(text, jsonb) from public, anon, authenticated;
revoke all on function public.get_admin_export_data(text, boolean, boolean, boolean, jsonb, bigint, boolean) from public, anon, authenticated;
revoke all on function public.get_admin_photo_export_data(text, boolean, jsonb, bigint) from public, anon, authenticated;
revoke all on function public.get_admin_dashboard_data(text, boolean, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.apply_admin_file_upload(text, jsonb) from public, anon, authenticated;
revoke all on function public.get_admin_tutorial_progress(text, text) from public, anon, authenticated;
revoke all on function public.save_admin_tutorial_progress(text, text, text) from public, anon, authenticated;

grant execute on function public.admin_gateway_get_products(text) to service_role;
grant execute on function public.admin_gateway_insert_submission(text, bigint, jsonb) to service_role;
grant execute on function public.admin_gateway_update_submission(text, bigint, jsonb) to service_role;
grant execute on function public.get_admin_review_receive_product_summaries_gateway(text, boolean, text, jsonb, integer, date, bigint) to service_role;
grant execute on function public.get_admin_review_receive_detail(text, bigint) to service_role;
grant execute on function public.create_admin_review_receive_product(text, jsonb) to service_role;
grant execute on function public.update_admin_review_receive_product(text, bigint, jsonb) to service_role;
grant execute on function public.get_admin_product_detail_meta(text, bigint) to service_role;
grant execute on function public.get_admin_product_applications(text, bigint) to service_role;
grant execute on function public.get_admin_product_submissions(text, bigint) to service_role;
grant execute on function public.get_admin_evidence_photos(text, bigint[], text) to service_role;
grant execute on function public.update_admin_application_confirmed(text, bigint, bigint, boolean) to service_role;
grant execute on function public.update_admin_submission_verified(text, bigint, text, boolean) to service_role;
grant execute on function public.set_admin_product_step(text, bigint, integer, boolean) to service_role;
grant execute on function public.get_admin_submission_by_order_number(text, bigint, text) to service_role;
grant execute on function public.create_admin_review_receive_submission(text, jsonb) to service_role;
grant execute on function public.create_admin_submission(text, jsonb) to service_role;
grant execute on function public.update_admin_review_receive_submission(text, bigint, jsonb) to service_role;
grant execute on function public.update_admin_review_receive_submission_status(text, bigint, jsonb) to service_role;
grant execute on function public.get_admin_product_overview_rows_gateway(text, boolean, text, jsonb, integer, timestamptz, bigint, timestamptz, bigint) to service_role;
grant execute on function public.admin_gateway_delete_submission_ids(text, bigint[]) to service_role;
grant execute on function public.admin_gateway_delete_product_ids(text, bigint[]) to service_role;
grant execute on function public.delete_admin_review_receive_submission(text, bigint) to service_role;
grant execute on function public.delete_admin_product_overview_submissions(text, bigint[]) to service_role;
grant execute on function public.delete_admin_submissions_with_evidence_photos(text, bigint[]) to service_role;
grant execute on function public.delete_admin_review_receive_product(text, bigint) to service_role;
grant execute on function public.delete_admin_review_receive_product_bundle(text, bigint) to service_role;
grant execute on function public.delete_admin_products_with_related_data(text, bigint[], bigint[]) to service_role;
grant execute on function public.delete_admin_evidence_photo(text, bigint) to service_role;
grant execute on function public.get_admin_bulk_edit_rows(text, bigint[]) to service_role;
grant execute on function public.apply_admin_bulk_submission_updates_gateway(text, jsonb) to service_role;
grant execute on function public.get_admin_export_data(text, boolean, boolean, boolean, jsonb, bigint, boolean) to service_role;
grant execute on function public.get_admin_photo_export_data(text, boolean, jsonb, bigint) to service_role;
grant execute on function public.get_admin_dashboard_data(text, boolean, jsonb, jsonb) to service_role;
grant execute on function public.apply_admin_file_upload(text, jsonb) to service_role;
grant execute on function public.get_admin_tutorial_progress(text, text) to service_role;
grant execute on function public.save_admin_tutorial_progress(text, text, text) to service_role;
