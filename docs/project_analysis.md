# Review Manager Backoffice 프로젝트 분석

작성일: 2026-04-23  
최종 갱신일: 2026-04-30

## 1. 프로젝트 개요

이 프로젝트는 리뷰 운영자를 위한 백오피스 프런트엔드입니다.  
기술적으로는 `Vite + React + React Router + Supabase` 조합으로 구성되어 있고, 별도 서버 없이 클라이언트에서 직접 Supabase 데이터를 조회하고 수정하는 구조입니다.

2026-04-23 기준으로 1차 구조 리팩터링이 반영되어, 현재는 라우팅 엔트리, 페이지, 공통 레이아웃, 상품 상세 하위 컴포넌트, Supabase 서비스, 순수 유틸, 스타일 레이어가 기본적으로 분리된 상태입니다.

현재 확인된 핵심 기능은 아래와 같습니다.

- 관리자 로그인
- 실제 운영 데이터 기반 관리자 대시보드
- 관리자별 상품 목록 조회
- 관리자 상품전체보기 조회
- 상품 상세 진입
- 상품 단계(`applications`, `purchase`, `review`) 활성화/비활성화
- 신청자 확정 처리
- 구매/리뷰 제출 데이터 조회
- 제출 데이터 수기 추가
- 제출 완료 체크
- 제출 데이터 삭제
- 증빙 사진 썸네일 및 모달 뷰어
- 내보내기 메뉴 7종(전체상품, 내상품, 일자별, 상품별, 입금일 기준, 상태별, 신청자 명단)
- 파일 업로드 메뉴 진입점 및 Excel 파싱/미리보기/DB 반영

현재 프로젝트의 성격은 "빠르게 운영 가능한 내부용 백오피스 MVP"에 가깝습니다. 기능은 이미 운영 흐름을 충분히 담고 있지만, 보안과 유지보수성 관점에서는 구조 개선 여지가 큽니다.

## 2. 기술 스택

- 번들러: Vite 5
- UI: React 18
- 라우팅: React Router DOM 7
- 데이터 연동: `@supabase/supabase-js`
- 스타일링: 전역 CSS 중심
- 환경변수: Vite env + `dotenv`

현재는 테스트 프레임워크, 상태 관리 라이브러리, 서버 API 레이어 없이 비교적 단순한 프런트 단독 구조입니다.

## 3. 현재 디렉터리 구조

