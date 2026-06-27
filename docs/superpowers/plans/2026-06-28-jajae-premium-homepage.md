# 자재 프리미엄 홈페이지 리디자인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 자재 홈페이지(`/`)를 건축가풍 미니멀 톤의 "고급" 풀블리드 랜딩으로 재구성하고, 전역 헤더/푸터를 같은 톤으로 정제한다(내부 앱 페이지 무손상).

**Architecture:** 정적 서버 컴포넌트 5개(`components/landing/*`)로 홈 섹션을 구성하고 `app/page.tsx`에서 CSS 풀블리드(`margin-inline: calc(50% - 50vw)`)로 전역 컨테이너를 탈출해 조립한다. Tailwind에 뉴트럴 토큰(paper/ink/hairline)을 **가산**하고, 브랜드 블루는 포인트로만 쓴다. 신규 `SiteFooter`를 `app/layout.tsx`에 전역 마운트하고 `site-header.tsx`는 스타일만 정제한다.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript(strict), Tailwind CSS 3.4, Pretendard, lucide-react, vitest + @testing-library/react(jsdom).

## Global Constraints

- 범위: 홈(`app/page.tsx`) + 전역 셸의 헤더/푸터만. 내부 앱 페이지(catalog, ai-quote, sites 등 20여 개)는 **수정 금지**.
- Tailwind 토큰은 **가산만**: 기존 `brand` 스케일·시맨틱 컬러(`muted`,`border` 등)·`borderRadius`·`fontFamily` 변경 금지.
- 브랜드 블루 `#1A56DB`(토큰 `brand`)는 CTA·인덱스 번호·호버·핵심 링크 포인트로만. 캔버스는 `paper`, 본문은 `ink`, 구분선은 `hairline`.
- 가짜 지표/숫자 금지. 신뢰 요소는 사실 기반 문구만(예시 BOM 패널은 `aria-hidden` 장식으로 명시).
- 랜딩 섹션 컴포넌트는 props 없는 **정적 서버 컴포넌트**. 데이터 패칭/외부 호출 없음.
- 이미지 에셋 도입 금지(CSS-only).
- 불변 패턴: 콘텐츠 목록은 `const` 배열 + `.map()`만(변이 없음). `console.log` 금지. 하드코딩 시크릿 없음.
- 컴포넌트 렌더 테스트는 `tests/components/**`에 둔다(이 경로만 jsdom). 각 테스트 파일 상단에 `import "@testing-library/jest-dom/vitest";`와 `afterEach(cleanup)` 포함. `next/link`는 passthrough 앵커로 `vi.mock`.
- 게이트: `npm run typecheck`(0 errors) · `npm run lint`(0 errors) · `npm run test`(전부 통과) · `npm run build`(exit 0).

## Content Constants (테스트·구현 공통 — 문자열 정확히 일치시킬 것)

- 히어로 eyebrow: `인테리어 + 건축 자재 통합 플랫폼`
- 히어로 h1: `현장 자재,` + 줄바꿈 + `한 번에.`
- CTA 라벨/경로: `카탈로그 둘러보기`→`/catalog`, `AI 견적 받기`→`/ai-quote`, `사업자 인증하고 시작하기 →`→`/login`
- Capability 4종(번호/제목): `01 전 카테고리 자재`, `02 AI 자재 물량산출`, `03 다중 공급사 통합주문`, `04 현장별 통합 관리`
- AI 스포트라이트 h2: `평수만 입력하면, AI가 물량을 산출합니다`, 패널 헤더: `BOM 산출 결과`
- PO 스포트라이트 h2: `한 번의 주문, 공급사별 발주서로 자동 분할`
- 클로징 h2: `지금 바로 견적을 받아보세요`
- 헤더 신규 CTA: `로그인`→`/login`
- 푸터 카피라이트: `© {연도} 자재. 인테리어·건축자재 통합 플랫폼.`

---

### Task 1: Foundation — Tailwind 뉴트럴 토큰 + globals 유틸

