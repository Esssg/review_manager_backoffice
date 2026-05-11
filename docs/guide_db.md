# DB Guide (`public` schema)

기준 프로젝트: `review_manager_backoffice` (`zwqmvttrburcwbdsunwo`)  
테이블/컬럼 재확인 시각: 2026-04-26 KST  
row count / 샘플 데이터 최종 확인 시각: 2026-04-30 KST (`파일 업로드` 메뉴 권한 추가 뒤 갱신)

## 1) 테이블 관계 요약

- `admins` 1 --- N `products` (`products.manager_id -> admins.login_id`)
- `admins` 1 --- N `admin_menu_permissions` (`admin_menu_permissions.admin_id -> admins.login_id`)
- `products` 1 --- N `product_steps` (`product_steps.product_id -> products.id`)
- `products` 1 --- N `applications` (`applications.product_id -> products.id`)
- `products` 1 --- N `submissions` (`submissions.product_id -> products.id`)
- `submissions` 1 --- N `evidence_photos` (`evidence_photos.submission_id -> submissions.id`)

## 2) 테이블별 스키마

## `admins`
- PK: `login_id` (text)
- 컬럼
  - `login_id` text, not null
  - `password` text, not null
  - `username` text, null
  - `phone_number` text, null
  - `email` text, null
  - `company` text, null
  - `created_at` timestamptz, default `now()`
- row count: 5
- 비고: 2026-04-25에 `company` 컬럼 추가

## `products`
- PK: `id` (bigint, identity)
- FK
  - `manager_id` -> `admins.login_id`
- 컬럼
  - `id` int8, identity
  - `manager_id` text, null
  - `title` text, not null
  - `product_name` text, not null
  - `deposit_date` date, null
  - `description` text, null
  - `is_real_shipping` bool, default `true`
  - `created_at` timestamptz, default `now()`
  - `company_name` text, null
  - `option_name` text, null
  - `review_type` text, null
  - `planned_depositor_name` text, null
- row count: 124
- 비고: 2026-04-24에 `company_name`, `option_name`, `review_type`, `planned_depositor_name` 컬럼 추가
  2026-04-26에 `review_fee` 컬럼을 제거하고 `submissions.review_fee`로 이관

## `admin_menu_permissions`
- PK: `id` (bigint, identity)
- FK
  - `admin_id` -> `admins.login_id`
- Unique
  - (`admin_id`, `menu_number`)
- 컬럼
  - `id` int8, identity
  - `admin_id` text, not null
  - `menu_number` int4, not null
  - `menu_label` text, not null
  - `created_at` timestamptz, default `now()`
- row count: 26
- 비고: 관리자별 백오피스 메뉴 노출 권한 관리용 테이블
  `menu_number = 4`는 `상품전체보기` 메뉴에 사용
  `menu_number = 5`는 `내보내기` 메뉴에 사용 (2026-04-25 추가)
  `menu_number = 6`은 `파일 업로드` 메뉴에 사용 (2026-04-30 추가)
  2026-04-26에 테스트 계정 `test1`, `test2`, `test3`에는 `menu_number` 1, 3, 4, 5만 부여

## `product_steps`
- PK: `id` (bigint, identity)
- FK
  - `product_id` -> `products.id`
- 컬럼
  - `id` int8, identity
  - `product_id` int8, null
  - `step_number` int4, not null
- row count: 183
- 비고: 컬럼 목록은 2026-04-23 MCP 기준 재확인

## `applications`
- PK: `id` (bigint, identity)
- FK
  - `product_id` -> `products.id`
- 컬럼
  - `id` int8, identity
  - `product_id` int8, null
  - `applicant_name` text, not null
  - `is_confirmed` bool, default `false`
  - `created_at` timestamptz, default `now()`
- row count: 652
- 비고: 컬럼 목록은 2026-04-23 MCP 기준 재확인

## `submissions`
- PK: `id` (bigint, identity)
- FK
  - `product_id` -> `products.id`
