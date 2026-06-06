import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./harness";

describe("db harness smoke", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
  });
  afterAll(async () => {
    await t.close();
  });

  it("loads schema + seed", async () => {
    await t.asService();
    const cats = await t.db.query<{ n: number }>(
      "select count(*)::int as n from categories",
    );
    const prods = await t.db.query<{ n: number }>(
      "select count(*)::int as n from products",
    );
    expect(Number(cats.rows[0]?.n)).toBeGreaterThan(0);
    expect(Number(prods.rows[0]?.n)).toBeGreaterThan(0);
  });
});
