-- Q49 현행 resource-action 권한 backfill 초안
--
-- 이 migration은 운영/staging DB에 아직 적용하지 않았다. Q49의 “현행 동작과
-- 동일하게 유지” 원칙에 따라 현재 admin_menu_permissions 행에서 계정별
-- resource-action binding을 산출한다. 역할 전체에 운영 권한을 일괄 허용하지
-- 않으며, 이미 존재하는 명시적 admin binding은 덮어쓰지 않는다.
--
-- 선행 조건:
--   20260828190000_add_normalized_admin_access_control.sql
--   20260829120000_add_admin_gateway_data_rpcs.sql
--
-- 적용 전에는 실제 menu row/capability/role/company snapshot을 별도로 저장하고,
-- 적용 후 binding count·계정별 matrix·gateway RPC 결과를 비교해야 한다.

-- 메뉴에서 현재 화면이 실제로 사용하는 resource-action으로만 확장한다.
-- menu 1/5/7의 read 권한은 해당 화면의 gateway RPC가 필요한 하위 resource
-- 조회를 수행하기 때문에 포함한다. menu 6은 기존 파일 업로드 화면의
-- product.create/submission.create/submission.update 계약을 보존한다.
with menu_action_map(menu_number, permission_code) as (
  values
    -- 대시보드
    (1, 'product.read'),
    (1, 'submission.read'),

    -- 상품/상품 상세
    (2, 'product.read'),
    (2, 'product.create'),
    (2, 'product.update'),
    (2, 'product.delete'),
    (2, 'product_step.read'),
    (2, 'product_step.create'),
    (2, 'product_step.update'),
    (2, 'product_step.delete'),
    (2, 'application.read'),
    (2, 'application.create'),
    (2, 'application.update'),
    (2, 'application.delete'),
    (2, 'application.confirm'),
    (2, 'submission.read'),
    (2, 'submission.create'),
    (2, 'submission.update'),
    (2, 'submission.delete'),
    (2, 'submission.deposit.verify'),
    (2, 'submission.depositor_name.update'),
    (2, 'submission.photo.read'),
    (2, 'submission.photo.upload'),
    (2, 'submission.photo.delete'),

    -- 리뷰받기 목록/상세
    (3, 'product.read'),
    (3, 'product.create'),
    (3, 'product.update'),
    (3, 'product.delete'),
    (3, 'submission.read'),
    (3, 'submission.create'),
    (3, 'submission.update'),
    (3, 'submission.delete'),
    (3, 'submission.deposit.verify'),
    (3, 'submission.depositor_name.update'),
    (3, 'submission.photo.read'),
    (3, 'submission.photo.upload'),
    (3, 'submission.photo.delete'),
    (3, 'application.delete'),
    (3, 'product_step.delete'),
    (3, 'export.execute'),

    -- 상품전체보기
    (4, 'product.read'),
    (4, 'submission.read'),
    (4, 'submission.create'),
    (4, 'submission.update'),
    (4, 'submission.delete'),
    (4, 'submission.deposit.verify'),
    (4, 'submission.depositor_name.update'),
    (4, 'submission.photo.read'),
    (4, 'submission.photo.upload'),
    (4, 'submission.photo.delete'),
    (4, 'export.execute'),

    -- 내보내기: export RPC의 선택 데이터까지 읽을 수 있는 기존 경계
    (5, 'export.execute'),
    (5, 'product.read'),
    (5, 'submission.read'),
    (5, 'application.read'),
    (5, 'submission.photo.read'),

    -- 파일 업로드
    (6, 'product.create'),
    (6, 'submission.create'),
    (6, 'submission.update'),

    -- 일괄수정: 현재 화면의 조회/수정/내보내기/입금 관련 action
    (7, 'bulk_edit.execute'),
    (7, 'product.read'),
    (7, 'submission.read'),
    (7, 'submission.update'),
    (7, 'submission.deposit.verify'),
    (7, 'submission.depositor_name.update'),
    (7, 'export.execute')
), active_admins as (
  select
    admins.login_id,
    case lower(coalesce(admins.role, ''))
      when 'developer' then 'all'
      when 'company_admin' then 'company'
      else 'personal'
    end as data_scope
  from public.admins as admins
  where coalesce(admins.is_active, true) = true
), candidate_bindings as (
  select distinct
    'admin'::text as subject_type,
    active_admins.login_id as subject_id,
    menu_action_map.permission_code,
    'allow'::text as effect,
    active_admins.data_scope,
    0::integer as priority
  from active_admins
  join public.admin_menu_permissions as menu_permissions
    on menu_permissions.admin_id = active_admins.login_id
  join menu_action_map
    on menu_action_map.menu_number = menu_permissions.menu_number
  join public.permission_definitions as definitions
    on definitions.code = menu_action_map.permission_code
  where not exists (
    select 1
    from public.permission_bindings as existing
    where existing.subject_type = 'admin'
      and existing.subject_id = active_admins.login_id
      and existing.permission_code = menu_action_map.permission_code
  )
)
insert into public.permission_bindings (
  subject_type,
  subject_id,
  permission_code,
  effect,
  data_scope,
  priority
)
select
  candidate_bindings.subject_type,
  candidate_bindings.subject_id,
  candidate_bindings.permission_code,
  candidate_bindings.effect,
  candidate_bindings.data_scope,
  candidate_bindings.priority
from candidate_bindings
on conflict (subject_type, subject_id, permission_code, effect, data_scope) do nothing;

-- legacy admins.can_verify_deposit=false를 gateway의 explicit deny로 고정한다.
-- 기존 deny는 유지하고, allow가 있더라도 같은 priority의 deny를 추가해
-- gateway/RPC의 deny 우선 규칙이 capability 예외를 동일하게 반영하게 한다.
with restricted_permissions(permission_code) as (
  values
    ('submission.deposit.verify'::text),
    ('submission.depositor_name.update'::text)
)
insert into public.permission_bindings (
  subject_type,
  subject_id,
  permission_code,
  effect,
  data_scope,
  priority
)
select
  'admin',
  admins.login_id,
  restricted_permissions.permission_code,
  'deny',
  'personal',
  0
from public.admins as admins
cross join restricted_permissions
join public.permission_definitions as definitions
  on definitions.code = restricted_permissions.permission_code
where coalesce(admins.is_active, true) = true
  and coalesce(admins.can_verify_deposit, true) = false
  and not exists (
    select 1
    from public.permission_bindings as existing
    where existing.subject_type = 'admin'
      and existing.subject_id = admins.login_id
      and existing.permission_code = restricted_permissions.permission_code
      and existing.effect = 'deny'
  )
on conflict (subject_type, subject_id, permission_code, effect, data_scope) do nothing;

-- 이 migration은 insert만 수행하며 기존 메뉴/capability/RPC/data를 삭제·변경하지 않는다.
