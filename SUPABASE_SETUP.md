# Supabase 연동 및 공개 업로드 설정

이 문서는 로컬 프런트 앱 연결과, 구매자용 리뷰받기 사진 업로드를 위한 Supabase Edge Function 설정 절차를 함께 정리합니다.

## 1) 의존성 설치

```bash
npm install
```

`supabase:check` 스크립트는 `dotenv`로 `.env`를 자동 로드합니다.

## 2) 프런트 환경변수 설정

`.env.example`을 복사해서 `.env`를 만들고 값을 입력합니다.

```bash
cp .env.example .env
```

필수 값:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Node 스크립트 전용 키를 따로 쓰고 싶으면 아래도 설정할 수 있습니다.

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

`src/lib/supabase.ts`는 위 값을 사용해 앱 전체에서 재사용하는 Supabase 클라이언트를 생성합니다.

## 3) 기본 연결 확인

```bash
npm run supabase:check
```

동작:

- `products` -> `participants` -> `campaigns` 순으로 `select head`를 시도합니다.
- 하나라도 성공하면 연결 성공으로 판단합니다.

> 실제 DB 테이블명이 다르면 `scripts/check-supabase.mjs`의 `candidates` 배열을 수정하면 됩니다.

## 4) 구매자용 사진 업로드 Edge Function

구매자 공개 페이지 `/review-receive/specific/:productId`의 사진 저장은 브라우저가 직접 AWS 키를 가지지 않도록, Supabase Edge Function이 presigned URL을 발급하는 구조로 구현되어 있습니다.

함수 위치:

- `supabase/functions/review-receive-photo-sync/index.ts`

함수 역할:

1. `prepare`: 제출 권한 확인 후 S3 presigned PUT URL 발급
2. `commit`: 업로드된 파일 URL을 `public.evidence_photos`에 저장하고 삭제 요청을 동기화
3. `rollback`: 업로드 중간 실패 시 새로 올라간 S3 객체 정리

현재 함수는 구매자 공개 흐름을 지원해야 하므로 `verify_jwt: false`로 배포합니다. 대신 요청 본문의 `productId`, `submissionId`, `assignName` 조합으로 권한을 다시 확인하고, `is_review_verified = true` 인 제출은 수정하지 못하게 막습니다.

## 5) Edge Function 시크릿 설정

`review-receive-photo-sync`가 동작하려면 Supabase 프로젝트에 아래 시크릿이 있어야 합니다.

필수 시크릿:

- `AWS_S3_REGION`
- `AWS_S3_BUCKET`
- `AWS_S3_ACCESS_KEY_ID`
- `AWS_S3_SECRET_ACCESS_KEY`

선택 시크릿:

- `AWS_S3_UPLOAD_PREFIX`
  - 기본값: `review-receive`
- `AWS_S3_PUBLIC_BASE_URL`
  - 미설정 시 기본값: `https://<bucket>.s3.<region>.amazonaws.com`

Supabase 기본 제공 시크릿:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

위 두 값은 Edge Function 런타임에서 자동 제공되므로 별도 중복 등록은 필요하지 않습니다.

## 6) 배포 및 운영 체크

배포 대상 함수명:

- `review-receive-photo-sync`

배포 후 확인할 사항:

1. 함수가 배포되어 있어야 합니다.
2. 위 AWS 시크릿이 프로젝트에 저장돼 있어야 합니다.
3. 공개 페이지에서 사용하는 anon 권한이 `products`, `submissions`, `evidence_photos` 읽기를 허용해야 합니다.
4. S3 버킷 CORS가 presigned PUT 업로드를 허용해야 합니다.

운영 리스크:

- 현재 구매자 식별은 `assign_name` 완전 일치 기반이므로 강한 인증 수단은 아닙니다.
- 공개 업로드 경로를 유지할 경우, 이후에는 토큰화된 링크나 추가 검증값 도입을 검토하는 편이 안전합니다.
