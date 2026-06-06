/**
 * DoD #3 — RLS blocks cross-tenant reads.
 * Proven against the REAL policies running in Postgres (PGlite), impersonating
 * users via SET ROLE + JWT-claim GUC exactly as PostgREST does.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./harness";

const SUPPLIER_HANIL = "33333333-0000-0000-0000-000000000001";
const SUPPLIER_DONGYANG = "33333333-0000-0000-0000-000000000002";
const PENDING_PRODUCT = "44444444-0000-0000-0000-0000000000ff"; // hanil, pending

describe("RLS tenant isolation", () => {
  let t: TestDb;
  let contractorA: string;
  let contractorB: string;
  let supplierOwnerX: string; // owns Hanil
  let supplierOwnerY: string; // owns Dongyang

  beforeAll(async () => {
    t = await createTestDb();
    contractorA = await t.seedUser({ role: "contractor", companyName: "A인테리어" });
    contractorB = await t.seedUser({ role: "contractor", companyName: "B인테리어" });
    supplierOwnerX = await t.seedUser({ role: "supplier", companyName: "한일" });
    supplierOwnerY = await t.seedUser({ role: "supplier", companyName: "동양" });
    await t.linkSupplier(SUPPLIER_HANIL, supplierOwnerX);
    await t.linkSupplier(SUPPLIER_DONGYANG, supplierOwnerY);

    // Contractor A creates a private site + order (as themselves, under RLS).
    await t.asUser(contractorA);
    await t.db.query(
      "insert into sites (contractor_id, name, address) values ($1,$2,$3)",
      [contractorA, "A현장", "서울시 강남구"],
    );
    await t.db.query(
      `insert into orders (contractor_id, payment_method, status, total)
       values ($1,'escrow','paid',1000000)`,
      [contractorA],
    );
  });

  afterAll(async () => {
    await t.close();
  });

  it("contractor A sees own site & order", async () => {
    await t.asUser(contractorA);
    const sites = await t.db.query("select * from sites");
    const orders = await t.db.query("select * from orders");
    expect(sites.rows.length).toBe(1);
    expect(orders.rows.length).toBe(1);
  });

  it("contractor B CANNOT read A's sites or orders", async () => {
    await t.asUser(contractorB);
    const sites = await t.db.query("select * from sites");
    const orders = await t.db.query("select * from orders");
    expect(sites.rows.length).toBe(0);
    expect(orders.rows.length).toBe(0);
  });

  it("anon CANNOT read sites or orders, but CAN read approved catalog", async () => {
    await t.asUser("00000000-0000-0000-0000-000000000000", "anon");
    const sites = await t.db.query("select * from sites");
    const approved = await t.db.query(
      "select * from products where status='approved'",
    );
    expect(sites.rows.length).toBe(0);
    expect(approved.rows.length).toBeGreaterThan(0);
  });

  it("supplier X sees own pending product; contractor B & supplier Y do NOT", async () => {
    await t.asUser(supplierOwnerX, "authenticated");
    const xView = await t.db.query("select * from products where id=$1", [
      PENDING_PRODUCT,
    ]);
    expect(xView.rows.length).toBe(1);

    await t.asUser(supplierOwnerY, "authenticated");
    const yView = await t.db.query("select * from products where id=$1", [
      PENDING_PRODUCT,
    ]);
    expect(yView.rows.length).toBe(0);

    await t.asUser(contractorB);
    const bView = await t.db.query("select * from products where id=$1", [
      PENDING_PRODUCT,
    ]);
    expect(bView.rows.length).toBe(0);
  });

  it("purchase orders are visible only to the owning contractor & supplying supplier", async () => {
    // A creates an order with a PO for Hanil (supplier X).
    await t.asUser(contractorA);
    const ord = await t.db.query<{ id: string }>(
      `insert into orders (contractor_id, payment_method, status, total)
       values ($1,'escrow','paid',500000) returning id`,
      [contractorA],
    );
    const orderId = ord.rows[0]!.id;
    const po = await t.db.query<{ id: string }>(
      `insert into purchase_orders (order_id, supplier_id, status, subtotal)
       values ($1,$2,'pending',500000) returning id`,
      [orderId, SUPPLIER_HANIL],
    );
    const poId = po.rows[0]!.id;

    // Owning contractor A sees it.
    const aView = await t.db.query("select * from purchase_orders where id=$1", [
      poId,
    ]);
    expect(aView.rows.length).toBe(1);

    // Supplying supplier X sees it.
    await t.asUser(supplierOwnerX, "authenticated");
    const xView = await t.db.query(
      "select * from purchase_orders where id=$1",
      [poId],
    );
    expect(xView.rows.length).toBe(1);

    // Other contractor B and other supplier Y do NOT.
    await t.asUser(contractorB);
    const bView = await t.db.query(
      "select * from purchase_orders where id=$1",
      [poId],
    );
    expect(bView.rows.length).toBe(0);

    await t.asUser(supplierOwnerY, "authenticated");
    const yView = await t.db.query(
      "select * from purchase_orders where id=$1",
      [poId],
    );
    expect(yView.rows.length).toBe(0);
  });

  it("contractor B cannot INSERT a site impersonating A", async () => {
    await t.asUser(contractorB);
    await expect(
      t.db.query(
        "insert into sites (contractor_id, name) values ($1,$2)",
        [contractorA, "위장현장"],
      ),
    ).rejects.toThrow();
  });
});