- 컬럼
  - `id` int8, identity
  - `product_id` int8, null
  - `order_number` text, null
  - `buyer_name` text, null
  - `recipient_name` text, null
  - `purchase_account` text, null
  - `contact` text, null
  - `address` text, null
  - `bank_name` text, null
  - `bank_account` text, null
  - `account_holder` text, null
  - `amount` int4, null
  - `is_purchase_verified` bool, default `false`
  - `is_review_verified` bool, default `false`
  - `created_at` timestamptz, default `now()`
  - `assign_name` text, null
  - `is_deposit_verified` bool, default `false`
  - `deposited_at` date, null
  - `actual_depositor_name` text, null
  - `review_fee` int4, null
- row count: 1785
- 비고: 2026-04-24에 `assign_name`, `is_deposit_verified`, `deposited_at`, `actual_depositor_name` 컬럼 추가
  2026-04-26에 `products.review_fee` 값을 이관받는 `review_fee` 컬럼 추가

## `evidence_photos`
- PK: `id` (bigint, identity)
- FK
  - `submission_id` -> `submissions.id`
- 컬럼
  - `id` int8, identity
  - `submission_id` int8, null
  - `photo_type` text, not null
  - `image_url` text, not null
  - `created_at` timestamptz, default `now()`
- row count: 2435
- 비고: 컬럼 목록은 2026-04-23 MCP 기준 재확인

## 3) 샘플 데이터 (민감정보 마스킹)

## `admins` sample
- `login_id`: `2sssg`
- `username`: `이석진`
- `phone_number`: `010****1217`
- `email`: `lsg0***@naver.com`
- `company`: `null`

## `admins` dummy sample
- `login_id`: `test1`
- `username`: `테스트 관리자 1`
- `company`: `테스트커머스`
- 비고: `test1`, `test2`, `test3`은 화면/내보내기 검증용 대량 더미 계정

## `products` sample
- `id`: 1
- `manager_id`: `2sssg`
- `title`: `2026.04.13-17차 / 코스놀로지 슈퍼 워터프루프 에어리핏 시카 선크림, 1개, 50ml`
- `product_name`: `코스놀로지 슈퍼 워터프루프 에어리핏 시카 선크림`
- `deposit_date`: `2026-04-01`
- `company_name`: `나우프레시`
- `option_name`: `500gx1개`
- `review_type`: `텍스트`
- `planned_depositor_name`: `0401나우프레시`
- `is_real_shipping`: false

## `admin_menu_permissions` sample
- (`admin_id`: `2sssg`, `menu_number`: 1, `menu_label`: `대시보드`)
- (`admin_id`: `2sssg`, `menu_number`: 2, `menu_label`: `상품`)
- (`admin_id`: `2sssg`, `menu_number`: 3, `menu_label`: `리뷰받기`)
- (`admin_id`: `2sssg`, `menu_number`: 4, `menu_label`: `상품전체보기`)
- (`admin_id`: `2sssg`, `menu_number`: 5, `menu_label`: `내보내기`)
- (`admin_id`: `2sssg`, `menu_number`: 6, `menu_label`: `파일 업로드`)

## `admin_menu_permissions` dummy sample
- (`admin_id`: `test1`, `menu_number`: 1, `menu_label`: `대시보드`)
- (`admin_id`: `test1`, `menu_number`: 3, `menu_label`: `리뷰받기`)
- (`admin_id`: `test1`, `menu_number`: 4, `menu_label`: `상품전체보기`)
- (`admin_id`: `test1`, `menu_number`: 5, `menu_label`: `내보내기`)
- (`admin_id`: `test1`, `menu_number`: 6, `menu_label`: `파일 업로드`)

## `product_steps` sample
- (`id`: 1, `product_id`: 1, `step_number`: 1)
- (`id`: 2, `product_id`: 1, `step_number`: 2)
- (`id`: 3, `product_id`: 1, `step_number`: 3)

