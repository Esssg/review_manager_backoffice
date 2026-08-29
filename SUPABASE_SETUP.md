# Supabase 연동 및 공개 업로드 설정

이 문서는 프런트 앱의 self-hosted Supabase 연결과, 구매자용 리뷰받기 사진을 홈서버 NAS에 저장하는 Edge Function 구성을 정리합니다.

## 1) 의존성 설치

```bash
npm ci
```

`supabase:check` 스크립트는 `dotenv`로 `.env`를 자동 로드합니다.

운영 배포는 호스트에서 직접 빌드하지 않고 `docker compose build`를 사용합니다. Docker build stage가 `npm ci`, `npm test`, `npm run build`를 실행하고 최종 Nginx 이미지에는 `dist/`만 복사합니다.

## 2) 프런트 환경변수 설정

`.env.example`을 복사해서 `.env`를 만들고 값을 입력합니다.

```bash
cp .env.example .env
```

필수 값:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

관리자 권한 개편용 gateway는 호환성 검증이 끝난 뒤에만 켭니다. 세 값이 모두 준비되지 않으면 프런트는 기존 직접 Supabase 호환 경로를 사용합니다.

- `VITE_ADMIN_GATEWAY_URL`: `admin-gateway` Edge Function URL; self-hosted staging uses the same-origin `/api/admin-gateway` proxy
- `VITE_ADMIN_GATEWAY_ENABLED`: gateway 사용 여부
- `VITE_ADMIN_GATEWAY_READY`: 모든 관리자 데이터 서비스 전환 및 staging/canary 검증 완료 여부

`VITE_ADMIN_GATEWAY_READY=true`는 migration·RPC·Edge Function이 실제 환경에 적용되고 전체 관리자 데이터 경로 회귀 검증을 통과한 뒤에만 설정합니다. 현재 staging `vm-app-01`에는 다섯 migration과 `admin-gateway` 함수를 적용하고 read/write·세션 경계를 검증했으며, `vm-web-01`에는 same-origin 프록시를 포함한 backoffice 이미지를 배포해 health/proxy smoke와 `hyejin2054` 인증 canary를 통과했습니다. 저장소 기본값은 `READY=false`이고 staging canary 이미지만 `READY=true`입니다. production에는 임직원 권한 저장 오류 대응을 위한 Edge Function nested action path 1·2차 수정, 상품/리뷰어 일괄입력 bundle 계약 후속 DB RPC, 해당 웹 수정이 포함된 app 이미지 배포를 적용했습니다. DB 백업·RPC ACL·local/external health·비인증 gateway 경계는 확인했지만, 실제 permission write/일괄입력 저장 canary는 현재 브라우저 세션 만료로 재로그인 후 확인해야 합니다. 공개 사진 흐름·RLS·production 전체 C4 전환은 아직 검증·적용하지 않았습니다.

현재 홈서버 공개 origin:

```env
VITE_SUPABASE_URL=https://sinabro-rmb.jinitlab.com
```

Node 스크립트 전용 키를 따로 쓰고 싶으면 아래도 설정할 수 있습니다.

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

`src/lib/supabase.ts`는 위 값을 사용해 앱 전체에서 재사용하는 Supabase 클라이언트를 생성합니다.

Docker Compose의 호스트 포트는 `APP_PORT`로 바꿀 수 있으며 기본값은 `8080`입니다.

## 3) 기본 연결 확인

```bash
npm run supabase:check
```

동작:

- 허용 목록에 포함된 필수 테이블 `products`에 `select head`를 시도합니다.
- `products` 조회가 성공하면 연결 성공으로 판단합니다.

> 이 프로젝트는 같은 `public` 스키마의 다른 테이블을 연결 확인용 fallback으로 조회하지 않습니다.

## 4) 구매자용 사진 업로드 Edge Function

구매자 공개 페이지 `/review-receive/specific/:productId`는 `multipart/form-data`를 same-origin 경로 `/api/review-receive-photo-sync`로 전송합니다. 앱 서버 Nginx가 이 요청을 내부 Kong의 `/functions/v1/review-receive-photo-sync`로 프록시하므로, 브라우저는 별도 API 도메인에 직접 요청하거나 CORS preflight를 보내지 않습니다. Edge Function은 제출 권한과 이미지 형식을 검증하고, 홈서버 Docker network 내부의 `rmb-file-writer`를 통해 NAS 파일을 쓰고 삭제합니다.

