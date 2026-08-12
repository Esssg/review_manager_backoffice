# shadcn/ui 기반 UI 리팩터링 계획 — 초안

작성일: 2026-08-12
상태: Q-01~Q-22 결정 완료 / Phase 6 정리·검증 진행 중
목표: 현재 기능·라우트·권한·데이터 계약을 유지하면서 UI 컴포넌트와 스타일 체계를 shadcn/ui 기반으로 전환한다.

이 문서는 완료된 기존 작업 기록과 분리된 shadcn/ui 작업계획이다. `Q-01`~`Q-22`의 선택과 현재 실행 현황을 함께 기록한다.

## 1. 현재 기준선

- 기술 스택은 Vite 5, React 18.3, React Router 7, TypeScript/TSX, Supabase다.
- Tailwind v4, shadcn `radix-vega`/`neutral` 소스와 Radix 기반 UI primitive가 설치·구성되어 있으며, 관리자 영역은 정보형 `neutral` 토큰으로 매핑하고 공개 리뷰 영역은 기존 하늘색 계열을 별도 유지한다.
- `src/styles/base.css`와 화면별 CSS가 현재 스타일의 주된 책임을 가진다.
- 기존 하늘색 토큰(`--sky-100`~`--sky-700`), 관리자 shell, 표, 모달, 공개 리뷰받기 전용 스타일은 전환 전 기준선으로 확인한다. 최종 테마는 현재 shadcn CLI의 `radix-vega`/`neutral` 구조를 사용하되 관리자 화면은 흰색·슬레이트 회색 기반의 정보형 백오피스로 정리하고, 공개 리뷰받기는 하늘색 브랜드와 모바일 가독성을 유지한다.
- `src/components/common/AppAlertDialog.tsx`는 기존 호출부 호환을 위한 shadcn `AlertDialog` adapter이며 확인·삭제·위험 동작 계약을 보존한다.
- `useAppToast`는 Sonner 기반 성공·실패 피드백 계약이다.
- `AdminLayout`은 관리자 메뉴 권한과 직접 URL 접근 경계를 포함한다.
- 상품전체보기·리뷰받기 화면의 표는 필터, 커서 기반 무한 스크롤, 선택, 사진, 모바일 표시를 포함하므로 단순한 표 스타일 교체 대상이 아니다.
- 이번 계획에는 Supabase 테이블·RPC·RLS·Edge Function 변경을 포함하지 않는다.

### UI 가독성·반응형 우선순위

- 관리자용 페이지는 백오피스의 표·화면에서 정보 가독성을 최우선으로 한다. 표의 열 의미, 정렬, 상태 구분, 행 높이, 밀도와 탐색 흐름을 shadcn 전환 중에도 보존하고 개선한다.
- 사용자 공개 페이지, 특히 리뷰어용 페이지는 정보 가독성과 시각적 디자인을 함께 중요하게 다룬다.
- 모든 화면에서 의도하지 않은 줄바꿈으로 정보가 흩어지거나 행·버튼·배지 높이가 불필요하게 커지는 문제를 가장 먼저 점검한다. 표 셀, 버튼, 필터 라벨, 상태 배지, 날짜·금액·링크·안내 문구를 대표 데이터로 확인한다.
- 내용을 무조건 `nowrap`이나 clipping으로 숨기지 않고, 열 너비·최소 너비·말줄임·overflow·툴팁·가로 스크롤 중 적절한 방법을 선택해 정보 손실을 막는다.
- 관리자 화면은 데스크톱 백오피스 밀도를 우선하되, 공개 리뷰어 화면은 모바일 viewport를 중요한 완료 기준으로 삼아 줄바꿈, 표 overflow, 모달 폭, 터치 조작을 검증한다.

## 2. 목표와 비목표

### 목표

