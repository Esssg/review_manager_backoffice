# 상품/리뷰어 일괄입력 빠른 bulk 저장 개선 계획

- 작성일: 2026-09-02
- 상태: 로컬 UI canary 완료 · 원격 DB/Edge 반영 완료 · 웹 배포 완료
- 대상: `review_manager_backoffice`의 리뷰받기 일괄입력 저장 흐름
- 1차 목표: 두 일괄입력 화면의 공통 bulk 저장 계약과 애매한 정책을 확정
- 2차 목표: 구현·검증·canary 배포 완료

## 0. 계획의 전제

이번 문서는 다음 두 화면의 저장 지연을 해결하기 위한 계획이다.

1. `리뷰받기` 목록의 상품/리뷰어 일괄입력
2. 기존 상품 상세 내부의 상품/리뷰어 일괄입력

사진 있음 미리보기 동기화 지연, 상품전체보기 열 필터, 파일 업로드의 별도 저장 경로는 이번 bulk 저장 계획의 직접 대상에서 제외한다. 동일한 성능 기준을 적용할 필요가 있으면 질문 답변으로 범위를 확장한다.

## 1. 조사로 확인된 현재 상태

### 1-1. 실제 canary 결과

- 테스트 계정으로 빈 여러상품을 만든 뒤 제공된 11행 데이터를 저장했다.
- 화면 파서는 `품목 11개 / 리뷰어 11명`으로 해석했다. 날짜·업체명·품명·옵션·리뷰형태 조합이 달라지는 구간마다 품목 그룹이 나뉘는 현재 규칙 때문이다.
- 테스트 번들 `6056` 아래 품목 `6056~6066`과 제출 11건이 DB에 반영된 것을 읽기 전용으로 확인했다.
- 저장 중 `/api/admin-gateway/data` 요청 22개가 발생했다.
- 22개 요청은 모두 HTTP 200이었고, 각 요청은 약 128~136ms, 첫 요청부터 마지막 요청까지 약 2.8초였다.
- 저장 구간에 실패·재시도는 없었다.
- DB 누적 통계에서 상품 생성·제출 생성 RPC의 평균 DB 실행은 수 ms 수준으로 관측되어, 이번 지연의 주된 요인은 순차 HTTP/Edge/gateway 왕복으로 추정한다. 누적 통계이므로 개별 요청의 정확한 DB 시간으로 단정하지 않는다.

### 1-2. 코드에서 확인된 원인

- 목록 화면 `src/pages/admin/AdminReviewReceivePage.tsx`의 bulk 저장은 품목 저장을 순서대로 기다린 뒤 해당 품목의 제출을 순서대로 저장한다.
- 상세 화면 `src/pages/admin/AdminReviewReceiveDetailPage.tsx`도 빈 상품 수정 또는 품목 생성 후 제출을 순서대로 저장한다.
- 두 화면 모두 현재 공통 bulk gateway operation을 호출하지 않는다.
- `admin-gateway`의 `data` 처리마다 세션 확인, access bundle 조회, operation 권한 확인, 개별 RPC 호출이 반복된다.
- 라이브 DB에는 구형 `create_admin_review_receive_product_reviewer_bulk(text,jsonb)` 함수가 확인되지만, 새 웹 저장소 계약은 여기에 의존하지 않는다. 기존 호출을 보존하기 위해 `bulk_v2` RPC와 operation을 별도로 추가한다.

### 1-3. 예상 효과

현재 11행처럼 품목 11개와 리뷰어 11명이면 22회의 순차 왕복이 발생한다. 목표 구현은 입력 전체를 하나의 bulk operation으로 보내고 서버에서 처리하여, 상세 화면의 빈 상품 재사용을 포함해 HTTP 왕복을 1회 또는 꼭 필요한 최소 횟수로 줄인다.

100행 기준으로는 현재 구조가 리뷰어 수와 품목 그룹 수에 따라 최소 101회에서 최대 200회 이상의 요청을 만들 수 있다. bulk 처리 후에는 네트워크 왕복 수가 행 수에 비례하지 않도록 한다.

## 2. 범위와 제외 범위

### 포함

- 두 화면의 파싱 결과를 동일한 bulk 저장 payload로 변환
- 목록 화면의 첫 상품 생성과 같은 번들의 후속 품목 생성
- 상세 화면의 빈 상품 row 재사용과 같은 번들의 후속 품목 생성
- 각 품목의 submissions 일괄 생성
- gateway allowlist, 서버 권한, 회사/본인 데이터 범위 검증
- 중복 클릭 방지, 입력 오류, 권한 오류, 부분 실패 또는 원자성 정책
- 결과를 이용한 한 번의 화면 상태 반영
- 요청 수·총 시간·품목 수·제출 수만 기록하는 비식별 성능 로그

### 제외 또는 별도 확인

- 사진 파일 자체 업로드 및 사진 썸네일 동기화
- 상품전체보기의 필터 조회·사진 집계
- `/admin/file-upload`의 Excel 반영 경로
- 기존 테스트 데이터 삭제
- 허용 목록 밖의 DB 테이블, `auth`, `storage` 객체 변경

## 3. 제안 구현 구조

Q1~Q12 답변을 반영한 구현 기준이다. 아래 구조·정책·검증 순서에 따라 구현하되, 코드·DB·원격 서비스 변경은 각 단계의 검증과 승인 범위 안에서 수행한다.

### 3-1. 공통 서비스와 payload

1. `src/services`에 상품/리뷰어 bulk 저장 책임을 둔다.
2. `src/utils`의 기존 parser와 정규화 함수를 재사용하고, 화면 컴포넌트에 Supabase 호출을 추가하지 않는다.
3. 목록과 상세 화면은 각각 화면 특유의 대상 상품 정보만 조합하고, 실제 저장 호출은 공통 서비스 하나를 사용한다.
4. bulk payload는 다음 정보를 포함한다.
   - 품목 그룹 목록
   - 각 품목의 상품 필드
   - 각 품목의 리뷰어 목록
   - 상세 화면에서 재사용할 빈 상품 ID
   - 선택된 제품비·리뷰비 입금구분
5. 성공 반환값은 생성·수정된 품목, 생성된 submissions, `partial: false`, 요약 수치를 포함한다. 오류는 전체 rollback과 함께 gateway 오류로 반환한다.
6. payload와 반환값에는 이메일·전화번호·주소·계좌·주문 원문을 로그로 남기지 않는다.

### 3-2. DB RPC와 migration

1. 라이브 DB 함수의 현재 정의·권한·반환 계약을 migration 원본과 대조한다.
2. 호환 가능하면 기존 bulk RPC를 정식 migration으로 편입하고, 호환되지 않으면 새 이름과 명시적 계약으로 추가한다.
   - 현재 라이브 함수는 부분 성공을 반환하고 상세 화면의 빈 상품을 재사용하지 않으므로, Q3·Q4 선택을 만족하도록 그대로 연결하지 않고 동작을 보완하거나 새 버전 계약으로 정리한다.
3. 상세 화면은 첫 품목에 기존 빈 상품을 재사용해야 하므로, RPC가 기존 상품 수정과 후속 품목 생성을 안전하게 처리할 수 있어야 한다.
4. RPC 내부에서 다음을 검증한다.
   - actor의 `product.create`, `product.update`, `submission.create` 권한
   - 대상 상품과 번들의 회사/데이터 범위
   - 허용된 상품·제출 필드만 입력됐는지
   - 빈 그룹·필수값·최대 건수
   - 중복 제출 정책
