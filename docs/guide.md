# 운영 가이드

## 공개 리뷰받기 사진 제출 오류코드

대상 화면:

- `/review-receive/specific/:productId`

사진 제출 흐름:

1. 브라우저에서 파일 선택 및 사전 검증
2. 브라우저가 same-origin `/api/review-receive-photo-sync`로 `sync` 요청
3. `vm-web-01` Nginx가 내부 Kong의 `review-receive-photo-sync` Edge Function으로 프록시
4. Edge Function이 권한·파일을 검증하고 `rmb-file-writer`와 submission 단위 잠금 RPC를 통해 NAS 파일과 DB 정보를 멱등 동기화
5. 중간 실패 시 Edge Function이 새 파일과 DB row 정리를 시도

새 클라이언트는 저장 작업마다 `operationId`를 한 번 만들고 각 전송에 `requestId`와 `attempt`를 붙입니다. 이 값은 요청 query의 `oid`, `rid`, `attempt`와 HTTP 응답 헤더, Edge Function JSON 로그에 함께 남습니다. 사용자 화면에는 짧은 `문의 ID`가 표시되므로 다음 장애에서는 시각만으로 추정하지 않고 같은 ID로 Cloudflare/NPM/함수 로그를 연결합니다.

| 코드 | 단계 | 의미 | 우선 확인할 곳 |
|---|---|---|---|
| `00001` | 파일 선택 | 이미지가 아닌 파일 선택 | 사용자 선택 파일 확장자/브라우저 파일 타입 |
| `00002` | 파일 선택 | 0바이트이거나 브라우저가 읽을 수 없는 파일 | 파일 손상 여부, 모바일 사진 접근 권한 |
| `00003` | 파일 선택 | 10MB 초과 | 파일 용량 |
| `00004` | 파일 선택 | 한 번에 10장 초과 | 선택한 사진 개수 |
| `00005` | 파일 미리보기 | 브라우저가 미리보기 URL 생성 실패 | 모바일 브라우저 메모리/파일 접근 권한 |
| `00011` | sync 요청 | 요청 payload 또는 파일 형식이 올바르지 않음 | 클라이언트 요청 body, 파일 메타데이터 |
| `00012` | sync 권한 | `productId`, `submissionId`, `assignName` 조합 불일치 | 제출 row, 배정명, 상품 ID |
| `00013` | sync 잠금 | 이미 `is_review_verified = true`라 수정 불가 | 관리자 리뷰완료 상태 |
| `00030` | sync 전송 | 브라우저가 업로드 요청에서 사용 가능한 HTTP 응답을 받지 못함 | `vm-web-01` access log, Cloudflare, 모바일 네트워크 |
| `00031` | sync HTTP | 프록시 또는 함수가 분류되지 않은 non-2xx 응답을 반환 | `vm-web-01`, Kong, Edge Function 순서로 상태코드 확인 |
| `00032` | sync 권한 | 응답 본문을 읽지 못한 403 fallback | 제출 row, 배정명, 상품 ID |
| `00033` | sync 잠금 | 응답 본문을 읽지 못한 409 fallback | 관리자 리뷰완료 상태 변경 여부 |
| `00034` | sync 조회 | 기존 사진 목록 조회 실패 | `evidence_photos` 조회, Supabase DB 로그 |
| `00035` | sync insert | NAS 저장 후 새 사진 URL을 DB에 저장 실패 | file-writer, NAS, `evidence_photos` insert |
| `00036` | sync delete | 기존 사진 row 또는 NAS 파일 삭제 실패 | `evidence_photos`, file-writer, NAS 로그 |
| `00037` | sync 응답 | 성공 응답에 최종 사진 목록이 없음 | Edge Function 응답 payload |
| `00038` | sync 서버 | sync 중 분류되지 않은 서버 문제 | Edge Function, file-writer, DB, NAS 로그 |
| `00039` | sync DB transaction | submission 단위 사진 row 멱등 동기화 RPC 실패 | Postgres 함수 존재·권한·DB 로그 |
| `00040` | rollback 요청 | 실패 후 임시 파일 정리 요청이 네트워크 단계에서 실패 | Supabase Functions 접근성, 네트워크 |
| `00041` | rollback 권한 | 임시 파일 정리 요청 형식 또는 권한 확인 실패 | rollback 요청 body, 제출 row |
| `00042` | rollback 삭제 | NAS 임시 파일 삭제 실패 | file-writer, NAS 경로와 권한 |
| `00043` | rollback 후처리 | 클라이언트가 rollback 호출 자체를 완료하지 못함 | 원래 오류코드와 함께 확인 |
| `00050` | 전송 전 연결 | `navigator.onLine = false`가 재확인되어 파일 POST를 시작하지 않음 | 단말 데이터/Wi-Fi 연결, `online` 이벤트 |
| `00051` | 앱 복귀·망 전환 | background 복귀·BFCache 복원·online/offline 직후 첫 요청 또는 health 확인 실패 | 카카오톡 WebView 생명주기, Wi-Fi↔모바일망 전환, 같은 문의 ID의 health/diagnostic 요청 |
| `00052` | 전송 timeout | 브라우저의 업로드 응답 제한시간 초과 | NPM·Edge Function에 같은 `rid`가 있는지와 처리시간 |
| `00053` | 전송 abort | 브라우저·운영체제 또는 앱 코드가 요청을 중단 | 원본 오류명, visibility/page 전환 |
| `00054` | fetch reject | HTTP 응답 없이 브라우저 fetch가 거절됐지만 더 구체적인 생명주기 신호가 없음 | DNS/TLS/단말망, Cloudflare/NPM의 `rid` 존재 여부 |
| `00057` | HTTP 413 | 프록시가 요청 본문 크기를 거부 | 파일별·전체 크기, Cloudflare/NPM/Nginx body limit |
| `00058` | HTTP 502~504 | gateway 또는 upstream 연결 실패 | vm-web-01 → Kong/Edge Function 연결과 timeout |
| `00059` | relay | Edge Function relay가 함수로 요청을 전달하지 못함 | Edge runtime/relay 로그 |
| `00060` | HTTP 429 | 요청 제한 초과 | Cloudflare rate limit/WAF, 같은 IP·문의 ID의 반복 요청 |
| `00061` | 응답 parse | 2xx 응답 본문을 기대 형식으로 해석하지 못함 | 같은 `rid`의 응답 content-type/body |
| `00062` | 인증 context | 업로드 전 Supabase 세션 확인 자체가 실패 | 브라우저 세션·Supabase auth 접근성 |
| `00090` | 공통 | 분류되지 않은 알 수 없는 오류 | 브라우저 콘솔, Edge Function 로그 |

