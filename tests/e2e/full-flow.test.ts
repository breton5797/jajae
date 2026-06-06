/**
 * DoD #5 — end-to-end contractor flow against real schema + RLS (PGlite) and real
 * domain modules:
 *   login → biz_no verify → AI BOM → cross-category multi-supplier cart →
 *   assign site → Toss test pay → split into ≥3 POs → staged delivery + return/AS.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./../db/harness";
import { generateBom, matchBomToProducts } from "@/lib/ai-quote";
import {
  splitCartIntoPurchaseOrders,
  buildStagedDeliveries,
  persistOrder,
} from "@/lib/orders";
import {
  computeSettlement,
  holdEscrow,
  releaseEscrow,
} from "@/lib/settlement";
import { confirmTossPayment } from "@/lib/payments/toss";
import { isValidBizNo } from "@/lib/utils";
import { PLATFORM_FEE_RATE } from "@/lib/env";
import type {
  BomInput,
  Category,
  Product,
  ResolvedCartLine,
} from "@/lib/types";

const ORDER_DATE = "2026-06-07";

function rowToProduct(r: Record<string, unknown>): Product {
  return {
    id: String(r.id),
    supplier_id: String(r.supplier_id),
    category_id: String(r.category_id),
    name: String(r.name),
    brand: String(r.brand ?? ""),
    spec: (r.spec ?? {}) as Product["spec"],
    unit: r.unit as Product["unit"],
    unit_price: Number(r.unit_price),
    stock: Number(r.stock),
    lead_time_days: Number(r.lead_time_days),
    spec_sheet_url: (r.spec_sheet_url as string | null) ?? null,
    status: r.status as Product["status"],
    created_at: String(r.created_at),
  };
}

describe("E2E: contractor consolidated multi-supplier order", () => {
  let t: TestDb;
  let contractor: string;
  let otherContractor: string;

  beforeAll(async () => {
    t = await createTestDb();
    contractor = await t.seedUser({
      role: "contractor",
      companyName: "행복인테리어",
      bizStatus: "pending",
    });
    otherContractor = await t.seedUser({ role: "contractor" });
  });
  afterAll(async () => {
    await t.close();
  });

  it("runs the full flow and splits into ≥3 purchase orders", async () => {
    // 1) LOGIN (impersonate contractor) ----------------------------------
    await t.asUser(contractor);

    // 2) BIZ_NO VERIFY ----------------------------------------------------
    expect(isValidBizNo("123-45-67890")).toBe(false); // bad number is rejected
    const bizNo = "220-81-62517";
    expect(isValidBizNo(bizNo)).toBe(true);
    await t.db.query(
      "update profiles set biz_no=$1, biz_status='verified' where id=$2",
      [bizNo, contractor],
    );
    const prof = await t.db.query<{ biz_status: string }>(
      "select biz_status from profiles where id=$1",
      [contractor],
    );
    expect(prof.rows[0]?.biz_status).toBe("verified");

    // 3) AI BOM (deterministic; no API key) -------------------------------
    const bomInput: BomInput = {
      projectType: "apartment_remodel",
      areaPyeong: 24,
      dimensions: { bathroomCount: 2 },
      specLevel: "standard",
    };
    const bom = await generateBom(bomInput);
    expect(bom.lines.length).toBeGreaterThanOrEqual(8);

    // load catalog (contractor can read approved products + public categories)
    const catRows = await t.db.query("select * from categories");
    const categories = catRows.rows as unknown as Category[];
    const catIdBySlug = new Map(categories.map((c) => [c.slug, c.id]));

    const prodRows = await t.db.query<Record<string, unknown>>(
      "select * from products where status='approved'",
    );
    const products = prodRows.rows.map(rowToProduct);

    const matched = matchBomToProducts(bom, products, catIdBySlug);
    const matchedLines = matched.lines.filter((l) => l.productId);
    // BOM spans many categories → matched products span multiple suppliers
    const supplierSet = new Set(matchedLines.map((l) => l.supplierId));
    expect(supplierSet.size).toBeGreaterThanOrEqual(3);

    // persist the AI quote for the contractor
    await t.db.query(
      `insert into ai_quotes (contractor_id, project_type, area_pyeong, dimensions, spec_level, result, est_total)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        contractor,
        bomInput.projectType,
        bomInput.areaPyeong,
        JSON.stringify(bomInput.dimensions ?? {}),
        bomInput.specLevel,
        JSON.stringify(matched),
        matched.estTotal,
      ],
    );

    // 4) CROSS-CATEGORY MULTI-SUPPLIER CART -------------------------------
    // one-click add full BOM to cart
    for (const l of matchedLines) {
      await t.db.query(
        `insert into cart_items (contractor_id, product_id, qty) values ($1,$2,$3)
         on conflict (contractor_id, product_id) do update set qty = excluded.qty`,
        [contractor, l.productId, l.qty],
      );
    }
    const cartRows = await t.db.query<Record<string, unknown>>(
      `select ci.qty, p.* from cart_items ci join products p on p.id = ci.product_id
       where ci.contractor_id = $1`,
      [contractor],
    );
    expect(cartRows.rows.length).toBe(matchedLines.length);

    const productById = new Map(products.map((p) => [p.id, p]));
    const resolved: ResolvedCartLine[] = cartRows.rows.map((r) => ({
      product: productById.get(String(r.id))!,
      requestedQty: Number(r.qty),
    }));

    // force a partial stockout on one line → exercises backorder + staged delivery
    const stockoutLine = resolved.reduce((lo, l) =>
      l.product.stock < lo.product.stock ? l : lo,
    );
    stockoutLine.requestedQty = stockoutLine.product.stock + 25;

    // 5) ASSIGN SITE (현장) ------------------------------------------------
    const site = await t.db.query<{ id: string }>(
      "insert into sites (contractor_id, name, address, scheduled_date) values ($1,$2,$3,$4) returning id",
      [contractor, "반포 자이 84㎡", "서울시 서초구 반포동", "2026-06-20"],
    );
    const siteId = site.rows[0]!.id;

    // 6) SPLIT into per-supplier POs + staged deliveries ------------------
    const split = splitCartIntoPurchaseOrders(
      resolved,
      PLATFORM_FEE_RATE,
      ORDER_DATE,
    );
    expect(split.purchaseOrders.length).toBeGreaterThanOrEqual(3);
    expect(split.hasBackorder).toBe(true);

    const stages = buildStagedDeliveries(split, ORDER_DATE);
    expect(stages.length).toBeGreaterThan(split.purchaseOrders.length); // mixed lead-times → extra stages
    expect(stages.some((s) => s.isBackorder)).toBe(true);

    // 7) TOSS TEST PAYMENT (escrow) --------------------------------------
    const pay = await confirmTossPayment(
      { paymentKey: "test_pay_key_001", orderId: "client-order-1", amount: split.total },
      `${ORDER_DATE}T10:00:00.000Z`,
    );
    expect(pay.ok).toBe(true);
    const escrow = holdEscrow();
    expect(escrow.paymentStatus).toBe("held");

    // 8) PERSIST order graph under RLS (contractor role) ------------------
    const { orderId, poIds } = await persistOrder(
      t.executor,
      {
        contractorId: contractor,
        siteId,
        paymentMethod: "escrow",
        paymentStatus: "held",
        orderStatus: "paid",
        tossPaymentKey: pay.ok ? pay.value.paymentKey : null,
      },
      split,
      stages,
    );
    expect(poIds.length).toBeGreaterThanOrEqual(3);

    // verify persisted graph is readable by the owner
    const pos = await t.db.query("select * from purchase_orders where order_id=$1", [orderId]);
    expect(pos.rows.length).toBe(split.purchaseOrders.length);
    const deliveries = await t.db.query(
      "select d.* from deliveries d join purchase_orders po on po.id=d.po_id where po.order_id=$1",
      [orderId],
    );
    expect(deliveries.rows.length).toBe(stages.length);

    // 9) SETTLEMENT per supplier (platform action) -----------------------
    await t.asService();
    for (const po of split.purchaseOrders) {
      const poRow = await t.db.query<{ id: string }>(
        "select id from purchase_orders where order_id=$1 and supplier_id=$2",
        [orderId, po.supplierId],
      );
      const s = computeSettlement(po.subtotal, PLATFORM_FEE_RATE);
      await t.db.query(
        `insert into settlements (po_id, supplier_id, gross, platform_fee, net, status)
         values ($1,$2,$3,$4,$5,'held')`,
        [poRow.rows[0]!.id, po.supplierId, s.gross, s.platformFee, s.net],
      );
    }
    const settle = await t.db.query<{ n: number }>(
      `select count(*)::int n from settlements s
         join purchase_orders po on po.id = s.po_id where po.order_id=$1`,
      [orderId],
    );
    expect(Number(settle.rows[0]?.n)).toBe(split.purchaseOrders.length);

    // 10) RETURN + AS request (operational ownership) --------------------
    await t.asUser(contractor);
    const items = await t.db.query<{ id: string }>(
      `select oi.id from order_items oi
         join purchase_orders po on po.id = oi.po_id where po.order_id=$1 limit 2`,
      [orderId],
    );
    const itemForReturn = items.rows[0]!.id;
    const itemForAs = items.rows[1]?.id ?? items.rows[0]!.id;

    await t.db.query(
      `insert into returns (order_item_id, contractor_id, reason, qty) values ($1,$2,$3,$4)`,
      [itemForReturn, contractor, "파손 도착", 1],
    );
    await t.db.query(
      `insert into as_requests (order_item_id, contractor_id, site_id, issue) values ($1,$2,$3,$4)`,
      [itemForAs, contractor, siteId, "시공 후 누수 발생"],
    );

    const myReturns = await t.db.query("select * from returns");
    const myAs = await t.db.query("select * from as_requests");
    expect(myReturns.rows.length).toBe(1);
    expect(myAs.rows.length).toBe(1);

    // another contractor cannot see them
    await t.asUser(otherContractor);
    expect((await t.db.query("select * from returns")).rows.length).toBe(0);
    expect((await t.db.query("select * from as_requests")).rows.length).toBe(0);

    // 11) STAGED DELIVERY progression + escrow release -------------------
    await t.asService();
    const firstDelivery = await t.db.query<{ id: string }>(
      "select d.id from deliveries d join purchase_orders po on po.id=d.po_id where po.order_id=$1 order by d.scheduled_date limit 1",
      [orderId],
    );
    await t.db.query(
      "update deliveries set status='delivered', delivered_at=now() where id=$1",
      [firstDelivery.rows[0]!.id],
    );
    const released = releaseEscrow(escrow, "2026-06-20");
    expect(released.ok).toBe(true);
  });
});