## `applications` sample (일부)
- (`id`: 1, `product_id`: 1, `applicant_name`: `이혜미`, `is_confirmed`: true)
- (`id`: 5, `product_id`: 1, `applicant_name`: `이석진`, `is_confirmed`: true)
- (`id`: 7, `product_id`: 1, `applicant_name`: `최영순`, `is_confirmed`: false)

## `submissions` sample
- `id`: 1
- `product_id`: 1
- `order_number`: `123456789`
- `buyer_name`: `이혜미`
- `recipient_name`: `이혜미`
- `purchase_account`: `dope****@naver.com`
- `contact`: `010****0826`
- `address`: `경기도 용인시 기흥구 ...`
- `bank_name`: `국민은행`
- `bank_account`: `698902-01-******`
- `account_holder`: `이혜미`
- `amount`: 17000
- `review_fee`: 1000
- `assign_name`: `null`
- `is_purchase_verified`: false
- `is_review_verified`: false
- `is_deposit_verified`: false
- `deposited_at`: `null`
- `actual_depositor_name`: `null`

## `evidence_photos` sample
- (`id`: 1, `submission_id`: 1, `photo_type`: `purchase`, `image_url`: `https://...`)
- (`id`: 2, `submission_id`: 1, `photo_type`: `review`, `image_url`: `https://...`)

## 4) 메모

- 2026-04-24에 Supabase MCP로 `public` 스키마의 실제 테이블명, 컬럼 목록, row count를 다시 확인했습니다.
- 현재 존재하는 `public` 테이블은 `admins`, `products`, `admin_menu_permissions`, `product_steps`, `applications`, `submissions`, `evidence_photos` 입니다.
- `products`에서는 `deposit_name`, `review_fee`가 제거됐고, `company_name`, `option_name`, `review_type`, `planned_depositor_name`이 관리됩니다.
- `submissions`에는 `assign_name`, `is_deposit_verified`, `deposited_at`, `actual_depositor_name`, `review_fee`가 추가됐습니다.
- `admin_menu_permissions`는 관리자별 메뉴 노출 권한을 관리하며, 현재 `2sssg` 계정에 `대시보드`, `상품`, `리뷰받기`, `상품전체보기`, `내보내기`, `파일 업로드` 권한 6건이 들어 있습니다.
- 2026-04-26에 `test1`, `test2`, `test3` 더미 계정을 삽입했습니다. 세 계정은 모두 회사 `테스트커머스` 소속이며, 메뉴 권한은 1=`대시보드`, 3=`리뷰받기`, 4=`상품전체보기`, 5=`내보내기`, 6=`파일 업로드`입니다.
- 2026-04-30에 모든 관리자(`2sssg`, `aram`, `test1`, `test2`, `test3`)에게 `menu_number = 6`, `menu_label = 파일 업로드` 권한을 추가했습니다.
- 2026-04-26 더미 데이터 삽입량: `products` 60건, `product_steps` 180건, `applications` 630건, `submissions` 1,740건, `evidence_photos` 2,217건입니다.
- 2026-04-26에 `test1`, `test2`, `test3` 더미 submissions 중 `is_review_verified = true`인 1,323건 모두 `photo_type = 'review'` 사진을 갖도록 누락된 review 사진 204건을 추가했습니다. 이후 추가 데이터 반영을 포함한 현재 `evidence_photos` row count는 2,435건입니다.
- 2026-04-26에 `review_fee`를 `products`에서 `submissions`로 이관했습니다. 최종 확인 시 `submissions` 1,785건 중 `review_fee`가 채워진 행은 1,511건입니다.
- 더미 데이터 삽입 후 검증 기준: `test1`, `test2`, `test3`은 각각 상품 20건, submissions 580건을 가집니다. 상태 분포는 전체 기준 구매 417건, 리뷰 537건, 완료 786건입니다.
- 더미 데이터 삽입 중 운영 계정 `2sssg`의 상품 수는 실행 전후 62건으로 동일하게 유지됐습니다.
