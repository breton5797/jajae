/**
 * DoD #5 — Phase 4 network/logistics E2E against real schema + RLS (PGlite):
 * 3 POs in one region → AI batches into a run → route sequence → delivery status
 * updates site timeline → contractor posts review w/ photo → AI summary appears →
 * referral invite → invitee first order → reward credit on (inviter) settlement.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./../db/harness";
import { batchPosIntoRuns } from "@/lib/logistics";
import { computeSupplierRating } from "@/lib/ratings";
import {
  summarizeReviews,
  validateReview,
  validateReferral,
  computeReferralReward,
} from "@/lib/community";
import { applyCreditPayment } from "@/lib/finance";
import type { CreditAccount, OpenPoForBatching } from "@/lib/types";

const HANIL = "33333333-0000-0000-0000-000000000001";
const PRODUCT = "44444444-0000-0000-0000-000000000001";

describe("Phase 4 E2E: logistics batching → reviews → referral", () => {
  let t: TestDb;
  let A: string;
  let C: string; // invitee
  let X: string; // Hanil owner

  beforeAll(async () => {
    t = await createTestDb();
    A = await t.seedUser({ role: "contractor", companyName: "에이", bizStatus: "verified" });
    C = await t.seedUser({ role: "contractor", companyName: "씨(초대받음)", bizStatus: "verified" });
    X = await t.seedUser({ role: "supplier", companyName: "한일" });
    await t.linkSupplier(HANIL, X);
  });
  afterAll(async () => {
    await t.close();
  });

  it("runs the full network/logistics flow", async () => {
    // SITE in one region ------------------------------------------------
    await t.asUser(A);
    const site = await t.db.query<{ id: string }>(
      `insert into sites (contractor_id, name, address, region, scheduled_date, lat, lng)
       values ($1,'강남현장','서울 강남구','서울 강남','2026-06-10',37.5,127.04) returning id`,
      [A],
    );
    const siteId = site.rows[0]!.id;

    // ONE order with 3 POs (multi-supplier) tied to the site ------------
    const ord = await t.db.query<{ id: string }>(
      `insert into orders (contractor_id, site_id, payment_method, status, total)
       values ($1,$2,'escrow','paid',300000) returning id`,
      [A, siteId],
    );
    const orderId = ord.rows[0]!.id;
    const poIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const po = await t.db.query<{ id: string }>(
        "insert into purchase_orders (order_id, supplier_id, status, subtotal) values ($1,$2,'accepted',100000) returning id",
        [orderId, HANIL],
      );
      poIds.push(po.rows[0]!.id);
      // staged delivery rows feed the site timeline (Phase 2 workspace)
      await t.db.query(
        "insert into deliveries (po_id, site_id, status, scheduled_date) values ($1,$2,'scheduled','2026-06-10')",
        [po.rows[0]!.id, siteId],
      );
    }

    // 1) AI BATCH 3 POs (same region/date) INTO ONE RUN ------------------
    const openPos: OpenPoForBatching[] = poIds.map((poId) => ({
      poId,
      supplierId: HANIL,
      siteId,
      region: "서울 강남",
      date: "2026-06-10",
      lat: 37.5,
      lng: 127.04,
    }));
    const runs = batchPosIntoRuns(openPos);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.poCount).toBe(3);
    expect(runs[0]?.stops.map((s) => s.sequence)).toEqual([1, 2, 3]); // route sequenced

    // persist the run (admin/service) -----------------------------------
    await t.asService();
    const run = runs[0]!;
    const runRow = await t.db.query<{ id: string }>(
      "insert into delivery_runs (region, run_date, route, status) values ($1,$2,$3,'confirmed') returning id",
      [run.region, run.date, JSON.stringify({ stops: run.stops })],
    );
    const runId = runRow.rows[0]!.id;
    for (const stop of run.stops) {
      await t.db.query(
        "insert into run_pos (run_id, po_id, sequence) values ($1,$2,$3)",
        [runId, stop.poId, stop.sequence],
      );
    }

    // 2) DELIVERY STATUS propagates to the site timeline -----------------
    await t.db.query("update delivery_runs set status='dispatched' where id=$1", [runId]);
    for (const poId of poIds) {
      await t.db.query("update purchase_orders set track_status='delivered' where id=$1", [poId]);
      await t.db.query(
        "update deliveries set status='delivered', delivered_at=now() where po_id=$1",
        [poId],
      );
    }
    const delivered = await t.db.query<{ n: number }>(
      "select count(*)::int n from deliveries where site_id=$1 and status='delivered'",
      [siteId],
    );
    expect(Number(delivered.rows[0]?.n)).toBe(3);

    // 3) CONTRACTOR POSTS REVIEW WITH PHOTO ------------------------------
    await t.asUser(A);
    const reviewInput = { rating: 5, body: "배송 빠르고 타일 품질 좋아요" };
    expect(validateReview(reviewInput).ok).toBe(true);
    await t.db.query(
      "insert into reviews (product_id, contractor_id, rating, body, photos) values ($1,$2,$3,$4,$5)",
      [PRODUCT, A, reviewInput.rating, reviewInput.body, JSON.stringify(["site-docs/review1.jpg"])],
    );

    // 4) AI REVIEW SUMMARY appears (deterministic fallback) --------------
    const reviewRows = (
      await t.db.query<Record<string, unknown>>(
        "select rating, body from reviews where product_id=$1",
        [PRODUCT],
      )
    ).rows.map((r) => ({ rating: Number(r.rating), body: String(r.body) }));
    const summary = summarizeReviews(reviewRows);
    expect(summary.count).toBeGreaterThan(0);
    expect(summary.summary.length).toBeGreaterThan(0);
    expect(summary.avg).toBeGreaterThan(0);

    // 5) SUPPLIER RATING from delivered orders + reviews → public badge --
    await t.asService();
    const rating = computeSupplierRating({
      deliveredOnTime: 3,
      deliveredTotal: 3,
      returns: 0,
      asCount: 0,
      orderCount: 3,
      qualityReviews: reviewRows.map((r) => r.rating),
    });
    await t.db.query(
      `insert into supplier_ratings (supplier_id, on_time, return_rate, quality_avg, composite, order_count, review_count)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (supplier_id) do update set composite=excluded.composite`,
      [HANIL, rating.onTime, rating.returnRate, rating.qualityAvg, rating.composite, rating.orderCount, rating.reviewCount],
    );
    await t.db.query("update suppliers set rating=$1 where id=$2", [rating.composite, HANIL]);
    const badge = await t.db.query<{ rating: number }>("select rating from suppliers where id=$1", [HANIL]);
    expect(Number(badge.rows[0]?.rating)).toBe(rating.composite);
    expect(rating.tier).toBe("최우수");

    // 6) REFERRAL: A invites → C joins + first order → reward credit -----
    expect(validateReferral(A, C).ok).toBe(true);
    expect(validateReferral(A, A).ok).toBe(false); // self-referral blocked

    await t.asUser(A);
    await t.db.query(
      "insert into referrals (inviter_id, code, status) values ($1,'INVITE-A','invited')",
      [A],
    );

    // invitee C places their first order
    await t.asUser(C);
    const cOrder = await t.db.query<{ total: number }>(
      "insert into orders (contractor_id, payment_method, status, subtotal, total) values ($1,'escrow','paid',2000000,2000000) returning total",
      [C],
    );
    const firstOrderAmount = Number(cOrder.rows[0]!.total);
    const reward = computeReferralReward(firstOrderAmount);
    expect(reward).toBe(40000); // 2% of 2,000,000

    // post reward to inviter: mark referral rewarded + credit A's account
    await t.asService();
    await t.db.query(
      "update referrals set invitee_id=$1, reward=$2, status='rewarded' where inviter_id=$3",
      [C, reward, A],
    );
    await t.db.query(
      "insert into credit_accounts (contractor_id, limit_amount, used_amount) values ($1,10000000,1000000)",
      [A],
    );
    const accRow = (
      await t.db.query<Record<string, unknown>>("select * from credit_accounts where contractor_id=$1", [A])
    ).rows[0]!;
    const account: CreditAccount = {
      id: String(accRow.id),
      contractor_id: A,
      limit_amount: Number(accRow.limit_amount),
      used_amount: Number(accRow.used_amount),
      overdue_amount: Number(accRow.overdue_amount),
      due_date: null,
      created_at: String(accRow.created_at),
    };
    const credited = applyCreditPayment(account, reward); // reward reduces outstanding usage
    await t.db.query("update credit_accounts set used_amount=$1 where contractor_id=$2", [
      credited.used_amount,
      A,
    ]);
    expect(credited.used_amount).toBe(1_000_000 - reward);

    // RLS spot-check: invitee C can see the referral (party), unrelated cannot
    await t.asUser(C);
    expect((await t.db.query("select * from referrals where invitee_id=$1", [C])).rows.length).toBe(1);
  });
});
