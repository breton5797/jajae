# 반품 자동 트리아지 (Return Auto-Triage) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 반품(`returns`) 사유를 분류기(AI + 결정론 폴백)가 읽어 제안하면, DB 원자 RPC가 정책(상한·신뢰도·킬스위치)을 재검증해 **상한 내 명백 승인만 자동 적용**하고 나머지는 사람에게 에스컬레이션한다(append-only 감사 + 관리자 가역).

**Architecture:** Phase 7의 2계층 강제 패턴 재사용 — 순수 함수(`lib/triage`)와 plpgsql RPC가 동일 규칙을 양쪽에서 enforce(defense in depth), `security definer` + `for update` + fail-closed. 자동 결과는 `auto_approve` 하나뿐.

**Tech Stack:** Next.js 14 App Router · TypeScript(strict) · Supabase(Postgres/RLS/plpgsql) · zod · `@anthropic-ai/sdk`(폴백 격리) · Vitest + PGlite.

**Spec:** `docs/superpowers/specs/2026-06-09-jajae-return-triage-design.md`

**검증된 기존 패턴 (그대로 따를 것):**
- RPC: `supabase/migrations/0011_agent_rpc.sql` (`language plpgsql security definer set search_path = public`, `for update`, `raise exception`, revoke/grant execute)
- RLS/append-only: `0009_autonomous_agent.sql` + `public.prevent_audit_mutation()`(0008) + `public.is_admin()`(0002)
- 순수 도메인: `lib/policy/index.ts` · zod: `lib/ai-quote/schema.ts` · AI 폴백: `lib/ai-quote/anthropic.ts`(model `claude-sonnet-4-6`)
- route: `app/api/agent/decision/[id]/route.ts` (`createServerSupabase`, `sb.rpc`, `mapRpcError`)
- loader: `lib/data/agent.ts` (`createServiceSupabase` + `requireAdmin`)
- db test: `tests/db/phase7-rpc.test.ts` + `tests/db/harness.ts` (`createTestDb`, `seedUser`, `asUser/asService`)
- UI: `components/agent-controls.tsx`(client) + `app/admin/agent-ops/page.tsx`(server)

**필드/값 사실(검증됨):** `returns(order_item_id, contractor_id, reason, qty, status)` · `return_status` = requested|approved|rejected|completed · `order_items.unit_price_snapshot` · `user_role` = contractor|supplier|admin · seed: products 17행·suppliers 1행.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `lib/types.ts` (수정) | 트리아지 타입(`TriagePolicy`, `ReturnClassification`, `TriageEval` 등) |
| `lib/triage/schema.ts` (신규) | zod `ReturnClassificationSchema` |
| `lib/triage/index.ts` (신규) | 순수 규칙: `decideTriage`, `computeRefundAmount`, `classifyReturnFallback` |
| `lib/triage/anthropic.ts` (신규) | `classifyReturnWithAI` (무키/에러 시 null → 폴백) |
| `supabase/migrations/0013_triage.sql` (신규) | 테이블·RLS·append-only·정책 시드·RPC 3종·grants |
| `lib/data/triage.ts` (신규) | 관리자 큐 로더 |
| `app/api/triage/route.ts` (신규) | POST 자동 트리아지 실행 · PATCH 정책 수정 |
| `app/api/triage/[id]/route.ts` (신규) | POST 관리자 승인/거부/가역 |
| `components/triage-controls.tsx` (신규) | 정책 폼·킬스위치·실행·행별 액션(client) |
| `app/admin/triage/page.tsx` (신규) | 트리아지 큐 화면(server) |
| `app/admin/page.tsx` (수정) | 내비에 "반품 트리아지" 링크 추가 |
| `tests/unit/triage.test.ts` (신규) | `decideTriage`/`computeRefundAmount`/폴백 |
| `tests/db/phase8-triage.test.ts` (신규) | RLS·RPC·idempotency·가역·append-only·fail-closed |
| `tests/e2e/phase8-flow.test.ts` (신규) | 접수→자동트리아지→수동결정→가역 통합 |

---

## Task 1: 트리아지 타입

**Files:**
- Modify: `lib/types.ts` (파일 끝에 추가)

- [ ] **Step 1: 타입 추가**

`lib/types.ts` 끝에 추가:

```typescript
/* ---------- Phase 8: return triage ---------- */

export type TriageResponsibility =
  | "supplier"
  | "delivery"
  | "contractor"
  | "ambiguous";

/** 분류기가 제안하는 처리(자동 적용은 'approve'만 후보). */
export type TriageProposedDecision = "approve" | "reject" | "ambiguous";

export interface ReturnClassification {
  responsibility: TriageResponsibility;
  decision: TriageProposedDecision;
  confidence: number; // 0~1
  rationale: string;
}

export interface TriagePolicy {
  id: string;
  auto_approve_cap: number;
  min_confidence: number;
  enabled: boolean;
  created_at: string;
}

/** 트리아지 최종 산출: 자동 승인 또는 사람 에스컬레이션. */
export type TriageOutcome = "auto_approve" | "escalate";

export interface TriageEval {
  outcome: TriageOutcome;
  reasons: string[];
}
```

- [ ] **Step 2: 타입체크 통과 확인**

Run: `npx tsc --noEmit`
Expected: 0 errors (타입만 추가, 사용처는 이후 태스크).

- [ ] **Step 3: 커밋**

```bash
git add lib/types.ts
git commit -m "feat(triage): 반품 트리아지 도메인 타입 추가"
```

---

## Task 2: 순수 규칙 모듈 + 단위 테스트 (TDD)

**Files:**
- Create: `lib/triage/schema.ts`
- Create: `lib/triage/index.ts`
- Test: `tests/unit/triage.test.ts`

- [ ] **Step 1: 실패하는 단위 테스트 작성**

`tests/unit/triage.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  decideTriage,
  computeRefundAmount,
  classifyReturnFallback,
} from "@/lib/triage";
import type { ReturnClassification, TriagePolicy } from "@/lib/types";

const policy = (over: Partial<TriagePolicy> = {}): TriagePolicy => ({
  id: "pol",
  auto_approve_cap: over.auto_approve_cap ?? 1_000_000,
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

describe("computeRefundAmount", () => {
  it("환불액 = 수량 × 스냅샷 단가", () => {
    expect(computeRefundAmount(3, 50_000)).toBe(150_000);
  });
});

describe("decideTriage", () => {
  it("정책 범위 내 명백 승인 → auto_approve", () => {
    const r = decideTriage(cls(), 1_000_000, policy());
    expect(r.outcome).toBe("auto_approve");
  });
  it("상한 초과 → escalate", () => {
    const r = decideTriage(cls(), 1_000_001, policy({ auto_approve_cap: 1_000_000 }));
    expect(r.outcome).toBe("escalate");
  });
  it("상한 경계값(정확히 상한) → auto_approve", () => {
    const r = decideTriage(cls(), 1_000_000, policy({ auto_approve_cap: 1_000_000 }));
    expect(r.outcome).toBe("auto_approve");
  });
  it("신뢰도 임계 미만 → escalate", () => {
    const r = decideTriage(cls({ confidence: 0.79 }), 100, policy({ min_confidence: 0.8 }));
    expect(r.outcome).toBe("escalate");
  });
  it("approve 아님(ambiguous/reject) → escalate", () => {
    expect(decideTriage(cls({ decision: "ambiguous" }), 100, policy()).outcome).toBe("escalate");
    expect(decideTriage(cls({ decision: "reject" }), 100, policy()).outcome).toBe("escalate");
  });
  it("킬스위치(enabled=false) → escalate", () => {
    expect(decideTriage(cls(), 100, policy({ enabled: false })).outcome).toBe("escalate");
  });
});

describe("classifyReturnFallback", () => {
  it("명백한 하자 신호 → approve, 신뢰도 ≥ 0.8", () => {
    const r = classifyReturnFallback("타일 불량으로 반품합니다", 100_000);
    expect(r.decision).toBe("approve");
    expect(r.confidence).toBeGreaterThanOrEqual(0.8);
  });
  it("신호 없음 → ambiguous, 저신뢰(보수적)", () => {
    const r = classifyReturnFallback("그냥 마음이 바뀌었어요", 100_000);
    expect(r.decision).toBe("ambiguous");
    expect(r.confidence).toBeLessThan(0.8);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/unit/triage.test.ts`