5. 허용된 `public.admins`, `public.products`, `public.submissions` 및 기존 허용 helper만 사용하고, 다른 테이블을 새로 추가하지 않는다.
6. migration 적용 후 함수 시그니처, ACL, 샘플 호출, products/submissions count를 읽기 전용으로 재확인한다.
7. `docs/guide_db.md`에 최종 RPC 입력·출력·권한·부분 실패/원자성 계약을 갱신한다.

### 3-3. gateway 연결

1. `src/services/adminGatewayData.ts`에 bulk operation 상수를 추가한다.
2. `supabase/functions/admin-gateway/index.ts`의 operation-to-RPC allowlist와 최소 권한 목록에 같은 operation을 추가한다.
3. 모든 요청은 기존 httpOnly gateway session principal을 사용하고, 클라이언트가 전달하는 관리자 ID를 권한 주체로 사용하지 않는다.
4. gateway 로그에는 request ID, operation, group count, reviewer count, duration, result count, error code만 기록한다.
5. 응답 timeout과 Edge wall-clock 한도를 확인하고, 100건 성능 목표와 최대 500건 입력이 제한시간·payload 한도를 넘지 않는지 측정한다.

### 3-4. 두 화면 연결

#### 목록 화면

- `AdminReviewReceivePage`는 gateway가 준비된 경우 공통 bulk service를 호출하고, gateway가 꺼진 호환 환경에서는 기존 순차 loop를 fallback으로 유지한다.
- 첫 품목의 생성 결과에서 번들 ID를 확정하고 나머지 품목이 같은 번들에 연결되도록 서버 계약으로 보장한다.
- 성공 시 목록을 한 번만 갱신하고, 실패 시 서버 반환 결과에 맞춰 성공/실패 수를 표시한다.

#### 상세 화면

- `AdminReviewReceiveDetailPage`에서 첫 빈 상품 재사용과 후속 품목 생성을 bulk payload에 포함한다.
- 성공한 품목과 submissions를 반환값으로 한 번에 화면 상태에 반영한다.
- gateway 경로에서 기존의 품목별 순차 `await`와 품목마다 반복되는 gateway 호출을 제거한다. 호환 fallback 경로는 rollback을 위해 남긴다.
- 권한이 상품 생성과 상품 수정으로 나뉘는 경우에도 빈 상품 재사용·신규 품목 생성 권한 오류를 구분해 표시한다.

### 3-5. React/UI 성능과 오류 상태

- 입력 파싱과 저장 payload 생성은 네트워크와 분리된 순수 함수로 유지한다.
- 저장 중 버튼 중복 클릭을 막고, 현재 단계·진행 중 상태·실패 이유를 숨기지 않는다.
- bulk 완료 후 전체 상세 재조회가 필요하지 않으면 RPC 반환값으로 한 번만 상태를 갱신한다.
- 긴 제출 목록에서 실제 렌더링 병목이 측정될 경우에만 memoization, 파생값 계산 축소, 렌더링 분할을 적용한다.
- `Promise.all`로 상품 생성과 제출 생성을 무제한 병렬화하지 않는다. 번들 ID와 권한/실패 순서 의존성이 있으므로 서버 bulk transaction 또는 서버 내부 제한 loop를 우선 검토한다.

## 4. 테스트 계획

### 4-1. 순수 로직

- 기존 11행이 의도한 품목 그룹 수로 파싱되는지 확인
- 같은 품목의 여러 리뷰어가 한 그룹으로 유지되는지 확인
- 날짜·업체명·품명·옵션·리뷰형태 변경 시 그룹 경계 확인
- 헤더·빈 행·필수값 누락·금액 형식·잘못된 boolean 처리 확인
- 1행, 11행, 100행, 500행 및 501행 제한 경계 확인

### 4-2. 저장 계약

- 목록 화면: 신규 번들 1개와 후속 품목 생성
- 상세 화면: 빈 상품 재사용 + 후속 품목 생성
- 한 품목의 submissions 여러 건
- 제품/리뷰비 입금구분 적용
- 권한 없음, 회사 범위 밖 대상, 세션 만료
- 네트워크 실패, RPC 오류, 중복 클릭, timeout 뒤 재시도
- 선택한 원자성/부분 성공 정책에 따른 실제 결과와 화면 메시지

### 4-3. 브라우저 canary

테스트 계정으로 개인정보가 없는 synthetic 데이터와 필요한 11행 데이터를 각각 확인한다.

- 두 진입점 모두 저장 성공 및 화면 재진입 후 count 확인
- 브라우저 네트워크 요청 수를 기존 22회와 비교
- 1행·11행·100행·500행의 parse, request, server, render 시간을 분리 기록
- 저장 완료 후 중복 품목·중복 submission이 없는지 확인
- 권한/회사 범위가 다른 테스트 계정에서 동일한 데이터 노출이 없는지 확인
- 실제 운영 배포 전에는 사용자 승인된 canary 범위만 사용하고 원본 개인정보를 로그·스크린샷·문서에 남기지 않는다.

### 4-4. 회귀 검증

- `npm test` 또는 관련 Node 테스트
- `npm run build`
- 필요 시 `npm run supabase:check`
- 리뷰받기 목록·상세 직접 URL, 권한 없는 접근, 상품 생성/수정, 제출 조회 회귀
- 공개 리뷰받기 사진 흐름은 이번 저장 변경이 영향을 주지 않는지 최소 smoke 확인만 하고, 사진 성능 개선은 별도 계획으로 관리

## 5. 성능 측정 및 완료 기준

성능·원자성·최대 입력량 기준은 Q1~Q12 답변으로 확정한다.

- 두 화면 모두 bulk 저장 operation을 사용한다.
- 11행 입력의 HTTP 저장 왕복을 1회 또는 최소 계약 횟수로 줄인다.
- 100행 및 500행 입력에서 데이터 누락·중복·부분 결과 불일치가 없다.
- 저장 중 원문 개인정보가 로그·오류 메시지·스크린샷에 노출되지 않는다.
- 서버 로그로 parse, gateway, DB/RPC, 화면 반영 구간을 구분할 수 있다.
- 사용자 확정 성능 목표를 LAN과 외부망 조건에서 각각 검증한다.
- 실패 시 전체 rollback과 timeout 후 확인 방법이 문서화되어 있고, gateway 미준비 시 기존 순차 경로를 비상 fallback으로 유지한다.

## 6. 배포·rollback 순서

1. 질문 답변으로 저장 원자성, 그룹 규칙, 중복, 최대 건수/timeout, 성능 목표를 확정한다.
2. 현재 라이브 DB bulk 함수와 소스 계약을 백업·대조하고 canonical migration을 작성한다.
3. staging 또는 승인된 테스트 DB에 migration을 additive 적용하고 RPC/ACL/count를 검증한다.
4. gateway operation과 공통 서비스를 연결하고 관련 unit/contract 테스트를 실행한다.
5. 두 화면을 새 operation으로 연결하고 build 및 브라우저 canary를 실행한다.
6. test1에서 1·11·100·500건을 검증한 뒤 사용자 확인을 받는다.
7. 승인 후 backoffice 이미지와 gateway/DB 변경을 운영에 반영한다. 서비스 재시작·컨테이너 교체·원격 배포는 별도 영향·rollback·검증 승인 후 수행한다.
8. 문제 발생 시 feature flag 또는 새 operation 사용을 중지하고 기존 순차 경로로 되돌린다. 생성된 운영 데이터를 자동 삭제하지 않는다.