```text
src/
  main.jsx                앱 진입점 + 스타일 레이어 로드
  App.jsx                 최상위 라우팅 엔트리
  constants/
    admin.js              관리자 저장 키, 탭/스텝 상수
  hooks/
    useAdminDashboard.js     대시보드 조회/집계/범위 토글 상태 관리
    useAdminExportData.js    내보내기 데이터 조회/범위 토글/행 변환
    useExportColumnSelection.js
                          내보내기 컬럼 프리셋·체크박스·localStorage
    useAdminProductDetail.js
                          상품 상세 상태/조회/변경 흐름 관리
  components/
    layout/
      AdminLayout.jsx     관리자 공통 레이아웃
    admin/dashboard/
      DashboardKpiGrid.jsx
      DashboardAlerts.jsx
      DashboardTrendChart.jsx
      DashboardActivityPanels.jsx
      DashboardCompanyMembers.jsx
                          대시보드 KPI/알림/추이/활동/회사 비교 UI 컴포넌트
    admin/product-detail/
      ProductSummary.jsx
      SubmissionInput.jsx
      StepTabList.jsx
      ApplicationsTable.jsx
      SubmissionTable.jsx
      PhotoViewerModal.jsx
                          상품 상세 하위 UI 컴포넌트
    admin/export/
      ExportPageLayout.jsx
      ExportColumnSelector.jsx
      ExportToolbar.jsx
      ExportPreviewTable.jsx
      ExportDateFilterPanel.jsx
      ExportDownloadButton.jsx
      ExportWorkbookDownloadButton.jsx
                          내보내기 공용 레이아웃·컬럼 선택·미리보기·필터·다운로드 UI
    public/
      PublicReviewReceiveSection.jsx
                          구매자용 리뷰받기 읽기 전용 섹션 컴포넌트
      PublicPhotoUploadModal.jsx
                          구매자용 사진 업로드/저장 모달
  pages/
    admin/
      LoginPage.jsx
      AdminDashboardPage.jsx
      AdminProductOverviewPage.jsx
      AdminProductsPage.jsx
      AdminProductDetailPage.jsx
      AdminReviewReceivePage.jsx
      AdminReviewReceiveDetailPage.jsx
      AdminExportAllProductsPage.jsx
      AdminExportMyProductsPage.jsx
      AdminExportByDatePage.jsx
      AdminExportByProductPage.jsx
      AdminExportByDepositDatePage.jsx
      AdminExportByStatusPage.jsx
      AdminExportApplicationsPage.jsx
      AdminFileUploadPage.jsx
                          내보내기 하위 페이지(전체상품·내상품·일자별·상품별·입금일·상태별·신청자)
                          관리자 페이지 컴포넌트
    public/
      PublicReviewReceiveDetailPage.jsx
                          구매자용 리뷰받기 상세 페이지
  lib/supabase.ts         Supabase 클라이언트 생성
  services/
    adminAuth.js          관리자 로그인 조회
    adminProducts.js      관리자 상품 목록 조회
    dashboardMetrics.js   대시보드 데이터 조회
    productOverview.js    상품전체보기 조회
    productDetail.js      상품 상세 관련 조회/수정/삭제
    reviewReceivePublic.js
                          구매자용 리뷰받기 조회 + 사진 업로드 함수 호출 서비스
    reviewReceive.js      리뷰받기 상세 조회/수정/삭제
    exportData.js         내보내기용 products/submissions 등 조회
    fileUpload.js         파일 업로드 products 생성 및 submissions 주문번호 기준 저장
  utils/
    applicationRows.js    신청자 정렬 유틸
    dashboardMetrics.js   대시보드 날짜/상태/집계/Top N/최근 활동 유틸
    productOverviewRows.js
                         상품전체보기 평탄화/정렬/필터 유틸
    submissionParser.js   제출 문자열 파싱 유틸
    reviewReceiveRows.js  리뷰받기 섹션 분리/정렬 유틸
    exportColumns.js      내보내기 컬럼·프리셋·행 변환
    exportDateFilters.js  내보내기 날짜 필터 기본값/빠른 범위 유틸
    exportFile.js         xlsx 기반 Excel 다운로드
    fileUploadParser.js   Excel 파일 업로드 행 파싱/상품 블록 변환
    fileUploadValidation.js
                          파일 업로드 날짜/금액/계좌/상태값 검증 유틸
    fileUploadTemplate.js 파일 업로드 샘플 Excel 다운로드 유틸
  styles/
    base.css              공통 토큰/전역 UI 규칙
    login.css             로그인 화면 전용 스타일
    admin-shell.css       관리자 레이아웃/공통 패널 스타일
    admin-dashboard.css   대시보드 전용 스타일
    admin-product-detail.css
                          상품 상세 전용 스타일
    admin-export.css
                          내보내기 전용 스타일
    public-review-receive.css
                          구매자용 리뷰받기 전용 스타일

scripts/
  check-supabase.mjs      Supabase 연결 확인 스크립트

supabase/
  functions/
    review-receive-photo-sync/
      index.ts            구매자용 사진 업로드 presigned URL/S3/DB 연동 함수

docs/
  guide_db.md             DB 스키마 및 샘플 데이터 문서
  project_analysis.md     현재 문서

AGENTS.md                 Codex 작업 규칙 문서
SUPABASE_SETUP.md         Supabase 연동 절차 문서
```

