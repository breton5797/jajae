import { describe, it, expect } from "vitest";
import {
  comparePrices,
  buildPriceTrend,
  trendFromPriceHistory,
  trendFromOrderItems,
  lowestPriceAlerts,
} from "@/lib/pricing";
import type { PriceHistory } from "@/lib/types";
import { makeProduct } from "../fixtures";

describe("comparePrices", () => {
  const products = [
    makeProduct({ id: "a", category_id: "tile", supplier_id: "s1", unit_price: 31000 }),
    makeProduct({ id: "b", category_id: "tile", supplier_id: "s2", unit_price: 29000 }),
    makeProduct({ id: "c", category_id: "tile", supplier_id: "s3", unit_price: 35000 }),
    makeProduct({ id: "d", category_id: "paint", supplier_id: "s3", unit_price: 9999 }),
    makeProduct({ id: "e", category_id: "tile", supplier_id: "s4", unit_price: 99999, status: "pending" }),
  ];

  it("sorts cheapest-first and computes stats for approved products only", () => {
    const cmp = comparePrices(products, "tile");
    expect(cmp.count).toBe(3); // pending excluded
    expect(cmp.rows.map((r) => r.productId)).toEqual(["b", "a", "c"]);
    expect(cmp.min).toBe(29000);
    expect(cmp.max).toBe(35000);
    expect(cmp.median).toBe(31000);
    expect(cmp.rows[0]?.isLowest).toBe(true);
    expect(cmp.rows[0]?.savingsVsMax).toBe(6000);
  });
});

describe("price trend", () => {
  it("sorts points chronologically and trims dates", () => {
    const t = buildPriceTrend([
      { date: "2026-05-15T00:00:00Z", price: 29000 },
      { date: "2026-01-15T00:00:00Z", price: 27000 },
      { date: "2026-03-15T00:00:00Z", price: 28000 },
    ]);
    expect(t.map((p) => p.date)).toEqual(["2026-01-15", "2026-03-15", "2026-05-15"]);
    expect(t.map((p) => p.price)).toEqual([27000, 28000, 29000]);
  });

  it("adapts from price_history and order_items", () => {
    const hist: PriceHistory[] = [
      { id: "1", product_id: "p", supplier_id: "s", unit_price: 100, recorded_at: "2026-02-01T00:00:00Z" },
      { id: "2", product_id: "p", supplier_id: "s", unit_price: 120, recorded_at: "2026-01-01T00:00:00Z" },
    ];
    expect(trendFromPriceHistory(hist).map((p) => p.price)).toEqual([120, 100]);

    const items = [
      { created_at: "2026-03-01T00:00:00Z", unit_price_snapshot: 50 },
      { created_at: "2026-02-01T00:00:00Z", unit_price_snapshot: 40 },
    ];
    expect(trendFromOrderItems(items).map((p) => p.price)).toEqual([40, 50]);
  });
});

describe("lowestPriceAlerts", () => {
  const catalog = [
    makeProduct({ id: "cheap", category_id: "tile", unit_price: 25000, stock: 100 }),
    makeProduct({ id: "mid", category_id: "tile", unit_price: 30000, stock: 100 }),
    makeProduct({ id: "oos", category_id: "tile", unit_price: 10000, stock: 0 }),
  ];

  it("flags a cheaper in-stock alternative in the same category", () => {
    const alerts = lowestPriceAlerts(
      [{ productId: "mid", productName: "중간타일", paidPrice: 30000, categoryId: "tile" }],
      catalog,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.cheaperProductId).toBe("cheap"); // not the out-of-stock one
    expect(alerts[0]?.savings).toBe(5000);
    expect(alerts[0]?.savingsPct).toBe(17);
  });

  it("returns nothing when already cheapest", () => {
    const alerts = lowestPriceAlerts(
      [{ productId: "cheap", productName: "x", paidPrice: 25000, categoryId: "tile" }],
      catalog,
    );
    expect(alerts).toHaveLength(0);
  });
});