## 7. 확정 질문과 답변

아래 답변으로 최종 저장 계약을 확정했다. Q10의 자유 답변은 Q12에서 A안의 구체적인 최대 500행 정책으로 보완 확정했다.

### Q1. 이번 최적화 범위

선택지:

- A (권장): 두 `상품/리뷰어 일괄입력` 화면만 대상으로 한다.
- B: 두 화면과 `/admin/file-upload`의 Excel 저장도 같은 bulk 기준으로 포함한다.
- C: 리뷰받기·상품전체보기·파일 업로드의 모든 bulk/대량 저장을 한 번에 포함한다.

답변: A

### Q2. 11행이 여러 품목으로 나뉘는 현재 그룹 규칙

선택지:

- A (권장): 현재 규칙 유지. 날짜·업체명·품명·옵션·리뷰형태가 달라지면 별도 품목으로 저장한다.
- B: 품명과 업체명이 같으면 옵션·리뷰형태가 달라도 하나의 품목으로 묶는다.
- C: 사용자가 저장 전에 그룹 결과를 직접 합치거나 나눌 수 있게 한다.

답변: A

### Q3. 일부 저장 실패 시 처리 방식

선택지:

- A (권장): 전체 성공 또는 전체 rollback의 원자적 저장으로 처리한다.
- B: 현재처럼 성공한 품목/리뷰어는 남기고 실패 행과 이유를 표시한다.
- C: 기본은 원자적 저장, 사용자가 별도 옵션으로 부분 저장을 선택한다.

답변: A

### Q4. 상세 화면의 빈 상품 처리

선택지:

- A (권장): 첫 그룹은 기존 빈 상품에 저장하고, 나머지는 같은 bundle_id로 새 품목을 만든다.
- B: 기존 빈 상품을 사용하지 않고 모든 품목을 새로 만든다.
- C: 저장 전에 사용자가 기존 빈 상품 사용 여부를 선택한다.

답변: A

### Q5. 같은 데이터를 다시 붙여넣었을 때의 중복 정책

선택지:

- A (권장): 현재처럼 매번 새 품목/제출로 추가한다.
- B: 같은 번들·품목·주문번호가 있으면 기존 제출을 갱신한다.
- C: 중복을 발견하면 전체 저장을 거부하고 중복 행을 표시한다.

답변: A

### Q6. 성능 목표

선택지:

- A (권장): 100행을 LAN에서 5초 이내, 외부망/테더링에서 15초 이내로 완료한다.
- B: 100행을 LAN에서 10초 이내로 완료하고 외부망은 별도 측정값으로 관리한다.
- C: 먼저 새 구조를 적용한 뒤 실제 측정값을 기준으로 목표를 정한다.

답변: A

### Q7. 최대 입력량과 요청 제한

선택지:

- A (권장): 100행까지 한 번의 bulk 요청으로 처리하고, 초과분은 명확한 안내로 막는다.
- B: 50행 단위로 서버에서 분할 처리하고 각 chunk 결과를 합친다.
- C: 1,000행 이상을 고려한 비동기 작업/진행률 구조까지 설계한다.

답변: B

### Q8. 기존 DB bulk RPC의 처리 방식

선택지:

- A (권장): 현재 DB 함수의 동작을 검토해 canonical migration으로 편입하고 gateway/프론트 연결을 보완한다.
- B: 기존 DB 함수는 사용하지 않고 새 RPC를 설계한다.
- C: DB 함수와 현재 화면 계약이 달라질 때만 새 RPC를 추가한다.

답변: A

### Q9. 운영 반영 방식

선택지:

- A (권장): test1 canary → 사용자 확인 → 운영 반영
- B: 빌드·자동 테스트 후 바로 운영 반영
- C: 코드와 migration만 준비하고 이번 단계에서는 원격 반영하지 않는다.

답변: A

### Q10. 50행 단위 분할과 전체 원자성의 범위

`Q3=A`는 전체 입력이 모두 성공하거나 모두 rollback되는 것을 의미하고, `Q7=B`는 50행 단위 분할을 선택했습니다. 두 정책의 적용 범위를 정해야 합니다.

선택지:

- A (권장): 최대 500행을 한 HTTP 요청으로 받고, 서버/DB 내부에서 50행 단위로 처리하되 전체를 하나의 transaction으로 묶는다. 어느 chunk에서 실패해도 전체 rollback한다.
- B: 50행마다 별도 HTTP 요청·transaction으로 저장한다. 앞 chunk 성공 후 뒤 chunk가 실패하면 앞 chunk는 남긴다.
- C: 한 요청은 최대 50행으로 제한하고, 사용자가 직접 나누어 여러 번 저장한다.

답변: A 취지로 최대 500행까지 한 요청으로 받을 수 있게 해줘

### Q11. timeout·재시도와 중복 저장

`Q5=A`는 사용자가 같은 데이터를 다시 붙여넣으면 새로 추가하는 정책입니다. 반면 네트워크 timeout 뒤 자동 재시도는 같은 작업인지 새 작업인지 구분해야 합니다.

선택지:

- A (권장): 자동 재시도하지 않고, 결과 확인이 필요한 상태를 표시한다. 사용자가 확인 후 다시 붙여넣으면 Q5=A에 따라 새 데이터로 추가한다.
- B: 저장 batch에 idempotency key를 부여해 동일한 자동 재시도는 한 번만 반영하고, 사용자가 새로 붙여넣은 작업은 새 key로 추가한다. 이를 위해 허용된 `products` 또는 `submissions`에 batch 식별자 저장 방식을 추가 검토한다.
- C: timeout 뒤 자동 재시도하며 중복 가능성을 사용자에게 안내한다.

답변: A

### Q12. 최대 500행의 저장 단위와 성능 기준

Q10에서 최대 500행까지 입력받기로 했습니다. `Q3=A`의 전체 원자성, `Q7=B`의 50행 단위 내부 처리, `Q6=A`의 100행 성능 목표를 500행에서 어떻게 적용할지 확정해야 합니다.

선택지:

- A (권장): 최대 500행을 한 HTTP 요청으로 받고, 서버/DB 내부에서 50행씩 처리하되 요청 전체를 하나의 transaction으로 묶는다. 100행은 LAN 5초 이내·외부망 15초 이내를 목표로 하고, 500행은 제한시간 내 완료와 데이터 정확성을 우선 측정한다.
- B: 최대 500행을 받되 50행 chunk마다 별도 transaction으로 커밋한다. 앞 chunk가 저장된 뒤 뒤 chunk가 실패할 수 있으므로 전체 rollback은 보장하지 않는다.
- C: 500행은 비동기 작업으로 전환하고 진행률을 표시한다. 요청은 작업 등록만 성공시키며, 완료/실패 결과를 별도로 조회한다.

답변: A

## 8. 답변 반영 및 로컬 구현 결과

