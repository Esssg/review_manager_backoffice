# Codex 인수인계 문서

이 파일은 새 Codex 세션이 이전 대화 없이도 현재 작업 상태와 안전 조건을 이해하기 위한 문서다.
최종 기준은 이 파일, `plans.md`, 그리고 실제 코드·`git diff`다.

## 1. 작업 목표

회사별 관리자/임직원 구조와 계층형 메뉴·기능 권한, DB 기반 설정값, 상품 생성 기본값,
예정입금자명 회사명 자르기 설정을 도입한다. 하드코딩된 권한·설정 의존을 단계적으로 제거하되,
기존 운영 웹의 동작을 깨뜨리지 않는 것이 최우선이다.

상세 요구사항과 사용자가 확정한 선택지는 `plans.md`의 질문/Answer 및 구현 계획을 기준으로 한다.

## 2. 절대 지켜야 할 운영 경계

- 운영 DB에는 전체 C4 migration을 재실행하거나 RLS를 적용하지 않았다. production `vm-app-01`의 사전 점검에서 핵심 C4 테이블/RPC가 이미 존재하는 사실을 확인해 다섯 migration은 재실행하지 않았고, 이번 오류에 필요한 후속 bundle 계약 migration만 별도 백업·검증 후 적용했다.
- production `vm-app-01`에는 `20260829220000_fix_admin_review_receive_product_bundle_contract.sql`을 적용했고, production `vm-web-01`에는 대상 source만 교체한 `review-manager-backoffice:local` 새 이미지를 app-only로 배포했다. 기존 source archive와 rollback image tag를 보존했으며 Docker/Nginx 설정, CI/CD, RLS는 변경하지 않았다. 승인된 staging의 DB/Edge Function/canary와 production `admin-gateway` nested action path 1·2차 수정 이력은 그대로 유지한다.
- `supabase/migrations/20260828190000_add_normalized_admin_access_control.sql`, `20260829120000_add_admin_gateway_data_rpcs.sql`, `20260829150000_backfill_admin_resource_permission_bindings.sql`, `20260829180000_optimize_admin_gateway_read_rpcs.sql`, `20260829200000_optimize_admin_gateway_export_read_rpcs.sql`은 staging에 적용·검증한 초안이다. production 사전 점검에서 대응 객체가 이미 존재했지만 적용 이력은 별도 확정하지 않아, 이번 작업에서는 재실행하지 않았다.
- `supabase/migrations/20260829220000_fix_admin_review_receive_product_bundle_contract.sql`은 staging에는 적용하지 않았고 production에는 2026-08-29 백업 후 적용했다. 상품 수정에서는 `bundle_id`를 허용하지 않고, 상품 생성에서만 묶음 대상 actor 범위를 검사한다.
- `supabase/functions/admin-gateway/index.ts`는 로컬 원본이며 staging `vm-app-01`에 배포·검증했다. production `vm-app-01`에는 2026-08-29 nested action path 1·2차 호환 수정본을 배포했고, 2차 파일 해시는 `90f935484438bdffe83284c8a3d4d1ee696df9ba123fca662265c11ca3d954c7`다. 원본 및 1차 수정본 백업도 별도 경로에 보존했다.
- 운영 DB 변경, 운영 웹 배포, Edge Function 배포, RLS 적용, CI/CD 실행은 사용자의 명시적 승인을 받은 뒤에만 한다.
- 승인 요청 시 대상 환경, 실행할 정확한 명령/SQL, 영향 범위, 기존 웹 호환성, 롤백 방법을 먼저 설명한다.
- `supabase db push`, 원격 SQL 실행, 프로덕션 배포 명령을 확인 없이 실행하지 않는다.
- 기존 변경사항을 `git reset --hard`, `git checkout --`, 대량 삭제로 덮어쓰지 않는다.

## 3. 현재 구현된 로컬 변경

