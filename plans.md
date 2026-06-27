# 앱 서버 배포 이전/이후 작업 계획

작성일: 2026-06-27

이 문서는 `review_manager_backoffice` 앱을 **다른 서버**에 배포할 때 그 서버에서 Codex가 이어서 작업하기 위한 계획이다.

주의: 이 파일은 앱 repo 안의 계획서다. 홈서버 전체 마이그레이션 기록은 `/home/jinitlab/plans.md`에 따로 있다.

## 0. 현재 확정된 배포 방향

- Supabase self-hosted, Edge Function, 이미지 파일 저장소, 이미지 static serving은 홈서버 `192.168.20.20`에 둔다.
- React/Vite 앱은 이 repo가 있는 서버가 아니라 **다른 앱 서버**에 배포한다.
- 다른 앱 서버는 DB에 직접 접속하지 않는다.
- 다른 앱 서버와 브라우저는 홈서버의 Supabase/Kong/NPM public endpoint를 통해 REST/Functions/Image를 사용한다.
- 파일 쓰기/삭제는 홈서버 내부 Docker network의 `rmb-file-writer`가 담당한다.
- 앱 서버는 `rmb-file-writer`에 직접 접근할 필요가 없고, 접근해서도 안 된다.

## 1. 홈서버에서 이미 완료된 것

### Local Supabase

- Compose project: `supabase`
- 주요 컨테이너:
  - `supabase-db`
  - `supabase-kong`
  - `supabase-rest`
  - `supabase-auth`
  - `supabase-edge-functions`
  - `rmb-file-writer`
- DB direct publish:
  - `supabase-db`는 host `127.0.0.1:54322`에만 publish됨.
- 아직 주의가 필요한 publish:
  - `supabase-pooler`: `0.0.0.0:5432`, `0.0.0.0:6543`
  - `supabase-kong`: `0.0.0.0:8000`, `0.0.0.0:8443`

### DB restore

Cloud Supabase public app table 7개를 local Supabase 운영 `public` schema로 복원했다.

복원 row count:

- `admins`: 7
- `products`: 1382
- `product_steps`: 180
- `applications`: 630
- `submissions`: 8009
- `evidence_photos`: 6382
- `admin_menu_permissions`: 30

검증:

- FK violation: 0
- `evidence_photos.image_url`에서 S3 URL은 `/rmb-images/review-receive/...` 상대 path로 변환됨.
- remaining S3 URL rows: 0
- `/rmb-images/review-receive/%` rows: 3961
- `placehold.co` placeholder rows: 2421
- DB의 `/rmb-images/review-receive/%` image_url 3961건에 대해 NAS 파일 존재 검사: missing 0

### REST 권한

Cloud와 동일하게 local에도 아래 권한을 적용했다.

- 대상 roles: `anon`, `authenticated`, `service_role`
- 대상 tables:
  - `admins`
  - `products`
  - `product_steps`
  - `applications`
  - `submissions`
  - `evidence_photos`
  - `admin_menu_permissions`
- table privileges:
  - `select`
  - `insert`
  - `update`
  - `delete`
- identity sequence privileges:
  - `usage`
  - `select`
  - `update`

REST smoke:

- `GET /rest/v1/products?select=id&limit=1` with local anon key: `HTTP/1.1 200 OK`

주의: 이 권한 구조는 Cloud의 현재 상태를 그대로 맞춘 것이다. RLS가 꺼져 있고 anon write가 열려 있으므로 인터넷 공개 전 보안 설계가 필요하다.

### Image serving

- NAS path:
  - host: `/mnt/nas/rmb-images`
  - file-writer container: `/data/rmb-images`
  - Edge Functions container legacy mount: `/mnt/rmb-images`
- public image path:
  - DB에는 `/rmb-images/review-receive/...` 상대 path 저장
- 확인된 image endpoint:
  - `http://sinabro-rmb.jinitlab.com/rmb-images/...`