1. 공통 서비스 `src/services/adminReviewReceiveProductReviewerBulk.ts`를 추가하고, 클라이언트 식별자·관계 필드를 제거한 bulk payload를 만들도록 했다.
2. `20260902090000_add_admin_review_receive_product_reviewer_bulk.sql`에 기존 라이브 bulk RPC를 교체하지 않는 `create_admin_review_receive_product_reviewer_bulk_v2`를 추가했다. 최대 500행·50행 내부 순회·전체 transaction rollback·빈 상품 재사용·권한/범위 검증을 포함한다.
3. `admin-gateway` operation allowlist와 비식별 bulk 성능 로그를 연결했다.
4. 리뷰받기 목록·상품 상세 두 화면을 bulk operation에 연결하고, gateway 미준비 시 기존 순차 fallback을 유지했다.
5. parser는 501행 이상을 저장 전에 거부하고, timeout 시 자동 재시도 없이 실제 반영 여부를 확인하도록 안내한다.
6. 로컬 검증 결과: `npm test` 91개 통과, `npm run build` 성공, `git diff --check` 통과.
7. `npm run supabase:check`는 로컬에 Supabase URL/KEY가 없어 원격 확인을 수행하지 못했다. 이후 원격 DB migration과 Edge Function을 반영했고, 웹 정적 파일은 배포하지 않았다.
8. 로컬 Vite와 same-origin gateway proxy를 사용한 test1 UI canary에서 11행·100행 저장을 완료했다. 두 테스트 모두 `bulk_v2` 단일 요청·HTTP 200·DB count/중복 대조까지 확인했다.
9. 원격 DB/Edge 적용 결과: 새 `create_admin_review_receive_product_reviewer_bulk_v2(text,jsonb)`를 추가하고 구형 RPC/operation은 보존했다. 운영 Edge는 현재 소스 기반 최소 patch만 반영했으며, Edge Runtime bundle 검증·functions 단독 재시작·DB/Kong/file-writer 불변·비인증 401을 확인했다. 웹 정적 파일은 배포하지 않았다.

## 9. 로컬 UI canary 결과 — 2026-09-02 KST

1. 로컬 Vite를 실행하고 `/api/admin-gateway`를 Backoffice same-origin 경로(`sinabro.review-manager.online`)로 전달하는 임시 proxy를 사용했다. Supabase/Kong 직접 주소를 proxy 대상으로 사용하지 않았다.
2. `test1`로 `리뷰받기 → 상품 추가하기 → 여러상품`에서 빈 상품을 만든 뒤 상세 화면의 `상품/리뷰어 일괄 입력`으로 synthetic 데이터만 저장했다. 실제 고객 개인정보는 사용하지 않았다.
3. 11행 결과: product group 1개, reviewer 11명, 저장 중 `/api/admin-gateway/data` 1회, HTTP 200, 브라우저 측 약 300ms, 화면 완료 약 828ms. DB에서 제출 11건·주문번호 distinct 11건을 확인했다.
4. 100행 결과: product group 1개, reviewer 100명, 저장 중 `/api/admin-gateway/data` 1회, HTTP 200, 브라우저 측 약 376ms, 화면 완료 약 839ms. Edge 비식별 로그의 내부 duration은 약 83ms였고, DB에서 제출 100건·주문번호 distinct 100건을 확인했다.
5. 11/100행 모두 bulk operation 외 저장 재시도·부분 오류는 없었다. 이전 순차 구조의 행 수 비례 요청과 비교해 저장 요청 수가 1회로 줄어든 것을 확인했다.
6. Edge 결과 count는 `productCount=1`, `submissionCount=11/100`으로 정확했지만, 현재 비식별 payload 로그의 `groupCount/reviewerCount`는 wrapper(`p_payload`)를 한 단계 놓쳐 `0/0`으로 기록됐다. 저장 기능에는 영향이 없으나 관측 로그 수정이 남아 있다.
7. 테스트 과정에서 synthetic 빈 shell 1개와 성공 canary 2개(11행·100행)가 test1 데이터에 남아 있다. 기존 계획의 “기존 테스트 데이터 삭제 제외/자동 삭제하지 않음”에 따라 이번 단계에서는 삭제하지 않았다.

## 12. 상세 bulk 반복 입력 시 새 목록 행 생성 회귀 수정 — 2026-09-03 KST

상태: 로컬 코드·계약 테스트·build 완료. 2026-09-03 원격 DB migration·로컬 게이트웨이 UI canary·웹 app 배포와 외부 smoke 검증까지 완료했다.

### 원인

- 빠른 bulk v2 경로가 품목 payload의 `bundle_id`를 제거한 뒤, 빈 상품 재사용 ID만 서버에 전달했다.
- 첫 입력 후 기존 상품은 더 이상 빈 상품이 아니므로 두 번째 입력에는 `reusable_product_id`가 없었다.
- 서버는 대상 묶음 정보를 받지 못해 새 상품을 새 `bundle_id`로 만들었고, 리뷰받기 목록은 `bundle_id` 기준으로 집계하므로 행이 추가됐다.

### 수정

- 상세 화면에서 빈 상품을 재사용하지 않는 반복 입력일 때 현재 상세의 묶음 ID를 `target_bundle_id`로 전달한다.
- bulk v2 RPC가 대상 상품/묶음의 canonical `bundle_id`를 확인하고 actor의 `product.create` 범위를 검증한 뒤 새 품목을 기존 묶음에 연결한다.
- `target_bundle_id`가 없는 목록 bulk와 새 상품 생성 동작은 기존처럼 새 묶음을 만든다.
- `target_bundle_id`와 빈 상품 ID가 서로 다른 묶음을 가리키면 저장 전체를 rollback한다.

### 검증·남은 단계

- `npm test`, `npm run build`, `git diff --check`를 실행해 통과했다.
- `vm-app-01`(`jinitlab-2-ubuntu2`)의 `/opt/supabase/docker` 원격 Supabase DB에 migration을 `supabase_admin`으로 적용했다. 함수 owner/ACL을 보존하고 `target_bundle_id` 포함 여부를 확인했으며, DB·Edge 컨테이너 ID와 상태/uptime은 변경되지 않았다. 사전 RPC 정의·ACL·migration 원본은 `/opt/supabase/backups/review-manager-bulk-bundle-fix-20260903`에 보관했다.
- 로컬 Vite(`127.0.0.1:4175`)에서 same-origin gateway proxy로 `test1` canary를 실행했다. 빈 묶음에 synthetic 11건을 저장한 뒤 같은 묶음에 다시 11건을 저장했고, 상세는 품목 2개(각 11건), 전체 22건, 목록은 `22/0/0/(총 22개)` 한 행으로 표시됐다. 첫 번째 저장은 약 1.19초, 두 번째 저장은 약 1.25초였고 브라우저 warn/error 로그는 없었다.
- 원격 `vm-web-01`의 기존 dirty source 변경은 보존하고 대상 source를 `/home/jinitlab/review_manager_backoffice/.codex-backup-bundle-fix-20260903`에 백업했으며, 기존 실행 image는 `review-manager-backoffice:codex-backup-bundle-fix-20260903` tag로 보존했다.
- 원격 Docker build에서 `npm test` 94/94와 Vite production build가 통과한 뒤 신규 image `sha256:0aafcaabac51f1c5a20276d4b4fc2dfaef5cb34fc76daaa0c058b159efc19dd1`로 `app`만 `--no-deps --force-recreate`했다. 원격 source `git diff --check`도 통과했다.
- 배포 후 Docker health와 내부·공개 `/healthz`는 `200`, 무인증 `POST /api/admin-gateway/data`는 `401`이었고 최근 app 진단 로그에서 error/warn 항목은 확인되지 않았다.
- 이번 수정에서는 DB migration을 선 적용했고 Edge Function은 변경·재시작하지 않았다. 웹 배포에서도 DB·Kong·file-writer 및 다른 컨테이너는 변경하지 않았다.
- 기존 운영 데이터와 canary 테스트 데이터는 자동 삭제·병합하지 않는다.