함수 위치:

- `supabase/functions/review-receive-photo-sync/index.ts`

함수 역할:

1. `sync`: `productId`, `submissionId`, `assignName`으로 제출 권한 확인
2. JPG/PNG/WebP/GIF, 파일당 10MB, 요청당 최대 10장 제한 검증
3. `rmb-file-writer`에 파일 쓰기를 위임하고 `/rmb-images/review-receive/...` 상대 경로를 `public.evidence_photos`에 저장
4. `operationId` 기반 결정적 object key와 `sync_review_receive_photo_rows` RPC로 자동 재시도를 멱등 처리
5. 제거 요청의 DB row와 NAS 파일 삭제
6. 중간 실패 시 DB에서 참조하지 않는 새 파일만 정리하고, 필요하면 `rollback` action으로 추가 정리
7. 요청/문의 ID와 시도 번호, 사용자 개인정보를 제외한 클라이언트 전송 진단을 구조화 로그로 기록

현재 함수는 구매자 공개 흐름을 지원해야 하므로 `verify_jwt: false`로 배포합니다. 대신 요청 본문의 `productId`, `submissionId`, `assignName` 조합으로 권한을 다시 확인하고, `is_review_verified = true` 인 제출은 수정하지 못하게 막습니다.

## 5) Edge Function 환경 설정

`review-receive-photo-sync`가 동작하려면 Supabase 프로젝트에 아래 시크릿이 있어야 합니다.

현재 홈서버 구성에서 사용하는 값:

- `FILE_WRITER_URL`: Docker network 내부 `rmb-file-writer` 주소
- `FILE_WRITER_TOKEN`: file-writer 요청 검증 토큰
- `NAS_IMAGE_UPLOAD_PREFIX`: 기본값 `review-receive`
- `NAS_PUBLIC_IMAGE_PREFIX`: 기본값 `/rmb-images`
- `NAS_IMAGE_ROOT`: file-writer를 사용하지 않는 fallback의 기본값 `/mnt/rmb-images`

Supabase 기본 제공 시크릿:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

위 두 Supabase 값은 Edge Function 런타임에 제공되어야 합니다. `FILE_WRITER_TOKEN`과 service role key는 프런트 `.env`에 넣지 않습니다.

## 5-1) 관리자 권한 gateway 초안

함수 위치:

- `supabase/functions/admin-gateway/index.ts`

이 함수는 관리자 로그인, 짧은 httpOnly 세션 쿠키, 권한 bundle, 회사·개인 설정, 임직원 권한 변경을 서버에서 검증하기 위한 초안입니다. staging `vm-app-01`에는 배포했고 주요 read/write canary를 완료했으며, production `vm-app-01`에는 2026-08-29 기존 번들 호환과 두-segment 경로 처리를 위한 nested action path 1·2차 수정만 배포했습니다. 이번 bundle 계약 수정에서는 Edge Function 런타임을 재배포하지 않고 이미 배포된 함수와 DB RPC·웹 adapter를 호환시켰습니다. 공개 사진 흐름과 운영 전체 전환 전에는 production 프런트의 `VITE_ADMIN_GATEWAY_READY`를 별도 승인 없이 켜지 않습니다.

함수 런타임 시크릿/환경변수:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_GATEWAY_SESSION_SECRET` (충분히 긴 무작위 비밀값)
- `ADMIN_WEB_ORIGIN` (프런트의 정확한 origin, trailing slash 없이)
- `ADMIN_GATEWAY_COOKIE_SAMESITE` (`Lax`, `Strict`, `None` 중 하나; `None`은 HTTPS에서만 사용)

gateway는 `ADMIN_WEB_ORIGIN`이 없거나 다른 origin이면 credentialed CORS 응답을 허용하지 않습니다. 요청의 `x-request-id`를 응답과 서버 오류 로그에 연결하며, 비밀번호·service role key·세션 쿠키 값은 로그에 기록하지 않습니다. migration/RPC가 없는 상태의 함수 응답은 schema 준비 오류로 분류되어야 합니다.

Self-hosted staging의 Kong `functions-v1` route는 여러 Edge Function이 공유하는 wildcard CORS를 사용하므로, 관리자 gateway는 브라우저에서 직접 Edge Function URL을 호출하지 않는다. `nginx/default.conf`의 `/api/admin-gateway/` same-origin proxy를 통해 `http://192.168.20.30:8080/api/admin-gateway`로 호출하고, `VITE_ADMIN_GATEWAY_URL`도 이 경로로 설정한다. 이 proxy를 포함한 staging backoffice 이미지는 `vm-web-01`에 배포했고 현재 `READY=true` 인증 read/write canary에서 관리자 데이터 요청이 gateway-only임을 확인했다. 공개 Edge Function의 공통 CORS를 바꾸는 작업은 별도 영향 검토 대상이다.

