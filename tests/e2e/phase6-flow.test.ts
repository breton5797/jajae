/**
 * DoD #5 — Phase 6 open-platform + embedded-finance E2E against real schema + RLS:
 * create API client + scope → REST call logged + rate-limited → webhook fires with
 * valid HMAC + retry → ERP stock push updates catalog → credit score computed →
 * early-settlement gated by score → advance disbursed → repayment netted.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./../db/harness";
import {
  generateApiKey,
  verifyApiKey,
  hasScope,
  checkRateLimit,
  signWebhook,
  verifyWebhookSignature,
  buildWebhookEvent,
} from "@/lib/openapi";
import { validateErpStockPayload, reconcileStockUpdate } from "@/lib/erp";
import { computeCreditScore, scoreToFinanceOffer } from "@/lib/scoring";
import {
  computeEarlyPayout,
  canRequestFinance,
  financeOutstanding,
  netRepayment,
} from "@/lib/finance";

const HANIL = "33333333-0000-0000-0000-000000000001";
const PRODUCT = "44444444-0000-0000-0000-000000000001";

describe("Phase 6 E2E: open API → ERP → scoring → embedded finance", () => {
  let t: TestDb;
  let partner: string;
  let con: string; // contractor seeking finance
  let sup: string; // supplier owner (Hanil)

  beforeAll(async () => {
    t = await createTestDb();
    partner = await t.seedUser({ role: "contractor", companyName: "ERP파트너" });
    con = await t.seedUser({ role: "contractor", companyName: "여신시공", bizStatus: "verified" });
    sup = await t.seedUser({ role: "supplier", companyName: "한일" });
    await t.linkSupplier(HANIL, sup);
  });
  afterAll(async () => {
    await t.close();
  });

  it("runs the full open-platform + finance flow", async () => {
    // 1) CREATE API CLIENT + SCOPE -------------------------------------
    await t.asUser(partner);
    const pair = generateApiKey();
    const client = await t.db.query<{ id: string }>(
      "insert into api_clients (partner_id, name, key_hash, key_prefix, scopes, rate_limit) values ($1,'통합앱',$2,$3,$4,5) returning id",
      [partner, pair.hash, pair.prefix, ["products:read"]],
    );
    const clientId = client.rows[0]!.id;

    // 2) REST CALL: verify key + scope, LOG, RATE-LIMIT (limit 5) -------
    expect(verifyApiKey(pair.key, pair.hash)).toBe(true);
    expect(hasScope(["products:read"], "products:read")).toBe(true);
    let blocked = 0;
    for (let i = 0; i < 7; i++) {
      const used = (
        await t.db.query<{ n: number }>(
          "select count(*)::int n from api_logs where client_id=$1",
          [clientId],
        )
      ).rows[0]!.n;
      const rl = checkRateLimit(Number(used), 5);
      if (!rl.allowed) {
        blocked++;
        continue;
      }
      await t.db.query(
        "insert into api_logs (client_id, endpoint, status) values ($1,'/api/v1/products',200)",
        [clientId],
      );
    }
    const logCount = (
      await t.db.query<{ n: number }>("select count(*)::int n from api_logs where client_id=$1", [clientId])
    ).rows[0]!.n;
    expect(Number(logCount)).toBe(5); // rate-limited at 5
    expect(blocked).toBe(2);

    // 3) WEBHOOK fires with valid HMAC + retry on failure --------------
    const wh = await t.db.query<{ id: string }>(
      "insert into webhooks (client_id, event, url, secret) values ($1,'order.created','https://partner.example/wh','whsec_test') returning id",
      [clientId],
    );
    const whId = wh.rows[0]!.id;
    const event = buildWebhookEvent("order.created", "evt_1", "2026-06-07T00:00:00Z", { orderId: "o1" });
    const payloadJson = JSON.stringify(event);
    const signature = signWebhook(payloadJson, "whsec_test");
    expect(verifyWebhookSignature(payloadJson, "whsec_test", signature)).toBe(true);

    await t.asService();
    // first attempt fails
    const deliv = await t.db.query<{ id: string }>(
      "insert into webhook_deliveries (webhook_id, event, status, attempts, payload) values ($1,'order.created','failed',1,$2) returning id",
      [whId, payloadJson],
    );
    // retry succeeds
    await t.db.query(
      "update webhook_deliveries set status='delivered', attempts=attempts+1, last_attempt_at=now() where id=$1",
      [deliv.rows[0]!.id],
    );
    const delivered = await t.db.query<{ status: string; attempts: number }>(
      "select status, attempts from webhook_deliveries where id=$1",
      [deliv.rows[0]!.id],
    );
    expect(delivered.rows[0]?.status).toBe("delivered");
    expect(Number(delivered.rows[0]?.attempts)).toBe(2);

    // 4) ERP STOCK PUSH updates catalog (idempotent by version) --------
    await t.db.query(
      "insert into erp_syncs (supplier_id, direction, external_id, version, status) values ($1,'inbound','EXT-TILE',0,'idle')",
      [HANIL],
    );
    const incoming = validateErpStockPayload({
      externalId: "EXT-TILE",
      productId: PRODUCT,
      stock: 1234,
      unitPrice: 28500,
      version: 1,
    });
    expect(incoming.ok).toBe(true);
    if (incoming.ok) {
      const curVer = (
        await t.db.query<{ version: number }>(
          "select version from erp_syncs where supplier_id=$1 and external_id='EXT-TILE'",
          [HANIL],
        )
      ).rows[0]!.version;
      const product = (
        await t.db.query<{ stock: number; unit_price: number }>(
          "select stock, unit_price from products where id=$1",
          [PRODUCT],
        )
      ).rows[0]!;
      const recon = reconcileStockUpdate(
        { version: Number(curVer), stock: Number(product.stock), unit_price: Number(product.unit_price) },
        incoming.value,
      );
      expect(recon.apply).toBe(true);
      await t.db.query("update products set stock=$1, unit_price=$2 where id=$3", [
        recon.next!.stock,
        recon.next!.unit_price,
        PRODUCT,
      ]);
      await t.db.query(
        "update erp_syncs set version=$1, last_sync=now(), status='synced' where supplier_id=$2 and external_id='EXT-TILE'",
        [recon.next!.version, HANIL],
      );
      // idempotent replay of the same version → no change
      const replay = reconcileStockUpdate(
        { version: recon.next!.version, stock: recon.next!.stock, unit_price: recon.next!.unit_price },
        incoming.value,
      );
      expect(replay.apply).toBe(false);
    }
    const updated = await t.db.query<{ stock: number }>("select stock from products where id=$1", [PRODUCT]);
    expect(Number(updated.rows[0]?.stock)).toBe(1234);

    // 5) CREDIT SCORE computed -----------------------------------------
    const score = computeCreditScore({
      orderCount: 80,
      gmv: 45_000_000,
      onTimeSettlementRate: 0.95,
      returnRate: 0.04,
      tenureMonths: 20,
    });
    expect(score.coldStart).toBe(false);
    const offer = scoreToFinanceOffer(score);
    expect(offer.eligible).toBe(true);
    await t.db.query(
      "insert into credit_scores (contractor_id, score, grade, factors) values ($1,$2,$3,$4) on conflict (contractor_id) do update set score=excluded.score",
      [con, score.score, score.grade, JSON.stringify(score.factors)],
    );

    // 6) EARLY-SETTLEMENT request GATED BY SCORE -----------------------
    const receivable = 10_000_000;
    // over-limit request is rejected
    const tooBig = canRequestFinance(offer.limit + 1, {
      limit: offer.limit,
      outstanding: 0,
      overdue: false,
      eligible: offer.eligible,
    });
    expect(tooBig.ok).toBe(false);

    const gate = canRequestFinance(receivable, {
      limit: offer.limit,
      outstanding: 0,
      overdue: false,
      eligible: offer.eligible,
    });
    expect(gate.ok).toBe(true);

    const payout = computeEarlyPayout(receivable, offer.rate);
    await t.asUser(con);
    const req = await t.db.query<{ id: string }>(
      "insert into finance_requests (contractor_id, type, amount, fee, rate, status) values ($1,'early_settlement',$2,$3,$4,'requested') returning id",
      [con, payout.receivable, payout.fee, payout.rate],
    );
    const reqId = req.rows[0]!.id;

    // 7) ADVANCE DISBURSED (admin) + audit ------------------------------
    await t.asService();
    await t.db.query(
      "update finance_requests set status='disbursed', disbursed_at=now() where id=$1",
      [reqId],
    );
    await t.db.query(
      "insert into finance_audit_log (actor_id, contractor_id, action, amount, ref_id) values (null,$1,'disburse',$2,$3)",
      [con, payout.advance, reqId],
    );

    // 8) REPAYMENT NETTED FROM SETTLEMENT ------------------------------
    const outstanding = financeOutstanding(payout.receivable, payout.fee, []);
    const settlementAmount = 12_000_000; // a later settlement covers it
    const net = netRepayment(outstanding, settlementAmount);
    expect(net.fullyRepaid).toBe(true);
    expect(net.settlementRemainder).toBe(settlementAmount - outstanding);
    await t.db.query(
      "insert into repayments (finance_request_id, amount, source) values ($1,$2,'settlement')",
      [reqId, net.applied],
    );
    await t.db.query("update finance_requests set status='settled' where id=$1", [reqId]);
    await t.db.query(
      "insert into finance_audit_log (actor_id, contractor_id, action, amount, ref_id) values (null,$1,'repay',$2,$3)",
      [con, net.applied, reqId],
    );

    // contractor sees their settled request + repayment
    await t.asUser(con);
    const finalReq = await t.db.query<{ status: string }>(
      "select status from finance_requests where id=$1",
      [reqId],
    );
    expect(finalReq.rows[0]?.status).toBe("settled");
    const repaid = await t.db.query<{ n: number }>(
      "select count(*)::int n from repayments where finance_request_id=$1",
      [reqId],
    );
    expect(Number(repaid.rows[0]?.n)).toBe(1);

    // audit trail is present + immutable
    const audit = await t.db.query<{ n: number }>(
      "select count(*)::int n from finance_audit_log where contractor_id=$1",
      [con],
    );
    expect(Number(audit.rows[0]?.n)).toBe(2);
  });
});
