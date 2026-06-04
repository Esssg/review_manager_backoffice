# admins 계정별 동작 권한 구현 계획

작성일: 2026-06-04

## 목표

- 관리자 계정별로 `내 회사 데이터 포함` 기본값과 `입금완료` 처리 권한을 제어한다.
- `hyejin2054`는 회사 데이터 포함이 기본으로 켜져 있고, 사용자가 변경할 수 있으며, 입금완료 처리가 가능하다.
- `aram2525`, `kimhanbi77`은 회사 데이터 포함이 기본으로 꺼져 있고, 사용자가 변경할 수 있으며, 입금완료 처리는 불가능하다.
- 그 외 계정은 회사 데이터 포함이 기본으로 꺼져 있고, 사용자가 변경할 수 있으며, 입금완료 처리가 가능하다.
- 그 외 계정은 입금완료 등 제한 대상 동작 권한을 가진다.
- 메뉴 권한(`admin_menu_permissions`)과 동작 권한을 섞지 않고, 한 곳의 기준을 여러 화면에서 재사용한다.

## 현재 확인한 구조

- 로그인 계정 ID는 `review_manager_admin_id` localStorage 값으로 읽는다.
- `내 회사 데이터 포함` 값은 페이지 진입/이동 때마다 `admins.include_company_data_include` 기준으로 초기화된다.
- 대시보드는 `src/hooks/useAdminDashboard.js`에서 회사 데이터 포함 여부를 관리한다.
- 내보내기 화면들은 `src/hooks/useAdminExportData.js`에서 회사 데이터 포함 여부를 관리한다.
- 실제 회사 범위 계산은 `src/services/adminScope.js`의 `resolveAdminManagerScope(adminId, { includeCompanyData })`가 담당한다.
- 입금완료 쓰기는 주로 아래 화면에 있다.
  - `src/pages/admin/AdminProductOverviewPage.jsx`
  - `src/pages/admin/AdminReviewReceiveDetailPage.jsx`
- 입금완료 데이터는 `submissions.is_deposit_verified`, `submissions.deposited_at`, `submissions.actual_depositor_name`을 수정한다.
- 기존 공통 확인 UI는 `src/components/common/AppAlertDialog.jsx`를 사용한다.

## 권한 계약

### 계정별 기대 동작

| 계정 | 회사 데이터 포함 기본값 | 회사 데이터 포함 토글 | 입금완료 처리 |
| --- | --- | --- | --- |
| `hyejin2054` | 켜짐 | 변경 가능 | 가능 |
| `aram2525` | 꺼짐 | 변경 가능 | 불가능 |
| `kimhanbi77` | 꺼짐 | 변경 가능 | 불가능 |
| 그 외 계정 | 꺼짐 | 변경 가능 | 가능 |

### 권장 구현 방식

1. 장기 운영 기준은 DB 컬럼 또는 별도 권한 테이블로 관리한다.
2. 프런트 코드에는 특정 계정 ID 분기문을 여러 화면에 흩뿌리지 않는다.
3. DB 권한 조회가 준비되기 전 임시 구현이 필요하면 `src/constants/admin.js` 또는 `src/lib/adminCapabilities.js` 같은 단일 모듈에만 계정 예외를 둔다.

## DB 변경 계획

권장안은 `admins`에 동작 권한 컬럼을 추가하는 것이다. 메뉴 권한처럼 행이 계속 늘어나는 구조가 아니라, 현재 요구사항은 계정 프로필 성격이 강하므로 `admins` 확장이 단순하다.

1. Supabase 최종 스키마를 확인한다.
2. `admins`에 아래 컬럼 추가를 검토한다.
   - `include_company_data_include` bool, default `false`
   - `can_verify_deposit` bool, default `true`
3. `include_company_data_include` 값 계약을 문서화한다.
   - `true`: 페이지 진입/이동 시 회사 데이터 포함을 켠다.
   - `false`: 페이지 진입/이동 시 회사 데이터 포함을 끈다.
4. 기존 계정 데이터를 업데이트한다.
   - `hyejin2054`: `include_company_data_include = true`, `can_verify_deposit = true`
   - `aram2525`: `include_company_data_include = false`, `can_verify_deposit = false`
   - `kimhanbi77`: `include_company_data_include = false`, `can_verify_deposit = false`
   - 그 외: `include_company_data_include = false`, `can_verify_deposit = true`
5. 스키마 변경 후 Supabase에서 최종 스키마를 다시 조회한다.
6. `docs/guide_db.md`에 컬럼, 값 계약, 샘플 데이터를 반영한다.

## 코드 변경 계획

### 1. 권한 조회/정규화 레이어 추가

1. `src/services/adminAuth.js` 또는 새 서비스 파일에 현재 관리자 권한 조회 함수를 추가한다.
   - 필요한 컬럼만 select한다.
   - 조회 실패 시 화면에 명확한 오류를 보여준다.
2. `src/utils` 또는 `src/lib`에 권한 정규화 함수를 둔다.
   - `getInitialIncludeCompanyData({ defaultValue, storedValue })`
   - `canVerifyDeposit(capabilities)`