- `src/components/ui/`에 shadcn 컴포넌트를 두고 feature 컴포넌트가 재사용하도록 한다.
- shadcn `radix-vega`/`neutral` 테마와 의미 기반 토큰을 적용하면서 관리자 정보 가독성을 높이고, 공개 페이지의 하늘색 디자인 품질을 보존한다.
- 버튼, 입력, 선택, 체크박스, 배지, 카드, 탭, 다이얼로그, 표, 로딩 상태의 시각·접근성 계약을 일관되게 만든다.
- 공통 다이얼로그·토스트의 기존 호출부와 위험 동작 계약을 보존한다.
- 전역·화면별 CSS를 Tailwind utility 중심으로 재작성하되, Q-20에 따라 feature 경계 class는 검증 중 유지한 뒤 사용처별로 제거한다.
- 전체 프로젝트를 TypeScript 기반으로 전환한 뒤 shadcn 컴포넌트와 feature UI의 타입 계약을 고정한다.
- 정상·로딩·오류·빈 결과·비활성·중복 제출·키보드 상호작용을 브라우저에서 검증한다.
- 관리자 화면은 정보 가독성을, 공개 리뷰어 화면은 가독성·디자인·모바일 사용성을 우선해 검증한다.

### 비목표

- Supabase 조회·쓰기·삭제·페이지네이션·권한 정책 변경
- 관리자 인증 방식 변경 또는 메뉴 번호·라우트 URL 변경
- 새로운 업무 기능이나 데이터 필드 추가
- Supabase 데이터 계층과 무관한 별도 업무 기능 추가
- 새로운 브랜드 재설계나 업무 흐름 변경
- 데이터·권한·라우트 계약을 바꾸는 DOM 전면 재구성

## 3. 사용자 결정이 필요한 항목

아래 선택지는 구현 전 확정해야 한다. 괄호 안의 `추천`은 현재 구조와 회귀 위험을 기준으로 한 기본 제안이며, 다른 선택을 해도 된다.

### Q-01. 마이그레이션 대상 범위를 어디까지 잡을 것인가?

- **A. 관리자 화면 우선, 공개 화면은 2차로 진행 (추천)**
  - 권한·데이터가 복잡한 관리자 공통 UI를 먼저 안정화하고 공개 리뷰받기는 별도 단계로 분리한다.
- **B. 관리자·공개·로그인 화면을 모두 이번 작업의 최종 범위로 잡되 단계적으로 진행**
  - 최종 일관성은 높지만 작업 범위와 브라우저 검증량이 커진다.
- **C. 공통 primitive만 도입하고 기존 화면은 당분간 유지**
  - 기반만 만들고 실제 화면 전환은 다음 작업으로 미룬다.

**답변:**
Q-01: B

### Q-02. Tailwind 버전과 기반 설정은 어떻게 할 것인가?

- **A. Tailwind v4 + 현재 shadcn CLI 사용 (추천)**
  - 현재 shadcn 문서와 Vite 설치 흐름에 맞지만, 전역 CSS와 토큰 연결을 주의 깊게 검토해야 한다.
- **B. Tailwind v3 기반으로 보수적으로 도입**
  - 기존 생태계 호환성을 우선하지만, 최신 shadcn 기본 흐름과 차이가 생길 수 있다.
- **C. Tailwind 설정은 최소화하고 shadcn 소스를 수동 조정**
  - 제어력은 높지만 CLI 재생성·업데이트 이점이 줄고 유지보수 책임이 커진다.

**답변:**
Q-02: A

### Q-03. shadcn의 primitive 기반을 무엇으로 선택할 것인가?

- **A. Radix 기반 (추천)**
  - 현재의 Dialog, Select, Dropdown, 키보드 동작을 점진적으로 옮기기 쉽도록 기존 접근성 primitive와의 연속성을 우선한다.
- **B. Base UI 기반**
  - 최신 shadcn 기반을 선택하되 기존 컴포넌트와 동작 차이를 별도로 검토한다.
- **C. React Aria 기반**
  - 접근성 중심의 동작을 우선하지만 기존 DOM·스타일·이벤트 계약의 변경 범위가 커질 수 있다.

**답변:**
Q-03: A

### Q-04. 시각 디자인과 색상 토큰을 어떻게 가져갈 것인가?

- **A. 현재 하늘색 디자인을 유지하고 shadcn semantic token으로 매핑 (기존 선택)**
  - `primary`, `background`, `card`, `muted`, `border`, `ring`, `destructive`를 기존 하늘색·텍스트·위험 색상에 연결한다.