Expected: FAIL — `Cannot find module '@/lib/triage'`.

- [ ] **Step 3: zod 스키마 작성**

`lib/triage/schema.ts`:

```typescript
import { z } from "zod";

/** Claude가 반환해야 하는 분류 형태; 신뢰 전에 검증한다. */
export const ReturnClassificationSchema = z.object({
  responsibility: z.enum(["supplier", "delivery", "contractor", "ambiguous"]),
  decision: z.enum(["approve", "reject", "ambiguous"]),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
});

export type ReturnClassificationParsed = z.infer<typeof ReturnClassificationSchema>;
```

- [ ] **Step 4: 순수 규칙 모듈 작성**

`lib/triage/index.ts`:

```typescript
/**
 * lib/triage — 반품 트리아지 결정 규칙. 순수; lib/types에만 의존.
 * 분류기(AI/폴백)는 *제안*만 한다. 이 모듈과 DB RPC(triage_auto_resolve_return)가
 * 동일한 게이트를 각자 강제한다(defense in depth). 유일한 자동 결과는 auto_approve이고,
 * 그 외(reject/ambiguous/저신뢰/상한초과/킬스위치)는 모두 escalate 한다.
 */
import type { ReturnClassification, TriageEval, TriagePolicy } from "@/lib/types";

export function computeRefundAmount(qty: number, unitPriceSnapshot: number): number {
  return qty * unitPriceSnapshot;
}

export function decideTriage(
  c: ReturnClassification,
  refundAmount: number,
  policy: Pick<TriagePolicy, "enabled" | "min_confidence" | "auto_approve_cap">,
): TriageEval {
  const reasons: string[] = [];
  if (!policy.enabled) {
    reasons.push("트리아지 자동화 중지(킬스위치)");
    return { outcome: "escalate", reasons };
  }
  if (c.decision !== "approve") {
    reasons.push("명백한 환불 승인이 아님 — 사람 검토 필요");
    return { outcome: "escalate", reasons };
  }
  if (c.confidence < policy.min_confidence) {
    reasons.push(`신뢰도(${c.confidence})가 임계값(${policy.min_confidence}) 미만`);
    return { outcome: "escalate", reasons };
  }
  if (refundAmount > policy.auto_approve_cap) {
    reasons.push(`환불액(${refundAmount})이 자동승인 상한(${policy.auto_approve_cap}) 초과`);
    return { outcome: "escalate", reasons };
  }
  reasons.push("정책 범위 내 자동 승인");
  return { outcome: "auto_approve", reasons };
}

const APPROVE_SIGNALS = [
  "불량", "파손", "하자", "오배송", "깨짐", "누락", "오염", "고장",
];

/**
 * 키 없음/AI 오류 시의 결정론 폴백. 보수적: 명백한 하자 신호가 있을 때만 approve,
 * 그 외는 ambiguous(저신뢰)로 두어 기본 에스컬레이션을 유도한다. 절대 throw 안 함.
 */
export function classifyReturnFallback(
  reason: string,
  _refundAmount: number,
): ReturnClassification {
  const text = reason.trim();
  const hit = APPROVE_SIGNALS.find((s) => text.includes(s));
  if (hit) {
    return {
      responsibility: "supplier",
      decision: "approve",
      confidence: 0.8,
      rationale: `사유에 명백한 하자 신호("${hit}") 포함 — 폴백 자동 분류`,
    };
  }
  return {
    responsibility: "ambiguous",
    decision: "ambiguous",
    confidence: 0.3,
    rationale: "명백한 하자 신호 없음 — 사람 검토 필요(보수적 폴백)",
  };
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run tests/unit/triage.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: 커밋**

```bash
git add lib/triage/schema.ts lib/triage/index.ts tests/unit/triage.test.ts
git commit -m "feat(triage): 순수 결정 규칙 + 결정론 폴백 분류기 (TDD)"
```

---

## Task 3: AI 분류기 (폴백 격리)

**Files:**
- Create: `lib/triage/anthropic.ts`

> 네트워크 호출이라 단위 테스트하지 않는다(ai-quote/anthropic.ts와 동일 — 키 없으면 null 반환).

- [ ] **Step 1: AI 분류기 작성**

`lib/triage/anthropic.ts`:

```typescript
/**
 * Anthropic 기반 반품 분류. 키 미설정/오류 시 null을 반환해 호출자가 결정론 폴백으로
 * 투명하게 넘어가게 한다. 테스트에서 실행하지 않음(무네트워크) — 격리·방어적.
 */
import Anthropic from "@anthropic-ai/sdk";
import { anthropicApiKey } from "@/lib/env";
import type { ReturnClassification } from "@/lib/types";
import { ReturnClassificationSchema } from "./schema";

const SYSTEM_PROMPT = `당신은 한국 B2B 건축자재 플랫폼의 반품 분쟁 분류 전문가입니다.
반품 사유와 정보를 받아 책임 소재와 처리 제안을 판단합니다.
반드시 아래 JSON 스키마로만 답하세요. 설명/마크다운 금지.
{"responsibility":"supplier|delivery|contractor|ambiguous","decision":"approve|reject|ambiguous","confidence":0과1사이숫자,"rationale":"한 줄 근거"}
- supplier=공급사 귀책(불량/하자), delivery=배송 귀책(파손/오배송), contractor=시공사 귀책(단순변심/주문실수), ambiguous=불명확
- decision=approve는 명백한 환불 사유일 때만. 불명확하면 ambiguous(거부는 사람이 판단).`;

