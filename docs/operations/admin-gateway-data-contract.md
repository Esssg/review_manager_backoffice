# 관리자 gateway 데이터 계약 (로컬 초안)

상태: 로컬 구현·계약 초안과 부분 운영 반영 상태. staging `vm-app-01`에는 2026-08-29 다섯 migration과 `admin-gateway` Edge Function을 적용·검증했고, `vm-web-01`에는 Kong의 공유 wildcard CORS를 피하는 same-origin 웹 proxy 포함 이미지를 배포·검증했다. `hyejin2054` 인증 read/write canary에서 주요 관리자 화면·mutation과 gateway-only 네트워크를 확인하고 canary row 정리까지 완료했으며, 저장소 기본값은 `READY=false`, staging canary만 `READY=true`다. production에는 nested action path 1·2차 수정과 상품/리뷰어 일괄입력 bundle 계약 후속 RPC를 적용하고, 해당 수정이 포함된 backoffice app 이미지를 app-only로 배포했다. DB 백업·RPC ACL·웹 health/gateway 비인증 검증은 통과했으며, production 전체 C4 전환·RLS·공개 사진 흐름은 아직 반영하지 않았다.

## 활성화 게이트

클라이언트는 다음 세 값이 모두 준비되어 있을 때만 gateway 데이터 경로를 선택한다.

- `VITE_ADMIN_GATEWAY_ENABLED=true`
- `VITE_ADMIN_GATEWAY_READY=true`
- `VITE_ADMIN_GATEWAY_URL`의 유효한 URL

현재 저장소의 기본값은 gateway 미활성 상태다. `supabase/migrations/20260829120000_add_admin_gateway_data_rpcs.sql`, Q49 backfill 초안 `supabase/migrations/20260829150000_backfill_admin_resource_permission_bindings.sql`, read 최적화 초안 `supabase/migrations/20260829180000_optimize_admin_gateway_read_rpcs.sql`, export 최적화 초안 `supabase/migrations/20260829200000_optimize_admin_gateway_export_read_rpcs.sql`은 staging `vm-app-01`에 적용해 실제 PostgreSQL/read 계약을 검증했고, `admin-gateway` 함수도 staging에 배포했다. production 사전 점검에서 대응 객체가 이미 존재해 이 다섯 migration은 재실행하지 않았다. production에는 별도 승인된 nested action path 호환 수정과 `20260829220000_fix_admin_review_receive_product_bundle_contract.sql` 후속 migration만 적용했으며, 공유 Kong CORS의 wildcard 응답을 피하기 위해 self-hosted 웹은 `/api/admin-gateway` same-origin proxy를 사용한다. 저장소 기본값은 `READY=false`이며 staging canary 이미지에서만 `READY=true`다. 대응 RPC가 없으면 Edge Function은 `ADMIN_SCHEMA_NOT_READY`를 반환한다.

## 요청·신원 규칙

브라우저 요청은 `POST /data`에 `{ operation, payload }`만 보낸다. operation은 Edge Function의 고정 allowlist에서 다시 확인한다.

- 브라우저 localStorage의 `adminId`, `p_admin_id`, `manager_id` 등은 신원·scope 근거가 아니다.
- Edge Function은 signed `httpOnly` session cookie의 `sub`를 actor로 사용하고, payload 안의 관리자 식별자 필드를 재귀적으로 제거한다.
- Edge Function은 `get_admin_access_bundle`로 operation 최소 권한을 재검사한다.
- 실제 회사·관리자 범위, 대상 resource 소유권, 필드별 action 권한은 데이터 RPC가 actor를 기준으로 다시 계산한다.
- unknown operation, binding 미부여, 비활성 계정, 범위 밖 resource는 기본 거부한다.

## Operation allowlist

아래 `필수 권한`은 모두 충족해야 한다. 범위(`personal`, `company`, `all`)는 권한 binding에서 읽되, RPC가 대상 행에 대해 다시 적용한다.