- **B. 관리자에는 shadcn의 neutral 정보형 스타일을 채택하고 공개 페이지는 하늘색을 유지 (현재 적용)**
  - 관리자 표·툴바·사이드바의 정보 밀도를 높이면서 공개 리뷰 페이지의 브랜드 방향과 모바일 가독성을 보존한다.
- **C. shadcn 도입과 함께 새로운 브랜드 테마로 재설계**
  - 디자인 개선 폭은 크지만 이번 작업의 범위와 시각 회귀 위험이 가장 커진다.

**답변:**
Q-04: B (관리자는 neutral 정보형, 공개 리뷰는 하늘색 유지)

### Q-05. 기존 CSS와 Tailwind를 어떤 기간 동안 함께 사용할 것인가?

- **A. feature 단위 병행 후 검증된 CSS만 제거 (추천)**
  - 기존 화면을 보존하면서 한 화면씩 이전하고, dead selector를 근거와 함께 정리한다.
- **B. 기반 설정 후 전역·화면별 CSS를 한 번에 Tailwind로 재작성**
  - 최종 구조는 단순하지만 cascade·반응형·모달 stacking 회귀 위험이 높다.
- **C. shadcn 컴포넌트에만 Tailwind를 사용하고 기존 CSS는 장기 유지**
  - 가장 안전하지만 스타일 체계가 장기간 이중화된다.

**답변:**
Q-05: B

### Q-06. 공통 다이얼로그와 토스트 계약을 어떻게 처리할 것인가?

- **A. `AppAlertDialog`/`AppToast`의 props·호출부를 유지하고 내부만 점진 교체 (추천)**
  - 위험 동작, 로딩, Enter 확인, backdrop dismiss, 기존 메시지 흐름을 보존할 수 있다.
- **B. 모든 호출부를 shadcn `Dialog`/`AlertDialog`/`Sonner`로 직접 교체**
  - shadcn 사용 방식은 명확하지만 호출부와 접근성 동작을 함께 검증해야 한다.
- **C. 다이얼로그·토스트는 기존 구현을 유지하고 나머지 UI만 전환**
  - 공통 overlay 회귀는 줄지만 디자인 시스템이 일부 분리된 채 남는다.

**답변:**
Q-06: B

### Q-07. 복잡한 테이블의 전환 범위를 어떻게 정할 것인가?

- **A. 데이터·필터·무한 스크롤·선택 동작은 유지하고 shadcn `Table`을 시각 primitive로만 사용 (추천)**
  - 현재 업무 계약을 보호하면서 표의 head/body/cell 스타일을 통일한다.
- **B. 표 구조와 필터 UI까지 shadcn 방식으로 전면 재구성**
  - 일관성은 높지만 모바일 카드, sticky, row 확장, 커서 로딩을 모두 다시 검증해야 한다.
- **C. 복잡한 상품·리뷰 표는 기존 구현을 유지하고 단순 표만 전환**
  - 회귀 위험은 낮지만 화면 간 표 스타일 통합이 제한된다.

**답변:**

Q-07: A

### Q-08. 아이콘 체계를 어떻게 할 것인가?

- **A. `lucide-react` 도입 (추천)**
  - 사이드바·액션·상태 아이콘을 텍스트/emoji보다 일관되게 표현할 수 있다.
- **B. 현재 텍스트·emoji·CSS 아이콘을 유지**
  - 의존성은 늘지 않지만 화면별 아이콘 표현이 계속 달라질 수 있다.
- **C. 별도 아이콘 라이브러리 사용**
  - 기존 디자인 자산이 있다면 활용할 수 있으나 shadcn 예시와의 차이를 관리해야 한다.

**답변:**
Q-08: A

### Q-09. JSX/TypeScript 전환 범위를 어떻게 할 것인가?

- **A. 기존 JSX를 유지하고 shadcn 컴포넌트도 `.jsx`로 생성 (추천)**
  - 설정·파일 확장자·타입 전환 없이 가장 작은 변경으로 도입한다.
- **B. 새 `src/components/ui`만 TypeScript로 생성**
  - primitive의 props 안정성은 높아지지만 JS와 TS가 혼재한다.
- **C. 전체 프로젝트를 TypeScript로 전환**
  - 장기 이점은 있으나 shadcn 도입과 분리해야 하는 별도 대형 작업이다.