**Files:**
- Modify: `tailwind.config.ts` (theme.extend.colors에 paper/ink/hairline 추가)
- Modify: `app/globals.css` (`.full-bleed`, `.blueprint-grid` 유틸 + `overflow-x: clip` 안전장치)

**Interfaces:**
- Produces: Tailwind 클래스 `bg-paper`/`text-ink`/`border-hairline`/`text-paper`, 유틸 클래스 `full-bleed`, `blueprint-grid`. 이후 모든 컴포넌트가 사용.

- [ ] **Step 1: tailwind.config.ts 색상 토큰 추가**

`theme.extend.colors` 객체에 아래 3개 키를 **추가**(기존 키 변경 금지):

```ts
        paper: "#FAFAF8",
        ink: "#16181D",
        hairline: "#E7E5E0",
```

- [ ] **Step 2: app/globals.css 유틸/안전장치 추가**

기존 `@layer base { ... }`의 `html { -webkit-text-size-adjust: 100%; }` 규칙에 `overflow-x: clip;`를 추가하고, 기존 `@layer utilities { .container-app {...} }` 블록 안에 두 유틸을 추가:

```css
  html {
    -webkit-text-size-adjust: 100%;
    overflow-x: clip;
  }
```

```css
  .full-bleed {
    width: 100vw;
    margin-inline: calc(50% - 50vw);
  }
  .blueprint-grid {
    background-image:
      linear-gradient(to right, rgba(22, 24, 29, 0.045) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(22, 24, 29, 0.045) 1px, transparent 1px);
    background-size: 32px 32px;
  }
  @media (prefers-reduced-motion: reduce) {
    * {
      transition-duration: 0.01ms !important;
    }
  }
```

- [ ] **Step 3: typecheck로 설정 컴파일 검증**

Run: `npm run typecheck`
Expected: 0 errors (config가 유효한 TS). CSS 변경은 컴파일 영향 없음.

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.ts app/globals.css
git commit -m "feat(home): paper/ink/hairline 토큰 + full-bleed·blueprint 유틸 추가"
```

---

### Task 2: Hero 섹션 컴포넌트

**Files:**
- Create: `components/landing/hero.tsx`
- Test: `tests/components/landing/hero.test.tsx`

**Interfaces:**
- Consumes: `@/components/ui/button`(`Button`), `next/link`, 토큰(Task 1).
- Produces: `export function Hero(): JSX.Element` (props 없음).

- [ ] **Step 1: 실패 테스트 작성**

`tests/components/landing/hero.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  ),
}));

import { Hero } from "@/components/landing/hero";

afterEach(cleanup);

