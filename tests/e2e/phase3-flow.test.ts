/**
 * DoD #5 — Phase 3 monetization E2E against real schema + RLS (PGlite):
 * AI PB report → create PB SKU (appears in catalog) → open group-buy → 2 joins →
 * tier price drops → close into POs → month-end settlement → e-tax invoice issued
 * → credit usage updated → overdue blocks new credit order.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./../db/harness";
import { recommendPbCandidates, buildPbProduct } from "@/lib/pb";
import { applyJoin, priceForQty, closeGroupBuy } from "@/lib/groupbuy";
import {
  buildMonthlySettlement,
  applyCreditCharge,
  canPlaceCreditOrder,
} from "@/lib/finance";
import { issueTaxInvoice, splitVat } from "@/lib/finance/popbill";
import type {
  CategoryDemand,
  CreditAccount,
  GroupBuyTier,
} from "@/lib/types";

const SUPPLIER_HANIL = "33333333-0000-0000-0000-000000000001";
const FLOORING_CAT = "11111111-0000-0000-0000-000000000002";

describe("Phase 3 E2E: PB → group-buy → settlement → invoice → credit", () => {
  let t: TestDb;
  let A: string;
  let B: string;
  let supplierX: string;

  beforeAll(async () => {
    t = await createTestDb();
    A = await t.seedUser({ role: "contractor", companyName: "에이", bizStatus: "verified" });
    B = await t.seedUser({ role: "contractor", companyName: "비", bizStatus: "verified" });
    supplierX = await t.seedUser({ role: "supplier", companyName: "한일" });
    await t.linkSupplier(SUPPLIER_HANIL, supplierX);
  });
  afterAll(async () => {
    await t.close();
  });

  it("runs the full monetization flow", async () => {
    // 1) AI PB REPORT (deterministic ranking over demand) -----------------
    const demand: CategoryDemand[] = [
      { categoryId: FLOORING_CAT, categoryName: "바닥재", totalQty: 1200, orderCount: 50, avgPrice: 37000 },
      { categoryId: "11111111-0000-0000-0000-000000000004", categoryName: "페인트", totalQty: 200, orderCount: 12, avgPrice: 43000 },
    ];
    const candidates = recommendPbCandidates(demand);
    expect(candidates[0]?.rank).toBe(1);
    expect(candidates[0]?.categoryId).toBe(FLOORING_CAT); // highest margin×volume

    // 2) CREATE PB SKU (admin/service) → appears in catalog ---------------
    const rows = buildPbProduct({
      name: "자재PB 강마루 프리미엄",
      sku: "PB-FLR-0001",
      categoryId: FLOORING_CAT,
      supplierId: SUPPLIER_HANIL,
      cost: 30000,
      marginRate: 0.2,
      unit: "m2",
      stock: 5000,
      leadTimeDays: 5,
    });
    await t.asService();
    const prod = await t.db.query<{ id: string }>(
      `insert into products
        (supplier_id, category_id, name, brand, spec, unit, unit_price, stock, lead_time_days, status, is_pb, cost, margin_rate)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'approved',true,$10,$11) returning id`,
      [
        rows.product.supplier_id, rows.product.category_id, rows.product.name,
        rows.product.brand, JSON.stringify(rows.product.spec), rows.product.unit,
        rows.product.unit_price, rows.product.stock, rows.product.lead_time_days,
        rows.product.cost, rows.product.margin_rate,
      ],
    );
    const pbProductId = prod.rows[0]!.id;
    await t.db.query(
      `insert into pb_products (product_id, sku, category_id, cost, margin_rate, supplier_id)
       values ($1,$2,$3,$4,$5,$6)`,
      [pbProductId, rows.pb.sku, rows.pb.category_id, rows.pb.cost, rows.pb.margin_rate, rows.pb.supplier_id],
    );
    expect(rows.product.unit_price).toBe(36000);

    // contractor B sees the PB product in the catalog (public, approved, is_pb)
    await t.asUser(B);
    const catView = await t.db.query<{ is_pb: boolean }>(
      "select is_pb from products where id=$1 and status='approved'",
      [pbProductId],
    );
    expect(catView.rows[0]?.is_pb).toBe(true);

    // 3) OPEN GROUP-BUY on the PB product --------------------------------
    const tiers: GroupBuyTier[] = [
      { minQty: 1, unitPrice: 36000 },
      { minQty: 50, unitPrice: 33000 },
      { minQty: 100, unitPrice: 30000 },
    ];
    await t.asService();
    const gb = await t.db.query<{ id: string }>(
      `insert into group_buys (product_id, supplier_id, title, end_at, min_qty, tiers, status)
       values ($1,$2,'강마루 공동구매', now() + interval '7 days', 100, $3, 'open') returning id`,
      [pbProductId, SUPPLIER_HANIL, JSON.stringify(tiers)],
    );
    const groupBuyId = gb.rows[0]!.id;

    // 4) 2 CONTRACTORS JOIN (each inserts own join under RLS) -------------
    await t.asUser(A);
    await t.db.query(
      "insert into group_buy_joins (group_buy_id, contractor_id, qty) values ($1,$2,40)",
      [groupBuyId, A],
    );
    await t.asUser(B);
    await t.db.query(
      "insert into group_buy_joins (group_buy_id, contractor_id, qty) values ($1,$2,70)",
      [groupBuyId, B],
    );

    // 5) TIER PRICE DROPS as aggregate crosses 100 -----------------------
    await t.asService();
    const joinRows = (
      await t.db.query<Record<string, unknown>>(
        "select contractor_id, qty from group_buy_joins where group_buy_id=$1",
        [groupBuyId],
      )
    ).rows.map((r) => ({ contractorId: String(r.contractor_id), qty: Number(r.qty) }));

    let state = applyJoin([], joinRows[0]!.contractorId, joinRows[0]!.qty, tiers);
    for (let i = 1; i < joinRows.length; i++) {
      state = applyJoin(state.joins, joinRows[i]!.contractorId, joinRows[i]!.qty, tiers);
    }
    expect(state.joinedQty).toBe(110);
    expect(state.unitPrice).toBe(30000); // dropped from 36000 → 30000
    expect(priceForQty(110, tiers)).toBe(30000);
    await t.db.query("update group_buys set joined_qty=$1 where id=$2", [
      state.joinedQty,
      groupBuyId,
    ]);

    // 6) CLOSE → per-contractor POs at final price -----------------------
    const close = closeGroupBuy({ minQty: 100, tiers }, joinRows);
    expect(close.status).toBe("closed");
    expect(close.finalUnitPrice).toBe(30000);
    expect(close.orders).toHaveLength(2);

    const ordersByContractor = new Map<string, string>();
    for (const intent of close.orders) {
      const ord = await t.db.query<{ id: string }>(
        `insert into orders (contractor_id, status, payment_method, payment_status, subtotal, platform_fee, total)
         values ($1,'fulfilled','escrow','held',$2,$3,$4) returning id`,
        [intent.contractorId, intent.amount, Math.round(intent.amount * 0.03), intent.amount],
      );
      const orderId = ord.rows[0]!.id;
      ordersByContractor.set(intent.contractorId, orderId);
      const po = await t.db.query<{ id: string }>(
        `insert into purchase_orders (order_id, supplier_id, status, subtotal)
         values ($1,$2,'delivered',$3) returning id`,
        [orderId, SUPPLIER_HANIL, intent.amount],
      );
      await t.db.query(
        `insert into order_items (po_id, product_id, name_snapshot, unit_price_snapshot, qty, line_total)
         values ($1,$2,$3,$4,$5,$6)`,
        [po.rows[0]!.id, pbProductId, rows.product.name, intent.unitPrice, intent.qty, intent.amount],
      );
    }
    await t.db.query(
      "update group_buys set status='closed', final_unit_price=$1 where id=$2",
      [close.finalUnitPrice, groupBuyId],
    );

    // 7) MONTH-END SETTLEMENT for contractor A ---------------------------
    const aOrders = (
      await t.db.query<Record<string, unknown>>(
        "select id, subtotal, platform_fee, total from orders where contractor_id=$1 and status='fulfilled'",
        [A],
      )
    ).rows.map((r) => ({
      id: String(r.id),
      subtotal: Number(r.subtotal),
      platform_fee: Number(r.platform_fee),
      total: Number(r.total),
    }));
    const settlement = buildMonthlySettlement("2026-06", aOrders);
    expect(settlement.net).toBe(40 * 30000); // A's order total
    const cs = await t.db.query<{ id: string }>(
      `insert into contractor_settlements (contractor_id, period, gross, fee, net, status)
       values ($1,$2,$3,$4,$5,'issued') returning id`,
      [A, settlement.period, settlement.gross, settlement.fee, settlement.net],
    );
    const settlementId = cs.rows[0]!.id;

    // 8) E-TAX INVOICE issued (mock) -------------------------------------
    const { supply, tax } = splitVat(settlement.net);
    const issued = await issueTaxInvoice(
      {
        settlementId,
        contractorBizNo: "220-81-62517",
        supplyAmount: supply,
        taxAmount: tax,
        itemName: "강마루 공동구매",
      },
      "2026-06-30T00:00:00.000Z",
    );
    expect(issued.ok).toBe(true);
    if (issued.ok) {
      await t.db.query(
        `insert into tax_invoices (settlement_id, provider, provider_invoice_id, status, pdf_url)
         values ($1,$2,$3,'issued',$4)`,
        [settlementId, issued.value.provider, issued.value.providerInvoiceId, issued.value.pdfUrl],
      );
    }
    const inv = await t.db.query<{ status: string }>(
      "select status from tax_invoices where settlement_id=$1",
      [settlementId],
    );
    expect(inv.rows[0]?.status).toBe("issued");

    // 9) CREDIT usage updated, then overdue BLOCKS new credit order ------
    await t.db.query(
      "insert into credit_accounts (contractor_id, limit_amount, used_amount) values ($1,$2,0)",
      [A, 10_000_000],
    );
    const accRow = (
      await t.db.query<Record<string, unknown>>(
        "select * from credit_accounts where contractor_id=$1",
        [A],
      )
    ).rows[0]!;
    const account: CreditAccount = {
      id: String(accRow.id),
      contractor_id: A,
      limit_amount: Number(accRow.limit_amount),
      used_amount: Number(accRow.used_amount),
      overdue_amount: Number(accRow.overdue_amount),
      due_date: (accRow.due_date as string | null) ?? null,
      created_at: String(accRow.created_at),
    };
    const charged = applyCreditCharge(account, settlement.net);
    expect(charged.used_amount).toBe(settlement.net);
    await t.db.query("update credit_accounts set used_amount=$1 where contractor_id=$2", [
      charged.used_amount,
      A,
    ]);

    // overdue → blocks new credit order
    await t.db.query(
      "update credit_accounts set overdue_amount=500000, due_date='2026-05-31' where contractor_id=$1",
      [A],
    );
    const overdueAcc: CreditAccount = { ...charged, overdue_amount: 500_000 };
    const gate = canPlaceCreditOrder(overdueAcc, 100_000);
    expect(gate.ok).toBe(false);

    // 10) RLS spot check: B cannot read A's settlement/credit ------------
    await t.asUser(B);
    expect(
      (await t.db.query("select * from contractor_settlements where contractor_id=$1", [A])).rows.length,
    ).toBe(0);
    expect(
      (await t.db.query("select * from credit_accounts where contractor_id=$1", [A])).rows.length,
    ).toBe(0);
  });
});
