/**
 * proposals RLS + 공유 RPC 검증 (마이그레이션 0018).
 *
 * 정책(0016 패턴 동일):
 *   - 시공사: contractor_id = auth.uid() 본인 행만 접근
 *   - 관리자: public.is_admin() 전체 접근
 *   - anon: grant 없음
 * 공개 공유는 SECURITY DEFINER RPC(get_shared_proposal)로만 노출되며
 * status='shared' + 만료 전 + 비밀번호 일치인 안전 컬럼만 반환한다.
 *
 * 비밀번호 해시: 운영(Supabase)은 pgcrypto bcrypt, pgcrypto가 없는 PGlite
 * 테스트 환경은 코어 md5(token||password)로 폴백한다(0018 주석 참조). 본 테스트는
 * 해시 방식에 의존하지 않도록 공유 설정을 항상 set_proposal_share RPC로 수행해
 * 두 환경에서 동일하게 통과한다. PGlite 하네스 사용 (tests/db/harness.ts).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./harness";

describe("proposals RLS + share RPC (migration 0018)", () => {
  let t: TestDb;
  let A: string;
  let B: string;

  /** 지정 contractorId 소유 견적서(0016) 삽입 → uuid 반환. */
  async function insertEstimate(owner: string): Promise<string> {
    const { rows } = await t.db.query<{ id: string }>(
      `insert into interior_estimates (contractor_id, brief, floor_plan, bom)
       values ($1, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb) returning id`,
      [owner],
    );
    return rows[0]!.id;
  }

  /** 지정 contractorId 소유 제안 삽입 → uuid 반환. */
  async function insertProposal(owner: string, estId: string): Promise<string> {
    const { rows } = await t.db.query<{ id: string }>(
      `insert into proposals (estimate_id, contractor_id, template_id, finishes, total_krw)
       values ($1, $2, 'apt-20s-3room-2bath', '[]'::jsonb, 1000) returning id`,
      [estId, owner],
    );
    return rows[0]!.id;
  }

  beforeAll(async () => {
    t = await createTestDb();
    A = await t.seedUser({ role: "contractor", companyName: "A업체" });
    B = await t.seedUser({ role: "contractor", companyName: "B업체" });
  });

  afterAll(async () => {
    await t.close();
  });

  it("소유자만 자신의 제안 조회 (RLS 격리)", async () => {
    await t.asService();
    const est = await insertEstimate(A);
    const pid = await insertProposal(A, est);

    await t.asUser(B);
    const { rows: other } = await t.db.query("select id from proposals where id = $1", [pid]);
    expect(other.length).toBe(0);

    await t.asUser(A);
    const { rows: own } = await t.db.query("select id from proposals where id = $1", [pid]);
    expect(own.length).toBe(1);
  });

  it("get_shared_proposal: shared+비번 일치+만료전 → 반환, 오답/만료 → null", async () => {
    await t.asService();
    const est = await insertEstimate(A);
    const pid = await insertProposal(A, est);
    await t.db.query(
      "select set_proposal_share($1, $2, 'tok123', '1234', now() + interval '7 days')",
      [pid, A],
    );

    const ok = await t.db.query<{ v: unknown }>(
      "select get_shared_proposal('tok123', '1234') as v",
    );
    expect(ok.rows[0]!.v).not.toBeNull();

    const bad = await t.db.query<{ v: unknown }>(
      "select get_shared_proposal('tok123', '9999') as v",
    );
    expect(bad.rows[0]!.v).toBeNull();

    await t.db.query(
      "update proposals set share_expires_at = now() - interval '1 day' where id = $1",
      [pid],
    );
    const expired = await t.db.query<{ v: unknown }>(
      "select get_shared_proposal('tok123', '1234') as v",
    );
    expect(expired.rows[0]!.v).toBeNull();
  });

  it("set_proposal_share: 소유자만 공유 설정, 설정 후 동일 비번 조회 가능", async () => {
    await t.asService();
    const est = await insertEstimate(A);
    const pid = await insertProposal(A, est);

    // 비소유자(B)를 owner로 넘기면 where contractor_id = p_owner 불일치 → 공유 안 됨.
    await t.db.query(
      "select set_proposal_share($1, $2, 'tok-guard', 'pass', now() + interval '7 days')",
      [pid, B],
    );
    const notShared = await t.db.query<{ v: unknown }>(
      "select get_shared_proposal('tok-guard', 'pass') as v",
    );
    expect(notShared.rows[0]!.v).toBeNull();

    // 소유자(A) → status='shared' + 동일 비번으로 조회 성공.
    await t.db.query(
      "select set_proposal_share($1, $2, 'tok-ok', 'pass', now() + interval '7 days')",
      [pid, A],
    );
    const { rows: st } = await t.db.query<{ status: string }>(
      "select status from proposals where id = $1",
      [pid],
    );
    expect(st[0]!.status).toBe("shared");

    const shared = await t.db.query<{ v: unknown }>(
      "select get_shared_proposal('tok-ok', 'pass') as v",
    );
    expect(shared.rows[0]!.v).not.toBeNull();
  });
});
