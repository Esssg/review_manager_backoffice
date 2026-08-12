---
name: review-manager-ui
description: Use when changing React UI, CSS, forms, dialogs, tables, loading states, empty states, responsive layouts, keyboard accessibility, or visual styling in this review backoffice. Apply the existing sky-blue tokens and shared dialog contract.
---

# Review Manager UI

기존 전역 CSS 토큰과 공통 컴포넌트를 우선 사용해 하늘색 중심의 일관된 백오피스 UI를 만든다.

## 스타일과 재사용

- 먼저 `src/styles/base.css`와 화면별 스타일에서 `:root` 변수와 기존 클래스를 확인한다.
- 주요 액션, 링크, 포커스 링, 배지는 기존 하늘색 팔레트 안에서 표현한다.
- 새 색상은 기존 `light sky`에서 `deep sky` 범위를 해치지 않는 경우에만 추가한다.
- 공통 레이아웃·테이블·모달·토스트가 있으면 새 디자인을 복제하지 말고 재사용하거나 확장한다.
- 로그인 화면처럼 별도 시각 방향이 있는 화면은 기존 무드를 유지한다.

## 알림과 위험 동작

- 브라우저 기본 `alert`, `confirm`, `prompt`를 사용하지 않는다.
- 확인·경고·삭제는 `src/components/common/AppAlertDialog.jsx` 또는 shadcn `AlertDialog`/`Dialog` 공통 계약을 사용한다.
- shadcn 직접 사용으로 전환할 때도 Enter·Escape·focus·aria-modal·busy/disabled·위험 variant와 기존 오류 피드백을 보존한다.
- 버튼 라벨, 위험 여부, 로딩 상태, 닫기 가능 여부는 props와 상태로 표현한다.
- 위험 동작에는 `variant="danger"`와 `admin-danger-button` 조합을 우선 사용한다.
- 화면별로 동일한 알림 모달 마크업과 스타일을 복제하지 않는다.

## 상태와 접근성

- 로딩, 비활성, 오류, 빈 결과 상태를 숨기지 않고 사용자에게 명확히 보여준다.
- 클릭 가능한 행·버튼·링크를 시각적으로 구분한다.
- 키보드 포커스, 포커스 순서, 버튼의 `disabled` 상태, 모달 닫기 동작을 확인한다.
- 입력 필드에는 연결된 라벨과 형식·오류 안내를 제공한다.
- 반응형 레이아웃에서 표·모달·툴바의 overflow와 좁은 화면 동작을 점검한다.
- 색상만으로 상태를 전달하지 않고 텍스트·아이콘·구조를 함께 사용한다.

## 화면 변경 검증

- 정상 데이터, 로딩, 오류, 빈 데이터, 비활성화 상태를 확인한다.
- 폼은 빈 입력, 잘못된 입력, 제출 중 중복 클릭, 성공, 실패를 확인한다.
- 라우팅이 바뀌면 브라우저 뒤로가기와 새로고침 후에도 상태가 자연스러운지 확인한다.
- UI 변경 후 `npm run build`를 실행한다.
