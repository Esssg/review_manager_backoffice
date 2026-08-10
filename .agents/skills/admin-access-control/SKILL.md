---
name: admin-access-control
description: Use when changing admin routes, public versus admin boundaries, sidebar menus, admin_menu_permissions, menu numbers, direct URL access, login guards, or permission-dependent loading and error states in this review backoffice.
---

# Admin Access Control

관리자 라우팅과 메뉴 노출을 동일한 DB 권한 계약으로 처리하고, 사이드바에서 숨기는 것과 직접 URL을 차단하는 것을 분리하지 않는다.

## 현재 메뉴 계약

메뉴 권한의 기준은 `public.admin_menu_permissions.menu_number`다. `menu_label`은 표시용이며 권한 판정에 사용하지 않는다.

- `1` 대시보드: `/admin`
- `2` 상품: `/admin/product` 및 `/admin/product/*`
- `3` 리뷰받기: `/admin/review-receive/*`
- `4` 상품전체보기: `/admin/product-overview/*`
- `5` 내보내기: `/admin/export/*`
- `6` 파일 업로드: `/admin/file-upload`
- `7` 일괄수정하기: `/admin/bulk-edit`

경로와 메뉴 번호의 실제 매핑은 `src/constants/admin.js`의 `ADMIN_MENU_NUMBER`, `ADMIN_MENU_ITEMS`, `getAdminMenuItemByPathname`을 단일 기준으로 재사용한다.

## 메뉴와 직접 접근

- 관리자별 메뉴는 `admin_menu_permissions` 조회 결과로 노출한다.
- 특정 관리자 ID를 코드에 하드코딩해 메뉴 권한을 예외 처리하지 않는다.
- 새 메뉴를 추가하거나 기존 경로를 변경할 때 라우트, 메뉴 번호, 라벨, 경로 판별, 사이드바, 운영 권한 데이터를 함께 갱신한다.
- 상세 경로와 하위 경로도 상위 메뉴 권한에 포함되는지 명확히 정의한다.
- 권한 없는 URL 직접 접근은 허용하지 않고, 허용된 관리자 메뉴로 리다이렉트하거나 이유가 드러나는 권한 없음 상태를 보여준다.
- 권한 조회 중에는 보호된 본문을 먼저 렌더링하지 않고 로딩 상태를 보여준다.
- 권한 조회 실패는 빈 화면으로 숨기지 않고 오류와 재시도 또는 이동 경로를 제공한다.

## 라우팅 경계

- 인증이 필요한 페이지는 `/admin/*` 아래에 둔다.
- 공개·구매자 페이지는 `/admin/*` 밖에 둔다.
- 관리자 로그인 리다이렉트와 공개 페이지 이동을 한 조건문에서 섞지 않는다.
- 관리자 상세·내보내기·일괄수정 하위 경로가 올바른 상위 메뉴 권한을 사용하는지 확인한다.

## 권한 데이터와 검증

- 메뉴 권한을 추가·변경하면 허용된 `public.admin_menu_permissions` 테이블 범위 안에서만 운영 데이터 또는 마이그레이션을 준비한다.
- DB 권한뿐 아니라 실제 화면 쓰기 작업의 `can_verify_deposit`, 회사 범위, RLS 검증도 함께 확인한다.
- 메뉴가 보이는 계정, 메뉴가 없는 계정, 권한 없는 URL 직접 접근, 권한 조회 중, 권한 조회 오류를 점검한다.
- 라우팅·권한 변경 후 주요 경로를 수동 확인하고 `npm run build`를 실행한다.
