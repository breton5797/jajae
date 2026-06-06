/**
 * Phase 3 RLS — contractor settlements / credit / group-buy joins isolate per
 * contractor; group_buys & pb_products are public-read.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./harness";

const SUPPLIER_HANIL = "33333333-0000-0000-0000-000000000001";
const PRODUCT_TILE = "44444444-0000-0000-0000-000000000001";
const TILE_CAT = "11111111-0000-0000-0000-000000000001";

describe("Phase 3 RLS", () => {
  let t: TestDb;
  let A: string;
  let B: string;
  let supplierX: string;
  let groupBuyId: string;
  let settlementA: string;

  beforeAll(async () => {
    t = await createTestDb();
    A = await t.seedUser({ role: "contractor", companyName: "A" });
    B = await t.seedUser({ role: "contractor", companyName: "B" });
    supplierX = await t.seedUser({ role: "supplier", companyName: "한일" });
    await t.linkSupplier(SUPPLIER_HANIL, supplierX);

    // platform/admin-owned rows (service bypasses RLS for setup)
    await t.asService();
    await t.db.query(
      "insert into credit_accounts (contractor_id, limit_amount, used_amount) values ($1,$2,$3)",
      [A, 10_000_000, 2_000_000],
    );
    const cs = await t.db.query<{ id: string }>(
      "insert into contractor_settlements (contractor_id, period, gross, fee, net) values ($1,'2026-05',1000000,30000,1030000) returning id",
      [A],
    );
    settlementA = cs.rows[0]!.id;
    await t.db.query(
      "insert into tax_invoices (settlement_id, status, provider_invoice_id) values ($1,'issued','NTS-1')",
      [settlementA],
    );
    const gb = await t.db.query<{ id: string }>(
      `insert into group_buys (product_id, supplier_id, title, end_at, min_qty, tiers, status)
       values ($1,$2,'타일 공동구매', now() + interval '7 days', 100, $3, 'open') returning id`,
      [PRODUCT_TILE, SUPPLIER_HANIL, JSON.stringify([{ minQty: 1, unitPrice: 29000 }, { minQty: 100, unitPrice: 26000 }])],
    );
    groupBuyId = gb.rows[0]!.id;

    // each contractor inserts their OWN join (RLS insert: contractor_id = auth.uid())
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
  });

  afterAll(async () => {
    await t.close();
  });

  it("A reads own credit & settlement; B cannot", async () => {
    await t.asUser(A);
    expect((await t.db.query("select * from credit_accounts")).rows.length).toBe(1);
    expect((await t.db.query("select * from contractor_settlements")).rows.length).toBe(1);
    expect((await t.db.query("select * from tax_invoices")).rows.length).toBe(1);

    await t.asUser(B);
    expect((await t.db.query("select * from credit_accounts")).rows.length).toBe(0);
    expect((await t.db.query("select * from contractor_settlements")).rows.length).toBe(0);
    expect((await t.db.query("select * from tax_invoices")).rows.length).toBe(0);
  });

  it("group-buy joins are private to the joiner (A sees only own)", async () => {
    await t.asUser(A);
    const aJoins = await t.db.query("select * from group_buy_joins");
    expect(aJoins.rows.length).toBe(1);

    await t.asUser(B);
    const bJoins = await t.db.query("select * from group_buy_joins");
    expect(bJoins.rows.length).toBe(1);
  });

  it("the campaign's supplier sees ALL joins", async () => {
    await t.asUser(supplierX, "authenticated");
    const joins = await t.db.query("select * from group_buy_joins where group_buy_id=$1", [
      groupBuyId,
    ]);
    expect(joins.rows.length).toBe(2);
  });

  it("group_buys & pb_products are public-read (anon)", async () => {
    await t.asUser("00000000-0000-0000-0000-000000000000", "anon");
    expect(
      (await t.db.query("select * from group_buys")).rows.length,
    ).toBeGreaterThan(0);
    // pb_products empty but readable (no error)
    await expect(t.db.query("select * from pb_products")).resolves.toBeTruthy();
  });

  it("B cannot insert a credit account or settlement for A", async () => {
    await t.asUser(B);
    await expect(
      t.db.query(
        "insert into contractor_settlements (contractor_id, period, net) values ($1,'2026-06',999)",
        [A],
      ),
    ).rejects.toThrow();
  });

  void TILE_CAT;
});
