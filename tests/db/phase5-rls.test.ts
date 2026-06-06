/**
 * Phase 5 RLS (DoD #4) — end clients are scoped to invited projects only and
 * cannot read forecasts/reorder/analytics internals; contractors own forecasts/rules.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./harness";

const PRODUCT = "44444444-0000-0000-0000-000000000001";

describe("Phase 5 RLS", () => {
  let t: TestDb;
  let A: string; // contractor
  let B: string; // other contractor
  let CL: string; // invited client
  let CL2: string; // uninvited client
  let admin: string;
  let siteA: string;
  let siteB: string;

  beforeAll(async () => {
    t = await createTestDb();
    A = await t.seedUser({ role: "contractor", companyName: "A" });
    B = await t.seedUser({ role: "contractor", companyName: "B" });
    admin = await t.seedUser({ role: "admin", companyName: "관리자" });
    CL = await t.seedClientUser({ phone: "010-1111-2222", name: "입주민1" });
    CL2 = await t.seedClientUser({ phone: "010-3333-4444", name: "입주민2" });

    // A's site + invite CL; B's site (CL not invited)
    await t.asUser(A);
    siteA = (
      await t.db.query<{ id: string }>(
        "insert into sites (contractor_id, name) values ($1,'A현장') returning id",
        [A],
      )
    ).rows[0]!.id;
    await t.db.query(
      "insert into project_clients (site_id, client_user_id, role) values ($1,$2,'selector')",
      [siteA, CL],
    );
    await t.db.query(
      "insert into client_selections (site_id, title, option_set) values ($1,'타일 선택',$2)",
      [siteA, JSON.stringify([{ id: "o1", productId: PRODUCT, label: "화이트", unitPrice: 30000 }])],
    );
    await t.db.query(
      "insert into reorder_rules (contractor_id, product_id, threshold, lead_time_days) values ($1,$2,10,7)",
      [A, PRODUCT],
    );

    await t.asUser(B);
    siteB = (
      await t.db.query<{ id: string }>(
        "insert into sites (contractor_id, name) values ($1,'B현장') returning id",
        [B],
      )
    ).rows[0]!.id;
    await t.db.query(
      "insert into client_selections (site_id, title, option_set) values ($1,'B선택','[]')",
      [siteB],
    );

    await t.asService();
    await t.db.query(
      "insert into forecasts (product_id, period, predicted_qty, confidence) values ($1,'2026-07',120,0.8)",
      [PRODUCT],
    );
    await t.db.query(
      "insert into analytics_snapshots (period, gmv, forecast_accuracy) values ('2026-06',5000000,0.9)",
    );
  });

  afterAll(async () => {
    await t.close();
  });

  it("invited client sees only their project's selections; uninvited does not", async () => {
    await t.asUser(CL);
    const sel = await t.db.query("select * from client_selections");
    expect(sel.rows.length).toBe(1); // only siteA
    const memberships = await t.db.query("select * from project_clients");
    expect(memberships.rows.length).toBe(1);

    await t.asUser(CL2);
    expect((await t.db.query("select * from client_selections")).rows.length).toBe(0);
    expect((await t.db.query("select * from project_clients")).rows.length).toBe(0);
  });

  it("clients CANNOT read forecasts / reorder rules / analytics; contractor can read forecasts", async () => {
    await t.asUser(CL);
    expect((await t.db.query("select * from forecasts")).rows.length).toBe(0);
    expect((await t.db.query("select * from reorder_rules")).rows.length).toBe(0);
    expect((await t.db.query("select * from analytics_snapshots")).rows.length).toBe(0);

    await t.asUser(A);
    expect((await t.db.query("select * from forecasts")).rows.length).toBeGreaterThan(0);
  });

  it("contractor reorder rules are private to the owner", async () => {
    await t.asUser(A);
    expect((await t.db.query("select * from reorder_rules")).rows.length).toBe(1);
    await t.asUser(B);
    expect((await t.db.query("select * from reorder_rules")).rows.length).toBe(0);
  });

  it("analytics snapshots are owner/admin-only", async () => {
    await t.asUser(A);
    expect((await t.db.query("select * from analytics_snapshots")).rows.length).toBe(0);
    await t.asUser(admin);
    expect((await t.db.query("select * from analytics_snapshots")).rows.length).toBe(1);
  });

  it("invited client can record a choice but not on another project", async () => {
    await t.asUser(CL);
    // can update selection on invited site
    await t.db.query(
      "update client_selections set chosen=$1, status='chosen' where site_id=$2",
      [JSON.stringify(["o1"]), siteA],
    );
    const updated = await t.db.query<{ status: string }>(
      "select status from client_selections where site_id=$1",
      [siteA],
    );
    expect(updated.rows[0]?.status).toBe("chosen");

    // cannot touch B's selection (not invited) — filtered to 0 rows
    await t.db.query("update client_selections set status='chosen' where site_id=$1", [siteB]);
    await t.asUser(B);
    const bSel = await t.db.query<{ status: string }>(
      "select status from client_selections where site_id=$1",
      [siteB],
    );
    expect(bSel.rows[0]?.status).toBe("open"); // unchanged
  });
});