3. 권한 값이 없거나 구버전 DB일 때의 fallback을 정한다.
   - 기본 fallback은 "그 외 계정" 계약에 맞춰 `include_company_data_include = false`, `can_verify_deposit = true`로 둔다.

### 2. 회사 데이터 포함 정책 적용

1. `useAdminDashboard`의 localStorage 직접 읽기/쓰기 흐름을 제거하고 권한 기반으로 바꾼다.
2. `useAdminExportData`도 같은 헬퍼를 사용하게 바꾼다.
3. 페이지 진입/이동 시 `admins.include_company_data_include`를 초기값으로 사용한다.
4. 모든 계정은 현재 페이지 안에서만 토글 변경을 임시 적용한다.
5. 토글 변경값은 localStorage에 저장하지 않는다.
6. 회사 데이터 포함이 있는 모든 관리자 화면에서 같은 상태 계산을 재사용한다.

### 3. 입금완료 처리 권한 적용

1. `AdminProductOverviewPage.jsx`의 입금완료 일괄 처리 버튼을 권한 기반으로 비활성화한다.
2. `AdminProductOverviewPage.jsx`의 실제 저장 함수 진입부에도 `canVerifyDeposit` guard를 추가한다.
3. `AdminReviewReceiveDetailPage.jsx`의 입금완료 체크박스, 입금완료 확인 다이얼로그, 입금완료 일괄 처리 버튼을 권한 기반으로 막는다.
4. `AdminReviewReceiveDetailPage.jsx`의 실제 저장 함수 진입부에도 `canVerifyDeposit` guard를 추가한다.
5. 권한 없는 계정이 직접 이벤트를 호출해도 `submissions.is_deposit_verified`가 수정되지 않도록 UI와 핸들러 양쪽에서 막는다.
6. 권한 없는 상태에는 빈 화면 대신 "입금완료 처리 권한이 없습니다." 같은 사용자 피드백을 표시한다.

### 4. 권한 로딩 상태 처리

1. 관리자 레이아웃 또는 각 페이지 훅에서 권한 조회 중 본문을 먼저 렌더링하지 않게 한다.
2. 권한 조회 실패 시 쓰기 버튼을 기본적으로 막고 오류 메시지를 표시한다.
3. 기존 메뉴 권한 로딩과 충돌하지 않도록 동작 권한 로딩 상태를 별도로 둔다.

### 5. 문서 동기화

1. DB 스키마를 바꾸면 `docs/guide_db.md`를 반드시 갱신한다.
2. 구조나 권한 흐름 설명이 커지면 `docs/project_analysis.md`에도 "관리자 동작 권한" 섹션 추가를 검토한다.
3. 계정별 운영 정책은 `plans.md`에만 남기지 말고 DB 문서 또는 별도 운영 문서에 남긴다.

## 검증 계획

1. `npm run build`를 실행한다.
2. DB 컬럼을 추가했다면 `npm run supabase:check`를 실행한다.
3. 각 계정으로 수동 시나리오를 확인한다.
   - `hyejin2054`: 페이지 진입/이동 시 대시보드/내보내기에서 회사 데이터 포함이 켜지는지 확인
   - `hyejin2054`: 회사 데이터 포함 토글을 끌 수 있고, 변경값이 유지되는지 확인
   - `hyejin2054`: 상품전체보기/리뷰받기 상세에서 입금완료 처리가 가능한지 확인
   - `aram2525`, `kimhanbi77`: 페이지 진입/이동 시 회사 데이터 포함이 꺼지는지 확인
   - `aram2525`, `kimhanbi77`: 회사 데이터 포함 토글을 켤 수 있고, 변경값이 유지되는지 확인
   - `aram2525`, `kimhanbi77`: 입금완료 버튼/체크/일괄처리가 막히는지 확인
   - 그 외 계정: 페이지 진입/이동 시 회사 데이터 포함이 꺼지고, 토글과 입금완료 처리가 모두 가능한지 확인
4. 권한 없는 계정이 URL 직접 접근 또는 버튼 비활성 우회 상황에서도 저장 함수 guard로 막히는지 확인한다.

## 구현 순서

1. 권한 저장 방식을 DB 컬럼 방식으로 확정한다.
2. Supabase 마이그레이션을 작성하고 적용한다.
3. `docs/guide_db.md`를 갱신한다.
4. 관리자 권한 조회 서비스와 정규화 유틸을 추가한다.
5. 대시보드/내보내기 회사 데이터 포함 훅을 공통 권한 기준으로 수정한다.
6. 상품전체보기와 리뷰받기 상세의 입금완료 UI/핸들러에 권한 guard를 추가한다.
7. 빌드와 계정별 수동 검증을 수행한다.

## 구현 전 확인할 사항

- DB 스키마를 변경해도 되는지 확인이 필요하다.
- `내 회사 데이터 포함 버튼이 모든 페이지에서 적용`의 범위가 현재 토글이 있는 대시보드/내보내기만인지, 상품전체보기/리뷰받기 목록/상세 조회 범위까지 확장해야 하는지 확인이 필요하다.
- 기존 `review_manager_include_company_data` localStorage 값은 더 이상 회사 데이터 포함 상태 계산에 사용하지 않는다.
