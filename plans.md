# React/프로젝트 기준 리팩터링 계획

작성일: 2026-08-10
상태: H-01·H-02·H-03·H-04 완료 / 다음 단계(H-05) 승인 대기

## 1. 목표와 범위

현재 동작, 라우팅, 권한 의미, DB 계약, UI 결과를 유지하면서 다음을 개선한다.

- React 컴포넌트의 책임과 상태 경계를 명확히 한다.
- 불필요한 렌더링과 네트워크 waterfall을 줄인다.
- 초기 번들 및 사용자 동작 전에 필요한 코드만 로드한다.
- Supabase 접근 범위를 허용 목록으로 강제한다.
- 테스트 가능한 서비스·훅·순수 유틸 경계를 만든다.

이번 계획에서 제외하는 것:

- 기능 추가, 화면/스타일 변경, 라우트 URL 변경
- 관리자 권한의 의미 변경 또는 인증 방식을 Supabase Auth로 교체
- 허용 목록 밖의 Supabase 객체 변경
- 승인 없는 DB 스키마·RPC·RLS 변경
- 대규모 CSS/컴포넌트 추상화의 선행 도입

우선순위는 영향도와 회귀 위험을 함께 고려했다. High 항목은 보안·데이터 무결성·실행 오류·초기 성능에 직접 영향을 주므로 먼저 계약을 고정한 뒤 진행한다.

## 2. 탐색 결과 요약

- src/App.jsx가 모든 관리자·공개 페이지를 정적으로 import하고 있으며, src/main.jsx도 기능별 CSS를 모두 전역 import한다.
- xlsx가 파일 업로드·일괄 수정·엑셀 내보내기 경로에 정적으로 포함된다. 기존 빌드 관찰상 메인 JS가 약 1.2MB이며 500kB 초과 경고가 발생했다.
- 가장 큰 화면은 src/pages/admin/AdminReviewReceiveDetailPage.jsx 4,643줄, src/pages/admin/AdminProductOverviewPage.jsx 2,854줄, src/pages/admin/AdminReviewReceivePage.jsx 2,390줄이다.
- AdminLayout과 AdminSettingPage에는 조건부 early return/render 중 navigate와 Hook 호출 순서가 섞인 부분이 있다.
- 저장소 전체 재검색 결과, 단수형 evidence_photo는 레거시 fallback/삭제 호출과 오래된 문서에만 남아 있고, participants/campaigns는 연결 점검 스크립트와 설정 문서에만 남아 있다. 반면 evidence_photos는 서비스·Edge Function·마이그레이션에서 실제 사용 중이다.
- 대시보드·엑셀 export·사진 ZIP·파일 업로드에 순차 요청 또는 N+1 요청 후보가 있다.
- 제품 개요 테이블은 최대 300행을 한 번에 렌더링하며, 렌더마다 큰 파생 계산과 membership 검색을 수행한다.
- 현재 Node 테스트는 3개 파일, 총 10개 테스트가 통과한다. 화면·권한·Supabase allowlist·대시보드 집계에 대한 회귀 테스트는 부족하다.

## 3. High 우선순위

### H-01. Supabase 허용 테이블 범위 위반 참조 제거 및 정적 보호 — 완료

- 문제: 이 프로젝트의 허용 목록에 없는 evidence_photo fallback과 participants, campaigns 연결 점검이 존재한다. 같은 public 스키마의 다른 프로젝트 데이터를 건드릴 수 있다. 이번 계획의 대상은 물리 테이블 삭제가 아니라 이 저장소의 참조·점검 로직 제거다.
- 원인: 과거 레거시 테이블 호환 코드와 일반화된 테이블 이름 인자가 현재 프로젝트의 명시적인 DB 경계를 우회한다.
- 관련 파일:
  - AGENTS.md:36-55
  - src/services/productDetail.js:66-103,121-132
  - src/hooks/useAdminProductDetail.js:178-179
  - scripts/check-supabase.mjs:32-40
  - SUPABASE_SETUP.md:43-54
  - docs/project_analysis.md:320-330
- 재확인 결과:
  - 저장소 전체에서 evidence_photo 단수형은 src/services/productDetail.js의 조회 fallback, src/hooks/useAdminProductDetail.js의 삭제 호출, 그리고 이를 설명하는 오래된 문서에만 존재한다.
  - participants와 campaigns는 scripts/check-supabase.mjs의 candidates와 SUPABASE_SETUP.md의 설명에만 존재하며, 앱 서비스·페이지·마이그레이션·Edge Function의 .from() 또는 SQL 참조는 확인되지 않았다.
  - evidence_photos 복수형은 여러 앱 서비스, review-receive-photo-sync Edge Function, Supabase 마이그레이션, docs/guide_db.md에서 실제 사용된다.
  - 2026-08-10에 허용 목록 7개 테이블만 읽기 전용으로 확인했으며 모두 접근 가능했다. 확인 당시 row count는 admins 8, products 4,226, admin_menu_permissions 40, product_steps 180, applications 630, submissions 21,038, evidence_photos 19,396이었다.
  - 따라서 evidence_photos는 이 프로젝트에서 확실히 사용하는 테이블이다. 엄밀히 말해 evidence_photo는 현재 코드에 fallback/삭제 참조가 남아 있어 완전 미사용은 아니지만, 대상 DB에서 evidence_photos가 정상 존재하는 것이 확인된 만큼 이 프로젝트의 허용된 정상 경로에는 필요하지 않다. evidence_photo, participants, campaigns가 공유 DB에 물리적으로 존재하는지 또는 다른 프로젝트가 사용하는지는 이 저장소 범위를 넘어가므로 조회·삭제하지 않는다.
