# 자재(jajae) 프리미엄 홈페이지 리디자인 — 설계 스펙

- 작성일: 2026-06-28
- 상태: 승인됨 (사용자 디자인 승인 완료)
- 범위: 홈페이지(`/`) + 전역 셸의 헤더/푸터. 내부 앱 페이지(카탈로그, AI견적, 현장 등 20여 개)는 **변경하지 않음**.

## 1. 목표 (결론 먼저)

기존의 평범한 히어로+카드 홈페이지를, **건축가풍 미니멀(architectural minimal)** 톤의 "고급" 랜딩으로 재구성한다. 따뜻한 오프화이트 캔버스 + 차콜 잉크 + 콘크리트 그레이 헤어라인 위에 **기존 브랜드 블루 `#1A56DB`를 포인트로만** 사용한다. 내부 페이지는 무손상으로 두고, 헤더/푸터만 같은 톤으로 정제한다.

### 비목표 (YAGNI)
- 내부 앱 페이지 리디자인 (별도 작업)
- 전역 디자인 토큰 대개편 / 다크모드 전환
- 신규 이미지 에셋 도입 (CSS-only로 구현)
- 가짜 지표/숫자 (정직성: 사실 기반 문구만)
- i18n, 애니메이션 라이브러리 도입

## 2. 핵심 제약과 해결책

**제약**: `app/layout.tsx`가 모든 페이지를 `container-app`(max-w-screen-md ≈ 768px) + `py-5`로 감싼다. 프리미엄 랜딩은 풀블리드가 필수.

**해결 (접근법 A — CSS 풀블리드 탈출)**:
- `app/globals.css`에 `.full-bleed { margin-inline: calc(50% - 50vw); }` 유틸 추가.
- 가로 스크롤 방지: 적절한 래퍼/`html`에 `overflow-x: clip` 안전장치.
- 홈 루트에서 전역 `<main>`의 `py-5`를 상쇄(`-my-5` 또는 동등). 히어로가 헤더 바로 아래 flush.
- 이 방식은 `app/layout.tsx`의 `<main className="container-app py-5">` 래퍼를 **수정하지 않으므로** 내부 20여 페이지가 한 줄도 영향받지 않는다.

거부된 대안:
- B(레이아웃 재구성/route group): 범위 초과·회귀 위험.
- C(컨테이너 유지 정제): 풀블리드가 아니라 "고급"이 안 남.

## 3. 디자인 언어

### 팔레트 (가산적 토큰, 기존 토큰 불변)
`tailwind.config.ts` `theme.extend.colors`에 **추가만** 한다 (기존 brand/스케일/시맨틱 컬러는 그대로):
- `paper`: 따뜻한 오프화이트 캔버스 (예: `#FAFAF8`)
- `ink`: 차콜 본문 (예: `#16181D`) — 기존 `foreground`보다 깊게 (장식적 대비)
- `hairline`: 1px 구분선 (예: `#E7E5E0` 따뜻한 그레이)
- 콘크리트 그레이 캡션은 기존 `muted.foreground` 재사용 가능
- 포인트: 기존 `brand`(`#1A56DB`)를 CTA·인덱스 번호·호버·핵심 링크에만.
- 1개 대비 섹션(선택)에서 `ink` 배경 위 `paper` 텍스트 사용 가능.

기존의 푸르스름한 `bg-muted/30`(body), `bg-brand-50`(히어로 블록)은 홈에서 사용하지 않는다. 홈은 풀블리드 섹션이 자체 배경을 깔아 body 배경을 덮는다 → 전역 body 배경 변경 불필요(내부 페이지 무영향).

### 타이포 (Pretendard, 이미 로드됨)
- 히어로 헤드라인: `clamp()` 초대형 디스플레이, 타이트 트래킹(`tracking-tight`), 타이트 리딩.
- Eyebrow/라벨: 작은 크기 + 대문자 + 자간(`tracking-widest`/`uppercase`), 콘크리트 그레이.
- 기능 인덱스: 01–04 대형 숫자(에디토리얼 시그니처), 얇은 웨이트 또는 outline 느낌.
- 본문: 좁은 측정폭(`max-w-prose`/`max-w-xl`)으로 가독성.

