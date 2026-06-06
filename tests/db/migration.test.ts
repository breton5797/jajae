/**
 * The Phase-2 migration (0004) is additive and preserves existing data.
 * Simulate a pre-Phase-2 DB (0001–0003 + existing rows), then apply 0004 and
 * assert the pre-existing rows survive AND the new columns/tables exist.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AUTH_SHIM } from "./harness";

const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

const MARKER_SUPPLIER = "99999999-0000-0000-0000-000000000001";
const MARKER_CATEGORY = "99999999-0000-0000-0000-0000000000c1";
const MARKER_PRODUCT = "99999999-0000-0000-0000-0000000000d1";

describe("migration 0004 preserves data", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(AUTH_SHIM);
    await db.exec(read("supabase/migrations/0001_schema.sql"));
    await db.exec(read("supabase/migrations/0002_rls.sql"));
    await db.exec(read("supabase/migrations/0003_grants.sql"));

    // Pre-existing data (as superuser, before Phase 2).
    await db.query(
      "insert into suppliers (id, name, biz_no, status) values ($1,$2,$3,'verified')",
      [MARKER_SUPPLIER, "기존공급사", "111-11-11111"],
    );
    await db.query(
      "insert into categories (id, kind, name, slug) values ($1,'interior','기존','legacy-cat')",
      [MARKER_CATEGORY],
    );
    await db.query(
      `insert into products (id, supplier_id, category_id, name, unit, unit_price, status)
       values ($1,$2,$3,'기존상품','ea',12345,'approved')`,
      [MARKER_PRODUCT, MARKER_SUPPLIER, MARKER_CATEGORY],
    );

    // Apply Phase 2.
    await db.exec(read("supabase/migrations/0004_ops_intelligence.sql"));
  });

  afterAll(async () => {
    await db.close();
  });

  it("keeps pre-existing rows after 0004", async () => {
    const p = await db.query<{ name: string; unit_price: number }>(
      "select name, unit_price from products where id=$1",
      [MARKER_PRODUCT],
    );
    expect(p.rows[0]?.name).toBe("기존상품");
    expect(Number(p.rows[0]?.unit_price)).toBe(12345);
  });

  it("adds new sites columns (budget/start_date/end_date)", async () => {
    const cols = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_name='sites' and column_name = any($1)`,
      [["budget", "start_date", "end_date"]],
    );
    expect(cols.rows.map((r) => r.column_name).sort()).toEqual([
      "budget",
      "end_date",
      "start_date",
    ]);
  });

  it("creates the new Phase-2 tables", async () => {
    for (const table of [
      "drawings",
      "site_documents",
      "site_tasks",
      "price_history",
    ]) {
      const r = await db.query<{ n: number }>(
        `select count(*)::int n from information_schema.tables where table_name=$1`,
        [table],
      );
      expect(Number(r.rows[0]?.n)).toBe(1);
    }
  });
});