현재 구조의 핵심 특징은 아래와 같습니다.

- `src/App.jsx`는 라우팅 엔트리 역할만 담당합니다.
- 페이지 단위 컴포넌트는 `src/pages/admin/*`, `src/pages/public/*` 아래로 분리되어 있습니다.
- Supabase 접근은 `src/services/*`에서 관리합니다.
- 순수 파싱/정렬 로직은 `src/utils/*`와 `src/constants/*`로 이동했습니다.
- 대시보드는 실제 `products`, `submissions`, `applications`, `evidence_photos`, `admins` 데이터를 서비스/유틸/훅으로 분리해 조회·집계합니다.
- 가장 복잡한 상품 상세 화면은 페이지 + 훅 + 하위 컴포넌트 구조로 정리되었습니다.
- `상품전체보기` 화면은 별도 페이지 + 조회 서비스 + 행 변환 유틸로 분리돼 있습니다.
- 구매자용 공개 리뷰받기 화면은 공개 페이지 + 공개 서비스 + 공용 행 정렬/섹션 유틸 + 사진 업로드 모달 구조로 분리되었습니다.
- 실제 사진 저장은 Supabase Edge Function `review-receive-photo-sync`를 통해 presigned URL 발급 후 S3 업로드, `evidence_photos` 저장/삭제를 수행합니다.

## 4. 실행 방식

`package.json` 기준으로 제공되는 스크립트는 아래 4개입니다.

- `npm run dev`: 개발 서버 실행
- `npm run build`: 프로덕션 빌드
- `npm run preview`: 빌드 결과 미리보기
- `npm run supabase:check`: Supabase 연결 확인

프런트 환경변수는 `.env.example` 기준으로 아래 값이 필요합니다.

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Node 스크립트용 대체 키도 지원합니다.

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

구매자용 사진 업로드까지 운영하려면 Supabase Edge Function 시크릿도 필요합니다.

- `AWS_S3_REGION`
- `AWS_S3_BUCKET`
- `AWS_S3_ACCESS_KEY_ID`
- `AWS_S3_SECRET_ACCESS_KEY`
- `AWS_S3_UPLOAD_PREFIX` (선택)
- `AWS_S3_PUBLIC_BASE_URL` (선택)

## 5. 화면 및 라우팅 구조

현재 라우팅은 다음과 같습니다.

- `/admin/login`: 로그인 화면
- `/admin`: 관리자 대시보드
- `/admin/product`: 상품 목록
- `/admin/product/specific/:productId`: 상품 상세
- `/admin/product-overview/all`: 관리자 상품전체보기 전체보기
- `/admin/product-overview/status`: 관리자 상품전체보기 상태별보기
- `/admin/review-receive/all`: 관리자 리뷰받기 전체보기
- `/admin/review-receive/in-progress`: 관리자 리뷰받기 진행중보기
- `/admin/review-receive/completed`: 관리자 리뷰받기 완료보기
- `/admin/review-receive/specific/:productId`: 관리자 리뷰받기 상세
- `/admin/export`: 내보내기 (기본 하위로 리다이렉트)
- `/admin/export/all-products` 등: 내보내기 하위(전체상품·내상품·일자별·상품별·입금일·상태별·신청자 명단)
- `/admin/file-upload`: 파일 업로드
- `/admin/setting`: 관리자 설정
- `/review-receive/specific/:productId`: 구매자용 리뷰받기 상세
- `/`: 로그인으로 리다이렉트
- `*`: 로그인으로 리다이렉트

이 프로젝트는 관리자 영역과 공개 영역을 분리하는 규칙을 갖고 있습니다.

- 인증이 필요한 백오피스 페이지는 `/admin/*` 아래에 둡니다.
- 공개 페이지나 구매자 페이지에는 `/admin/*` 네임스페이스를 사용하지 않습니다.