- 적용할 Skill/rule: supabase-schema-sync, review-manager-development, AGENTS.md의 Supabase DB 대상 범위 규칙, review-agent의 근거 기반 결함 보고 원칙.
- 예상 변경 내용:
  - public.evidence_photos는 유지하고, 이 프로젝트의 모든 사진 조회·삭제·저장 경로가 이 허용 테이블만 사용하도록 한다.
  - evidence_photo fallback과 호출부를 제거한다. 물리 테이블 DROP, rename, 데이터 삭제는 수행하지 않는다.
  - 임의 문자열을 받는 삭제 helper를 허용 테이블별 명시적 함수 또는 allowlist 상수 기반 API로 바꾼다.
  - check-supabase가 participants/campaigns를 probe하지 않고, 허용 목록에 있는 연결 확인 대상만 사용하도록 고친다.
  - SUPABASE_SETUP.md와 docs/project_analysis.md의 사실 설명을 실제 계약에 맞춘다.
  - 알 수 없는 테이블명이 코드에 재도입되지 않도록 정적 검사 또는 테스트를 추가한다.
  - 실제 확인된 row count는 계획의 기준점으로만 기록하고, 구현 시 데이터 자체를 수정하지 않는다.
- 회귀 위험: 코드상 레거시 fallback 제거로 이 저장소의 제품 상세 사진 동작이 달라질 가능성은 있으나, 현재 허용 테이블 public.evidence_photos가 실제 존재하고 사용 중임을 확인했다. 다른 프로젝트의 물리 테이블을 삭제하지 않으므로 공유 DB에 대한 외부 회귀는 만들지 않는다. 제품 상세 조회·삭제와 Edge Function 사진 흐름을 구현 후 검증한다.
- 실행 결과: 레거시 참조 제거, allowlist 정적 테스트 추가, npm test 11개 통과, npm run build 성공, products 단일 테이블 연결 점검 성공, review receive 상세의 evidence_photos 요청 200 및 evidence_photo 요청 0건을 확인했다.

### H-02. 인증 경계에서 Hook 순서와 render 중 navigation 정리 — 완료

- 문제: 인증 정보가 없을 때 Hook 호출보다 먼저 반환하거나 render 중 navigate()를 실행하는 코드가 있어, 상태 변화 시 Hook 순서 오류와 예측 불가능한 redirect가 발생할 수 있다.
- 원인: 인증/권한 경계와 실제 화면의 Hook·렌더 책임이 한 컴포넌트에 섞여 있다.
- 관련 파일:
  - src/components/layout/AdminLayout.jsx:32-107
  - src/pages/admin/AdminSettingPage.jsx:107-160,242-300
  - src/hooks/useAdminCapabilities.js
  - src/services/adminAuth.js
- 적용할 Skill/rule: admin-access-control, review-manager-development, react-best-practices의 Hook 규칙·rerender-move-effect-to-event·effect는 외부 동기화에만 사용 원칙.
- 예상 변경 내용:
  - 인증 경계 wrapper와 인증된 관리자 화면을 분리하거나, 모든 Hook을 동일한 순서로 호출한 뒤 redirect를 렌더링한다.
  - 설정 페이지의 render 중 navigation을 Navigate 또는 안전한 effect/경계 컴포넌트로 이동한다.
  - loading, error, no-permission, unauthenticated 상태를 구분하고 현재 URL별 redirect 의미를 유지한다.
  - 직접 URL 접근과 메뉴 권한 확인을 함께 검증할 수 있는 테스트 경계를 만든다.
- 회귀 위험: 로그인 직후 메뉴 로딩 순서, 설정 직접 접근, 권한 거부 화면이 달라질 수 있다. 인증됨/미인증/권한 없음/로딩 상태를 각각 브라우저로 확인한다.
- 실행 결과: AdminLayout과 AdminSettingPage의 인증 child 경계를 분리했고, npm test 11개 통과, npm run build 성공, 미인증 설정 경로의 로그인 redirect와 인증 후 설정 로딩/돌아가기 navigation을 브라우저에서 확인했다.

### H-03. 라우트·대형 의존성 코드 분할 — 완료

