/**
 * Phase 7 follow-up — agent execution RPCs (plpgsql, atomic). Verifies the
 * three goals completed together via transactional RPCs:
 *   (1) approve spend counts toward spend_cap (total agent-originated spend is capped);
 *   (2) order+PO+action are atomic — a policy violation or mid-sequence failure
 *       rolls back fully (no orphan order/PO, no bricked decision);
 *   (3) the order is owned by the decision's contractor, even on admin approval.
 * Per-item limits (max_po/allowlist) remain human-overridable via approval;
 * only spend_cap is the hard ceiling that approvals also respect.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./harness";

const HANIL = "33333333-0000-0000-0000-000000000001";
const DONGYANG = "33333333-0000-0000-0000-000000000002";
const future = () => new Date(Date.now() + 86_400_000).toISOString();

interface PolicyOpts {
  spend_cap?: number;
  max_po?: number;
  allowlist?: string[];
  enabled?: boolean;
}

describe("Phase 7 agent execution RPCs", () => {
  let t: TestDb;

  async function newContractor(opts: PolicyOpts = {}): Promise<string> {
    const A = await t.seedUser({ role: "contractor", companyName: "시공" });
    await t.asService();
    await t.db.query(
      `insert into agent_policies (contractor_id, spend_cap, supplier_allowlist, max_po, escalation_threshold, enabled)
       values ($1,$2,$3,$4,0,$5)`,
      [
        A,
        opts.spend_cap ?? 100_000_000,
        opts.allowlist ?? [HANIL],
        opts.max_po ?? 100_000_000,
        opts.enabled ?? true,
      ],
    );
    return A;
  }

  function planJson(supplier: string, amount: number): string {
    return JSON.stringify({ productId: "p", supplierId: supplier, qty: 1, amount, rationale: "r" });
  }

  async function execAuto(contractor: string, supplier: string, amount: number) {
    return t.db.query<{ po: string }>(
      "select agent_execute_auto($1,$2,$3,$4,$5,$6) as po",
      [contractor, supplier, amount, "재발주", planJson(supplier, amount), future()],
    );
  }
  async function escalate(A: string, supplier: string, amount: number): Promise<string> {
    await t.asService();
    const d = await t.db.query<{ id: string }>(
      "insert into agent_decisions (contractor_id, action, rationale, status, plan) values ($1,'reorder','임계값 초과','escalated',$2) returning id",
      [A, planJson(supplier, amount)],
    );
    return d.rows[0]!.id;
  }

  beforeAll(async () => {
    t = await createTestDb();
  });
  afterAll(async () => {
    await t.close();
  });

  // ---------- agent_execute_auto ----------
  it("auto: creates order+PO+decision+action+audit atomically", async () => {
    const A = await newContractor({ spend_cap: 3_000_000, max_po: 3_000_000 });
    await t.asUser(A);
    const poId = (await execAuto(A, HANIL, 1_000_000)).rows[0]!.po;
    expect(poId).toBeTruthy();
    await t.asService();
    expect((await t.db.query("select 1 from purchase_orders where id=$1", [poId])).rows.length).toBe(1);
    expect(
      (await t.db.query(
        "select 1 from agent_actions a join agent_decisions d on d.id=a.decision_id where a.po_id=$1 and d.status='auto_executed'",
        [poId],
      )).rows.length,
    ).toBe(1);
    expect(
      (await t.db.query("select 1 from agent_audit_log where contractor_id=$1 and action='auto_po' and amount=1000000", [A])).rows.length,
    ).toBe(1);
  });

  it("auto: an over-cap auto-PO raises AND rolls back (no orphan order/PO)", async () => {
    const A = await newContractor({ spend_cap: 2_000_000, max_po: 3_000_000 });
    await t.asUser(A);
    await execAuto(A, HANIL, 1_500_000); // committed
    await expect(execAuto(A, HANIL, 1_000_000)).rejects.toThrow(/spend_cap/); // 1.5+1=2.5 > 2
    await t.asService();
    expect((await t.db.query("select 1 from orders where contractor_id=$1 and subtotal=1000000", [A])).rows.length).toBe(0);
    expect((await t.db.query("select count(*)::int n from purchase_orders po join orders o on o.id=po.order_id where o.contractor_id=$1", [A])).rows[0]).toEqual({ n: 1 });
  });

  it("auto: blocks above max_po and non-allowlisted supplier and when kill-switched", async () => {
    const A = await newContractor({ spend_cap: 100_000_000, max_po: 3_000_000, allowlist: [HANIL] });
    await t.asUser(A);
    await expect(execAuto(A, HANIL, 5_000_000)).rejects.toThrow(/max_po/);
    await expect(execAuto(A, DONGYANG, 1_000_000)).rejects.toThrow(/allowlist/);
    const B = await newContractor({ enabled: false });
    await t.asUser(B);
    await expect(execAuto(B, HANIL, 1_000_000)).rejects.toThrow(/kill-switch/);
  });

  it("auto: rejects a contractor acting for someone else", async () => {
    const A = await newContractor();
    const B = await newContractor();
    await t.asUser(B);
    await expect(execAuto(A, HANIL, 1_000_000)).rejects.toThrow(/unauthorized/i);
  });

  // ---------- agent_approve_decision ----------
  it("approve: executes an escalated decision atomically", async () => {
    const A = await newContractor({ spend_cap: 100_000_000, max_po: 3_000_000 });
    const dec = await escalate(A, HANIL, 9_000_000); // above max_po → was escalated
    await t.asUser(A);
    const poId = (
      await t.db.query<{ po: string }>("select agent_approve_decision($1,$2) as po", [dec, future()])
    ).rows[0]!.po;
    expect(poId).toBeTruthy();
    await t.asService();
    expect((await t.db.query("select status from agent_decisions where id=$1", [dec])).rows[0]).toEqual({ status: "approved" });
    expect((await t.db.query("select 1 from agent_actions where decision_id=$1", [dec])).rows.length).toBe(1);
  });

  it("approve: bypasses per-item max_po (human override) but still respects spend_cap", async () => {
    // 9M > max_po 3M is allowed by approval; and 9M <= 100M cap
    const A = await newContractor({ spend_cap: 100_000_000, max_po: 3_000_000 });
    const dec = await escalate(A, HANIL, 9_000_000);
    await t.asUser(A);
    await expect(
      t.db.query("select agent_approve_decision($1,$2) as po", [dec, future()]),
    ).resolves.toBeTruthy();
  });

  it("approve: COUNTS toward spend_cap — a later auto-PO is blocked by approved spend", async () => {
    const A = await newContractor({ spend_cap: 3_000_000, max_po: 3_000_000 });
    const dec = await escalate(A, HANIL, 2_000_000);
    await t.asUser(A);
    await t.db.query("select agent_approve_decision($1,$2)", [dec, future()]); // 2M approved committed
    await expect(execAuto(A, HANIL, 2_000_000)).rejects.toThrow(/spend_cap/); // 2+2=4 > 3
  });

  it("approve: a cap-exceeding approval raises AND rolls back (decision stays escalated, no orphan)", async () => {
    const A = await newContractor({ spend_cap: 2_000_000, max_po: 100_000_000 });
    await t.asUser(A);
    await execAuto(A, HANIL, 1_500_000); // 1.5M committed
    const dec = await escalate(A, HANIL, 1_000_000); // approving pushes to 2.5M > 2M
    await t.asUser(A);
    await expect(
      t.db.query("select agent_approve_decision($1,$2)", [dec, future()]),
    ).rejects.toThrow(/spend_cap/);
    await t.asService();
    expect((await t.db.query("select status from agent_decisions where id=$1", [dec])).rows[0]).toEqual({ status: "escalated" });
    expect((await t.db.query("select 1 from orders where contractor_id=$1 and subtotal=1000000", [A])).rows.length).toBe(0);
  });

  it("approve: rejects a non-escalated decision (idempotency) and another contractor's decision", async () => {
    const A = await newContractor();
    const B = await newContractor();
    const dec = await escalate(A, HANIL, 1_000_000);
    await t.asUser(A);
    await t.db.query("select agent_approve_decision($1,$2)", [dec, future()]); // now approved
    await expect(
      t.db.query("select agent_approve_decision($1,$2)", [dec, future()]),
    ).rejects.toThrow(/not actionable|escalated/i);
    const dec2 = await escalate(A, HANIL, 1_000_000);
    await t.asUser(B);
    await expect(
      t.db.query("select agent_approve_decision($1,$2)", [dec2, future()]),
    ).rejects.toThrow(/unauthorized/i);
  });

  it("approve: admin acting on behalf attributes the order to the decision's contractor", async () => {
    const A = await newContractor();
    const admin = await t.seedUser({ role: "admin", companyName: "관리자" });
    const dec = await escalate(A, HANIL, 1_000_000);
    await t.asUser(admin);
    const poId = (
      await t.db.query<{ po: string }>("select agent_approve_decision($1,$2) as po", [dec, future()])
    ).rows[0]!.po;
    await t.asService();
    const owner = (
      await t.db.query<{ contractor_id: string }>(
        "select o.contractor_id from purchase_orders po join orders o on o.id=po.order_id where po.id=$1",
        [poId],
      )
    ).rows[0]!.contractor_id;
    expect(owner).toBe(A);
  });

  // ---------- agent_reject_decision ----------
  it("reject: marks an escalated decision rejected; a non-escalated one raises", async () => {
    const A = await newContractor();
    const dec = await escalate(A, HANIL, 1_000_000);
    await t.asUser(A);
    await t.db.query("select agent_reject_decision($1)", [dec]);
    await t.asService();
    expect((await t.db.query("select status from agent_decisions where id=$1", [dec])).rows[0]).toEqual({ status: "rejected" });
    expect((await t.db.query("select 1 from agent_audit_log where decision_id=$1 and action='reject'", [dec])).rows.length).toBe(1);
    await t.asUser(A);
    await expect(t.db.query("select agent_reject_decision($1)", [dec])).rejects.toThrow(/not actionable|escalated/i);
  });

  // ---------- agent_reverse_action ----------
  it("reverse: cancels the PO, records the reversed amount, and frees cap room", async () => {
    const A = await newContractor({ spend_cap: 2_000_000, max_po: 3_000_000 });
    await t.asUser(A);
    const poId = (await execAuto(A, HANIL, 1_500_000)).rows[0]!.po;
    await t.asService();
    const actId = (await t.db.query<{ id: string }>("select id from agent_actions where po_id=$1", [poId])).rows[0]!.id;
    await t.asUser(A);
    await t.db.query("select agent_reverse_action($1)", [actId]);
    await t.asService();
    expect((await t.db.query("select status from purchase_orders where id=$1", [poId])).rows[0]).toEqual({ status: "cancelled" });
    expect((await t.db.query("select reversed from agent_actions where id=$1", [actId])).rows[0]).toEqual({ reversed: true });
    expect(
      (await t.db.query<{ amount: string }>("select amount from agent_audit_log where action='reversal' and decision_id=(select decision_id from agent_actions where id=$1)", [actId])).rows[0],
    ).toEqual({ amount: "1500000" });
    // cap freed → a fresh 1.5M auto is allowed again
    await t.asUser(A);
    await expect(execAuto(A, HANIL, 1_500_000)).resolves.toBeTruthy();
  });

  it("approve: denies an agent action when the contractor has NO policy row (fail-closed)", async () => {
    // attack: no policy → spend_cap is NULL; the cap gate must still deny, not no-op
    const A = await t.seedUser({ role: "contractor", companyName: "무정책" });
    await t.asUser(A);
    const dec = (
      await t.db.query<{ id: string }>(
        "insert into agent_decisions (contractor_id, action, status, plan) values ($1,'reorder','escalated',$2) returning id",
        [A, planJson(HANIL, 999_999_999)],
      )
    ).rows[0]!.id;
    await expect(
      t.db.query("select agent_approve_decision($1,$2)", [dec, future()]),
    ).rejects.toThrow(/policy/i);
    await t.asService();
    expect((await t.db.query("select 1 from orders where contractor_id=$1", [A])).rows.length).toBe(0);
  });

  it("approve: a contractor cannot bypass the cap by deleting their own policy row", async () => {
    const A = await newContractor({ spend_cap: 1_000_000 });
    await t.asUser(A);
    const dec = (
      await t.db.query<{ id: string }>(
        "insert into agent_decisions (contractor_id, action, status, plan) values ($1,'reorder','escalated',$2) returning id",
        [A, planJson(HANIL, 50_000_000)],
      )
    ).rows[0]!.id;
    await t.db.query("delete from agent_policies where contractor_id=$1", [A]); // RLS allows self-delete
    await expect(
      t.db.query("select agent_approve_decision($1,$2)", [dec, future()]),
    ).rejects.toThrow(/policy/i);
  });

  it("reverse: also cancels the parent order (no orphan pending order)", async () => {
    const A = await newContractor({ spend_cap: 5_000_000, max_po: 3_000_000 });
    await t.asUser(A);
    const poId = (await execAuto(A, HANIL, 1_000_000)).rows[0]!.po;
    await t.asService();
    const actId = (await t.db.query<{ id: string }>("select id from agent_actions where po_id=$1", [poId])).rows[0]!.id;
    const orderId = (
      await t.db.query<{ order_id: string }>("select order_id from purchase_orders where id=$1", [poId])
    ).rows[0]!.order_id;
    await t.asUser(A);
    await t.db.query("select agent_reverse_action($1)", [actId]);
    await t.asService();
    expect((await t.db.query("select status from orders where id=$1", [orderId])).rows[0]).toEqual({ status: "cancelled" });
  });

  it("reverse: a second reversal of the same action raises", async () => {
    const A = await newContractor({ spend_cap: 5_000_000, max_po: 3_000_000 });
    await t.asUser(A);
    const poId = (await execAuto(A, HANIL, 1_000_000)).rows[0]!.po;
    await t.asService();
    const actId = (await t.db.query<{ id: string }>("select id from agent_actions where po_id=$1", [poId])).rows[0]!.id;
    await t.asUser(A);
    await t.db.query("select agent_reverse_action($1)", [actId]);
    await expect(t.db.query("select agent_reverse_action($1)", [actId])).rejects.toThrow(/already|취소/i);
  });
});