현재는 관리자 백오피스와, 이름 입력 후 본인 배정 submission만 조회하고 구매완료 섹션에서 사진을 실제 업로드할 수 있는 구매자용 공개 리뷰받기 페이지가 함께 구현되어 있습니다.
관리자 대시보드는 `review_manager_include_company_data` 체크박스를 공유해 본인 데이터와 같은 회사 소속 관리자 데이터를 전환하며, 오늘 KPI, 누적 운영 상태, 조건 기반 알림, 14일/30일 추이, 상위 상품, 최근 활동, 회사 멤버 비교를 실제 운영 데이터 기준으로 보여줍니다.
관리자 백오피스에는 `admin_menu_permissions.menu_number = 4` 권한으로 제어되는 `상품전체보기` 메뉴가 추가되어, 왼쪽 메뉴의 하위 선택 메뉴에서 `전체보기`와 `상태별보기` 경로로 나뉘어 `products` + `submissions`를 필터 기준으로 일괄 처리할 수 있습니다.
`admin_menu_permissions.menu_number = 3`인 `리뷰받기` 메뉴도 하위 선택 메뉴를 가지며, `전체보기`, `진행중보기`, `완료보기` 경로에서 상품별 submission의 `is_deposit_verified` 집계 상태를 기준으로 같은 목록을 필터링해 보여줍니다.
`admin_menu_permissions.menu_number = 5`인 `내보내기` 메뉴는 하위 경로가 `/admin/export/*`이며, 현재 `전체상품`, `내상품`, `일자별`, `상품별`, `입금일 기준`, `상태별`, `신청자 명단` 화면에서 Excel 내보내기(컬럼 선택·미리보기·기간 필터·상태/상품 필터)를 제공합니다.
`admin_menu_permissions.menu_number = 6`인 `파일 업로드` 메뉴는 `/admin/file-upload` 경로를 사용합니다. Excel 파일 선택/드래그앤드롭/붙여넣기, 파싱 결과 미리보기, 오류/경고/스킵 행 표시, 오류 행 제외 후 저장 예정 데이터 확인, 샘플 양식 다운로드, Supabase `products` 생성 및 `submissions` 주문번호 기준 insert/update 흐름을 제공합니다.

## 6. 인증 및 데이터 흐름 요약

### 로그인

1. 사용자가 아이디/비밀번호 입력
2. `admins` 테이블에서 `login_id`, `password` 일치 여부 조회
3. 성공 시 `localStorage`에 `review_manager_admin_id` 저장
4. `/admin`으로 이동

즉, 현재 인증은 정식 세션 기반 인증이 아니라 로컬 스토리지 식별자 저장 방식입니다. Supabase Auth 기반 구조가 아니라는 점을 항상 전제로 보고 작업해야 합니다.

### 상품 목록

1. `localStorage`에서 관리자 ID 읽기
2. `products` 테이블에서 `manager_id = adminId` 조건으로 조회
3. 목록에서 특정 상품 클릭 시 상세 화면 이동

### 대시보드

1. `localStorage`에서 관리자 ID와 `review_manager_include_company_data` 체크 상태를 읽습니다.
2. `resolveAdminManagerScope`로 본인 또는 회사 단위 `managerIds` 범위를 결정합니다.
3. `src/services/dashboardMetrics.js`가 `products`, `submissions`, `applications`, `evidence_photos`를 필요한 컬럼만 조회합니다.
4. 회사 데이터 포함이 켜져 있고 회사명이 있으면 같은 회사의 `admins` 목록도 조회합니다.
5. `src/utils/dashboardMetrics.js`가 오늘/누적 KPI, 알림 조건, 기간별 추이, 상위 상품, 최근 활동, 회사 멤버 비교 데이터를 순수 함수로 집계합니다.
6. `src/hooks/useAdminDashboard.js`가 로딩/오류/새로고침/회사 데이터 포함 토글 상태를 관리하고, `src/components/admin/dashboard/*` 컴포넌트가 각 섹션을 렌더링합니다.

