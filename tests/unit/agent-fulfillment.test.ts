import { describe, it, expect } from "vitest";
import { planReorders } from "@/lib/agent";
import { routeOrderLine, etaDate, deductHubStock } from "@/lib/fulfillment";
import { makeProduct } from "../fixtures";
import type { HubStock } from "@/lib/fulfillment";

describe("agent planReorders", () => {
  it("proposes POs with rationale from reorder signals", () => {
    const products = [
      makeProduct({ id: "p1", supplier_id: "s1", unit_price: 30000, stock: 5 }),
      makeProduct({ id: "p2", supplier_id: "s2", unit_price: 7800, stock: 0 }),
    ];
    const plan = planReorders(
      [
        { productId: "p1", suggestedQty: 100 },
        { productId: "p2", suggestedQty: 200 },
        { productId: "missing", suggestedQty: 5 },
        { productId: "p1", suggestedQty: 0 },
      ],
      products,
    );
    expect(plan.items).toHaveLength(2);
    expect(plan.source).toBe("deterministic");
    const p1 = plan.items.find((i) => i.productId === "p1")!;
    expect(p1.amount).toBe(3_000_000);
    expect(p1.supplierId).toBe("s1");
    expect(p1.rationale).toContain("재발주");
  });
});

describe("fulfillment routeOrderLine", () => {
  const hubs: HubStock[] = [
    { hubId: "near", qty: 500, lat: 37.5, lng: 127.04 },
    { hubId: "far", qty: 500, lat: 35.1, lng: 129.0 },
  ];

  it("routes to the nearest hub with stock for same-day dispatch", () => {
    const r = routeOrderLine(100, hubs, {
      siteLat: 37.51,
      siteLng: 127.05,
      supplierLeadDays: 7,
    });
    expect(r.source).toBe("hub");
    expect(r.hubId).toBe("near");
    expect(r.etaDays).toBe(0);
  });

  it("falls back to dropship when no hub has enough stock", () => {
    const r = routeOrderLine(1000, hubs, { supplierLeadDays: 5 });
    expect(r.source).toBe("dropship");
    expect(r.hubId).toBeNull();
    expect(r.etaDays).toBe(5);
    expect(r.reason).toContain("부족");
  });

  it("dropships when there are no hubs at all", () => {
    const r = routeOrderLine(10, [], { supplierLeadDays: 3 });
    expect(r.source).toBe("dropship");
  });
});

describe("eta + hub stock", () => {
  it("computes eta date and deducts inventory", () => {
    expect(etaDate("2026-06-07", 0)).toBe("2026-06-07");
    expect(etaDate("2026-06-07", 5)).toBe("2026-06-12");
    expect(deductHubStock(100, 30)).toBe(70);
    expect(deductHubStock(20, 50)).toBe(0);
  });
});
