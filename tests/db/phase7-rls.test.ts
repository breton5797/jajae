/**
 * Phase 7 RLS + DB-layer enforcement (DoD #4):
 *  - the DB trigger blocks an over-cap / non-allowlisted / kill-switched auto-PO
 *    even when inserted directly (server/DB layer, not prompt);
 *  - contractors are isolated to own policies/decisions;
 *  - agent_audit_log is immutable.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./harness";

const HANIL = "33333333-0000-0000-0000-000000000001";
const DONGYANG = "33333333-0000-0000-0000-000000000002";

describe("Phase 7 RLS + DB policy enforcement", () => {
  let t: TestDb;
  let A: string;
  let B: string;

  async function makePo(supplier: string, subtotal: number): Promise<string> {
    const ord = await t.db.query<{ id: string }>(
      "insert into orders (contractor_id, payment_method, status, total) values ($1,'escrow','pending',$2) returning id",
      [A, subtotal],
    );
    const po = await t.db.query<{ id: string }>(
      "insert into purchase_orders (order_id, supplier_id, status, subtotal) values ($1,$2,'pending',$3) returning id",
      [ord.rows[0]!.id, supplier, subtotal],
    );
    return po.rows[0]!.id;
  }
  async function makeDecision(status: string): Promise<string> {
    const d = await t.db.query<{ id: string }>(
      "insert into agent_decisions (contractor_id, action, status) values ($1,'reorder',$2) returning id",
      [A, status],
    );
    return d.rows[0]!.id;
  }
  const future = () => new Date(Date.now() + 86_400_000).toISOString();

  beforeAll(async () => {
    t = await createTestDb();
    A = await t.seedUser({ role: "contractor", companyName: "자율시공" });
    B = await t.seedUser({ role: "contractor", companyName: "타사" });
    await t.asService();
    await t.db.query(
      `insert into agent_policies (contractor_id, spend_cap, supplier_allowlist, max_po, escalation_threshold, enabled)
       values ($1,10000000,$2,3000000,2000000,true)`,
      [A, [HANIL]],
    );
  });
  afterAll(async () => {
    await t.close();
  });

  it("contractors see own policy/decisions only", async () => {
    await t.asUser(A);
    expect((await t.db.query("select * from agent_policies")).rows.length).toBe(1);
    await t.asUser(B);
    expect((await t.db.query("select * from agent_policies")).rows.length).toBe(0);
  });

  it("DB trigger BLOCKS an auto-PO exceeding max_po", async () => {
    await t.asService();
    const po = await makePo(HANIL, 5_000_000); // > max_po 3M
    const dec = await makeDecision("auto_executed");
    await expect(
      t.db.query(
        "insert into agent_actions (decision_id, po_id, reversible_until) values ($1,$2,$3)",
        [dec, po, future()],
      ),
    ).rejects.toThrow(/max_po/);
  });

  it("DB trigger BLOCKS an auto-PO from a non-allowlisted supplier", async () => {
    await t.asService();
    const po = await makePo(DONGYANG, 1_000_000); // within cap but supplier not allowed
    const dec = await makeDecision("auto_executed");
    await expect(
      t.db.query(
        "insert into agent_actions (decision_id, po_id, reversible_until) values ($1,$2,$3)",
        [dec, po, future()],
      ),
    ).rejects.toThrow(/allowlist/);
  });

  it("kill-switch (enabled=false) halts auto-execution at the DB layer", async () => {
    await t.asService();
    await t.db.query("update agent_policies set enabled=false where contractor_id=$1", [A]);
    const po = await makePo(HANIL, 1_000_000); // within all limits
    const dec = await makeDecision("auto_executed");
    await expect(
      t.db.query(
        "insert into agent_actions (decision_id, po_id, reversible_until) values ($1,$2,$3)",
        [dec, po, future()],
      ),
    ).rejects.toThrow(/kill-switch/);
    await t.db.query("update agent_policies set enabled=true where contractor_id=$1", [A]);
  });

  it("a within-policy auto-PO is allowed; human-approved (non-auto) bypasses the auto gate", async () => {
    await t.asService();
    const po = await makePo(HANIL, 1_500_000);
    const dec = await makeDecision("auto_executed");
    const ok = await t.db.query<{ id: string }>(
      "insert into agent_actions (decision_id, po_id, reversible_until) values ($1,$2,$3) returning id",
      [dec, po, future()],
    );
    expect(ok.rows.length).toBe(1);

    // an 'approved' (human-authorized) decision may exceed auto limits
    const bigPo = await makePo(HANIL, 9_000_000);
    const approved = await makeDecision("approved");
    const ok2 = await t.db.query(
      "insert into agent_actions (decision_id, po_id, reversible_until) values ($1,$2,$3) returning id",
      [approved, bigPo, future()],
    );
    expect(ok2.rows.length).toBe(1);
  });

  it("agent_audit_log is immutable (trigger blocks update/delete)", async () => {
    await t.asService();
    await t.db.query(
      "insert into agent_audit_log (contractor_id, action, amount) values ($1,'auto_po',1500000)",
      [A],
    );
    await expect(
      t.db.query("update agent_audit_log set amount=0"),
    ).rejects.toThrow(/append-only/);
  });
});
