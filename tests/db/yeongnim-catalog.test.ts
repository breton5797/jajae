/**
 * 영림 e카탈로그 마이그레이션(0019) 검증.
 *  - 영림 브랜드 + 카테고리 적재
 *  - material_catalog_items 시드(인테리어 라인업 + 창호)
 *  - RLS: 인증 사용자 read-only, 쓰기 차단
 * PGlite 하네스(tests/db/harness.ts)는 모든 마이그레이션을 자동 적용.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./harness";

describe("영림 카탈로그 (migration 0019)", () => {
  let t: TestDb;
  let contractor: string;

  beforeAll(async () => {
    t = await createTestDb();
    contractor = await t.seedUser({ role: "contractor" });
  });
  afterAll(async () => {
    await t.close();
  });

  it("영림 브랜드 + 8개 카테고리 적재", async () => {
    await t.asService();
    const { rows } = await t.db.query<{ c: string }>(
      `select bc.category as c from material_brand_categories bc
       join material_brands b on b.id = bc.brand_id where b.name = '영림'`,
    );
    const cats = rows.map((r) => r.c);
    expect(cats).toEqual(
      expect.arrayContaining(["door", "kitchen", "furniture", "flooring", "window", "film"]),
    );
  });

  it("material_catalog_items 시드(100행 이상, 창호+인테리어)", async () => {
    await t.asService();
    const { rows: cnt } = await t.db.query<{ n: number }>(
      "select count(*)::int as n from material_catalog_items",
    );
    expect(cnt[0]!.n).toBeGreaterThanOrEqual(100);
    const { rows: win } = await t.db.query<{ n: number }>(
      "select count(*)::int as n from material_catalog_items where category = 'window'",
    );
    expect(win[0]!.n).toBeGreaterThan(0);
  });

  it("컬러 라인업: 루나 라이트스톤이 여러 카테고리에 매핑", async () => {
    await t.asService();
    const { rows } = await t.db.query<{ c: string; m: string }>(
      "select category as c, model_code as m from material_catalog_items where series = '루나 라이트스톤' order by c",
    );
    const cats = rows.map((r) => r.c);
    expect(cats).toEqual(expect.arrayContaining(["flooring", "kitchen", "film"]));
    expect(rows.find((r) => r.c === "flooring")!.m).toBe("YMQ(W)-304");
  });

  it("RLS: 인증 사용자 read-only / 쓰기 차단", async () => {
    await t.asUser(contractor);
    const { rows } = await t.db.query("select id from material_catalog_items limit 1");
    expect(rows.length).toBe(1);
    await expect(
      t.db.query(
        `insert into material_catalog_items (brand_id, category, series, model_code, source)
         values (gen_random_uuid(), 'door', 'x', 'y', 'z')`,
      ),
    ).rejects.toThrow(); // authenticated insert grant 없음
  });
});
