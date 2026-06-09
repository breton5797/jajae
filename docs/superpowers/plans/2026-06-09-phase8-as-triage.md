# AS 자동 트리아지 (After-Service Auto-Triage) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** AS요청(`as_requests`) 사유를 분류기(Claude + 결정론 폴백)가 제안하면, DB 원자 RPC가 정책(킬스위치·신뢰도·책임소재)을 재검증해 **명백한 공급사/배송 귀책·고신뢰 AS만 자동 예약**(requested→scheduled)하고 나머지는 사람에게 에스컬레이션한다(append-only 감사 + 관리자 가역).

**Architecture:** Phase 8-1 반품 트리아지 패턴 재사용 — 순수 함수(`lib/triage/as.ts`)와 plpgsql RPC가 동일 규칙을 양쪽에서 강제(defense in depth), `security definer` + `for update` + fail-closed. 자동 결과는 `auto_schedule` 하나뿐. **금액/상한 없음**(8-1과의 핵심 차이).

**Tech Stack:** Next.js 14 · TypeScript(strict) · Supabase(Postgres/RLS/plpgsql) · zod · `@anthropic-ai/sdk`(폴백 격리) · Vitest + PGlite.

**Spec:** `docs/superpowers/specs/2026-06-09-jajae-as-triage-design.md`
**기반:** 이 브랜치(`feat/phase8-as-triage`)는 8-1(`feat/phase8-return-triage`) 위에 있어 `lib/triage/schema.ts`(`ReturnClassificationSchema`)·마이그레이션 `0013`을 포함한다. AS 마이그레이션은 **`0014`**.

**검증된 재사용 패턴:**
- 8-1 마이그레이션 `supabase/migrations/0013_triage.sql` (RPC/RLS/append-only 구조 — 그대로 모방, AS 치환)
- `public.prevent_audit_mutation()`(0008) · `public.is_admin()`(0002) · `ReturnClassificationSchema`(`lib/triage/schema.ts`)
- 8-1 파일: `lib/triage/index.ts`·`anthropic.ts`, `lib/data/triage.ts`, `app/api/triage/{route,[id]/route}.ts`, `components/triage-controls.tsx`, `app/admin/triage/page.tsx`, `tests/{unit,db,e2e}/*triage*`
- 테스트 하니스 `tests/db/harness.ts` (`createTestDb`·`seedUser`·`asUser`·`asService`)

**검증된 사실:** `as_requests(id, order_item_id, contractor_id, site_id, issue, status, scheduled_date)` · `as_status`=requested|scheduled|in_progress|completed|rejected · seed products 17·suppliers 1 · `as_update` RLS는 시공사/공급사/admin self-update 허용(spec §12).

---

## File Structure

| 파일 | 책임 |
|---|---|
| `lib/types.ts` (수정) | `AsTriagePolicy`·`AsTriageOutcome`·`AsTriageEval` 타입 |
| `lib/triage/as.ts` (신규) | 순수: `decideAsTriage`·`classifyAsRequestFallback` (분류기 출력은 `ReturnClassification` 재사용) |
| `lib/triage/as-anthropic.ts` (신규) | `classifyAsRequestWithAI` (무키/에러 null) |
| `supabase/migrations/0014_as_triage.sql` (신규) | 테이블·RLS·append-only·정책 시드·RPC 3종·grants |
| `lib/data/triage.ts` (수정) | `loadAsTriageConsole()` 추가 |
| `app/api/as-triage/route.ts` (신규) | POST 자동실행 + PATCH 정책 |
| `app/api/as-triage/[id]/route.ts` (신규) | POST 예약/거부/가역 |
| `components/as-triage-controls.tsx` (신규) | `RunAsTriageButton`·`AsTriagePolicyForm`·`AsTriageRowActions` |
| `app/admin/triage/page.tsx` (수정) | AS 트리아지 섹션 추가 |
| `tests/unit/as-triage.test.ts` (신규) | `decideAsTriage`·폴백 |
| `tests/db/phase8-as-triage.test.ts` (신규) | RLS·RPC·idempotency·가역·append-only·fail-closed |
| `tests/e2e/phase8-as-flow.test.ts` (신규) | 접수→자동트리아지→수동→가역 |

---

## Task 1: AS 타입 + 순수 규칙 모듈 + 단위 테스트 (TDD)

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/triage/as.ts`
- Test: `tests/unit/as-triage.test.ts`

- [ ] **Step 1: 타입 추가** — `lib/types.ts` 끝에 추가:

```typescript
/* ---------- Phase 8-2: AS triage ---------- */

export interface AsTriagePolicy {
  id: string;
  min_confidence: number;
  enabled: boolean;
  created_at: string;
}

export type AsTriageOutcome = "auto_schedule" | "escalate";

export interface AsTriageEval {
  outcome: AsTriageOutcome;
  reasons: string[];
}
```

- [ ] **Step 2: 실패하는 단위 테스트 작성** — `tests/unit/as-triage.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { decideAsTriage, classifyAsRequestFallback } from "@/lib/triage/as";
import type { ReturnClassification, AsTriagePolicy } from "@/lib/types";

const policy = (over: Partial<AsTriagePolicy> = {}): AsTriagePolicy => ({
  id: "pol",
  min_confidence: over.min_confidence ?? 0.8,
  enabled: over.enabled ?? true,
  created_at: "2026-01-01T00:00:00Z",
});

const cls = (over: Partial<ReturnClassification> = {}): ReturnClassification => ({
  responsibility: over.responsibility ?? "supplier",
  decision: over.decision ?? "approve",
  confidence: over.confidence ?? 0.9,
  rationale: over.rationale ?? "불량",
});

describe("decideAsTriage", () => {
  it("공급사 귀책 + 고신뢰 → auto_schedule", () => {
    expect(decideAsTriage(cls(), policy()).outcome).toBe("auto_schedule");
  });
  it("배송 귀책도 자동 예약 대상", () => {
    expect(decideAsTriage(cls({ responsibility: "delivery" }), policy()).outcome).toBe("auto_schedule");
  });
  it("시공사 귀책 → escalate", () => {
    expect(decideAsTriage(cls({ responsibility: "contractor" }), policy()).outcome).toBe("escalate");
  });
  it("모호 책임 → escalate", () => {
    expect(decideAsTriage(cls({ responsibility: "ambiguous" }), policy()).outcome).toBe("escalate");
  });
  it("approve 아님 → escalate", () => {
    expect(decideAsTriage(cls({ decision: "ambiguous" }), policy()).outcome).toBe("escalate");
  });
  it("신뢰도 임계 미만 → escalate", () => {
    expect(decideAsTriage(cls({ confidence: 0.79 }), policy({ min_confidence: 0.8 })).outcome).toBe("escalate");
  });
  it("킬스위치 → escalate", () => {
    expect(decideAsTriage(cls(), policy({ enabled: false })).outcome).toBe("escalate");
  });
});