- 문제: 로그인 직후 사용하지 않는 모든 관리자 화면, 공개 화면, export 기능이 초기 번들에 들어간다. xlsx도 초기 로드에 포함될 가능성이 높다.
- 원인: App.jsx의 정적 페이지 import와 유틸리티의 정적 xlsx import, 기능 CSS의 전역 import 때문이다.
- 관련 파일:
  - src/App.jsx:1-61
  - src/main.jsx:5-12
  - src/utils/fileUploadParser.js:1
  - src/utils/bulkEditExcel.js:1
  - src/utils/exportFile.js:1
  - src/utils/fileUploadTemplate.js:1
  - src/pages/admin/AdminFileUploadPage.jsx:168
  - src/pages/admin/AdminBulkEditPage.jsx:198,218
  - src/pages/admin/*Export*Page.jsx
- 적용할 Skill/rule: react-best-practices의 bundle-dynamic-imports, bundle-conditional, bundle-defer-third-party, review-manager-development, review-manager-ui.
- 예상 변경 내용:
  - 라우트 단위 lazy/Suspense를 도입하고 공통 loading/error fallback을 둔다.
  - 공통 CSS만 entry에서 유지하고, 기능별 CSS는 해당 route/feature 경계에서 로드하는 방안을 검토한다.
  - xlsx는 파일 선택, 템플릿 생성, 일괄 수정, export 실행 시점에만 dynamic import한다.
  - 테스트·서비스에서 사용하는 순수 계약은 유지하고, browser-only loading adapter를 별도로 둔다.
  - 분할 뒤에도 권한 없는 route가 페이지 모듈을 불필요하게 실행하지 않는지 확인한다.
- 회귀 위험: 첫 진입 loading UI, CSS 적용 시점, export/upload 오류 처리, deep link refresh가 달라질 수 있다. build의 chunk 결과와 주요 route의 실제 화면·권한·엑셀 동작을 함께 검증한다.
- 실행 결과: `src/App.jsx`의 관리자·공개 페이지를 `React.lazy`와 공통 `Suspense` fallback으로 전환했다. 관리자 레이아웃은 정적으로 유지해 권한 확인이 끝난 뒤에만 하위 페이지 chunk가 렌더링되도록 했고, 권한 없는 파일 업로드 직접 접근은 기존처럼 대시보드로 redirect되면서 파일 업로드 page chunk가 요청되지 않는 것을 확인했다. `xlsx`는 `loadXlsx` 단일 promise loader로 export·템플릿·일괄수정 실행 시점에 로드하도록 바꾸고, 파일 업로드 Excel adapter도 파일 선택 시점의 dynamic import로 분리했다. `fileUploadParser`는 행 변환 순수 로직으로 남겼으며, 다운로드 실패는 기존 화면의 성공 흐름을 바꾸지 않고 오류 메시지로 안내한다. 기능별 CSS는 route 전환 중 스타일 깜박임을 피하기 위해 이번 단계에서는 전역 로딩을 유지했다. 빌드 결과 entry JS는 400.20kB(gzip 118.47kB), `xlsx`는 별도 429.03kB(gzip 143.08kB) chunk로 분리되었고, `npm test` 14개 통과 및 `npm run build` 성공을 확인했다. Playwright로 로그인→대시보드, export deep link, export 화면 초기 xlsx 미요청, Excel 다운로드 시 xlsx chunk 요청·파일 생성, bulk-edit 화면, 권한 없는 file-upload redirect를 확인했다. 브라우저 콘솔에 남은 `admins` capability 컬럼 조회 400은 H-04에서 확인한 현재 원격 스키마 호환 fallback 로그이며 H-03 변경으로 새로 발생한 오류는 아니다.

### H-04. 관리자 scope/capability 로딩 정책 일원화 — 완료

- 문제: 페이지·서비스·훅마다 관리자 scope와 메뉴 capability를 따로 조회한다. 특히 review receive detail은 includeCompanyData: true를 고정하고, 목록 화면은 사용자 토글을 사용해 직접 URL별 데이터 범위가 일관되게 보장되는지 추적하기 어렵다.
- 원인: resolveAdminManagerScope, useAdminCapabilities, useAdminIncludeCompanyData가 공통 정책 계층 없이 각 feature에서 조합된다.
- 관련 파일:
  - src/services/adminScope.js:11-75
  - src/hooks/useAdminCapabilities.js:6-85
  - src/services/adminProducts.js:139-193
  - src/services/productOverview.js:120-163
  - src/services/reviewReceive.js:49-136
  - src/pages/admin/AdminReviewReceiveDetailPage.jsx:657-662
  - src/pages/admin/AdminReviewReceivePage.jsx:646-765
  - src/pages/admin/AdminProductOverviewPage.jsx:516-828
- 적용할 Skill/rule: admin-access-control, supabase-schema-sync, review-manager-development, AGENTS.md의 라우팅·관리자 권한 규칙.
- 예상 변경 내용:
  - 세션, capability, scope를 한 번 해석하고 feature가 명시적인 scope policy를 전달하도록 경계를 만든다.
  - 서버 RPC의 권한 검사는 유지하고, 클라이언트의 중복 조회·정책 누락만 줄인다.
  - detail의 회사 데이터 포함 여부처럼 현재 동작이 고정된 부분은 먼저 의도를 계약으로 기록한 뒤 named policy와 테스트로 고정한다.
  - 메뉴 노출, 직접 URL, personal/company scope, write action을 같은 매트릭스로 검증한다.
- 회귀 위험: 노출되는 제품·리뷰 데이터와 쓰기 대상이 달라질 수 있는 고위험 영역이다. 권한 의미를 추측해 바꾸지 않고 현재 운영 결과를 기준으로 fixture와 브라우저 검증을 먼저 만든다.
- 실행 결과: `AdminAccessContext`를 인증된 관리자 레이아웃 경계에 추가해 capability/profile을 하위 화면에서 공유하고, capability 컬럼이 없는 현재 DB에서도 `login_id,company` fallback profile을 재사용하도록 했다. `personal`, `company`, `review_receive_detail`, `bulk_edit` named scope policy를 추가하고 목록·대시보드·export·사진 export·상품전체보기·일괄수정 서비스에 명시적으로 전달했다. 리뷰받기 상세와 일괄수정의 기존 회사 범위는 고정 policy로 유지했다. scope policy 단위 테스트 3개를 추가했고 npm test 14개 통과, npm run build 성공을 확인했다. Playwright로 관리자 로그인 후 대시보드, 리뷰받기 목록/상세, 상품전체보기, 일괄수정 경로를 확인했고, 상품전체보기 RPC의 개인/회사 토글 요청이 각각 `p_include_company_data=false/true`로 전달되는 것을 확인했다. 상세의 회사 관리자 scope와 `evidence_photos` 요청 200도 확인했다. 현재 원격 DB에 capability 컬럼이 없어 capability 조회의 400 fallback 오류 로그 2건이 브라우저에 남는 것은 기존 스키마 상태에 따른 것이며, fallback 자체는 정상 동작했다.

### H-05. 삭제 흐름의 부분 성공·데이터 무결성 계약 정리

- 문제: 제품 삭제가 evidence_photos, submissions, applications, product_steps, products를 여러 요청으로 순차 삭제한다. 중간 실패 시 일부만 삭제된 상태가 남을 수 있다.
- 원인: 여러 허용 테이블에 대한 transaction 경계가 서비스 호출 단위에 없고, 두 화면에 삭제 구현이 나뉘어 있다.
- 관련 파일:
  - src/services/adminProducts.js:253-437
  - src/services/productOverview.js:257-356
  - src/services/productDetail.js:121-132
  - docs/guide_db.md
- 적용할 Skill/rule: supabase-schema-sync, admin-access-control, AGENTS.md의 DB 변경·문서 동기화 규칙.
- 예상 변경 내용:
  - 먼저 삭제 대상·순서·부분 실패 반환 계약을 공통 service로 정리한다.
  - transaction이 실제로 필요하다고 확인되면 허용 목록 테이블만 대상으로 하는 승인된 RPC/DB 변경을 별도 단계로 설계한다.
  - RPC/마이그레이션을 도입하는 경우 최종 스키마 재조회와 docs/guide_db.md 동기화를 같은 작업에 포함한다.
  - 권한 없음, 대상 없음, 중간 실패, 재시도 결과를 테스트한다.
- 회귀 위험: 실패 시 사용자에게 보이는 결과와 재시도 가능성이 달라질 수 있고, DB 변경을 수반할 수 있다. 사용자 확인과 운영 DB 검증 전에는 RPC·마이그레이션을 만들지 않는다.

## 4. Medium 우선순위

### M-01. 대형 페이지를 화면·도메인 훅·feature component로 단계적 분리

- 문제: 한 페이지가 데이터 로딩, 필터, 선택, bulk write, 모달, 테이블, 사진 처리, 화면 렌더를 동시에 책임져 변경 영향과 재렌더 원인을 추적하기 어렵다.
- 원인: 기능이 성장하는 동안 페이지 파일에 상태와 handler가 누적됐고, page 파일이 다른 page의 재사용 component까지 보유한다.
- 관련 파일:
  - src/pages/admin/AdminReviewReceiveDetailPage.jsx:657-4643
  - src/pages/admin/AdminProductOverviewPage.jsx:239-2854
  - src/pages/admin/AdminReviewReceivePage.jsx:646-2390
  - src/pages/public/PublicReviewReceiveDetailPage.jsx:382-1001
  - src/pages/admin/AdminBulkEditPage.jsx:4
- 적용할 Skill/rule: review-manager-development의 reuse-first·page/service/utils 책임 분리·상태 분리, review-manager-ui, react-best-practices의 rerender-split-combined-hooks, rerender-no-inline-components, rerender-memo.
- 예상 변경 내용:
  - 먼저 순수 변환/validation과 데이터 접근을 page 밖으로 이동한다.
  - ProductOverviewTable을 components/admin/product-overview/로 이동하고, bulk edit이 page 파일에 의존하지 않게 한다.
  - review receive 목록/상세의 filter, table row, bulk editor, modal을 실제 공통 계약이 있는 단위만 추출한다.
  - public detail은 데이터 hook, photo action, item/section UI를 분리한다.
  - 기존 props, CSS class, session persistence, partial-save semantics를 유지하며 한 feature씩 이동한다.
- 회귀 위험: modal open state, 선택 상태, 확장 row, 입력 debounce, DOM selector, CSS cascade가 깨질 수 있다. 매 단계 build/test와 성공·실패·빈 상태·중복 제출을 검증한다.

### M-02. Product Overview의 렌더 hot path와 파생 상태 최적화

- 문제: 제품 개요 페이지가 렌더마다 JSON key 생성, Map/Set 생성, 대량 row map, bulk preview 계산을 반복한다. row 내부에서는 includes 기반 membership 검색도 발생한다.
- 원인: 파생값이 render 계산에 흩어져 있고, 비용이 큰 계산과 단순 표시 계산의 경계가 없다.
- 관련 파일:
  - src/pages/admin/AdminProductOverviewPage.jsx:613-712
  - src/pages/admin/AdminProductOverviewPage.jsx:411-443
  - src/utils/productOverviewRows.js
  - src/utils/productOverviewBulk.js
- 적용할 Skill/rule: react-best-practices의 rerender-derived-state-no-effect, rerender-dependencies, rerender-memo, js-set-map-lookups, js-index-maps, review-manager-development.
- 예상 변경 내용:
  - 파생값은 state로 중복 저장하지 않고, 실제 비용이 큰 계산만 primitive/구조적 dependency 기준으로 useMemo한다.
  - 선택 제외 ID 등 반복 membership은 Set/index map으로 바꾼다.
  - row를 독립 component로 만들고 필요 시 memo하여 변경된 row만 갱신한다.
  - query key와 bulk preview의 결과가 기존 필터·선택·페이지네이션과 동일한지 순수 테스트를 추가한다.
- 회귀 위험: selection query key, 전체 선택/제외 선택, infinite loading, bulk preview의 경계가 달라질 수 있다. 단순 계산까지 무분별하게 memoize하지 않고 대표 데이터로 before/after 결과를 비교한다.

### M-03. 대량 테이블 렌더링 비용 줄이기

- 문제: Product Overview는 최대 300행, review receive 화면은 제품·bundle·상세 row와 사진을 한 번에 렌더링할 수 있어 스크롤·입력 반응이 느려질 가능성이 있다.
- 원인: 모든 row와 셀을 일반 렌더링하고, row 단위 memo/content visibility 경계가 없다.
- 관련 파일:
  - src/pages/admin/AdminProductOverviewPage.jsx:411-443
  - src/pages/admin/AdminReviewReceivePage.jsx:1486-1608
  - src/pages/admin/AdminReviewReceiveDetailPage.jsx:2894-3031
  - src/styles/admin-shell.css:376-614
- 적용할 Skill/rule: react-best-practices의 rendering-content-visibility, rerender-memo, review-manager-ui의 table semantics·keyboard·responsive 규칙.
- 예상 변경 내용:
  - 대표 300/1,000건 데이터로 먼저 성능을 측정한다.
  - row component memoization과 안전한 content-visibility/contain-intrinsic-size 적용을 우선 검토한다.
  - 효과가 부족할 때만 virtualization을 검토하며, infinite sentinel·확장 row·표의 키보드/스크린리더 semantics를 보존한다.
- 회귀 위험: row 높이, expanded content, IntersectionObserver, sticky header, print와 접근성이 달라질 수 있다. 브라우저에서 실제 스크롤·확장·키보드 이동을 검증한다.

### M-04. Review Receive 필터 header 중복과 이중 입력 이벤트 정리

- 문제: 목록과 상세 페이지가 거의 같은 FilterIcon/filter header를 각각 구현하고, 텍스트 입력에 onInput과 onChange가 동시에 연결되어 동일 handler가 중복 실행될 수 있다.
- 원인: 공통 필터 UI가 page 내부에 복제됐고 브라우저 이벤트 계약이 정리되지 않았다.
- 관련 파일:
  - src/pages/admin/AdminReviewReceivePage.jsx:552-640
  - src/pages/admin/AdminReviewReceiveDetailPage.jsx:554-655
  - src/styles/admin-shell.css
- 적용할 Skill/rule: review-manager-ui의 shared dialog/form/accessibility 규칙, review-manager-development, react-best-practices의 event-driven update 원칙.
- 예상 변경 내용:
  - 실제 공통 props를 추출해 ReviewReceiveFilterHeader로 재사용한다.
  - 텍스트 입력은 한 이벤트 경로로 통일하고, 기존 debounce/reset/close/focus 동작을 보존한다.
  - 날짜 필터, sessionStorage 복원, 빈 결과와 loading 상태의 contract를 테스트한다.
- 회귀 위험: 입력 debounce 시점, IME 입력, 키보드 조작, 필터 초기화 동작이 달라질 수 있다. 한국어 IME와 직접 URL 재진입을 포함해 브라우저에서 검증한다.

### M-05. 독립적인 Supabase 요청의 waterfall 제거

- 문제: 대시보드와 export 데이터 로딩에서 서로 독립적인 submissions, applications, 회사 구성원 등의 요청이 앞 요청이 끝난 뒤 순차 실행된다.
- 원인: 서비스 함수가 의존 관계와 단순한 코드 순서를 구분하지 않고 await를 연결한다.
- 관련 파일:
  - src/services/dashboardMetrics.js:25-142
  - src/services/exportData.js:61-175
  - src/services/exportPhotos.js:50-116
- 적용할 Skill/rule: react-best-practices의 async-parallel, supabase-schema-sync의 페이지네이션·데이터 계약, review-manager-development.
- 예상 변경 내용:
  - scope와 ID처럼 실제 의존성이 있는 단계는 유지하고, 독립 branch는 Promise.all로 병렬화한다.
  - pagination/chunk 제한, 에러 우선순위, 부분 데이터 반환 여부를 기존과 동일하게 유지한다.
  - exportPhotos처럼 실제 의존성이 있는 products → submissions → photos 순서는 병렬화하지 않는다.
- 회귀 위험: 요청 동시성 증가로 rate limit, 에러 메시지 우선순위, 부분 결과가 달라질 수 있다. 결과 집합과 에러 계약을 테스트하고 Supabase 요청 수/순서를 계측한다.

### M-06. 사진 ZIP 다운로드의 bounded concurrency 도입 검토

- 문제: AdminExportPhotosPage가 사진을 for 루프로 한 장씩 await하여 대량 다운로드가 느리다.
- 원인: 동시성 제한이 없는 순차 fetch 구현이며, 진행률·실패 정보가 개별 요청과 강하게 결합돼 있다.
- 관련 파일:
  - src/pages/admin/AdminExportPhotosPage.jsx:293-372
  - src/services/exportPhotos.js
- 적용할 Skill/rule: react-best-practices의 async-parallel, review-manager-development, review-manager-ui의 progress/error feedback.
- 예상 변경 내용:
  - 고정된 작은 동시성으로 fetch하되 ZIP entry 순서와 파일명은 기존 규칙을 유지한다.
  - 성공/실패/진행률을 요청 완료 순서와 무관하게 표시한다.
  - 무제한 Promise.all은 사용하지 않고, CORS·signed URL·메모리·rate limit을 고려해 실패 시 기존 안내를 보존한다.
- 회귀 위험: 서버 throttling, 브라우저 메모리, 파일 순서, 실패한 사진 수가 달라질 수 있다. 소량·대량·일부 실패 케이스를 브라우저에서 확인한다.

### M-07. localStorage/sessionStorage 접근을 한 경계로 통합

- 문제: 관리자 ID와 필터·선택·공개 리뷰 세션 값의 storage key, parse, try/catch, legacy normalization이 여러 화면에 중복된다.
- 원인: constants/admin.js에 일부 key만 있지만 각 page/hook이 직접 storage를 읽고 쓴다.
- 관련 파일:
  - src/constants/admin.js:1-2
  - src/components/layout/AdminLayout.jsx
  - src/hooks/useExportColumnSelection.js:68-197
  - src/pages/admin/AdminReviewReceivePage.jsx:504-528
  - src/pages/public/PublicReviewReceiveDetailPage.jsx:54-90,624-625
  - src/services/adminAuth.js:70-73
- 적용할 Skill/rule: react-best-practices의 client-localstorage-schema, rerender-defer-reads, review-manager-development.
- 예상 변경 내용:
  - key, version, parse/normalize, quota/security 예외 처리를 작은 storage adapter로 모은다.
  - 기존 key와 legacy column 값은 호환하고, 인증 secret은 저장하지 않는다.
  - 초기 storage read는 필요한 경계에서 한 번만 수행하고, 변경 이벤트는 실제 외부 동기화가 필요할 때만 사용한다.
- 회귀 위험: 기존 사용자 설정 초기화, 다중 탭 동기화, private mode/quota 예외, 공개 흐름의 session 복원이 달라질 수 있다. legacy key와 잘못된 JSON을 테스트한다.

### M-08. Admin Setting의 Supabase 접근을 service 경계로 이동

- 문제: AdminSettingPage가 화면에서 직접 Supabase client를 import하고 관리자 profile/password 관련 query와 update를 수행한다.
- 원인: 서비스 계층이 인증과 설정 책임을 모두 명시적으로 제공하지 않는다.
- 관련 파일:
  - src/pages/admin/AdminSettingPage.jsx:4,149-200,242-300
  - src/services/adminAuth.js
- 적용할 Skill/rule: review-manager-development의 page/service 분리, supabase-schema-sync, review-manager-ui의 form/error/dialog 규칙.
- 예상 변경 내용:
  - adminSettings service 또는 기존 adminAuth의 명시적인 함수로 read/update를 이동한다.
  - admins의 허용된 컬럼, 입력 검증, 오류 분류, 성공 메시지를 service contract로 고정한다.
  - 화면은 form state와 결과 상태만 관리하고 기존 AppAlertDialog 흐름을 유지한다.
- 회귀 위험: 비밀번호 규칙, profile 저장 성공/실패, 권한 오류, alert timing이 달라질 수 있다. 정상·빈 입력·잘못된 입력·권한 실패를 모두 검증한다.

### M-09. 대시보드 집계의 반복 순회와 O(N×M) 조회 개선

- 문제: 대시보드 순수 집계가 제품·submission·evidence를 여러 번 filter하고, 회사 구성원 집계는 구성원마다 전체 submissions를 다시 filter한다.
- 원인: product/manager별 index를 일부만 사용하고 집계 단계가 여러 독립 pass로 나뉘어 있다.
- 관련 파일:
  - src/utils/dashboardMetrics.js:167-302,475-515
  - src/services/dashboardMetrics.js:25-142
  - 관련 src/utils/dashboardMetrics.test.js 신규 대상
- 적용할 Skill/rule: react-best-practices의 js-combine-iterations, js-index-maps, js-set-map-lookups, review-manager-development.
- 예상 변경 내용:
  - 제품·관리자·submission 관계를 한 번 만든 index로 재사용한다.
  - 호환 가능한 filter/map pass를 합치되, 오늘/월간/시간대와 timezone 경계 계산은 분리해 의미를 보존한다.
  - 날짜 parsing cache는 측정으로 효과가 확인된 경우에만 도입한다.
- 회귀 위험: 집계 건수, 중복 제거, 날짜 경계, 담당자 없는 데이터 처리가 바뀔 수 있다. 기존 결과를 fixture snapshot/순수 함수 테스트로 비교한다.

### M-10. 파일 업로드·일괄 수정의 N+1 요청과 부분 저장 계약 개선

- 문제: 업로드 처리에서 상품별/행별로 submission을 찾고 쓰는 순차 흐름이 있어 대량 파일에서 느리며, 중간 실패 시 부분 저장 결과가 복잡해진다.
- 원인: 주문번호 매칭을 개별 query로 수행하고, source order와 partial-save 보고가 서비스 내부에 함께 묶여 있다.
- 관련 파일:
  - src/services/fileUpload.js:62-187
  - src/pages/admin/AdminFileUploadPage.jsx
  - src/pages/admin/AdminBulkEditPage.jsx
  - src/utils/fileUploadParser.js
  - src/utils/bulkEditExcel.js
- 적용할 Skill/rule: supabase-schema-sync의 chunk/pagination 규칙, react-best-practices의 async-parallel, review-manager-development, review-manager-ui.
- 예상 변경 내용:
  - 허용된 submissions 범위에서 주문번호를 chunk 단위로 미리 조회하거나, 제한된 동시성으로 묶는다.
  - source row 순서, 중복 주문번호 우선 규칙, 상품별 처리 순서, 성공/실패 보고를 유지한다.
  - 대량 처리 최적화 전 parser와 write result를 분리해 순수 테스트를 만든다.
- 회귀 위험: 중복 주문번호, 존재하지 않는 상품, 기존 submission update/insert 판정, partial failure 메시지가 바뀔 위험이 높다. 계약 테스트 후에만 최적화한다.

## 5. Low 우선순위

### L-01. Export 페이지들의 선언적 config와 공통 로딩 경계 정리

- 문제: 여러 export page가 비슷한 hook 호출·column filter·title/filename 설정을 반복해 새 export 변형을 추가할 때 누락 가능성이 있다.
- 원인: useAdminExportData와 공통 export component는 있으나 page별 preset이 선언적 registry로 통합되지 않았다.
- 관련 파일:
  - src/pages/admin/AdminExportAllProductsPage.jsx
  - src/pages/admin/AdminExportMyProductsPage.jsx
  - src/pages/admin/AdminExportByDatePage.jsx
  - src/pages/admin/AdminExportByProductPage.jsx
  - src/pages/admin/AdminExportByDepositDatePage.jsx
  - src/pages/admin/AdminExportByStatusPage.jsx
  - src/pages/admin/AdminExportApplicationsPage.jsx
  - src/hooks/useAdminExportData.js
  - src/components/admin/export/*
- 적용할 Skill/rule: review-manager-development, react-best-practices의 reuse-first·rerender-split-combined-hooks.
- 예상 변경 내용:
  - 실제 동일 계약인 export 옵션만 config로 모으고, 각 페이지의 unique filter/permission은 명시적으로 남긴다.
  - column preset, filename, date/status semantics를 데이터로 표현하고 공통 화면에 전달한다.
- 회귀 위험: export column 순서, filename, 날짜 inclusive/exclusive, 권한별 데이터 범위가 바뀔 수 있다. 모든 export variant별 결과 비교가 필요하다.

### L-02. CSS 소유권과 공통 token의 점진적 정리

- 문제: admin-shell.css가 약 2,887줄의 넓은 전역 스타일을 담당해 feature 추출 시 selector 충돌과 cascade 추적 비용이 크다.
- 원인: 공통 layout/token과 제품·review·export 화면 스타일이 한 파일에 누적되어 있다.
- 관련 파일:
  - src/styles/admin-shell.css
  - src/styles/admin-dashboard.css
  - src/styles/admin-export.css
  - src/styles/public-review-receive.css
  - 추출 대상 src/components/admin/**
- 적용할 Skill/rule: review-manager-ui의 기존 sky-blue token·responsive/a11y 계약, review-manager-development.
- 예상 변경 내용:
  - component extraction 시 해당 selector와 token만 함께 이동하고, 공통 shell token/utility는 별도 유지한다.
  - selector 이름과 DOM 구조를 불필요하게 바꾸지 않고 dead rule만 근거를 확인해 제거한다.
  - style split은 H-03 code split과 함께 영향 범위를 작은 feature 단위로 검증한다.
- 회귀 위험: cascade, 모바일 breakpoint, sticky/scroll, dialog stacking, print 스타일이 변할 수 있다. 주요 route의 브라우저 검증이 필요하다.

### L-03. 순수 유틸·권한·데이터 계약 테스트 보강

- 문제: 현재 테스트가 pagination, bulk Excel, product overview pagination에 집중되어 화면 권한, DB allowlist, 대시보드 집계, 필터/스토리지 정규화 회귀를 빠르게 잡지 못한다.
- 원인: 큰 page 통합 흐름을 직접 테스트하기 전에 순수 경계와 access matrix fixture가 충분히 고정되지 않았다.
- 관련 파일:
  - src/utils/*.test.js
  - src/utils/dashboardMetrics.js
  - src/utils/reviewReceiveBulkInput.js
  - src/utils/reviewReceiveFilters.js
  - src/utils/productOverviewRows.js
  - src/services/adminScope.js
  - scripts/check-supabase.mjs
- 적용할 Skill/rule: review-agent의 defect-first·재현 가능한 검증 원칙, review-manager-development, admin-access-control, supabase-schema-sync.
- 예상 변경 내용:
  - dashboard metric 날짜/중복/담당자 없음, review filter/IME 입력 계약, storage legacy normalization을 Node 테스트로 추가한다.
  - 허용 테이블 정적 검사와 scope/capability matrix를 테스트한다.
  - 실제 네트워크·브라우저 흐름은 순수 테스트와 분리해 최소 smoke 시나리오로 유지한다.
- 회귀 위험: 테스트 fixture가 실제 운영 계약과 어긋나면 잘못된 안정감을 줄 수 있다. fixture는 docs/guide_db.md와 실제 허용 테이블 계약을 기준으로 유지한다.

## 6. 권장 실행 순서

1. H-01을 먼저 처리해 DB 대상 범위와 정적 guardrail을 고정한다.
2. H-02의 인증/Hook 경계를 고친 뒤, H-04의 scope/capability 정책을 현재 동작 기준으로 고정한다.
3. L-03의 순수 계약 테스트를 보강해 이후 구조 변경의 안전망을 만든다.
4. H-03 route/xlsx code split을 적용하고 build chunk와 주요 경로를 확인한다.
5. M-02~M-06의 측정 가능한 렌더링·네트워크 최적화를 작은 단위로 진행한다.
6. M-01 대형 페이지 분리는 공통 계약이 확인된 부분부터 단계적으로 진행한다.
7. M-07~M-10의 storage/service/업로드 경계 정리와 L-01~L-02의 cleanup을 마무리한다.
8. H-05 삭제 transaction 검토는 DB 변경 승인을 받은 경우에만 별도 작업으로 진행한다.

## 7. 각 구현 단계의 검증 기준

- 프런트 코드 변경 후 npm run build.
- 순수 유틸·파싱·페이지네이션 변경 후 관련 npm test.
- Supabase 연결/환경변수 변경 후 npm run supabase:check.
- 라우팅·권한·폼·쓰기 흐름 변경 후 성공, 실패, 빈 입력, 중복 제출, 직접 URL 접근을 확인한다.
- 작업이 끝난 뒤에는 반드시 Playwright MCP 또는 Chrome DevTools MCP로 변경 부분을 브라우저에서 검증한다.
- 로그인 테스트는 .env의 E2E_TEST_EMAIL, E2E_TEST_PASSWORD를 사용하고 값을 로그나 문서에 노출하지 않는다.
- DB 스키마나 RPC를 실제로 변경한 경우에만 최종 스키마 재조회와 docs/guide_db.md 동기화를 수행한다.
- 계획만 작성하는 현재 단계에서는 코드 수정이 없으므로 브라우저 검증은 실행하지 않는다.

## 8. 승인 대기

이 문서는 기존 완료 계획을 삭제하고 새로 작성한 리팩터링 계획이다. 사용자 확인 전에는 위 항목의 애플리케이션 코드를 수정하지 않는다.