**답변:**
Q-09: C

### Q-10. 첫 번째 pilot 화면은 무엇으로 할 것인가?

- **A. 관리자 설정 또는 단순 export 화면 (추천)**
  - Button/Input/Card/Dialog를 검증하면서 권한·대량 테이블 위험을 낮출 수 있다.
- **B. 관리자 대시보드**
  - 공통 Card/Badge/Button을 빠르게 검증할 수 있지만 차트와 반응형 회귀 범위가 있다.
- **C. 관리자 레이아웃/사이드바**
  - 전체 영향은 크지만 권한·직접 URL·메뉴 로딩 경계를 먼저 검증해야 한다.
- **D. 상품 상세 또는 리뷰받기 표**
  - 핵심 화면에서 바로 효과를 볼 수 있지만 가장 높은 회귀 위험을 감수해야 한다.

**답변:**

Q-10: A

## 4. 구현 전 추가 질문

`Q-01`~`Q-10`은 이미 답변되어 있다. 아래 질문은 구현 방식과 검증 범위를 확정하기 위한 추가 질문이다. 답변은 `Q-11: A`, `Q-12: B` 형식으로 작성하면 된다. 로그인 이메일·비밀번호는 이 문서에 작성하지 않고 `.env`의 E2E 값을 사용한다.

### Q-11. Tailwind v4의 CSS reset과 브라우저 지원을 어떻게 처리할 것인가?

- **A. Tailwind v4 preflight를 사용하고 기존 전역 규칙을 명시적으로 재적용 (추천)**
  - 최신 shadcn 흐름을 따르면서 box-sizing, body margin, 폰트, 배경, 표·폼 기본 스타일을 프로젝트 기준으로 고정한다.
- **B. 기존 reset을 우선하고 Tailwind preflight 영향을 최소화**
  - 기존 화면 회귀는 줄지만 shadcn 기본 스타일과 충돌을 직접 관리해야 한다.
- **C. 레거시 브라우저까지 지원하는 보수적 CSS만 사용**
  - 호환성은 넓어지지만 Tailwind v4의 일부 스타일·레이아웃 사용 범위가 제한될 수 있다.

**답변:**
Q-11: A

### Q-12. `@/*` alias와 기존 상대 경로를 어떻게 병행할 것인가?

- **A. `@/* → src/*` alias를 추가하고 기존 상대 경로는 유지, 새 shadcn 코드부터 alias 사용 (추천)**
  - 변경 범위를 작게 유지하면서 CLI와 editor import 해석을 안정화한다.
- **B. TypeScript 전환과 함께 저장소 전체 import를 alias로 변경**
  - 최종 경로는 일관되지만 한 번에 많은 파일을 건드린다.
- **C. alias를 사용하지 않고 기존 상대 경로만 유지**
  - 설정은 단순하지만 shadcn 생성 코드의 import 계약을 별도로 조정해야 한다.

**답변:**
Q-12: B

### Q-13. `components.json`의 초기 생성 설정은 무엇으로 할 것인가?

- **A. 현재 CLI의 `radix-vega` + `neutral` + CSS variables + TypeScript 컴포넌트 (추천)**
  - Q-04의 기본 shadcn 테마 방향과 Q-09의 전체 TypeScript 전환 방향을 현재 CLI 설정으로 반영한다.
- **B. `radix-vega` + `neutral` + CSS variables + JSX 컴포넌트로 먼저 시작**
  - 기반 설정은 빠르지만 이후 UI 컴포넌트를 다시 TypeScript로 옮길 수 있다.
- **C. 기본 preset을 사용하지 않고 프로젝트 전용 설정을 수동 구성**
  - 세밀한 제어는 가능하지만 CLI 재생성과 문서화 부담이 커진다.

**답변:**
Q-13: A

### Q-14. 전체 TypeScript 전환과 shadcn 기반 설정의 순서를 어떻게 할 것인가?

- **A. TypeScript 기반을 먼저 만든 뒤 shadcn을 초기화 (추천)**
  - Q-09 C와 Q-13 A를 일관되게 적용하고 생성 컴포넌트의 타입 계약을 처음부터 고정한다.
