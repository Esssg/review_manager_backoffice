# Review Manager Backoffice

## 프로젝트 범위

이 저장소는 `Vite + React + React Router + Supabase` 기반의 리뷰 운영용 백오피스 프런트엔드입니다. 관리자 영역과 구매자용 공개 리뷰받기 영역을 함께 관리합니다.

이 문서는 모든 작업에 적용되는 전역 규칙입니다. 작업 유형별 상세 절차는 `.agents/skills/*/SKILL.md`를 사용합니다.

## 작업 시작

작업 전에 아래 순서로 현재 구조와 계약을 확인합니다.

1. `docs/project_analysis.md`에서 현재 구조와 기존 책임 분리를 확인합니다.
2. DB 구조·테이블 계약·샘플 데이터와 관련된 작업이면 `docs/guide_db.md`를 확인합니다.
3. Supabase 연결·환경변수·Edge Function 작업이면 `SUPABASE_SETUP.md`를 확인합니다.
4. 같은 책임의 컴포넌트, 훅, 서비스, 유틸, 스타일이 있는지 먼저 검색합니다.
5. 관련 작업에 맞는 skill을 읽고 그 절차를 적용합니다.

## 전역 개발 원칙

- 기존 구현을 우선 재사용하고, 작은 요구사항은 최소 수정으로 해결합니다.
- 새 파일이나 추상화는 기존 코드만으로 수용하기 어렵고 유지보수성·책임 분리·테스트 가능성을 실제로 개선할 때만 추가합니다.
- 라우팅, 페이지, 데이터 접근, 순수 유틸, 스타일의 책임을 섞지 않습니다.
- 서버 원본 데이터와 화면 보조 상태를 분리하고, 파생값을 중복 상태로 저장하지 않습니다.
- 실패 가능한 작업에는 네트워크·입력·권한 오류를 구분한 사용자 피드백을 제공합니다.
- 브라우저 기본 `alert`, `confirm`, `prompt`를 추가하지 않고 `src/components/common/AppAlertDialog.jsx`를 사용합니다.
- 작업 중 생성한 임시 파일은 종료 전에 삭제합니다.

우선 탐색할 위치:

- `src/App.jsx`, `src/pages/*`, `src/components/*`, `src/hooks/*`
- `src/services/*`, `src/utils/*`, `src/constants/*`
- `src/lib/supabase.ts`, `src/styles/*`
- `scripts/check-supabase.mjs`

## Supabase DB 대상 범위

이 프로젝트는 다른 프로젝트와 같은 Supabase `public` 스키마를 공유할 수 있습니다. 이 저장소가 관리하는 DB 테이블은 아래 목록으로 한정합니다.

- `public.admins`
- `public.products`
- `public.admin_menu_permissions`
- `public.product_steps`
- `public.applications`
- `public.submissions`
- `public.evidence_photos`

대상 범위 규칙:

- 위 목록에 없는 테이블은 조회, 생성, 수정, 삭제, 시드 데이터 반영을 절대 수행하지 않습니다.
- 위 목록에 없는 테이블의 컬럼, 인덱스, 제약조건, 트리거, RLS 정책, 권한을 생성·변경·삭제하지 않습니다.
- 새 쿼리, 마이그레이션, RPC, 테스트 데이터가 허용 목록 밖의 테이블을 직접 또는 간접적으로 참조하지 않는지 먼저 확인합니다.
- 같은 `public` 스키마에 있다는 이유만으로 다른 프로젝트 테이블을 fallback 대상으로 추가하거나 사용하지 않습니다.
- 다른 테이블이 필요해 보이거나 대상 범위가 불명확하면 임의로 진행하지 말고 사용자 확인을 받습니다.
- `auth`, `storage`, Edge Function 등 Supabase 내부·외부 객체는 별도 요청 없이는 변경하지 않습니다.

Supabase 쿼리·페이지네이션·스키마 변경의 상세 절차는 `supabase-schema-sync` skill을 적용합니다. Supabase API의 요청당 1,000건 제한을 전체 데이터 개수로 오해해 누락시키지 않습니다.

## 데이터베이스 변경과 문서 동기화

허용된 `public` 테이블의 스키마를 변경했다면 같은 작업 안에서 다음을 수행합니다.

1. 마이그레이션 또는 승인된 변경을 적용합니다.
2. Supabase에서 최종 스키마와 변경 결과를 다시 조회합니다.
3. 최종 상태에 맞게 `docs/guide_db.md`와 영향을 받는 샘플 데이터를 갱신합니다.
4. 최종 응답에 `docs/guide_db.md`를 갱신했다는 사실을 명시합니다.

## 라우팅·관리자 권한

- 인증이 필요한 백오피스 페이지는 `/admin/*` 아래에 둡니다.
- 공개 페이지나 구매자 페이지에는 `/admin/*` 네임스페이스를 사용하지 않습니다.
- 관리자 메뉴 노출과 직접 URL 접근은 DB 권한을 함께 확인해야 합니다.
- `admins` 테이블 직접 조회 기반 로그인은 기존 레거시 흐름으로 취급하며 새 인증 기능에 확대 재생산하지 않습니다.

라우팅, 메뉴 번호, `admin_menu_permissions`, 권한 로딩·거부 상태를 변경할 때는 `admin-access-control` skill을 적용합니다.

## 검증

변경 성격에 맞는 최소 검증을 실행합니다.

- 프런트 코드 변경: `npm run build`
- Supabase 연결·환경변수 변경: `npm run supabase:check`
- 순수 유틸·파싱·페이지네이션 변경: 관련 `npm test` 또는 Node 테스트
- 라우팅 변경: 주요 관리자·공개 경로와 권한 없는 직접 접근
- 폼·쓰기 흐름 변경: 성공, 실패, 빈 입력, 중복 제출
- 작업 완료 후에는 Playwright MCP 또는 Chrome DevTools MCP를 사용해 변경 영역을 실제 브라우저에서 검증합니다. 브라우저 검증을 실행할 수 없으면 그 이유를 최종 응답에 명시합니다.
- 로그인 기반 브라우저 검증에는 `.env`에 정의된 `E2E_TEST_EMAIL`과 `E2E_TEST_PASSWORD`를 사용합니다.
- E2E 로그인 정보는 소스 코드, 로그, 스크린샷, 커밋, 최종 응답에 노출하지 않습니다.

검증하지 못한 항목과 그 이유는 최종 응답에 남깁니다.

## 규칙과 참고 문서의 기준

- 작업 규칙은 이 파일과 `.agents/skills/`에만 둡니다.
- `docs/project_analysis.md`는 현재 구조와 아키텍처 현황을 설명합니다.
- `docs/guide_db.md`는 허용된 `public` DB 테이블·RPC·샘플 데이터 계약을 설명합니다.
- `docs/guide.md`는 Edge Function 오류와 운영 대응을 설명합니다.
- `SUPABASE_SETUP.md`는 Supabase 연결·배포 설정을 설명합니다.
- 구현 완료 계획이나 작업 기록은 전역 규칙으로 승격하지 않습니다.

## 최종 응답

최종 응답에는 아래 내용을 짧게 포함합니다.

- 무엇을 변경했는지
- 무엇을 검증했는지
- 검증하지 못한 것이 있으면 그 이유
- 문서를 갱신했다면 어떤 문서를 갱신했는지
