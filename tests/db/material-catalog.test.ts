import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./harness";

const PANEL_CATEGORIES = [
  "flooring","wallpaper","paint","tile","window","door",
  "kitchen","sanitaryware","lighting","furniture","molding",
];

describe("material catalog (migration 0017)", () => {
  let t: TestDb;
  let contractor: string;
  beforeAll(async () => {
    t = await createTestDb();
    contractor = await t.seedUser({ role: "contractor" });
  });
  afterAll(async () => { await t.close(); });

  it("브랜드 시드 적재 (대기업 종합 5개 포함)", async () => {
    await t.asService();
    const { rows } = await t.db.query<{ n: string }>("select name as n from material_brands");
    const names = rows.map((r) => r.n);
    for (const b of ["LX하우시스","KCC","현대L&C","한솔홈데코","동화기업","한샘","구정마루"]) {
      expect(names).toContain(b);
    }
  });

  it("LX하우시스 다중 카테고리(종합)", async () => {
    await t.asService();
    const { rows } = await t.db.query<{ c: string }>(
      `select bc.category as c from material_brand_categories bc
       join material_brands b on b.id = bc.brand_id where b.name = 'LX하우시스'`,
    );
    const cats = rows.map((r) => r.c);
    expect(cats).toContain("flooring");
    expect(cats).toContain("wallpaper");
    expect(cats.length).toBeGreaterThanOrEqual(3);
  });

  it("패널 카테고리마다 3티어 finish_materials 존재", async () => {
    await t.asService();
    for (const cat of PANEL_CATEGORIES) {
      const { rows } = await t.db.query<{ tier: string }>(
        "select distinct tier from finish_materials where category = $1", [cat],
      );
      const tiers = rows.map((r) => r.tier);
      expect(tiers, `category ${cat}`).toEqual(
        expect.arrayContaining(["economy","standard","premium"]),
      );
    }
  });

  it("인증 사용자 read-only / anon 차단", async () => {
    await t.asUser(contractor);
    const { rows } = await t.db.query("select id from finish_materials limit 1");
    expect(rows.length).toBe(1);
    await expect(
      t.db.query("insert into finish_materials (category,tier,brand_id,label,unit_price) values ('flooring','economy',gen_random_uuid(),'x',0)"),
    ).rejects.toThrow(); // authenticated 에 insert grant 없음
  });
});
