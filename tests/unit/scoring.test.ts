import { describe, it, expect } from "vitest";
import {
  computeCreditScore,
  scoreToFinanceOffer,
  gradeFromScore,
} from "@/lib/scoring";

describe("computeCreditScore", () => {
  it("scores a strong contractor highly", () => {
    const r = computeCreditScore({
      orderCount: 120,
      gmv: 60_000_000,
      onTimeSettlementRate: 0.98,
      returnRate: 0.02,
      tenureMonths: 30,
    });
    expect(r.coldStart).toBe(false);
    expect(r.score).toBeGreaterThanOrEqual(850);
    expect(r.grade).toBe("AAA");
  });

  it("cold-starts a brand-new contractor at NEW/300", () => {
    const r = computeCreditScore({
      orderCount: 0,
      gmv: 0,
      onTimeSettlementRate: 0,
      returnRate: 0,
      tenureMonths: 0,
    });
    expect(r.coldStart).toBe(true);
    expect(r.grade).toBe("NEW");
    expect(r.score).toBe(300);
  });

  it("exposes factor CONTRIBUTIONS but never raw model weights", () => {
    const r = computeCreditScore({
      orderCount: 10,
      gmv: 10_000_000,
      onTimeSettlementRate: 0.8,
      returnRate: 0.1,
      tenureMonths: 12,
    });
    expect(r.factors.length).toBe(4);
    for (const f of r.factors) {
      expect(Object.keys(f).sort()).toEqual(["contribution", "key", "label", "value"]);
      expect(f).not.toHaveProperty("weight");
      expect(f).not.toHaveProperty("w");
    }
  });
});

describe("scoreToFinanceOffer", () => {
  it("offers a high limit for AAA and blocks NEW/C", () => {
    const aaa = scoreToFinanceOffer({ score: 900, grade: "AAA", factors: [], coldStart: false });
    expect(aaa.eligible).toBe(true);
    expect(aaa.limit).toBeGreaterThan(0);

    const fresh = scoreToFinanceOffer({ score: 300, grade: "NEW", factors: [], coldStart: true });
    expect(fresh.eligible).toBe(false);
  });
});

describe("gradeFromScore", () => {
  it("maps scores to grades", () => {
    expect(gradeFromScore(900, false)).toBe("AAA");
    expect(gradeFromScore(800, false)).toBe("AA");
    expect(gradeFromScore(700, false)).toBe("A");
    expect(gradeFromScore(550, false)).toBe("B");
    expect(gradeFromScore(400, false)).toBe("C");
    expect(gradeFromScore(900, true)).toBe("NEW");
  });
});
