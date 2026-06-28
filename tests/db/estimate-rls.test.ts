/**
 * interior_estimates RLS 검증.
 * 마이그레이션 0016 정책:
 *   - 시공사: 본인 행만 SELECT/INSERT/UPDATE/DELETE
 *   - 관리자: 전체 접근
 *   - anon/revoked: grant 없음 + RLS 차단
 * PGlite 하네스 동일 사용 (tests/db/harness.ts).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./harness";

/** 최소 유효 JSONB 픽스처 */
const BRIEF = JSON.stringify({
  projectType: "apartment_remodel",
  specLevel: "standard",
  rooms: [{ name: "거실", type: "living", widthM: 5, lengthM: 4 }],
});
const FLOOR_PLAN = JSON.stringify({
  rooms: [{ name: "거실", type: "living", x: 0, y: 0, w: 5, h: 4 }],
  widthM: 5,
  lengthM: 4,
});
const BOM = JSON.stringify({ lines: [], estTotal: 0, source: "fallback" });

describe("interior_estimates RLS (migration 0016)", () => {
  let t: TestDb;
  let contractorA: string;
  let contractorB: string;
  let admin: string;

  /** 지정 contractorId 소유 견적서 삽입 → 생성된 uuid 반환 */
  async function insertEstimate(contractorId: string): Promise<string> {
    const res = await t.db.query<{ id: string }>(
      `insert into interior_estimates
         (contractor_id, transcript, brief, floor_plan, bom, total_krw)
       values ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, 0)
       returning id`,
      [contractorId, "테스트 전사문", BRIEF, FLOOR_PLAN, BOM],
    );
    return res.rows[0]!.id;
  }

  beforeAll(async () => {
    t = await createTestDb();
    contractorA = await t.seedUser({ role: "contractor", companyName: "A업체" });
    contractorB = await t.seedUser({ role: "contractor", companyName: "B업체" });
    admin = await t.seedUser({ role: "admin", companyName: "관리자" });
  });

  afterAll(async () => {
    await t.close();
  });

  it("시공사 A: 본인 소유 견적서 삽입 성공", async () => {
    await t.asUser(contractorA);
    const id = await insertEstimate(contractorA);
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("시공사 A: 본인 견적서 SELECT 가능", async () => {
    await t.asService();
    const estId = await insertEstimate(contractorA);

    await t.asUser(contractorA);
    const { rows } = await t.db.query<{ id: string }>(
      "select id from interior_estimates where id = $1",
      [estId],
    );
    expect(rows.length).toBe(1);
    expect(rows[0]!.id).toBe(estId);
  });

  it("시공사 B: 시공사 A의 견적서 조회 불가 (RLS 격리)", async () => {
    await t.asService();
    const estId = await insertEstimate(contractorA);

    await t.asUser(contractorB);
    const { rows } = await t.db.query(
      "select * from interior_estimates where id = $1",
      [estId],
    );
    expect(rows.length).toBe(0);
  });

  it("시공사 B: contractor_id=A 로 INSERT → WITH CHECK 위반으로 차단", async () => {
    await t.asUser(contractorB);
    await expect(insertEstimate(contractorA)).rejects.toThrow();
  });

  it("관리자: 시공사 A·B 견적서 모두 SELECT 가능", async () => {
    await t.asService();
    const estA = await insertEstimate(contractorA);
    const estB = await insertEstimate(contractorB);

    await t.asUser(admin);
    const { rows: rowsA } = await t.db.query<{ id: string }>(
      "select id from interior_estimates where id = $1",
      [estA],
    );
    const { rows: rowsB } = await t.db.query<{ id: string }>(
      "select id from interior_estimates where id = $1",
      [estB],
    );
    expect(rowsA.length).toBe(1);
    expect(rowsB.length).toBe(1);
  });

  it("인증 없음 (auth.uid() = null): SELECT → 0건", async () => {
    // authenticated 롤 + 빈 sub → auth.uid() = null → RLS 차단
    // (anon 롤은 0016에서 revoke all 되어 권한 오류; null-uid 인증 사용자로 동일 격리 검증)
    await t.asService();
    const estId = await insertEstimate(contractorA);

    await t.asUser("", "authenticated");
    const { rows } = await t.db.query(
      "select * from interior_estimates where id = $1",
      [estId],
    );
    expect(rows.length).toBe(0);
  });
});
