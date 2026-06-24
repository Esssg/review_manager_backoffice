# 운영 가이드

## 공개 리뷰받기 사진 제출 오류코드

대상 화면:

- `/review-receive/specific/:productId`

사진 제출 흐름:

1. 브라우저에서 파일 선택 및 사전 검증
2. Supabase Edge Function `review-receive-photo-sync` `prepare` 호출
3. 브라우저에서 S3 presigned URL로 직접 `PUT` 업로드
4. Supabase Edge Function `review-receive-photo-sync` `commit` 호출
5. 실패 시 Supabase Edge Function `review-receive-photo-sync` `rollback` 호출

사용자 화면에는 `[00020] 사진 파일을 저장소로 전송하지 못했습니다.`처럼 코드와 메시지를 함께 표시합니다. 사용자가 오류를 제보하면 아래 표를 기준으로 실패 지점을 먼저 확인합니다.

| 코드 | 단계 | 의미 | 우선 확인할 곳 |
|---|---|---|---|
| `00001` | 파일 선택 | 이미지가 아닌 파일 선택 | 사용자 선택 파일 확장자/브라우저 파일 타입 |
| `00002` | 파일 선택 | 0바이트이거나 브라우저가 읽을 수 없는 파일 | 파일 손상 여부, 모바일 사진 접근 권한 |
| `00003` | 파일 선택 | 10MB 초과 | 파일 용량 |
| `00004` | 파일 선택 | 한 번에 10장 초과 | 선택한 사진 개수 |
| `00005` | 파일 미리보기 | 브라우저가 미리보기 URL 생성 실패 | 모바일 브라우저 메모리/파일 접근 권한 |
| `00010` | prepare 요청 | Edge Function 준비 요청이 네트워크/Relay 단계에서 실패 | Supabase Functions 접근성, 네트워크, CORS |
| `00011` | prepare 요청 | 준비 요청 payload가 올바르지 않음 | 클라이언트 요청 body, 파일 메타데이터 |
| `00012` | prepare 권한 | `productId`, `submissionId`, `assignName` 조합 불일치 | 제출 row, 배정명, 상품 ID |
| `00013` | prepare 잠금 | 이미 `is_review_verified = true`라 수정 불가 | 관리자 리뷰완료 상태 |
| `00014` | prepare 서버 | S3 시크릿/설정 또는 presigned URL 발급 실패 | Edge Function 로그, AWS 시크릿, S3 권한 |
| `00015` | prepare 응답 | 준비 응답에 업로드 URL 목록이 없거나 개수가 다름 | Edge Function 응답 payload |
| `00020` | S3 업로드 | 브라우저 `fetch` 자체 실패. 기존 `failed to fetch`가 이 코드로 표시될 가능성이 높음 | 모바일 네트워크, S3 CORS, DNS/TLS, 브라우저 차단 |
| `00021` | S3 업로드 | S3가 4xx/5xx로 업로드 거부 | S3 CORS, presigned URL 만료/서명, 버킷 권한 |
| `00022` | S3 업로드 | 업로드 요청이 중단됨 | 사용자의 화면 이탈, 브라우저 abort, 네트워크 전환 |
| `00030` | commit 요청 | DB 저장 요청이 네트워크/Relay 단계에서 실패 | Supabase Functions 접근성, 네트워크 |
| `00031` | commit 요청 | DB 저장 요청 payload가 올바르지 않음 | `uploadedFiles`, `removedImageUrls` 형식 |
| `00032` | commit 권한 | 사진 저장 권한 확인 실패 | 제출 row, 배정명, 상품 ID |
| `00033` | commit 잠금 | commit 시점에 리뷰완료 처리되어 저장 불가 | 관리자 리뷰완료 상태 변경 여부 |
| `00034` | commit 조회 | 기존 사진 목록 조회 실패 | `evidence_photos` 조회, Supabase DB 로그 |
| `00035` | commit insert | 새 사진 URL을 `evidence_photos`에 저장 실패 | `evidence_photos` insert 권한/제약조건 |
| `00036` | commit delete | 기존 사진 URL 삭제 실패 | `evidence_photos` delete 조건/권한 |
| `00037` | commit 응답 | 저장 응답에 최종 사진 목록이 없음 | Edge Function 응답 payload |
| `00038` | commit 서버 | commit 중 분류되지 않은 서버 문제 | Edge Function 로그, Supabase 시크릿/DB 연결 |
| `00040` | rollback 요청 | 실패 후 임시 파일 정리 요청이 네트워크 단계에서 실패 | Supabase Functions 접근성, 네트워크 |
| `00041` | rollback 권한 | 임시 파일 정리 요청 형식 또는 권한 확인 실패 | rollback 요청 body, 제출 row |
| `00042` | rollback 삭제 | S3 임시 객체 삭제 실패 | S3 삭제 권한, object key prefix |
| `00043` | rollback 후처리 | 클라이언트가 rollback 호출 자체를 완료하지 못함 | 원래 오류코드와 함께 확인 |
| `00090` | 공통 | 분류되지 않은 알 수 없는 오류 | 브라우저 콘솔, Edge Function 로그 |

트러블슈팅 순서:

1. 사용자에게 화면에 보이는 오류코드와 사용 기기/브라우저를 확인합니다.
2. `00020`, `00021`, `00022`는 S3 직접 업로드 구간이므로 Supabase DB보다 S3 CORS, presigned URL, 모바일 네트워크를 먼저 확인합니다.
3. `00010`, `00030`, `00040`은 Supabase Edge Function 호출 자체가 불안정한 경우이므로 Functions 접근성과 네트워크를 먼저 확인합니다.
4. `00014`, `00034`, `00035`, `00036`, `00038`, `00042`는 Edge Function 또는 DB/S3 서버 로그를 우선 확인합니다.
5. rollback 코드가 함께 표시되면 원래 오류코드를 먼저 보고, 추가 정리 오류코드는 S3 임시 파일 잔여 가능성 확인에 사용합니다.
