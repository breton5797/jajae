/**
 * Phase 8-1 — 반품 자동 트리아지 (plpgsql, 원자적). 분류기는 제안만, DB가 정책을
 * 재검증해 결정한다. 자동은 '상한 내 명백 승인'만, 그 외 escalate. fail-closed.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./harness";

describe("Phase 8 return triage", () => {
  let t: TestDb;
  let admin: string;

  async function seedReturn(opts: {
    contractor: string;
    qty: number;
    unit: number;
    status?: string;
    reason?: string;
  }): Promise<string> {
    await t.asService();
    const prod = (await t.db.query<{ id: string }>("select id from products limit 1")).rows[0]!.id;
    const sup = (await t.db.query<{ id: string }>("select id from suppliers limit 1")).rows[0]!.id;
    const total = opts.unit * opts.qty;
    const order = (await t.db.query<{ id: string }>(
      "insert into orders (contractor_id, payment_method, status, subtotal, total) values ($1,'escrow','pending',$2,$2) returning id",
      [opts.contractor, total],
    )).rows[0]!.id;
    const po = (await t.db.query<{ id: string }>(
      "insert into purchase_orders (order_id, supplier_id, status, subtotal) values ($1,$2,'pending',$3) returning id",
      [order, sup, total],
    )).rows[0]!.id;
    const oi = (await t.db.query<{ id: string }>(
      "insert into order_items (po_id, product_id, name_snapshot, unit_price_snapshot, qty, line_total) values ($1,$2,'타일',$3,$4,$5) returning id",
      [po, prod, opts.unit, opts.qty, total],
    )).rows[0]!.id;
    const ret = (await t.db.query<{ id: string }>(
      "insert into returns (order_item_id, contractor_id, reason, qty, status) values ($1,$2,$3,$4,$5) returning id",
      [oi, opts.contractor, opts.reason ?? "불량", opts.qty, opts.status ?? "requested"],
    )).rows[0]!.id;
    return ret;
  }

  async function setPolicy(opts: { enabled?: boolean; cap?: number; minConf?: number }) {
    await t.asService();
    await t.db.query(
      "update triage_policies set enabled=$1, auto_approve_cap=$2, min_confidence=$3 where singleton=true",
      [opts.enabled ?? true, opts.cap ?? 1_000_000, opts.minConf ?? 0.8],
    );
  }

  async function autoResolve(ret: string, decision: string, conf: number) {
    return t.db.query<{ d: string }>(
      "select triage_auto_resolve_return($1,$2,$3,$4,$5) as d",
      [ret, decision, "supplier", conf, "테스트 사유"],
    );
  }

  beforeAll(async () => {
    t = await createTestDb();
    admin = await t.seedUser({ role: "admin", companyName: "운영" });
  });
  afterAll(async () => {
    await t.close();
  });

  it("정책 시드가 정확히 1행 존재(기본 비활성)", async () => {
    await t.asService();
    const r = await t.db.query<{ n: number; enabled: boolean }>(
      "select count(*)::int n, bool_or(enabled) enabled from triage_policies",
    );
    expect(r.rows[0]!.n).toBe(1);
    expect(r.rows[0]!.enabled).toBe(false);
  });

  it("triage_policies는 관리자만 접근(시공사 차단)", async () => {
    const c = await t.seedUser({ role: "contractor" });
    await t.asUser(c);
    const r = await t.db.query("select * from triage_policies");
    expect(r.rows.length).toBe(0); // RLS로 비관리자는 0행
    await t.asUser(admin);
    const r2 = await t.db.query("select * from triage_policies");
    expect(r2.rows.length).toBe(1);
  });

  it("시공사는 본인 반품 트리아지 결과만 조회", async () => {
    const a = await t.seedUser({ role: "contractor" });
    const b = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: true, cap: 1_000_000 });
    const ret = await seedReturn({ contractor: a, qty: 1, unit: 5_000_000 }); // 상한 초과 → escalate 로그 생성
    await t.asUser(admin);
    await autoResolve(ret, "approve", 0.9);
    await t.asUser(b);
    expect((await t.db.query("select * from triage_decisions where return_id=$1", [ret])).rows.length).toBe(0);
    await t.asUser(a);
    expect((await t.db.query("select * from triage_decisions where return_id=$1", [ret])).rows.length).toBe(1);
  });

  it("triage_decisions는 append-only(update/delete 차단)", async () => {
    const a = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: true, cap: 10_000_000 });
    const ret = await seedReturn({ contractor: a, qty: 1, unit: 100_000 });
    await t.asUser(admin);
    await autoResolve(ret, "approve", 0.9);
    await t.asService();
    const id = (await t.db.query<{ id: string }>("select id from triage_decisions where return_id=$1", [ret])).rows[0]!.id;
    await expect(t.db.query("update triage_decisions set rationale='x' where id=$1", [id])).rejects.toThrow();
    await expect(t.db.query("delete from triage_decisions where id=$1", [id])).rejects.toThrow();
  });

  it("auto: 상한 이하 명백 승인 → approved + auto 로그(원자)", async () => {
    const a = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: true, cap: 1_000_000, minConf: 0.8 });
    const ret = await seedReturn({ contractor: a, qty: 2, unit: 400_000 }); // 환불 800,000 ≤ 1,000,000
    await t.asUser(admin);
    const d = (await autoResolve(ret, "approve", 0.9)).rows[0]!.d;
    expect(d).toBe("approve");
    await t.asService();
    expect((await t.db.query("select status from returns where id=$1", [ret])).rows[0]).toEqual({ status: "approved" });
    expect((await t.db.query("select 1 from triage_decisions where return_id=$1 and source='auto' and decision='approve' and refund_amount=800000", [ret])).rows.length).toBe(1);
  });

  it("auto: 상한 초과 → escalate(status 유지) + escalate 로그", async () => {
    const a = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: true, cap: 1_000_000, minConf: 0.8 });
    const ret = await seedReturn({ contractor: a, qty: 3, unit: 400_000 }); // 환불 1,200,000 > 1,000,000
    await t.asUser(admin);
    const d = (await autoResolve(ret, "approve", 0.95)).rows[0]!.d;
    expect(d).toBe("escalate");
    await t.asService();
    expect((await t.db.query("select status from returns where id=$1", [ret])).rows[0]).toEqual({ status: "requested" });
    expect((await t.db.query("select 1 from triage_decisions where return_id=$1 and decision='escalate'", [ret])).rows.length).toBe(1);
  });

  it("auto: 저신뢰 → escalate", async () => {
    const a = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: true, cap: 10_000_000, minConf: 0.8 });
    const ret = await seedReturn({ contractor: a, qty: 1, unit: 100_000 });
    await t.asUser(admin);
    expect((await autoResolve(ret, "approve", 0.5)).rows[0]!.d).toBe("escalate");
  });

  it("auto: 킬스위치 → escalate", async () => {
    const a = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: false, cap: 10_000_000 });
    const ret = await seedReturn({ contractor: a, qty: 1, unit: 100_000 });
    await t.asUser(admin);
    expect((await autoResolve(ret, "approve", 0.99)).rows[0]!.d).toBe("escalate");
  });

  it("auto: 이미 트리아지된 건 재호출 raise(idempotency)", async () => {
    const a = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: true, cap: 10_000_000 });
    const ret = await seedReturn({ contractor: a, qty: 1, unit: 100_000 });
    await t.asUser(admin);
    await autoResolve(ret, "approve", 0.9);
    await expect(autoResolve(ret, "approve", 0.9)).rejects.toThrow(/already triaged/);
  });

  it("auto: requested 아닌 건 raise(not actionable)", async () => {
    const a = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: true, cap: 10_000_000 });
    const ret = await seedReturn({ contractor: a, qty: 1, unit: 100_000, status: "approved" });
    await t.asUser(admin);
    await expect(autoResolve(ret, "approve", 0.9)).rejects.toThrow(/not actionable/);
  });

  it("auto: 비관리자/비서비스 호출 unauthorized", async () => {
    const a = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: true, cap: 10_000_000 });
    const ret = await seedReturn({ contractor: a, qty: 1, unit: 100_000 });
    await t.asUser(a);
    await expect(autoResolve(ret, "approve", 0.9)).rejects.toThrow(/unauthorized/i);
  });

  it("auto: 정책 행 없으면 fail-closed raise", async () => {
    const a = await t.seedUser({ role: "contractor" });
    await t.asService();
    // triage_decisions는 append-only이므로 직접 삭제 불가; 새 return으로 결정 없는 상태 확보
    await t.db.query("delete from triage_policies");
    const ret = await seedReturn({ contractor: a, qty: 1, unit: 100_000 });
    await t.asUser(admin);
    await expect(autoResolve(ret, "approve", 0.9)).rejects.toThrow(/not configured/);
    // 복구(후속 테스트용 정책 시드 재삽입)
    await t.asService();
    await t.db.query("insert into triage_policies (singleton, auto_approve_cap, min_confidence, enabled) values (true,0,0.8,false)");
  });

  it("admin: 수동 승인은 상한을 오버라이드하되 기록", async () => {
    const a = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: true, cap: 1_000_000 });
    const ret = await seedReturn({ contractor: a, qty: 10, unit: 1_000_000 }); // 환불 10,000,000 ≫ 상한
    await t.asUser(admin);
    await autoResolve(ret, "approve", 0.99); // escalate(상한 초과)
    await t.db.query("select triage_admin_resolve_return($1,$2)", [ret, "approve"]);
    await t.asService();
    expect((await t.db.query("select status from returns where id=$1", [ret])).rows[0]).toEqual({ status: "approved" });
    expect((await t.db.query("select 1 from triage_decisions where return_id=$1 and source='admin' and decision='approve'", [ret])).rows.length).toBe(1);
  });

  it("admin: 비관리자 호출 unauthorized", async () => {
    const a = await t.seedUser({ role: "contractor" });
    const ret = await seedReturn({ contractor: a, qty: 1, unit: 100_000 });
    await t.asUser(a);
    await expect(t.db.query("select triage_admin_resolve_return($1,$2)", [ret, "reject"])).rejects.toThrow(/unauthorized/i);
  });

  it("reverse: 승인 되돌리면 requested 원복 + 상쇄 로그, 재가역 raise", async () => {
    const a = await t.seedUser({ role: "contractor" });
    await setPolicy({ enabled: true, cap: 10_000_000 });
    const ret = await seedReturn({ contractor: a, qty: 1, unit: 500_000 });
    await t.asUser(admin);
    await autoResolve(ret, "approve", 0.9); // approved
    await t.db.query("select triage_reverse_resolution($1)", [ret]);
    await t.asService();
    expect((await t.db.query("select status from returns where id=$1", [ret])).rows[0]).toEqual({ status: "requested" });
    expect((await t.db.query("select 1 from triage_decisions where return_id=$1 and source='reversal'", [ret])).rows.length).toBe(1);
    await t.asUser(admin);
    await expect(t.db.query("select triage_reverse_resolution($1)", [ret])).rejects.toThrow(/no active resolution/);
  });

  it("reverse: completed 건은 raise", async () => {
    const a = await t.seedUser({ role: "contractor" });
    const ret = await seedReturn({ contractor: a, qty: 1, unit: 100_000, status: "completed" });
    await t.asUser(admin);
    await expect(t.db.query("select triage_reverse_resolution($1)", [ret])).rejects.toThrow(/already completed/);
  });
});
