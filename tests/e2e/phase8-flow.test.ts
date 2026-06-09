/**
 * Phase 8-1 E2E — 반품 접수 → 자동 트리아지(상한 내 자동승인 / 초과 에스컬레이션)
 * → 관리자 수동 결정(오버라이드) → 가역. 순수 분류기 + plpgsql RPC 통합.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "../db/harness";
import { classifyReturnFallback, decideTriage, computeRefundAmount } from "@/lib/triage";
import type { TriagePolicy } from "@/lib/types";

describe("Phase 8 E2E: return triage", () => {
  let t: TestDb;
  let admin: string;

  async function policy(): Promise<TriagePolicy> {
    await t.asService();
    const r = await t.db.query<TriagePolicy>("select * from triage_policies where singleton=true");
    return r.rows[0]!;
  }
  async function seedReturn(contractor: string, qty: number, unit: number, reason: string): Promise<string> {
    await t.asService();
    const prod = (await t.db.query<{ id: string }>("select id from products limit 1")).rows[0]!.id;
    const sup = (await t.db.query<{ id: string }>("select id from suppliers limit 1")).rows[0]!.id;
    const total = unit * qty;
    const order = (await t.db.query<{ id: string }>(
      "insert into orders (contractor_id, payment_method, status, subtotal, total) values ($1,'escrow','pending',$2,$2) returning id",
      [contractor, total],
    )).rows[0]!.id;
    const po = (await t.db.query<{ id: string }>(
      "insert into purchase_orders (order_id, supplier_id, status, subtotal) values ($1,$2,'pending',$3) returning id",
      [order, sup, total],
    )).rows[0]!.id;
    const oi = (await t.db.query<{ id: string }>(
      "insert into order_items (po_id, product_id, name_snapshot, unit_price_snapshot, qty, line_total) values ($1,$2,'타일',$3,$4,$5) returning id",
      [po, prod, unit, qty, total],
    )).rows[0]!.id;
    return (await t.db.query<{ id: string }>(
      "insert into returns (order_item_id, contractor_id, reason, qty, status) values ($1,$2,$3,$4,'requested') returning id",
      [oi, contractor, reason, qty],
    )).rows[0]!.id;
  }
  async function runAuto(ret: string, reason: string, refund: number) {
    const p = await policy();
    const cls = classifyReturnFallback(reason, refund);
    const evald = decideTriage(cls, refund, p);
    const proposed = evald.outcome === "auto_approve" ? "approve" : "escalate";
    await t.asUser(admin);
    const out = (await t.db.query<{ d: string }>(
      "select triage_auto_resolve_return($1,$2,$3,$4,$5) as d",
      [ret, proposed, cls.responsibility, cls.confidence, cls.rationale],
    )).rows[0]!.d;
    // 서버 규칙과 DB 결정 일치(일관성)
    expect(out).toBe(evald.outcome === "auto_approve" ? "approve" : "escalate");
    return out;
  }

  beforeAll(async () => {
    t = await createTestDb();
    admin = await t.seedUser({ role: "admin" });
    await t.asService();
    await t.db.query("update triage_policies set enabled=true, auto_approve_cap=2000000, min_confidence=0.7 where singleton=true");
  });
  afterAll(async () => {
    await t.close();
  });

  it("상한 내 명백 하자 → 자동 승인", async () => {
    const a = await t.seedUser({ role: "contractor" });
    const refund = computeRefundAmount(2, 500_000); // 1,000,000 ≤ 2,000,000
    const ret = await seedReturn(a, 2, 500_000, "타일 불량");
    expect(await runAuto(ret, "타일 불량", refund)).toBe("approve");
    await t.asService();
    expect((await t.db.query("select status from returns where id=$1", [ret])).rows[0]).toEqual({ status: "approved" });
  });

  it("상한 초과 → 에스컬레이션 → 관리자 수동 승인(오버라이드) → 가역", async () => {
    const a = await t.seedUser({ role: "contractor" });
    const refund = computeRefundAmount(10, 500_000); // 5,000,000 > 2,000,000
    const ret = await seedReturn(a, 10, 500_000, "타일 불량");
    expect(await runAuto(ret, "타일 불량", refund)).toBe("escalate");
    await t.asService();
    expect((await t.db.query("select status from returns where id=$1", [ret])).rows[0]).toEqual({ status: "requested" });

    await t.asUser(admin);
    await t.db.query("select triage_admin_resolve_return($1,'approve')", [ret]);
    await t.asService();
    expect((await t.db.query("select status from returns where id=$1", [ret])).rows[0]).toEqual({ status: "approved" });

    await t.asUser(admin);
    await t.db.query("select triage_reverse_resolution($1)", [ret]);
    await t.asService();
    expect((await t.db.query("select status from returns where id=$1", [ret])).rows[0]).toEqual({ status: "requested" });
  });

  it("단순 변심(신호 없음) → 에스컬레이션", async () => {
    const a = await t.seedUser({ role: "contractor" });
    const refund = computeRefundAmount(1, 100_000);
    const ret = await seedReturn(a, 1, 100_000, "그냥 변심");
    expect(await runAuto(ret, "그냥 변심", refund)).toBe("escalate");
    await t.asService();
    expect((await t.db.query("select status from returns where id=$1", [ret])).rows[0]).toEqual({ status: "requested" });
  });
});
