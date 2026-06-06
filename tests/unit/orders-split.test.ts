import { describe, it, expect } from "vitest";
import {
  splitCartIntoPurchaseOrders,
  buildStagedDeliveries,
  BACKORDER_RESTOCK_DAYS,
} from "@/lib/orders";
import { makeProduct, line } from "../fixtures";

const FEE = 0.03;
const DATE = "2026-06-07";

describe("splitCartIntoPurchaseOrders", () => {
  it("splits a cross-supplier cart into one PO per supplier", () => {
    const a = makeProduct({ supplier_id: "s1", unit_price: 1000, stock: 100 });
    const b = makeProduct({ supplier_id: "s2", unit_price: 2000, stock: 100 });
    const c = makeProduct({ supplier_id: "s1", unit_price: 500, stock: 100 });

    const res = splitCartIntoPurchaseOrders(
      [line(a, 3), line(b, 2), line(c, 4)],
      FEE,
      DATE,
    );

    expect(res.purchaseOrders).toHaveLength(2);
    const s1 = res.purchaseOrders.find((p) => p.supplierId === "s1")!;
    const s2 = res.purchaseOrders.find((p) => p.supplierId === "s2")!;
    expect(s1.items).toHaveLength(2);
    expect(s1.subtotal).toBe(1000 * 3 + 500 * 4); // 5000
    expect(s2.subtotal).toBe(2000 * 2); // 4000
  });

  it("computes platform fee per PO and order totals", () => {
    const a = makeProduct({ supplier_id: "s1", unit_price: 100000, stock: 100 });
    const res = splitCartIntoPurchaseOrders([line(a, 1)], FEE, DATE);
    expect(res.subtotal).toBe(100000);
    expect(res.platformFee).toBe(3000);
    expect(res.total).toBe(103000);
  });

  it("handles partial stockout by splitting fulfilled vs backordered qty", () => {
    const a = makeProduct({ supplier_id: "s1", stock: 50, unit_price: 1000 });
    const res = splitCartIntoPurchaseOrders([line(a, 80)], FEE, DATE);
    const item = res.purchaseOrders[0]!.items[0]!;
    expect(item.fulfilledQty).toBe(50);
    expect(item.backorderedQty).toBe(30);
    expect(item.backordered).toBe(true);
    expect(res.hasBackorder).toBe(true);
    // still charges for the full requested qty
    expect(item.lineTotal).toBe(80 * 1000);
  });

  it("ignores zero/negative qty lines and empty carts", () => {
    const a = makeProduct({ supplier_id: "s1" });
    expect(splitCartIntoPurchaseOrders([], FEE, DATE).purchaseOrders).toHaveLength(0);
    expect(
      splitCartIntoPurchaseOrders([line(a, 0)], FEE, DATE).purchaseOrders,
    ).toHaveLength(0);
  });

  it("produces deterministic supplier ordering", () => {
    const a = makeProduct({ supplier_id: "sZ" });
    const b = makeProduct({ supplier_id: "sA" });
    const res = splitCartIntoPurchaseOrders([line(a, 1), line(b, 1)], FEE, DATE);
    expect(res.purchaseOrders.map((p) => p.supplierId)).toEqual(["sA", "sZ"]);
  });
});

describe("buildStagedDeliveries", () => {
  it("creates separate stages for mixed lead-times within a supplier", () => {
    const fast = makeProduct({ supplier_id: "s1", lead_time_days: 2, stock: 100 });
    const slow = makeProduct({ supplier_id: "s1", lead_time_days: 10, stock: 100 });
    const split = splitCartIntoPurchaseOrders(
      [line(fast, 1), line(slow, 1)],
      FEE,
      DATE,
    );
    const stages = buildStagedDeliveries(split, DATE);
    expect(stages).toHaveLength(2);
    expect(stages[0]!.scheduledDate).toBe("2026-06-09"); // +2d
    expect(stages[1]!.scheduledDate).toBe("2026-06-17"); // +10d
  });

  it("schedules backordered qty as a later stage with restock delay", () => {
    const p = makeProduct({ supplier_id: "s1", lead_time_days: 5, stock: 10 });
    const split = splitCartIntoPurchaseOrders([line(p, 30)], FEE, DATE);
    const stages = buildStagedDeliveries(split, DATE);
    // one in-stock stage (+5d) and one backorder stage (+5+14d)
    expect(stages).toHaveLength(2);
    const dates = stages.map((s) => s.scheduledDate);
    expect(dates).toContain("2026-06-12"); // +5
    expect(dates).toContain("2026-06-26"); // +5+14
    expect(stages.find((s) => s.isBackorder)!.leadTimeDays).toBe(
      5 + BACKORDER_RESTOCK_DAYS,
    );
  });
});