### 여백·리듬
- 섹션 수직 여백 `py-24`~`py-32`(모바일은 축소).
- 섹션 경계는 **1px 헤어라인**(`border-hairline`).
- 무거운 그림자/글래스 없음.

### 모티프
- 히어로에 **옅은 청사진(blueprint) 그리드** 배경(장식, `aria-hidden`). globals의 `.blueprint-grid` 유틸 또는 인라인 배경.
- 미세 호버 인터랙션만(밑줄 reveal, 살짝 translate), `prefers-reduced-motion: reduce` 시 비활성화.

## 4. 페이지 구성 (홈 `/`)

순서대로:

1. **Hero** (`components/landing/hero.tsx`)
   - Eyebrow: "인테리어 + 건축 자재 통합 플랫폼"
   - 헤드라인: "현장 자재, 한 번에." (초대형)
   - 보조 문구: 통합 구매 / AI 물량산출(BOM) / 다중 공급사 자동 분할 / 현장 관리 요약
   - 1차 CTA `카탈로그 둘러보기` → `/catalog`, 2차 `AI 견적 받기` → `/ai-quote`
   - 보조 링크: "사업자 인증하고 시작하기" → `/login`
   - 배경: 옅은 청사진 그리드(`aria-hidden`)

2. **Capability list 01–04** (`components/landing/capability-list.tsx`)
   - 헤어라인으로 구분된 대형 번호 목록(현재 카드 그리드 대체):
     - 01 전 카테고리 자재 (타일·바닥재·도배·페인트·…·시멘트·철근·단열·방수·철물)
     - 02 AI 자재 물량산출 (프로젝트 유형/평수 → BOM·예상견적)
     - 03 다중 공급사 통합주문 (장바구니 → 공급사별 PO 자동 분할)
     - 04 현장별 통합 관리 (배송·반품·AS·일정)
   - 데스크톱 2열, 모바일 1열.

3. **AI 견적 스포트라이트** (`components/landing/ai-quote-spotlight.tsx`)
   - 2열: 좌측 카피, 우측 "입력 → BOM 산출" 모노스페이스 목업 패널(CSS-only, 정적 예시).
   - CTA → `/ai-quote`.

4. **통합주문 → 자동 PO 분할 스포트라이트** (`components/landing/po-split-spotlight.tsx`)
   - 장바구니 → 공급사별 발주서(PO) 분할을 헤어라인/화살표 다이어그램으로(CSS-only).
   - CTA → `/catalog`.

5. **Closing CTA** (`components/landing/closing-cta.tsx`)
   - 정제된 단일 CTA "지금 견적을 받아보세요" → `/ai-quote`, 보조 `/catalog`.

6. **Footer** (`components/site-footer.tsx`, 신규, 전역 마운트)
   - 로고 + 한 줄 태그라인
   - 링크 컬럼: 제품(카탈로그/AI견적/공동구매/시세/현장), 지원(커뮤니티/문의), 회사/법적 고지
   - 저작권 © 2026 자재

> **정직성**: 신뢰 요소는 가짜 숫자 없이 사실 기반 자격 문구만 사용. 실제 수치 확보 시 후속 반영.

## 5. 헤더 정제 (`components/site-header.tsx`, 기능 100% 유지)

- 기존 NAV 배열·`useCart`·`usePathname`·active 로직 **그대로 유지**.
- 시각만 격상: 약간 키운 높이, 정제된 로고 락업, 헤어라인 보더 + 오프화이트 `backdrop-blur`.
- Active 표시: **채운 블루 알약 → 하단 밑줄 인디케이터**(차분·고급).
- 우측에 "로그인" 텍스트 CTA(→ `/login`) 추가.
- 클라이언트 컴포넌트 유지(상태 의존).

## 6. 파일 변경 목록

신규:
- `components/landing/hero.tsx`
- `components/landing/capability-list.tsx`
- `components/landing/ai-quote-spotlight.tsx`
- `components/landing/po-split-spotlight.tsx`
- `components/landing/closing-cta.tsx`
- `components/site-footer.tsx`
- 테스트: `tests/` 하위 홈/푸터 렌더 스모크 테스트 (기존 테스트 위치 규약 따름)

