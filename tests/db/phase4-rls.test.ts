/**
 * Phase 4 RLS (DoD #4) — suppliers can't see competitors' ratings or run_pos;
 * contractors can't edit others' reviews; referrals are private to the parties.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./harness";

const HANIL = "33333333-0000-0000-0000-000000000001";
const DONGYANG = "33333333-0000-0000-0000-000000000002";
const PRODUCT = "44444444-0000-0000-0000-000000000001";

describe("Phase 4 RLS", () => {
  let t: TestDb;
  let A: string;
  let B: string;
  let X: string; // owns Hanil
  let Y: string; // owns Dongyang
  let runId: string;
  let reviewId: string;

  beforeAll(async () => {
    t = await createTestDb();
    A = await t.seedUser({ role: "contractor", companyName: "A" });
    B = await t.seedUser({ role: "contractor", companyName: "B" });
    X = await t.seedUser({ role: "supplier", companyName: "한일" });
    Y = await t.seedUser({ role: "supplier", companyName: "동양" });
    await t.linkSupplier(HANIL, X);
    await t.linkSupplier(DONGYANG, Y);

    await t.asService();
    // ratings (detailed) for both suppliers
    await t.db.query(
      "insert into supplier_ratings (supplier_id, composite, on_time, order_count) values ($1,4.6,0.95,100),($2,4.1,0.9,80)",
      [HANIL, DONGYANG],
    );

    // one order for A with a PO to Hanil and a PO to Dongyang, batched into a run
    const ord = await t.db.query<{ id: string }>(
      "insert into orders (contractor_id, payment_method, status, total) values ($1,'escrow','paid',100) returning id",
      [A],
    );
    const orderId = ord.rows[0]!.id;
    const poH = await t.db.query<{ id: string }>(
      "insert into purchase_orders (order_id, supplier_id, status) values ($1,$2,'accepted') returning id",
      [orderId, HANIL],
    );
    const poD = await t.db.query<{ id: string }>(
      "insert into purchase_orders (order_id, supplier_id, status) values ($1,$2,'accepted') returning id",
      [orderId, DONGYANG],
    );
    const run = await t.db.query<{ id: string }>(
      "insert into delivery_runs (region, run_date, status) values ('서울 강남','2026-06-10','planned') returning id",
    );
    runId = run.rows[0]!.id;
    await t.db.query(
      "insert into run_pos (run_id, po_id, sequence) values ($1,$2,1),($1,$3,2)",
      [runId, poH.rows[0]!.id, poD.rows[0]!.id],
    );

    // A posts a review
    await t.asUser(A);
    const rev = await t.db.query<{ id: string }>(
      "insert into reviews (product_id, contractor_id, rating, body) values ($1,$2,5,'아주 좋은 타일') returning id",
      [PRODUCT, A],
    );
    reviewId = rev.rows[0]!.id;

    // A creates a referral
    await t.db.query(
      "insert into referrals (inviter_id, code, reward, status) values ($1,'INVITE-A',0,'invited')",
      [A],
    );
  });

  afterAll(async () => {
    await t.close();
  });

  it("supplier sees own rating only (competitor hidden)", async () => {
    await t.asUser(X, "authenticated");
    const xView = await t.db.query("select * from supplier_ratings");
    expect(xView.rows.length).toBe(1);
    const xComp = await t.db.query("select * from supplier_ratings where supplier_id=$1", [DONGYANG]);
    expect(xComp.rows.length).toBe(0); // cannot see Dongyang's
  });

  it("run_pos hides competitor POs; each supplier sees only its own stop", async () => {
    await t.asUser(X, "authenticated");
    const xRun = await t.db.query("select * from run_pos where run_id=$1", [runId]);
    expect(xRun.rows.length).toBe(1); // only Hanil's PO

    await t.asUser(Y, "authenticated");
    const yRun = await t.db.query("select * from run_pos where run_id=$1", [runId]);
    expect(yRun.rows.length).toBe(1); // only Dongyang's PO

    // both can still see the run header (they have a stop in it)
    await t.asUser(X, "authenticated");
    expect((await t.db.query("select * from delivery_runs where id=$1", [runId])).rows.length).toBe(1);
  });

  it("reviews are public-read but only the author can edit", async () => {
    // B can read A's review
    await t.asUser(B);
    expect((await t.db.query("select * from reviews where id=$1", [reviewId])).rows.length).toBe(1);

    // B's UPDATE is filtered out by RLS (0 rows changed) — body stays intact
    await t.db.query("update reviews set body='해킹됨' where id=$1", [reviewId]);
    await t.asUser(A);
    const after = await t.db.query<{ body: string }>("select body from reviews where id=$1", [reviewId]);
    expect(after.rows[0]?.body).toBe("아주 좋은 타일");

    // B cannot insert a review impersonating A
    await t.asUser(B);
    await expect(
      t.db.query("insert into reviews (product_id, contractor_id, rating, body) values ($1,$2,1,'위장리뷰')", [
        PRODUCT,
        A,
      ]),
    ).rejects.toThrow();
  });

  it("referrals are private to inviter/invitee", async () => {
    await t.asUser(A);
    expect((await t.db.query("select * from referrals")).rows.length).toBe(1);
    await t.asUser(B);
    expect((await t.db.query("select * from referrals")).rows.length).toBe(0);
  });
});