## 13. 리뷰받기·상품전체보기 컬럼 정렬 및 전체 데이터 커서 정렬 계획 — 2026-09-03 KST

상태: 사용자 답변(Q1~Q8) 반영 · 로컬 구현·테스트·빌드와 2026-09-04 운영 DB·Edge Function·웹 배포 완료. 운영 DB runtime·page-boundary·ACL, Edge 인증 경계, 웹 health와 실제 인증 요청까지 검증했다.

### 요청사항

1. `리뷰받기`의 기존 필터 아이콘을 3개점 메뉴로 바꾸고, 메뉴에서 `오름차순 정렬`, `내림차순 정렬`, `필터 입력`을 선택한다.
2. `상품전체보기`의 헤더를 눌러 `오름차순`, `내림차순`, `정렬없애기`를 선택한다. 현재 필터 입력 행은 유지한다.
3. 정렬은 현재 브라우저에 로드된 행만 대상으로 하지 않는다. 현재 scope·상태·필터 조건에 맞는 전체 DB 결과를 정렬한 뒤, 기존과 같은 페이지 크기로 첫 페이지를 내려주고 스크롤 시 같은 정렬 기준으로 다음 페이지를 추가 조회한다.

### 13-1. 현재 구현에서 확인된 사실

- `ReviewReceiveFilterHeader`는 `Filter` 아이콘을 눌러 기존 필터 popover를 여는 구조이며, 정렬 상태나 정렬 메뉴는 없다.
- `AdminReviewReceivePage`는 필터·scope·상태를 gateway 요청에 전달하지만, 현재 요청에는 sort 조건이 없다. 첫 페이지는 50건이며 다음 요청은 등록일/상품 ID 기반 cursor를 사용한다.
- `get_admin_review_receive_product_summaries_gateway`는 필터 후 현재 기본 순서인 `등록일 내림차순 → 대표 상품 ID 내림차순`으로만 정렬한다. 리뷰받기는 번들 대표 행 단위이므로 품명·업체명·완료현황 등의 정렬 기준을 별도로 정의해야 한다.
- `ProductOverviewTable`의 첫 번째 헤더 행은 단순 label이고, 두 번째 행에만 필터 입력이 있다. `AdminProductOverviewPage`와 `productOverview` service에는 sort 상태·요청 필드가 없다.
- `get_admin_product_overview_rows_gateway`는 현재 기본 순서인 `상품 생성일 내림차순 → 상품 ID → 제출 생성일 → 제출 ID`로만 정렬한다. 첫 페이지는 300건이며 다음 요청은 이 고정 순서의 cursor를 사용한다.
- `filteredProducts`와 상품전체보기 `rows`에는 현재 로드된 데이터만 존재한다. 클라이언트 배열 정렬만 추가하면 50건/300건 경계 뒤의 행 순서를 알 수 없으므로 전체 데이터 정렬 요구사항을 위반한다.
- 현재 gateway 응답은 page size 초과 행으로 다음 cursor를 추정하는 호환 경로가 있으므로, 새 정렬에서는 정렬값·null 여부·tie-breaker를 포함한 `nextCursor`를 서버가 명시적으로 반환하도록 계약을 보강한다.

### 13-2. 제안 UI 동작

#### 리뷰받기

- 기존 필터 아이콘을 3개점 아이콘으로 교체한다. 메뉴는 기존 `DropdownMenu` 공통 컴포넌트를 재사용한다.
- 메뉴 항목은 `오름차순 정렬`, `내림차순 정렬`, `필터 입력`으로 구성한다. `필터 입력`은 현재 date range/text 입력 popover를 그대로 재사용한다.
- 정렬된 열에는 방향 표시와 접근성 상태를 표시하고, 필터가 입력된 열은 기존 활성 표시를 유지한다.
- `No.`와 `관리` 열은 정렬 대상에서 제외한다. `완료현황`과 번들 행의 표시값을 어떤 기준으로 정렬할지는 질문 답변으로 확정한다.

#### 상품전체보기

- 기존 필터 입력 행은 변경하지 않는다.
- 첫 번째 헤더의 각 데이터 열을 키보드로도 조작 가능한 버튼/메뉴 trigger로 만들고, 메뉴에서 `오름차순`, `내림차순`, `정렬없애기`를 제공한다.
- 현재 정렬 열과 방향을 헤더에 표시한다. `정렬없애기`는 무작위 순서가 아니라 현재의 기본 서버 정렬로 복귀하는 동작으로 설계한다.
- 선택 checkbox 열은 정렬 대상에서 제외한다. 사진·boolean·금액·날짜는 화면 문자열이 아닌 실제 값 기준으로 정렬한다.

### 13-3. 정렬 데이터 계약

1. 두 화면에 공통으로 `{ key, direction }` 형태의 정렬 상태를 두고, 열 정의에서 허용된 `key`만 선택한다. 클라이언트가 임의 SQL/컬럼명을 전달하지 않는다.
2. 텍스트는 대소문자·앞뒤 공백을 정규화한 값, 숫자는 숫자값, 날짜는 날짜/시간값, boolean은 명시한 true/false 순서, 사진은 `사진 있음` 여부를 기준으로 정렬한다.
3. 기본값은 현재 운영 순서를 유지한다. 사용자 정렬이 없거나 `정렬없애기`를 누르면 기존 기본 정렬과 cursor 계약으로 돌아간다.
4. 같은 정렬값이 많은 경우에도 페이지 사이에서 중복·누락이 없도록 화면별 고정 tie-breaker를 둔다.
   - 리뷰받기: 표시 정렬값 → bundle 대표 ID 등 안정적인 bundle 식별자
   - 상품전체보기: 표시 정렬값 → product ID → submission ID
5. null/빈값은 기본적으로 마지막에 배치한다. 이 규칙은 오름차순과 내림차순 모두 서버 정렬·cursor 비교에 동일하게 적용한다.
6. 다음 페이지 cursor에는 `sortKey`, `direction`, 정렬값의 타입이 보존된 `sortValue`, null 여부, tie-breaker를 포함한다. 필터·상태·scope·정렬이 바뀌면 기존 rows와 cursor를 비우고 첫 페이지부터 다시 조회한다.

### 13-4. DB·gateway·웹 구현 범위

#### DB migration

- 기존 데이터를 변경하지 않고 sort-aware RPC를 additive하게 추가한다. 기존 RPC와 구형 웹 호환 경로는 보존한다.
- PostgreSQL 함수 내부에서 scope·상태·필터를 먼저 적용하고, 전체 결과를 허용된 정렬 표현식으로 정렬한 뒤 `page_size + 1`을 잘라낸다. 정렬을 적용한 뒤의 전체 `total_count`와 다음 cursor를 반환한다.
- 리뷰받기는 번들 대표 표시 열·입금구분·완료현황의 수치/상태를 서버에서 계산한 뒤 정렬한다. 상품전체보기는 `PRODUCT_OVERVIEW_COLUMNS`의 source/type에 맞춰 products/submissions/evidence photo 값을 정렬한다.
- 정렬 키·방향 allowlist, 잘못된 cursor, 잘못된 타입을 서버에서 검증한다. 동적 SQL 식별자 연결이나 클라이언트 제공 SQL은 사용하지 않는다.
- 새 RPC와 ACL, 기존 RPC와의 호환, ascending/descending page boundary, null/tie-breaker를 적용 전후 읽기 검증한다. 단순히 인덱스를 추가하지 않고 실제 query plan과 응답 시간을 확인해 필요한 인덱스만 검토한다.