| Operation | RPC | 필수 권한 |
| --- | --- | --- |
| `products.list` | `admin_gateway_get_products` | `product.read` |
| `review_receive.list` | `get_admin_review_receive_product_summaries_gateway` | `product.read`, `submission.read` |
| `review_receive.detail` | `get_admin_review_receive_detail` | `product.read`, `submission.read` |
| `review_receive.product.create` | `create_admin_review_receive_product` | `product.create` |
| `review_receive.product.update` | `update_admin_review_receive_product` | `product.update` |
| `review_receive.product.delete` | `delete_admin_review_receive_product` | `product.delete`, `submission.delete`, `submission.photo.delete`, `application.delete`, `product_step.delete` |
| `review_receive.product_bundle.delete` | `delete_admin_review_receive_product_bundle` | `product.delete`, `submission.delete`, `submission.photo.delete`, `application.delete`, `product_step.delete` |
| `review_receive.submission.status` | `update_admin_review_receive_submission_status` | `submission.update` |
| `review_receive.photos` | `get_admin_evidence_photos` | `submission.photo.read` |
| `review_receive.submission.create` | `create_admin_review_receive_submission` | `submission.create` |
| `review_receive.submission.update` | `update_admin_review_receive_submission` | `submission.update` |
| `review_receive.submission.delete` | `delete_admin_review_receive_submission` | `submission.delete`, `submission.photo.delete` |
| `product_detail.meta` | `get_admin_product_detail_meta` | `product.read`, `product_step.read` |
| `product_detail.applications` | `get_admin_product_applications` | `application.read` |
| `product_detail.submissions` | `get_admin_product_submissions` | `submission.read` |
| `product_detail.photos` | `get_admin_evidence_photos` | `submission.photo.read` |
| `product_detail.application.confirm` | `update_admin_application_confirmed` | `application.confirm` |
| `product_detail.submission.verify` | `update_admin_submission_verified` | `submission.update` + target별 권한 |
| `product_detail.step.set` | `set_admin_product_step` | `product_step.update` |
| `product_detail.submission.by_order` | `get_admin_submission_by_order_number` | `submission.read` |
| `product_detail.submission.create` | `create_admin_submission` | `submission.create` |
| `product_overview.list` | `get_admin_product_overview_rows_gateway` | `product.read`, `submission.read` |
| `product_overview.submissions.delete` | `delete_admin_product_overview_submissions` | `submission.delete`, `submission.photo.delete` |
| `dashboard.read` | `get_admin_dashboard_data` | `menu.dashboard` + RPC resource 범위 |
| `export.read` | `get_admin_export_data` | `export.execute` |
| `export.photos.read` | `get_admin_photo_export_data` | `export.execute`, `submission.photo.read` |
| `file_upload.apply` | `apply_admin_file_upload` | `product.create`, `submission.create`, `submission.update` |
| `bulk_edit.rows` | `get_admin_bulk_edit_rows` | `bulk_edit.execute`, `submission.read` |
| `bulk_edit.apply` | `apply_admin_bulk_submission_updates_gateway` | `bulk_edit.execute`, `submission.update` |
| `evidence.photo.delete` | `delete_admin_evidence_photo` | `submission.photo.delete` |
| `deletion.submissions_with_photos` | `delete_admin_submissions_with_evidence_photos` | `submission.delete`, `submission.photo.delete` |
| `deletion.products_with_related_data` | `delete_admin_products_with_related_data` | `product.delete`, `submission.delete`, `submission.photo.delete`, `application.delete`, `product_step.delete` |
| `tutorial.read` | `get_admin_tutorial_progress` | `personal_setting.read` |
| `tutorial.save` | `save_admin_tutorial_progress` | `personal_setting.update` |

## DB RPC가 반드시 재검사할 항목

`20260829120000_add_admin_gateway_data_rpcs.sql`은 access bundle 이후에 적용할 로컬 additive 초안이며 staging에서 실제 실행·검증했다. 기존 legacy RPC 시그니처는 건드리지 않고, gateway 전용 RPC가 명시된 컬럼·입력·반환 shape와 공통 actor/scope 검사를 사용한다. resource-action binding은 별도 `20260829150000_backfill_admin_resource_permission_bindings.sql`이 기존 `admin_menu_permissions` 행과 `admins`의 활성/역할/capability에서 계정별로 산출한다. `20260829180000_optimize_admin_gateway_read_rpcs.sql`은 dashboard/review/products read RPC의 manager scope 계산을, `20260829200000_optimize_admin_gateway_export_read_rpcs.sql`은 export/photo export RPC의 manager scope 계산을 요청당 한 번으로 줄인다. 이 backfill은 기존 명시 admin binding을 덮어쓰지 않고, 비활성 계정을 제외한다. staging 적용 결과를 운영 Q49 snapshot과 다시 대조하기 전에는 운영에 적용하지 않는다. 각 RPC는 다음 규칙을 지킨다.

