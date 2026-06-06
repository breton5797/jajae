/**
 * Phase 2 RLS — new tables (drawings, site_documents, site_tasks, price_history)
 * isolate tenants; price_history is public-read but write-restricted to the
 * owning supplier.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./harness";

const SUPPLIER_HANIL = "33333333-0000-0000-0000-000000000001";
const SUPPLIER_DONGYANG = "33333333-0000-0000-0000-000000000002";
const PRODUCT_HANIL = "44444444-0000-0000-0000-000000000001";

describe("Phase 2 RLS", () => {
  let t: TestDb;
  let contractorA: string;
  let contractorB: string;
  let supplierX: string; // hanil
  let supplierY: string; // dongyang
  let siteA: string;

  beforeAll(async () => {
    t = await createTestDb();
    contractorA = await t.seedUser({ role: "contractor", companyName: "A" });
    contractorB = await t.seedUser({ role: "contractor", companyName: "B" });
    supplierX = await t.seedUser({ role: "supplier", companyName: "한일" });
    supplierY = await t.seedUser({ role: "supplier", companyName: "동양" });
    await t.linkSupplier(SUPPLIER_HANIL, supplierX);
    await t.linkSupplier(SUPPLIER_DONGYANG, supplierY);

    await t.asUser(contractorA);
    const site = await t.db.query<{ id: string }>(
      "insert into sites (contractor_id, name, budget) values ($1,$2,$3) returning id",
      [contractorA, "A현장", 10_000_000],
    );
    siteA = site.rows[0]!.id;
    await t.db.query(
      "insert into drawings (contractor_id, site_id, file_path, file_type) values ($1,$2,$3,$4)",
      [contractorA, siteA, "drawings/a.png", "image/png"],
    );
    await t.db.query(
      "insert into site_documents (site_id, contractor_id, name, file_path) values ($1,$2,$3,$4)",
      [siteA, contractorA, "견적서.pdf", "site-docs/a.pdf"],
    );
    await t.db.query(
      "insert into site_tasks (site_id, contractor_id, title, phase) values ($1,$2,$3,$4)",
      [siteA, contractorA, "철거", "demolition"],
    );
  });

  afterAll(async () => {
    await t.close();
  });

  it("A reads own drawings/documents/tasks", async () => {
    await t.asUser(contractorA);
    expect((await t.db.query("select * from drawings")).rows.length).toBe(1);
    expect((await t.db.query("select * from site_documents")).rows.length).toBe(1);
    expect((await t.db.query("select * from site_tasks")).rows.length).toBe(1);
  });

  it("B CANNOT read A's drawings/documents/tasks", async () => {
    await t.asUser(contractorB);
    expect((await t.db.query("select * from drawings")).rows.length).toBe(0);
    expect((await t.db.query("select * from site_documents")).rows.length).toBe(0);
    expect((await t.db.query("select * from site_tasks")).rows.length).toBe(0);
  });

  it("B cannot insert a drawing impersonating A", async () => {
    await t.asUser(contractorB);
    await expect(
      t.db.query(
        "insert into drawings (contractor_id, file_path) values ($1,$2)",
        [contractorA, "drawings/forge.png"],
      ),
    ).rejects.toThrow();
  });

  it("price_history is public-read (contractor B and anon can read)", async () => {
    await t.asUser(contractorB);
    expect(
      (await t.db.query("select * from price_history")).rows.length,
    ).toBeGreaterThan(0);
    await t.asUser("00000000-0000-0000-0000-000000000000", "anon");
    expect(
      (await t.db.query("select * from price_history")).rows.length,
    ).toBeGreaterThan(0);
  });

  it("only the owning supplier can write price_history", async () => {
    // Supplier Y does NOT own the Hanil product → insert blocked by RLS.
    await t.asUser(supplierY, "authenticated");
    await expect(
      t.db.query(
        "insert into price_history (product_id, supplier_id, unit_price) values ($1,$2,$3)",
        [PRODUCT_HANIL, SUPPLIER_HANIL, 31000],
      ),
    ).rejects.toThrow();

    // Supplier X owns it → allowed.
    await t.asUser(supplierX, "authenticated");
    const before = (await t.db.query("select * from price_history")).rows.length;
    await t.db.query(
      "insert into price_history (product_id, supplier_id, unit_price) values ($1,$2,$3)",
      [PRODUCT_HANIL, SUPPLIER_HANIL, 30500],
    );
    const after = (await t.db.query("select * from price_history")).rows.length;
    expect(after).toBe(before + 1);
  });
});