- **B. shadcn 기반을 JSX로 먼저 만들고 전체 TypeScript 전환을 후속 단계로 진행**
  - 첫 화면 전환은 빠르지만 임시 JSX/TS 혼재 기간이 생긴다.
- **C. TypeScript 전환과 shadcn 화면 전환을 동시에 진행**
  - 작업 기간은 줄일 수 있지만 UI 회귀와 타입 오류의 원인 분리가 어려워진다.

**답변:**
Q-14: A

### Q-15. shadcn의 `cn` 유틸리티 위치를 어디에 둘 것인가?

- **A. 기존 `src/lib/supabase.ts`는 유지하고 `src/lib/utils`를 shadcn 전용으로 추가 (추천)**
  - Supabase client와 UI class 조합 유틸의 책임을 분리한다.
- **B. 기존 `src/utils/` 아래에 `cn`을 추가**
  - 유틸리티 위치는 하나지만 도메인 순수 유틸과 UI 스타일 유틸이 섞인다.
- **C. `src/components/ui/utils`처럼 UI 폴더 내부에 둔다**
  - UI와 가까우나 여러 feature에서 공통으로 import할 경계가 약해진다.

**답변:**
Q-15: A

### Q-16. 폰트·body 배경·전역 기본 스타일을 어떻게 처리할 것인가?

- **A. Pretendard/Noto Sans KR, body 배경·margin 등 현재 운영 기준을 유지하고 shadcn 토큰만 연결 (추천)**
  - 정보 가독성과 기존 사용자 경험을 보존한다.
- **B. shadcn 기본 전역 스타일과 폰트로 교체**
  - 초기 구성이 단순하지만 한국어 줄바꿈과 백오피스 밀도가 달라질 수 있다.
- **C. 관리자와 공개 페이지에 서로 다른 전역 typography 체계를 적용**
  - 목적별 최적화는 가능하지만 공통 유지보수 범위가 커진다.

**답변:**
Q-16: B

### Q-17. 다크 모드를 이번 작업에 포함할 것인가?

- **A. 다크 모드는 도입하지 않고 light theme만 완성 (추천)**
  - shadcn 도입과 가독성·반응형 전환에 집중한다.
- **B. 관리자와 공개 페이지 모두 다크 모드 지원**
  - 테마 확장성은 높지만 색상 대비·표·사진·모달을 두 배로 검증해야 한다.
- **C. 관리자만 다크 모드 지원**
  - 백오피스 활용성을 높일 수 있으나 공개/관리자 토큰 분기가 생긴다.

**답변:**
Q-17: A

### Q-18. Q-06의 Dialog/Toast 직접 교체와 기존 공통 계약을 어떻게 조정할 것인가?

- **A. shadcn 내부를 사용하되 `AppAlertDialog` wrapper와 기존 위험 동작 계약은 유지 (추천)**
  - AGENTS.md의 공통 다이얼로그 규칙, busy 상태, Enter 확인, 오류 메시지 흐름을 지킨다.
- **B. 모든 호출부를 직접 `AlertDialog`/`Dialog`/`Sonner`로 바꾸고 공통 계약도 새로 정의**
  - shadcn 사용 방식은 가장 직접적이지만 기존 호출부와 전역 규칙을 함께 수정해야 한다.
- **C. Dialog/Toast는 기존 컴포넌트를 유지하고 다른 primitive부터 전환**
  - overlay 회귀를 뒤로 미루지만 완전한 통합 시점이 늦어진다.

**답변:**
Q-18: B

### Q-19. 관리자 모바일 사이드바를 어떻게 처리할 것인가?

- **A. 데스크톱 collapse 동작은 유지하고 좁은 화면에서만 `Sheet`를 추가 (추천)**
  - 관리자 정보 밀도와 기존 메뉴 권한을 유지하면서 공개/좁은 viewport 대응을 보완한다.
- **B. 데스크톱·모바일 모두 shadcn `Sidebar`/`Sheet`로 전면 교체**
  - 일관성은 높지만 권한 로딩·active route·collapse 계약을 다시 검증해야 한다.
- **C. 기존 sidebar DOM과 스타일을 그대로 유지**
  - 공통 UI 변경 위험은 가장 낮지만 shadcn 전환 범위가 제한된다.

**답변:**
Q-19: B