- sample static image:
  - `HTTP/1.1 200 OK`
  - `Content-Type: image/png`
  - `Cache-Control: public, max-age=31536000, immutable`

### Edge Function upload/delete

Edge Function:

- name: `review-receive-photo-sync`
- endpoint:
  - `/functions/v1/review-receive-photo-sync`
- contract:
  - `multipart/form-data`
  - `action=sync`
  - `productId`
  - `submissionId`
  - `assignName`
  - `removedImageUrls`: JSON string array
  - `files`: image files

파일 쓰기 구조:

- Edge Function은 권한 검증, image validation, DB insert/delete를 담당한다.
- 실제 NAS file write/delete는 Python `rmb-file-writer` service에 위임한다.
- `rmb-file-writer`는 Docker network 내부 서비스이고 host port publish가 없다.
- `docker ps`에는 `8080/tcp`만 보여야 정상이다.

E2E smoke:

- Edge Function 경유 multipart upload 성공.
- DB `evidence_photos` row insert 확인: 1
- NAS file exists 확인: true
- 같은 Edge Function `sync`로 제거 요청 성공.
- cleanup 후 DB row: 0
- cleanup 후 NAS file exists: false

## 2. 홈서버에서 아직 정리해야 할 것

앱 서버로 넘어가기 전에 홈서버에서 마저 확인하거나 결정해야 하는 항목이다.

### 2.1 Public endpoint 확정

앱 서버에서 사용할 최종 Supabase URL을 확정해야 한다.

현재 후보:

```text
http://sinabro-rmb.jinitlab.com
```

권장:

```text
https://sinabro-rmb.jinitlab.com
```

확인해야 할 path:

- `/rest/v1/...`
- `/auth/v1/...`
- `/functions/v1/review-receive-photo-sync`
- `/rmb-images/...`

앱 서버의 `VITE_SUPABASE_URL`은 브라우저에서 접근 가능한 Supabase/Kong/NPM origin이어야 한다. LAN-only로 운영할 것이 아니라면 `192.168.20.20:8000`을 넣으면 안 된다.

### 2.2 NPM/Cloudflare/TLS

현재 `sinabro-rmb.jinitlab.com` 경유 함수와 이미지 smoke는 통과했다.

다만 앱 배포 전 아래를 최종 확인해야 한다.

- HTTPS가 필요한지 여부.
- Cloudflare proxy 또는 tunnel 사용 여부.
- NPM Proxy Host가 `/rest/v1`, `/auth/v1`, `/functions/v1`, `/rmb-images`를 모두 올바르게 처리하는지.
- `client_max_body_size`가 사진 업로드 최대 크기보다 큰지. 현재 Edge Function은 파일당 10MB 제한이다.

### 2.3 DB/pooler port exposure

앱 서버는 DB에 직접 접속하지 않으므로 public internet에 DB port를 열 필요가 없다.

정리 권장:

- `5432`, `6543` public exposure 제거 또는 firewall로 제한.
- Studio도 public internet에 직접 열지 않는다.
- 필요한 경우 VPN, Cloudflare Access, IP allowlist 뒤에 둔다.

### 2.4 RLS/권한 보안

현재 local은 Cloud와 동일하게 public app tables가 RLS disabled이고 `anon`에 read/write가 열려 있다.

앱 기능 호환성은 맞지만 보안상 위험하다.

인터넷 공개 전 결정해야 할 것:

- RLS를 언제 설계/적용할지.
- public review receive page에서 필요한 최소 write 범위.
- admin 기능을 anon key로 계속 열어둘지, 별도 인증/서버 보호를 붙일지.
- 최소한 Cloudflare Access, Basic Auth, VPN, IP allowlist 중 하나로 admin app 접근을 제한할지.

중요: 정책 없이 RLS만 켜면 앱이 바로 막힌다. RLS는 별도 설계 후 적용해야 한다.

### 2.5 Cloud/S3 live drift

Cloud Supabase와 S3가 아직 live라면 local DB/NAS는 시간이 지날수록 다시 벌어진다.