- 권한 상수·리졸버: `src/constants/adminAccess.ts`, `src/utils/permissionResolver.ts`
- 설정 리졸버/검증: `src/utils/settingsResolver.ts`
- 예정입금자명 회사명 자르기: `src/utils/plannedDepositorName.ts`
- 게이트웨이 클라이언트: `src/services/adminGateway.ts`
- 관리자 데이터 gateway operation 계약/어댑터: `src/services/adminGatewayData.ts`, `docs/operations/admin-gateway-data-contract.md`
- 관리자 접근 번들/멤버/설정 서비스: `src/services/adminAccess.ts`, `src/services/adminMembers.ts`, `src/services/adminSettings.ts`
- 로그인·레이아웃·권한 상태: `src/services/adminAuth.ts`, `src/hooks/useAdminCapabilities.ts`, `src/components/layout/AdminLayout.tsx`
- 관리자 설정 화면 및 멤버 권한 화면: `src/pages/admin/AdminSettingPage.tsx`, `src/pages/admin/AdminMemberAccessPage.tsx`, `src/App.tsx`
- 상품/리뷰 등록 기본값과 입금 권한 리졸버 연동: 관련 `AdminReviewReceive*`, `AdminProductOverviewPage`, `AdminBulkEditPage`
- 계정별 export 저장 키와 개발자 전체 회사 범위: `src/constants/admin.ts`, `src/hooks/useExportColumnSelection.ts`, `src/constants/adminScope.ts`, `src/services/adminScope.ts`
- 관리자 데이터 서비스 gateway-first 전환: `adminProducts`, `productOverview`, `productDetail`, `reviewReceive`, `bulkEdit`, `fileUpload`, `exportData`, `exportPhotos`, `dashboardMetrics`, `adminDeletion`, `evidencePhotos`, `adminTutorial`
- 화면 action 권한 검사: `src/utils/adminActionAccess.ts`, `src/hooks/useAdminPermission.ts` 및 리뷰받기·상품 상세·상품전체보기·일괄수정·파일 업로드·export 화면
- gateway contract 회귀 테스트: `tests/adminGatewayData.test.js`에서 operation 형식·중첩 client identity 제거·서버 계산 scope를, `tests/adminGatewaySqlContract.test.js`에서 Edge RPC 대응·service-role 전용 execute·고정 search path를 고정한다.
- 상품/리뷰어 일괄 입력의 묶음 계약 보완: 기존 품목 수정 gateway payload에서는 `bundle_id`를 제거하고, 신규 상품 생성 RPC에서는 묶음 대상 상품의 actor 범위를 검증한 뒤 `bundle_id`를 연결하도록 `20260829220000_fix_admin_review_receive_product_bundle_contract.sql`을 추가했다. 일괄 저장 오류는 가능한 경우 실제 오류 메시지도 표시한다.
- 선택적 게이트웨이 환경변수: `.env.example`만 수정했다. 실제 `.env`의 비밀값은 공개하거나 커밋하지 않는다.
- 정규화 DB/RPC 초안: `supabase/migrations/20260828190000_add_normalized_admin_access_control.sql`
- gateway 데이터 RPC 초안: `supabase/migrations/20260829120000_add_admin_gateway_data_rpcs.sql` (legacy RPC 시그니처를 변경하지 않는 additive 초안)
- Q49 resource-action binding backfill 초안: `supabase/migrations/20260829150000_backfill_admin_resource_permission_bindings.sql` (기존 메뉴 행·capability에서 계정별로 산출하며 staging 적용·운영 미적용)
- 게이트웨이 Edge Function 원본: `supabase/functions/admin-gateway/index.ts` (staging 배포·경계 검증 완료, production에 nested action path 1·2차 수정 배포 완료)

게이트웨이는 다음 세 값이 모두 준비될 때만 활성화된다.

```text
VITE_ADMIN_GATEWAY_ENABLED=true
VITE_ADMIN_GATEWAY_READY=true
VITE_ADMIN_GATEWAY_URL=<gateway-url>
```

저장소 기본값은 `READY=false`로 유지한다. 승인된 staging 웹 이미지만 `READY=true`로 인증 read/write canary 중이며,
공개 사진 흐름·RLS·production 전환이 끝나기 전에는 production에서 이 값을 켜지 않는다.

## 4. 아직 남은 핵심 작업