#### Edge Function

- 기존 gateway가 임의 RPC를 실행하지 않도록 sort-aware RPC를 별도 operation 또는 명시적인 v2 operation으로 allowlist에 추가한다. 기존 operation은 rollback·구형 웹 호환용으로 남긴다.
- operation별 허용 sort key/direction과 payload shape를 검증하고, session principal·scope 권한 검사는 기존 흐름을 유지한다.
- 로그에는 operation, sort key/direction, page size, total count, duration만 남기고 원문 업무 데이터는 기록하지 않는다.

#### 웹 서비스·페이지

- `adminProducts.ts`와 `productOverview.ts`가 sort 상태와 서버 cursor를 초기/추가 조회 모두에 전달하도록 한다.
- `AdminReviewReceivePage`와 `AdminProductOverviewPage`는 정렬 변경 시 rows/cursor/loading 상태를 안전하게 초기화하고 첫 페이지를 재조회한다. 현재 필터·상태·scope는 유지한다.
- 무한 스크롤은 첫 페이지와 동일한 sort/filter/status/scope 조합을 계속 사용한다. 페이지를 추가로 불러온 뒤 클라이언트가 다시 기본 정렬로 덮어쓰지 않는다.
- 상품전체보기의 구매정보 배정처럼 행 번호/순서에 의존하는 기존 보조 기능은 현재 화면 순서와 일치하도록 조정하거나, 정렬 상태에서의 기준을 명시한다.
- 필터 입력 중 정렬 메뉴를 열거나 결과가 0건이 되어도 헤더·필터 row가 unmount되지 않는 기존 보완을 유지한다.

#### UI 컴포넌트·스타일

- `ReviewReceiveFilterHeader`는 3개점 trigger, 정렬 메뉴, 기존 필터 popover를 조합하도록 최소 수정한다.
- `ReviewReceiveProductList`와 `ProductOverviewTable`은 정렬 상태/콜백/활성 표시를 전달한다. 동일한 menu primitive로 재사용할 수 있는 부분은 공통화하되, 두 화면의 메뉴 문구·필터 연결 책임은 분리한다.
- 기존 가로 스크롤, 헤더 고정/재조회 shell, 모바일·키보드 focus, 바깥 클릭·Escape 닫기 동작을 회귀시키지 않는다.

### 13-5. 검증 계획

- 순수 유틸 테스트: text/number/date/boolean/photo 정렬, 오름차순·내림차순, null 마지막, 같은 값의 tie-breaker, 기본 정렬 복귀.
- service/contract 테스트: 두 목록 요청에 sort key/direction/cursor가 정확히 포함되고, 허용되지 않은 정렬 키가 거부되는지 확인한다.
- SQL 계약 테스트: 두 sort-aware RPC가 필터·scope·상태 적용 후 전체 정렬하고, cursor 조건과 `nextCursor`를 동일한 기준으로 사용하는지 확인한다.
- 브라우저 canary:
  - 리뷰받기에서 50건 경계를 넘는 synthetic 데이터를 준비해 업체명·등록일·완료현황 정렬 후 스크롤해 전체 순서와 중복/누락을 확인한다.
  - 상품전체보기에서 300건 경계를 넘는 synthetic 데이터로 주문번호·금액·입금일·관리자·사진/상태 정렬을 확인한다.
  - 필터+정렬, 상태 탭+정렬, scope 전환+정렬, 0건 결과, 정렬 해제 후 기본 순서를 확인한다.
  - 메뉴의 마우스·키보드·Escape·바깥 클릭, 필터 popover 재진입, 재조회 중 헤더 유지와 오류 표시를 확인한다.
- 성능 확인: 전체 데이터를 브라우저로 한 번에 내려받지 않고 첫 페이지 크기(리뷰받기 50건, 상품전체보기 300건)를 유지하는지, page boundary에서 추가 요청 수가 행 수에 비례해 증가하지 않는지, 정렬별 DB/gateway/browser 시간을 분리 기록한다.

### 13-6. 적용·rollback 순서

1. 질문 답변으로 정렬 대상 열, 메뉴 동작, 단일/다중 정렬, null/상태 기준, 저장 범위를 확정한다.
2. sort-aware DB RPC migration을 additive하게 작성하고 staging/승인된 테스트 DB에서 함수·ACL·cursor·count를 검증한다.
3. Edge Function allowlist/validation을 추가하고, 구형 operation과 비인증 401·권한 경계를 검증한다.
4. 로컬 웹에서 두 화면의 정렬·필터·무한 스크롤 canary와 unit/SQL contract test/build를 실행한다.
5. DB → Edge Function → 웹 app 순서로 운영 반영한다. DB migration은 기존 row를 바꾸지 않으며, 웹 교체 전까지 기존 화면은 기존 operation으로 동작한다.
6. 문제 발생 시 웹을 기존 image로 되돌리고, 필요하면 Edge를 기존 operation mapping으로 되돌린다. 새 additive RPC는 데이터 삭제 없이 남겨둘 수 있으며, 운영 rows를 임의로 재정렬·수정·삭제하지 않는다.

### 13-7. 사용자 확정 질문

#### Q1. 리뷰받기에서 정렬을 해제하는 방법

- **A (권장)**: 요청한 세 항목은 유지하되 메뉴에 `정렬없음`을 추가한다. 누르면 현재 기본 정렬로 복귀한다.
- **B**: 메뉴에는 세 항목만 두고, 현재 선택된 정렬 항목을 다시 누르면 정렬을 해제한다.
- **C**: 리뷰받기는 정렬 해제를 제공하지 않고, 페이지를 새로 열거나 전체 초기화에서만 기본 정렬로 돌아간다.

답변: B, 그래서 예를들어 내림차순 정렬을 선택했으면 그 항목의 색깔음영을 변경해서 지금 이걸로 선택되어있다를 보여줘

#### Q2. 상품전체보기 헤더를 눌렀을 때의 동작

- **A (권장)**: 헤더를 누르면 메뉴가 열리고 `오름차순/내림차순/정렬없애기` 중 하나를 선택한다. 실수로 정렬이 바뀌지 않는다.
- **B**: 헤더를 누를 때마다 `오름차순 → 내림차순 → 정렬없애기` 순서로 즉시 순환한다.

답변: B

#### Q3. 여러 열 정렬

- **A (권장)**: 한 번에 한 열만 정렬한다. 다른 열을 선택하면 이전 정렬을 대체한다.
- **B**: 여러 열을 우선순위로 누적 정렬한다. 우선순위 표시·해제 UI와 복합 cursor 계약이 추가된다.

답변: B

#### Q4. 리뷰받기의 `완료현황` 정렬 기준

- **A (권장)**: 표시 문자열의 총 건수인 `submission_count`를 기준으로 정렬한다.
- **B**: 완료 건수인 `complete_count`를 기준으로 정렬한다.
- **C**: `진행중 → 완료` 상태 순으로 정렬하고, 같은 상태 안에서는 총 건수로 정렬한다.
- **D**: 완료현황은 정렬 대상에서 제외한다.

