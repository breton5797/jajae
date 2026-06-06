import { describe, it, expect } from "vitest";
import {
  sortTiers,
  currentTier,
  priceForQty,
  applyJoin,
  closeGroupBuy,
} from "@/lib/groupbuy";
import type { GroupBuyTier } from "@/lib/types";

const TIERS: GroupBuyTier[] = [
  { minQty: 1, unitPrice: 10000 },
  { minQty: 50, unitPrice: 9000 },
  { minQty: 100, unitPrice: 8000 },
];

describe("tier pricing", () => {
  it("sorts tiers and unlocks the lowest price reached", () => {
    expect(sortTiers([...TIERS].reverse()).map((t) => t.minQty)).toEqual([1, 50, 100]);
    expect(currentTier(0, TIERS)).toBeNull();
    expect(currentTier(49, TIERS)?.unitPrice).toBe(10000);
    expect(currentTier(50, TIERS)?.unitPrice).toBe(9000); // boundary inclusive
    expect(currentTier(150, TIERS)?.unitPrice).toBe(8000);
  });

  it("priceForQty falls back to base tier below the first threshold", () => {
    expect(priceForQty(0, TIERS)).toBe(10000);
    expect(priceForQty(120, TIERS)).toBe(8000);
  });
});

describe("applyJoin", () => {
  it("aggregates joins and drops price as volume grows", () => {
    let state = applyJoin([], "A", 30, TIERS);
    expect(state.joinedQty).toBe(30);
    expect(state.unitPrice).toBe(10000);

    state = applyJoin(state.joins, "B", 80, TIERS);
    expect(state.joinedQty).toBe(110);
    expect(state.unitPrice).toBe(8000); // crossed 100 tier
    expect(state.unlockedTier?.minQty).toBe(100);
  });

  it("replaces an existing contractor's join (idempotent per contractor)", () => {
    const first = applyJoin([], "A", 10, TIERS);
    const second = applyJoin(first.joins, "A", 60, TIERS);
    expect(second.joins).toHaveLength(1);
    expect(second.joinedQty).toBe(60);
  });
});

describe("closeGroupBuy", () => {
  it("closes into per-contractor orders at the final tier price when min met", () => {
    const res = closeGroupBuy(
      { minQty: 100, tiers: TIERS },
      [
        { contractorId: "A", qty: 40 },
        { contractorId: "B", qty: 70 },
      ],
    );
    expect(res.status).toBe("closed");
    expect(res.totalQty).toBe(110);
    expect(res.finalUnitPrice).toBe(8000);
    expect(res.orders).toHaveLength(2);
    const a = res.orders.find((o) => o.contractorId === "A");
    expect(a?.amount).toBe(40 * 8000);
  });

  it("cancels when minimum quantity is not met", () => {
    const res = closeGroupBuy(
      { minQty: 100, tiers: TIERS },
      [{ contractorId: "A", qty: 30 }],
    );
    expect(res.status).toBe("cancelled");
    expect(res.orders).toHaveLength(0);
    expect(res.finalUnitPrice).toBeNull();
    expect(res.reason).toContain("최소 수량");
  });
});