최종 cutover 전에 필요:

1. 기존 Cloud 앱 write freeze.
2. S3 -> NAS 최종 증분 sync.
3. Cloud DB -> local DB 최종 delta 또는 재복원.
4. `evidence_photos.image_url` 변환 재검증.
5. 앱 서버 endpoint 전환.

현재 restore script `/home/jinitlab/scripts/migrate_cloud_public_to_local.mjs`는 target public table이 이미 있으면 중단하도록 만들었다. 최종 재복원을 하려면 별도 truncate/recreate 또는 delta migration 절차가 필요하다.

### 2.6 Compose 재기동 명령

홈서버에서 Supabase stack을 재기동할 때는 아래 override를 모두 포함해야 현재 기능이 유지된다.

```bash
cd /opt/supabase/docker
docker compose -f docker-compose.yml -f docker-compose.db-direct.yml -f docker-compose.functions-nas.yml -f docker-compose.file-writer.yml up -d
```

`docker-compose.file-writer.yml`을 빼면 사진 업로드/삭제가 깨진다.

## 3. 다른 앱 서버에서 해야 할 일

다른 서버에서 Codex를 실행하면 이 섹션부터 진행하면 된다.

### 3.1 Repo 준비

1. `review_manager_backoffice` repo를 앱 서버에 clone 또는 pull한다.
2. 현재 홈서버 repo의 변경사항이 원격에 반영되어 있는지 확인한다.
   - `src/services/reviewReceivePublic.js`
   - `src/pages/public/PublicReviewReceiveDetailPage.jsx`
   - `supabase/functions/review-receive-photo-sync/index.ts`
3. 앱 서버는 Supabase Edge Function을 배포하지 않는다.
   - Edge Function은 홈서버 self-hosted Supabase에 이미 배치되어 있다.
   - repo의 `supabase/functions/...`는 코드 이력과 참고용이다.

### 3.2 환경변수

앱 서버의 frontend build env:

```env
VITE_SUPABASE_URL=<홈서버 public Supabase origin>
VITE_SUPABASE_ANON_KEY=<홈서버 local Supabase ANON_KEY>
```

예시:

```env
VITE_SUPABASE_URL=https://sinabro-rmb.jinitlab.com
VITE_SUPABASE_ANON_KEY=<do-not-commit>
```

주의:

- `VITE_SUPABASE_URL`은 `/rest/v1`, `/functions/v1`, `/auth/v1`이 모두 붙는 origin이어야 한다.
- `VITE_SUPABASE_ANON_KEY`는 홈서버 `/opt/supabase/docker/.env`의 `ANON_KEY` 값이다.
- key를 repo에 commit하지 않는다.
- 앱 서버에서 Cloud Supabase key를 계속 쓰면 migration 결과를 보지 못한다.

### 3.3 이미지 상대경로 제약

local DB의 `evidence_photos.image_url`은 아래처럼 상대 path다.

```text
/rmb-images/review-receive/<productId>/<submissionId>/<file>
```

React 앱은 이 값을 그대로 `<img src>` 또는 `fetch(image_url)`에 쓴다.

따라서 앱 origin이 `sinabro-rmb.jinitlab.com`과 다르면 브라우저는 기본적으로 앱 서버의 `/rmb-images/...`를 요청한다.

앱 서버에서 반드시 둘 중 하나를 해야 한다.

권장 A: 앱 서버 reverse proxy

- 앱 서버의 `/rmb-images/`를 홈서버 image endpoint로 proxy한다.
- 예:

```nginx
location /rmb-images/ {
    proxy_pass https://sinabro-rmb.jinitlab.com/rmb-images/;
    proxy_set_header Host sinabro-rmb.jinitlab.com;
}
```

주의: 위 예시는 형태만 보여준다. 실제 앱 서버가 Nginx, Caddy, Traefik, Docker proxy 중 무엇을 쓰는지에 맞게 작성한다.

