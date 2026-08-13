# 운영 가이드

## 공개 리뷰받기 사진 제출 오류코드

대상 화면:

- `/review-receive/specific/:productId`

사진 제출 흐름:

1. 브라우저에서 파일 선택 및 사전 검증
2. 브라우저가 same-origin `/api/review-receive-photo-sync`로 `sync` 요청
3. `vm-web-01` Nginx가 내부 Kong의 `review-receive-photo-sync` Edge Function으로 프록시
4. Edge Function이 권한·파일을 검증하고 `rmb-file-writer`를 통해 NAS 파일과 DB 정보를 동기화
5. 중간 실패 시 Edge Function이 새 파일과 DB row 정리를 시도

사용자 화면에는 `[00030] 사진 저장 요청이 네트워크 문제로 실패했습니다.`처럼 코드와 메시지를 함께 표시합니다. 사용자가 오류를 제보하면 아래 표를 기준으로 실패 지점을 먼저 확인합니다.

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
| `00040` | rollback 요청 | 실패 후 임시 파일 정리 요청이 네트워크 단계에서 실패 | Supabase Functions 접근성, 네트워크 |
| `00041` | rollback 권한 | 임시 파일 정리 요청 형식 또는 권한 확인 실패 | rollback 요청 body, 제출 row |
| `00042` | rollback 삭제 | NAS 임시 파일 삭제 실패 | file-writer, NAS 경로와 권한 |
| `00043` | rollback 후처리 | 클라이언트가 rollback 호출 자체를 완료하지 못함 | 원래 오류코드와 함께 확인 |
| `00090` | 공통 | 분류되지 않은 알 수 없는 오류 | 브라우저 콘솔, Edge Function 로그 |

트러블슈팅 순서:

1. 사용자에게 화면에 보이는 오류코드와 사용 기기/브라우저를 확인합니다.
2. `00030`이면 먼저 같은 시각 `vm-web-01` access log에 `POST /api/review-receive-photo-sync`가 있는지 확인합니다. POST가 없으면 브라우저~Cloudflare 구간, 있으면 Nginx 이후 상태코드를 확인합니다.
3. same-origin 전환 후 정상 브라우저 요청에는 CORS `OPTIONS`가 필요하지 않습니다. 같은 시각 direct API 대상 `OPTIONS`만 보이면 이전 번들 캐시 또는 이전 경로 사용 여부를 확인합니다.
4. `00031`~`00038`은 `vm-web-01` → Kong/Edge Function → file-writer/DB/NAS 순서로 동일 시각의 요청과 상태코드를 대조합니다.
5. rollback 코드가 함께 표시되면 원래 오류코드를 먼저 보고, 추가 정리 오류코드는 NAS 임시 파일 잔여 가능성 확인에 사용합니다.