export async function classifyReturnWithAI(input: {
  reason: string;
  productName: string;
  qty: number;
  refundAmount: number;
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

- [ ] **Step 2: 타입체크 통과 확인**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: 커밋**

```bash
git add lib/triage/anthropic.ts
git commit -m "feat(triage): Claude 분류기 + 결정론 폴백 게이트"
```

---

## Task 4: 마이그레이션 — 테이블·RLS·append-only·정책 시드 (TDD)

**Files:**
- Create: `supabase/migrations/0013_triage.sql`
- Test: `tests/db/phase8-triage.test.ts`

- [ ] **Step 1: 실패하는 DB 테스트(스캐폴딩 + RLS/append-only) 작성**

`tests/db/phase8-triage.test.ts`:

```typescript
/**
 * Phase 8-1 — 반품 자동 트리아지 (plpgsql, 원자적). 분류기는 제안만, DB가 정책을
 * 재검증해 결정한다. 자동은 '상한 내 명백 승인'만, 그 외 escalate. fail-closed.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./harness";

describe("Phase 8 return triage", () => {
  let t: TestDb;
  let admin: string;

  async function seedReturn(opts: {
    contractor: string;
    qty: number;
    unit: number;
    status?: string;
    reason?: string;
  }): Promise<string> {
    await t.asService();
    const prod = (await t.db.query<{ id: string }>("select id from products limit 1")).rows[0]!.id;
    const sup = (await t.db.query<{ id: string }>("select id from suppliers limit 1")).rows[0]!.id;
    const total = opts.unit * opts.qty;
    const order = (await t.db.query<{ id: string }>(
      "insert into orders (contractor_id, payment_method, status, subtotal, total) values ($1,'escrow','pending',$2,$2) returning id",
      [opts.contractor, total],
    )).rows[0]!.id;
    const po = (await t.db.query<{ id: string }>(
      "insert into purchase_orders (order_id, supplier_id, status, subtotal) values ($1,$2,'pending',$3) returning id",
      [order, sup, total],
    )).rows[0]!.id;
    const oi = (await t.db.query<{ id: string }>(
      "insert into order_items (po_id, product_id, name_snapshot, unit_price_snapshot, qty, line_total) values ($1,$2,'타일',$3,$4,$5) returning id",
      [po, prod, opts.unit, opts.qty, total],
    )).rows[0]!.id;
    const ret = (await t.db.query<{ id: string }>(
      "insert into returns (order_item_id, contractor_id, reason, qty, status) values ($1,$2,$3,$4,$5) returning id",
      [oi, opts.contractor, opts.reason ?? "불량", opts.qty, opts.status ?? "requested"],
    )).rows[0]!.id;
    return ret;
  }

  async function setPolicy(opts: { enabled?: boolean; cap?: number; minConf?: number }) {
    await t.asService();
    await t.db.query(
      "update triage_policies set enabled=$1, auto_approve_cap=$2, min_confidence=$3 where singleton=true",
      [opts.enabled ?? true, opts.cap ?? 1_000_000, opts.minConf ?? 0.8],
    );
  }

  async function autoResolve(ret: string, decision: string, conf: number) {
    return t.db.query<{ d: string }>(
      "select triage_auto_resolve_return($1,$2,$3,$4,$5) as d",
      [ret, decision, "supplier", conf, "테스트 사유"],
    );
  }

  beforeAll(async () => {
    t = await createTestDb();
    admin = await t.seedUser({ role: "admin", companyName: "운영" });
  });
  afterAll(async () => {
    await t.close();
  });

  it("정책 시드가 정확히 1행 존재(기본 비활성)", async () => {
    await t.asService();
    const r = await t.db.query<{ n: number; enabled: boolean }>(
      "select count(*)::int n, bool_or(enabled) enabled from triage_policies",
    );
    expect(r.rows[0]!.n).toBe(1);
    expect(r.rows[0]!.enabled).toBe(false);
  });

  it("triage_policies는 관리자만 접근(시공사 차단)", async () => {
    const c = await t.seedUser({ role: "contractor" });
    await t.asUser(c);
    const r = await t.db.query("select * from triage_policies");
    expect(r.rows.length).toBe(0); // RLS로 비관리자는 0행
    await t.asUser(admin);
    const r2 = await t.db.query("select * from triage_policies");
    expect(r2.rows.length).toBe(1);
  });

  it("시공사는 본인 반품 트리아지 결과만 조회", async () => {
    const a = await t.seedUser({ role: "contractor" });
    const b = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: true, cap: 1_000_000 });
    const ret = await seedReturn({ contractor: a, qty: 1, unit: 5_000_000 }); // 상한 초과 → escalate 로그 생성
    await t.asUser(admin);
    await autoResolve(ret, "approve", 0.9);
    await t.asUser(b);
    expect((await t.db.query("select * from triage_decisions where return_id=$1", [ret])).rows.length).toBe(0);
    await t.asUser(a);
    expect((await t.db.query("select * from triage_decisions where return_id=$1", [ret])).rows.length).toBe(1);
  });

  it("triage_decisions는 append-only(update/delete 차단)", async () => {
    const a = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: true, cap: 10_000_000 });
    const ret = await seedReturn({ contractor: a, qty: 1, unit: 100_000 });
    await t.asUser(admin);
    await autoResolve(ret, "approve", 0.9);
    await t.asService();
    const id = (await t.db.query<{ id: string }>("select id from triage_decisions where return_id=$1", [ret])).rows[0]!.id;
    await expect(t.db.query("update triage_decisions set rationale='x' where id=$1", [id])).rejects.toThrow();
    await expect(t.db.query("delete from triage_decisions where id=$1", [id])).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/db/phase8-triage.test.ts`
Expected: FAIL — `relation "triage_policies" does not exist`.

- [ ] **Step 3: 마이그레이션 작성 (테이블·시드·append-only·RLS)**

`supabase/migrations/0013_triage.sql`:

```sql
-- 자재(Jajae) Phase 8-1 — 반품 자동 트리아지 (return auto-triage). ADDITIVE.
-- 분류기(AI/폴백)는 제안만; DB가 정책을 재검증해 결정한다. 자동 결과는 '상한 내 명백
-- 승인'뿐이고 그 외는 escalate(status='requested' 유지 + 로그). fail-closed: 정책 행
-- 없으면 raise. triage_decisions는 append-only(prevent_audit_mutation 재사용).
-- 에스컬레이션은 새 status 값이 아니라 decision='escalate' 로그로 표현(enum 불변).

-- ---------- tables ----------
create table if not exists triage_policies (
  id               uuid primary key default gen_random_uuid(),
  singleton        boolean not null default true,
  auto_approve_cap numeric not null default 0 check (auto_approve_cap >= 0),
  min_confidence   numeric not null default 0.8 check (min_confidence >= 0 and min_confidence <= 1),
  enabled          boolean not null default false,
  created_at       timestamptz not null default now(),
  constraint triage_policies_singleton unique (singleton)
);

create table if not exists triage_decisions (
  id             uuid primary key default gen_random_uuid(),
  return_id      uuid not null references returns(id) on delete cascade,
  source         text not null check (source in ('auto','admin','reversal')),
  decision       text not null check (decision in ('approve','reject','escalate')),
  responsibility text not null check (responsibility in ('supplier','delivery','contractor','ambiguous')),
  confidence     numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  rationale      text not null default '',
  refund_amount  numeric not null default 0 check (refund_amount >= 0),
  reversed_of    uuid references triage_decisions(id),
  actor          uuid references profiles(id),
  created_at     timestamptz not null default now()
);
create index if not exists triage_decisions_return_idx on triage_decisions(return_id);

-- 정책 단일 행 시드(비활성·상한 0 → 관리자가 켜기 전까지 자동승인 0건)
insert into triage_policies (singleton, auto_approve_cap, min_confidence, enabled)
  values (true, 0, 0.8, false)
  on conflict (singleton) do nothing;

-- ---------- append-only audit (0008 트리거 함수 재사용) ----------
drop trigger if exists trg_triage_decisions_noupd on triage_decisions;
create trigger trg_triage_decisions_noupd
  before update or delete on triage_decisions
  for each row execute function public.prevent_audit_mutation();

-- ---------- RLS ----------
alter table triage_policies  enable row level security;
alter table triage_decisions enable row level security;

create policy triagepol_all on triage_policies for all
  using (public.is_admin()) with check (public.is_admin());

-- 시공사는 본인 반품의 트리아지 결과만, 관리자는 전체 select. 쓰기는 SECURITY DEFINER
-- RPC만(직접 insert 정책 없음 → RLS 기본 거부), update/delete는 append-only 트리거가 차단.
create policy triagedec_select on triage_decisions for select
  using (
    public.is_admin()
    or exists (
      select 1 from returns r
      where r.id = triage_decisions.return_id and r.contractor_id = auth.uid()
    )
  );
```

- [ ] **Step 4: 테스트 통과 확인 (Task 4 범위)**

Run: `npx vitest run tests/db/phase8-triage.test.ts`
Expected: 처음 4개 테스트 PASS. (RPC 호출 테스트 "시공사는 본인 반품…"은 `triage_auto_resolve_return` 미정의로 실패할 수 있음 — Task 5에서 RPC 추가 후 GREEN. 이 단계에서 정책 시드/RLS/append-only 3개가 통과하면 OK.)

> 참고: "시공사는 본인 반품…"과 append-only 테스트는 `autoResolve`(RPC)에 의존하므로 Task 5 완료 시 함께 GREEN이 된다. Task 4 커밋 시점엔 RPC 비의존 테스트(정책 시드 1행, 정책 관리자 전용)만 통과해도 진행한다.

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/0013_triage.sql tests/db/phase8-triage.test.ts
git commit -m "feat(triage): triage 테이블·RLS·append-only·정책 시드 마이그레이션"
```

---

## Task 5: 자동 트리아지 RPC (TDD)

**Files:**
- Modify: `supabase/migrations/0013_triage.sql` (RPC 추가)
- Modify: `tests/db/phase8-triage.test.ts` (RPC 테스트 추가)

- [ ] **Step 1: 실패하는 RPC 테스트 추가**

`tests/db/phase8-triage.test.ts`의 마지막 `it(...)` 다음, `});`(describe 닫힘) 직전에 추가:

```typescript
  it("auto: 상한 이하 명백 승인 → approved + auto 로그(원자)", async () => {
    const a = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: true, cap: 1_000_000, minConf: 0.8 });
    const ret = await seedReturn({ contractor: a, qty: 2, unit: 400_000 }); // 환불 800,000 ≤ 1,000,000
    await t.asUser(admin);
    const d = (await autoResolve(ret, "approve", 0.9)).rows[0]!.d;
    expect(d).toBe("approve");
    await t.asService();
    expect((await t.db.query("select status from returns where id=$1", [ret])).rows[0]).toEqual({ status: "approved" });
    expect((await t.db.query("select 1 from triage_decisions where return_id=$1 and source='auto' and decision='approve' and refund_amount=800000", [ret])).rows.length).toBe(1);
  });

  it("auto: 상한 초과 → escalate(status 유지) + escalate 로그", async () => {
    const a = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: true, cap: 1_000_000, minConf: 0.8 });
    const ret = await seedReturn({ contractor: a, qty: 3, unit: 400_000 }); // 환불 1,200,000 > 1,000,000
    await t.asUser(admin);
    const d = (await autoResolve(ret, "approve", 0.95)).rows[0]!.d;
    expect(d).toBe("escalate");
    await t.asService();
    expect((await t.db.query("select status from returns where id=$1", [ret])).rows[0]).toEqual({ status: "requested" });
    expect((await t.db.query("select 1 from triage_decisions where return_id=$1 and decision='escalate'", [ret])).rows.length).toBe(1);
  });

  it("auto: 저신뢰 → escalate", async () => {
    const a = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: true, cap: 10_000_000, minConf: 0.8 });
    const ret = await seedReturn({ contractor: a, qty: 1, unit: 100_000 });
    await t.asUser(admin);
    expect((await autoResolve(ret, "approve", 0.5)).rows[0]!.d).toBe("escalate");
  });

  it("auto: 킬스위치 → escalate", async () => {
    const a = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: false, cap: 10_000_000 });
    const ret = await seedReturn({ contractor: a, qty: 1, unit: 100_000 });
    await t.asUser(admin);
    expect((await autoResolve(ret, "approve", 0.99)).rows[0]!.d).toBe("escalate");
  });

  it("auto: 이미 트리아지된 건 재호출 raise(idempotency)", async () => {
    const a = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: true, cap: 10_000_000 });
    const ret = await seedReturn({ contractor: a, qty: 1, unit: 100_000 });
    await t.asUser(admin);
    await autoResolve(ret, "approve", 0.9);
    await expect(autoResolve(ret, "approve", 0.9)).rejects.toThrow(/already triaged/);
  });

  it("auto: requested 아닌 건 raise(not actionable)", async () => {
    const a = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: true, cap: 10_000_000 });
    const ret = await seedReturn({ contractor: a, qty: 1, unit: 100_000, status: "approved" });
    await t.asUser(admin);
    await expect(autoResolve(ret, "approve", 0.9)).rejects.toThrow(/not actionable/);
  });

  it("auto: 비관리자/비서비스 호출 unauthorized", async () => {
    const a = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: true, cap: 10_000_000 });
    const ret = await seedReturn({ contractor: a, qty: 1, unit: 100_000 });
    await t.asUser(a);
    await expect(autoResolve(ret, "approve", 0.9)).rejects.toThrow(/unauthorized/i);
  });

  it("auto: 정책 행 없으면 fail-closed raise", async () => {
    const a = await t.seedUser({ role: "contractor" });
    await t.asService();
    await t.db.query("delete from triage_decisions");
    await t.db.query("delete from triage_policies");
    const ret = await seedReturn({ contractor: a, qty: 1, unit: 100_000 });
    await t.asUser(admin);
    await expect(autoResolve(ret, "approve", 0.9)).rejects.toThrow(/not configured/);
    // 복구(후속 테스트용 정책 시드 재삽입)
    await t.asService();
    await t.db.query("insert into triage_policies (singleton, auto_approve_cap, min_confidence, enabled) values (true,0,0.8,false)");
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/db/phase8-triage.test.ts`
Expected: FAIL — `function triage_auto_resolve_return(...) does not exist`.

- [ ] **Step 3: 자동 RPC를 마이그레이션에 추가**

`supabase/migrations/0013_triage.sql` 끝에 추가:

```sql
-- ---------- RPC: 자동 경로 (DB가 approve vs escalate 결정) ----------
create or replace function public.triage_auto_resolve_return(
  p_return_id uuid,
  p_proposed_decision text,
  p_responsibility text,
  p_confidence numeric,
  p_rationale text
) returns text
  language plpgsql security definer set search_path = public as $$
declare
  v_status   text;
  v_qty      int;
  v_unit     numeric;
  v_refund   numeric;
  v_enabled  boolean;
  v_cap      numeric;
  v_minconf  numeric;
  v_decision text;
begin
  if not (auth.role() = 'service_role' or public.is_admin()) then
    raise exception 'unauthorized';
  end if;

  select status, qty into v_status, v_qty
    from returns where id = p_return_id for update;
  if not found then raise exception 'return not found'; end if;
  if v_status <> 'requested' then
    raise exception 'return not actionable (status=%)', v_status;
  end if;
  if exists (select 1 from triage_decisions where return_id = p_return_id) then
    raise exception 'return already triaged';
  end if;

  select oi.unit_price_snapshot into v_unit
    from order_items oi
    join returns r on r.order_item_id = oi.id
    where r.id = p_return_id;
  v_refund := v_qty * v_unit;

  select enabled, auto_approve_cap, min_confidence
    into v_enabled, v_cap, v_minconf
    from triage_policies where singleton = true;
  if not found then raise exception 'triage policy not configured'; end if;

  if v_enabled
     and p_proposed_decision = 'approve'
     and p_confidence >= v_minconf
     and v_refund <= v_cap then
    v_decision := 'approve';
  else
    v_decision := 'escalate';
  end if;

  if v_decision = 'approve' then
    update returns set status = 'approved' where id = p_return_id;
  end if;

  insert into triage_decisions
    (return_id, source, decision, responsibility, confidence, rationale, refund_amount)
    values (p_return_id, 'auto', v_decision, p_responsibility, p_confidence, p_rationale, v_refund);

  return v_decision;
end;
$$;
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/db/phase8-triage.test.ts`
Expected: PASS (Task 4 테스트 포함 전부 GREEN — RLS/append-only 의존 테스트도 이제 통과).

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/0013_triage.sql tests/db/phase8-triage.test.ts
git commit -m "feat(triage): 자동 트리아지 RPC(DB 권위 결정·fail-closed) + 테스트"
```

---

## Task 6: 관리자 수동·가역 RPC + grants (TDD)

**Files:**
- Modify: `supabase/migrations/0013_triage.sql`
- Modify: `tests/db/phase8-triage.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가**

`tests/db/phase8-triage.test.ts`의 describe 닫힘(`});`) 직전에 추가:

```typescript
  it("admin: 수동 승인은 상한을 오버라이드하되 기록", async () => {
    const a = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: true, cap: 1_000_000 });
    const ret = await seedReturn({ contractor: a, qty: 10, unit: 1_000_000 }); // 환불 10,000,000 ≫ 상한
    await t.asUser(admin);
    await autoResolve(ret, "approve", 0.99); // escalate(상한 초과)
    await t.db.query("select triage_admin_resolve_return($1,$2)", [ret, "approve"]);
    await t.asService();
    expect((await t.db.query("select status from returns where id=$1", [ret])).rows[0]).toEqual({ status: "approved" });
    expect((await t.db.query("select 1 from triage_decisions where return_id=$1 and source='admin' and decision='approve'", [ret])).rows.length).toBe(1);
  });

  it("admin: 비관리자 호출 unauthorized", async () => {
    const a = await t.seedUser({ role: "contractor" });
    const ret = await seedReturn({ contractor: a, qty: 1, unit: 100_000 });
    await t.asUser(a);
    await expect(t.db.query("select triage_admin_resolve_return($1,$2)", [ret, "reject"])).rejects.toThrow(/unauthorized/i);
  });

  it("reverse: 승인 되돌리면 requested 원복 + 상쇄 로그, 재가역 raise", async () => {
    const a = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: true, cap: 10_000_000 });
    const ret = await seedReturn({ contractor: a, qty: 1, unit: 500_000 });
    await t.asUser(admin);
    await autoResolve(ret, "approve", 0.9); // approved
    await t.db.query("select triage_reverse_resolution($1)", [ret]);
    await t.asService();
    expect((await t.db.query("select status from returns where id=$1", [ret])).rows[0]).toEqual({ status: "requested" });
    expect((await t.db.query("select 1 from triage_decisions where return_id=$1 and source='reversal'", [ret])).rows.length).toBe(1);
    await t.asUser(admin);
    await expect(t.db.query("select triage_reverse_resolution($1)", [ret])).rejects.toThrow(/no active resolution/);
  });

  it("reverse: completed 건은 raise", async () => {
    const a = await t.seedUser({ role: "contractor" });
    const ret = await seedReturn({ contractor: a, qty: 1, unit: 100_000, status: "completed" });
    await t.asUser(admin);
    await expect(t.db.query("select triage_reverse_resolution($1)", [ret])).rejects.toThrow(/already completed/);
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/db/phase8-triage.test.ts`
Expected: FAIL — `function triage_admin_resolve_return(...) does not exist`.

- [ ] **Step 3: 수동·가역 RPC + grants를 마이그레이션에 추가**

`supabase/migrations/0013_triage.sql` 끝에 추가:

```sql
-- ---------- RPC: 관리자 수동 결정 (상한 오버라이드 가능, 전부 기록) ----------
create or replace function public.triage_admin_resolve_return(
  p_return_id uuid,
  p_decision text
) returns void
  language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_qty    int;
  v_unit   numeric;
begin
  if not (auth.role() = 'service_role' or public.is_admin()) then
    raise exception 'unauthorized';
  end if;
  if p_decision not in ('approve','reject') then
    raise exception 'invalid decision %', p_decision;
  end if;
  select status, qty into v_status, v_qty from returns where id = p_return_id for update;
  if not found then raise exception 'return not found'; end if;
  if v_status <> 'requested' then
    raise exception 'return not actionable (status=%)', v_status;
  end if;
  select oi.unit_price_snapshot into v_unit
    from order_items oi join returns r on r.order_item_id = oi.id
    where r.id = p_return_id;

  update returns
    set status = (case when p_decision = 'approve' then 'approved' else 'rejected' end)::return_status
    where id = p_return_id;
  insert into triage_decisions
    (return_id, source, decision, responsibility, confidence, rationale, refund_amount, actor)
    values (p_return_id, 'admin', p_decision, 'ambiguous', 1, '관리자 수동 결정', v_qty * v_unit, auth.uid());
end;
$$;

-- ---------- RPC: 관리자 가역 (직전 적용 결정 되돌리기) ----------
create or replace function public.triage_reverse_resolution(p_return_id uuid)
  returns void
  language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_dec    uuid;
  v_refund numeric;
begin
  if not (auth.role() = 'service_role' or public.is_admin()) then
    raise exception 'unauthorized';
  end if;
  select status into v_status from returns where id = p_return_id for update;
  if not found then raise exception 'return not found'; end if;
  if v_status = 'completed' then
    raise exception 'return already completed; cannot reverse';
  end if;
  -- 직전 적용 결정(approve/reject, 아직 상쇄되지 않음)
  select d.id, d.refund_amount into v_dec, v_refund
    from triage_decisions d
    where d.return_id = p_return_id
      and d.source in ('auto','admin')
      and d.decision in ('approve','reject')
      and not exists (select 1 from triage_decisions x where x.reversed_of = d.id)
    order by d.created_at desc
    limit 1;
  if v_dec is null then raise exception 'no active resolution to reverse'; end if;

  update returns set status = 'requested' where id = p_return_id;
  insert into triage_decisions
    (return_id, source, decision, responsibility, confidence, rationale, refund_amount, reversed_of, actor)
    values (p_return_id, 'reversal', 'escalate', 'ambiguous', 0, '관리자 가역', v_refund, v_dec, auth.uid());
end;
$$;

-- ---------- grants (PUBLIC 기본 EXECUTE 회수 후 authenticated/service_role만) ----------
revoke execute on function
  public.triage_auto_resolve_return(uuid, text, text, numeric, text),
  public.triage_admin_resolve_return(uuid, text),
  public.triage_reverse_resolution(uuid)
  from public;
grant execute on function
  public.triage_auto_resolve_return(uuid, text, text, numeric, text),
  public.triage_admin_resolve_return(uuid, text),
  public.triage_reverse_resolution(uuid)
  to authenticated, service_role;
```

- [ ] **Step 4: 테스트 통과 확인 (전체 신규 DB 테스트)**

Run: `npx vitest run tests/db/phase8-triage.test.ts`
Expected: PASS (전부).

- [ ] **Step 5: RED→GREEN 회귀 확인(마이그레이션이 실제 게이트임 증명)**

Run: `npx vitest run tests/db/migration.test.ts tests/db/seed.test.ts`
Expected: PASS — 0013 추가가 기존 시드/마이그레이션 보존을 깨지 않음.

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/0013_triage.sql tests/db/phase8-triage.test.ts
git commit -m "feat(triage): 관리자 수동·가역 RPC + grants (TDD)"
```

---

## Task 7: 관리자 큐 로더

**Files:**
- Create: `lib/data/triage.ts`

> 로더는 Supabase 클라이언트 IO라 단위 테스트하지 않는다(lib/data/agent.ts와 동일 — catch 시 EMPTY). tsc + 화면/E2E로 검증.

- [ ] **Step 1: 로더 작성**

`lib/data/triage.ts`:

```typescript
import "server-only";
import { createServiceSupabase } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import type { TriagePolicy } from "@/lib/types";

export interface TriageQueueRow {
  id: string;
  reason: string;
  qty: number;
  refundAmount: number;
  productName: string;
  lastDecision: string | null;
  lastRationale: string | null;
}

export interface TriageConsole {
  authed: boolean;
  policy: TriagePolicy | null;
  queue: TriageQueueRow[];
}

const EMPTY: TriageConsole = { authed: false, policy: null, queue: [] };

interface RawRow {
  id: string;
  reason: string;
  qty: number;
  order_items: { unit_price_snapshot: number; name_snapshot: string } | null;
  triage_decisions: Array<{ decision: string; rationale: string; created_at: string }>;
}

export async function loadTriageConsole(): Promise<TriageConsole> {
  try {
    if (!(await requireAdmin())) return EMPTY;
    const sb = createServiceSupabase();
    const [{ data: policy }, { data: rows }] = await Promise.all([
      sb.from("triage_policies").select("*").eq("singleton", true).maybeSingle(),
      sb
        .from("returns")
        .select(
          "id, reason, qty, order_items(unit_price_snapshot, name_snapshot), triage_decisions(decision, rationale, created_at)",
        )
        .eq("status", "requested")
        .order("created_at", { ascending: true })
        .limit(100),
    ]);

    const queue: TriageQueueRow[] = ((rows ?? []) as unknown as RawRow[]).map((r) => {
      const unit = r.order_items?.unit_price_snapshot ?? 0;
      const decs = [...(r.triage_decisions ?? [])].sort((a, b) =>
        a.created_at < b.created_at ? 1 : -1,
      );
      const last = decs[0] ?? null;
      return {
        id: r.id,
        reason: r.reason,
        qty: r.qty,
        refundAmount: r.qty * unit,
        productName: r.order_items?.name_snapshot ?? "",
        lastDecision: last?.decision ?? null,
        lastRationale: last?.rationale ?? null,
      };
    });

    return { authed: true, policy: (policy as TriagePolicy) ?? null, queue };
  } catch {
    return EMPTY;
  }
}
```

- [ ] **Step 2: 타입체크 통과 확인**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: 커밋**

```bash
git add lib/data/triage.ts
git commit -m "feat(triage): 관리자 트리아지 큐 로더"
```

---

## Task 8: API 라우트 — 자동 실행(POST) + 정책 수정(PATCH)

**Files:**
- Create: `app/api/triage/route.ts`

- [ ] **Step 1: 라우트 작성**

`app/api/triage/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceSupabase } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { classifyReturnWithAI } from "@/lib/triage/anthropic";
import { classifyReturnFallback, decideTriage } from "@/lib/triage";
import type { TriagePolicy } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PendingRow {
  id: string;
  qty: number;
  reason: string;
  order_items: { unit_price_snapshot: number; name_snapshot: string } | null;
}

/** POST: requested·미트리아지 반품을 일괄 자동 처리. DB가 최종 결정. */
export async function POST() {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
    const sb = createServiceSupabase();
    const { data: policyRow } = await sb
      .from("triage_policies")
      .select("*")
      .eq("singleton", true)
      .maybeSingle();
    const policy = policyRow as TriagePolicy | null;
    if (!policy) {
      return NextResponse.json({ error: "트리아지 정책이 없습니다." }, { status: 422 });
    }

    const { data: rows } = await sb
      .from("returns")
      .select("id, qty, reason, order_items(unit_price_snapshot, name_snapshot)")
      .eq("status", "requested");
    const pending = (rows ?? []) as unknown as PendingRow[];

    let approved = 0;
    let escalated = 0;
    for (const r of pending) {
      const { count } = await sb
        .from("triage_decisions")
        .select("id", { count: "exact", head: true })
        .eq("return_id", r.id);
      if ((count ?? 0) > 0) continue; // 이미 트리아지됨

      const unit = r.order_items?.unit_price_snapshot ?? 0;
      const refund = r.qty * unit;
      const cls =
        (await classifyReturnWithAI({
          reason: r.reason,
          productName: r.order_items?.name_snapshot ?? "",
          qty: r.qty,
          refundAmount: refund,
        })) ?? classifyReturnFallback(r.reason, refund);

      // 서버 사전 평가(DB가 권위적으로 재검증). escalate면 proposed='escalate' 전달.
      const evald = decideTriage(cls, refund, policy);
      const proposed = evald.outcome === "auto_approve" ? "approve" : "escalate";

      const { data: outcome, error } = await sb.rpc("triage_auto_resolve_return", {
        p_return_id: r.id,
        p_proposed_decision: proposed,
        p_responsibility: cls.responsibility,
        p_confidence: cls.confidence,
        p_rationale: cls.rationale,
      });
      if (error) continue;
      if (outcome === "approve") approved += 1;
      else escalated += 1;
    }
    return NextResponse.json({ approved, escalated, processed: approved + escalated });
  } catch (e) {
    console.error("triage run failed:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}

const PolicySchema = z
  .object({
    enabled: z.boolean().optional(),
    auto_approve_cap: z.number().nonnegative().optional(),
    min_confidence: z.number().min(0).max(1).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "no fields" });

/** PATCH: 트리아지 정책(상한·신뢰도·킬스위치) 수정. */
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
      .from("triage_policies")
      .update(parsed.data)
      .eq("singleton", true);
    if (error) {
      return NextResponse.json({ error: "정책 저장에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ status: "saved" });
  } catch (e) {
    console.error("triage policy update failed:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
```

- [ ] **Step 2: 타입체크 통과 확인**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: 커밋**

```bash
git add app/api/triage/route.ts
git commit -m "feat(triage): 자동 트리아지 실행 + 정책 수정 API"
```

---

## Task 9: API 라우트 — 관리자 승인/거부/가역

**Files:**
- Create: `app/api/triage/[id]/route.ts`

- [ ] **Step 1: 라우트 작성**

`app/api/triage/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const Schema = z.object({ action: z.enum(["approve", "reject", "reverse"]) });

/** 트리아지 RPC 에러를 친화 상태/메시지로 매핑(원문 DB 누출 방지). */
function mapRpcError(message: string): { status: number; error: string } {
  if (/unauthorized/i.test(message)) return { status: 403, error: "권한이 없습니다." };
  if (/not found/i.test(message)) return { status: 404, error: "반품을 찾을 수 없습니다." };
  if (/already completed/i.test(message))
    return { status: 409, error: "완료된 반품은 되돌릴 수 없습니다." };
  if (/no active resolution/i.test(message))
    return { status: 409, error: "되돌릴 처리 내역이 없습니다." };
  if (/not actionable/i.test(message)) return { status: 409, error: "이미 처리된 반품입니다." };
  if (/not configured/i.test(message))
    return { status: 422, error: "트리아지 정책이 없습니다." };
  return { status: 500, error: "처리 중 오류가 발생했습니다." };
}

/** 사람 개입: escalate된(또는 requested) 반품을 관리자가 승인/거부/가역. */
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
      const { error } = await sb.rpc("triage_reverse_resolution", { p_return_id: params.id });
      if (error) {
        const m = mapRpcError(error.message);
        return NextResponse.json({ error: m.error }, { status: m.status });
      }
      return NextResponse.json({ status: "reversed" });
    }

    const { error } = await sb.rpc("triage_admin_resolve_return", {
      p_return_id: params.id,
      p_decision: action,
    });
    if (error) {
      const m = mapRpcError(error.message);
      return NextResponse.json({ error: m.error }, { status: m.status });
    }
    return NextResponse.json({ status: action === "approve" ? "approved" : "rejected" });
  } catch (e) {
    console.error("triage action failed:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
```

- [ ] **Step 2: 타입체크 통과 확인**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: 커밋**

```bash
git add "app/api/triage/[id]/route.ts"
git commit -m "feat(triage): 관리자 승인/거부/가역 API"
```

---

## Task 10: E2E 통합 테스트 (분류기 + RPC)

**Files:**
- Test: `tests/e2e/phase8-flow.test.ts`

> 라우트는 HTTP 레이어라 기존 E2E와 동일하게 도메인(순수 분류기 + RPC)으로 전 흐름을 검증한다. 서버 규칙(decideTriage)과 DB 결정이 일치함도 함께 단언(defense-in-depth 일관성).

- [ ] **Step 1: 실패하는 E2E 작성**

`tests/e2e/phase8-flow.test.ts`:

```typescript
/**
 * Phase 8-1 E2E — 반품 접수 → 자동 트리아지(상한 내 자동승인 / 초과 에스컬레이션)
 * → 관리자 수동 결정(오버라이드) → 가역. 순수 분류기 + plpgsql RPC 통합.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "../db/harness";
import { classifyReturnFallback, decideTriage, computeRefundAmount } from "@/lib/triage";
import type { TriagePolicy } from "@/lib/types";

describe("Phase 8 E2E: return triage", () => {
  let t: TestDb;
  let admin: string;

  async function policy(): Promise<TriagePolicy> {
    await t.asService();
    const r = await t.db.query<TriagePolicy>("select * from triage_policies where singleton=true");
    return r.rows[0]!;
  }
  async function seedReturn(contractor: string, qty: number, unit: number, reason: string): Promise<string> {
    await t.asService();
    const prod = (await t.db.query<{ id: string }>("select id from products limit 1")).rows[0]!.id;
    const sup = (await t.db.query<{ id: string }>("select id from suppliers limit 1")).rows[0]!.id;
    const total = unit * qty;
    const order = (await t.db.query<{ id: string }>(
      "insert into orders (contractor_id, payment_method, status, subtotal, total) values ($1,'escrow','pending',$2,$2) returning id",
      [contractor, total],
    )).rows[0]!.id;
    const po = (await t.db.query<{ id: string }>(
      "insert into purchase_orders (order_id, supplier_id, status, subtotal) values ($1,$2,'pending',$3) returning id",
      [order, sup, total],
    )).rows[0]!.id;
    const oi = (await t.db.query<{ id: string }>(
      "insert into order_items (po_id, product_id, name_snapshot, unit_price_snapshot, qty, line_total) values ($1,$2,'타일',$3,$4,$5) returning id",
      [po, prod, unit, qty, total],
    )).rows[0]!.id;
    return (await t.db.query<{ id: string }>(
      "insert into returns (order_item_id, contractor_id, reason, qty, status) values ($1,$2,$3,$4,'requested') returning id",
      [oi, contractor, reason, qty],
    )).rows[0]!.id;
  }
  async function runAuto(ret: string, reason: string, refund: number) {
    const p = await policy();
    const cls = classifyReturnFallback(reason, refund);
    const evald = decideTriage(cls, refund, p);
    const proposed = evald.outcome === "auto_approve" ? "approve" : "escalate";
    await t.asUser(admin);
    const out = (await t.db.query<{ d: string }>(
      "select triage_auto_resolve_return($1,$2,$3,$4,$5) as d",
      [ret, proposed, cls.responsibility, cls.confidence, cls.rationale],
    )).rows[0]!.d;
    // 서버 규칙과 DB 결정 일치(일관성)
    expect(out).toBe(evald.outcome === "auto_approve" ? "approve" : "escalate");
    return out;
  }

  beforeAll(async () => {
    t = await createTestDb();
    admin = await t.seedUser({ role: "admin" });
    await t.asService();
    await t.db.query("update triage_policies set enabled=true, auto_approve_cap=2000000, min_confidence=0.7 where singleton=true");
  });
  afterAll(async () => {
    await t.close();
  });

  it("상한 내 명백 하자 → 자동 승인", async () => {
    const a = await t.seedUser({ role: "contractor" });
    const refund = computeRefundAmount(2, 500_000); // 1,000,000 ≤ 2,000,000
    const ret = await seedReturn(a, 2, 500_000, "타일 불량");
    expect(await runAuto(ret, "타일 불량", refund)).toBe("approve");
    await t.asService();
    expect((await t.db.query("select status from returns where id=$1", [ret])).rows[0]).toEqual({ status: "approved" });
  });

  it("상한 초과 → 에스컬레이션 → 관리자 수동 승인(오버라이드) → 가역", async () => {
    const a = await t.seedUser({ role: "contractor" });
    const refund = computeRefundAmount(10, 500_000); // 5,000,000 > 2,000,000
    const ret = await seedReturn(a, 10, 500_000, "타일 불량");
    expect(await runAuto(ret, "타일 불량", refund)).toBe("escalate");
    await t.asService();
    expect((await t.db.query("select status from returns where id=$1", [ret])).rows[0]).toEqual({ status: "requested" });

    await t.asUser(admin);
    await t.db.query("select triage_admin_resolve_return($1,'approve')", [ret]);
    await t.asService();
    expect((await t.db.query("select status from returns where id=$1", [ret])).rows[0]).toEqual({ status: "approved" });

    await t.asUser(admin);
    await t.db.query("select triage_reverse_resolution($1)", [ret]);
    await t.asService();
    expect((await t.db.query("select status from returns where id=$1", [ret])).rows[0]).toEqual({ status: "requested" });
  });

  it("단순 변심(신호 없음) → 에스컬레이션", async () => {
    const a = await t.seedUser({ role: "contractor" });
    const refund = computeRefundAmount(1, 100_000);
    const ret = await seedReturn(a, 1, 100_000, "그냥 변심");
    expect(await runAuto(ret, "그냥 변심", refund)).toBe("escalate");
  });
});
```

- [ ] **Step 2: 테스트 통과 확인**

Run: `npx vitest run tests/e2e/phase8-flow.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 3: 커밋**

```bash
git add tests/e2e/phase8-flow.test.ts
git commit -m "test(triage): Phase 8 E2E — 자동승인/에스컬레이션/오버라이드/가역"
```

---

## Task 11: 관리자 UI — 컨트롤 + 페이지 + 내비 링크

**Files:**
- Create: `components/triage-controls.tsx`
- Create: `app/admin/triage/page.tsx`
- Modify: `app/admin/page.tsx` (내비 배열에 링크 1개 추가)

- [ ] **Step 1: 클라이언트 컨트롤 작성**

`components/triage-controls.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatKRW } from "@/lib/utils";
import type { TriagePolicy } from "@/lib/types";

export function RunTriageButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/triage", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMsg(`자동 처리: 승인 ${data.approved}건 · 에스컬레이션 ${data.escalated}건`);
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
        {busy ? "처리 중…" : "자동 처리 실행"}
      </Button>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}