describe("Hero", () => {
  it("renders the h1 headline", () => {
    render(<Hero />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("현장 자재");
    expect(h1).toHaveTextContent("한 번에.");
  });

  it("links the primary CTAs to the right routes", () => {
    render(<Hero />);
    expect(screen.getByRole("link", { name: /카탈로그 둘러보기/ })).toHaveAttribute("href", "/catalog");
    expect(screen.getByRole("link", { name: /AI 견적 받기/ })).toHaveAttribute("href", "/ai-quote");
    expect(screen.getByRole("link", { name: /사업자 인증/ })).toHaveAttribute("href", "/login");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/components/landing/hero.test.tsx`
Expected: FAIL — `Cannot find module '@/components/landing/hero'`.

- [ ] **Step 3: 컴포넌트 구현**

`components/landing/hero.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section aria-labelledby="hero-heading" className="relative border-b border-hairline">
      <div
        aria-hidden
        className="blueprint-grid pointer-events-none absolute inset-0 opacity-70 [mask-image:linear-gradient(to_bottom,black,transparent)]"
      />
      <div className="relative mx-auto w-full max-w-6xl px-6 py-28 sm:py-36">
        <span className="inline-flex items-center gap-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          <span aria-hidden className="h-px w-8 bg-brand" />
          인테리어 + 건축 자재 통합 플랫폼
        </span>
        <h1
          id="hero-heading"
          className="mt-8 max-w-3xl text-balance text-5xl font-bold leading-[1.05] tracking-tight text-ink sm:text-7xl"
        >
          현장 자재,
          <br />한 번에.
        </h1>
        <p className="mt-8 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          인테리어부터 건축까지 전 자재를 통합 구매하세요. AI 물량산출(BOM)로
          견적을 뽑고, 다중 공급사를 한 번에 주문하면 발주서가 자동 분할됩니다.
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/catalog">카탈로그 둘러보기</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/ai-quote">AI 견적 받기</Link>
          </Button>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-brand underline-offset-4 hover:underline">
            사업자 인증하고 시작하기 →
          </Link>
        </p>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/components/landing/hero.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/landing/hero.tsx tests/components/landing/hero.test.tsx
git commit -m "feat(home): Hero 섹션(건축가풍 미니멀) + 테스트"
```

---

### Task 3: CapabilityList 섹션 컴포넌트

**Files:**
- Create: `components/landing/capability-list.tsx`
- Test: `tests/components/landing/capability-list.test.tsx`

**Interfaces:**
- Produces: `export function CapabilityList(): JSX.Element`.

- [ ] **Step 1: 실패 테스트 작성**

`tests/components/landing/capability-list.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CapabilityList } from "@/components/landing/capability-list";

afterEach(cleanup);

describe("CapabilityList", () => {
  it("renders the four numbered capabilities", () => {
    render(<CapabilityList />);
    ["01", "02", "03", "04"].forEach((n) =>
      expect(screen.getByText(n)).toBeInTheDocument(),
    );
    expect(screen.getByText("전 카테고리 자재")).toBeInTheDocument();
    expect(screen.getByText("AI 자재 물량산출")).toBeInTheDocument();
    expect(screen.getByText("다중 공급사 통합주문")).toBeInTheDocument();
    expect(screen.getByText("현장별 통합 관리")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/components/landing/capability-list.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: 컴포넌트 구현**

`components/landing/capability-list.tsx`:

```tsx
const ITEMS = [
  {
    n: "01",
    title: "전 카테고리 자재",
    desc:
      "타일·바닥재·도배·페인트·위생도기·조명·문/창호·주방부터 시멘트·철근·단열·석고보드·목재·방수·철물까지 한 곳에서.",
  },
  {
    n: "02",
    title: "AI 자재 물량산출",
    desc:
      "프로젝트 유형과 평수만 입력하면 AI가 필요한 자재 물량(BOM)을 자동 산출하고 예상 견적을 뽑아줍니다.",
  },
  {
    n: "03",
    title: "다중 공급사 통합주문",
    desc:
      "여러 공급사 자재를 장바구니에 담아 한 번에 주문하면 공급사별 발주서(PO)로 자동 분할됩니다.",
  },
  {
    n: "04",
    title: "현장별 통합 관리",
    desc: "현장 단위로 배송·반품·AS를 한눈에 추적하고 공정에 맞춰 일정을 관리하세요.",
  },
] as const;

export function CapabilityList() {
  return (
    <section aria-labelledby="capabilities-heading" className="border-b border-hairline">
      <div className="mx-auto w-full max-w-6xl px-6 py-24 sm:py-28">
        <h2
          id="capabilities-heading"
          className="max-w-2xl text-3xl font-bold tracking-tight text-ink sm:text-4xl"
        >
          현장 하나를 끝내는 데 필요한 모든 것
        </h2>
        <dl className="mt-16 grid grid-cols-1 gap-x-12 gap-y-14 sm:grid-cols-2">
          {ITEMS.map((it) => (
            <div key={it.n} className="border-t border-hairline pt-6">
              <span className="block text-sm font-semibold tabular-nums tracking-widest text-brand">
                {it.n}
              </span>
              <dt className="mt-4 text-xl font-semibold text-ink">{it.title}</dt>
              <dd className="mt-3 text-base leading-relaxed text-muted-foreground">
                {it.desc}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/components/landing/capability-list.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/landing/capability-list.tsx tests/components/landing/capability-list.test.tsx
git commit -m "feat(home): Capability 01-04 에디토리얼 목록 + 테스트"
```

---

### Task 4: AiQuoteSpotlight 섹션 컴포넌트

**Files:**
- Create: `components/landing/ai-quote-spotlight.tsx`
- Test: `tests/components/landing/ai-quote-spotlight.test.tsx`

**Interfaces:**
- Consumes: `@/components/ui/button`, `next/link`.
- Produces: `export function AiQuoteSpotlight(): JSX.Element`.

- [ ] **Step 1: 실패 테스트 작성**

`tests/components/landing/ai-quote-spotlight.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  ),
}));

import { AiQuoteSpotlight } from "@/components/landing/ai-quote-spotlight";

afterEach(cleanup);

describe("AiQuoteSpotlight", () => {
  it("renders heading, BOM mock and CTA", () => {
    render(<AiQuoteSpotlight />);
    expect(
      screen.getByRole("heading", { name: /평수만 입력하면, AI가 물량을 산출합니다/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/BOM 산출 결과/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /AI 견적 받기/ })).toHaveAttribute("href", "/ai-quote");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/components/landing/ai-quote-spotlight.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: 컴포넌트 구현**

`components/landing/ai-quote-spotlight.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

const ROWS = [
  { name: "타일 (600×600)", qty: "24 박스" },
  { name: "방수 시트", qty: "8 롤" },
  { name: "석고보드 (9.5T)", qty: "36 장" },
] as const;

export function AiQuoteSpotlight() {
  return (
    <section aria-labelledby="ai-quote-heading" className="border-b border-hairline">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-12 px-6 py-24 sm:py-28 lg:grid-cols-2 lg:items-center">
        <div>
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            AI 물량산출
          </span>
          <h2
            id="ai-quote-heading"
            className="mt-4 text-3xl font-bold tracking-tight text-ink sm:text-4xl"
          >
            평수만 입력하면, AI가 물량을 산출합니다
          </h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
            프로젝트 유형과 면적을 입력하면 자재 물량(BOM)과 예상 견적을 1분 만에 받아볼 수
            있습니다. 도면을 올리면 더 정밀해집니다.
          </p>
          <div className="mt-8">
            <Button asChild size="lg">
              <Link href="/ai-quote">AI 견적 받기</Link>
            </Button>
          </div>
        </div>
        <div
          aria-hidden
          className="rounded-lg border border-hairline bg-white p-6 font-mono text-sm shadow-sm"
        >
          <div className="flex items-center justify-between border-b border-hairline pb-3 text-xs text-muted-foreground">
            <span>BOM 산출 결과</span>
            <span>예시</span>
          </div>
          <ul className="mt-4 space-y-2">
            {ROWS.map((r) => (
              <li key={r.name} className="flex justify-between">
                <span>{r.name}</span>
                <span className="tabular-nums">{r.qty}</span>
              </li>
            ))}
            <li className="flex justify-between border-t border-hairline pt-3 font-semibold text-ink">
              <span>예상 견적</span>
              <span className="tabular-nums">₩ 3,480,000</span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/components/landing/ai-quote-spotlight.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/landing/ai-quote-spotlight.tsx tests/components/landing/ai-quote-spotlight.test.tsx
git commit -m "feat(home): AI 견적 스포트라이트(BOM 목업) + 테스트"
```

---

### Task 5: PoSplitSpotlight 섹션 컴포넌트

**Files:**
- Create: `components/landing/po-split-spotlight.tsx`
- Test: `tests/components/landing/po-split-spotlight.test.tsx`

**Interfaces:**
- Consumes: `@/components/ui/button`, `next/link`.
- Produces: `export function PoSplitSpotlight(): JSX.Element`.

- [ ] **Step 1: 실패 테스트 작성**

`tests/components/landing/po-split-spotlight.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  ),
}));

import { PoSplitSpotlight } from "@/components/landing/po-split-spotlight";

afterEach(cleanup);

describe("PoSplitSpotlight", () => {
  it("renders heading, PO split copy and CTA", () => {
    render(<PoSplitSpotlight />);
    expect(
      screen.getByRole("heading", { name: /한 번의 주문, 공급사별 발주서로 자동 분할/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/발주서/).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /카탈로그 둘러보기/ })).toHaveAttribute("href", "/catalog");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/components/landing/po-split-spotlight.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: 컴포넌트 구현**

`components/landing/po-split-spotlight.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

const CART = ["타일 · A 공급사", "방수재 · B 공급사", "철물 · C 공급사"] as const;
const POS = [
  { id: "발주서 #A", supplier: "A 공급사" },
  { id: "발주서 #B", supplier: "B 공급사" },
  { id: "발주서 #C", supplier: "C 공급사" },
] as const;

export function PoSplitSpotlight() {
  return (
    <section aria-labelledby="po-split-heading" className="border-b border-hairline">
      <div className="mx-auto w-full max-w-6xl px-6 py-24 sm:py-28">
        <div className="max-w-2xl">
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            통합주문
          </span>
          <h2
            id="po-split-heading"
            className="mt-4 text-3xl font-bold tracking-tight text-ink sm:text-4xl"
          >
            한 번의 주문, 공급사별 발주서로 자동 분할
          </h2>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground">
            여러 공급사의 자재를 한 장바구니에 담아 주문하면, 시스템이 공급사별 발주서(PO)로
            나눠 전송합니다. 발주·입고·정산이 따로 놀지 않습니다.
          </p>
        </div>
        <div
          aria-hidden
          className="mt-12 grid grid-cols-1 items-stretch gap-6 sm:grid-cols-[1fr_auto_1fr]"
        >
          <div className="rounded-lg border border-hairline bg-white p-6">
            <p className="text-sm font-semibold text-ink">장바구니</p>
            <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
              {CART.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
          <div className="flex items-center justify-center text-2xl text-muted-foreground">
            <span className="hidden sm:inline">→</span>
            <span className="sm:hidden">↓</span>
          </div>
          <div className="space-y-3">
            {POS.map((p) => (
              <div key={p.id} className="rounded-lg border border-hairline bg-white p-4 text-sm">
                <span className="font-semibold text-ink">{p.id}</span> · {p.supplier}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-10">
          <Button asChild size="lg" variant="outline">
            <Link href="/catalog">카탈로그 둘러보기</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/components/landing/po-split-spotlight.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/landing/po-split-spotlight.tsx tests/components/landing/po-split-spotlight.test.tsx
git commit -m "feat(home): 통합주문 PO 분할 스포트라이트 + 테스트"
```

---

### Task 6: ClosingCta 섹션 컴포넌트

**Files:**
- Create: `components/landing/closing-cta.tsx`
- Test: `tests/components/landing/closing-cta.test.tsx`

**Interfaces:**
- Consumes: `@/components/ui/button`, `next/link`.
- Produces: `export function ClosingCta(): JSX.Element`.

- [ ] **Step 1: 실패 테스트 작성**

`tests/components/landing/closing-cta.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  ),
}));

import { ClosingCta } from "@/components/landing/closing-cta";

afterEach(cleanup);

describe("ClosingCta", () => {
  it("renders heading and both CTAs", () => {
    render(<ClosingCta />);
    expect(
      screen.getByRole("heading", { name: /지금 바로 견적을 받아보세요/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /AI 견적 받기/ })).toHaveAttribute("href", "/ai-quote");
    expect(screen.getByRole("link", { name: /카탈로그 둘러보기/ })).toHaveAttribute("href", "/catalog");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/components/landing/closing-cta.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: 컴포넌트 구현**

`components/landing/closing-cta.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function ClosingCta() {
  return (
    <section aria-labelledby="closing-heading">
      <div className="mx-auto w-full max-w-6xl px-6 py-28 text-center sm:py-32">
        <h2
          id="closing-heading"
          className="text-3xl font-bold tracking-tight text-ink sm:text-5xl"
        >
          지금 바로 견적을 받아보세요
        </h2>
        <p className="mx-auto mt-5 max-w-md text-base text-muted-foreground">
          AI가 현장에 필요한 자재 물량을 1분 만에 산출합니다.
        </p>
        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/ai-quote">AI 견적 받기</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/catalog">카탈로그 둘러보기</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/components/landing/closing-cta.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/landing/closing-cta.tsx tests/components/landing/closing-cta.test.tsx
git commit -m "feat(home): 클로징 CTA 섹션 + 테스트"
```

---

### Task 7: SiteFooter 컴포넌트

**Files:**
- Create: `components/site-footer.tsx`
- Test: `tests/components/site-footer.test.tsx`

**Interfaces:**
- Consumes: `next/link`.
- Produces: `export function SiteFooter(): JSX.Element`.

- [ ] **Step 1: 실패 테스트 작성**

`tests/components/site-footer.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  ),
}));

import { SiteFooter } from "@/components/site-footer";

afterEach(cleanup);

describe("SiteFooter", () => {
  it("renders product links and copyright", () => {
    render(<SiteFooter />);
    expect(screen.getByRole("link", { name: "카탈로그" })).toHaveAttribute("href", "/catalog");
    expect(screen.getByRole("link", { name: "공동구매" })).toHaveAttribute("href", "/group-buy");
    expect(screen.getByRole("link", { name: "사업자 인증" })).toHaveAttribute("href", "/login");
    expect(screen.getByText(/자재\. 인테리어·건축자재 통합 플랫폼/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/components/site-footer.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: 컴포넌트 구현**

`components/site-footer.tsx`:

```tsx
import Link from "next/link";

const COLUMNS = [
  {
    title: "제품",
    links: [
      { label: "카탈로그", href: "/catalog" },
      { label: "AI 견적", href: "/ai-quote" },
      { label: "공동구매", href: "/group-buy" },
      { label: "시세", href: "/price-intelligence" },
      { label: "현장 관리", href: "/sites" },
    ],
  },
  {
    title: "지원",
    links: [
      { label: "커뮤니티", href: "/community" },
      { label: "발주예측", href: "/forecast" },
      { label: "정산", href: "/finance" },
    ],
  },
  {
    title: "시작하기",
    links: [
      { label: "사업자 인증", href: "/login" },
      { label: "대시보드", href: "/dashboard" },
      { label: "도면 견적", href: "/drawing" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-hairline bg-paper">
      <div className="mx-auto w-full max-w-6xl px-6 py-14">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-1.5 font-extrabold text-ink">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-brand text-white">
                자
              </span>
              <span className="text-lg tracking-tight">자재</span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              인테리어부터 건축까지, 현장 자재를 한 곳에서.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h2 className="text-sm font-semibold text-ink">{col.title}</h2>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-ink hover:underline"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-12 border-t border-hairline pt-6 text-xs text-muted-foreground">
          © {new Date().getFullYear()} 자재. 인테리어·건축자재 통합 플랫폼.
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/components/site-footer.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/site-footer.tsx tests/components/site-footer.test.tsx
git commit -m "feat(shell): 미니멀 푸터 컴포넌트 + 테스트"
```

---

### Task 8: HomePage 조립 (풀블리드)

**Files:**
- Modify: `app/page.tsx` (전체 교체)
- Test: `tests/components/home-page.test.tsx`

**Interfaces:**
- Consumes: Task 2–6의 `Hero`/`CapabilityList`/`AiQuoteSpotlight`/`PoSplitSpotlight`/`ClosingCta`.
- Produces: `export default function HomePage(): JSX.Element`.

- [ ] **Step 1: 실패 테스트 작성**

`tests/components/home-page.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  ),
}));

import HomePage from "@/app/page";

afterEach(cleanup);

describe("HomePage", () => {
  it("assembles all premium landing sections", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("한 번에.");
    expect(screen.getByText("01")).toBeInTheDocument(); // capability list
    expect(screen.getByText(/BOM 산출 결과/)).toBeInTheDocument(); // ai-quote spotlight
    expect(
      screen.getByRole("heading", { name: /공급사별 발주서로 자동 분할/ }),
    ).toBeInTheDocument(); // po-split
    expect(
      screen.getByRole("heading", { name: /지금 바로 견적을 받아보세요/ }),
    ).toBeInTheDocument(); // closing
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/components/home-page.test.tsx`
Expected: FAIL — 현재 `app/page.tsx`에는 스포트라이트/번호목록이 없어 `getByText("01")` 등에서 실패.

- [ ] **Step 3: app/page.tsx 교체**

`app/page.tsx` 전체를 아래로 교체:

```tsx
import { Hero } from "@/components/landing/hero";
import { CapabilityList } from "@/components/landing/capability-list";
import { AiQuoteSpotlight } from "@/components/landing/ai-quote-spotlight";
import { PoSplitSpotlight } from "@/components/landing/po-split-spotlight";
import { ClosingCta } from "@/components/landing/closing-cta";

export default function HomePage() {
  return (
    <div className="full-bleed -my-5 bg-paper text-ink">
      <Hero />
      <CapabilityList />
      <AiQuoteSpotlight />
      <PoSplitSpotlight />
      <ClosingCta />
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/components/home-page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx tests/components/home-page.test.tsx
git commit -m "feat(home): 풀블리드 프리미엄 랜딩 조립"
```

---

### Task 9: 헤더 정제 (기능 불변, 스타일만)

**Files:**
- Modify: `components/site-header.tsx`
- Test: `tests/components/site-header.test.tsx`

**Interfaces:**
- Consumes: `@/lib/store/cart`(`useCart`), `next/navigation`(`usePathname`), `next/link`, `@/lib/utils`(`cn`). (모두 기존 그대로)
- Produces: 시각만 변경된 `SiteHeader`. NAV 배열·active 로직·cart 카운트 **불변**, `/login` "로그인" CTA 추가.

- [ ] **Step 1: 실패 테스트 작성**

`tests/components/site-header.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/store/cart", () => ({
  useCart: (selector: any) => selector({ lines: [] }),
}));

import { SiteHeader } from "@/components/site-header";

afterEach(cleanup);

describe("SiteHeader", () => {
  it("keeps nav links and adds a login CTA", () => {
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: /카탈로그/ })).toHaveAttribute("href", "/catalog");
    expect(screen.getByRole("link", { name: /AI견적/ })).toHaveAttribute("href", "/ai-quote");
    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/login");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/components/site-header.test.tsx`
Expected: FAIL — `로그인` CTA가 아직 없어 `getByRole("link",{name:"로그인"})`에서 실패.

- [ ] **Step 3: site-header.tsx 정제**

`components/site-header.tsx`에서 **import 블록·`NAV` 배열·`usePathname`/`useCart` 로직은 그대로 두고**, `return (...)` JSX만 아래로 교체:

```tsx
  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-paper/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-6">
        <Link href="/" className="flex items-center gap-1.5 font-extrabold text-ink">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-brand text-white">
            자
          </span>
          <span className="text-lg tracking-tight">자재</span>
        </Link>

        <nav className="flex items-center gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "relative flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-ink",
                  active && "text-ink",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-x-2.5 -bottom-[1px] h-0.5 bg-brand"
                  />
                )}
              </Link>
            );
          })}
          <Link
            href="/cart"
            className={cn(
              "relative flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-ink",
              pathname.startsWith("/cart") && "text-ink",
            )}
          >
            <ShoppingCart className="h-4 w-4" />
            {count > 0 && (
              <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                {count}
              </span>
            )}
          </Link>
          <Link
            href="/login"
            className="ml-1 hidden rounded-md border border-hairline px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-muted sm:inline-flex"
          >
            로그인
          </Link>
        </nav>
      </div>
    </header>
  );
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/components/site-header.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/site-header.tsx tests/components/site-header.test.tsx
git commit -m "feat(shell): 헤더 건축가풍 정제(밑줄 active + 로그인 CTA), 기능 불변"
```

---

### Task 10: 푸터 전역 마운트 + sticky-bottom 레이아웃

**Files:**
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: Task 7의 `SiteFooter`.

- [ ] **Step 1: providers 래퍼 확인**

Run: `cat app/providers.tsx`
Expected: `Providers`가 DOM 래퍼 div 없이 context provider만 렌더하는지 확인. div를 추가한다면 그 div에 `flex min-h-dvh flex-col`을 적용해야 함(아래는 Providers가 DOM을 추가하지 않는 일반적 경우 기준).

- [ ] **Step 2: layout.tsx 수정**

`app/layout.tsx`에 `SiteFooter` import 추가:

```tsx
import { SiteFooter } from "@/components/site-footer";
```

`<body>`와 내부 구조를 아래로 교체(헤더·main은 유지, 푸터 추가 + flex 컬럼):

```tsx
  return (
    <html lang="ko">
      <body className="flex min-h-dvh flex-col">
        <Providers>
          <SiteHeader />
          <main className="container-app flex-1 py-5">{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
```

> Providers가 wrapper div를 렌더하면 flex가 헤더/메인/푸터에 전달되지 않으므로, 그 경우 `flex min-h-dvh flex-col`을 Providers 내부 최상위 div로 옮긴다.

- [ ] **Step 3: 빌드로 검증 (레이아웃은 jsdom 단위테스트 부적합 — 빌드로 게이트)**

Run: `npm run build`
Expected: exit 0, `/` 정적 생성 성공.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx
git commit -m "feat(shell): 푸터 전역 마운트 + sticky-bottom 레이아웃"
```

---

### Task 11: 전체 검증 게이트 + 내부 페이지 무손상 확인

**Files:** 없음(검증 전용). 발견된 문제만 해당 Task로 회귀 수정.

- [ ] **Step 1: 타입체크**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 2: 린트**

Run: `npm run lint`
Expected: 0 errors/warnings(신규 파일 포함). `any` 사용은 테스트 mock 한정(필요 시 `// eslint-disable-next-line` 대신 mock 시그니처 정리).

- [ ] **Step 3: 전체 테스트**

Run: `npm run test`
Expected: 기존 + 신규 컴포넌트 테스트 전부 통과.

- [ ] **Step 4: 프로덕션 빌드**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 5: 내부 페이지 무손상 확인(diff 검토)**

Run: `git diff main --stat`
Expected: 변경 파일이 계획 범위(app/page.tsx, app/layout.tsx, app/globals.css, tailwind.config.ts, components/site-header.tsx, components/site-footer.tsx, components/landing/*, tests/components/*, docs/*)에 한정. `app/(catalog|ai-quote|sites|...)` 등 내부 라우트 파일 변경 0건.

- [ ] **Step 6: 시각 검증(권장)**

`npm run dev` 후 Playwright/브라우저로 `/`를 데스크톱·모바일 폭에서 스크린샷:
- 풀블리드 히어로가 헤더 바로 아래 flush, 가로 스크롤 없음.
- 캔버스 오프화이트·헤어라인 구분선·블루 포인트 확인.
- 내부 페이지(예: `/catalog`) 레이아웃 변화 없음(헤더/푸터만 정제).

---

## Self-Review

**1. Spec coverage:**
- 풀블리드 탈출(스펙 §2) → Task 1(.full-bleed) + Task 8.
- 팔레트/토큰 가산(§3) → Task 1.
- 페이지 6구성(§4): Hero/Capability/AI/PO/Closing → Task 2–6, 8 / Footer → Task 7,10.
- 헤더 정제(§5) → Task 9.
- 파일 목록(§6) → Task별 매핑 일치.
- 데이터/에러(§8): 정적, 검증 대상 없음 → 반영.
- 접근성/반응형(§9) → aria-labelledby·aria-hidden·reduced-motion(Task 1)·sm/lg 분기.
- 테스트 전략(§10) → Task 2–9 TDD + Task 11 게이트.
- 수용 기준(§11) → Task 11 Step 5(무손상)·게이트 충족.

**2. Placeholder scan:** TBD/TODO/"적절히"류 없음. 모든 코드 블록 완전. ✅

**3. Type consistency:** 컴포넌트 export 이름(`Hero`,`CapabilityList`,`AiQuoteSpotlight`,`PoSplitSpotlight`,`ClosingCta`,`SiteFooter`)이 Task 8/10 import와 정확히 일치. 경로 `@/components/landing/*`,`@/components/site-footer` 일치. ✅

**4. 주의:** Task 10 Step 1에서 `providers.tsx` 래퍼 여부 확인(flex 위치 결정). Task 2의 `text-balance`는 Tailwind 3.4 지원 유틸(미지원 시 무시되어도 무해).