답변: D

#### Q5. 상품전체보기의 사진·boolean 정렬 순서

- **A (권장)**: 오름차순은 `없음/아니오 → 있음/예`, 내림차순은 반대이며 빈값은 항상 마지막에 둔다.
- **B**: 오름차순은 `있음/예 → 없음/아니오`로 둔다.
- **C**: 다른 순서를 직접 지정한다.

답변: B

#### Q6. 정렬 상태 저장 범위

- **A (권장)**: 현재 페이지에서만 유지하고 페이지를 다시 들어오면 기본 정렬로 시작한다. 기존 필터 저장 정책과 독립적이다.
- **B**: 계정별 sessionStorage에 저장해 같은 브라우저 탭에서 다시 들어와도 복원한다.
- **C**: 계정별 localStorage에 저장해 브라우저를 닫았다 열어도 복원한다.

답변: B

#### Q7. 정렬 변경 시 필터·상태·scope 처리

- **A (권장)**: 현재 필터·상태·scope는 유지하고, 정렬만 바꿔 해당 조건의 첫 페이지부터 다시 조회한다.
- **B**: 정렬 변경 시 필터와 상태도 초기화한다.

답변: A

### 13-8. 답변 반영 기준

- 리뷰받기 정렬 상태는 여러 열을 우선순위로 누적한다. 같은 열에서 현재 선택된 방향을 다시 누르면 해당 열 정렬을 해제하며, 현재 선택 항목은 메뉴에서 음영으로 표시한다.
- 상품전체보기 헤더 클릭은 `오름차순 → 내림차순 → 정렬없애기`를 즉시 순환한다. 여러 열 정렬은 클릭 순서를 우선순위로 유지하고, 각 헤더에 우선순위와 방향을 표시한다.
- 리뷰받기 `완료현황`은 정렬 대상에서 제외한다. 그 외 데이터 열은 정렬 대상이며, 상품전체보기의 사진/boolean도 포함한다.
- 상품전체보기 사진·boolean은 오름차순에서 `있음/예 → 없음/아니오`, 내림차순에서 그 반대 순서를 사용한다. 빈값은 별도 null-last 규칙을 유지한다.
- 정렬 상태는 계정별 `sessionStorage`에 저장하고 같은 브라우저 탭에서 복원한다. 정렬 변경 때 현재 필터·상태·scope는 유지하며 rows/cursor를 초기화하고 첫 페이지부터 재조회한다.
- DB/Edge는 기존 RPC·operation을 보존한 additive v2 계약으로 구현한다. 새 요청에는 허용된 sort 배열과 타입 검증된 cursor만 전달하고, 전체 결과를 서버에서 정렬한 뒤 기존 페이지 크기로 반환한다.

#### Q8. 정렬 기준을 제공할 열 범위

- **A (권장)**: 데이터 열 전체를 정렬한다. 단, `No.`, 선택 checkbox, `관리`는 제외하고 완료현황 기준은 Q4로 확정한다.
- **B**: 텍스트·날짜·숫자 열만 정렬하고 사진/boolean/입금구분은 제외한다.
- **C**: 정렬할 열을 직접 지정한다.

답변: A

### 13-9. 구현·로컬 검증 기록

- 리뷰받기 3개점 메뉴와 상품전체보기 헤더의 정렬 cycle, 다중 정렬 우선순위, 계정별 `sessionStorage` 복원을 구현했다. `완료현황`과 선택/관리 열은 정렬 대상에서 제외했다.
- 정렬 요청은 화면별 allowlist를 통과한 v2 gateway operation으로 전달하고, DB에서 scope·상태·필터를 적용한 전체 결과를 keyset cursor로 정렬·페이지화한다. 기존 정렬이 없는 요청과 legacy direct 경로는 호환용으로 보존했다.
- 정렬 변경 시 기존 필터·상태·scope를 유지하면서 rows/cursor를 초기화하고 첫 페이지를 재조회한다. 결과가 0건이어도 헤더와 필터 row를 유지한다.
- 로컬 브라우저에서 리뷰받기 메뉴 정렬·필터 0건 shell, 상품전체보기 헤더의 오름차순→내림차순→해제와 필터 0건 shell을 확인했다. 이 smoke는 gateway가 비활성화된 legacy fallback에서 실행되어, 서버 전체 데이터 page-boundary는 원격 migration 적용 후 별도 canary가 필요하다.
- `npm test`: 100/100 통과. `npm run build`: 통과. `git diff --check`: 통과. `SUPABASE_TELEMETRY_DISABLED=1 supabase db lint --local`은 실행했으나 로컬 Postgres 미기동으로 `LegacyDbConnectError`가 발생해 SQL runtime 검증은 미완료다.

### 13-10. 운영 배포·검증 기록 — 2026-09-04 KST

- 사용자 승인 후 `DB → Edge Function → 웹` 순서로 배포했다. `vm-web-01`의 기존 운영 hotfix와 dirty source를 기준으로 3-way merge한 대상 파일 20개만 반영했으며, 운영 전체 source를 로컬 dirty working tree로 덮어쓰지 않았다. 다음 배포 전에는 운영 source와 로컬 변경을 다시 대조한다.
- DB migration 최초 적용 후 runtime canary에서 `max(to_jsonb(limited_rows))`가 PostgreSQL의 존재하지 않는 `max(jsonb)`를 호출하는 오류를 발견했다. Edge·웹 활성화를 중단한 상태에서 두 위치를 `jsonb_agg(to_jsonb(limited_rows))->0`으로 보정하고 회귀 assertion을 추가한 뒤 재적용했다. 최종 migration SHA-256은 `702a06b4...`다.
- DB migration 직후 주요 테이블 건수는 `products=6030`, `submissions=28346`, `evidence_photos=26170`으로 변경 전과 동일했다. 이후 00:36/00:46 KST backup snapshot 사이 `evidence_photos` 3건이 늘었으며, 같은 시간 창에 생성된 운영 row 3건과 일치하고 migration 자체에는 row DML이 없다. 리뷰받기 `50 + 38 / total 88`, 상품전체보기 `300 + 300 / total 2248` 경계에서 페이지 중복 0건, 금액·사진·boolean 정렬 위반 0건이었다. 잘못된 key/direction/cursor는 모두 `22023`으로 거부됐다.
- 새 함수 owner는 `supabase_admin`이고 `public`·`anon`·`authenticated` 직접 실행은 없으며 `service_role`만 실행할 수 있다. DB dump와 변경 전후 함수·ACL·count·checksum은 `vm-app-01:/opt/supabase/backups/review-manager-server-sorting-20260904T003630KST`에 보존했다.
- Edge 실행본 SHA-256은 `f3c196f1...`, 직전본은 `40ca8351...`이다. `functions`만 재생성했고 DB·Kong·file-writer ID는 그대로 유지됐다. 호스트와 컨테이너 source hash가 일치하고 세션 없는 direct gateway 요청은 `401`이다.
- 운영 웹 병합본 Docker build에서 테스트 `99/99`와 Vite production build가 통과했다. 신규 image는 `sha256:4323048d...`, 직전 image `sha256:0aafcaab...`은 `review-manager-backoffice:codex-backup-server-sorting-20260904`, 대상 source는 `.codex-backup-server-sorting-20260904`에 보존했다.
- 웹 app만 재생성한 뒤 Docker health와 restart count 0, 내부·외부 `/`·`/healthz` 200, same-origin 무인증 gateway 401을 확인했다. 배포된 상품전체보기의 새 asset과 인증된 access/data 요청은 200이었다. 별도 브라우저 검증 탭은 세션 만료로 로그인 화면까지만 확인했으며 운영 데이터 쓰기는 수행하지 않았다.