### Q-20. Q-05의 전역 CSS 재작성 시 feature class와 CSS 소유권을 어떻게 정리할 것인가?

- **A. Tailwind utility를 주로 사용하되 feature 경계 class는 단계 중 유지하고 사용처별로 제거 (추천)**
  - 전역·화면별 CSS를 최종적으로 줄이면서도 표·모달·공개 모바일 회귀를 추적할 수 있다.
- **B. 모든 화면의 class를 즉시 utility class로만 치환**
  - 최종 형태는 단순하지만 줄바꿈·cascade·responsive 회귀 원인을 추적하기 어렵다.
- **C. CSS Modules 또는 별도 scoped CSS로 재구성**
  - 소유권은 명확해지지만 shadcn/Tailwind와 또 다른 스타일 계층을 관리해야 한다.

**답변:**
Q-20: A

### Q-21. 브라우저 검증 범위와 접근 가능한 메뉴를 어떻게 정할 것인가?

- **A. `.env`의 E2E 계정으로 접근 가능한 관리자 전체 메뉴와 공개 리뷰받기 모바일 경로를 검증 (추천)**
  - 자격 증명은 문서·로그·스크린샷에 남기지 않고, 실제 접근 가능한 메뉴만 기준으로 기록한다.
- **B. pilot 화면·설정·export와 공개 리뷰받기 모바일만 우선 검증**
  - 초기 단계는 빠르지만 전체 전환 완료 전 추가 smoke 검증이 필요하다.
- **C. 브라우저 검증 없이 build/test만 수행**
  - 실행 환경 제약이 있을 때만 선택하고 최종 응답에 미검증 이유를 남긴다.

**답변:**
Q-21: A

### Q-22. Q-18 B와 기존 공통 다이얼로그 규칙의 충돌을 어떻게 해결할 것인가?

- **A. `AppAlertDialog` wrapper는 유지하고 내부 구현만 shadcn `AlertDialog`로 교체 (추천)**
  - 현재 `AGENTS.md` 규칙과 `review-manager-ui`의 공통 다이얼로그 계약을 지키면서 shadcn을 적용한다.
- **B. `AppAlertDialog` 사용 규칙을 폐기하고 모든 확인·삭제 호출부를 직접 shadcn `AlertDialog`로 교체**
  - 이 경우 구현 전에 `AGENTS.md`와 관련 UI skill 계약도 함께 변경하는 별도 승인이 필요하다.

**답변:**
Q-22: B (다만 현재 엔터로 넘어가는 등 규칙은 그대로 유지할 수 있게)

## 5. 잠정 컴포넌트 매핑

| 현재 UI 책임 | 후보 shadcn 컴포넌트 | 보존해야 할 기존 계약 |
| --- | --- | --- |
| 주요·보조·위험 버튼 | `Button` | disabled, loading, 위험 색상, 중복 클릭 방지 |
| 입력과 라벨 | `Input`, `Label`, `Textarea` | 한국어 IME, placeholder, 오류 메시지, 연결된 label |
| native select·필터 선택 | `Select`, 필요 시 `DropdownMenu`/`Popover` | 현재 값, 초기화, 키보드, 빈 옵션 |
| 체크박스·회사 범위 토글 | `Checkbox`, `Switch` | 개인/회사 scope 의미, disabled, label |
| 상태 표시 | `Badge` | 구매·리뷰·완료·오류 텍스트와 색상 외 보조 정보 |
| dashboard/export 패널 | `Card`, `Separator` | 현재 spacing, responsive, 빈 상태 |
| 확인·삭제·위험 동작 | `AlertDialog` | `AppAlertDialog`의 props, busy 상태, Enter 확인 |
| 입력·사진·상세 modal | `Dialog`, 필요 시 `Sheet` | 사진 viewer, backdrop, focus, close 규칙 |
| 단계·상태 탭 | `Tabs` | URL·데이터 상태와 분리된 현재 tab 의미 |
| 표 | `Table` | filter row, sticky header, infinite sentinel, mobile list |
| 로딩 | `Skeleton` 또는 기존 상태 UI | 네트워크 오류와 빈 결과를 로딩으로 오인하지 않음 |
| toast | 기존 `AppToast` 또는 `Sonner` | 성공·실패 문구, 자동 닫힘, aria-live |
| 관리자 sidebar | 기존 권한 로직 + `Sidebar`/`Sheet` 검토 | menu permission, 직접 URL, collapse, logout |

