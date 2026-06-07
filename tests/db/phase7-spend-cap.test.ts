/**
 * Phase 7 hardening (code-review P0). DB-layer guardrails that the original
 * Phase 7 trigger missed:
 *   (1) spend_cap is enforced CUMULATIVELY across separate auto-PO actions
 *       (i.e. across agent runs), net of reversals — not just within one run;
 *   (2) a single decision can produce at most ONE executed action, so a
 *       duplicate approval / re-run cannot mint a second auto-PO.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./harness";
import { sumNetAutoSpend } from "@/lib/policy";

const HANIL = "33333333-0000-0000-0000-000000000001";
const future = () => new Date(Date.now() + 86_400_000).toISOString();

describe("Phase 7 — cumulative spend_cap (DB layer)", () => {
  let t: TestDb;
  let A: string;

  async function makePo(subtotal: number): Promise<string> {
    const ord = await t.db.query<{ id: string }>(
      "insert into orders (contractor_id, payment_method, status, total) values ($1,'escrow','pending',$2) returning id",
      [A, subtotal],
    );
    const po = await t.db.query<{ id: string }>(
      "insert into purchase_orders (order_id, supplier_id, status, subtotal) values ($1,$2,'pending',$3) returning id",
      [ord.rows[0]!.id, HANIL, subtotal],
    );
    return po.rows[0]!.id;
  }
  async function autoDecision(): Promise<string> {
    const d = await t.db.query<{ id: string }>(
      "insert into agent_decisions (contractor_id, action, status) values ($1,'reorder','auto_executed') returning id",
      [A],
    );
    return d.rows[0]!.id;
  }
  function insertAction(decId: string, poId: string) {
    return t.db.query<{ id: string }>(
      "insert into agent_actions (decision_id, po_id, reversible_until) values ($1,$2,$3) returning id",
      [decId, poId, future()],
    );
  }

  beforeAll(async () => {
    t = await createTestDb();
    A = await t.seedUser({ role: "contractor", companyName: "자율시공" });
    await t.asService();
    // spend_cap (2M) is the binding limit; max_po (3M) is higher so it never masks it.
    await t.db.query(
      `insert into agent_policies (contractor_id, spend_cap, supplier_allowlist, max_po, escalation_threshold, enabled)
       values ($1,2000000,$2,3000000,0,true)`,
      [A, [HANIL]],
    );
  });
  afterAll(async () => {
    await t.close();
  });

  it("blocks a later auto-PO once cumulative spend would exceed the cap, and a reversal frees room", async () => {
    await t.asService();

    // run #1: 1.5M fits under the 2M cap
    const po1 = await makePo(1_500_000);
    const act1 = await insertAction(await autoDecision(), po1);
    expect(act1.rows.length).toBe(1);

    // run #2: another 1.5M would push cumulative to 3M > 2M → DB blocks it
    const po2 = await makePo(1_500_000);
    await expect(insertAction(await autoDecision(), po2)).rejects.toThrow(/spend_cap/);

    // reverse run #1 → net auto-spend back to 0
    await t.db.query("update agent_actions set reversed=true where id=$1", [
      act1.rows[0]!.id,
    ]);

    // now a 1.5M auto-PO fits again
    const po3 = await makePo(1_500_000);
    expect((await insertAction(await autoDecision(), po3)).rows.length).toBe(1);
  });
});

describe("Phase 7 — one executed action per decision (duplicate auto-PO backstop)", () => {
  let t: TestDb;
  let A: string;

  beforeAll(async () => {
    t = await createTestDb();
    A = await t.seedUser({ role: "contractor", companyName: "자율시공" });
    await t.asService();
    // generous limits so neither spend_cap nor max_po masks the uniqueness check
    await t.db.query(
      `insert into agent_policies (contractor_id, spend_cap, supplier_allowlist, max_po, escalation_threshold, enabled)
       values ($1,100000000,$2,100000000,0,true)`,
      [A, [HANIL]],
    );
  });
  afterAll(async () => {
    await t.close();
  });

  it("rejects a second action for the same decision", async () => {
    await t.asService();
    const ord = await t.db.query<{ id: string }>(
      "insert into orders (contractor_id, payment_method, status, total) values ($1,'escrow','pending',500000) returning id",
      [A],
    );
    const po = await t.db.query<{ id: string }>(
      "insert into purchase_orders (order_id, supplier_id, status, subtotal) values ($1,$2,'pending',500000) returning id",
      [ord.rows[0]!.id, HANIL],
    );
    const dec = await t.db.query<{ id: string }>(
      "insert into agent_decisions (contractor_id, action, status) values ($1,'reorder','auto_executed') returning id",
      [A],
    );
    const first = await t.db.query(
      "insert into agent_actions (decision_id, po_id, reversible_until) values ($1,$2,$3) returning id",
      [dec.rows[0]!.id, po.rows[0]!.id, future()],
    );
    expect(first.rows.length).toBe(1);

    // a duplicate approval / re-run for the same decision must NOT create a 2nd action
    await expect(
      t.db.query(
        "insert into agent_actions (decision_id, po_id, reversible_until) values ($1,$2,$3)",
        [dec.rows[0]!.id, po.rows[0]!.id, future()],
      ),
    ).rejects.toThrow(/unique|duplicate/i);
  });
});

describe("Phase 7 — a reversal frees cap room on BOTH the server and DB layers", () => {
  let t: TestDb;
  let A: string;

  async function makePo(subtotal: number): Promise<string> {
    const ord = await t.db.query<{ id: string }>(
      "insert into orders (contractor_id, payment_method, status, total) values ($1,'escrow','pending',$2) returning id",
      [A, subtotal],
    );
    const po = await t.db.query<{ id: string }>(
      "insert into purchase_orders (order_id, supplier_id, status, subtotal) values ($1,$2,'pending',$3) returning id",
      [ord.rows[0]!.id, HANIL, subtotal],
    );
    return po.rows[0]!.id;
  }
  async function autoDecision(): Promise<string> {
    const d = await t.db.query<{ id: string }>(
      "insert into agent_decisions (contractor_id, action, status) values ($1,'reorder','auto_executed') returning id",
      [A],
    );
    return d.rows[0]!.id;
  }

  beforeAll(async () => {
    t = await createTestDb();
    A = await t.seedUser({ role: "contractor", companyName: "자율시공" });
    await t.asService();
    await t.db.query(
      `insert into agent_policies (contractor_id, spend_cap, supplier_allowlist, max_po, escalation_threshold, enabled)
       values ($1,2000000,$2,3000000,0,true)`,
      [A, [HANIL]],
    );
  });
  afterAll(async () => {
    await t.close();
  });

  it("after a recorded reversal, server net spend is 0 and the DB allows a fresh full-cap auto-PO", async () => {
    await t.asService();

    // auto-PO #1: 1.5M, with its audit row (as the run route writes it)
    const po1 = await makePo(1_500_000);
    const dec1 = await autoDecision();
    const act1 = await t.db.query<{ id: string }>(
      "insert into agent_actions (decision_id, po_id, reversible_until) values ($1,$2,$3) returning id",
      [dec1, po1, future()],
    );
    await t.db.query(
      "insert into agent_audit_log (contractor_id, decision_id, action, amount) values ($1,$2,'auto_po',$3)",
      [A, dec1, 1_500_000],
    );

    // reverse #1 exactly as the fixed reverse route does: cancel PO, mark the
    // action reversed, and write the reversal audit row with the PO subtotal.
    await t.db.query("update purchase_orders set status='cancelled' where id=$1", [po1]);
    await t.db.query("update agent_actions set reversed=true where id=$1", [act1.rows[0]!.id]);
    await t.db.query(
      "insert into agent_audit_log (contractor_id, decision_id, action, amount) select $1,$2,'reversal', subtotal from purchase_orders where id=$3",
      [A, dec1, po1],
    );

    // SERVER layer: net autonomous spend is back to 0
    const auditRows = (
      await t.db.query<{ action: string; amount: string }>(
        "select action, amount from agent_audit_log where contractor_id=$1 and action in ('auto_po','reversal')",
        [A],
      )
    ).rows.map((r) => ({ action: r.action, amount: Number(r.amount) }));
    expect(sumNetAutoSpend(auditRows)).toBe(0);

    // DB layer: a fresh 2M auto-PO (the full cap) is now allowed
    const po2 = await makePo(2_000_000);
    const dec2 = await autoDecision();
    const act2 = await t.db.query(
      "insert into agent_actions (decision_id, po_id, reversible_until) values ($1,$2,$3) returning id",
      [dec2, po2, future()],
    );
    expect(act2.rows.length).toBe(1);
  });
});
