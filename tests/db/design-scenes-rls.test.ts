/**
 * design_scenes RLS 검증 (마이그레이션 0021).
 *
 * 정책(0016/0018 패턴 동일):
 *   - 소유자: owner_id = auth.uid() 본인 행만 접근
 *   - 관리자: public.is_admin() 전체 접근
 *   - anon: grant 없음(0003 default privileges 회수)
 * PGlite 하네스 사용 (tests/db/harness.ts).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./harness";

const SCENE_JSON =
  '{"id":"s","domain":"interior","objects":[],"ground":{"type":"floor","sizeM":10},"camera":{"position":[0,0,0],"target":[0,0,0]}}';

describe("design_scenes RLS (migration 0021)", () => {
  let t: TestDb;
  let A: string;
  let B: string;
  let admin: string;

  /** 지정 owner 소유 씬 삽입 → uuid 반환. */
  async function insertScene(owner: string): Promise<string> {
    const { rows } = await t.db.query<{ id: string }>(
      `insert into design_scenes (owner_id, domain, name, scene)
       values ($1, 'interior', '시안', $2::jsonb) returning id`,
      [owner, SCENE_JSON],
    );
    return rows[0]!.id;
  }

  beforeAll(async () => {
    t = await createTestDb();
    A = await t.seedUser({ role: "contractor", companyName: "A업체" });
    B = await t.seedUser({ role: "contractor", companyName: "B업체" });
    admin = await t.seedUser({ role: "admin", companyName: "관리자" });
  });

  afterAll(async () => {
    await t.close();
  });

  it("소유자만 자신의 씬 조회 (RLS 격리)", async () => {
    await t.asService();
    const id = await insertScene(A);

    await t.asUser(B);
    const { rows: other } = await t.db.query("select id from design_scenes where id = $1", [id]);
    expect(other.length).toBe(0);

    await t.asUser(A);
    const { rows: own } = await t.db.query("select id from design_scenes where id = $1", [id]);
    expect(own.length).toBe(1);
  });

  it("관리자는 전체 씬 조회 가능", async () => {
    await t.asService();
    const id = await insertScene(A);

    await t.asUser(admin);
    const { rows } = await t.db.query("select id from design_scenes where id = $1", [id]);
    expect(rows.length).toBe(1);
  });

  it("본인 소유로만 insert 가능 (다른 owner_id는 with check 위반)", async () => {
    await t.asUser(A);
    const ok = await t.db.query<{ id: string }>(
      `insert into design_scenes (owner_id, domain, name, scene)
       values ($1, 'interior', '내 씬', $2::jsonb) returning id`,
      [A, SCENE_JSON],
    );
    expect(ok.rows.length).toBe(1);

    await expect(
      t.db.query(
        `insert into design_scenes (owner_id, domain, name, scene)
         values ($1, 'interior', '남의 씬', $2::jsonb)`,
        [B, SCENE_JSON],
      ),
    ).rejects.toThrow();
  });

  it("소유자는 자신의 씬 삭제 가능, 타인은 불가", async () => {
    await t.asService();
    const id = await insertScene(A);

    await t.asUser(B);
    await t.db.query("delete from design_scenes where id = $1", [id]);
    await t.asService();
    const { rows: still } = await t.db.query("select id from design_scenes where id = $1", [id]);
    expect(still.length).toBe(1); // B 삭제 무효

    await t.asUser(A);
    await t.db.query("delete from design_scenes where id = $1", [id]);
    await t.asService();
    const { rows: gone } = await t.db.query("select id from design_scenes where id = $1", [id]);
    expect(gone.length).toBe(0);
  });
});
