/**
 * DoD #5 — Phase 7 autonomous procurement E2E against real schema + RLS + DB
 * triggers (PGlite): set policy → forecast triggers agent → within-bound plan
 * auto-creates a PO with rationale → over-threshold plan escalates → human
 * approves → fulfillment routes to hub stock (same-day) → kill-switch pauses →
 * reversal cancels a reversible PO.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./../db/harness";
import { planReorders } from "@/lib/agent";
import { evaluatePlan, assertWithinPolicy } from "@/lib/policy";
import { routeOrderLine, etaDate, deductHubStock, type HubStock } from "@/lib/fulfillment";
import type { AgentPolicy, PlanItem, Product } from "@/lib/types";

const HANIL = "33333333-0000-0000-0000-000000000001";
const P_CHEAP = "44444444-0000-0000-0000-000000000001"; // HANIL tile 29000
const P_MID = "44444444-0000-0000-0000-000000000002"; // HANIL 욕실 31000
const ORDER_DATE = "2026-06-07";

function rowToProduct(r: Record<string, unknown>): Product {
  return {
    id: String(r.id),
    supplier_id: String(r.supplier_id),
    category_id: String(r.category_id),
    name: String(r.name),
    brand: String(r.brand ?? ""),
    spec: {},
    unit: r.unit as Product["unit"],
    unit_price: Number(r.unit_price),
    stock: Number(r.stock),
    lead_time_days: Number(r.lead_time_days),
    spec_sheet_url: null,
    status: r.status as Product["status"],
    created_at: String(r.created_at),
  };
}

describe("Phase 7 E2E: autonomous procurement + fulfillment + oversight", () => {
  let t: TestDb;
  let A: string;
  let hubId: string;

  const future = () => new Date(Date.now() + 86_400_000).toISOString();

  beforeAll(async () => {
    t = await createTestDb();
    A = await t.seedUser({ role: "contractor", companyName: "자율시공", bizStatus: "verified" });
    const sup = await t.seedUser({ role: "supplier", companyName: "한일" });
    await t.linkSupplier(HANIL, sup);
  });
  afterAll(async () => {
    await t.close();
  });

  it("runs the full autonomous flow with guardrails", async () => {
    // 1) SET POLICY -----------------------------------------------------
    await t.asUser(A);
    await t.db.query(
      `insert into agent_policies (contractor_id, spend_cap, supplier_allowlist, max_po, escalation_threshold, enabled)
       values ($1,10000000,$2,3000000,2000000,true)`,
      [A, [HANIL]],
    );
    const policyRow = (
      await t.db.query<Record<string, unknown>>(
        "select * from agent_policies where contractor_id=$1",
        [A],
      )
    ).rows[0]!;
    const policy: AgentPolicy = {
      id: String(policyRow.id),
      contractor_id: A,
      spend_cap: Number(policyRow.spend_cap),
      supplier_allowlist: policyRow.supplier_allowlist as string[],
      max_po: Number(policyRow.max_po),
      escalation_threshold: Number(policyRow.escalation_threshold),
      category_limits: {},
      enabled: Boolean(policyRow.enabled),
      created_at: String(policyRow.created_at),
    };

    // 2) FORECAST TRIGGERS AGENT → plan -------------------------------
    const products = (
      await t.db.query<Record<string, unknown>>(
        "select * from products where id = any($1)",
        [[P_CHEAP, P_MID]],
      )
    ).rows.map(rowToProduct);
    const plan = planReorders(
      [
        { productId: P_CHEAP, suggestedQty: 50 }, // 1.45M → auto (< 2M)
        { productId: P_MID, suggestedQty: 80 }, // 2.48M → escalate (> 2M, < 3M)
      ],
      products,
    );
    expect(plan.items).toHaveLength(2);
    expect(plan.items[0]?.rationale).toContain("재발주");

    // 3) SERVER-SIDE POLICY EVAL --------------------------------------
    const evalResult = evaluatePlan(plan.items, policy);
    expect(evalResult.autoItems).toHaveLength(1);
    expect(evalResult.escalateItems).toHaveLength(1);
    expect(evalResult.autoItems[0]?.productId).toBe(P_CHEAP);

    // 4) AUTO-EXECUTE the within-bound item ---------------------------
    await t.asService();
    const autoItem = evalResult.autoItems[0]!;
    expect(assertWithinPolicy(autoItem, policy, 0)).toBe(true);
    const autoPoId = await createPoFor(t, A, autoItem);
    const autoDec = (
      await t.db.query<{ id: string }>(
        "insert into agent_decisions (contractor_id, action, rationale, status, plan) values ($1,'reorder',$2,'auto_executed',$3) returning id",
        [A, autoItem.rationale, JSON.stringify(autoItem)],
      )
    ).rows[0]!.id;
    const autoAction = await t.db.query<{ id: string }>(
      "insert into agent_actions (decision_id, po_id, reversible_until) values ($1,$2,$3) returning id",
      [autoDec, autoPoId, future()],
    );
    expect(autoAction.rows.length).toBe(1); // DB trigger allowed it (within policy)
    await t.db.query(
      "insert into agent_audit_log (contractor_id, decision_id, action, amount) values ($1,$2,'auto_po',$3)",
      [A, autoDec, autoItem.amount],
    );

    // 5) ESCALATE the over-threshold item → decision queue ------------
    const escItem = evalResult.escalateItems[0]!;
    const escDec = (
      await t.db.query<{ id: string }>(
        "insert into agent_decisions (contractor_id, action, rationale, status, plan) values ($1,'reorder','임계값 초과 — 사람 승인 필요','escalated',$2) returning id",
        [A, JSON.stringify(escItem)],
      )
    ).rows[0]!.id;
    // queue is visible to the contractor
    await t.asUser(A);
    const queued = await t.db.query("select * from agent_decisions where status='escalated'");
    expect(queued.rows.length).toBe(1);

    // 6) HUMAN APPROVES → execute (bypasses auto gate via 'approved') --
    await t.db.query("update agent_decisions set status='approved' where id=$1", [escDec]);
    await t.asService();
    const escPoId = await createPoFor(t, A, escItem);
    const escAction = await t.db.query(
      "insert into agent_actions (decision_id, po_id, reversible_until) values ($1,$2,$3) returning id",
      [escDec, escPoId, future()],
    );
    expect(escAction.rows.length).toBe(1); // approved → allowed even above auto limit

    // 7) FULFILLMENT routes to HUB stock for same-day -----------------
    hubId = (
      await t.db.query<{ id: string }>(
        "insert into hubs (name, location, lat, lng, capacity) values ('서울허브','서울 송파',37.5,127.1,100000) returning id",
      )
    ).rows[0]!.id;
    await t.db.query(
      "insert into hub_inventory (hub_id, product_id, qty) values ($1,$2,500)",
      [hubId, P_CHEAP],
    );
    const hubStock: HubStock[] = [{ hubId, qty: 500, lat: 37.5, lng: 127.1 }];
    const route = routeOrderLine(autoItem.qty, hubStock, {
      siteLat: 37.51,
      siteLng: 127.09,
      supplierLeadDays: 5,
    });
    expect(route.source).toBe("hub");
    expect(route.etaDays).toBe(0); // same-day
    const autoOrderId = (
      await t.db.query<{ order_id: string }>(
        "select order_id from purchase_orders where id=$1",
        [autoPoId],
      )
    ).rows[0]!.order_id;
    await t.db.query(
      "insert into fulfillment_routes (order_id, source_type, hub_id, eta, status) values ($1,$2,$3,$4,'dispatched')",
      [autoOrderId, route.source, route.hubId, etaDate(ORDER_DATE, route.etaDays)],
    );
    await t.db.query("update hub_inventory set qty=$1 where hub_id=$2 and product_id=$3", [
      deductHubStock(500, autoItem.qty),
      hubId,
      P_CHEAP,
    ]);
    const hubLeft = await t.db.query<{ qty: number }>(
      "select qty from hub_inventory where hub_id=$1 and product_id=$2",
      [hubId, P_CHEAP],
    );
    expect(Number(hubLeft.rows[0]?.qty)).toBe(450);

    // 8) KILL-SWITCH pauses autonomy (DB blocks new auto-PO) ----------
    await t.db.query("update agent_policies set enabled=false where contractor_id=$1", [A]);
    const blockedPo = await createPoFor(t, A, autoItem);
    const blockedDec = (
      await t.db.query<{ id: string }>(
        "insert into agent_decisions (contractor_id, action, status) values ($1,'reorder','auto_executed') returning id",
        [A],
      )
    ).rows[0]!.id;
    await expect(
      t.db.query(
        "insert into agent_actions (decision_id, po_id, reversible_until) values ($1,$2,$3)",
        [blockedDec, blockedPo, future()],
      ),
    ).rejects.toThrow(/kill-switch/);

    // 9) REVERSAL cancels a reversible auto-PO ------------------------
    await t.db.query("update purchase_orders set status='cancelled' where id=$1", [autoPoId]);
    await t.db.query("update agent_actions set reversed=true where po_id=$1", [autoPoId]);
    await t.db.query(
      "insert into agent_audit_log (contractor_id, decision_id, action, amount) values ($1,$2,'reversal',$3)",
      [A, autoDec, autoItem.amount],
    );
    const reversed = await t.db.query<{ status: string }>(
      "select status from purchase_orders where id=$1",
      [autoPoId],
    );
    expect(reversed.rows[0]?.status).toBe("cancelled");

    // audit trail accumulated (auto_po + reversal), immutable
    const audit = await t.db.query<{ n: number }>(
      "select count(*)::int n from agent_audit_log where contractor_id=$1",
      [A],
    );
    expect(Number(audit.rows[0]?.n)).toBe(2);
  });
});

async function createPoFor(t: TestDb, contractor: string, item: PlanItem): Promise<string> {
  const ord = await t.db.query<{ id: string }>(
    "insert into orders (contractor_id, payment_method, status, subtotal, total) values ($1,'escrow','pending',$2,$2) returning id",
    [contractor, item.amount],
  );
  const po = await t.db.query<{ id: string }>(
    "insert into purchase_orders (order_id, supplier_id, status, subtotal) values ($1,$2,'pending',$3) returning id",
    [ord.rows[0]!.id, item.supplierId, item.amount],
  );
  return po.rows[0]!.id;
}
