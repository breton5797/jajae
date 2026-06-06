import { describe, it, expect } from "vitest";
import {
  aggregateDemandByPeriod,
  forecastDemand,
  computeReorderSuggestion,
  buildReorderDraft,
  forecastAccuracy,
} from "@/lib/forecast";
import type { PeriodDemand } from "@/lib/types";

describe("aggregateDemandByPeriod", () => {
  it("sums qty per month, ascending", () => {
    const pts = aggregateDemandByPeriod([
      { created_at: "2026-03-05T00:00:00Z", qty: 10 },
      { created_at: "2026-03-20T00:00:00Z", qty: 5 },
      { created_at: "2026-01-10T00:00:00Z", qty: 8 },
    ]);
    expect(pts.map((p) => p.period)).toEqual(["2026-01", "2026-03"]);
    expect(pts.find((p) => p.period === "2026-03")?.qty).toBe(15);
  });
});

describe("forecastDemand", () => {
  it("cold-starts with low confidence when history is short", () => {
    const f = forecastDemand([{ period: "2026-01", qty: 10 }]);
    expect(f.coldStart).toBe(true);
    expect(f.method).toBe("coldStart");
    expect(f.confidence).toBeLessThanOrEqual(0.2);
  });

  it("projects an upward trend with moving average", () => {
    const hist: PeriodDemand[] = [
      { period: "2026-01", qty: 10 },
      { period: "2026-02", qty: 12 },
      { period: "2026-03", qty: 14 },
      { period: "2026-04", qty: 16 },
    ];
    const f = forecastDemand(hist);
    expect(f.coldStart).toBe(false);
    expect(f.predictedQty).toBeGreaterThanOrEqual(14);
    expect(f.confidence).toBeGreaterThan(0.2);
  });
});

describe("computeReorderSuggestion", () => {
  const rule = { threshold: 10, lead_time_days: 7, product_id: "p1" };

  it("flags reorder when stock is below the reorder point", () => {
    const s = computeReorderSuggestion(rule, 300, 50);
    expect(s.reorderPoint).toBe(80); // 10/day*7 + 10
    expect(s.needsReorder).toBe(true);
    expect(s.suggestedQty).toBeGreaterThan(0);
  });

  it("does not reorder when stock is sufficient", () => {
    const s = computeReorderSuggestion(rule, 300, 200);
    expect(s.needsReorder).toBe(false);
    expect(s.suggestedQty).toBe(0);
  });
});

describe("buildReorderDraft", () => {
  it("keeps only items needing reorder", () => {
    const draft = buildReorderDraft([
      { productId: "a", currentStock: 1, reorderPoint: 10, needsReorder: true, suggestedQty: 20 },
      { productId: "b", currentStock: 50, reorderPoint: 10, needsReorder: false, suggestedQty: 0 },
    ]);
    expect(draft).toEqual([{ productId: "a", qty: 20 }]);
  });
});

describe("forecastAccuracy", () => {
  it("is 1 for perfect predictions and lower otherwise", () => {
    expect(forecastAccuracy([{ predicted: 100, actual: 100 }])).toBe(1);
    expect(forecastAccuracy([{ predicted: 80, actual: 100 }])).toBe(0.8);
    expect(forecastAccuracy([])).toBe(0);
  });
});