1. RPC는 `p_actor_admin_id` 또는 호환용 `p_admin_id`를 actor로 받고, 활성 `admins.login_id`와 일치하는지 확인한다. 브라우저가 보낸 payload의 identity 필드는 사용하지 않는다.
2. actor의 role/company와 permission binding을 서버에서 해석한다. 더 구체적인 admin → role → company → global 순서, 같은 우선순위의 deny 우선 규칙을 공통 helper로 사용한다.
3. `data_scope`에 따라 대상 product의 `manager_id`, submission의 product, application의 product, evidence photo의 submission을 확인한다. 클라이언트가 보내는 `managerIds`나 `includeCompanyData`만으로 범위를 확장하지 않는다.
4. `submission.deposit.verify`와 `submission.depositor_name.update`, `submission.photo.read/delete`, `product_step.*`, `application.confirm`은 일반 `submission.update`나 메뉴 권한만으로 대체하지 않는다.
5. bulk·upload·삭제 RPC는 입력 ID를 다시 조회하고 권한 없는 대상이 섞이면 전체 거부 또는 명시된 partial 결과만 반환한다. 삭제는 증빙 사진과 관련 데이터의 처리 결과, 실패 대상, rollback 불가 여부를 기존 deletion contract와 같은 형태로 반환한다.
6. `security definer`를 사용할 경우 `search_path`를 `public` 등 고정 값으로 제한하고, 함수 execute 권한은 gateway가 사용하는 service role 경로에만 부여한다. 일반 `anon`/`authenticated`에는 직접 execute를 부여하지 않는다.
7. RPC 반환 shape는 기존 서비스 contract를 유지한다. 목록은 배열 또는 `{ rows/products/submissions/evidencePhotos, pageInfo, scope }`, mutation은 기존 `data` shape와 partial deletion 필드를 유지한다.

## 로컬 RPC 초안의 리소스 검사

현재 초안은 다음을 서버 함수 안에서 검사하도록 구성했다.

- product는 actor의 `product.*` scope와 `products.manager_id`, submission은 연결된 product, application은 연결된 product, evidence photo는 연결된 submission을 다시 확인한다.
- 생성·수정 payload는 허용 컬럼 목록으로 제한하고, `product_id`/actor/manager 식별자를 payload 권한 근거로 사용하지 않는다.
- 입금 확인·입금일은 `submission.deposit.verify`와 `admins.can_verify_deposit`, 실제 입금자명은 `submission.depositor_name.update`를 별도로 검사한다.
- product step, application confirm, photo 조회/삭제는 각각의 action을 검사한다. bulk 수정은 모든 대상 ID를 먼저 검사하고, 상품/제출 삭제는 사진 → 제출 → 관련 신청자/단계 → 상품 순서의 한 transaction으로 처리한다.
- 파일 업로드는 서버가 새 product의 담당자를 actor로 고정하고, 제출 order number 중복/수정 범위를 다시 확인한다. 행별 오류는 명시적인 `partial` 결과로만 반환한다.

Q49 backfill 초안은 메뉴 1~7을 현재 화면의 resource-action으로 확장하되, role-wide 운영 권한을 새로 만들지 않고 active `admin_menu_permissions` 행에만 admin binding을 만든다. developer/company_admin/employee의 범위는 각각 `all`/`company`/`personal`로 계산하며, `can_verify_deposit=false`이면 `submission.deposit.verify`와 `submission.depositor_name.update`에 explicit deny를 추가한다.