`plans.md`의 C4 로컬 구현은 진행되었고 서비스 adapter·UI 권한 검사·gateway operation allowlist·resource scope/action 검사 초안이 연결되었다. 대응 RPC와 Q49 계정별 resource-action binding backfill, read RPC 최적화, `admin-gateway` 함수 및 same-origin 웹 proxy/backoffice 이미지는 staging에 적용했다. `hyejin2054`의 인증 read/write canary로 주요 목록·대시보드·export, 상품·제출 생성/수정/상태 변경/삭제·일괄수정과 gateway-only 네트워크를 검증하고 canary row 정리까지 확인했다. production에는 Edge Function nested action path 1·2차 수정, bundle 계약용 DB RPC 후속 migration, 해당 오류를 수정한 app-only 웹 이미지 배포를 완료했다. 비파괴 health/gateway 검증은 통과했지만, 현재 Codex 브라우저 세션이 `/api/admin-gateway/access` 401로 만료되어 실제 운영 일괄입력 저장 canary는 재로그인 후 확인해야 한다. production RLS·전체 C4 전환과 공개 사진 흐름은 남아 있다.

1. staging에서 검증한 Q49 권한 스냅샷·메뉴→action 매핑·RPC 반환 계약을 운영 적용 전 다시 대조하고, 운영 migration/RPC 적용은 별도 승인 후 진행한다.
   대상에는 상품, 리뷰받기, 상세/대량수정, 파일 업로드, export, 대시보드, 삭제, 증빙 사진 등이 포함된다.
2. 메뉴 권한뿐 아니라 각 리소스의 create/read/update/delete/upload/export/bulk 동작에 권한 검사를 일관되게 적용한다.
3. 개발자(company 전체)와 회사 관리자(같은 회사 임직원) 범위의 설정/멤버 관리 UI를 완성한다.
4. 관리자 설정/멤버 권한 저장 시 오류·중복 제출·초기화·직접 URL 접근을 검증한다.
5. 현재 레거시 fallback이 필요한 지점을 목록화하고, 게이트웨이 안정화 전까지 제거하지 않는다.
6. SQL은 로컬에서 구문/계약을 검토하되 원격 실행은 별도 승인 후에만 한다.
7. Edge Function 초안의 `/data` endpoint는 session principal과 `get_admin_access_bundle`의 explicit action binding을 operation 진입점에서 재검사한다. gateway RPC 초안에는 resource/field scope 검사와 service-role 전용 execute 권한이 추가되어 있고 staging에서 검증했다. production에는 이번 bundle 계약 후속 RPC만 추가 적용했으며, RLS와 전체 C4 전환은 별도 단계다.

## 5. DB/권한 설계 요약

- 역할: `developer`, `company_admin`, `employee`
- 기본 계정: `2sssg` 개발자, `hyejin2054` 시나브로 회사 관리자, 시나브로 나머지 임직원,
  한화시스템/테스트커머스 계정은 개발자용 테스트 또는 관리자 취급
- 개발자: 모든 회사 데이터와 계정 권한 관리
- 회사 관리자: 같은 회사 임직원 권한 관리
- 임직원: 자신의 개인 설정만 관리
- 권한 우선순위: global < company < role < admin; 같은 단계에서는 명시적 deny가 우선
- 데이터 범위: personal/company/all
- 설정 해석 순서: company → role → admin/current override
- 회사명 자르기: Unicode 기준 0은 전체 표시, 1~100은 앞 글자 수
- 기존 예정입금자명 값은 수정하지 않고 새로 생성할 때만 기본 설정을 적용

정규화 테이블과 전체 C4 RPC는 staging에서 적용·검증했고 production에서는 대응 객체가 이미 존재해 재실행하지 않았다. 다만 상품/리뷰어 일괄입력 오류를 위한 bundle 계약 후속 RPC는 production에 별도 적용했다. RLS는 게이트웨이 전환과 호환성 검증이 끝난 뒤 별도 단계에서만 검토한다.

## 6. 검증 현황

