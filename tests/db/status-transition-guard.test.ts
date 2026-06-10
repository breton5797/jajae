/**
 * spec §12 — status transition guard. `returns_update` / `as_update` RLS are
 * row-level (not column-level), so without a trigger a contractor/supplier could
 * `update returns set status='approved'` (or as_requests set status='scheduled')
 * and bypass the triage RPCs. Only an admin or the trusted service_role backend
 * (i.e., the SECURITY DEFINER triage RPCs) may change `status`; non-status fields
 * (reason/qty/issue) stay self-editable. Mirrors prevent_profile_privilege_escalation.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./harness";

describe("status transition guard (spec §12)", () => {
  let t: TestDb;

  async function seedReturn(contractor: string): Promise<string> {
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
      "insert into returns (order_item_id, contractor_id, reason, qty, status) values ($1,$2,'불량',1,'requested') returning id",
      [oi, contractor],
    )).rows[0]!.id;
  }

  async function seedAsRequest(contractor: string): Promise<string> {
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
      "insert into as_requests (order_item_id, contractor_id, issue, status) values ($1,$2,'불량','requested') returning id",
      [oi, contractor],
    )).rows[0]!.id;
  }

  beforeAll(async () => {
    t = await createTestDb();
  });
  afterAll(async () => {
    await t.close();
  });

  it("시공사는 returns.status를 직접 승인으로 못 바꾼다", async () => {
    const a = await t.seedUser({ role: "contractor" });
    const ret = await seedReturn(a);
    await t.asUser(a);
    await expect(
      t.db.query("update returns set status='approved' where id=$1", [ret]),
    ).rejects.toThrow(/status can only be changed by an admin/);
    await t.asService();
    expect((await t.db.query("select status from returns where id=$1", [ret])).rows[0]).toEqual({ status: "requested" });
  });

  it("시공사는 as_requests.status를 직접 예약으로 못 바꾼다", async () => {
    const a = await t.seedUser({ role: "contractor" });
    const as = await seedAsRequest(a);
    await t.asUser(a);
    await expect(
      t.db.query("update as_requests set status='scheduled' where id=$1", [as]),
    ).rejects.toThrow(/status can only be changed by an admin/);
  });

  it("공급사도 as_requests.status를 직접 못 바꾼다 (§12 공급사 벡터)", async () => {
    const a = await t.seedUser({ role: "contractor" });
    const supOwner = await t.seedUser({ role: "supplier" });
    const as = await seedAsRequest(a);
    await t.asService();
    const supId = (await t.db.query<{ id: string }>("select id from suppliers limit 1")).rows[0]!.id;
    await t.linkSupplier(supId, supOwner);
    await t.asUser(supOwner);
    await expect(
      t.db.query("update as_requests set status='scheduled' where id=$1", [as]),
    ).rejects.toThrow(/status can only be changed by an admin/);
  });

  it("시공사는 비-status 필드(reason)는 편집 가능", async () => {
    const a = await t.seedUser({ role: "contractor" });
    const ret = await seedReturn(a);
    await t.asUser(a);
    await t.db.query("update returns set reason='수정된 사유' where id=$1", [ret]);
    await t.asService();
    expect((await t.db.query("select reason from returns where id=$1", [ret])).rows[0]).toEqual({ reason: "수정된 사유" });
  });

  it("관리자는 status를 직접 바꿀 수 있다", async () => {
    const a = await t.seedUser({ role: "contractor" });
    const admin = await t.seedUser({ role: "admin" });
    const ret = await seedReturn(a);
    await t.asUser(admin);
    await t.db.query("update returns set status='approved' where id=$1", [ret]);
    await t.asService();
    expect((await t.db.query("select status from returns where id=$1", [ret])).rows[0]).toEqual({ status: "approved" });
  });

  it("회귀: 트리아지 RPC(관리자)는 가드 하에서도 정상 전이", async () => {
    const a = await t.seedUser({ role: "contractor" });
    const admin = await t.seedUser({ role: "admin" });
    await t.asService();
    await t.db.query("update triage_policies set enabled=true, auto_approve_cap=1000000, min_confidence=0.8 where singleton=true");
    const ret = await seedReturn(a);
    await t.asUser(admin);
    const d = (await t.db.query<{ d: string }>(
      "select triage_auto_resolve_return($1,'approve','supplier',0.9,'불량') as d",
      [ret],
    )).rows[0]!.d;
    expect(d).toBe("approve");
    await t.asService();
    expect((await t.db.query("select status from returns where id=$1", [ret])).rows[0]).toEqual({ status: "approved" });
  });
});