### 상품 상세

상세 화면은 3개 운영 탭을 중심으로 동작합니다.

- `applications`: 신청자 목록 및 확정 처리
- `purchase`: 구매 제출 목록, 증빙 사진, 완료 체크
- `review`: 리뷰 제출 목록, 증빙 사진, 완료 체크

동시에 `product_steps` 테이블을 조회해 단계 활성 여부를 제어합니다.

## 7. DB 의존 구조

기존 `docs/guide_db.md` 기준으로 핵심 관계는 아래와 같습니다.

- `admins` 1:N `products`
- `products` 1:N `product_steps`
- `products` 1:N `applications`
- `products` 1:N `submissions`
- `submissions` 1:N `evidence_photos`

코드에서 실제로 사용하는 주요 테이블은 아래와 같습니다.

- `admins`
- `products`
- `product_steps`
- `applications`
- `submissions`
- `evidence_photos`
- `evidence_photo` (`evidence_photos` 미존재 시 fallback)

즉, 사진 테이블은 스키마 불일치 가능성을 감안해 `evidence_photos`와 `evidence_photo` 두 이름을 모두 대응하도록 작성되어 있습니다. 이런 예외 로직은 코드와 문서가 함께 유지되어야 합니다.

## 8. 현재 구현의 장점

- 프로젝트 크기가 작아 진입 장벽이 낮습니다.
- Supabase 클라이언트 구성이 단순해서 로컬 개발이 쉽습니다.
- 상품 단계별 운영 흐름이 UI에 직접 드러나 있어 업무 목적이 분명합니다.
- 사진 테이블 fallback, 입력 파싱, 중복 주문번호 체크 등 운영 편의 로직이 이미 존재합니다.
- 로그인 화면과 관리자 화면의 시각적 방향이 비교적 명확하고, 메인 컬러도 하늘색 계열로 정리되어 있습니다.
- 라우트, 페이지, 서비스, 유틸, 스타일 레이어가 1차 분리되어 책임 경계가 이전보다 명확합니다.
- 상품 상세 페이지가 훅과 하위 컴포넌트로 쪼개져, 이후 수정 시 회귀 범위를 줄이기 쉬워졌습니다.

## 9. 현재 구조의 한계

### 1) 상품 상세 도메인 복잡도는 여전히 높음

- `src/App.jsx` 집중 문제는 해소됐지만, 상품 상세 도메인은 여전히 이 프로젝트에서 가장 복잡한 영역입니다.
- `useAdminProductDetail` 훅이 상태/조회/변경 흐름을 담당하고 있어, 기능이 더 늘어나면 추가 분리 포인트가 생길 수 있습니다.

영향:

- 단계별 정책, 제출 입력 검증, 사진 처리 규칙이 더 복잡해지면 훅 자체가 다시 비대해질 수 있습니다.
- 도메인 규칙 테스트가 없어서 리팩터링 안정성이 아직 빌드와 수동 확인에 의존합니다.

### 2) 데이터 계약이 암묵적임

- 테이블 응답 구조와 단계명, 상태값이 명시적으로 정리되어 있지 않습니다.
- 문자열 기반 입력 파싱이 컴포넌트 가까이에 묶여 있습니다.

영향:

- 입력 형식이 조금만 변해도 실패 가능성이 큽니다.
- 반복되는 도메인 규칙을 안전하게 재사용하기 어렵습니다.

### 3) 스타일은 분리됐지만 여전히 전역 클래스 기반

- 스타일은 `base`, `login`, `admin-shell`, `admin-dashboard`, `admin-product-detail`로 나뉘었지만 CSS Modules나 CSS-in-JS처럼 완전한 범위 격리는 아닙니다.
- 클래스 이름 충돌 위험은 낮아졌지만, 여전히 전역 선택자 관리 규율이 중요합니다.

### 4) 테스트 기반이 약함

