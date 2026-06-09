/**
 * Phase 8-2 — AS 자동 트리아지 (plpgsql, 원자적). 분류기는 제안, DB가 정책 재검증해 결정.
 * 자동은 '공급사/배송 귀책 × 고신뢰'의 자동 예약뿐, 그 외 escalate. fail-closed.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./harness";

describe("Phase 8-2 AS triage", () => {
  let t: TestDb;
  let admin: string;

  async function seedAsRequest(opts: {
    contractor: string;
    issue?: string;
    status?: string;
  }): Promise<string> {
    await t.asService();
    const prod = (await t.db.query<{ id: string }>("select id from products limit 1")).rows[0]!.id;
    const sup = (await t.db.query<{ id: string }>("select id from suppliers limit 1")).rows[0]!.id;
    const order = (await t.db.query<{ id: string }>(
      "insert into orders (contractor_id, payment_method, status, subtotal, total) values ($1,'escrow','pending',100000,100000) returning id",
      [opts.contractor],
    )).rows[0]!.id;
    const po = (await t.db.query<{ id: string }>(
      "insert into purchase_orders (order_id, supplier_id, status, subtotal) values ($1,$2,'pending',100000) returning id",
      [order, sup],
    )).rows[0]!.id;
    const oi = (await t.db.query<{ id: string }>(
      "insert into order_items (po_id, product_id, name_snapshot, unit_price_snapshot, qty, line_total) values ($1,$2,'타일',100000,1,100000) returning id",
      [po, prod],
    )).rows[0]!.id;
    const as = (await t.db.query<{ id: string }>(
      "insert into as_requests (order_item_id, contractor_id, issue, status) values ($1,$2,$3,$4) returning id",
      [oi, opts.contractor, opts.issue ?? "불량", opts.status ?? "requested"],
    )).rows[0]!.id;
    return as;
  }

  async function setPolicy(opts: { enabled?: boolean; minConf?: number }) {
    await t.asService();
    await t.db.query(
      "update as_triage_policies set enabled=$1, min_confidence=$2 where singleton=true",
      [opts.enabled ?? true, opts.minConf ?? 0.8],
    );
  }

  async function autoResolve(asId: string, decision: string, resp: string, conf: number) {
    return t.db.query<{ d: string }>(
      "select as_triage_auto_resolve($1,$2,$3,$4,$5) as d",
      [asId, decision, resp, conf, "테스트 사유"],
    );
  }

  beforeAll(async () => {
    t = await createTestDb();
    admin = await t.seedUser({ role: "admin", companyName: "운영" });
  });
  afterAll(async () => {
    await t.close();
  });

  it("정책 시드가 정확히 1행(기본 비활성)", async () => {
    await t.asService();
    const r = await t.db.query<{ n: number; enabled: boolean }>(
      "select count(*)::int n, bool_or(enabled) enabled from as_triage_policies",
    );
    expect(r.rows[0]!.n).toBe(1);
    expect(r.rows[0]!.enabled).toBe(false);
  });

  it("as_triage_policies는 관리자만 접근", async () => {
    const c = await t.seedUser({ role: "contractor" });
    await t.asUser(c);
    expect((await t.db.query("select * from as_triage_policies")).rows.length).toBe(0);
    await t.asUser(admin);
    expect((await t.db.query("select * from as_triage_policies")).rows.length).toBe(1);
  });

  it("시공사는 본인 AS 트리아지 결과만 조회", async () => {
    const a = await t.seedUser({ role: "contractor" });
    const b = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: true });
    const as = await seedAsRequest({ contractor: a, issue: "불량" });
    await t.asUser(admin);
    await autoResolve(as, "schedule", "contractor", 0.9); // 시공사귀책 → escalate 로그 생성
    await t.asUser(b);
    expect((await t.db.query("select * from as_triage_decisions where as_request_id=$1", [as])).rows.length).toBe(0);
    await t.asUser(a);
    expect((await t.db.query("select * from as_triage_decisions where as_request_id=$1", [as])).rows.length).toBe(1);
  });

  it("as_triage_decisions는 append-only(update/delete 차단)", async () => {
    const a = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: true });
    const as = await seedAsRequest({ contractor: a });
    await t.asUser(admin);
    await autoResolve(as, "schedule", "supplier", 0.9);
    await t.asService();
    const id = (await t.db.query<{ id: string }>("select id from as_triage_decisions where as_request_id=$1", [as])).rows[0]!.id;
    await expect(t.db.query("update as_triage_decisions set rationale='x' where id=$1", [id])).rejects.toThrow();
    await expect(t.db.query("delete from as_triage_decisions where id=$1", [id])).rejects.toThrow();
  });
});