트러블슈팅 순서:

1. 사용자에게 오류코드, `문의 ID`, KST 발생시각, 기기·브라우저와 직전 background/네트워크 전환 여부를 확인합니다.
2. Cloudflare와 NPM에서 query의 `oid` 또는 `rid`를 검색합니다. `rid=<operationId>.1`은 최초 전송, `.2`는 자동 재시도, `.diagnostic1`은 최초 실패 진단 요청입니다.
3. `00050`~`00054`이면 `review_receive_photo_client_diagnostic` Edge Function 로그에서 원본 오류명, 재시도 횟수, 화면 복귀·망 변경 후 경과시간을 확인합니다. 파일명·배정명·사진 내용은 진단 로그에 기록하지 않습니다.
4. `rid`가 Cloudflare/NPM에 전혀 없으면 브라우저~Cloudflare 전, NPM까지만 있으면 vm-web-01 이후, 함수의 `request_started`만 있고 `request_completed`가 없으면 body 수신 또는 함수 처리 중단으로 범위를 좁힙니다.
5. 기존 번들의 `00030`이면 먼저 같은 시각 `vm-web-01` access log에 `POST /api/review-receive-photo-sync`가 있는지 확인합니다. POST가 없으면 브라우저~Cloudflare 구간, 있으면 Nginx 이후 상태코드를 확인합니다.
6. same-origin 전환 후 정상 브라우저 요청에는 CORS `OPTIONS`가 필요하지 않습니다. 같은 시각 direct API 대상 `OPTIONS`만 보이면 이전 번들 캐시 또는 이전 경로 사용 여부를 확인합니다.
7. `00031`~`00039`, `00057`~`00061`은 `vm-web-01` → Kong/Edge Function → file-writer/DB/NAS 순서로 동일 `rid`의 상태코드를 대조합니다.
8. rollback 코드가 함께 표시되면 원래 오류코드를 먼저 보고, 추가 정리 오류코드는 NAS 임시 파일 잔여 가능성 확인에 사용합니다.