export function TriagePolicyForm({ policy }: { policy: TriagePolicy | null }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(policy?.enabled ?? false);
  const [cap, setCap] = useState(String(policy?.auto_approve_cap ?? 0));
  const [minConf, setMinConf] = useState(String(policy?.min_confidence ?? 0.8));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async (patch: Record<string, unknown>) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/triage", {
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
          <p className="text-sm font-semibold">자동 트리아지 {enabled ? "켜짐" : "꺼짐"}</p>
          <p className="text-xs text-muted-foreground">
            상한 {formatKRW(Number(cap) || 0)} 이하 명백 승인만 자동 처리
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
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="cap">자동승인 상한(원)</Label>
          <Input id="cap" type="number" value={cap} onChange={(e) => setCap(e.target.value)} placeholder="1000000" />
        </div>
        <div>
          <Label htmlFor="conf">신뢰도 임계(0~1)</Label>
          <Input id="conf" type="number" step="0.05" value={minConf} onChange={(e) => setMinConf(e.target.value)} placeholder="0.8" />
        </div>
      </div>
      <Button
        onClick={() => void save({ auto_approve_cap: Number(cap), min_confidence: Number(minConf) })}
        disabled={busy}
        variant="outline"
        size="sm"
      >
        한도 저장
      </Button>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}

