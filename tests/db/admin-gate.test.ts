/**
 * Admin privilege integrity (security gate hardening).
 *
 * The admin pages/loaders trust profiles.role (via getAuthedUser → requireAdmin)
 * to decide who may read service-role / cross-tenant data. That trust is only
 * sound if a non-admin cannot make themselves an admin. profiles_update RLS
 * allows a user to update their OWN row (id = auth.uid()), and RLS is row-level
 * (not column-level), so without a guard a contractor could
 * `update profiles set role='admin'` and defeat every admin gate.
 *
 * These tests lock: (1) non-admins cannot escalate role/credit_limit, (2) admins
 * still can, (3) the biz-verify self-update flow (biz_no/biz_status) still works,
 * (4) the RLS foundation requireAdmin relies on (self-read of role; no cross-read).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./harness";

describe("profiles privilege-escalation guard", () => {
  let t: TestDb;
  let contractor: string;
  let admin: string;

  beforeAll(async () => {
    t = await createTestDb();
    contractor = await t.seedUser({ role: "contractor", companyName: "시공" });
    admin = await t.seedUser({ role: "admin", companyName: "관리자" });
  });
  afterAll(async () => {
    await t.close();
  });

  it("a contractor CANNOT escalate their own role to admin", async () => {
    await t.asUser(contractor);
    await expect(
      t.db.query("update profiles set role='admin' where id=$1", [contractor]),
    ).rejects.toThrow(/admin/i);
    await t.asService();
    expect(
      (await t.db.query<{ role: string }>("select role from profiles where id=$1", [contractor])).rows[0],
    ).toEqual({ role: "contractor" });
  });

  it("a contractor CANNOT raise their own credit_limit", async () => {
    await t.asUser(contractor);
    await expect(
      t.db.query("update profiles set credit_limit=99999999 where id=$1", [contractor]),
    ).rejects.toThrow(/credit_limit/i);
  });

  it("a contractor can INCREASE own credit_used (checkout) but NOT decrease it", async () => {
    await t.asUser(admin); // admin grants a credit line (admins may set credit_limit)
    await t.db.query("update profiles set credit_limit=10000000 where id=$1", [contractor]);
    await t.asUser(contractor);
    // checkout-style consumption (increase) is allowed
    await expect(
      t.db.query("update profiles set credit_used=3000000 where id=$1", [contractor]),
    ).resolves.toBeTruthy();
    // self-decrease (freeing credit to bypass the limit) is blocked
    await expect(
      t.db.query("update profiles set credit_used=0 where id=$1", [contractor]),
    ).rejects.toThrow(/credit_used/i);
    await t.asUser(admin); // admin/finance may reduce it (credit repayment)
    await t.db.query("update profiles set credit_used=0, credit_limit=0 where id=$1", [contractor]);
  });

  it("an admin CAN change role/credit_limit (admin path still works)", async () => {
    await t.asUser(admin);
    await t.db.query("update profiles set role='supplier', credit_limit=5000000 where id=$1", [contractor]);
    await t.asService();
    expect(
      (await t.db.query<{ role: string; credit_limit: string }>(
        "select role, credit_limit from profiles where id=$1",
        [contractor],
      )).rows[0],
    ).toEqual({ role: "supplier", credit_limit: "5000000" });
    // restore for later tests
    await t.db.query("update profiles set role='contractor', credit_limit=0 where id=$1", [contractor]);
  });

  it("the biz-verify self-update (biz_no/biz_status) is still allowed", async () => {
    await t.asUser(contractor);
    await expect(
      t.db.query(
        "update profiles set biz_no='123-45-67890', biz_status='verified' where id=$1",
        [contractor],
      ),
    ).resolves.toBeTruthy();
  });

  it("RLS foundation: a user self-reads their role but cannot read another's profile", async () => {
    await t.asUser(contractor);
    const self = await t.db.query<{ role: string }>("select role from profiles where id=$1", [contractor]);
    expect(self.rows[0]).toEqual({ role: "contractor" });
    const other = await t.db.query("select role from profiles where id=$1", [admin]);
    expect(other.rows.length).toBe(0); // RLS hides other users' profiles
  });
});
