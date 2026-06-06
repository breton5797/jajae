import { describe, it, expect } from "vitest";
import {
  computeSiteBudget,
  buildOrderTimeline,
  scheduleProgress,
} from "@/lib/projects";
import type { Order, SiteTask } from "@/lib/types";

function order(over: Partial<Order>): Order {
  return {
    id: over.id ?? "o",
    contractor_id: "c",
    site_id: "site",
    status: over.status ?? "paid",
    payment_method: "escrow",
    payment_status: "held",
    subtotal: 0,
    platform_fee: 0,
    total: over.total ?? 0,
    toss_payment_key: null,
    created_at: over.created_at ?? "2026-06-01T00:00:00Z",
  };
}

describe("computeSiteBudget", () => {
  it("sums non-cancelled spend and computes burn ratio", () => {
    const b = computeSiteBudget(10_000_000, [
      order({ total: 3_000_000 }),
      order({ total: 2_000_000 }),
      order({ total: 5_000_000, status: "cancelled" }),
    ]);
    expect(b.spent).toBe(5_000_000);
    expect(b.remaining).toBe(5_000_000);
    expect(b.burnRatio).toBe(0.5);
    expect(b.overBudget).toBe(false);
  });

  it("flags over-budget", () => {
    const b = computeSiteBudget(1_000_000, [order({ total: 1_500_000 })]);
    expect(b.overBudget).toBe(true);
    expect(b.remaining).toBe(-500_000);
  });
});

describe("buildOrderTimeline", () => {
  it("orders chronologically with running cumulative", () => {
    const t = buildOrderTimeline([
      order({ id: "b", total: 200, created_at: "2026-06-03T00:00:00Z" }),
      order({ id: "a", total: 100, created_at: "2026-06-01T00:00:00Z" }),
      order({ id: "x", total: 999, created_at: "2026-06-02T00:00:00Z", status: "cancelled" }),
    ]);
    expect(t.map((p) => p.orderId)).toEqual(["a", "b"]);
    expect(t.map((p) => p.cumulative)).toEqual([100, 300]);
  });
});

describe("scheduleProgress", () => {
  const task = (over: Partial<SiteTask>): SiteTask => ({
    id: over.id ?? "t",
    site_id: "s",
    contractor_id: "c",
    title: over.title ?? "작업",
    phase: over.phase ?? "",
    planned_date: over.planned_date ?? null,
    done: over.done ?? false,
    created_at: "2026-06-01T00:00:00Z",
  });

  it("computes completion ratio and the next pending task by date", () => {
    const p = scheduleProgress([
      task({ id: "1", done: true }),
      task({ id: "2", done: false, planned_date: "2026-06-20" }),
      task({ id: "3", done: false, planned_date: "2026-06-10" }),
    ]);
    expect(p.total).toBe(3);
    expect(p.done).toBe(1);
    expect(p.ratio).toBeCloseTo(0.33, 2);
    expect(p.nextTask?.id).toBe("3"); // earliest planned pending
  });

  it("handles empty schedule", () => {
    const p = scheduleProgress([]);
    expect(p.ratio).toBe(0);
    expect(p.nextTask).toBeNull();
  });
});
