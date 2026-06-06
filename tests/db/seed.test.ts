/**
 * DoD #4 — seed covers ≥8 interior + ≥5 structural categories (top-level),
 * with products across categories. Asserted against the real supabase/seed.sql.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./harness";

describe("seed coverage", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
    await t.asService();
  });
  afterAll(async () => {
    await t.close();
  });

  it("has ≥8 top-level interior categories", async () => {
    const r = await t.db.query<{ n: number }>(
      "select count(*)::int n from categories where kind='interior' and parent_id is null",
    );
    expect(Number(r.rows[0]?.n)).toBeGreaterThanOrEqual(8);
  });

  it("has ≥5 top-level structural categories", async () => {
    const r = await t.db.query<{ n: number }>(
      "select count(*)::int n from categories where kind='structural' and parent_id is null",
    );
    expect(Number(r.rows[0]?.n)).toBeGreaterThanOrEqual(5);
  });

  it("has approved products spread across many categories", async () => {
    const r = await t.db.query<{ n: number }>(
      "select count(distinct category_id)::int n from products where status='approved'",
    );
    expect(Number(r.rows[0]?.n)).toBeGreaterThanOrEqual(13);
  });

  it("every BOM category slug resolves to an approved, in-stock product", async () => {
    const slugs = [
      "flooring",
      "wallpaper",
      "paint",
      "tile",
      "sanitaryware",
      "lighting",
      "gypsum-board",
      "insulation",
      "waterproofing",
      "cement",
      "rebar",
      "lumber",
      "hardware",
      "kitchen",
    ];
    const r = await t.db.query<{ slug: string; n: number }>(
      `select c.slug, count(p.id)::int n
         from categories c
         left join products p
           on p.category_id = c.id and p.status='approved' and p.stock > 0
        where c.slug = any($1)
        group by c.slug`,
      [slugs],
    );
    const bySlug = new Map(r.rows.map((row) => [row.slug, Number(row.n)]));
    for (const slug of slugs) {
      expect(bySlug.get(slug) ?? 0).toBeGreaterThan(0);
    }
  });
});
