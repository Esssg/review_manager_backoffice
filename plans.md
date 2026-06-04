# products bundle_id 기반 리뷰받기 구조 변경 계획

작성일: 2026-06-04

## 목표

- `public.products`에 `bundle_id` int 컬럼을 추가한다.
- 새 테이블을 만들지 않고, 같은 `bundle_id`를 가진 여러 `products` row를 하나의 묶음으로 취급한다.
- 리뷰받기 화면에서 "날짜 + 업체명"을 번들의 공통 정보로 보여주고, 품명/옵션/리뷰형태/입금구분/설명/상품 제목 등은 품목별 상세 정보로 분리한다.
- 여러 상품이 같은 `bundle_id`를 가지면 하나의 리뷰받기 상세 페이지에서 함께 확인할 수 있게 한다.

## 현재 확인한 구조

- 리뷰받기 목록/상품 추가 화면은 `src/pages/admin/AdminReviewReceivePage.jsx`가 중심이다.
- 리뷰받기 상세 화면은 `src/pages/admin/AdminReviewReceiveDetailPage.jsx`가 중심이다.
- 상품 목록 조회/생성/수정/삭제는 `src/services/adminProducts.js`에서 처리한다.
- 리뷰받기 상세 조회/제출 데이터 CRUD는 `src/services/reviewReceive.js`에서 처리한다.
- 현재 `products.title`과 `products.product_name`은 DB 문서상 `not null`이며, 현재 생성 로직도 둘 다 필수로 검증한다.
- 새 확인/선택 UI는 브라우저 기본 `alert`, `confirm`, `prompt`가 아니라 `src/components/common/AppAlertDialog.jsx`를 재사용하거나 확장해야 한다.

## 먼저 확인해야 하는 질문

아래 항목은 임의로 판단하지 않고 답변을 받은 뒤 구현한다.

