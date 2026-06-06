import { describe, it, expect } from "vitest";
import { computePbPrice, recommendPbCandidates, buildPbProduct } from "@/lib/pb";
import type { CategoryDemand } from "@/lib/types";

describe("computePbPrice", () => {
  it("bakes margin into the retail price", () => {
    expect(computePbPrice(10_000, 0.2)).toBe(12_000);
    expect(computePbPrice(7800, 0.15)).toBe(8970);
  });
});

describe("recommendPbCandidates", () => {
  const demands: CategoryDemand[] = [
    { categoryId: "tile", categoryName: "타일", totalQty: 500, orderCount: 40, avgPrice: 30000 },
    { categoryId: "cement", categoryName: "시멘트", totalQty: 2000, orderCount: 60, avgPrice: 7800 },
    { categoryId: "lighting", categoryName: "조명", totalQty: 50, orderCount: 5, avgPrice: 28000 },
  ];

  it("ranks by estimated total margin and assigns ranks", () => {
    const ranked = recommendPbCandidates(demands);
    expect(ranked[0]?.rank).toBe(1);
    expect(ranked.length).toBe(3);
    // tile: 500*30000*~0.26 ≈ 3.9M ; cement: 2000*7800*~0.27 ≈ 4.2M  → cement #1 region
    expect(ranked[0]?.score).toBeGreaterThanOrEqual(ranked[1]?.score ?? 0);
    expect(ranked[ranked.length - 1]?.categoryId).toBe("lighting"); // lowest
  });

  it("respects the limit", () => {
    expect(recommendPbCandidates(demands, 2)).toHaveLength(2);
  });
});

describe("buildPbProduct", () => {
  it("produces product + pb rows with margin baked in", () => {
    const rows = buildPbProduct({
      name: "자재 PB 강마루",
      sku: "PB-FLR-001",
      categoryId: "flooring",
      supplierId: "sup-1",
      cost: 30000,
      marginRate: 0.2,
      unit: "m2",
      stock: 500,
    });
    expect(rows.product.is_pb).toBe(true);
    expect(rows.product.unit_price).toBe(36000);
    expect(rows.product.status).toBe("approved");
    expect(rows.pb.sku).toBe("PB-FLR-001");
    expect(rows.pb.cost).toBe(30000);
  });
});
