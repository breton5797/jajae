/**
 * PGlite-based Postgres test harness. Runs the REAL migrations + seed.sql in an
 * in-process Postgres (WASM), with a minimal Supabase `auth` shim so RLS policies
 * that call auth.uid() work unchanged. Lets tests impersonate users via SET ROLE
 * + JWT-claim GUC — the same mechanism PostgREST uses in production.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqlExecutor } from "@/lib/orders";

const ROOT = process.cwd();
const MIGRATIONS = [
  "supabase/migrations/0001_schema.sql",
  "supabase/migrations/0002_rls.sql",
  "supabase/migrations/0003_grants.sql",
];
const SEED = "supabase/seed.sql";

const AUTH_SHIM = `
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid
  language sql stable as $fn$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $fn$;
create or replace function auth.role() returns text
  language sql stable as $fn$
    select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
  $fn$;
do $do$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit;
  end if;
end
$do$;
`;

export interface TestDb {
  db: PGlite;
  executor: SqlExecutor;
  /** Impersonate a user (default role: authenticated). */
  asUser(uid: string, role?: string): Promise<void>;
  /** Reset to the bootstrap superuser (bypasses RLS) for setup/teardown. */
  asService(): Promise<void>;
  /** Create an auth.users row + profile; returns the user id. */
  seedUser(opts: SeedUserOpts): Promise<string>;
  /** Link a supplier row to an owner profile. */
  linkSupplier(supplierId: string, ownerId: string): Promise<void>;
  close(): Promise<void>;
}

export interface SeedUserOpts {
  id?: string;
  role: "contractor" | "supplier" | "admin";
  companyName?: string;
  bizNo?: string | null;
  bizStatus?: "pending" | "verified" | "rejected";
  creditLimit?: number;
  email?: string;
}

function uuid(): string {
  return globalThis.crypto.randomUUID();
}

export async function createTestDb(): Promise<TestDb> {
  const db = new PGlite();
  await db.exec(AUTH_SHIM);
  for (const file of MIGRATIONS) {
    await db.exec(readFileSync(join(ROOT, file), "utf8"));
  }
  await db.exec(readFileSync(join(ROOT, SEED), "utf8"));

  const executor: SqlExecutor = {
    query: async <T = Record<string, unknown>>(
      sql: string,
      params?: unknown[],
    ) => {
      const res = await db.query<T>(sql, params as unknown[]);
      return { rows: res.rows as T[] };
    },
  };

  const asService = async () => {
    await db.exec("reset role;");
  };

  const asUser = async (uid: string, role = "authenticated") => {
    await db.exec("reset role;");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
      uid,
    ]);
    await db.query("select set_config('request.jwt.claim.role', $1, false)", [
      role,
    ]);
    await db.exec(`set role ${role};`);
  };

  const seedUser = async (opts: SeedUserOpts): Promise<string> => {
    await asService();
    const id = opts.id ?? uuid();
    await db.query("insert into auth.users (id, email) values ($1,$2)", [
      id,
      opts.email ?? `${id}@example.com`,
    ]);
    await db.query(
      `insert into profiles
         (id, role, company_name, biz_no, biz_status, credit_limit)
       values ($1,$2,$3,$4,$5,$6)`,
      [
        id,
        opts.role,
        opts.companyName ?? "테스트업체",
        opts.bizNo ?? null,
        opts.bizStatus ?? "pending",
        opts.creditLimit ?? 0,
      ],
    );
    return id;
  };

  const linkSupplier = async (supplierId: string, ownerId: string) => {
    await asService();
    await db.query("update suppliers set owner_id = $1 where id = $2", [
      ownerId,
      supplierId,
    ]);
  };

  const close = async () => {
    await db.close();
  };

  return { db, executor, asUser, asService, seedUser, linkSupplier, close };
}