- `npm test`: 85개 테스트 통과
- `npm run build`: 통과. 큰 청크 경고는 있으나 기존 경고 범위다.
- `git diff --check`: 통과
- `node --experimental-strip-types --check supabase/functions/admin-gateway/index.ts`: 통과
- `node tests/adminGatewaySqlContract.test.js`: 4개 SQL/Edge 계약 검사 통과 (`npm test`에도 포함)
- `node tests/adminPermissionBackfillSqlContract.test.js`: 4개 Q49 backfill 계약 검사 통과 (`npm test`에도 포함)
- staging migration/검증(2026-08-29, `vm-app-01`): Compose와 PostgreSQL 15.8은 healthy였고, `codex_migration` owner role로 다섯 migration을 단일 transaction 순서대로 적용했다. normalized/access migration, gateway data RPC, Q49 backfill, read/export RPC 최적화가 각각 성공했고, gateway RPC의 security definer·service-role execute·public/anon/authenticated execute 차단, access bundle/product read JSON shape, developer/company_admin/employee의 `all`/`company`/`personal` scope를 확인했다. `hyejin2054` export/read RPC는 200으로 회복됐다. RLS는 신규/기존 대상 테이블 모두 활성화하지 않았다.
- staging 최종 집계: `admins` 8·`admin_menu_permissions` 40·`products` 5,347·`applications` 630·`submissions` 25,664·`product_steps` 180·`companies` 3·`permission_definitions` 38·`permission_bindings` 206. `evidence_photos`는 baseline 24,094에서 검증 시점 24,098로 증가했으며 migration이 해당 테이블을 변경하지 않아 원인은 미확인 동시 활동으로 남긴다.
- 첫 staging 시도는 `postgres` role의 `public.admins` 권한 부족과 settings seed 값 길이 오류로 각각 rollback됐고, 수정 후 owner role 재적용에 성공했다. staging rollback용 custom dump는 로컬 `/private/tmp`에 보관한다.
- 브라우저: staging `hyejin2054` 인증 canary에서 대시보드·리뷰받기·상품전체보기·일괄수정·전체/사진 내보내기 로드, 메뉴 권한 없는 상품 메뉴 직접 URL의 `/admin` fallback, 상품·제출 생성/수정/상태 변경/삭제·일괄수정, 정상 재로드와 콘솔 오류 0건을 확인했다. 관리자 데이터 요청은 `/api/admin-gateway` only였고 `/rest/v1`·직접 `/functions/v1` 요청은 없었다. 이전 세션 만료 시 `/api/admin-gateway/access` 401도 정상 확인했다. canary 상품·제출·증빙 사진 ID의 DB 잔여 count는 각각 0이었다.
- `npm run supabase:check`: 연결 실패로 종료됨. 이 검사는 URL/KEY 또는 허용 DB 연결을 확인할 수 없는 상태였고, 별도로 승인된 staging 쓰기 canary는 브라우저 gateway 경로를 통해 성공했다.
- SQL 구문·권한·반환 계약과 staging `admin-gateway` 런타임 경계는 staging에서 검증했다. staging 웹 이미지의 same-origin proxy는 `/healthz` 200 및 세션 없는 gateway `401 ADMIN_SESSION_REQUIRED`로 확인했고, 현재 인증 read/write canary 이미지의 `READY=true`를 검증했다. production `admin-gateway`에는 2026-08-29 두 단계 파일 백업 후 nested action path 보완을 적용했으며, bundle 계약 RPC는 DB 백업 후 적용했다. production 웹은 대상 source 백업 후 app-only image를 재빌드·재생성했고 local/external `/healthz` 200, 세션 없는 gateway 401, Docker health `healthy`를 확인했다. 운영 브라우저는 현재 세션 만료로 `/api/admin-gateway/access` 401이어서 실제 permission write와 일괄입력 저장 canary는 실행하지 않았다. 공개 사진 흐름·production RLS·전체 C4 전환은 아직 수행하지 않았다. staging Kong preflight는 공유 wildcard CORS를 반환하므로 직접 cross-origin gateway 호출은 사용하지 않는다.
- production DB migration 사전 점검(2026-08-29, `vm-app-01`)에서는 DB healthy, `companies`·`permission_bindings`, `get_admin_access_bundle`, `get_admin_members`, `update_admin_permission`, `create_admin_review_receive_product`, `create_admin_review_receive_submission`이 이미 존재했고 `admins=8`, `admin_menu_permissions=40`, `permission_bindings=206`, RLS는 대상 테이블 모두 `false`였다. 문서의 production 미적용 전제와 실제 DB 상태가 충돌해 5개 migration은 재실행하지 않았고, 후속 bundle 계약 migration만 별도 백업·승인 절차로 적용했다.
- production DB migration 사전 점검(2026-08-29, `vm-app-01`)에서는 DB healthy, `companies`·`permission_bindings`, `get_admin_access_bundle`, `get_admin_members`, `update_admin_permission`, `create_admin_review_receive_product`, `create_admin_review_receive_submission`이 이미 존재했고 `admins=8`, `admin_menu_permissions=40`, `permission_bindings=206`, RLS는 대상 테이블 모두 `false`였다. 문서의 production 미적용 전제와 실제 DB 상태가 충돌하므로 5개 migration은 재실행하지 않았다. 이후 승인된 후속 bundle migration은 `/opt/supabase/backups/review-manager-bundle-fix-20260829/postgres-before-bundle-fix-full-v3.dump`로 백업·검증한 뒤 적용했고, create RPC의 `bundle_id` 계약·scope 검사와 `service_role` 전용 execute ACL을 확인했다.
- 이번 운영 rollback 자료는 DB custom dump `/opt/supabase/backups/review-manager-bundle-fix-20260829/postgres-before-bundle-fix-full-v3.dump`, RPC 원본 정의 백업, 웹 source archive `/home/jinitlab/review_manager_backoffice.codex-backup-before-bundle-fix-20260829/source-files-before.tar`, 기존 image tag `review-manager-backoffice:codex-backup-before-bundle-fix-20260829`다. 웹 image ID는 새 버전 `sha256:a8a0f00d17a4f80cdf4fb2020be979aacc3c39ba934da446391ed840e7b946d2`, rollback `sha256:dd9dc45ddaa5c66119887927c6b90f6b86422914d65ffe338c0ebeb5986afad3`다.