export function TriageRowActions({ returnId }: { returnId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const act = async (action: "approve" | "reject" | "reverse") => {
    setBusy(true);
    try {
      const res = await fetch(`/api/triage/${returnId}`, {
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
      <Button onClick={() => act("approve")} disabled={busy} size="sm">승인</Button>
      <Button onClick={() => act("reject")} disabled={busy} variant="outline" size="sm">거부</Button>
      <Button onClick={() => act("reverse")} disabled={busy} variant="ghost" size="sm">되돌리기</Button>
    </div>
  );
}
```

- [ ] **Step 2: 관리자 페이지 작성**

`app/admin/triage/page.tsx`:

```tsx
import Link from "next/link";
import { loadTriageConsole } from "@/lib/data/triage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatKRW } from "@/lib/utils";
import { RunTriageButton, TriagePolicyForm, TriageRowActions } from "@/components/triage-controls";

export const dynamic = "force-dynamic";

export default async function TriagePage() {
  const c = await loadTriageConsole();

  if (!c.authed) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <p className="text-sm text-gray-500">관리자 권한이 필요합니다.</p>
        <Link href="/login" className="text-brand">로그인</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-brand">
          ← 운영 콘솔
        </Link>
        <h1 className="text-xl font-bold">반품 트리아지</h1>
        <p className="text-sm text-muted-foreground">
          분류기 제안 → 정책 범위 내 자동 승인 · 나머지는 사람 검토
        </p>
      </div>

      <TriagePolicyForm policy={c.policy} />
      <RunTriageButton />

      <Card>
        <CardHeader>
          <CardTitle>대기 반품 ({c.queue.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {c.queue.length === 0 ? (
            <p className="text-sm text-gray-400">대기 중인 반품이 없습니다.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {c.queue.map((r) => (
                <li key={r.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.productName || "상품"}</p>
                      <p className="truncate text-sm text-gray-500">{r.reason}</p>
                      <p className="text-xs text-muted-foreground">
                        수량 {r.qty} · 환불 {formatKRW(r.refundAmount)}
                      </p>
                      {r.lastDecision && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          최근 분류: {r.lastDecision} — {r.lastRationale}
                        </p>
                      )}
                    </div>
                    <Badge variant="neutral">{r.lastDecision ?? "미처리"}</Badge>
                  </div>
                  <div className="mt-2">
                    <TriageRowActions returnId={r.id} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: 관리자 콘솔 내비에 링크 추가**

`app/admin/page.tsx`의 내비 배열(약 52–57행)에서 `{ href: "/admin/agent-ops", label: "에이전트 현황" },` 다음 줄에 추가:

```tsx
          { href: "/admin/triage", label: "반품 트리아지" },
```

- [ ] **Step 4: 타입체크 + 린트 + 빌드 확인**

Run: `npx tsc --noEmit && npx next lint && npx next build`
Expected: 0 errors · No ESLint warnings or errors · 빌드 성공(`/admin/triage` 라우트 출력).

- [ ] **Step 5: 커밋**

```bash
git add components/triage-controls.tsx app/admin/triage/page.tsx app/admin/page.tsx
git commit -m "feat(triage): 관리자 트리아지 큐 UI + 정책/킬스위치 + 내비 링크"
```

---

## Task 12: 최종 DoD 검증

**Files:** (없음 — 검증만)

- [ ] **Step 1: 전체 게이트 실행**

Run:
```bash
npx tsc --noEmit && npx next lint && npx vitest run && npx next build
```
Expected:
- tsc: 0 errors
- lint: No ESLint warnings or errors
- vitest: 전체 PASS (기존 222 + 신규: unit 9 + db(phase8) ~16 + e2e 3 = **약 250 tests, 0 실패**)
- build: 성공

- [ ] **Step 2: RED→GREEN 증명(0013이 실제 게이트임)**

`supabase/migrations/0013_triage.sql`를 임시로 비활성(파일명을 `0013_triage.sql.bak`로 이동) → `npx vitest run tests/db/phase8-triage.test.ts tests/e2e/phase8-flow.test.ts` → **실패(relation/function 없음)** 확인 → 원복(`0013_triage.sql`) → 재실행 → **통과** 확인.

```bash
mv supabase/migrations/0013_triage.sql supabase/migrations/0013_triage.sql.bak
npx vitest run tests/db/phase8-triage.test.ts   # FAIL 기대
mv supabase/migrations/0013_triage.sql.bak supabase/migrations/0013_triage.sql
npx vitest run tests/db/phase8-triage.test.ts   # PASS 기대
```

- [ ] **Step 3: 스펙 요구사항 체크리스트 대조**

스펙 §3~§10을 한 줄씩 보며 각 항목을 구현 태스크에 매핑(테이블/RPC/RLS/폴백/라우트/UI/테스트). 누락 시 태스크 추가.

- [ ] **Step 4: (선택) 코드리뷰 + 적대적 검증**

`/code-review` 또는 보안/적대적 다중렌즈 검증으로 발견 이슈 반영(스펙 DoD).

---

## Self-Review (작성자 점검 결과)

**1. 스펙 커버리지:** §3 테이블/시드(Task 4) · §4 결정규칙(Task 2 순수 + Task 5 RPC) · §5 RPC 3종(Task 5,6) · §6 RLS(Task 4) · §7 모듈/로더(Task 2,3,7) · §8 라우트/UI(Task 8,9,11) · §9 엣지(Task 5,6 테스트) · §10 테스트(Task 2,4,5,6,10) · §11 DoD(Task 12). 누락 없음.

**2. 플레이스홀더:** 모든 step에 실제 코드/명령 포함. "적절히 처리" 류 없음.

**3. 타입 일관성:** `TriagePolicy`/`ReturnClassification`/`TriageEval`(Task 1) ↔ `decideTriage`/`classifyReturnFallback`(Task 2) ↔ RPC 파라미터(`triage_auto_resolve_return(uuid,text,text,numeric,text)` 등, Task 5,6,8,9) ↔ 로더/페이지(Task 7,11) 시그니처 일치. RPC명·grant 시그니처 동일.

**4. 검증된 사실:** 필드명·enum·헬퍼(`is_admin`/`prevent_audit_mutation`)·모델ID·supabase export·seed 데이터 모두 코드 대조 완료.