## 6. 잠정 실행 단계

### Phase 0. 결정·baseline 고정

- Q-01~Q-22의 답변과 실행 영향을 `plans.md`에 반영한다.
- 기존 `npm test`, `npm run build`, 주요 관리자·공개 경로의 브라우저 smoke 결과를 기준선으로 기록한다.
- 변경하지 않을 계약을 확정한다: 라우트, 권한, Supabase 요청, 데이터 표시, 위험 동작.
- 이 단계가 끝나기 전에는 애플리케이션 UI 코드를 수정하지 않는다.

### Phase 1. shadcn 기반만 추가

- Tailwind와 필요한 shadcn 의존성을 선택한 버전 전략에 맞게 추가한다.
- Vite plugin, TypeScript용 alias, global CSS 진입점을 설정한다.
- `components.json`, `src/components/ui/`, `src/lib/utils.ts`를 추가한다.
- 기존 화면을 새 컴포넌트로 교체하지 않고 build/test를 통과시킨다.

### Phase 2. 토큰·공통 primitive 검증

- shadcn `radix-vega`/`neutral` semantic token과 전역 typography/reset을 구성한다.
- `Button`, `Input`, `Label`, `Card`, `Badge`, `Checkbox`, `Switch`를 pilot 화면에 적용한다.
- focus ring, disabled, danger, loading, 좁은 화면을 브라우저에서 확인한다.
- 공통 스타일이 기존 `AppAlertDialog`와 충돌하지 않는지 확인한다.

### Phase 3. 공통 overlay·폼·탭

- `AppAlertDialog` 사용 규칙을 직접 shadcn `AlertDialog`/`Dialog`/`Sonner` 호출로 전환하되, Enter 확인, Escape, focus, aria, busy/disabled, 오류 피드백 계약은 유지한다.
- Dialog, Select, Tabs, Dropdown/Popover를 실제 사용처별로 적용한다.
- 입력 오류, 빈 입력, IME, Enter, Escape, backdrop, 중복 제출을 검증한다.

### Phase 4. 관리자 feature별 전환

- export/settings → dashboard → product detail → product overview/review receive 순서로 진행한다.
- 페이지·서비스·훅의 책임은 변경하지 않고 presentational markup과 스타일만 전환한다.
- 복잡한 표는 Q-07에서 정한 범위만 적용한다.
- feature별 기존 CSS를 검토한 뒤 사용하지 않는 selector만 제거한다.

### Phase 5. 공개 화면·로그인·layout 후속 전환

- Q-01 B에 따라 공개 리뷰받기와 로그인 화면을 별도 단계로 전환·검증한다.
- AdminLayout은 권한 로딩·권한 없음·직접 URL·collapse·logout을 먼저 확인한다.
- 로그인 화면의 기존 시각 무드는 별도 승인 없이는 유지한다.

### Phase 6. 정리·최종 검증

- 남은 중복 CSS와 legacy primitive를 사용처 확인 후 제거한다.
- `src/components/ui`의 className override와 semantic token을 문서화한다.
- `npm test`, `npm run build`, `git diff --check`를 실행한다.
- Playwright MCP 또는 Chrome DevTools MCP로 주요 관리자·공개 경로를 검증한다.
- DB 변경이 없으면 `docs/guide_db.md`는 갱신하지 않는다.

## 7. 실행 현황 (2026-08-12)