수정:
- `app/page.tsx` — 랜딩 조립(풀블리드 래퍼 + 전역 `py-5` 상쇄)
- `app/layout.tsx` — `<SiteFooter />` 마운트 (헤더/main 구조는 유지)
- `app/globals.css` — `.full-bleed`, `.blueprint-grid` 유틸 + `overflow-x: clip` 안전장치
- `tailwind.config.ts` — `paper`/`ink`/`hairline` 토큰 **추가만**
- `components/site-header.tsx` — 스타일 정제(기능 불변)

랜딩 섹션 컴포넌트는 모두 **서버 컴포넌트(정적)**. 데이터 패칭 없음.

## 7. 컴포넌트 계약 (인터페이스)

- 각 `components/landing/*`: props 없는 정적 서버 컴포넌트, 단일 `<section aria-labelledby=...>` 렌더. 내부 콘텐츠 상수는 파일 내 지역 상수.
- `SiteFooter`: props 없음, `<footer>` 렌더.
- 불변(immutable) 데이터: 기능/링크 목록은 `const` 배열, 매핑만(변이 없음).

## 8. 데이터 흐름 / 에러 처리

- 데이터 패칭 없는 순수 정적 페이지. 외부 API/DB 호출 없음 → 런타임 에러 상태 없음.
- 링크는 Next `<Link>` 클라이언트 라우팅. 잘못된 경로는 Next 기본 404가 처리.
- 입력/사용자 데이터 없음 → 검증 대상 없음(시스템 경계 입력 부재).

## 9. 접근성 / 반응형

- 시맨틱 랜드마크: `header`/`main`/`footer`, 각 섹션 `aria-labelledby`.
- 헤딩 위계: 페이지 `h1`(히어로) 1개, 섹션 `h2`.
- 대비: 잉크/페이퍼 ≈ AAA, 블루 포인트는 큰/중간 텍스트·버튼에서 AA 충족(소형 본문에는 블루 텍스트 지양).
- 장식 요소(청사진 그리드, 대형 인덱스 번호의 배경적 사용) `aria-hidden`.
- `focus-visible` 링 유지(기존 버튼 변형 활용).
- `prefers-reduced-motion: reduce` 시 트랜지션/translate 비활성화.
- 모바일 우선: 히어로 타입 `clamp`, 목록 1열→2열, 스포트라이트 1열→2열.

## 10. 테스트 전략 (TDD, vitest + @testing-library/react, 이미 설치)

테스트 우선(RED → GREEN):
- 홈(`app/page.tsx`) 렌더 스모크: 크래시 없이 렌더.
- 계약 검증:
  - `h1` "현장 자재, 한 번에." 존재
  - `카탈로그` 링크 → `/catalog`, `AI 견적` 링크 → `/ai-quote`, 사업자/로그인 링크 → `/login`
  - 4개 capability 타이틀 존재
- 푸터 렌더 스모크: 주요 링크 컬럼/저작권 존재.
- (헤더는 기능 불변이므로 회귀 방지용 최소 스모크 — 선택)

게이트(증거 기반 완료):
- `npm run typecheck` → 0 errors
- `npm run lint` → 0 errors
- `npm run test` → 전부 통과(신규 포함)
- `npm run build` → exit 0

## 11. 수용 기준 (Acceptance Criteria)

- [ ] 홈이 풀블리드 건축가풍 미니멀 랜딩으로 렌더되고, 내부 페이지 레이아웃은 변화 없음(육안/스냅 확인).
- [ ] 브랜드 블루는 포인트로만 사용, 캔버스는 오프화이트, 구분선은 헤어라인.
- [ ] 헤더 기능(nav active, 장바구니 카운트, 라우팅) 회귀 없음, 시각만 정제.
- [ ] 신규 푸터 전역 노출.
- [ ] 가짜 수치 없음(사실 기반 문구만).
- [ ] typecheck/lint/test/build 전부 통과(증거 제출).
- [ ] 기존 토큰/내부 페이지 무손상(가산 변경만).

## 12. 리스크 / 완화

- 풀블리드 가로 스크롤: `overflow-x: clip` + `margin-inline: calc(50% - 50vw)` 검증, 모바일/스크롤바 환경 확인.
- 전역 `py-5` 상쇄가 다른 페이지에 누수되지 않도록 홈 루트에 국한.
- 헤더 정제 시 active/cart 로직 보존(스타일 클래스만 변경).
