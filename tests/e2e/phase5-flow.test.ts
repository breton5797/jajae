/**
 * DoD #5 — Phase 5 predictive + B2B2C E2E against real schema + RLS (PGlite):
 * history → forecast + reorder alert → approve draft cart → invite client →
 * client logs in → views BOM → selects material option → choice updates contractor
 * order → owner dashboard shows GMV + forecast accuracy.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./../db/harness";
import {
  aggregateDemandByPeriod,
  forecastDemand,
  computeReorderSuggestion,
  buildReorderDraft,
} from "@/lib/forecast";
import {
  applyClientChoice,
  selectionToCartLines,
  containsPricingInternals,
  validateOptionSet,
} from "@/lib/client-portal";
import { computeAnalytics } from "@/lib/analytics";
import type { ClientSelectionOption } from "@/lib/types";

const PRODUCT = "44444444-0000-0000-0000-000000000001";
const PRODUCT2 = "44444444-0000-0000-0000-000000000010";
const HANIL = "33333333-0000-0000-0000-000000000001";

describe("Phase 5 E2E: forecast → reorder → client portal → analytics", () => {
  let t: TestDb;
  let A: string;
  let CL: string;
  let admin: string;

  beforeAll(async () => {
    t = await createTestDb();
    A = await t.seedUser({ role: "contractor", companyName: "예측시공", bizStatus: "verified" });
    admin = await t.seedUser({ role: "admin", companyName: "오너" });
    CL = await t.seedClientUser({ phone: "010-5555-6666", name: "입주민" });
  });
  afterAll(async () => {
    await t.close();
  });

  it("runs the full predictive + B2B2C flow", async () => {
    // HISTORY: 4 months of demand for PRODUCT --------------------------
    await t.asService();
    const ord = await t.db.query<{ id: string }>(
      "insert into orders (contractor_id, payment_method, status, total) values ($1,'escrow','fulfilled',100) returning id",
      [A],
    );
    const po = await t.db.query<{ id: string }>(
      "insert into purchase_orders (order_id, supplier_id, status) values ($1,$2,'delivered') returning id",
      [ord.rows[0]!.id, HANIL],
    );
    const poId = po.rows[0]!.id;
    const months = [
      ["2026-01-15", 10],
      ["2026-02-15", 12],
      ["2026-03-15", 14],
      ["2026-04-15", 16],
    ] as const;
    for (const [date, qty] of months) {
      await t.db.query(
        `insert into order_items (po_id, product_id, name_snapshot, unit_price_snapshot, qty, line_total, created_at)
         values ($1,$2,'타일',30000,$3,$4,$5)`,
        [poId, PRODUCT, qty, qty * 30000, `${date}T00:00:00Z`],
      );
    }

    // 1) FORECAST from history -----------------------------------------
    const items = (
      await t.db.query<Record<string, unknown>>(
        "select created_at, qty from order_items where product_id=$1",
        [PRODUCT],
      )
    ).rows.map((r) => ({ created_at: String(r.created_at), qty: Number(r.qty) }));
    const history = aggregateDemandByPeriod(items);
    expect(history.length).toBe(4);
    const forecast = forecastDemand(history);
    expect(forecast.coldStart).toBe(false);
    expect(forecast.predictedQty).toBeGreaterThanOrEqual(14);
    await t.db.query(
      "insert into forecasts (product_id, period, predicted_qty, confidence, method) values ($1,'2026-05',$2,$3,$4)",
      [PRODUCT, forecast.predictedQty, forecast.confidence, forecast.method],
    );

    // 2) REORDER RULE + ALERT (stock below reorder point) --------------
    await t.asUser(A);
    await t.db.query(
      "insert into reorder_rules (contractor_id, product_id, threshold, lead_time_days) values ($1,$2,10,7)",
      [A, PRODUCT],
    );
    const suggestion = computeReorderSuggestion(
      { threshold: 10, lead_time_days: 7, product_id: PRODUCT },
      forecast.predictedQty * 30, // treat as monthly demand proxy
      5, // low current stock
    );
    expect(suggestion.needsReorder).toBe(true);
    const draft = buildReorderDraft([suggestion]);
    expect(draft.length).toBe(1);

    // 3) APPROVE DRAFT CART (contractor adds the draft lines) ----------
    for (const line of draft) {
      await t.db.query(
        `insert into cart_items (contractor_id, product_id, qty) values ($1,$2,$3)
         on conflict (contractor_id, product_id) do update set qty=excluded.qty`,
        [A, line.productId, line.qty],
      );
    }
    expect((await t.db.query("select * from cart_items")).rows.length).toBe(1);

    // 4) INVITE CLIENT to a project ------------------------------------
    const site = await t.db.query<{ id: string }>(
      "insert into sites (contractor_id, name, address) values ($1,'반포현장','서울 서초') returning id",
      [A],
    );
    const siteId = site.rows[0]!.id;
    await t.db.query(
      "insert into project_clients (site_id, client_user_id, role) values ($1,$2,'selector')",
      [siteId, CL],
    );

    // contractor shares a CLIENT-SAFE material option set --------------
    const optionSet: ClientSelectionOption[] = [
      { id: "o1", productId: PRODUCT, label: "화이트 타일", unitPrice: 31000 },
      { id: "o2", productId: PRODUCT2, label: "강마루", unitPrice: 37000 },
    ];
    expect(validateOptionSet(optionSet).ok).toBe(true);
    expect(optionSet.some(containsPricingInternals)).toBe(false); // no cost/margin leak
    const sel = await t.db.query<{ id: string }>(
      "insert into client_selections (site_id, title, option_set) values ($1,'마감재 선택',$2) returning id",
      [siteId, JSON.stringify(optionSet)],
    );
    const selectionId = sel.rows[0]!.id;

    // 5) CLIENT LOGS IN → views BOM (scoped, no pricing internals) -----
    await t.asUser(CL);
    const clientView = (
      await t.db.query<Record<string, unknown>>(
        "select option_set from client_selections where site_id=$1",
        [siteId],
      )
    ).rows[0]!;
    const clientOptions = clientView.option_set as ClientSelectionOption[];
    expect(clientOptions.length).toBe(2);
    expect(clientOptions.some(containsPricingInternals)).toBe(false);

    // 6) CLIENT SELECTS a material option ------------------------------
    const choice = applyClientChoice({ option_set: optionSet }, ["o2"]);
    expect(choice.status).toBe("chosen");
    await t.db.query(
      "update client_selections set chosen=$1, status=$2 where id=$3",
      [JSON.stringify(choice.chosen), choice.status, selectionId],
    );

    // 7) CHOICE UPDATES CONTRACTOR ORDER (cart) ------------------------
    const cartLines = selectionToCartLines(
      { option_set: optionSet, chosen: choice.chosen },
      { o2: 20 },
    );
    expect(cartLines).toEqual([{ productId: PRODUCT2, qty: 20 }]);
    await t.asUser(A);
    for (const line of cartLines) {
      await t.db.query(
        `insert into cart_items (contractor_id, product_id, qty) values ($1,$2,$3)
         on conflict (contractor_id, product_id) do update set qty=excluded.qty`,
        [A, line.productId, line.qty],
      );
    }
    const cart = await t.db.query("select * from cart_items where product_id=$1", [PRODUCT2]);
    expect(cart.rows.length).toBe(1);

    // 8) OWNER ANALYTICS: GMV + forecast accuracy ----------------------
    await t.asService();
    const analytics = computeAnalytics("2026-04", {
      orders: [
        { contractor_id: A, total: 480_000, platform_fee: 14_000, status: "fulfilled" },
      ],
      items: [
        { is_pb: false, unit_price_snapshot: 30_000, cost: null, qty: 16, supplier_id: HANIL },
      ],
      forecastPairs: [{ predicted: forecast.predictedQty, actual: 16 }],
    });
    expect(analytics.gmv).toBe(480_000);
    expect(analytics.forecastAccuracy).toBeGreaterThan(0);
    await t.db.query(
      `insert into analytics_snapshots (period, gmv, margin, pb_share, repeat_rate, forecast_accuracy)
       values ($1,$2,$3,$4,$5,$6)`,
      [analytics.period, analytics.gmv, analytics.margin, analytics.pbShare, analytics.repeatRate, analytics.forecastAccuracy],
    );

    // owner reads the dashboard snapshot
    await t.asUser(admin);
    const snap = await t.db.query<{ gmv: number; forecast_accuracy: number }>(
      "select gmv, forecast_accuracy from analytics_snapshots where period='2026-04'",
    );
    expect(Number(snap.rows[0]?.gmv)).toBe(480_000);
    expect(Number(snap.rows[0]?.forecast_accuracy)).toBeGreaterThan(0);
  });
});
