---
name: supabase-schema-sync
description: Use when adding or changing Supabase queries, services, RPCs, migrations, pagination, bulk data flows, RLS or admin data access, connection settings, or database documentation in this review backoffice.
---

# Supabase Schema Sync

Supabase 접근 책임과 DB 계약을 분리하고, 허용된 테이블의 데이터가 1,000건 제한 때문에 누락되지 않도록 조회·변경 흐름을 설계한다.

## 작업 시작

1. `AGENTS.md`의 Supabase 대상 테이블 allowlist를 먼저 확인한다.
2. `docs/project_analysis.md`에서 기존 서비스와 `src/services/paginatedQuery.js` 사용 흐름을 확인한다.
3. 스키마·RPC·샘플 데이터 작업이면 `docs/guide_db.md`를 확인한다.
4. 연결·환경변수·Edge Function 작업이면 `SUPABASE_SETUP.md`를 확인한다.
5. 기존 `src/services/*`에 같은 조회·변경 책임이 있는지 검색한다.

## 대상 범위와 안전성

- `AGENTS.md`에 명시된 7개 `public` 테이블만 읽고 쓰고 변경한다.
- 목록 밖 테이블을 fallback, 임시 저장소, 테스트 데이터 대상으로 추가하지 않는다.
- 새 쿼리·마이그레이션·RPC가 목록 밖 테이블을 직접 또는 간접 참조하지 않는지 SQL과 코드에서 확인한다.
- `auth`, `storage`, Edge Function 등은 별도 요청 없이는 변경하지 않는다.
- `admins` 테이블 직접 조회 로그인은 레거시로 취급하며 새 인증 설계에 확대하지 않는다.
- 관리자 쓰기 작업은 권한 경계와 RLS 영향을 함께 점검한다.

## 쿼리와 서비스

- 화면 컴포넌트에 Supabase 쿼리를 반복해서 작성하지 않고 서비스 함수로 분리한다.
- 필요한 컬럼만 `select`하고 의미 없는 `select("*")`를 피한다.
- 조회·생성·수정·삭제와 응답 변환의 책임을 함수 단위로 나눈다.
- 테이블명 fallback이나 스키마 예외를 추가해야 한다면 허용 범위와 문서를 함께 확인한다.
- RPC를 추가하거나 수정할 때 입력·출력 필드, 권한 검증, 허용 테이블 의존성을 명확히 한다.

## 1,000건 제한과 페이지네이션

- Supabase 한 요청의 최대 1,000행을 전체 결과의 끝으로 취급하지 않는다.
- 고유 키 커서 반복 조회가 필요한 공통 흐름은 `src/services/paginatedQuery.js`를 재사용한다.
- RPC 목록은 RPC가 제공하는 커서와 `has_more` 계약을 확인하고 같은 필터·정렬 조건으로 다음 페이지를 이어 조회한다.
- 마지막 행이 없어질 때까지 페이지를 반복하고, 첫 페이지의 1,000건만 반환하는 구현을 만들지 않는다.
- 큰 `IN (...)` 조건은 기존 분할·제한 동시 실행 유틸을 재사용하고, 결과 중복·순서·누락을 점검한다.
- 1,000건 초과 데이터와 빈 결과를 포함한 회귀 테스트를 추가하거나 기존 테스트를 확장한다.

## 스키마 변경과 문서 동기화

허용된 `public` 테이블의 컬럼·제약조건·인덱스·RPC를 변경할 때 다음 순서를 지킨다.

1. 재사용 가능한 기존 마이그레이션과 문서 계약을 확인한다.
2. 명시적인 마이그레이션 파일로 변경을 기록한다.
3. 적용 후 Supabase에서 최종 스키마와 RPC를 다시 조회한다.
4. `docs/guide_db.md`의 테이블·RPC·샘플 데이터·row count를 최종 상태에 맞춘다.
5. 연결·환경변수 변경이면 `npm run supabase:check`를 실행한다.

원격 DB에 적용할 권한이 없으면 마이그레이션 파일만 적용 완료로 보고하지 말고, 미적용 상태를 명시한다.