자동 재시도 계약:

- background/네트워크 전환 직후에는 최소 안정화 대기와 same-origin `/healthz` 확인을 먼저 수행합니다.
- 파일 POST가 `00050`, `00051`, `00054` 유형으로 HTTP 응답 없이 실패하면 같은 `operationId`로 최대 한 번만 자동 재시도합니다. timeout(`00052`)과 abort(`00053`)는 자동 재시도하지 않습니다.
- 파일 object key는 `operationId + 파일 순번`으로 결정되며 file-writer는 임시 파일 후 atomic replace를 사용합니다.
- DB row 변경은 `sync_review_receive_photo_rows(...)`가 submission별 advisory transaction lock으로 직렬화하고 이미 존재하는 URL을 다시 insert하지 않습니다.
- HTTP 4xx/5xx, relay 오류, 응답 parse 오류는 자동 재시도하지 않습니다.

## 관리자 권한 gateway 전환 초안

`supabase/functions/admin-gateway/index.ts`는 관리자 로그인·세션·권한 bundle·설정·임직원 권한 변경을 서버에서 검증하기 위한 원본입니다. staging `vm-app-01`에는 배포·경계 검증했지만 production Supabase에는 배포하지 않았습니다.

- 관리자 세션은 `rmb_admin_session` httpOnly 서명 쿠키를 사용하고, 브라우저의 `review_manager_admin_id`를 권한 신원으로 신뢰하지 않습니다.
- 함수 시크릿 `ADMIN_GATEWAY_SESSION_SECRET`, `ADMIN_WEB_ORIGIN`, `ADMIN_GATEWAY_COOKIE_SAMESITE`와 Supabase service role key는 함수 런타임에만 설정합니다. service role key를 프런트 환경변수나 로그에 넣지 않습니다.
- 프런트는 `VITE_ADMIN_GATEWAY_URL`, `VITE_ADMIN_GATEWAY_ENABLED=true`, `VITE_ADMIN_GATEWAY_READY=true`가 모두 있어야 gateway를 사용합니다. `READY`는 migration/RPC, 함수 배포, 전체 관리자 데이터 서비스 전환, staging·canary 회귀 검증 뒤에만 켭니다. 저장소 기본값은 `false`이며 staging canary 이미지에서만 `true`입니다.
- staging `vm-web-01`은 `/api/admin-gateway` same-origin proxy를 사용해 Kong의 공유 wildcard CORS를 우회하고, 인증 read/write canary에서 대시보드·리뷰받기·상품전체보기·일괄수정·전체/사진 내보내기와 상품·제출 mutation 요청이 gateway-only로 동작하는 것을 확인했습니다. proxy는 세션 없는 요청에 `401 ADMIN_SESSION_REQUIRED`를 반환합니다. canary로 생성한 row는 정리 후 DB 잔여 count 0을 확인했으며, legacy 호환 경로는 rollback을 위해 유지합니다.

운영 전환 전 확인 순서:

1. additive migration/RPC와 gateway 함수를 staging에 적용하고 기존 번들의 로그인·메뉴·조회·쓰기·공개 리뷰받기 사진 흐름을 먼저 비교합니다.
2. gateway 함수의 origin/cookie 설정, 세션 만료·ID 변조·권한 부족·schema 미준비 오류를 확인합니다.
3. 모든 관리자 데이터 서비스가 gateway/RPC를 통과하고 developer·company_admin·employee별 scope가 서버에서 재검증되는지 확인합니다.
4. 개발자·테스트 계정 read-only canary와 제한된 staging write canary 후 새 staging 웹 이미지에서만 `VITE_ADMIN_GATEWAY_READY=true`를 설정하고, 공개 사진 흐름은 별도로 완료합니다.
5. 오류가 생기면 웹 이미지를 이전 버전으로 되돌리고 `READY=false`로 호환 경로를 복구합니다. rollback window가 끝나기 전에는 기존 테이블/RPC 삭제나 restrictive RLS를 실행하지 않습니다.

운영 DB migration, Edge Function 배포, Docker/Nginx 재시작은 이 초안과 별개의 승인 대상이며 사용자의 명시적 승인을 받은 뒤에만 실행합니다.
