/**
 * Phase 2 E2E — drawing → BOM → cart → order on a budgeted 현장, plus price
 * intelligence, against real schema + RLS (PGlite) and real domain modules.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./../db/harness";
import { analyzeDrawing, matchBomToProducts } from "@/lib/ai-quote";
import {
  splitCartIntoPurchaseOrders,
  buildStagedDeliveries,
  persistOrder,
} from "@/lib/orders";
import { computeSiteBudget, scheduleProgress } from "@/lib/projects";
import {
  comparePrices,
  trendFromPriceHistory,
  lowestPriceAlerts,
} from "@/lib/pricing";
import { PLATFORM_FEE_RATE } from "@/lib/env";
import type {
  Category,
  Order,
  PriceHistory,
  Product,
  ResolvedCartLine,
  RoomArea,
  SiteTask,
} from "@/lib/types";

const TILE_CATEGORY = "11111111-0000-0000-0000-000000000001";
const PRODUCT_TILE = "44444444-0000-0000-0000-000000000001";
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

describe("Phase 2 E2E: drawing → budgeted site order + price intelligence", () => {
  let t: TestDb;
  let contractor: string;

  beforeAll(async () => {
    t = await createTestDb();
    contractor = await t.seedUser({
      role: "contractor",
      companyName: "스마트시공",
      bizStatus: "verified",
    });
  });
  afterAll(async () => {
    await t.close();
  });

  it("analyzes a drawing, orders to a budgeted site, and surfaces price intel", async () => {
    await t.asUser(contractor);

    // 1) DRAWING → BOM (manual rooms fallback; no API key) ----------------
    const rooms: RoomArea[] = [
      { name: "거실", type: "living", areaM2: 22 },
      { name: "안방", type: "room", areaM2: 14 },
      { name: "욕실", type: "bathroom", areaM2: 5 },
      { name: "주방", type: "kitchen", areaM2: 9 },
    ];
    const analysis = await analyzeDrawing({ rooms, specLevel: "standard" });
    expect(analysis.source).toBe("manual");
    expect(analysis.bom.lines.length).toBeGreaterThanOrEqual(8);

    // persist the drawing record (RLS: contractor owns)
    await t.db.query(
      `insert into drawings (contractor_id, file_path, file_type, status, rooms, bom)
       values ($1,$2,$3,'analyzed',$4,$5)`,
      [
        contractor,
        "drawings/plan.png",
        "image/png",
        JSON.stringify(analysis.rooms),
        JSON.stringify(analysis.bom),
      ],
    );

    // 2) MATCH to catalog ------------------------------------------------
    const cats = (await t.db.query("select * from categories")).rows as unknown as Category[];
    const catIdBySlug = new Map(cats.map((c) => [c.slug, c.id]));
    const products = (
      await t.db.query<Record<string, unknown>>(
        "select * from products where status='approved'",
      )
    ).rows.map(rowToProduct);
    const matched = matchBomToProducts(analysis.bom, products, catIdBySlug);
    const matchedLines = matched.lines.filter((l) => l.productId);
    expect(matchedLines.length).toBeGreaterThan(0);

    // 3) BUDGETED SITE ---------------------------------------------------
    const site = await t.db.query<{ id: string }>(
      `insert into sites (contractor_id, name, address, budget, start_date, end_date)
       values ($1,$2,$3,$4,$5,$6) returning id`,
      [contractor, "래미안 84㎡", "서울 송파", 20_000_000, "2026-06-10", "2026-08-10"],
    );
    const siteId = site.rows[0]!.id;

    // 4) ORDER (reuse Phase-1 split/persist) -----------------------------
    const byId = new Map(products.map((p) => [p.id, p]));
    const resolved: ResolvedCartLine[] = matchedLines.map((l) => ({
      product: byId.get(l.productId!)!,
      requestedQty: l.qty,
    }));
    const split = splitCartIntoPurchaseOrders(resolved, PLATFORM_FEE_RATE, ORDER_DATE);
    const stages = buildStagedDeliveries(split, ORDER_DATE);
    await persistOrder(
      t.executor,
      {
        contractorId: contractor,
        siteId,
        paymentMethod: "escrow",
        paymentStatus: "held",
        orderStatus: "paid",
      },
      split,
      stages,
    );

    // 5) BUDGET vs ACTUAL ------------------------------------------------
    const orders = (
      await t.db.query<Record<string, unknown>>(
        "select id, total, status, created_at from orders where site_id=$1",
        [siteId],
      )
    ).rows.map((r) => ({
      id: String(r.id),
      total: Number(r.total),
      status: r.status as Order["status"],
      created_at: String(r.created_at),
    }));
    const budget = computeSiteBudget(20_000_000, orders);
    expect(budget.spent).toBe(split.total);
    expect(budget.spent).toBeGreaterThan(0);
    expect(budget.remaining).toBe(20_000_000 - split.total);
    expect(budget.burnRatio).toBeGreaterThan(0);

    // 6) PRICE INTELLIGENCE ---------------------------------------------
    const cmp = comparePrices(products, TILE_CATEGORY);
    expect(cmp.count).toBeGreaterThanOrEqual(2);
    expect(cmp.rows[0]?.isLowest).toBe(true);
    expect(cmp.min).toBeLessThanOrEqual(cmp.max);

    const hist = (
      await t.db.query<Record<string, unknown>>(
        "select * from price_history where product_id=$1 order by recorded_at",
        [PRODUCT_TILE],
      )
    ).rows.map((r) => ({
      id: String(r.id),
      product_id: String(r.product_id),
      supplier_id: String(r.supplier_id),
      unit_price: Number(r.unit_price),
      recorded_at: String(r.recorded_at),
    })) as PriceHistory[];
    const trend = trendFromPriceHistory(hist);
    expect(trend.length).toBeGreaterThanOrEqual(3);
    // monotonic dates
    for (let i = 1; i < trend.length; i++) {
      expect(trend[i]!.date >= trend[i - 1]!.date).toBe(true);
    }

    // lowest-price alert: pretend we paid a premium price for a tile
    const alerts = lowestPriceAlerts(
      [{ productId: "x", productName: "비싼타일", paidPrice: 99000, categoryId: TILE_CATEGORY }],
      products,
    );
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0]!.savings).toBeGreaterThan(0);

    // 7) SCHEDULE --------------------------------------------------------
    await t.db.query(
      "insert into site_tasks (site_id, contractor_id, title, phase, planned_date, done) values ($1,$2,'철거','demo','2026-06-12',true)",
      [siteId, contractor],
    );
    await t.db.query(
      "insert into site_tasks (site_id, contractor_id, title, phase, planned_date, done) values ($1,$2,'타일시공','tile','2026-06-20',false)",
      [siteId, contractor],
    );
    const tasks = (
      await t.db.query<Record<string, unknown>>(
        "select * from site_tasks where site_id=$1",
        [siteId],
      )
    ).rows.map((r) => ({
      id: String(r.id),
      site_id: String(r.site_id),
      contractor_id: String(r.contractor_id),
      title: String(r.title),
      phase: String(r.phase),
      planned_date: (r.planned_date as string | null) ?? null,
      done: Boolean(r.done),
      created_at: String(r.created_at),
    })) as SiteTask[];
    const prog = scheduleProgress(tasks);
    expect(prog.total).toBe(2);
    expect(prog.done).toBe(1);
    expect(prog.nextTask?.title).toBe("타일시공");
  });
});
