import { describe, it, expect } from "vitest";
import {
  computeSupplierRating,
  ratingTier,
  sortProductsByValue,
} from "@/lib/ratings";
import { makeProduct } from "../fixtures";

describe("computeSupplierRating", () => {
  it("blends on-time, reliability, and quality into a 0..5 composite", () => {
    const r = computeSupplierRating({
      deliveredOnTime: 95,
      deliveredTotal: 100,
      returns: 2,
      asCount: 1,
      orderCount: 100,
      qualityReviews: [5, 4, 5, 4, 5],
    });
    // onTime .95, returnRate .03, quality 4.6/5=.92
    // composite = (.4*.95 + .3*.97 + .3*.92)*5 = (0.38+0.291+0.276)*5 = 4.735 → 4.74
    expect(r.onTime).toBe(0.95);
    expect(r.composite).toBeCloseTo(4.74, 1);
    expect(r.tier).toBe("최우수");
    expect(r.reviewCount).toBe(5);
  });

  it("marks a supplier with no orders as 신규 (composite 0)", () => {
    const r = computeSupplierRating({
      deliveredOnTime: 0,
      deliveredTotal: 0,
      returns: 0,
      asCount: 0,
      orderCount: 0,
      qualityReviews: [],
    });
    expect(r.tier).toBe("신규");
    expect(r.composite).toBe(0);
  });

  it("downgrades a poor supplier to 주의", () => {
    const r = computeSupplierRating({
      deliveredOnTime: 50,
      deliveredTotal: 100,
      returns: 30,
      asCount: 10,
      orderCount: 100,
      qualityReviews: [2, 1, 2],
    });
    expect(r.composite).toBeLessThan(3.0);
    expect(r.tier).toBe("주의");
  });
});

describe("ratingTier", () => {
  it("maps composite to tiers", () => {
    expect(ratingTier(4.6, 10)).toBe("최우수");
    expect(ratingTier(4.1, 10)).toBe("우수");
    expect(ratingTier(3.2, 10)).toBe("양호");
    expect(ratingTier(2.0, 10)).toBe("주의");
    expect(ratingTier(5, 0)).toBe("신규");
  });
});

describe("sortProductsByValue", () => {
  it("breaks a same-price tie by supplier rating", () => {
    const lowRated = makeProduct({ id: "low", supplier_id: "s1", unit_price: 10000 });
    const highRated = makeProduct({ id: "high", supplier_id: "s2", unit_price: 10000 });
    const ratings = new Map([
      ["s1", 2.0],
      ["s2", 5.0],
    ]);
    const sorted = sortProductsByValue([lowRated, highRated], ratings);
    expect(sorted[0]?.id).toBe("high");
  });

  it("still prefers a materially cheaper product (price-dominant)", () => {
    const cheap = makeProduct({ id: "cheap", supplier_id: "s1", unit_price: 10000 });
    const dear = makeProduct({ id: "dear", supplier_id: "s2", unit_price: 20000 });
    const ratings = new Map([
      ["s1", 2.0],
      ["s2", 5.0],
    ]);
    expect(sortProductsByValue([cheap, dear], ratings)[0]?.id).toBe("cheap");
  });

  it("returns [] for empty input", () => {
    expect(sortProductsByValue([], new Map())).toEqual([]);
  });
});