## 10. 담당자/관리자 필터 및 필터 재조회 UI 보완 — 2026-09-03 KST

상태: 코드 수정·Edge Function 반영·웹 정적 파일/컨테이너 배포·외부 smoke 검증까지 완료했다. 실제 업무 데이터 변경을 수반하는 운영 bulk canary는 별도 승인·확인 대상으로 남긴다.

### 원인

1. `admin-gateway`의 client identity 제거 함수가 payload를 재귀적으로 순회하면서 `p_filters.manager_id`도 관리자 신원 위조 방지 대상과 동일하게 제거했다. DB의 리뷰받기·상품전체보기 RPC에는 이미 담당자 조건이 있었지만 gateway에서 필터가 사라져 모든 담당자 조건이 무시됐다.
2. 리뷰받기는 재조회 중 `isLoading` 조건으로 표 전체를 숨겼고, 상품전체보기는 조회 결과가 0건이면 section 자체를 제거했다. 그 결과 검색어 입력 중 필터 popover 또는 헤더·필터 row가 unmount되어 입력값이 사라질 수 있었다.

### 변경

1. `review_receive.list`, `product_overview.list` operation에 한해 `p_filters` 내부의 `manager_id`/`managerId`만 보존하도록 Edge sanitizer를 분리했다. top-level identity와 mutation payload의 identity 제거 규칙은 유지한다.
2. 리뷰받기는 첫 성공 조회 이후 재조회 중에도 기존 표 shell을 유지하고 `aria-busy`와 적용 중 안내만 표시한다.
3. 상품전체보기는 첫 성공 조회 이후 active filter가 있거나 기존 행이 있는 동안 section/table을 유지한다. 0건이면 기존 empty row가 필터 입력과 함께 표시된다.
4. 담당자 필터 gateway 전달·SQL 조건과 재조회 중 table shell 유지에 대한 contract test를 추가했다.

### 운영 반영 및 검증

- 추가 DB migration은 필요하지 않다. 운영 DB의 `get_admin_review_receive_product_summaries_gateway`와 `get_admin_product_overview_rows_gateway`에 이미 `manager_id` 조건이 존재함을 확인했다.
- 원격 `vm-app-01`의 기존 Edge source를 `/opt/supabase/docker/volumes/functions/.codex-backups/admin-gateway-index-before-manager-filter-20260903.ts`에 보관한 뒤, 최소 diff만 적용했다. 기존 RPC v2 연결·permission pair action은 유지했다.
- canonical Compose 검증 후 `functions` 서비스만 `--force-recreate --no-deps`로 재생성했다. DB, Kong, file-writer, 웹 VM은 재시작·배포하지 않았다.
- test1 세션의 실제 gateway 요청에서 리뷰받기·상품전체보기 모두 기준 행 응답, 존재하지 않는 담당자 검색 0건, 기준 담당자 검색 행 반환을 확인했다.
- 격리 브라우저 smoke test에서 두 화면의 필터 입력 후 헤더·filter shell 유지 동작을 확인했다.
- `npm test` 93/93, `npm run build`, Edge TypeScript check, `git diff --check` 통과.
- 웹 VM에서는 기존 dirty source 변경을 보존하면서 대상 파일만 백업·staging·해시 대조 후 반영했다. 백업은 `/home/jinitlab/review_manager_backoffice/.codex-backup-filter-bulk-20260903`, rollback image tag는 `review-manager-backoffice:codex-backup-filter-bulk-20260903`이다.
- 웹 저장소의 Edge gateway 사본은 app VM canonical source와 해시를 대조해 동기화했다. 첫 원격 build의 stale source/test contract 불일치는 보완 후 최종 Docker 테스트 `94/94`·Vite build가 통과했으며, 그 전까지 웹 컨테이너는 교체하지 않았다.
- 새 image `sha256:2bb130f7c9d55e323b7172f60c15646e102ffd594e819bddcdcb6b059e0d1d79`로 `app`만 `--no-deps --force-recreate`했고 Docker health·내부/외부 `/healthz=200`·무인증 gateway `401`을 확인했다. DB·Kong·운영 Edge·file-writer는 이번 웹 배포에서 재시작하지 않았다.
- 테스트 계정의 외부 브라우저 smoke에서 리뷰받기·상품전체보기의 결과 없는 담당자 필터 입력 후에도 필터 입력과 헤더가 유지되는 것을 확인했다(약 7.2초). 웹 VM 최근 로그에서 검증 요청 5xx는 없었고 app VM 핵심 서비스 상태도 정상이다.

### 남은 단계

- 배포 작업은 완료됐다. 실제 업무 데이터 bulk canary는 사용자가 test1에서 수행 결과를 확인한 뒤 별도 진행한다.
- 문제가 발생하면 `review-manager-backoffice:codex-backup-filter-bulk-20260903`를 `review-manager-backoffice:local`로 tag한 뒤 웹 `app`만 재생성한다. source 재구성이 필요하면 위 backup source를 사용한다. DB migration을 되돌리거나 운영 데이터를 삭제하지 않으며, Edge rollback은 별도 Edge backup과 functions 재생성이 필요한 경우에만 수행한다.

## 11. 리뷰받기 회사 범위 상세 접근 보완 배포 — 2026-09-03 KST

사용자 승인 후 `vm-web-01`의 Backoffice `app` 컨테이너에만 다음 프런트 보완을 운영 반영했다.

- 상세 화면이 관리자 조회 범위 초기화를 기다린 뒤 목록과 같은 `scopePolicy`로 조회하도록 수정했다.
- 범위가 바뀌는 동안 이전 상세 요청이 최신 조회 결과를 덮어쓰지 않도록 요청 식별자와 effect cleanup을 추가했다.
- 원격 저장소의 기존 미커밋 변경은 덮어쓰지 않고, `src/pages/admin/AdminReviewReceiveDetailPage.tsx`만 최소 patch로 적용했다.
- 변경 전 source는 `/home/jinitlab/review_manager_backoffice/.codex-backup-scope-detail-20260903T204143KST/AdminReviewReceiveDetailPage.tsx`, 변경 전 image는 `review-manager-backoffice:codex-backup-scope-detail-20260903T204143KST`로 보존했다.
- Docker build 내부 `npm test` 94/94와 Vite build 통과 후 신규 image `sha256:a4b6f357b51dcf52b9fbd84d3d7c970dba276c7a7b9f0c30345a306d186b5f1b`로 `app`만 `--no-deps --force-recreate`했다.
- 컨테이너 healthy, 내부·외부 `/healthz` 200, 최근 오류 로그 0건, test1 운영 브라우저의 본인 상품 목록→상세 진입을 확인했다. 회사 범위 타 담당자 상세는 test1 운영 권한이 개인 범위로 제한되어 운영에서 재현하지 않았고, 로컬 canary에서 확인했다.
- DB·Edge Function·Kong·Nginx·file-writer 및 다른 웹 VM 컨테이너는 변경하지 않았다.