- 현재 별도 테스트 코드가 없습니다.
- 변경 후 안정성 확인이 빌드와 수동 확인에 많이 의존합니다.

## 10. 운영/보안 관점 리스크

### 1) 인증 구조가 약함

현재 로그인은 `admins` 테이블에서 ID/비밀번호를 직접 조회하는 방식입니다.  
클라이언트가 Supabase에 직접 접근하고, 인증 상태도 `localStorage` 문자열로만 유지합니다.

영향:

- 정식 인증 세션, 만료, 권한 위임 구조가 없습니다.
- RLS가 약하거나 꺼져 있으면 데이터 보호가 어렵습니다.
- 비밀번호를 평문 또는 유사 형태로 다룰 가능성이 큽니다.

### 2) 클라이언트가 직접 쓰기 권한을 가짐

`applications`, `submissions`, `product_steps`에 대해 브라우저에서 직접 `insert`, `update`, `delete`를 수행합니다.

영향:

- 권한 모델이 약하면 임의 수정 가능성이 커집니다.
- 운영 로직 검증이 UI에 묶여 있어 우회가 쉽습니다.

### 3) UI와 도메인 로직 결합은 줄었지만 완전히 해소되진 않음

상품 상세는 이전보다 분리됐지만, 여전히 화면 레벨에서 운영 정책을 직접 조합합니다.

영향:

- 운영 정책 변경 시 훅, 서비스, UI 컴포넌트를 함께 수정해야 할 수 있습니다.
- 서비스는 분리됐지만 도메인 규칙 자체를 검증하는 테스트 인프라가 아직 없습니다.

## 11. 현재 권장 개발 방식

이 저장소는 `AGENTS.md`를 기준으로 작업 규칙을 관리합니다. 새 작업은 아래 기준을 기본으로 따르는 것이 좋습니다.

### 1) 기존 구현 우선 재사용

- 새 파일을 만들기 전에 기존 구현부터 탐색합니다.
- 작은 요구사항은 현재 구조 안에서 최소 수정으로 해결합니다.
- 새 파일이나 추상화는 유지보수성 개선이 분명할 때만 도입합니다.

우선 탐색 위치:

- `src/App.jsx`
- `src/pages/admin/*`
- `src/components/layout/*`
- `src/components/admin/product-detail/*`
- `src/hooks/useAdminProductDetail.js`
- `src/services/*`
- `src/utils/*`
- `src/constants/*`
- `src/lib/supabase.ts`
- `src/styles/*`
- `scripts/check-supabase.mjs`

### 2) 점진적 분리

큰 작업에서는 아래 순서로 분리하는 것이 좋습니다.

- 라우팅 정의와 페이지 구현 분리
- 페이지와 공통 컴포넌트 분리
- Supabase 쿼리와 데이터 변환 로직 분리
- 파싱/정렬/포맷팅 로직을 유틸로 분리

권장 구조 예시:

```text
src/
  pages/
  components/
  hooks/
  constants/
  services/
  utils/
  styles/
```

단, 사소한 수정에 과도한 구조 분리는 오히려 복잡도를 높일 수 있으므로 피합니다.

### 3) React 작업 원칙

- 파생 가능한 값은 상태로 중복 저장하지 않습니다.
- 부수효과는 실제 외부 동기화가 필요한 경우에만 사용합니다.
- 장문의 조건문, 파싱, 데이터 변환이 JSX에 섞이면 위로 끌어올리거나 유틸로 분리합니다.
- 로딩, 에러, 빈 상태를 생략하지 않습니다.
- 폼은 입력값, 검증, 제출 상태를 명확히 구분합니다.

### 4) Supabase 작업 원칙

- 쿼리는 필요한 컬럼만 선택합니다.
- 동일한 쿼리를 화면 내부에 중복 작성하지 않습니다.
- 조회/생성/수정/삭제 흐름은 가능하면 함수 단위로 분리합니다.
- 테이블명 fallback 같은 예외 처리 로직은 코드와 문서에 함께 반영합니다.
- 기존 `admins` 직접 조회 로그인 패턴은 레거시로 취급하고, 새 인증 설계에는 재사용하지 않습니다.