위 함수들은 모두 `security definer`, 고정 `search_path = pg_catalog, public`, `service_role` 전용 execute 권한을 사용하도록 초안에 기록되어 있다. staging에서 SQL 구문·권한·반환 결과를 검증했고, production에는 아래 bundle 후속 RPC만 별도 적용했다. 운영 전체 DB 전환과 RLS 적용 전에는 운영 snapshot 대조와 별도 승인 절차가 남아 있다.

상품/리뷰어 일괄입력 후속 계약은 `20260829220000_fix_admin_review_receive_product_bundle_contract.sql`에 정의한다. 상품 수정 RPC는 관계 필드 `bundle_id`를 허용하지 않고, 상품 생성 RPC만 입력된 묶음 대상 상품을 canonical anchor로 해석한 뒤 actor의 `product.create` scope를 검증하고 연결한다. 이 migration은 production `vm-app-01`에서 DB custom dump와 원본 함수 정의를 백업한 뒤 단일 transaction으로 적용했으며, `service_role`만 execute 가능하고 `public`/`anon`/`authenticated`에는 execute 권한이 없음을 확인했다.

## 오류·전환 기준

- 세션 없음/만료: `ADMIN_SESSION_REQUIRED` 또는 `ADMIN_SESSION_EXPIRED` (401)
- operation 미허용 또는 입력 오류: `ADMIN_DATA_OPERATION_INVALID` (400)
- binding 또는 resource 권한 없음: `ADMIN_DATA_PERMISSION_DENIED` (403)
- 대응 RPC·schema 미준비: `ADMIN_SCHEMA_NOT_READY` (503)
- 그 밖의 RPC 실패: `ADMIN_DATA_OPERATION_FAILED` (400)

`settings/update`와 `permissions/update`는 nested gateway action이다. 클라이언트는
경로 구분자(`/`)를 보존한 segment 단위 인코딩을 사용하고, Edge Function은 기존
번들이 보낸 `permissions%2Fupdate` 같은 전체 action 인코딩도 decode한 뒤 allowlist를
판정한다. 이 호환 처리가 없으면 임직원 권한 저장이 `지원하지 않는 gateway 작업입니다.`
오류로 404가 된다. 1차 decode 수정과 `permissions/update` 두-segment 분기 보완은
각각 로컬 테스트/build와 원격 파일 해시 대조 후 production `vm-app-01`에 배포·컨테이너
재생성했다. encoded/unencoded 운영 smoke는 unsupported-action 404가 사라지고
`ADMIN_SESSION_REQUIRED` 401로 반환됐으며, Codex 브라우저 컨텍스트에 운영 httpOnly
세션 쿠키가 없어 실제 permission write는 실행하지 않았다.

상품/리뷰어 일괄입력에서 상품 수정 payload에 `bundle_id`가 포함되어 `ADMIN_DATA_OPERATION_INVALID`가 발생하던 문제는 위 RPC 계약과 웹 adapter 수정으로 보완했다. production 웹 app 이미지 build의 테스트 84/84·Vite build와 `/healthz` 200을 확인했으나, 현재 브라우저 세션이 만료되어 실제 등록 canary는 재로그인 후 수행해야 한다.

기존 direct Supabase 경로는 canary와 rollback 검증이 끝날 때까지 보존한다. staging migration/RPC/read/export 계약과 `admin-gateway` 런타임 경계, same-origin 웹 proxy 이미지의 비인증 smoke 및 hyejin2054 인증 read/write canary는 2026-08-29 완료했고, Kong wildcard CORS 때문에 직접 cross-origin gateway 호출은 사용하지 않는다. production에는 bundle 계약 후속 RPC와 해당 웹 수정만 반영했으며, 전체 운영 전환·RLS·공개 사진 흐름은 남아 있다. 전체 전환 시에는 운영 additive migration → 운영 RPC/RLS 테스트 → Edge Function 배포 → same-origin 웹 proxy/새 이미지 → staging smoke 재확인 → 제한 계정 read/write canary → `VITE_ADMIN_GATEWAY_READY` 활성화 순서로 진행한다. 문제 발생 시 `READY=false`로 되돌려 클라이언트의 legacy 경로를 복구하고, 운영 DB/RPC를 임의로 삭제하지 않는다.
