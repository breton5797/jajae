/**
 * Phase 6 RLS (DoD #4) — partners are isolated to their own API clients/logs/
 * webhooks; contractors see own scores/finance (weights are code-only, never in
 * the row); finance_audit_log is immutable (append-only).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./harness";

describe("Phase 6 RLS", () => {
  let t: TestDb;
  let P1: string;
  let P2: string;
  let admin: string;
  let client1: string;

  beforeAll(async () => {
    t = await createTestDb();
    P1 = await t.seedUser({ role: "contractor", companyName: "파트너1" });
    P2 = await t.seedUser({ role: "contractor", companyName: "파트너2" });
    admin = await t.seedUser({ role: "admin", companyName: "관리자" });

    // each partner creates an API client (RLS: partner_id = auth.uid())
    await t.asUser(P1);
    client1 = (
      await t.db.query<{ id: string }>(
        "insert into api_clients (partner_id, name, key_hash, key_prefix, scopes) values ($1,'P1앱','hash1','jck_live_aaa',$2) returning id",
        [P1, ["products:read"]],
      )
    ).rows[0]!.id;
    await t.db.query(
      "insert into api_logs (client_id, endpoint, status) values ($1,'/api/v1/products',200)",
      [client1],
    );
    await t.db.query(
      "insert into webhooks (client_id, event, url, secret) values ($1,'order.created','https://p1.example/wh','whsec_1')",
      [client1],
    );

    await t.asUser(P2);
    await t.db.query(
      "insert into api_clients (partner_id, name, key_hash, key_prefix, scopes) values ($1,'P2앱','hash2','jck_live_bbb',$2)",
      [P2, ["orders:read"]],
    );

    // scores + finance for P1 (acting as contractor); audit row
    await t.asService();
    await t.db.query(
      "insert into credit_scores (contractor_id, score, grade, factors) values ($1,820,'AA',$2)",
      [P1, JSON.stringify([{ key: "volume", label: "거래 규모", value: 1, contribution: 250 }])],
    );
    await t.db.query(
      "insert into finance_audit_log (actor_id, contractor_id, action, amount) values ($1,$1,'disburse',9800000)",
      [P1],
    );
    await t.asUser(P1);
    await t.db.query(
      "insert into finance_requests (contractor_id, type, amount, status) values ($1,'early_settlement',10000000,'requested')",
      [P1],
    );
  });

  afterAll(async () => {
    await t.close();
  });

  it("partner P1 sees own API client/logs/webhooks; P2 cannot", async () => {
    await t.asUser(P1);
    expect((await t.db.query("select * from api_clients")).rows.length).toBe(1);
    expect((await t.db.query("select * from api_logs")).rows.length).toBe(1);
    expect((await t.db.query("select * from webhooks")).rows.length).toBe(1);

    await t.asUser(P2);
    expect((await t.db.query("select * from api_logs")).rows.length).toBe(0);
    expect(
      (await t.db.query("select * from webhooks where client_id=$1", [client1])).rows.length,
    ).toBe(0);
  });

  it("contractor sees own score (factors, not weights) and finance; others cannot", async () => {
    await t.asUser(P1);
    const score = await t.db.query<{ factors: unknown }>("select factors from credit_scores");
    expect(score.rows.length).toBe(1);
    const factorsJson = JSON.stringify(score.rows[0]?.factors);
    expect(factorsJson).not.toContain("weight"); // raw weights never stored/exposed
    expect((await t.db.query("select * from finance_requests")).rows.length).toBe(1);

    await t.asUser(P2);
    expect((await t.db.query("select * from credit_scores")).rows.length).toBe(0);
    expect((await t.db.query("select * from finance_requests")).rows.length).toBe(0);
  });

  it("finance_audit_log is append-only — authenticated writes denied by RLS (no-op)", async () => {
    await t.asUser(admin);
    expect((await t.db.query("select * from finance_audit_log")).rows.length).toBe(1);
    // No UPDATE/DELETE policy → RLS filters all rows → 0 rows changed, row intact.
    await t.db.query("update finance_audit_log set amount=0");
    const after = await t.db.query<{ amount: number }>("select amount from finance_audit_log");
    expect(Number(after.rows[0]?.amount)).toBe(9800000);
  });

  it("even the RLS-bypassing service role cannot mutate the audit log (trigger-enforced)", async () => {
    await t.asService();
    await expect(
      t.db.query("update finance_audit_log set action='tamper'"),
    ).rejects.toThrow(/append-only/);
    await expect(
      t.db.query("delete from finance_audit_log"),
    ).rejects.toThrow(/append-only/);
  });
});