1. `products.title`, `products.product_name`은 현재 `not null`이다. "여러 상품 등록"에서 날짜와 업체명만 받는 경우, 최초 placeholder row를 만들지 않고 바로 품목 입력 단계로 넘어가야 하는지, 아니면 임시값을 넣어 row를 먼저 만들어야 하는지 결정이 필요하다.
-> not null 제약을 삭제
-> 첫번째 묶음을 추가하면 이미 만들어진 행에 추가하고 그 뒤에 2개, 3개째는 새로운 행을 만들어서 넣으며 bundle_id를 동일하게 가져감
2. `bundle_id` 값 생성 방식이 필요하다. 선택지는 예를 들어 `첫 번째 products.id를 bundle_id로 사용`, `DB sequence로 별도 번호 발급`, `현재 max(bundle_id)+1을 프런트에서 계산` 등이 있는데, 어떤 방식으로 할지 확정해야 한다.
-> products.id랑 동일한 값으로 넣되 두번째 상품부터는 Products.id를 따라가지 않고 기존에 있던 bundle_id로 가져감
3. 기존 products row의 `bundle_id` 초기값이 필요하다. 기존 단일 상품은 `bundle_id = id`로 채울지, `null`로 두고 단일 상품은 `bundle_id ?? id`로 취급할지 결정이 필요하다.
-> products.id로 가져감
4. 상세 페이지 URL 기준이 필요하다. 현재는 `/admin/review-receive/specific/:productId`인데, 여러 상품 번들은 `:productId`를 대표 상품 id로 유지할지, `:bundleId`로 의미를 바꿀지 결정이 필요하다.
-> products.id로 그대로 가져감
-> 왜냐면 추가되는 상품은 또 새로운 products.id를 가지기 떄문
5. 공개 리뷰받기 URL(`/review-receive/specific/:productId`)도 같은 번들의 여러 상품을 보여줘야 하는지, 아니면 관리자 상세만 번들 구조로 바꾸는지 결정이 필요하다.
-> 여러 상품이 있는 경우 리뷰받기 페이지에서 URL 복사하기는 비활성화되며 상세페이지로 들어가서 각 상품에서 URL 복사하기 버튼이 있어야됨
6. 여러 품목 각각의 `submissions`는 현재처럼 각 `products.id`에 직접 연결하는 것이 맞는지 확인이 필요하다. 즉, 상세 페이지에서 품목 A를 펼치면 A의 submissions만 보이고, 품목 B를 펼치면 B의 submissions만 보이는 구조인지 확인해야 한다.
-> 맞음
7. "날짜, 업체명을 제외한 나머지 정보를 받는 버튼"의 위치와 의미가 필요하다. 목록의 번들 행에서 누르는 버튼인지, 상세 상단에서 누르는 버튼인지, 각 품목 안에서 누르는 버튼인지 확정해야 한다.
-> products에 같은 bundle_id를 가지는 추가 행을 생성하는 버튼임 최상단에 위치하면 됨 
-> 여러 상품이 있는 경우 행 추가 버튼이 각 품목 섹션 위치로 이동해야됨
8. 단일 상품 등록도 최상단에는 날짜/업체명만 보여주고 나머지를 비워둔다고 했는데, 기존 단일 상품 양식으로 받은 제목/품명/옵션 등은 저장은 하되 상세 상단에만 숨기는 것인지, 최초 저장 시에도 날짜/업체명 외에는 저장하지 않는 것인지 확인해야 한다.
-> 날짜, 업체명만 보이는 섹션1개
-> 그 밑에 각 품목의 정보가 보이는 섹션 1개
-> 그 밑에 submission 섹션 1개
-> 2번과 3번 섹션은 또 큰 하나의 섹션으로 묶이며 펼치기가 가능해야됨
9. 여러 상품 등록 시 처음에 몇 개의 품목을 만들 수 있어야 하는지 필요하다. 예: 빈 품목 1개로 시작 후 추가 버튼, 개수 입력 후 여러 품목 생성, 붙여넣기/일괄 입력 지원.
-> 처음에는 하나만 만듬
-> 상세페이지에서 추가하는 형태
10. 목록 화면에서 같은 번들에 속한 여러 `products`를 한 행으로 합쳐 보여줘야 하는지, 아니면 목록에서는 row를 그대로 두고 상세 진입만 묶어서 보여주는지 결정이 필요하다.
-> 하나의 품목만 매핑된 Product의 경우 기존대로 보여주면 됨
-> 여러 품목이 매핑된 경우 리뷰받기에서는 여러행이 매핑된 거라고 보여주면됨
11. 번들 삭제/수정 정책이 필요하다. 같은 `bundle_id` 전체를 삭제/수정할지, 품목 하나만 삭제/수정할 수 있어야 하는지 확인해야 한다.
-> 품목 하나만 삭제/수정 가능해야됨
12. 파일 업로드, 상품전체보기, 내보내기, 사진내려받기 화면도 `bundle_id`를 표시하거나 번들 기준으로 묶어야 하는지 확인이 필요하다.
-> 리뷰받기에서만 모아서 볼 수 있는거고 내보내기 등은 개별 행으로 취급

## DB 변경 계획

질문 답변 후 아래 순서로 진행한다.

1. Supabase 최종 스키마를 확인한다.
2. `supabase/migrations/YYYYMMDDHHMMSS_add_bundle_id_to_products.sql`을 추가한다.
3. `public.products`에 `bundle_id integer` 컬럼을 추가한다.
4. 기존 row backfill 정책에 맞춰 `bundle_id`를 채운다.
5. 필요한 경우 `bundle_id` 조회용 index를 추가한다.
6. 실제 Supabase DB에 마이그레이션을 적용한다.
7. 적용 후 Supabase에서 최종 스키마를 다시 확인한다.
8. `docs/guide_db.md`에 `products.bundle_id`와 번들 계약을 반영한다.

## 코드 변경 계획

### 1. 데이터 접근 레이어