describe("classifyAsRequestFallback", () => {
  it("명백한 결함 신호 → approve, 신뢰도 ≥ 0.8", () => {
    const r = classifyAsRequestFallback("타일 누수 하자 발생");
    expect(r.decision).toBe("approve");
    expect(r.confidence).toBeGreaterThanOrEqual(0.8);
  });
  it("신호 없음 → ambiguous, 저신뢰", () => {
    const r = classifyAsRequestFallback("문의드립니다");
    expect(r.decision).toBe("ambiguous");
    expect(r.confidence).toBeLessThan(0.8);
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run tests/unit/as-triage.test.ts`
Expected: FAIL — `Cannot find module '@/lib/triage/as'`.

- [ ] **Step 4: 순수 모듈 작성** — `lib/triage/as.ts`:

```typescript
/**
 * lib/triage/as — AS요청 트리아지 결정 규칙. 순수; lib/types에만 의존.
 * 분류기(AI/폴백)는 제안만. 유일한 자동 결과는 auto_schedule이고, 그 외(시공사귀책·모호·
 * 비-approve·저신뢰·킬스위치)는 escalate. 분류기 출력 형태는 8-1의 ReturnClassification 재사용.
 */
import type { ReturnClassification, AsTriageEval, AsTriagePolicy } from "@/lib/types";

/** 자동 예약 허용 책임소재(공급사·배송 귀책만). 시공사 귀책/모호는 자동 제외. */
const AUTO_RESPONSIBILITIES: readonly string[] = ["supplier", "delivery"];

export function decideAsTriage(
  c: ReturnClassification,
  policy: Pick<AsTriagePolicy, "enabled" | "min_confidence">,
): AsTriageEval {
  const reasons: string[] = [];
  if (!policy.enabled) {
    reasons.push("AS 트리아지 자동화 중지(킬스위치)");
    return { outcome: "escalate", reasons };
  }
  if (c.decision !== "approve") {
    reasons.push("명백한 결함성 AS가 아님 — 사람 검토 필요");
    return { outcome: "escalate", reasons };
  }
  if (!AUTO_RESPONSIBILITIES.includes(c.responsibility)) {
    reasons.push("공급사/배송 귀책이 아님 — 자동 예약 제외");
    return { outcome: "escalate", reasons };
  }
  if (c.confidence < policy.min_confidence) {
    reasons.push(`신뢰도(${c.confidence})가 임계값(${policy.min_confidence}) 미만`);
    return { outcome: "escalate", reasons };
  }
  reasons.push("정책 범위 내 자동 예약");
  return { outcome: "auto_schedule", reasons };
}

const AS_SIGNALS = [
  "불량", "하자", "파손", "오작동", "누수", "균열", "소음", "고장", "작동", "결함",
];

/** 키 없음/AI 오류 시 결정론 폴백. 보수적: 명백한 결함 신호만 approve, 그 외 ambiguous. 절대 throw 안 함. */
export function classifyAsRequestFallback(issue: string): ReturnClassification {
  const text = issue.trim();
  const hit = AS_SIGNALS.find((s) => text.includes(s));
  if (hit) {
    return {
      responsibility: "supplier",
      decision: "approve",
      confidence: 0.8,
      rationale: `AS 사유에 명백한 결함 신호("${hit}") 포함 — 폴백 분류`,
    };
  }
  return {
    responsibility: "ambiguous",
    decision: "ambiguous",
    confidence: 0.3,
    rationale: "명백한 결함 신호 없음 — 사람 검토 필요(보수적 폴백)",
  };
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run tests/unit/as-triage.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: 커밋**

```bash
git add lib/types.ts lib/triage/as.ts tests/unit/as-triage.test.ts
git commit -m "feat(as-triage): AS 순수 결정 규칙 + 폴백 분류기 (TDD)"
```

---

## Task 2: AS AI 분류기

**Files:**
- Create: `lib/triage/as-anthropic.ts`

> 무네트워크 테스트 제외(8-1 `anthropic.ts`와 동일 — 키 없으면 null).

- [ ] **Step 1: 작성** — `lib/triage/as-anthropic.ts`:

```typescript
/**
 * Anthropic 기반 AS요청 분류. 키 미설정/오류 시 null → 호출자가 결정론 폴백으로 전환.
 * 테스트에서 실행하지 않음(무네트워크) — 격리·방어적.
 */
import Anthropic from "@anthropic-ai/sdk";
import { anthropicApiKey } from "@/lib/env";
import type { ReturnClassification } from "@/lib/types";
import { ReturnClassificationSchema } from "./schema";

const SYSTEM_PROMPT = `당신은 한국 B2B 건축자재 플랫폼의 AS(애프터서비스) 분쟁 분류 전문가입니다.
AS 사유(issue)와 정보를 받아 책임 소재와 처리 제안을 판단합니다.
반드시 아래 JSON 스키마로만 답하세요. 설명/마크다운 금지.
{"responsibility":"supplier|delivery|contractor|ambiguous","decision":"approve|reject|ambiguous","confidence":0과1사이숫자,"rationale":"한 줄 근거"}
- supplier=공급사 귀책(제품 불량/하자/오작동), delivery=배송 귀책(운송 파손), contractor=시공사 귀책(시공 실수/오사용), ambiguous=불명확
- decision=approve는 명백한 결함성 AS(방문 처리 타당)일 때만. 불명확하면 ambiguous(거부는 사람이 판단).`;

export async function classifyAsRequestWithAI(input: {
  issue: string;
  productName: string;
}): Promise<ReturnClassification | null> {
  const apiKey = anthropicApiKey();
  if (!apiKey) return null;
  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(input) }],
    });
    const block = response.content[0];
    if (!block || block.type !== "text") return null;
    const parsed = ReturnClassificationSchema.safeParse(JSON.parse(block.text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: 타입체크** — Run: `npx tsc --noEmit` → 0 errors.
- [ ] **Step 3: 커밋**

```bash
git add lib/triage/as-anthropic.ts
git commit -m "feat(as-triage): AS Claude 분류기 + 폴백 게이트"
```

---

## Task 3: 마이그레이션 — 테이블·RLS·append-only·시드 (TDD)

**Files:**
- Create: `supabase/migrations/0014_as_triage.sql`
- Test: `tests/db/phase8-as-triage.test.ts`

- [ ] **Step 1: 실패하는 DB 테스트(스캐폴딩 + RLS/append-only) 작성** — `tests/db/phase8-as-triage.test.ts`:

```typescript
/**
 * Phase 8-2 — AS 자동 트리아지 (plpgsql, 원자적). 분류기는 제안, DB가 정책 재검증해 결정.
 * 자동은 '공급사/배송 귀책 × 고신뢰'의 자동 예약뿐, 그 외 escalate. fail-closed.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./harness";

describe("Phase 8-2 AS triage", () => {
  let t: TestDb;
  let admin: string;

  async function seedAsRequest(opts: {
    contractor: string;
    issue?: string;
    status?: string;
  }): Promise<string> {
    await t.asService();
    const prod = (await t.db.query<{ id: string }>("select id from products limit 1")).rows[0]!.id;
    const sup = (await t.db.query<{ id: string }>("select id from suppliers limit 1")).rows[0]!.id;
    const order = (await t.db.query<{ id: string }>(
      "insert into orders (contractor_id, payment_method, status, subtotal, total) values ($1,'escrow','pending',100000,100000) returning id",
      [opts.contractor],
    )).rows[0]!.id;
    const po = (await t.db.query<{ id: string }>(
      "insert into purchase_orders (order_id, supplier_id, status, subtotal) values ($1,$2,'pending',100000) returning id",
      [order, sup],
    )).rows[0]!.id;
    const oi = (await t.db.query<{ id: string }>(
      "insert into order_items (po_id, product_id, name_snapshot, unit_price_snapshot, qty, line_total) values ($1,$2,'타일',100000,1,100000) returning id",
      [po, prod],
    )).rows[0]!.id;
    const as = (await t.db.query<{ id: string }>(
      "insert into as_requests (order_item_id, contractor_id, issue, status) values ($1,$2,$3,$4) returning id",
      [oi, opts.contractor, opts.issue ?? "불량", opts.status ?? "requested"],
    )).rows[0]!.id;
    return as;
  }

  async function setPolicy(opts: { enabled?: boolean; minConf?: number }) {
    await t.asService();
    await t.db.query(
      "update as_triage_policies set enabled=$1, min_confidence=$2 where singleton=true",
      [opts.enabled ?? true, opts.minConf ?? 0.8],
    );
  }

  async function autoResolve(asId: string, decision: string, resp: string, conf: number) {
    return t.db.query<{ d: string }>(
      "select as_triage_auto_resolve($1,$2,$3,$4,$5) as d",
      [asId, decision, resp, conf, "테스트 사유"],
    );
  }

  beforeAll(async () => {
    t = await createTestDb();
    admin = await t.seedUser({ role: "admin", companyName: "운영" });
  });
  afterAll(async () => {
    await t.close();
  });

  it("정책 시드가 정확히 1행(기본 비활성)", async () => {
    await t.asService();
    const r = await t.db.query<{ n: number; enabled: boolean }>(
      "select count(*)::int n, bool_or(enabled) enabled from as_triage_policies",
    );
    expect(r.rows[0]!.n).toBe(1);
    expect(r.rows[0]!.enabled).toBe(false);
  });

  it("as_triage_policies는 관리자만 접근", async () => {
    const c = await t.seedUser({ role: "contractor" });
    await t.asUser(c);
    expect((await t.db.query("select * from as_triage_policies")).rows.length).toBe(0);
    await t.asUser(admin);
    expect((await t.db.query("select * from as_triage_policies")).rows.length).toBe(1);
  });

  it("시공사는 본인 AS 트리아지 결과만 조회", async () => {
    const a = await t.seedUser({ role: "contractor" });
    const b = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: true });
    const as = await seedAsRequest({ contractor: a, issue: "불량" });
    await t.asUser(admin);
    await autoResolve(as, "schedule", "contractor", 0.9); // 시공사귀책 → escalate 로그 생성
    await t.asUser(b);
    expect((await t.db.query("select * from as_triage_decisions where as_request_id=$1", [as])).rows.length).toBe(0);
    await t.asUser(a);
    expect((await t.db.query("select * from as_triage_decisions where as_request_id=$1", [as])).rows.length).toBe(1);
  });

  it("as_triage_decisions는 append-only(update/delete 차단)", async () => {
    const a = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: true });
    const as = await seedAsRequest({ contractor: a });
    await t.asUser(admin);
    await autoResolve(as, "schedule", "supplier", 0.9);
    await t.asService();
    const id = (await t.db.query<{ id: string }>("select id from as_triage_decisions where as_request_id=$1", [as])).rows[0]!.id;
    await expect(t.db.query("update as_triage_decisions set rationale='x' where id=$1", [id])).rejects.toThrow();
    await expect(t.db.query("delete from as_triage_decisions where id=$1", [id])).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/db/phase8-as-triage.test.ts`
Expected: FAIL — `relation "as_triage_policies" does not exist`.

- [ ] **Step 3: 마이그레이션 작성 (테이블·시드·append-only·RLS)** — `supabase/migrations/0014_as_triage.sql`:

```sql
-- 자재(Jajae) Phase 8-2 — AS 자동 트리아지. ADDITIVE.
-- 분류기는 제안만; DB가 정책을 재검증해 결정한다. 자동 결과는 '공급사/배송 귀책·고신뢰'의 자동
-- 예약(requested→scheduled)뿐이고 그 외는 escalate(status 유지 + 로그). fail-closed: 정책 행 없으면
-- raise. as_triage_decisions는 append-only(prevent_audit_mutation 재사용). 금액/상한 개념 없음.

-- ---------- tables ----------
create table if not exists as_triage_policies (
  id             uuid primary key default gen_random_uuid(),
  singleton      boolean not null default true,
  min_confidence numeric not null default 0.8 check (min_confidence >= 0 and min_confidence <= 1),
  enabled        boolean not null default false,
  created_at     timestamptz not null default now(),
  constraint as_triage_policies_singleton unique (singleton)
);

create table if not exists as_triage_decisions (
  id             uuid primary key default gen_random_uuid(),
  as_request_id  uuid not null references as_requests(id) on delete cascade,
  source         text not null check (source in ('auto','admin','reversal')),
  decision       text not null check (decision in ('schedule','reject','escalate')),
  responsibility text not null check (responsibility in ('supplier','delivery','contractor','ambiguous')),
  confidence     numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  rationale      text not null default '',
  reversed_of    uuid references as_triage_decisions(id),
  actor          uuid references profiles(id),
  created_at     timestamptz not null default now()
);
create index if not exists as_triage_decisions_req_idx on as_triage_decisions(as_request_id);

-- 정책 단일 행 시드(비활성)
insert into as_triage_policies (singleton, min_confidence, enabled)
  values (true, 0.8, false)
  on conflict (singleton) do nothing;

-- ---------- append-only audit (0008 트리거 함수 재사용) ----------
drop trigger if exists trg_as_triage_decisions_noupd on as_triage_decisions;
create trigger trg_as_triage_decisions_noupd
  before update or delete on as_triage_decisions
  for each row execute function public.prevent_audit_mutation();

-- ---------- RLS ----------
alter table as_triage_policies  enable row level security;
alter table as_triage_decisions enable row level security;

create policy as_triagepol_all on as_triage_policies for all
  using (public.is_admin()) with check (public.is_admin());

create policy as_triagedec_select on as_triage_decisions for select
  using (
    public.is_admin()
    or exists (
      select 1 from as_requests r
      where r.id = as_triage_decisions.as_request_id and r.contractor_id = auth.uid()
    )
  );
```

- [ ] **Step 4: 테스트 통과 확인 (RPC 비의존 부분)**

Run: `npx vitest run tests/db/phase8-as-triage.test.ts`
Expected: 정책 시드 1행 + 관리자 전용 테스트 PASS. (RPC 호출 테스트는 Task 4에서 GREEN.)

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/0014_as_triage.sql tests/db/phase8-as-triage.test.ts
git commit -m "feat(as-triage): AS triage 테이블·RLS·append-only·정책 시드"
```

---

## Task 4: 자동 트리아지 RPC (TDD)

**Files:**
- Modify: `supabase/migrations/0014_as_triage.sql`
- Modify: `tests/db/phase8-as-triage.test.ts`

- [ ] **Step 1: 실패하는 RPC 테스트 추가** — describe 닫힘(`});`) 직전에 추가:

```typescript
  it("auto: 공급사 귀책 + 고신뢰 → scheduled + auto 로그(원자)", async () => {
    const a = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: true, minConf: 0.8 });
    const as = await seedAsRequest({ contractor: a });
    await t.asUser(admin);
    expect((await autoResolve(as, "schedule", "supplier", 0.9)).rows[0]!.d).toBe("schedule");
    await t.asService();
    expect((await t.db.query("select status from as_requests where id=$1", [as])).rows[0]).toEqual({ status: "scheduled" });
    expect((await t.db.query("select 1 from as_triage_decisions where as_request_id=$1 and source='auto' and decision='schedule'", [as])).rows.length).toBe(1);
  });

  it("auto: 배송 귀책도 자동 예약", async () => {
    const a = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: true });
    const as = await seedAsRequest({ contractor: a });
    await t.asUser(admin);
    expect((await autoResolve(as, "schedule", "delivery", 0.9)).rows[0]!.d).toBe("schedule");
  });

  it("auto: 시공사 귀책 → escalate(status 유지)", async () => {
    const a = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: true });
    const as = await seedAsRequest({ contractor: a });
    await t.asUser(admin);
    expect((await autoResolve(as, "schedule", "contractor", 0.95)).rows[0]!.d).toBe("escalate");
    await t.asService();
    expect((await t.db.query("select status from as_requests where id=$1", [as])).rows[0]).toEqual({ status: "requested" });
  });

  it("auto: 저신뢰 → escalate", async () => {
    const a = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: true, minConf: 0.8 });
    const as = await seedAsRequest({ contractor: a });
    await t.asUser(admin);
    expect((await autoResolve(as, "schedule", "supplier", 0.5)).rows[0]!.d).toBe("escalate");
  });

  it("auto: 킬스위치 → escalate", async () => {
    const a = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: false });
    const as = await seedAsRequest({ contractor: a });
    await t.asUser(admin);
    expect((await autoResolve(as, "schedule", "supplier", 0.99)).rows[0]!.d).toBe("escalate");
  });

  it("auto: 이미 트리아지된 건 재호출 raise(idempotency)", async () => {
    const a = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: true });
    const as = await seedAsRequest({ contractor: a });
    await t.asUser(admin);
    await autoResolve(as, "schedule", "supplier", 0.9);
    await expect(autoResolve(as, "schedule", "supplier", 0.9)).rejects.toThrow(/already triaged/);
  });

  it("auto: requested 아닌 건 raise(not actionable)", async () => {
    const a = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: true });
    const as = await seedAsRequest({ contractor: a, status: "scheduled" });
    await t.asUser(admin);
    await expect(autoResolve(as, "schedule", "supplier", 0.9)).rejects.toThrow(/not actionable/);
  });

  it("auto: 비관리자/비서비스 호출 unauthorized", async () => {
    const a = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: true });
    const as = await seedAsRequest({ contractor: a });
    await t.asUser(a);
    await expect(autoResolve(as, "schedule", "supplier", 0.9)).rejects.toThrow(/unauthorized/i);
  });

  it("auto: 정책 행 없으면 fail-closed raise", async () => {
    const a = await t.seedUser({ role: "contractor" });
    await t.asService();
    await t.db.query("delete from as_triage_policies");
    const as = await seedAsRequest({ contractor: a });
    await t.asUser(admin);
    await expect(autoResolve(as, "schedule", "supplier", 0.9)).rejects.toThrow(/not configured/);
    await t.asService();
    await t.db.query("insert into as_triage_policies (singleton, min_confidence, enabled) values (true,0.8,false)");
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/db/phase8-as-triage.test.ts`
Expected: FAIL — `function as_triage_auto_resolve(...) does not exist`.

- [ ] **Step 3: 자동 RPC를 마이그레이션에 추가** — `0014_as_triage.sql` 끝에 추가:

```sql
-- ---------- RPC: 자동 경로 (DB가 schedule vs escalate 결정) ----------
create or replace function public.as_triage_auto_resolve(
  p_as_request_id uuid,
  p_proposed_decision text,
  p_responsibility text,
  p_confidence numeric,
  p_rationale text
) returns text
  language plpgsql security definer set search_path = public as $$
declare
  v_status   text;
  v_enabled  boolean;
  v_minconf  numeric;
  v_decision text;
begin
  if not (auth.role() = 'service_role' or public.is_admin()) then
    raise exception 'unauthorized';
  end if;

  select status into v_status from as_requests where id = p_as_request_id for update;
  if not found then raise exception 'as request not found'; end if;
  if exists (select 1 from as_triage_decisions where as_request_id = p_as_request_id) then
    raise exception 'as request already triaged';
  end if;
  if v_status <> 'requested' then
    raise exception 'as request not actionable (status=%)', v_status;
  end if;

  select enabled, min_confidence into v_enabled, v_minconf
    from as_triage_policies where singleton = true;
  if not found then raise exception 'as triage policy not configured'; end if;

  if v_enabled
     and p_proposed_decision = 'schedule'
     and p_responsibility in ('supplier','delivery')
     and p_confidence >= v_minconf then
    v_decision := 'schedule';
  else
    v_decision := 'escalate';
  end if;

  if v_decision = 'schedule' then
    update as_requests set status = 'scheduled' where id = p_as_request_id;
  end if;

  insert into as_triage_decisions
    (as_request_id, source, decision, responsibility, confidence, rationale)
    values (p_as_request_id, 'auto', v_decision, p_responsibility, p_confidence, p_rationale);

  return v_decision;
end;
$$;
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/db/phase8-as-triage.test.ts`
Expected: PASS (Task 3 포함 전부).

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/0014_as_triage.sql tests/db/phase8-as-triage.test.ts
git commit -m "feat(as-triage): 자동 트리아지 RPC(DB 권위·fail-closed) + 테스트"
```

---

## Task 5: 관리자 수동·가역 RPC + grants (TDD)

**Files:**
- Modify: `supabase/migrations/0014_as_triage.sql`
- Modify: `tests/db/phase8-as-triage.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가** — describe 닫힘 직전에 추가:

```typescript
  it("admin: 수동 예약(시공사귀책 오버라이드) 기록", async () => {
    const a = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: true });
    const as = await seedAsRequest({ contractor: a });
    await t.asUser(admin);
    await autoResolve(as, "schedule", "contractor", 0.99); // escalate
    await t.db.query("select as_triage_admin_resolve($1,'schedule')", [as]);
    await t.asService();
    expect((await t.db.query("select status from as_requests where id=$1", [as])).rows[0]).toEqual({ status: "scheduled" });
    expect((await t.db.query("select 1 from as_triage_decisions where as_request_id=$1 and source='admin' and decision='schedule'", [as])).rows.length).toBe(1);
  });

  it("admin: 비관리자 호출 unauthorized", async () => {
    const a = await t.seedUser({ role: "contractor" });
    const as = await seedAsRequest({ contractor: a });
    await t.asUser(a);
    await expect(t.db.query("select as_triage_admin_resolve($1,'reject')", [as])).rejects.toThrow(/unauthorized/i);
  });

  it("reverse: 예약 되돌리면 requested 원복 + 상쇄 로그, 재가역 raise", async () => {
    const a = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: true });
    const as = await seedAsRequest({ contractor: a });
    await t.asUser(admin);
    await autoResolve(as, "schedule", "supplier", 0.9); // scheduled
    await t.db.query("select as_triage_reverse($1)", [as]);
    await t.asService();
    expect((await t.db.query("select status from as_requests where id=$1", [as])).rows[0]).toEqual({ status: "requested" });
    expect((await t.db.query("select 1 from as_triage_decisions where as_request_id=$1 and source='reversal'", [as])).rows.length).toBe(1);
    await t.asUser(admin);
    await expect(t.db.query("select as_triage_reverse($1)", [as])).rejects.toThrow(/no active resolution/);
  });

  it("reverse: in_progress/completed 건은 raise", async () => {
    const a = await t.seedUser({ role: "contractor" });
    const as1 = await seedAsRequest({ contractor: a, status: "in_progress" });
    const as2 = await seedAsRequest({ contractor: a, status: "completed" });
    await t.asUser(admin);
    await expect(t.db.query("select as_triage_reverse($1)", [as1])).rejects.toThrow(/cannot reverse/);
    await expect(t.db.query("select as_triage_reverse($1)", [as2])).rejects.toThrow(/cannot reverse/);
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/db/phase8-as-triage.test.ts`
Expected: FAIL — `function as_triage_admin_resolve(...) does not exist`.

- [ ] **Step 3: 수동·가역 RPC + grants 추가** — `0014_as_triage.sql` 끝에 추가:

```sql
-- ---------- RPC: 관리자 수동 결정 ----------
create or replace function public.as_triage_admin_resolve(
  p_as_request_id uuid,
  p_decision text
) returns void
  language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  if not (auth.role() = 'service_role' or public.is_admin()) then
    raise exception 'unauthorized';
  end if;
  if p_decision not in ('schedule','reject') then
    raise exception 'invalid decision %', p_decision;
  end if;
  select status into v_status from as_requests where id = p_as_request_id for update;
  if not found then raise exception 'as request not found'; end if;
  if v_status <> 'requested' then
    raise exception 'as request not actionable (status=%)', v_status;
  end if;

  update as_requests
    set status = (case when p_decision = 'schedule' then 'scheduled' else 'rejected' end)::as_status
    where id = p_as_request_id;
  insert into as_triage_decisions
    (as_request_id, source, decision, responsibility, confidence, rationale, actor)
    values (p_as_request_id, 'admin', p_decision, 'ambiguous', 1, '관리자 수동 결정', auth.uid());
end;
$$;

-- ---------- RPC: 관리자 가역 ----------
create or replace function public.as_triage_reverse(p_as_request_id uuid)
  returns void
  language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_dec    uuid;
begin
  if not (auth.role() = 'service_role' or public.is_admin()) then
    raise exception 'unauthorized';
  end if;
  select status into v_status from as_requests where id = p_as_request_id for update;
  if not found then raise exception 'as request not found'; end if;
  if v_status in ('in_progress','completed') then
    raise exception 'as request in progress or completed; cannot reverse';
  end if;
  select d.id into v_dec
    from as_triage_decisions d
    where d.as_request_id = p_as_request_id
      and d.source in ('auto','admin')
      and d.decision in ('schedule','reject')
      and not exists (select 1 from as_triage_decisions x where x.reversed_of = d.id)
    order by d.created_at desc
    limit 1;
  if v_dec is null then raise exception 'no active resolution to reverse'; end if;

  update as_requests set status = 'requested' where id = p_as_request_id;
  insert into as_triage_decisions
    (as_request_id, source, decision, responsibility, confidence, rationale, reversed_of, actor)
    values (p_as_request_id, 'reversal', 'escalate', 'ambiguous', 0, '관리자 가역', v_dec, auth.uid());
end;
$$;

-- ---------- grants ----------
revoke execute on function
  public.as_triage_auto_resolve(uuid, text, text, numeric, text),
  public.as_triage_admin_resolve(uuid, text),
  public.as_triage_reverse(uuid)
  from public;
grant execute on function
  public.as_triage_auto_resolve(uuid, text, text, numeric, text),
  public.as_triage_admin_resolve(uuid, text),
  public.as_triage_reverse(uuid)
  to authenticated, service_role;
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/db/phase8-as-triage.test.ts`
Expected: PASS (전부).

- [ ] **Step 5: 회귀 확인** — Run: `npx vitest run tests/db/migration.test.ts tests/db/seed.test.ts` → PASS.

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/0014_as_triage.sql tests/db/phase8-as-triage.test.ts
git commit -m "feat(as-triage): 관리자 수동·가역 RPC + grants (TDD)"
```

---

## Task 6: 큐 로더 (loadAsTriageConsole)

**Files:**
- Modify: `lib/data/triage.ts` (함수 추가)

> 기존 `loadTriageConsole`는 변경하지 않고 AS용 함수를 추가한다.

- [ ] **Step 1: `lib/data/triage.ts` 끝에 추가**

```typescript
import type { AsTriagePolicy } from "@/lib/types";

export interface AsTriageQueueRow {
  id: string;
  issue: string;
  productName: string;
  lastDecision: string | null;
  lastRationale: string | null;
}

export interface AsTriageConsole {
  authed: boolean;
  policy: AsTriagePolicy | null;
  queue: AsTriageQueueRow[];
}

const AS_EMPTY: AsTriageConsole = { authed: false, policy: null, queue: [] };

interface AsRawRow {
  id: string;
  issue: string;
  order_items: { name_snapshot: string } | null;
  as_triage_decisions: Array<{ decision: string; rationale: string; created_at: string }>;
}

export async function loadAsTriageConsole(): Promise<AsTriageConsole> {
  try {
    if (!(await requireAdmin())) return AS_EMPTY;
    const sb = createServiceSupabase();
    const [{ data: policy }, { data: rows }] = await Promise.all([
      sb.from("as_triage_policies").select("*").eq("singleton", true).maybeSingle(),
      sb
        .from("as_requests")
        .select(
          "id, issue, order_items(name_snapshot), as_triage_decisions(decision, rationale, created_at)",
        )
        .eq("status", "requested")
        .order("created_at", { ascending: true })
        .limit(100),
    ]);

    const queue: AsTriageQueueRow[] = ((rows ?? []) as unknown as AsRawRow[]).map((r) => {
      const decs = [...(r.as_triage_decisions ?? [])].sort((a, b) =>
        a.created_at < b.created_at ? 1 : -1,
      );
      const last = decs[0] ?? null;
      return {
        id: r.id,
        issue: r.issue,
        productName: r.order_items?.name_snapshot ?? "",
        lastDecision: last?.decision ?? null,
        lastRationale: last?.rationale ?? null,
      };
    });

    return { authed: true, policy: (policy as AsTriagePolicy) ?? null, queue };
  } catch {
    return AS_EMPTY;
  }
}
```

> 주의: `requireAdmin`·`createServiceSupabase`는 파일 상단에서 이미 import됨(8-1). 위 `AsTriagePolicy` import는 기존 `import type { TriagePolicy } from "@/lib/types";`에 합치거나 별도 추가 — 중복 import 없도록 한 줄로: `import type { TriagePolicy, AsTriagePolicy } from "@/lib/types";`.

- [ ] **Step 2: 타입체크** — Run: `npx tsc --noEmit` → 0 errors.
- [ ] **Step 3: 커밋**

```bash
git add lib/data/triage.ts
git commit -m "feat(as-triage): 관리자 AS 트리아지 큐 로더"
```

---

## Task 7: API 라우트 — 자동 실행(POST) + 정책(PATCH)

**Files:**
- Create: `app/api/as-triage/route.ts`

- [ ] **Step 1: 작성** — `app/api/as-triage/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceSupabase } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { classifyAsRequestWithAI } from "@/lib/triage/as-anthropic";
import { classifyAsRequestFallback, decideAsTriage } from "@/lib/triage/as";
import type { AsTriagePolicy } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PendingRow {
  id: string;
  issue: string;
  order_items: { name_snapshot: string } | null;
}

export async function POST() {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
    const sb = createServiceSupabase();
    const { data: policyRow } = await sb
      .from("as_triage_policies")
      .select("*")
      .eq("singleton", true)
      .maybeSingle();
    const policy = policyRow as AsTriagePolicy | null;
    if (!policy) {
      return NextResponse.json({ error: "AS 트리아지 정책이 없습니다." }, { status: 422 });
    }

    const { data: rows } = await sb
      .from("as_requests")
      .select("id, issue, order_items(name_snapshot)")
      .eq("status", "requested");
    const pending = (rows ?? []) as unknown as PendingRow[];

    let scheduled = 0;
    let escalated = 0;
    for (const r of pending) {
      const { count } = await sb
        .from("as_triage_decisions")
        .select("id", { count: "exact", head: true })
        .eq("as_request_id", r.id);
      if ((count ?? 0) > 0) continue;

      const cls =
        (await classifyAsRequestWithAI({
          issue: r.issue,
          productName: r.order_items?.name_snapshot ?? "",
        })) ?? classifyAsRequestFallback(r.issue);

      const evald = decideAsTriage(cls, policy);
      const proposed = evald.outcome === "auto_schedule" ? "schedule" : "escalate";

      const { data: outcome, error } = await sb.rpc("as_triage_auto_resolve", {
        p_as_request_id: r.id,
        p_proposed_decision: proposed,
        p_responsibility: cls.responsibility,
        p_confidence: cls.confidence,
        p_rationale: cls.rationale,
      });
      if (error) {
        console.error("as_triage_auto_resolve error:", error);
        continue;
      }
      if (outcome === "schedule") scheduled += 1;
      else escalated += 1;
    }
    return NextResponse.json({ scheduled, escalated, processed: scheduled + escalated });
  } catch (e) {
    console.error("as-triage run failed:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}

const PolicySchema = z
  .object({
    enabled: z.boolean().optional(),
    min_confidence: z.number().min(0).max(1).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "no fields" });

export async function PATCH(req: Request) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }
    const parsed = PolicySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }
    const sb = createServiceSupabase();
    const { error } = await sb
      .from("as_triage_policies")
      .update(parsed.data)
      .eq("singleton", true);
    if (error) {
      return NextResponse.json({ error: "정책 저장에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ status: "saved" });
  } catch (e) {
    console.error("as-triage policy update failed:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
```

- [ ] **Step 2: 타입체크** — Run: `npx tsc --noEmit` → 0 errors.
- [ ] **Step 3: 커밋**

```bash
git add app/api/as-triage/route.ts
git commit -m "feat(as-triage): 자동 트리아지 실행 + 정책 수정 API"
```

---

## Task 8: API 라우트 — 예약/거부/가역

**Files:**
- Create: `app/api/as-triage/[id]/route.ts`

- [ ] **Step 1: 작성** — `app/api/as-triage/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const Schema = z.object({ action: z.enum(["schedule", "reject", "reverse"]) });

function mapRpcError(message: string): { status: number; error: string } {
  if (/unauthorized/i.test(message)) return { status: 403, error: "권한이 없습니다." };
  if (/not found/i.test(message)) return { status: 404, error: "AS 요청을 찾을 수 없습니다." };
  if (/cannot reverse/i.test(message))
    return { status: 409, error: "진행/완료된 AS는 되돌릴 수 없습니다." };
  if (/no active resolution/i.test(message))
    return { status: 409, error: "되돌릴 처리 내역이 없습니다." };
  if (/not actionable/i.test(message)) return { status: 409, error: "이미 처리된 AS 요청입니다." };
  if (/not configured/i.test(message))
    return { status: 422, error: "AS 트리아지 정책이 없습니다." };
  return { status: 500, error: "처리 중 오류가 발생했습니다." };
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const { action } = parsed.data;
    if (action === "reverse") {
      const { error } = await sb.rpc("as_triage_reverse", { p_as_request_id: params.id });
      if (error) {
        const m = mapRpcError(error.message);
        return NextResponse.json({ error: m.error }, { status: m.status });
      }
      return NextResponse.json({ status: "reversed" });
    }

    const { error } = await sb.rpc("as_triage_admin_resolve", {
      p_as_request_id: params.id,
      p_decision: action,
    });
    if (error) {
      const m = mapRpcError(error.message);
      return NextResponse.json({ error: m.error }, { status: m.status });
    }
    return NextResponse.json({ status: action === "schedule" ? "scheduled" : "rejected" });
  } catch (e) {
    console.error("as-triage action failed:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
```

- [ ] **Step 2: 타입체크** — Run: `npx tsc --noEmit` → 0 errors.
- [ ] **Step 3: 커밋**

```bash
git add "app/api/as-triage/[id]/route.ts"
git commit -m "feat(as-triage): 관리자 예약/거부/가역 API"
```

---

## Task 9: E2E 통합 테스트

**Files:**
- Test: `tests/e2e/phase8-as-flow.test.ts`

- [ ] **Step 1: 작성** — `tests/e2e/phase8-as-flow.test.ts`:

```typescript
/**
 * Phase 8-2 E2E — AS 접수 → 자동 트리아지(공급사귀책 자동예약 / 시공사귀책 에스컬레이션)
 * → 관리자 수동 → 가역. 순수 분류기 + plpgsql RPC 통합. 서버 규칙 ≡ DB 결정.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "../db/harness";
import { classifyAsRequestFallback, decideAsTriage } from "@/lib/triage/as";
import type { AsTriagePolicy } from "@/lib/types";

describe("Phase 8-2 E2E: AS triage", () => {
  let t: TestDb;
  let admin: string;

  async function policy(): Promise<AsTriagePolicy> {
    await t.asService();
    return (await t.db.query<AsTriagePolicy>("select * from as_triage_policies where singleton=true")).rows[0]!;
  }
  async function seedAs(contractor: string, issue: string): Promise<string> {
    await t.asService();
    const prod = (await t.db.query<{ id: string }>("select id from products limit 1")).rows[0]!.id;
    const sup = (await t.db.query<{ id: string }>("select id from suppliers limit 1")).rows[0]!.id;
    const order = (await t.db.query<{ id: string }>(
      "insert into orders (contractor_id, payment_method, status, subtotal, total) values ($1,'escrow','pending',100000,100000) returning id",
      [contractor],
    )).rows[0]!.id;
    const po = (await t.db.query<{ id: string }>(
      "insert into purchase_orders (order_id, supplier_id, status, subtotal) values ($1,$2,'pending',100000) returning id",
      [order, sup],
    )).rows[0]!.id;
    const oi = (await t.db.query<{ id: string }>(
      "insert into order_items (po_id, product_id, name_snapshot, unit_price_snapshot, qty, line_total) values ($1,$2,'타일',100000,1,100000) returning id",
      [po, prod],
    )).rows[0]!.id;
    return (await t.db.query<{ id: string }>(
      "insert into as_requests (order_item_id, contractor_id, issue, status) values ($1,$2,$3,'requested') returning id",
      [oi, contractor, issue],
    )).rows[0]!.id;
  }
  async function runAuto(as: string, issue: string) {
    const p = await policy();
    const cls = classifyAsRequestFallback(issue);
    const evald = decideAsTriage(cls, p);
    const proposed = evald.outcome === "auto_schedule" ? "schedule" : "escalate";
    await t.asUser(admin);
    const out = (await t.db.query<{ d: string }>(
      "select as_triage_auto_resolve($1,$2,$3,$4,$5) as d",
      [as, proposed, cls.responsibility, cls.confidence, cls.rationale],
    )).rows[0]!.d;
    expect(out).toBe(evald.outcome === "auto_schedule" ? "schedule" : "escalate");
    return out;
  }

  beforeAll(async () => {
    t = await createTestDb();
    admin = await t.seedUser({ role: "admin" });
    await t.asService();
    await t.db.query("update as_triage_policies set enabled=true, min_confidence=0.7 where singleton=true");
  });
  afterAll(async () => {
    await t.close();
  });

  it("명백한 결함(공급사 귀책) → 자동 예약", async () => {
    const a = await t.seedUser({ role: "contractor" });
    const as = await seedAs(a, "제품 누수 하자");
    expect(await runAuto(as, "제품 누수 하자")).toBe("schedule");
    await t.asService();
    expect((await t.db.query("select status from as_requests where id=$1", [as])).rows[0]).toEqual({ status: "scheduled" });
  });

  it("신호 없는 사유 → 에스컬레이션 → 관리자 수동 예약 → 가역", async () => {
    const a = await t.seedUser({ role: "contractor" });
    const as = await seedAs(a, "문의드립니다");
    expect(await runAuto(as, "문의드립니다")).toBe("escalate");
    await t.asService();
    expect((await t.db.query("select status from as_requests where id=$1", [as])).rows[0]).toEqual({ status: "requested" });

    await t.asUser(admin);
    await t.db.query("select as_triage_admin_resolve($1,'schedule')", [as]);
    await t.asService();
    expect((await t.db.query("select status from as_requests where id=$1", [as])).rows[0]).toEqual({ status: "scheduled" });

    await t.asUser(admin);
    await t.db.query("select as_triage_reverse($1)", [as]);
    await t.asService();
    expect((await t.db.query("select status from as_requests where id=$1", [as])).rows[0]).toEqual({ status: "requested" });
  });
});
```

- [ ] **Step 2: 테스트 통과 확인** — Run: `npx vitest run tests/e2e/phase8-as-flow.test.ts` → 2 passed.
- [ ] **Step 3: 커밋**

```bash
git add tests/e2e/phase8-as-flow.test.ts
git commit -m "test(as-triage): Phase 8-2 E2E — 자동예약/에스컬레이션/수동/가역"
```

---

## Task 10: 관리자 UI — AS 컨트롤 + 페이지 섹션 추가

**Files:**
- Create: `components/as-triage-controls.tsx`
- Modify: `app/admin/triage/page.tsx`

- [ ] **Step 1: AS 컨트롤 작성** — `components/as-triage-controls.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AsTriagePolicy } from "@/lib/types";

export function RunAsTriageButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/as-triage", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMsg(`자동 처리: 예약 ${data.scheduled}건 · 에스컬레이션 ${data.escalated}건`);
        router.refresh();
      } else {
        setMsg(data.error ?? "실행 실패");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <Button onClick={run} disabled={busy} size="sm">
        {busy ? "처리 중…" : "AS 자동 처리 실행"}
      </Button>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}

export function AsTriagePolicyForm({ policy }: { policy: AsTriagePolicy | null }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(policy?.enabled ?? false);
  const [minConf, setMinConf] = useState(String(policy?.min_confidence ?? 0.8));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async (patch: Record<string, unknown>) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/as-triage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        setMsg("저장됨");
        router.refresh();
      } else {
        const data = await res.json();
        setMsg(data.error ?? "저장 실패");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">AS 자동 트리아지 {enabled ? "켜짐" : "꺼짐"}</p>
          <p className="text-xs text-muted-foreground">
            공급사/배송 귀책 · 고신뢰 AS만 자동 예약
          </p>
        </div>
        <Button
          onClick={() => {
            const next = !enabled;
            setEnabled(next);
            void save({ enabled: next });
          }}
          disabled={busy}
          variant={enabled ? "destructive" : "default"}
          size="sm"
        >
          {enabled ? "긴급 중지" : "자동화 켜기"}
        </Button>
      </div>
      <div>
        <Label htmlFor="as-conf">신뢰도 임계(0~1)</Label>
        <Input id="as-conf" type="number" step="0.05" value={minConf} onChange={(e) => setMinConf(e.target.value)} placeholder="0.8" />
      </div>
      <Button
        onClick={() => void save({ min_confidence: Number(minConf) })}
        disabled={busy}
        variant="outline"
        size="sm"
      >
        임계값 저장
      </Button>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}

export function AsTriageRowActions({ asRequestId }: { asRequestId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const act = async (action: "schedule" | "reject" | "reverse") => {
    setBusy(true);
    try {
      const res = await fetch(`/api/as-triage/${asRequestId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Button onClick={() => void act("schedule")} disabled={busy} size="sm">예약</Button>
      <Button onClick={() => void act("reject")} disabled={busy} variant="outline" size="sm">거부</Button>
      <Button onClick={() => void act("reverse")} disabled={busy} variant="ghost" size="sm">되돌리기</Button>
    </div>
  );
}
```

- [ ] **Step 2: 페이지에 AS 섹션 추가** — `app/admin/triage/page.tsx`를 다음과 같이 수정:

(a) import 줄들 다음에 추가:
```tsx
import { loadAsTriageConsole } from "@/lib/data/triage";
import { RunAsTriageButton, AsTriagePolicyForm, AsTriageRowActions } from "@/components/as-triage-controls";
```

(b) `const c = await loadTriageConsole();` 다음 줄에 추가:
```tsx
  const ac = await loadAsTriageConsole();
```

(c) 반품 큐 `Card`의 닫는 `</Card>` 다음, 최상위 `</div>` 직전에 AS 섹션 추가:
```tsx
      <div className="pt-2">
        <h2 className="text-lg font-bold">AS 트리아지</h2>
        <p className="text-sm text-muted-foreground">
          공급사/배송 귀책 · 고신뢰 AS만 자동 예약 · 나머지는 사람 검토
        </p>
      </div>

      <AsTriagePolicyForm policy={ac.policy} />
      <RunAsTriageButton />

      <Card>
        <CardHeader>
          <CardTitle>대기 AS ({ac.queue.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {ac.queue.length === 0 ? (
            <p className="text-sm text-gray-400">대기 중인 AS 요청이 없습니다.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {ac.queue.map((r) => (
                <li key={r.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.productName || "상품"}</p>
                      <p className="truncate text-sm text-gray-500">{r.issue}</p>
                      {r.lastDecision && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          최근 분류: {r.lastDecision} — {r.lastRationale}
                        </p>
                      )}
                    </div>
                    <Badge variant="neutral">{r.lastDecision ?? "미처리"}</Badge>
                  </div>
                  <div className="mt-2">
                    <AsTriageRowActions asRequestId={r.id} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
```

- [ ] **Step 3: 타입체크 + 린트 + 빌드** — Run: `npx tsc --noEmit && npx next lint && npx next build` → 0 errors · clean · 빌드 성공.

- [ ] **Step 4: 커밋**

```bash
git add components/as-triage-controls.tsx app/admin/triage/page.tsx
git commit -m "feat(as-triage): 관리자 AS 트리아지 섹션 UI + 정책/킬스위치"
```

---

## Task 11: 최종 DoD 검증

**Files:** (없음 — 검증만)

- [ ] **Step 1: 전체 게이트** — Run:
```bash
npx tsc --noEmit && npx next lint && npx vitest run && npx next build
```
Expected: tsc 0 · lint 0 · vitest 전체 PASS(8-1 250 + 신규 ~약 30) · build 성공.

- [ ] **Step 2: RED→GREEN 증명** —
```bash
mv supabase/migrations/0014_as_triage.sql supabase/migrations/0014_as_triage.sql.bak
npx vitest run tests/db/phase8-as-triage.test.ts   # FAIL 기대
mv supabase/migrations/0014_as_triage.sql.bak supabase/migrations/0014_as_triage.sql
npx vitest run tests/db/phase8-as-triage.test.ts   # PASS 기대
```

- [ ] **Step 3: 스펙 체크리스트 대조** — 스펙 §4~§11 항목별 구현 매핑 확인.

- [ ] **Step 4: (선택) 적대적 코드리뷰** — `/code-review` 또는 보안 다중렌즈.

---

## Self-Review (작성자 점검)

**1. 스펙 커버리지:** §4 테이블/시드(T3) · §5 결정규칙(T1 순수 + T4 RPC) · §6 RPC 3종(T4,5) · §7 RLS(T3) · §8 모듈(T1,2,6) · §9 라우트/UI(T7,8,10) · §10 테스트(T1,3,4,5,9) · §11 DoD(T11). 누락 없음.

**2. 플레이스홀더:** 모든 step에 실제 코드/명령. 없음.

**3. 타입 일관성:** `AsTriagePolicy`/`AsTriageEval`(T1) ↔ `decideAsTriage`(T1) ↔ RPC 파라미터(`as_triage_auto_resolve(uuid,text,text,numeric,text)` 등, T4,5,7,8) ↔ 로더/페이지(T6,10) 일치. 분류기 출력은 `ReturnClassification` 재사용(8-1). 8-1 페이지 수정은 기존 `c` 유지 + `ac` 추가(비파괴).

**4. 검증된 사실:** as_requests 필드·as_status enum·is_admin/prevent_audit_mutation·ReturnClassificationSchema·모델ID·supabase export 모두 코드 대조.

**5. AS 델타 정합:** 금액 게이트 없음 · 자동=예약(scheduled_date null) · 책임소재 {supplier,delivery} 게이트 · in_progress/completed 가역 불가 · idempotency(already-triaged) not-actionable보다 먼저(8-1 교정 순서 적용).
