import { describe, it, expect } from "vitest";
import {
  evaluatePlan,
  assertWithinPolicy,
  isKillSwitched,
  sumNetAgentSpend,
} from "@/lib/policy";
import type { AgentPolicy, PlanItem } from "@/lib/types";

function policy(over: Partial<AgentPolicy> = {}): AgentPolicy {
  return {
    id: "pol",
    contractor_id: "c1",
    spend_cap: over.spend_cap ?? 10_000_000,
    supplier_allowlist: over.supplier_allowlist ?? ["s1", "s2"],
    max_po: over.max_po ?? 3_000_000,
    escalation_threshold: over.escalation_threshold ?? 2_000_000,
    category_limits: over.category_limits ?? {},
    enabled: over.enabled ?? true,
    created_at: "2026-01-01T00:00:00Z",
  };
}
const item = (over: Partial<PlanItem>): PlanItem => ({
  productId: over.productId ?? "p1",
  supplierId: over.supplierId ?? "s1",
  qty: over.qty ?? 10,
  amount: over.amount ?? 1_000_000,
  categoryId: over.categoryId,
  rationale: "test",
});

describe("evaluatePlan", () => {
  it("auto-approves items within all limits", () => {
    const r = evaluatePlan([item({ amount: 1_000_000 })], policy());
    expect(r.autoItems).toHaveLength(1);
    expect(r.evals[0]?.decision).toBe("auto");
  });

  it("rejects non-allowlisted suppliers", () => {
    const r = evaluatePlan([item({ supplierId: "rogue" })], policy());
    expect(r.rejectedItems).toHaveLength(1);
    expect(r.evals[0]?.decision).toBe("reject");
  });

  it("escalates above max_po (server blocks auto even if agent proposes it)", () => {
    const r = evaluatePlan([item({ amount: 5_000_000 })], policy());
    expect(r.autoItems).toHaveLength(0);
    expect(r.escalateItems).toHaveLength(1);
  });

  it("escalates above the escalation threshold", () => {
    const r = evaluatePlan([item({ amount: 2_500_000 })], policy());
    expect(r.evals[0]?.decision).toBe("escalate");
  });

  it("escalates when cumulative spend exceeds the cap", () => {
    const r = evaluatePlan(
      [item({ amount: 1_500_000 }), item({ amount: 1_500_000 })],
      policy({ spend_cap: 2_000_000, escalation_threshold: 0 }),
    );
    expect(r.autoItems).toHaveLength(1); // first fits
    expect(r.escalateItems).toHaveLength(1); // second exceeds cap
  });

  it("halts entirely when the kill-switch is off", () => {
    const r = evaluatePlan([item({}), item({})], policy({ enabled: false }));
    expect(r.halted).toBe(true);
    expect(r.autoItems).toHaveLength(0);
    expect(r.evals.every((e) => e.decision === "halt")).toBe(true);
  });

  it("respects per-category limits", () => {
    const r = evaluatePlan(
      [item({ amount: 1_500_000, categoryId: "tile" })],
      policy({ category_limits: { tile: 1_000_000 }, escalation_threshold: 0 }),
    );
    expect(r.evals[0]?.decision).toBe("escalate");
  });
});

describe("sumNetAgentSpend", () => {
  it("counts auto_po AND approve_execute, subtracts reversals, ignores others", () => {
    expect(
      sumNetAgentSpend([
        { action: "auto_po", amount: 1_500_000 },
        { action: "approve_execute", amount: 9_000_000 }, // human-approved agent spend counts
        { action: "reversal", amount: 500_000 },
        { action: "reject", amount: 0 }, // ignored
      ]),
    ).toBe(10_000_000);
  });
  it("returns 0 for no history", () => {
    expect(sumNetAgentSpend([])).toBe(0);
  });
  it("never goes negative when reversals exceed spend", () => {
    expect(sumNetAgentSpend([{ action: "reversal", amount: 5_000_000 }])).toBe(0);
  });
});

describe("assertWithinPolicy + kill switch", () => {
  it("gates a single item server-side", () => {
    expect(assertWithinPolicy(item({ amount: 1_000_000 }), policy(), 0)).toBe(true);
    expect(assertWithinPolicy(item({ amount: 5_000_000 }), policy(), 0)).toBe(false);
    expect(assertWithinPolicy(item({}), policy({ enabled: false }), 0)).toBe(false);
  });
  it("isKillSwitched reflects enabled", () => {
    expect(isKillSwitched({ enabled: false })).toBe(true);
    expect(isKillSwitched({ enabled: true })).toBe(false);
  });
});