1. `src/services/adminProducts.js`의 리뷰받기 products select에 `bundle_id`를 추가한다.
2. `src/services/reviewReceive.js`의 상세 조회 select에 `bundle_id`, `product_date`, `company_name`을 포함한다.
3. 상세 조회 함수는 현재 product 하나만 가져오는 구조에서, 기준 product의 `bundle_id`를 확인한 뒤 같은 `bundle_id`의 products와 각 product의 submissions를 함께 가져오는 구조로 바꾼다.
4. `bundle_id` 컬럼이 아직 없는 환경에서의 fallback을 유지할지 여부를 결정하고, 필요하면 현재 `product_date`, `deposit_GB` fallback 패턴을 확장한다.

### 2. 리뷰받기 목록 화면

1. `상품 추가하기` 클릭 시 단일/여러 상품 선택 다이얼로그를 띄운다.
2. 단일 상품 선택 시 현재 양식을 기본으로 사용하되, 저장 payload에 `bundle_id`를 포함한다.
3. 여러 상품 선택 시 날짜/업체명만 받는 1단계 폼을 띄운다.
4. 질문 답변에 따라 목록을 `bundle_id` 기준 한 행으로 묶거나 기존 products row 목록을 유지한다.
5. 목록에서 상세 이동 시 번들 기준 상세로 이동하도록 라우팅 파라미터 해석을 맞춘다.

### 3. 리뷰받기 상세 화면

1. 상단 공통 섹션은 날짜와 업체명만 표시한다.
2. 품목별 영역을 추가하고, 각 품목은 접기/펼치기 가능한 패널로 만든다.
3. 품목 패널 안에 품명, 옵션, 리뷰형태, 제품비 입금구분, 리뷰비 입금구분, 설명, 상품 제목 등 기존 상품 상세 정보를 표시한다.
4. "나머지 정보 입력" 버튼을 추가해 품목 정보를 입력/수정할 수 있게 한다.
5. 각 품목 패널 안에서 해당 `product_id`의 submissions 섹션을 보여준다.
6. 기존 구매완료/리뷰완료/전체완료 테이블 로직은 품목 단위로 재사용하되, 상태/필터/일괄입력/엑셀 다운로드가 품목별로 독립적으로 동작하도록 분리한다.

### 4. 공개 리뷰받기 화면

공개 화면도 번들 상세를 보여줘야 한다면 별도 작업이 필요하다.

1. `src/services/reviewReceivePublic.js`에서 기준 product의 bundle을 조회한다.
2. `src/pages/public/PublicReviewReceiveDetailPage.jsx`에서 날짜/업체명 공통 섹션과 품목별 접기/펼치기를 추가한다.
3. 이름/계좌주 조회 결과를 전체 번들 submissions에서 찾을지, 품목별로 찾을지 정책에 맞게 구현한다.

공개 화면은 기존 product 하나 기준을 유지한다면 이 단계는 제외한다.

### 5. 다른 화면 영향 반영

필요하다고 확정된 경우에만 아래 화면에 반영한다.

- `상품전체보기`: `bundle_id` 컬럼 표시 또는 번들 필터 추가
- `내보내기`: products 컬럼 프리셋에 `bundle_id` 추가
- `사진내려받기`: 번들 단위 필터/표시 지원
- `파일 업로드`: 업로드되는 여러 products에 같은 `bundle_id` 부여 지원
- `대시보드`: 상품 수 집계를 row 기준으로 유지할지 번들 기준으로 바꿀지 결정 후 반영

## 검증 계획

1. DB 적용 후 `npm run supabase:check`를 실행한다.
2. 프런트 변경 후 `npm run build`를 실행한다.
3. Playwright로 관리자 리뷰받기 목록, 상품 추가 선택 다이얼로그, 단일 상품 등록, 여러 상품 등록, 상세 접기/펼치기, submissions 표시를 확인한다.
4. 공개 화면이 변경 범위에 포함되면 공개 URL에서도 조회/사진 업로드 흐름을 확인한다.
5. DB 스키마 변경이 있으므로 `docs/guide_db.md` 갱신 여부를 최종 확인한다.

## 구현 보류 조건

위 "먼저 확인해야 하는 질문" 중 DB 저장 방식, URL 기준, 공개 화면 영향 범위, submissions 표시 단위가 확정되기 전에는 구현을 시작하지 않는다.
