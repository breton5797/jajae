import { describe, it, expect } from "vitest";
import { computeAnalytics } from "@/lib/analytics";

describe("computeAnalytics", () => {
  const result = computeAnalytics("2026-06", {
    orders: [
      { contractor_id: "c1", total: 1_030_000, platform_fee: 30_000, status: "fulfilled" },
      { contractor_id: "c1", total: 515_000, platform_fee: 15_000, status: "paid" },
      { contractor_id: "c2", total: 200_000, platform_fee: 6_000, status: "paid" },
      { contractor_id: "c3", total: 999_999, platform_fee: 0, status: "cancelled" }, // excluded
    ],
    items: [
      { is_pb: true, unit_price_snapshot: 36_000, cost: 30_000, qty: 10, supplier_id: "s1" },
      { is_pb: false, unit_price_snapshot: 31_000, cost: null, qty: 10, supplier_id: "s2" },
    ],
    forecastPairs: [
      { predicted: 95, actual: 100 },
      { predicted: 110, actual: 100 },
    ],
  });

  it("computes GMV from counted orders only", () => {
    expect(result.gmv).toBe(1_745_000); // excludes cancelled
  });

  it("computes margin = platform revenue + PB margin", () => {
    // platform fee 30k+15k+6k = 51k ; PB margin (36000-30000)*10 = 60k
    expect(result.margin).toBe(111_000);
  });

  it("computes PB share of item value", () => {
    // pb 360k / total 670k = 0.537 → 0.54
    expect(result.pbShare).toBeCloseTo(0.54, 2);
  });

  it("computes repeat rate (c1 has 2 orders of 2 active)", () => {
    expect(result.repeatRate).toBe(0.5);
  });

  it("ranks supplier performance by value and includes forecast accuracy", () => {
    expect(result.supplierPerf[0]?.supplierId).toBe("s1"); // 360k > 310k
    expect(result.forecastAccuracy).toBeGreaterThan(0);
    expect(result.forecastAccuracy).toBeLessThanOrEqual(1);
  });
});
