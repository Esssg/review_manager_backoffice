---
name: review-manager-development
description: Use when implementing or refactoring this Vite + React review backoffice, especially changes to pages, components, hooks, services, utilities, state, forms, data contracts, or tests. Apply the project's reuse-first, separation, and validation workflow.
---

# Review Manager Development

Vite·React 백오피스의 화면, 상태, 서비스, 유틸을 기존 구조에 맞게 확장한다. 작업 유형에 따라 `review-manager-ui`, `supabase-schema-sync`, `admin-access-control`을 함께 적용한다.

## 작업 절차

1. `docs/project_analysis.md`에서 현재 구조와 책임 분리를 확인한다.
2. 관련 컴포넌트·훅·서비스·유틸·스타일과 기존 문서를 검색한다.
3. 가장 작은 변경으로 요구사항을 수용할 수 있는 재사용 경로를 결정한다.
4. 새 파일이나 추상화를 추가해야 한다면 기존 재사용만으로 부족한 이유를 변경 설명에 남긴다.
5. 변경 후 관련 테스트와 프로젝트 기본 검증을 실행한다.

## 책임 분리

- `src/App.jsx`에는 최상위 라우팅과 앱 진입 조합만 남긴다.
- 페이지는 화면 조합과 화면 단위 상태를 담당하고, 공통 UI는 `src/components/*`로 분리한다.
- Supabase 조회·생성·수정·삭제는 `src/services/*` 함수로 분리한다.
- 파싱·정렬·포맷팅·검증은 DOM과 네트워크를 사용하지 않는 `src/utils/*` 순수 함수로 분리한다.
- 공유 도메인 상수와 상태값은 `src/constants/*`에서 재사용한다.
- 작은 수정에는 과도한 파일 분리를 적용하지 않는다.

## React와 상태

- 서버 원본 데이터와 필터·탭·모달·제출 상태 같은 화면 보조 상태를 분리한다.
- 계산 가능한 값은 상태로 중복 저장하지 않는다.
- 이벤트 처리, 데이터 조회, 파싱, 렌더링을 하나의 함수에 과도하게 섞지 않는다.
- 실제 외부 동기화가 필요한 경우에만 `useEffect`를 사용한다.
- `useMemo`, `useCallback`은 측정 가능한 병목이나 안정적인 의존성 계약이 있을 때만 사용한다.
- 낙관적 업데이트는 실패 시 롤백이 명확할 때만 사용한다.
- 폼 입력값, 검증 오류, 제출 중 상태를 구분한다.

## 데이터 계약과 오류

- Supabase 응답에서 사용하는 필드를 명확히 적고 임의의 컬럼·상태·단계 문자열을 만들지 않는다.
- 반복되는 문자열 파싱, 금액 변환, 정렬 기준은 컴포넌트 밖의 순수 유틸로 둔다.
- 엄격한 입력은 성공값뿐 아니라 실패 행·필드·이유를 설계한다.
- 네트워크 오류, 입력 오류, 권한 오류를 가능한 한 구분해 사용자에게 보여준다.
- 삭제·완료·단계 토글 등 쓰기 작업은 성공과 실패 뒤의 화면 상태를 일관되게 유지한다.

## 검증과 보고

- 프런트 코드 변경에는 `npm run build`를 실행한다.
- 순수 유틸·파싱·페이지네이션 변경에는 관련 `npm test` 또는 Node 테스트를 실행한다.
- 중요한 제출·쓰기 흐름은 성공, 실패, 빈 입력, 중복 제출 시나리오를 점검한다.
- 검증하지 못한 항목과 이유를 최종 응답에 기록한다.
- 작업 중 만든 임시 파일은 종료 전에 삭제한다.