## 7. 새 세션 시작 절차

새 세션은 작업 전에 다음 순서로 읽고 확인한다.

1. `AGENTS.md`
2. `CODEX_HANDOFF.md` (이 파일)
3. `plans.md`
4. `docs/project_analysis.md`
5. DB/환경 작업이면 `docs/guide_db.md`, `SUPABASE_SETUP.md`, `docs/guide.md`
6. `git status --short --untracked-files=all` 및 `git diff --stat`
7. 관련 skill: `review-manager-development`, `admin-access-control`, `supabase-schema-sync` (UI 작업이면 `review-manager-ui`도)

그 다음 사용자에게 현재 상태와 다음 로컬 작업을 요약하고, 운영 반영이 필요한지 여부를 분리해서 확인한다.
서버 접근권한이 있는 폴더에서 세션을 시작하더라도, 권한이 있다고 추정하지 말고 실제 대상/권한/배포 방식을 먼저 확인한다.

## 8. 새 세션에 붙여 넣을 시작 프롬프트

```text
이 저장소의 AGENTS.md와 CODEX_HANDOFF.md, plans.md를 먼저 읽어줘.
현재는 로컬 구현과 staging DB migration/RPC·`admin-gateway` Edge Function·same-origin 웹 proxy/backoffice 이미지 적용, `hyejin2054` 인증 read/write canary까지 완료된 상태다. production에는 nested action path 1·2차 수정, bundle 계약용 DB 후속 RPC migration, 수정된 backoffice app 이미지 재생성을 반영했다. DB와 웹의 비파괴 검증은 완료했지만, 현재 브라우저 세션이 만료되어 실제 운영 일괄입력 저장 canary는 미실행·미확인 상태다. 공개 사진 흐름·production RLS·전체 C4 전환은 아직 반영하지 않았다.
git status/diff로 기존 변경을 보존하고, C4의 남은 게이트웨이 서비스 전환과 권한 검사 작업부터 이어서 진행해줘.
운영 대상에 접근하거나 SQL/배포 명령을 실행하기 전에는 대상, 정확한 명령, 영향, 롤백 방법을 설명하고 내 명시적 승인을 받아줘.
먼저 현재 상태와 다음 작업을 짧게 요약하고, 운영 대상 접근·SQL·배포 전 승인 절차를 지켜 진행해줘.
```