운영 반영은 `normalized access migration → gateway data RPC → Q49 binding backfill → read/export RPC 최적화 → admin-gateway 함수 → 전체 관리자 데이터 서비스가 포함된 backoffice 이미지` 순서로 staging과 canary에서 확인한 뒤 진행합니다. 다섯 migration은 staging `vm-app-01`에 적용·검증했고 production 사전 점검에서 대응 객체가 이미 존재해 재실행하지 않았습니다. 후속 `20260829220000_fix_admin_review_receive_product_bundle_contract.sql`은 production DB custom dump·RPC 정의 백업 후 적용했고, bundle 계약을 포함한 웹 app 이미지도 app-only로 배포했습니다. 실제 운영 일괄입력 저장 canary는 재로그인 후 남아 있으며, 전체 운영 전환·RLS는 별도 승인 대상입니다. `VITE_ADMIN_GATEWAY_ENABLED=true`만으로는 활성화되지 않으며, 세 값(`URL`, `ENABLED=true`, `READY=true`)이 모두 준비된 새 이미지를 별도로 배포해야 합니다.

## 6) 배포 및 운영 체크

배포 대상 함수명:

- `review-receive-photo-sync`

배포 후 확인할 사항:

1. `20260818143000_add_review_receive_photo_sync_rpc.sql` 마이그레이션이 적용되고 PostgREST schema cache가 갱신되어야 합니다.
2. 함수가 배포되어 있어야 합니다.
3. `rmb-file-writer`가 홈서버 Docker network 안에서 실행 중이어야 합니다.
4. 공개 페이지에서 사용하는 anon 권한이 `products`, `submissions`, `evidence_photos` 읽기를 허용해야 합니다.
5. `/rmb-images/`가 NAS 정적 파일 경로로 연결되어야 합니다.
6. 앱 서버 Nginx가 query string을 포함한 `/api/review-receive-photo-sync`를 내부 Kong으로 프록시해야 합니다.
7. 앱 서버 Nginx가 `/rmb-images/`를 `https://sinabro-rmb.jinitlab.com/rmb-images/`로 프록시해야 합니다.
8. 홈서버 외부 프록시의 요청 본문 제한이 10MB보다 커야 합니다.

운영 반영 순서는 호환성을 위해 `DB RPC 마이그레이션 → Edge Function → Backoffice 웹 이미지`를 지킵니다. 새 웹 번들은 자동 재시도를 사용하므로 RPC와 함수가 준비되기 전에 먼저 배포하지 않습니다. 각 단계의 백업·rollback과 health 검증을 준비하고, `docker compose up`, `restart`, 컨테이너 교체 또는 서버 재부팅은 사용자 승인 후에만 실행합니다.

## 7) 앱 서버 Docker 실행

```bash
docker compose build
docker compose up -d
docker compose ps
```

기본 LAN 접속 주소는 `http://192.168.20.30:8080`입니다. `compose.yaml`은 `.env`의 Vite 값을 build arg로 전달합니다. Vite 값이 바뀌면 이미지를 다시 빌드해야 합니다.

Nginx 설정은 다음을 담당합니다.

- React Router 경로를 `index.html`로 fallback
- `/assets/` 장기 캐시
- `/api/review-receive-photo-sync` same-origin 업로드 프록시
- `/api/admin-gateway/` same-origin 관리자 gateway 프록시
- `/rmb-images/` 홈서버 이미지 프록시
- `/healthz` 컨테이너 healthcheck

운영 리스크:

- 현재 구매자 식별은 `assign_name` 완전 일치 기반이므로 강한 인증 수단은 아닙니다.
- 공개 업로드 경로를 유지할 경우, 이후에는 토큰화된 링크나 추가 검증값 도입을 검토하는 편이 안전합니다.