### 5) UI 작업 원칙

- 메인 컬러는 하늘색 계열을 유지합니다.
- 버튼, 포커스 링, 링크, 주요 배지는 하늘색 톤으로 일관성을 맞춥니다.
- 반응형, 포커스 상태, 키보드 접근성을 함께 고려합니다.
- 로딩 중/비활성 상태는 숨기지 말고 사용자에게 드러냅니다.

### 6) 검증 원칙

작업 후 기본적으로 아래 검증을 우선합니다.

- 프런트 코드 변경 시 `npm run build`
- Supabase 연결/환경변수 변경 시 `npm run supabase:check`
- 라우팅 변경 시 주요 경로 진입 흐름 점검
- 폼/제출 흐름 변경 시 성공, 실패, 빈 입력 케이스 점검

### 7) 문서 동기화 원칙

아래 상황에서는 문서도 함께 업데이트해야 합니다.

- DB 스키마 변경: `docs/guide_db.md`
- 구조나 책임 분리 변화: `docs/project_analysis.md`
- 실행 방법이나 환경변수 변경: 관련 문서

## 12. 우선 개선 권장사항

### 우선순위 1

- 로그인 방식을 Supabase Auth 또는 서버 검증 기반으로 전환
- `admins.password` 직접 조회 구조 제거
- RLS 정책 점검 및 관리자 범위 제한

### 우선순위 2

- `useAdminProductDetail`에서 더 커질 가능성이 있는 책임을 추가 분리
- 예: 사진 뷰어 상태, 제출 추가 폼 상태, 탭별 데이터 로딩 전략
- 도메인 훅 또는 더 작은 서비스 조합으로 나누는 방향 검토

### 우선순위 3

- `parseSubmissionText` 실패 케이스에 대한 테스트 추가
- 입력 포맷 가이드 UI 추가
- 주문번호 중복 검사와 제출 추가 흐름에 대한 최소 smoke test 마련

### 우선순위 4

- 제출/삭제/단계 토글 관련 로직에 대한 테스트 또는 최소 smoke test 추가
- 사진 테이블 fallback 로직 명시적 검증
- 스타일 레이어를 유지하되 화면 증가 시 naming rule과 공통 토큰 정책 보강

## 13. 추천 리팩터링 방향

현재 구조를 기준으로 다음 리팩터링 단계는 아래 방향이 현실적입니다.

```text
src/
  pages/
    admin/
      LoginPage.jsx
      AdminDashboardPage.jsx
      AdminProductsPage.jsx
      AdminProductDetailPage.jsx
  components/
    layout/
      AdminLayout.jsx
    admin/product-detail/
      ProductSummary.jsx
      SubmissionInput.jsx
      StepTabList.jsx
      ApplicationsTable.jsx
      SubmissionTable.jsx
      PhotoViewerModal.jsx
  hooks/
    useAdminProductDetail.js
  services/
    adminAuth.js
    adminProducts.js
    productDetail.js
  constants/
    admin.js
  utils/
    submissionParser.js
    applicationRows.js
  styles/
    base.css
    login.css
    admin-shell.css
    admin-dashboard.css
    admin-product-detail.css
```

이후에는 "추가 분리"보다 "어떤 도메인 규칙을 테스트 가능한 단위로 안정화할지"가 더 중요한 과제가 됩니다.

## 14. 현재 상태 한줄 평가

이 프로젝트는 운영 목적의 내부 백오피스로서 이미 실용적이고, 1차 구조 분리도 끝난 상태이지만,  
장기 운영과 기능 확장을 고려하면 이제는 인증 개선과 도메인 테스트 보강이 다음 핵심 과제입니다.
