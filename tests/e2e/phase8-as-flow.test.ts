/**
 * Phase 8-2 E2E — AS 접수 → 자동 트리아지(공급사귀책 자동예약 / 시공사귀책 에스컬레이션)
 * → 관리자 수동 → 가역. 순수 분류기 + plpgsql RPC 통합. 서버 규칙 ≡ DB 결정.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "../db/harness";
import { classifyAsRequestFallback, decideAsTriage } from "@/lib/triage/as";
import type { AsTriagePolicy } from "@/lib/types";

describe("Phase 8-2 E2E: AS triage", () => {
  let t: TestDb;
  let admin: string;

  async function policy(): Promise<AsTriagePolicy> {
    await t.asService();
    return (await t.db.query<AsTriagePolicy>("select * from as_triage_policies where singleton=true")).rows[0]!;
  }
  async function seedAs(contractor: string, issue: string): Promise<string> {
    await t.asService();
    const prod = (await t.db.query<{ id: string }>("select id from products limit 1")).rows[0]!.id;
    const sup = (await t.db.query<{ id: string }>("select id from suppliers limit 1")).rows[0]!.id;
    const order = (await t.db.query<{ id: string }>(
      "insert into orders (contractor_id, payment_method, status, subtotal, total) values ($1,'escrow','pending',100000,100000) returning id",
      [contractor],
    )).rows[0]!.id;
    const po = (await t.db.query<{ id: string }>(
      "insert into purchase_orders (order_id, supplier_id, status, subtotal) values ($1,$2,'pending',100000) returning id",
      [order, sup],
    )).rows[0]!.id;
    const oi = (await t.db.query<{ id: string }>(
      "insert into order_items (po_id, product_id, name_snapshot, unit_price_snapshot, qty, line_total) values ($1,$2,'타일',100000,1,100000) returning id",
      [po, prod],
    )).rows[0]!.id;
    return (await t.db.query<{ id: string }>(
      "insert into as_requests (order_item_id, contractor_id, issue, status) values ($1,$2,$3,'requested') returning id",
      [oi, contractor, issue],
    )).rows[0]!.id;
  }
  async function runAuto(as: string, issue: string) {
    const p = await policy();
    const cls = classifyAsRequestFallback(issue);
    const evald = decideAsTriage(cls, p);
    const proposed = evald.outcome === "auto_schedule" ? "schedule" : "escalate";
    await t.asUser(admin);
    const out = (await t.db.query<{ d: string }>(
      "select as_triage_auto_resolve($1,$2,$3,$4,$5) as d",
      [as, proposed, cls.responsibility, cls.confidence, cls.rationale],
    )).rows[0]!.d;
    expect(out).toBe(evald.outcome === "auto_schedule" ? "schedule" : "escalate");
    return out;
  }

  beforeAll(async () => {
    t = await createTestDb();
    admin = await t.seedUser({ role: "admin" });
    await t.asService();
    await t.db.query("update as_triage_policies set enabled=true, min_confidence=0.7 where singleton=true");
  });
  afterAll(async () => {
    await t.close();
  });

  it("명백한 결함(공급사 귀책) → 자동 예약", async () => {
    const a = await t.seedUser({ role: "contractor" });
    const as = await seedAs(a, "제품 누수 하자");
    expect(await runAuto(as, "제품 누수 하자")).toBe("schedule");
    await t.asService();
    expect((await t.db.query("select status from as_requests where id=$1", [as])).rows[0]).toEqual({ status: "scheduled" });
  });

  it("신호 없는 사유 → 에스컬레이션 → 관리자 수동 예약 → 가역", async () => {
    const a = await t.seedUser({ role: "contractor" });
    const as = await seedAs(a, "문의드립니다");
    expect(await runAuto(as, "문의드립니다")).toBe("escalate");
    await t.asService();
    expect((await t.db.query("select status from as_requests where id=$1", [as])).rows[0]).toEqual({ status: "requested" });

    await t.asUser(admin);
    await t.db.query("select as_triage_admin_resolve($1,'schedule')", [as]);
    await t.asService();
    expect((await t.db.query("select status from as_requests where id=$1", [as])).rows[0]).toEqual({ status: "scheduled" });

    await t.asUser(admin);
    await t.db.query("select as_triage_reverse($1)", [as]);
    await t.asService();
    expect((await t.db.query("select status from as_requests where id=$1", [as])).rows[0]).toEqual({ status: "requested" });
  });
});