- Phase 0 완료: 기존 테스트 41개와 baseline build를 확인했고, 라우트·권한·Supabase 데이터 계약 변경 없이 진행 중이다.
- Phase 1 완료: TypeScript 설정, Tailwind v4 Vite plugin, `components.json`, `@/*` alias, `src/components/ui/`, `src/lib/utils.ts`를 구성했다.
- Phase 2 완료: 설정 화면을 pilot으로 Button/Input/Card/Checkbox/Dialog/Sonner를 적용하고 Enter·Escape·busy 동작을 브라우저에서 확인했다.
- 관리자 전환 주요 범위 완료: shadcn Sidebar/Sheet, dashboard Card/Badge/Table, 상품전체보기 Table/필터/선택, 리뷰받기 목록·상세, 일괄수정, 파일 업로드, export 화면, 상품 상세의 Table/Button/Input/Textarea/Select/Checkbox/Card/Badge/Tabs를 적용했다. 데이터·필터·선택·무한 스크롤·모바일 카드 같은 복잡한 동작은 유지했다.
- 하늘색 테마 통일 완료: Q-04를 A로 변경하고 `background`·`primary`·`secondary`·`muted`·`border`·`ring`·`destructive` 및 sidebar semantic token을 기존 하늘색 팔레트로 매핑했다. legacy gradient·중립 회색 모달/버튼 override와 export·dashboard·설정·공개 조회·사진 업로드 모달의 주요 control style을 shadcn solid/outline/semantic variant에 맞췄다.
- 공개 전환 완료: 로그인·공개 리뷰 조회/요약/제출 섹션·사진 Dialog를 적용하고 desktop 및 mobile viewport에서 조회·필터·가로 스크롤·모달 close 동작을 확인했다.
- TypeScript/alias 전환 완료: `src`의 `.js/.jsx` 모듈을 `.ts/.tsx`로 전환하고 로컬 import를 `@/*`로 통일했다. 기존 도메인 모듈은 단계적 타입 보강을 위한 `@ts-nocheck` 경계가 일부 남아 있다.
- 검증 완료: `npx tsc --noEmit`, `npm run build`, `npm test`(41개), `git diff --check`를 통과했다. Node 테스트의 `@/*` 해석을 위해 테스트 전용 resolver를 추가했다.
- 브라우저 검증 완료: 설정 Dialog의 semantic 색상·radius와 Escape close, export 날짜 필터, 공개 리뷰받기 모바일의 긴 텍스트·overflow·사진 Dialog close 및 primary/outline control 색상을 확인했다. 계정 capability 조회에서 기존 Supabase `admins` 400 응답만 관찰되었고 새 UI 렌더링 오류나 경고는 확인되지 않았다.
- 남은 작업: feature CSS의 legacy selector를 사용처 확인 후 정리하고, 도메인 모듈의 `@ts-nocheck` 경계를 단계적으로 줄이며, shadcn-backed `AppAlertDialog` adapter를 사용하는 기존 호출부를 직접 `AlertDialog` 호출로 바꿀 필요가 있는지 최종 정리한다. 현재 adapter 내부는 shadcn `AlertDialog`이며 기존 Enter/Escape/focus/busy 계약을 보존한다.
- DB 변경은 없으므로 `docs/guide_db.md`와 샘플 데이터는 갱신하지 않는다.

## 8. 완료 기준

- 기존 라우트·권한·Supabase 데이터 요청·쓰기 결과가 달라지지 않는다.
- 브라우저 기본 `alert`·`confirm`·`prompt`가 추가되지 않는다.
- `AppAlertDialog`의 위험 동작과 busy/disabled 상태가 유지된다.
- 로딩·오류·빈 결과·비활성·성공 피드백이 구분된다.
- 키보드 focus, label 연결, modal close, table overflow, 모바일 layout을 확인한다.
- 대표적인 긴 텍스트·날짜·금액·링크·상태값에서 의도하지 않은 줄바꿈으로 인한 가독성 저하가 없는지 확인한다.
- 공개 리뷰어 페이지는 모바일 viewport에서 줄바꿈·overflow·모달·터치 조작을 확인하고, 관리자 페이지는 데스크톱 백오피스의 표와 정보 밀도를 확인한다.
- 선택한 shadcn `radix-vega`/`neutral` 테마가 semantic token으로 일관되게 표현되고, 정보 가독성·줄바꿈·공개 모바일 기준을 만족한다.
- 구현 단계별 build와 관련 테스트가 통과한다.
- 계획·구현 중 생성한 임시 파일과 비밀값이 저장소·로그·문서에 남지 않는다.

## 9. 현재 실행 상태

`Q-01`~`Q-22`의 답변과 실행 방향이 반영되었고 주요 화면 전환과 검증을 진행했다. 현재는 legacy CSS 정리, strict TypeScript 보강, 공통 Dialog 호출부의 최종 정리 단계다.