대안 B: 앱 코드에서 image base URL을 붙인다.

- `VITE_IMAGE_BASE_URL=https://sinabro-rmb.jinitlab.com` 같은 env를 추가한다.
- 모든 image_url 렌더링/fetch 지점에 URL normalize helper를 적용한다.
- 손댈 곳이 많아질 수 있어 우선은 앱 서버 `/rmb-images/` proxy가 더 단순하다.

### 3.4 앱 Docker 빌드/실행

앱 서버에서 수행:

```bash
docker compose build
docker compose up -d
docker compose ps
```

`Dockerfile`의 build stage가 `npm ci`, `npm test`, `npm run build`를 실행하고, 최종 Nginx 이미지에는 정적 결과물만 포함한다. 기본 호스트 포트는 `8080`이고 `.env`의 `APP_PORT`로 변경할 수 있다.

SPA rewrite가 필요하다.

기존 Vercel 설정과 같은 의미로 모든 route fallback이 `index.html`로 가야 한다.

Nginx 예시:

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

현재 repo의 `nginx/default.conf`에 SPA fallback과 `/rmb-images/` 홈서버 proxy가 반영되어 있다.

### 3.5 브라우저 smoke test

앱 서버 배포 후 브라우저에서 확인한다.

1. 앱 첫 화면 로드.
2. admin 로그인 또는 기존 앱 로그인 방식 확인.
3. 상품/제출 목록 조회.
4. 기존 사진 썸네일 로드.
5. public review receive page 진입.
6. 사진 업로드.
7. 업로드 후 DB row 생성 확인.
8. 업로드 후 이미지 URL이 브라우저에서 열리는지 확인.
9. 사진 삭제.
10. 삭제 후 DB row와 NAS file cleanup 확인.
11. `AdminExportPhotosPage`의 `fetch(image_url)` 다운로드가 앱 서버 `/rmb-images/` proxy를 통해 동작하는지 확인.

### 3.6 앱 서버가 홈서버에 요구하는 네트워크

앱 서버 자체가 DB에 접속할 필요는 없다.

브라우저와 앱 서버는 아래 endpoint에 접근할 수 있어야 한다.

- Supabase REST/Auth/Functions origin:
  - `https://sinabro-rmb.jinitlab.com`
- Image path:
  - `https://sinabro-rmb.jinitlab.com/rmb-images/...`

앱 서버 proxy를 쓴다면 앱 서버에서 홈서버 image endpoint로 outbound HTTPS가 가능해야 한다.

홈서버 내부-only 서비스:

- `rmb-file-writer:8080`
  - Docker network 내부 전용.
  - 앱 서버에서 접근하지 않는다.
- local DB `127.0.0.1:54322`
  - 홈서버 host local 전용.
  - 앱 서버에서 접근하지 않는다.

### 3.7 cutover 전 확인

앱 서버에서 정상 동작이 확인되면 최종 전환 전에 홈서버 쪽과 맞춰야 한다.

1. Cloud/Vercel old app write freeze 시간 확정.
2. 홈서버에서 S3 -> NAS final sync.
3. 홈서버에서 Cloud DB -> local DB final delta 또는 재복원.
4. 앱 서버 env가 local Supabase로 되어 있는지 재확인.
5. DNS 또는 reverse proxy route 전환.
6. Cloud Supabase/S3 rollback window 유지.
7. 안정화 후 Cloud 비용 리소스 정리.

## 4. 앱 서버 Codex에게 줄 첫 작업 지시 예시

다른 앱 서버에서 Codex를 열면 아래처럼 시작하면 된다.

```text
review_manager_backoffice/plans.md를 읽고 3번 섹션부터 수행해줘.
앱은 이 서버에 배포하고, Supabase/이미지/Edge Function은 홈서버 sinabro-rmb.jinitlab.com을 사용한다.
먼저 env와 /rmb-images proxy를 맞추고 npm build, 브라우저 smoke test까지 진행해줘.
```

---

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
