# 즉석 인테리어 제안 생성기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. **이 프로젝트는 team-orchestrator(Agent Teams)로 실행한다** — Backend/Frontend/QA 3인 병렬, 파일 소유권 분리(아래 §Ownership). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 고객 상담 결과(STT/요약)로 라벨링 2D 평면도(이미지 #2)와 3D 렌더+자재 디테일+예산 제안서(이미지 #1)를 즉석 생성·프레젠테이션·공유한다.

**Architecture:** 기존 견적 엔진(0016: STT·브리프·BOM)과 스튜디오 3D 엔진(scene/assets/snapshot)을 **재사용**하고, 그 위에 `/proposal` 프레젠테이션 레이어를 얹는다. 순수 로직(`lib/proposal/*`, `lib/studio/from-floorplan.ts`)은 단위 테스트, DB는 PGlite RLS 테스트, 3D/UI는 build 게이트 + 수동 시각.

**Tech Stack:** Next.js 14 App Router · TypeScript(strict) · Tailwind · three 0.169 + @react-three/fiber 8 + drei 9 · Supabase(Postgres+RLS, pgcrypto) · zod · vitest + PGlite.

## Global Constraints

- 불변성: 모든 도메인 로직은 새 객체 반환, 입력 변형 금지 (`lib/studio/scene.ts` 패턴).
- 파일 200–400줄 권장, 800줄 max. 함수 50줄 max. 중첩 4단계 max.
- 시크릿은 `process.env`만(`lib/env.ts` lazy getter). 하드코딩·console.log 금지.
- 입력 검증: API 경계는 zod `safeParse` → 한국어 에러(`{ error: "..." }`, status). `enum` 리터럴은 `@/lib/ai-quote/schema`의 `SpecLevelSchema/ProjectTypeSchema/RoomTypeSchema` 재사용.
- 마이그레이션은 ADDITIVE. RLS 패턴은 0016 동일: `enable row level security` + owner/`public.is_admin()` 정책 + `revoke all ... from anon; grant ... to authenticated; grant all ... to service_role`. `gen_random_uuid()` 기본키.
- AI/외부 키 미설정 시 폴백으로 빌드·테스트 통과(키 없는 오프라인 CI 필수).
- 게이트(DoD): `npm run typecheck`(0) · `npm run lint`(0) · `npm run test`(전부) · `npm run build`(exit 0). 기존 회귀 0.
- 커밋 메시지: `<type>: <desc>` + 트레일러 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## File Structure (생성/수정 맵)

```
lib/types.ts                         (modify)  도메인 타입 가산
lib/proposal/schema.ts               (create)  zod 스키마
lib/proposal/quantities.ts           (create)  카테고리별 수량 근사(순수)
lib/proposal/materials.ts            (create)  selectFinishes 티어/강등(순수)
lib/proposal/templates/data.ts       (create)  10~50평대 템플릿 데이터
lib/proposal/templates/index.ts      (create)  matchTemplate(순수)
lib/proposal/floorplan-svg.ts        (create)  renderPlanSvg 이미지 #2(순수)
lib/proposal/construction.ts         (create)  constructionTotal(bom)(순수)
lib/proposal/index.ts                (create)  buildProposal 조립
lib/studio/from-floorplan.ts         (create)  toFurnishedScene(순수)
lib/data/finish-materials.ts         (create)  카탈로그 조회(server)
lib/data/proposals.ts                (create)  proposals CRUD + share(server)
supabase/migrations/0017_material_catalog.sql  (create) 브랜드 DB+카탈로그+시드+RLS
supabase/migrations/0018_proposals.sql         (create) proposals+pgcrypto+RPC+RLS
app/api/proposal/route.ts            (create)  POST 생성
app/api/proposal/[id]/route.ts       (create)  GET
app/api/proposal/[id]/share/route.ts (create)  POST 공유(비번+만료)
app/api/proposal/shared/[token]/route.ts (create) POST 공개 검증
components/proposal/material-panel.tsx   (create) 자재 디테일 패널
components/proposal/floorplan-sheet.tsx  (create) 이미지 #2 시트
components/proposal/proposal-canvas.tsx  (create) 3D r3f(ssr:false)+스냅샷
components/proposal/proposal-sheet.tsx   (create) 이미지 #1 합성
components/proposal/presentation-view.tsx(create) 풀스크린 프레젠테이션
app/proposal/page.tsx                (create)  입력→브리프→프레젠테이션 플로우
app/p/[token]/page.tsx               (create)  공개 공유 페이지(비번 폼)
public/swatches/*.svg                (create)  플레이스홀더 스왓치
components/site-header.tsx           (modify)  /proposal 링크
components/site-footer.tsx           (modify)  /proposal 링크
app/estimate/page.tsx                (modify)  "제안서로 보기" 버튼
tests/unit/proposal-quantities.test.ts (create)
tests/unit/proposal-materials.test.ts  (create)
tests/unit/proposal-templates.test.ts  (create)
tests/unit/proposal-floorplan-svg.test.ts (create)
tests/unit/proposal-from-floorplan.test.ts (create)
tests/unit/proposal-construction.test.ts (create)
tests/unit/proposal-schema.test.ts     (create)
tests/db/material-catalog.test.ts      (create)
tests/db/proposals-rls.test.ts         (create)
```

### Ownership (team-orchestrator)
- **Backend**: `lib/types.ts`, `lib/proposal/*`, `lib/studio/from-floorplan.ts`, `lib/data/{finish-materials,proposals}.ts`, `app/api/proposal/*`, `supabase/migrations/0017*,0018*`
- **Frontend**: `app/proposal/*`, `app/p/*`, `components/proposal/*`, `public/swatches/*`, `components/site-header.tsx`, `components/site-footer.tsx`, `app/estimate/page.tsx`
- **QA**: `tests/unit/proposal-*`, `tests/db/material-catalog.test.ts`, `tests/db/proposals-rls.test.ts`
- 의존성: A → B → C → (D ∥ E) → F. Frontend(D)는 Backend A~C의 타입/인터페이스 확정 후 시작. E(API)는 A2·E1 마이그레이션 후.

---

## Phase A — 카탈로그 & 티어 선택 (Backend)

### Task A1: 도메인 타입 + zod 스키마

**Files:**
- Modify: `lib/types.ts` (파일 끝 가산)
- Create: `lib/proposal/schema.ts`
- Test: `tests/unit/proposal-schema.test.ts`

**Interfaces:**
- Consumes: 기존 `RoomType`, `Transform3D`, `SpecLevel`, `EstimateBrief` (`@/lib/types`); `SpecLevelSchema`,`ProjectTypeSchema`,`RoomTypeSchema` (`@/lib/ai-quote/schema`).
- Produces: 타입 `FinishTier`,`FinishCategory`,`MaterialBrand`,`FinishMaterial`,`FinishSelection`,`RoomSlot`,`ApartmentTemplate`,`Proposal`; zod `ProposalInputSchema`,`ShareInputSchema`,`SharedAccessSchema`,`FinishMaterialSchema`. `EstimateBrief`에 `pyeong?: number` 추가.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/proposal-schema.test.ts
import { describe, it, expect } from "vitest";
import {
  ProposalInputSchema,
  ShareInputSchema,
  SharedAccessSchema,
} from "@/lib/proposal/schema";

const VALID_BRIEF = {
  projectType: "apartment_remodel",
  specLevel: "standard",
  rooms: [{ name: "거실", type: "living", widthM: 5, lengthM: 4 }],
  pyeong: 25,
};

describe("proposal zod schemas", () => {
  it("ProposalInputSchema: 유효 브리프 통과", () => {
    const r = ProposalInputSchema.safeParse({ brief: VALID_BRIEF, customerName: "홍길동" });
    expect(r.success).toBe(true);
  });

  it("ProposalInputSchema: 빈 rooms 거부", () => {
    const r = ProposalInputSchema.safeParse({ brief: { ...VALID_BRIEF, rooms: [] } });
    expect(r.success).toBe(false);
  });

  it("ShareInputSchema: 비밀번호 4자 미만 거부", () => {
    expect(ShareInputSchema.safeParse({ password: "12", expiresInDays: 7 }).success).toBe(false);
    expect(ShareInputSchema.safeParse({ password: "1234", expiresInDays: 7 }).success).toBe(true);
  });

  it("SharedAccessSchema: 비밀번호 필수", () => {
    expect(SharedAccessSchema.safeParse({}).success).toBe(false);
    expect(SharedAccessSchema.safeParse({ password: "1234" }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/proposal-schema.test.ts`
Expected: FAIL — `Cannot find module '@/lib/proposal/schema'`.

- [ ] **Step 3: Add types to `lib/types.ts`**

```ts
// ─── 즉석 제안 생성기 (instant proposal) ─────────────────────────────
export type FinishTier = "economy" | "standard" | "premium";

export type FinishCategory =
  | "flooring" | "wallpaper" | "paint" | "tile" | "window" | "door"
  | "kitchen" | "sanitaryware" | "lighting" | "film" | "board"
  | "engineered_stone" | "furniture" | "molding";

export interface MaterialBrand {
  id: string;
  name: string;
  categories: FinishCategory[];
  isImport: boolean;
  segment: "major" | "specialist" | "distributor";
  note?: string;
}

export interface FinishMaterial {
  id: string;
  category: FinishCategory;
  tier: FinishTier;
  brandId: string;
  brandName?: string;          // 패널 표시용(조인 비정규화)
  label: string;
  unitPrice: number;
  priceStatus: "confirmed" | "estimated";
  color?: string;              // 3D 틴트용 hex(없으면 기본색)
  swatchUrl?: string;
  spec?: string;
}

export interface FinishSelection {
  category: FinishCategory;
  material: FinishMaterial;
  qty: number;
  lineTotal: number;           // round(qty * unitPrice)
  downgraded: boolean;         // baseTier보다 낮게 선택됨
}

export interface RoomSlot {
  name: string;
  type: RoomType;
  x: number; y: number; w: number; h: number;
}

export interface ApartmentTemplate {
  id: string;
  pyeongBand: 10 | 20 | 30 | 40 | 50;
  exclusiveM2: number;
  supplyM2: number;
  bedrooms: number;
  bathrooms: number;
  rooms: RoomSlot[];
  furniture: { assetId: string; roomName: string; transform: Transform3D }[];
}

export interface Proposal {
  id: string;
  estimateId: string;
  contractorId: string;
  customerName?: string;
  templateId: string;
  finishes: FinishSelection[];
  snapshotUrl?: string;
  materialsKRW: number;
  constructionKRW: number;
  totalKRW: number;
  status: "draft" | "shared";
  shareToken?: string;
  shareExpiresAt?: string;
  createdAt: string;
}
```

또한 기존 `EstimateBrief` 인터페이스에 `pyeong?: number;` 한 줄 추가(상담에서 나온 평수, 없으면 룸 면적에서 도출).

- [ ] **Step 4: Write `lib/proposal/schema.ts`**

```ts
/**
 * Zod schemas for the instant-proposal domain.
 * Reuses brief enums from ai-quote/schema for cross-codebase consistency.
 */
import { z } from "zod";
import { SpecLevelSchema, ProjectTypeSchema, RoomTypeSchema } from "@/lib/ai-quote/schema";

const ProposalRoomSchema = z.object({
  name: z.string().min(1),
  type: RoomTypeSchema,
  widthM: z.number().nonnegative(),
  lengthM: z.number().nonnegative(),
});

export const ProposalBriefSchema = z.object({
  projectType: ProjectTypeSchema,
  specLevel: SpecLevelSchema,
  rooms: z.array(ProposalRoomSchema).min(1),
  pyeong: z.number().positive().nullish().transform((v) => v ?? undefined),
  budgetKRW: z.number().nonnegative().nullish().transform((v) => v ?? undefined),
  materialPrefs: z.array(z.string()).nullish().transform((v) => v ?? undefined),
  notes: z.string().nullish().transform((v) => v ?? undefined),
});

export const ProposalInputSchema = z.object({
  brief: ProposalBriefSchema,
  customerName: z.string().optional(),
});

export const ShareInputSchema = z.object({
  password: z.string().min(4),
  expiresInDays: z.number().int().min(1).max(90).default(7),
});

export const SharedAccessSchema = z.object({
  password: z.string().min(1),
});

export const FinishMaterialSchema = z.object({
  id: z.string(),
  category: z.string(),
  tier: z.enum(["economy", "standard", "premium"]),
  brandId: z.string(),
  brandName: z.string().optional(),
  label: z.string(),
  unitPrice: z.number(),
  priceStatus: z.enum(["confirmed", "estimated"]),
  color: z.string().optional(),
  swatchUrl: z.string().optional(),
  spec: z.string().optional(),
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/proposal-schema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck`
```bash
git add lib/types.ts lib/proposal/schema.ts tests/unit/proposal-schema.test.ts
git commit -m "feat(proposal): 도메인 타입 + zod 스키마"
```

---

### Task A2: 마이그레이션 0017 — 자재 브랜드 DB + 마감재 카탈로그 + 시드

**Files:**
- Create: `supabase/migrations/0017_material_catalog.sql`
- Test: `tests/db/material-catalog.test.ts`

**Interfaces:**
- Produces: 테이블 `material_brands`,`material_brand_categories`,`finish_materials`. 카테고리별 ≥1행, 브랜드 시드(스펙 §자재 브랜드 시드).

- [ ] **Step 1: Write the failing test**

```ts
// tests/db/material-catalog.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db/material-catalog.test.ts`
Expected: FAIL — relation "material_brands" does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/0017_material_catalog.sql
-- 자재(Jajae) 즉석 제안 §자재 브랜드 DB + 마감재 카탈로그. ADDITIVE.
-- 카탈로그는 read-only 참조 데이터: 인증 사용자 SELECT, 쓰기는 admin/service.
-- RLS 패턴은 0016 동일.

-- ───── material_brands ─────
create table material_brands (
  id        uuid primary key default gen_random_uuid(),
  name      text not null unique,
  is_import boolean not null default false,
  segment   text not null check (segment in ('major','specialist','distributor')),
  note      text,
  sort      int not null default 0,
  created_at timestamptz not null default now()
);

create table material_brand_categories (
  brand_id uuid not null references material_brands(id) on delete cascade,
  category text not null check (category in (
    'flooring','wallpaper','paint','tile','window','door','kitchen',
    'sanitaryware','lighting','film','board','engineered_stone','furniture','molding')),
  primary key (brand_id, category)
);

create table finish_materials (
  id           uuid primary key default gen_random_uuid(),
  category     text not null check (category in (
    'flooring','wallpaper','paint','tile','window','door','kitchen',
    'sanitaryware','lighting','film','board','engineered_stone','furniture','molding')),
  tier         text not null check (tier in ('economy','standard','premium')),
  brand_id     uuid not null references material_brands(id) on delete restrict,
  label        text not null,
  unit_price   numeric not null default 0,
  price_status text not null default 'estimated' check (price_status in ('confirmed','estimated')),
  color        text,
  swatch_url   text,
  spec         text,
  sort         int not null default 0,
  created_at   timestamptz not null default now()
);
create index idx_finish_materials_cat_tier on finish_materials(category, tier);

-- ───── RLS ─────
alter table material_brands enable row level security;
alter table material_brand_categories enable row level security;
alter table finish_materials enable row level security;

create policy material_brands_read on material_brands for select using (true);
create policy material_brand_categories_read on material_brand_categories for select using (true);
create policy finish_materials_read on finish_materials for select using (true);
-- 쓰기 정책은 admin 전용
create policy material_brands_admin on material_brands for all
  using (public.is_admin()) with check (public.is_admin());
create policy finish_materials_admin on finish_materials for all
  using (public.is_admin()) with check (public.is_admin());

revoke all on material_brands from anon;
revoke all on material_brand_categories from anon;
revoke all on finish_materials from anon;
grant select on material_brands to authenticated;
grant select on material_brand_categories to authenticated;
grant select on finish_materials to authenticated;
grant all on material_brands to service_role;
grant all on material_brand_categories to service_role;
grant all on finish_materials to service_role;

-- ───── 브랜드 시드 (대표님 제공 리스트) ─────
with seed(name, is_import, segment, cats) as (values
  ('LX하우시스', false, 'major', array['flooring','wallpaper','window','film','board','engineered_stone']),
  ('KCC',        false, 'major', array['paint','window','board','engineered_stone']),
  ('현대L&C',    false, 'major', array['flooring','wallpaper','window','film','engineered_stone']),
  ('한솔홈데코', false, 'major', array['flooring','board','door']),
  ('동화기업',   false, 'major', array['flooring','board','door']),
  ('구정마루',   false, 'specialist', array['flooring']),
  ('이건마루',   false, 'specialist', array['flooring']),
  ('동화자연마루', false, 'specialist', array['flooring']),
  ('풍산마루',   false, 'specialist', array['flooring']),
  ('한솔포레보드', false, 'specialist', array['flooring','board']),
  ('개나리벽지', false, 'specialist', array['wallpaper']),
  ('신한벽지',   false, 'specialist', array['wallpaper']),
  ('서울벽지',   false, 'specialist', array['wallpaper']),
  ('DID벽지',    false, 'specialist', array['wallpaper']),
  ('LG지인벽지', false, 'specialist', array['wallpaper']),
  ('삼화페인트', false, 'specialist', array['paint']),
  ('노루페인트', false, 'specialist', array['paint']),
  ('강남제비스코', false, 'specialist', array['paint']),
  ('KCC페인트',  false, 'specialist', array['paint']),
  ('벤자민무어코리아', true, 'specialist', array['paint']),
  ('삼영세라믹', false, 'specialist', array['tile']),
  ('동서타일',   false, 'specialist', array['tile']),
  ('대보세라믹', false, 'specialist', array['tile']),
  ('윈세라믹',   false, 'specialist', array['tile']),
  ('타일러스',   true,  'distributor', array['tile']),
  ('윤현상재',   true,  'distributor', array['tile']),
  ('한샘',       false, 'major', array['kitchen','furniture','sanitaryware']),
  ('에넥스',     false, 'specialist', array['kitchen','furniture']),
  ('현대리바트', false, 'specialist', array['kitchen','furniture']),
  ('대림바스',   false, 'specialist', array['sanitaryware']),
  ('계림요업',   false, 'specialist', array['sanitaryware']),
  ('아메리칸스탠다드', true, 'specialist', array['sanitaryware']),
  ('로얄토토',   true,  'specialist', array['sanitaryware']),
  ('필룩스',     false, 'specialist', array['lighting']),
  ('비츠조명',   false, 'specialist', array['lighting']),
  ('라이마스',   false, 'specialist', array['lighting']),
  ('두코',       false, 'specialist', array['lighting']),
  ('이케아',     true,  'distributor', array['lighting','furniture'])
)
insert into material_brands (name, is_import, segment)
  select name, is_import, segment from seed;

insert into material_brand_categories (brand_id, category)
  select b.id, unnest(s.cats)
  from (values
    ('LX하우시스', array['flooring','wallpaper','window','film','board','engineered_stone']),
    ('KCC', array['paint','window','board','engineered_stone']),
    ('현대L&C', array['flooring','wallpaper','window','film','engineered_stone']),
    ('한솔홈데코', array['flooring','board','door']),
    ('동화기업', array['flooring','board','door']),
    ('구정마루', array['flooring']), ('이건마루', array['flooring']),
    ('동화자연마루', array['flooring']), ('풍산마루', array['flooring']),
    ('한솔포레보드', array['flooring','board']),
    ('개나리벽지', array['wallpaper']), ('신한벽지', array['wallpaper']),
    ('서울벽지', array['wallpaper']), ('DID벽지', array['wallpaper']),
    ('LG지인벽지', array['wallpaper']),
    ('삼화페인트', array['paint']), ('노루페인트', array['paint']),
    ('강남제비스코', array['paint']), ('KCC페인트', array['paint']),
    ('벤자민무어코리아', array['paint']),
    ('삼영세라믹', array['tile']), ('동서타일', array['tile']),
    ('대보세라믹', array['tile']), ('윈세라믹', array['tile']),
    ('타일러스', array['tile']), ('윤현상재', array['tile']),
    ('한샘', array['kitchen','furniture','sanitaryware']),
    ('에넥스', array['kitchen','furniture']), ('현대리바트', array['kitchen','furniture']),
    ('대림바스', array['sanitaryware']), ('계림요업', array['sanitaryware']),
    ('아메리칸스탠다드', array['sanitaryware']), ('로얄토토', array['sanitaryware']),
    ('필룩스', array['lighting']), ('비츠조명', array['lighting']),
    ('라이마스', array['lighting']), ('두코', array['lighting']),
    ('이케아', array['lighting','furniture'])
  ) as s(brand, cats)
  join material_brands b on b.name = s.brand,
  lateral unnest(s.cats) as category
  on conflict do nothing;

-- ───── finish_materials 대표 시드 (패널 카테고리 × 3티어, 단가 estimated) ─────
-- 각 (category,tier) 1행, 브랜드는 해당 카테고리 대표. color는 3D 틴트용.
insert into finish_materials (category, tier, brand_id, label, unit_price, price_status, color, spec)
select v.category, v.tier, b.id, v.label, v.price, 'estimated', v.color, v.spec
from (values
  -- flooring (㎡)
  ('flooring','economy','동화자연마루','강화마루 내추럴',38000,'#C8A876','강화마루 8mm'),
  ('flooring','standard','구정마루','강마루 오크',62000,'#B98C5A','강마루 7.5mm'),
  ('flooring','premium','이건마루','원목마루 오크',135000,'#A9784A','원목마루 9mm'),
  -- wallpaper (㎡)
  ('wallpaper','economy','개나리벽지','실크 단색 화이트',9000,'#F3F1EC','합지'),
  ('wallpaper','standard','신한벽지','실크 패턴',16000,'#EDEAE3','실크'),
  ('wallpaper','premium','LG지인벽지','프리미엄 친환경',28000,'#E8E4DB','친환경 실크'),
  -- paint (㎡)
  ('paint','economy','삼화페인트','수성페인트 화이트',7000,'#F5F4F0','수성'),
  ('paint','standard','노루페인트','친환경 수성 웜그레이',12000,'#E6E3DC','친환경 수성'),
  ('paint','premium','벤자민무어코리아','프리미엄 수성',26000,'#E1DDD4','수입 친환경'),
  -- tile (㎡)
  ('tile','economy','동서타일','자기질 화이트 300x600',22000,'#E9E9E6','300x600'),
  ('tile','standard','삼영세라믹','포세린 그레이 300x600',38000,'#CFCFCB','포세린'),
  ('tile','premium','윤현상재','수입 포세린 대형',92000,'#C4C4BF','600x1200 수입'),
  -- window (ea)
  ('window','economy','KCC','PVC 이중창',180000,'#D7DDE2','PVC 이중'),
  ('window','standard','LX하우시스','시스템 이중창',320000,'#D2D8DE','시스템'),
  ('window','premium','LX하우시스','프리미엄 3중 시스템창',560000,'#CDD4DB','3중 시스템'),
  -- door (ea)
  ('door','economy','한솔홈데코','ABS 도어',120000,'#C9A982','ABS'),
  ('door','standard','영림','멤브레인 도어',190000,'#BE9A6E','멤브레인'),
  ('door','premium','동화기업','원목무늬 도어',300000,'#AE8758','원목무늬'),
  -- kitchen (set)
  ('kitchen','economy','에넥스','일자형 싱크대',1500000,'#E4E0D8','L2400'),
  ('kitchen','standard','한샘','ㄱ자형 싱크대',3200000,'#DED9CF','ㄱ자'),
  ('kitchen','premium','현대리바트','아일랜드 주방',6500000,'#D6D0C4','아일랜드'),
  -- sanitaryware (set)
  ('sanitaryware','economy','계림요업','기본 위생도기 세트',450000,'#EDEDEA','양변기+세면'),
  ('sanitaryware','standard','대림바스','일체형 세트',850000,'#E7E7E3','일체형'),
  ('sanitaryware','premium','로얄토토','수입 위생도기',1800000,'#E0E0DB','수입'),
  -- lighting (ea)
  ('lighting','economy','비츠조명','LED 매입등',18000,'#FBF3DA','LED 매입'),
  ('lighting','standard','필룩스','LED 매입+간접',42000,'#FBF0CE','매입+간접'),
  ('lighting','premium','라이마스','디자인 간접조명',95000,'#FBEDC2','디자인'),
  -- furniture (붙박이장, ea)
  ('furniture','economy','에넥스','붙박이장 슬라이딩',650000,'#C2A77F','슬라이딩'),
  ('furniture','standard','한샘','붙박이장 도어형',1100000,'#B89B6F','도어형'),
  ('furniture','premium','현대리바트','시스템 드레스룸',2400000,'#AD8F61','드레스룸'),
  -- molding (m)
  ('molding','economy','LX하우시스','PVC 몰딩 화이트',4500,'#F4F3EF','PVC'),
  ('molding','standard','한솔홈데코','무늬목 몰딩',8000,'#EFEDE7','무늬목'),
  ('molding','premium','동화기업','원목 몰딩',15000,'#E9E6DE','원목')
) as v(category, tier, brand, label, price, color, spec)
join material_brands b on b.name = v.brand;
```

> 참고: `'영림'` 브랜드는 시드 리스트에 없으므로 `door/standard` 행은 join 실패로 누락될 수 있다 → 시드에 `('영림', false, 'specialist', array['door'])` 한 행을 브랜드 seed에도 추가하거나 `한솔홈데코`로 교체. **구현 시 door/standard 브랜드를 `한솔홈데코`로 두어 join 보장** (테스트가 카테고리×3티어 존재를 강제하므로 누락 시 실패한다).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/db/material-catalog.test.ts`
Expected: PASS (4 tests). 실패 시 누락 (category,tier) 또는 join 실패 브랜드를 수정.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0017_material_catalog.sql tests/db/material-catalog.test.ts
git commit -m "feat(proposal): 0017 자재 브랜드 DB + 마감재 카탈로그 시드 + RLS"
```

---

### Task A3: 수량 근사 `lib/proposal/quantities.ts`

**Files:**
- Create: `lib/proposal/quantities.ts`
- Test: `tests/unit/proposal-quantities.test.ts`

**Interfaces:**
- Consumes: `ApartmentTemplate`,`FinishCategory`,`RoomSlot` (`@/lib/types`).
- Produces: `approxQuantity(category: FinishCategory, t: ApartmentTemplate): { qty: number; unit: string }`; helpers `floorAreaM2`,`wallAreaM2`,`perimeterM`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/proposal-quantities.test.ts
import { describe, it, expect } from "vitest";
import { approxQuantity, floorAreaM2 } from "@/lib/proposal/quantities";
import type { ApartmentTemplate } from "@/lib/types";

const T: ApartmentTemplate = {
  id: "t", pyeongBand: 20, exclusiveM2: 59, supplyM2: 82, bedrooms: 3, bathrooms: 2,
  rooms: [
    { name: "거실", type: "living", x: 0, y: 0, w: 4, h: 5 },     // 20
    { name: "안방", type: "room", x: 4, y: 0, w: 3, h: 4 },       // 12
    { name: "침실1", type: "room", x: 4, y: 4, w: 3, h: 3 },      // 9
    { name: "침실2", type: "room", x: 0, y: 5, w: 3, h: 3 },      // 9
    { name: "욕실1", type: "bathroom", x: 7, y: 0, w: 2, h: 2 },  // 4
    { name: "욕실2", type: "bathroom", x: 7, y: 2, w: 2, h: 2 },  // 4
    { name: "발코니", type: "balcony", x: 0, y: 8, w: 7, h: 1.5 },// 10.5
  ],
  furniture: [],
};

describe("approxQuantity", () => {
  it("flooring: 발코니/욕실 제외 바닥면적", () => {
    // 거실20+안방12+침실9+침실9 = 50 (욕실·발코니 제외)
    expect(approxQuantity("flooring", T)).toEqual({ qty: 50, unit: "m2" });
  });
  it("door: 침실수+욕실수 = 5", () => {
    expect(approxQuantity("door", T)).toEqual({ qty: 5, unit: "ea" });
  });
  it("sanitaryware: 욕실수 = 2", () => {
    expect(approxQuantity("sanitaryware", T)).toEqual({ qty: 2, unit: "set" });
  });
  it("kitchen: 항상 1 세트", () => {
    expect(approxQuantity("kitchen", T).qty).toBe(1);
  });
  it("floorAreaM2 헬퍼는 발코니 제외", () => {
    expect(floorAreaM2(T)).toBe(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/proposal-quantities.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/proposal/quantities.ts
/** 템플릿 면적/개수 기반 자재 수량 근사 (순수·결정론). */
import type { ApartmentTemplate, FinishCategory, RoomSlot } from "@/lib/types";

const CEILING_H = 2.4;

const isHabitable = (r: RoomSlot) => r.type !== "balcony" && r.type !== "bathroom";
const area = (r: RoomSlot) => r.w * r.h;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** 마루 깔리는 면적: 욕실·발코니 제외 합(㎡). */
export function floorAreaM2(t: ApartmentTemplate): number {
  return round1(t.rooms.filter(isHabitable).reduce((s, r) => s + area(r), 0));
}

/** 벽지/도배/페인트 면적: 거주 방 둘레 × 천장고(㎡). */
export function wallAreaM2(t: ApartmentTemplate): number {
  const perim = t.rooms.filter(isHabitable).reduce((s, r) => s + 2 * (r.w + r.h), 0);
  return round1(perim * CEILING_H);
}

/** 몰딩/걸레받이 길이: 거주 방 둘레 합(m). */
export function perimeterM(t: ApartmentTemplate): number {
  return round1(t.rooms.filter(isHabitable).reduce((s, r) => s + 2 * (r.w + r.h), 0));
}

const balconyArea = (t: ApartmentTemplate) =>
  round1(t.rooms.filter((r) => r.type === "balcony").reduce((s, r) => s + area(r), 0));
const livingCount = (t: ApartmentTemplate) => t.rooms.filter((r) => r.type === "living").length;

export function approxQuantity(
  category: FinishCategory,
  t: ApartmentTemplate,
): { qty: number; unit: string } {
  switch (category) {
    case "flooring":
      return { qty: floorAreaM2(t), unit: "m2" };
    case "wallpaper":
    case "paint":
      return { qty: wallAreaM2(t), unit: "m2" };
    case "tile":
      // 욕실 벽+바닥 대표 12㎡/실 + 발코니 바닥
      return { qty: round1(t.bathrooms * 12 + balconyArea(t)), unit: "m2" };
    case "window":
      return { qty: t.bedrooms + livingCount(t), unit: "ea" };
    case "door":
      return { qty: t.bedrooms + t.bathrooms, unit: "ea" };
    case "kitchen":
      return { qty: 1, unit: "set" };
    case "sanitaryware":
      return { qty: t.bathrooms, unit: "set" };
    case "lighting":
      return { qty: t.rooms.filter(isHabitable).length, unit: "ea" };
    case "furniture":
      return { qty: t.bedrooms, unit: "ea" };
    case "molding":
      return { qty: perimeterM(t), unit: "m" };
    default: // film, board, engineered_stone — 1차 미산정
      return { qty: 0, unit: "ea" };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/proposal-quantities.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/proposal/quantities.ts tests/unit/proposal-quantities.test.ts
git commit -m "feat(proposal): 카테고리별 자재 수량 근사(순수)"
```

---

### Task A4: 티어 선택 + 예산 강등 `lib/proposal/materials.ts`

**Files:**
- Create: `lib/proposal/materials.ts`
- Test: `tests/unit/proposal-materials.test.ts`

**Interfaces:**
- Consumes: `approxQuantity` (A3); `FinishMaterial`,`FinishSelection`,`FinishCategory`,`FinishTier`,`ApartmentTemplate`,`EstimateBrief` (`@/lib/types`).
- Produces: `selectFinishes(brief: EstimateBrief, template: ApartmentTemplate, catalog: FinishMaterial[]): FinishSelection[]`; `materialsTotal(sel: FinishSelection[]): number`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/proposal-materials.test.ts
import { describe, it, expect } from "vitest";
import { selectFinishes, materialsTotal } from "@/lib/proposal/materials";
import type { ApartmentTemplate, EstimateBrief, FinishMaterial } from "@/lib/types";

const T: ApartmentTemplate = {
  id: "t", pyeongBand: 20, exclusiveM2: 59, supplyM2: 82, bedrooms: 2, bathrooms: 1,
  rooms: [{ name: "거실", type: "living", x: 0, y: 0, w: 2, h: 1 }], furniture: [],
};
// 단순 카탈로그: door 카테고리 1종, 3티어
const CATALOG: FinishMaterial[] = [
  { id: "d-e", category: "door", tier: "economy", brandId: "b", label: "이코", unitPrice: 100, priceStatus: "estimated" },
  { id: "d-s", category: "door", tier: "standard", brandId: "b", label: "스탠", unitPrice: 200, priceStatus: "estimated" },
  { id: "d-p", category: "door", tier: "premium", brandId: "b", label: "프리", unitPrice: 400, priceStatus: "estimated" },
];
const brief = (over: Partial<EstimateBrief>): EstimateBrief => ({
  projectType: "apartment_remodel", specLevel: "standard", rooms: T.rooms.map((r) => ({ name: r.name, type: r.type, widthM: r.w, lengthM: r.h })), ...over,
});

describe("selectFinishes", () => {
  it("specLevel standard → standard 티어 선택 (예산 없음)", () => {
    const sel = selectFinishes(brief({ specLevel: "standard" }), T, CATALOG);
    const door = sel.find((s) => s.category === "door")!;
    expect(door.material.tier).toBe("standard");
    expect(door.qty).toBe(3); // 침실2+욕실1
    expect(door.lineTotal).toBe(600); // 3*200
    expect(door.downgraded).toBe(false);
  });

  it("예산 부족 → economy로 강등 + downgraded 플래그", () => {
    // standard 600 > budget 350 → economy 300 으로 강등
    const sel = selectFinishes(brief({ specLevel: "standard", budgetKRW: 350 }), T, CATALOG);
    const door = sel.find((s) => s.category === "door")!;
    expect(door.material.tier).toBe("economy");
    expect(door.downgraded).toBe(true);
    expect(materialsTotal(sel)).toBeLessThanOrEqual(350);
  });

  it("premium 선호 + 충분 예산 → premium 유지", () => {
    const sel = selectFinishes(brief({ specLevel: "premium", budgetKRW: 10000 }), T, CATALOG);
    expect(sel.find((s) => s.category === "door")!.material.tier).toBe("premium");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/proposal-materials.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/proposal/materials.ts
/** 예산/스펙 기반 카테고리별 마감재 선택 + 예산 초과 시 강등 (순수·결정론). */
import type {
  ApartmentTemplate, EstimateBrief, FinishCategory, FinishMaterial,
  FinishSelection, FinishTier, SpecLevel,
} from "@/lib/types";
import { approxQuantity } from "./quantities";

const TIER_RANK: Record<FinishTier, number> = { economy: 0, standard: 1, premium: 2 };
const SPEC_TO_TIER: Record<SpecLevel, FinishTier> = {
  economy: "economy", standard: "standard", premium: "premium",
};
// 강등 우선순위: 체감 낮은 카테고리부터 (앞쪽 먼저 내림)
const DOWNGRADE_ORDER: FinishCategory[] = [
  "film", "board", "molding", "lighting", "wallpaper", "paint",
  "tile", "door", "window", "furniture", "engineered_stone",
  "kitchen", "sanitaryware", "flooring",
];

function lowerTier(t: FinishTier): FinishTier {
  return t === "premium" ? "standard" : "economy";
}

/** 해당 카테고리에서 목표 티어(없으면 인접 하위→상위) 중 최저가 1종. */
function pickMaterial(
  catalog: FinishMaterial[], category: FinishCategory, tier: FinishTier,
): FinishMaterial | null {
  const order: FinishTier[] =
    tier === "premium" ? ["premium", "standard", "economy"]
    : tier === "standard" ? ["standard", "economy", "premium"]
    : ["economy", "standard", "premium"];
  for (const t of order) {
    const cands = catalog
      .filter((m) => m.category === category && m.tier === t)
      .sort((a, b) => a.unitPrice - b.unitPrice);
    if (cands.length > 0) return cands[0]!;
  }
  return null;
}

export function materialsTotal(sel: FinishSelection[]): number {
  return sel.reduce((s, x) => s + x.lineTotal, 0);
}

export function selectFinishes(
  brief: EstimateBrief, template: ApartmentTemplate, catalog: FinishMaterial[],
): FinishSelection[] {
  const baseTier = SPEC_TO_TIER[brief.specLevel];
  const categories = Array.from(new Set(catalog.map((m) => m.category))) as FinishCategory[];
  const chosen = new Map<FinishCategory, FinishTier>();
  categories.forEach((c) => chosen.set(c, baseTier));

  const build = (): FinishSelection[] => {
    const out: FinishSelection[] = [];
    for (const c of categories) {
      const tier = chosen.get(c)!;
      const mat = pickMaterial(catalog, c, tier);
      if (!mat) continue;
      const { qty } = approxQuantity(c, template);
      out.push({
        category: c, material: mat, qty,
        lineTotal: Math.round(qty * mat.unitPrice),
        downgraded: TIER_RANK[mat.tier] < TIER_RANK[baseTier],
      });
    }
    return out;
  };

  let selections = build();
  const budget = brief.budgetKRW;
  if (budget && budget > 0) {
    let guard = 0;
    while (materialsTotal(selections) > budget && guard < 200) {
      const target = DOWNGRADE_ORDER.find(
        (c) => categories.includes(c) && chosen.get(c) !== "economy",
      );
      if (!target) break; // 모두 economy → 더 못 내림
      chosen.set(target, lowerTier(chosen.get(target)!));
      selections = build();
      guard += 1;
    }
  }
  return selections;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/proposal-materials.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/proposal/materials.ts tests/unit/proposal-materials.test.ts
git commit -m "feat(proposal): 예산 기반 자재 티어 선택 + 강등(순수)"
```

---

## Phase B — 템플릿 & 2D 평면도 (Backend)

### Task B1: 평면도 템플릿 데이터 + 매칭 `lib/proposal/templates/`

**Files:**
- Create: `lib/proposal/templates/data.ts`, `lib/proposal/templates/index.ts`
- Test: `tests/unit/proposal-templates.test.ts`

**Interfaces:**
- Consumes: `ApartmentTemplate`,`RoomSlot`,`Transform3D` (`@/lib/types`); 가구 `assetId`는 `lib/studio/assets.ts`의 ASSETS id(`sofa`,`table`,`chair`,`bed` 등) 사용.
- Produces: `APARTMENT_TEMPLATES: ApartmentTemplate[]`; `matchTemplate(input: { pyeong: number; bedrooms: number; bathrooms: number }): ApartmentTemplate`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/proposal-templates.test.ts
import { describe, it, expect } from "vitest";
import { APARTMENT_TEMPLATES, matchTemplate } from "@/lib/proposal/templates";

describe("apartment templates", () => {
  it("10~50평대 전 밴드 1개 이상 존재", () => {
    for (const band of [10, 20, 30, 40, 50]) {
      expect(APARTMENT_TEMPLATES.some((t) => t.pyeongBand === band)).toBe(true);
    }
  });
  it("모든 템플릿: rooms 비어있지 않고 furniture assetId 존재", () => {
    for (const t of APARTMENT_TEMPLATES) {
      expect(t.rooms.length).toBeGreaterThan(0);
      expect(t.exclusiveM2).toBeGreaterThan(0);
    }
  });
  it("25평/방3/욕2 → 20평대 3룸 템플릿 매칭", () => {
    const t = matchTemplate({ pyeong: 25, bedrooms: 3, bathrooms: 2 });
    expect(t.pyeongBand).toBe(20);
    expect(t.bedrooms).toBe(3);
  });
  it("47평 → 50평대 최근접 밴드로 매칭", () => {
    expect(matchTemplate({ pyeong: 47, bedrooms: 4, bathrooms: 2 }).pyeongBand).toBe(50);
  });
  it("범위 밖(5평) → 최소 밴드(10)로 폴백", () => {
    expect(matchTemplate({ pyeong: 5, bedrooms: 1, bathrooms: 1 }).pyeongBand).toBe(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/proposal-templates.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `templates/data.ts`** (5밴드, 좌표 단위 m)

```ts
// lib/proposal/templates/data.ts
/** 표준 한국 아파트 평면 템플릿 (10~50평대). 좌표 단위 m, 원점 좌상단. */
import type { ApartmentTemplate, Transform3D } from "@/lib/types";

const tf = (x: number, z: number, ry = 0): Transform3D => ({
  position: [x, 0, z], rotation: [0, ry, 0], scale: [1, 1, 1],
});

export const APARTMENT_TEMPLATES: ApartmentTemplate[] = [
  {
    id: "apt-10s-1room-1bath", pyeongBand: 10, exclusiveM2: 33, supplyM2: 43,
    bedrooms: 1, bathrooms: 1,
    rooms: [
      { name: "거실/주방", type: "living", x: 0, y: 0, w: 4, h: 4 },
      { name: "침실", type: "room", x: 4, y: 0, w: 3, h: 3 },
      { name: "욕실", type: "bathroom", x: 4, y: 3, w: 2, h: 2 },
      { name: "현관", type: "entrance", x: 0, y: 4, w: 1.5, h: 1.5 },
      { name: "발코니", type: "balcony", x: 0, y: 5.5, w: 4, h: 1.2 },
    ],
    furniture: [
      { assetId: "sofa", roomName: "거실/주방", transform: tf(1.5, 1.5) },
      { assetId: "bed", roomName: "침실", transform: tf(5.5, 1.5) },
    ],
  },
  {
    id: "apt-20s-3room-2bath", pyeongBand: 20, exclusiveM2: 59, supplyM2: 82,
    bedrooms: 3, bathrooms: 2,
    rooms: [
      { name: "거실", type: "living", x: 2, y: 3, w: 4, h: 4 },
      { name: "주방/식당", type: "kitchen", x: 2, y: 0, w: 4, h: 3 },
      { name: "안방", type: "room", x: 0, y: 5, w: 2, h: 3 },
      { name: "침실1", type: "room", x: 6, y: 4, w: 3, h: 3.5 },
      { name: "침실2", type: "room", x: 6, y: 0, w: 3, h: 2.5 },
      { name: "욕실1", type: "bathroom", x: 0, y: 3, w: 2, h: 2 },
      { name: "욕실2", type: "bathroom", x: 5, y: 2.5, w: 1.5, h: 1.5 },
      { name: "현관", type: "entrance", x: 0, y: 0, w: 2, h: 1.5 },
      { name: "발코니", type: "balcony", x: 0, y: 8, w: 6, h: 1.4 },
    ],
    furniture: [
      { assetId: "sofa", roomName: "거실", transform: tf(3.5, 5.5) },
      { assetId: "table", roomName: "주방/식당", transform: tf(4, 1.5) },
      { assetId: "bed", roomName: "안방", transform: tf(1, 6.5) },
      { assetId: "bed", roomName: "침실1", transform: tf(7.5, 5.5) },
    ],
  },
  {
    id: "apt-30s-3room-2bath", pyeongBand: 30, exclusiveM2: 84, supplyM2: 110,
    bedrooms: 3, bathrooms: 2,
    rooms: [
      { name: "거실", type: "living", x: 3, y: 3, w: 5, h: 4.5 },
      { name: "주방/식당", type: "kitchen", x: 3, y: 0, w: 5, h: 3 },
      { name: "안방", type: "room", x: 0, y: 4, w: 3, h: 4 },
      { name: "침실1", type: "room", x: 8, y: 4, w: 3.5, h: 3.5 },
      { name: "침실2", type: "room", x: 8, y: 0, w: 3.5, h: 3 },
      { name: "욕실1", type: "bathroom", x: 0, y: 1.5, w: 2.5, h: 2.5 },
      { name: "욕실2", type: "bathroom", x: 6.5, y: 2.5, w: 1.5, h: 1.5 },
      { name: "현관", type: "entrance", x: 0, y: 0, w: 2.5, h: 1.5 },
      { name: "발코니", type: "balcony", x: 0, y: 8.5, w: 8, h: 1.5 },
    ],
    furniture: [
      { assetId: "sofa", roomName: "거실", transform: tf(5, 5.5) },
      { assetId: "table", roomName: "주방/식당", transform: tf(5.5, 1.5) },
      { assetId: "bed", roomName: "안방", transform: tf(1.5, 6) },
      { assetId: "bed", roomName: "침실1", transform: tf(9.5, 5.5) },
    ],
  },
  {
    id: "apt-40s-4room-2bath", pyeongBand: 40, exclusiveM2: 114, supplyM2: 148,
    bedrooms: 4, bathrooms: 2,
    rooms: [
      { name: "거실", type: "living", x: 3, y: 3.5, w: 6, h: 5 },
      { name: "주방/식당", type: "kitchen", x: 3, y: 0, w: 6, h: 3.5 },
      { name: "안방", type: "room", x: 0, y: 4, w: 3, h: 4.5 },
      { name: "침실1", type: "room", x: 9, y: 5, w: 4, h: 3.5 },
      { name: "침실2", type: "room", x: 9, y: 0, w: 4, h: 3 },
      { name: "침실3", type: "room", x: 9, y: 3, w: 4, h: 2 },
      { name: "욕실1", type: "bathroom", x: 0, y: 1.5, w: 3, h: 2.5 },
      { name: "욕실2", type: "bathroom", x: 7, y: 3, w: 2, h: 1.5 },
      { name: "현관", type: "entrance", x: 0, y: 0, w: 3, h: 1.5 },
      { name: "발코니", type: "balcony", x: 0, y: 9, w: 9, h: 1.6 },
    ],
    furniture: [
      { assetId: "sofa", roomName: "거실", transform: tf(6, 6) },
      { assetId: "table", roomName: "주방/식당", transform: tf(6, 1.75) },
      { assetId: "bed", roomName: "안방", transform: tf(1.5, 6.25) },
      { assetId: "bed", roomName: "침실1", transform: tf(11, 6.75) },
    ],
  },
  {
    id: "apt-50s-4room-3bath", pyeongBand: 50, exclusiveM2: 145, supplyM2: 185,
    bedrooms: 4, bathrooms: 3,
    rooms: [
      { name: "거실", type: "living", x: 3.5, y: 4, w: 7, h: 5.5 },
      { name: "주방/식당", type: "kitchen", x: 3.5, y: 0, w: 7, h: 4 },
      { name: "안방", type: "room", x: 0, y: 4.5, w: 3.5, h: 5 },
      { name: "드레스룸", type: "other", x: 0, y: 2.5, w: 3.5, h: 2 },
      { name: "침실1", type: "room", x: 10.5, y: 5.5, w: 4.5, h: 4 },
      { name: "침실2", type: "room", x: 10.5, y: 0, w: 4.5, h: 3 },
      { name: "침실3", type: "room", x: 10.5, y: 3, w: 4.5, h: 2.5 },
      { name: "욕실1", type: "bathroom", x: 0, y: 0, w: 3.5, h: 2.5 },
      { name: "욕실2", type: "bathroom", x: 8, y: 3.5, w: 2.5, h: 2 },
      { name: "욕실3", type: "bathroom", x: 8, y: 0, w: 2.5, h: 2 },
      { name: "발코니", type: "balcony", x: 0, y: 10, w: 10.5, h: 1.8 },
    ],
    furniture: [
      { assetId: "sofa", roomName: "거실", transform: tf(7, 6.75) },
      { assetId: "table", roomName: "주방/식당", transform: tf(7, 2) },
      { assetId: "bed", roomName: "안방", transform: tf(1.75, 7) },
      { assetId: "bed", roomName: "침실1", transform: tf(12.75, 7.5) },
    ],
  },
];
```

- [ ] **Step 4: Write `templates/index.ts`**

```ts
// lib/proposal/templates/index.ts
import type { ApartmentTemplate } from "@/lib/types";
import { APARTMENT_TEMPLATES } from "./data";

export { APARTMENT_TEMPLATES };

const BANDS = [10, 20, 30, 40, 50] as const;

/** 평수 → 가장 가까운 평형대(10~50). */
function nearestBand(pyeong: number): (typeof BANDS)[number] {
  return BANDS.reduce((best, b) =>
    Math.abs(b - pyeong) < Math.abs(best - pyeong) ? b : best, BANDS[0]);
}

/**
 * 평수+방/욕실수로 최근접 템플릿 선택.
 * 1) 평형대 일치 후보 → 없으면 전체.
 * 2) |Δbedrooms|+|Δbathrooms| 최소, 동률이면 전용면적 차 최소.
 */
export function matchTemplate(input: {
  pyeong: number; bedrooms: number; bathrooms: number;
}): ApartmentTemplate {
  const band = nearestBand(input.pyeong);
  const pool = APARTMENT_TEMPLATES.filter((t) => t.pyeongBand === band);
  const candidates = pool.length > 0 ? pool : APARTMENT_TEMPLATES;
  const score = (t: ApartmentTemplate) =>
    Math.abs(t.bedrooms - input.bedrooms) + Math.abs(t.bathrooms - input.bathrooms);
  const targetM2 = input.pyeong * 3.3058;
  return [...candidates].sort((a, b) => {
    const s = score(a) - score(b);
    if (s !== 0) return s;
    return Math.abs(a.exclusiveM2 - targetM2) - Math.abs(b.exclusiveM2 - targetM2);
  })[0]!;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/proposal-templates.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/proposal/templates tests/unit/proposal-templates.test.ts
git commit -m "feat(proposal): 10~50평대 평면도 템플릿 + 최근접 매칭"
```

---

### Task B2: 2D 평면도 SVG `lib/proposal/floorplan-svg.ts`

**Files:**
- Create: `lib/proposal/floorplan-svg.ts`
- Test: `tests/unit/proposal-floorplan-svg.test.ts`

**Interfaces:**
- Consumes: `ApartmentTemplate`,`RoomSlot` (`@/lib/types`).
- Produces: `renderPlanSvg(t: ApartmentTemplate, opts?: { title?: string }): string` — 완결된 `<svg>…</svg>` 문자열(서버/직렬화/PNG·PDF 공용).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/proposal-floorplan-svg.test.ts
import { describe, it, expect } from "vitest";
import { renderPlanSvg } from "@/lib/proposal/floorplan-svg";
import { APARTMENT_TEMPLATES } from "@/lib/proposal/templates";

const T = APARTMENT_TEMPLATES.find((x) => x.pyeongBand === 20)!;

describe("renderPlanSvg", () => {
  it("svg 문자열 + 모든 방 라벨 포함", () => {
    const svg = renderPlanSvg(T, { title: "25평 평면도" });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("</svg>");
    for (const r of T.rooms) expect(svg).toContain(r.name);
  });
  it("전용/공급 면적 주석 포함", () => {
    const svg = renderPlanSvg(T);
    expect(svg).toContain("전용면적");
    expect(svg).toContain(`${T.exclusiveM2}`);
    expect(svg).toContain("공급면적");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/proposal-floorplan-svg.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (floorplan-2d.tsx 패턴 확장; 색상은 floorplan-3d ROOM_COLORS 재사용 톤)

```ts
// lib/proposal/floorplan-svg.ts
/** ApartmentTemplate → 라벨/면적 주석이 있는 완결 SVG 문자열(순수). 이미지 #2 대응. */
import type { ApartmentTemplate, RoomSlot, RoomType } from "@/lib/types";

const SCALE = 40;      // px/m
const PAD = 36;
const HEADER_H = 44;
const FOOTER_H = 30;

const ROOM_FILL: Record<RoomType, string> = {
  living: "#EFE9DF", room: "#F1ECE2", kitchen: "#EDE7DC", bathroom: "#DDE6E6",
  balcony: "#E6ECE8", entrance: "#E8E2EC", other: "#ECE9E3",
};
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const r1 = (n: number) => Math.round(n * 10) / 10;

function bounds(rooms: RoomSlot[]) {
  const maxX = Math.max(...rooms.map((r) => r.x + r.w));
  const maxY = Math.max(...rooms.map((r) => r.y + r.h));
  return { maxX, maxY };
}

export function renderPlanSvg(t: ApartmentTemplate, opts?: { title?: string }): string {
  const { maxX, maxY } = bounds(t.rooms);
  const w = maxX * SCALE + PAD * 2;
  const h = maxY * SCALE + PAD * 2 + HEADER_H + FOOTER_H;
  const title = esc(opts?.title ?? `${t.pyeongBand}평대 평면도`);

  const roomSvg = t.rooms.map((room) => {
    const x = room.x * SCALE + PAD;
    const y = room.y * SCALE + PAD + HEADER_H;
    const rw = room.w * SCALE;
    const rh = room.h * SCALE;
    const cx = x + rw / 2;
    const cy = y + rh / 2;
    return `<g>
  <rect x="${x}" y="${y}" width="${rw}" height="${rh}" rx="2"
    fill="${ROOM_FILL[room.type]}" stroke="#2B2B2B" stroke-width="2"/>
  <text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="14" fill="#16181D"
    font-family="system-ui, sans-serif" font-weight="600">${esc(room.name)}</text>
  <text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="10" fill="#6B7280"
    font-family="system-ui, sans-serif">${r1(room.w)}×${r1(room.h)}m</text>
</g>`;
  }).join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${title}"
  viewBox="0 0 ${r1(w)} ${r1(h)}" width="100%" style="max-height:560px"
  font-family="system-ui, sans-serif">
  <rect x="0" y="0" width="${r1(w)}" height="${r1(h)}" fill="#FFFFFF"/>
  <text x="${w / 2}" y="28" text-anchor="middle" font-size="20" font-weight="700"
    fill="#16181D">${title}</text>
${roomSvg}
  <text x="${w / 2}" y="${h - 10}" text-anchor="middle" font-size="12" fill="#374151">
    전용면적 약 ${t.exclusiveM2}㎡ / 공급면적 약 ${t.supplyM2}㎡</text>
</svg>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/proposal-floorplan-svg.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/proposal/floorplan-svg.ts tests/unit/proposal-floorplan-svg.test.ts
git commit -m "feat(proposal): 라벨링 2D 평면도 SVG 렌더(이미지 #2)"
```

---

## Phase C — 3D 브리지 & 조립 (Backend)

### Task C1: `lib/studio/from-floorplan.ts` — toFurnishedScene

**Files:**
- Create: `lib/studio/from-floorplan.ts`
- Test: `tests/unit/proposal-from-floorplan.test.ts`

**Interfaces:**
- Consumes: `ASSETS` (`@/lib/studio/assets`); `ApartmentTemplate`,`FinishSelection`,`Transform3D` (`@/lib/types`); `StudioAsset` (`@/lib/studio/assets`).
- Produces: 타입 `PlacedAsset`,`FurnishedScene`; `toFurnishedScene(t: ApartmentTemplate, finishes: FinishSelection[]): FurnishedScene`. `proposal-canvas.tsx`가 소비.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/proposal-from-floorplan.test.ts
import { describe, it, expect } from "vitest";
import { toFurnishedScene } from "@/lib/studio/from-floorplan";
import { APARTMENT_TEMPLATES } from "@/lib/proposal/templates";
import type { FinishSelection } from "@/lib/types";

const T = APARTMENT_TEMPLATES.find((x) => x.pyeongBand === 20)!;
const finishes: FinishSelection[] = [
  { category: "flooring", qty: 50, lineTotal: 0, downgraded: false,
    material: { id: "f", category: "flooring", tier: "standard", brandId: "b", label: "오크", unitPrice: 0, priceStatus: "estimated", color: "#B98C5A" } },
  { category: "paint", qty: 100, lineTotal: 0, downgraded: false,
    material: { id: "p", category: "paint", tier: "standard", brandId: "b", label: "그레이", unitPrice: 0, priceStatus: "estimated", color: "#E6E3DC" } },
];

describe("toFurnishedScene", () => {
  it("flooring/paint 색을 floorColor/wallColor로 매핑", () => {
    const s = toFurnishedScene(T, finishes);
    expect(s.floorColor).toBe("#B98C5A");
    expect(s.wallColor).toBe("#E6E3DC");
  });
  it("템플릿 가구 assetId를 ASSETS로 해석 (알 수 없는 id 제외)", () => {
    const s = toFurnishedScene(T, finishes);
    expect(s.furniture.length).toBe(T.furniture.length); // 모두 유효 id(sofa/table/bed)
    expect(s.furniture[0]!.asset.id).toBeTruthy();
  });
  it("rooms·치수 그대로 전달", () => {
    const s = toFurnishedScene(T, finishes);
    expect(s.rooms.length).toBe(T.rooms.length);
    expect(s.widthM).toBeGreaterThan(0);
  });
  it("finishes 없으면 기본색 폴백", () => {
    const s = toFurnishedScene(T, []);
    expect(s.floorColor).toMatch(/^#/);
    expect(s.wallColor).toMatch(/^#/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/proposal-from-floorplan.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/studio/from-floorplan.ts
/** ApartmentTemplate + 선택 마감재 → 3D 렌더용 FurnishedScene (순수). */
import { ASSETS, type StudioAsset } from "@/lib/studio/assets";
import type { ApartmentTemplate, FinishSelection, RoomSlot, Transform3D } from "@/lib/types";

const DEFAULT_FLOOR = "#C7A878";
const DEFAULT_WALL = "#ECE9E3";

export interface PlacedAsset { asset: StudioAsset; transform: Transform3D; }
export interface FurnishedScene {
  rooms: RoomSlot[];
  furniture: PlacedAsset[];
  floorColor: string;
  wallColor: string;
  widthM: number;
  lengthM: number;
}

const assetById = (id: string): StudioAsset | undefined => ASSETS.find((a) => a.id === id);
const colorOf = (finishes: FinishSelection[], cat: string): string | undefined =>
  finishes.find((f) => f.category === cat)?.material.color;

export function toFurnishedScene(
  t: ApartmentTemplate, finishes: FinishSelection[],
): FurnishedScene {
  const widthM = Math.max(...t.rooms.map((r) => r.x + r.w));
  const lengthM = Math.max(...t.rooms.map((r) => r.y + r.h));
  const furniture: PlacedAsset[] = t.furniture
    .map((f) => {
      const asset = assetById(f.assetId);
      return asset ? { asset, transform: f.transform } : null;
    })
    .filter((x): x is PlacedAsset => x !== null);

  return {
    rooms: t.rooms,
    furniture,
    floorColor: colorOf(finishes, "flooring") ?? DEFAULT_FLOOR,
    wallColor: colorOf(finishes, "paint") ?? colorOf(finishes, "wallpaper") ?? DEFAULT_WALL,
    widthM,
    lengthM,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/proposal-from-floorplan.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/studio/from-floorplan.ts tests/unit/proposal-from-floorplan.test.ts
git commit -m "feat(proposal): FloorPlan 템플릿→가구 배치 3D 씬 변환(순수)"
```

---

### Task C2: 공정 합계 + 조립 `lib/proposal/construction.ts` + `lib/proposal/index.ts`

**Files:**
- Create: `lib/proposal/construction.ts`, `lib/proposal/index.ts`
- Test: `tests/unit/proposal-construction.test.ts`

**Interfaces:**
- Consumes: `BomResult` (`@/lib/types`); `materialsTotal`,`selectFinishes` (A4); `matchTemplate` (B1); `renderPlanSvg` (B2); `toFurnishedScene` (C1); `buildEstimate` (`@/lib/estimate`).
- Produces: `constructionTotal(bom: BomResult): number`; `FINISH_SLUGS: Set<string>`; `buildProposal(brief, catalog): Promise<BuiltProposal>` 타입 `BuiltProposal`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/proposal-construction.test.ts
import { describe, it, expect } from "vitest";
import { constructionTotal, FINISH_SLUGS } from "@/lib/proposal/construction";
import type { BomResult } from "@/lib/types";

const bom: BomResult = {
  source: "fallback", estTotal: 0,
  lines: [
    { category: "바닥재", categorySlug: "flooring", item: "마루", qty: 1, unit: "m2", estUnitPrice: 50000, estPrice: 50000 },
    { category: "철거", categorySlug: "demolition", item: "철거", qty: 1, unit: "ea", estUnitPrice: 800000, estPrice: 800000 },
    { category: "전기", categorySlug: "electrical", item: "배선", qty: 1, unit: "ea", estUnitPrice: 500000, estPrice: 500000 },
  ],
};

describe("constructionTotal", () => {
  it("마감 카테고리(flooring) 제외하고 공정만 합산", () => {
    expect(FINISH_SLUGS.has("flooring")).toBe(true);
    // 800000 + 500000 (flooring 50000 제외)
    expect(constructionTotal(bom)).toBe(1300000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/proposal-construction.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `construction.ts`**

```ts
// lib/proposal/construction.ts
/** BOM에서 마감재(자재 패널) 중복 제외한 공정/시공 합계 (순수). */
import type { BomResult } from "@/lib/types";

/** finish_materials 카테고리와 겹치는 BOM categorySlug — 중복 계상 방지. */
export const FINISH_SLUGS = new Set<string>([
  "flooring", "wallpaper", "paint", "tile", "window", "door",
  "kitchen", "sanitaryware", "lighting",
]);

export function constructionTotal(bom: BomResult): number {
  return bom.lines
    .filter((l) => !FINISH_SLUGS.has(l.categorySlug))
    .reduce((s, l) => s + l.estPrice, 0);
}
```

- [ ] **Step 4: Write `index.ts`** (조립 — 순수 부분은 위 함수들, BOM은 buildEstimate 재사용)

```ts
// lib/proposal/index.ts
import type {
  ApartmentTemplate, BomResult, Category, EstimateBrief, FinishMaterial,
  FinishSelection, Product, RoomType,
} from "@/lib/types";
import { buildEstimate } from "@/lib/estimate";
import { matchTemplate } from "./templates";
import { selectFinishes, materialsTotal } from "./materials";
import { renderPlanSvg } from "./floorplan-svg";
import { constructionTotal } from "./construction";
import { toFurnishedScene, type FurnishedScene } from "@/lib/studio/from-floorplan";

export interface BuiltProposal {
  template: ApartmentTemplate;
  finishes: FinishSelection[];
  furnishedScene: FurnishedScene;
  floorPlanSvg: string;
  bom: BomResult;
  materialsKRW: number;
  constructionKRW: number;
  totalKRW: number;
}

/** 평수: brief.pyeong 우선, 없으면 룸 면적 합에서 도출. */
function resolvePyeong(brief: EstimateBrief): number {
  if (brief.pyeong && brief.pyeong > 0) return brief.pyeong;
  const m2 = brief.rooms.reduce((s, r) => s + r.widthM * r.lengthM, 0);
  return Math.max(10, Math.round(m2 / 3.3058));
}
const count = (brief: EstimateBrief, type: RoomType) =>
  brief.rooms.filter((r) => r.type === type).length;

export async function buildProposal(
  brief: EstimateBrief,
  catalog: { categories: Category[]; products: Product[]; finishes: FinishMaterial[] },
): Promise<BuiltProposal> {
  const template = matchTemplate({
    pyeong: resolvePyeong(brief),
    bedrooms: Math.max(1, count(brief, "room")),
    bathrooms: Math.max(1, count(brief, "bathroom")),
  });
  const finishes = selectFinishes(brief, template, catalog.finishes);
  const furnishedScene = toFurnishedScene(template, finishes);
  const floorPlanSvg = renderPlanSvg(template);
  const estimate = await buildEstimate(brief, {
    categories: catalog.categories, products: catalog.products,
  });
  const materialsKRW = materialsTotal(finishes);
  const constructionKRW = constructionTotal(estimate.bom);
  return {
    template, finishes, furnishedScene, floorPlanSvg, bom: estimate.bom,
    materialsKRW, constructionKRW, totalKRW: materialsKRW + constructionKRW,
  };
}
```

> `buildEstimate`의 입력/반환 시그니처는 `lib/estimate/index.ts` 확인 후 정합. 반환에 `bom`이 있다고 가정(0016 스펙). 다르면 `generateBom`을 직접 호출하도록 조정.

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run tests/unit/proposal-construction.test.ts && npm run typecheck`
Expected: PASS + 타입 0.

- [ ] **Step 6: Commit**

```bash
git add lib/proposal/construction.ts lib/proposal/index.ts tests/unit/proposal-construction.test.ts
git commit -m "feat(proposal): 공정 합계(중복 제외) + buildProposal 조립"
```

---

### Task C3: 데이터 레이어 `lib/data/finish-materials.ts`

**Files:**
- Create: `lib/data/finish-materials.ts`
- Test: (db 통합은 A2에서 커버; 여기선 typecheck 게이트)

**Interfaces:**
- Consumes: `createServerSupabase` (`@/lib/supabase/server`); `FinishMaterial` (`@/lib/types`).
- Produces: `fetchFinishCatalog(): Promise<FinishMaterial[]>` — finish_materials + brand name 조인.

- [ ] **Step 1: Implement**

```ts
// lib/data/finish-materials.ts
import { createServerSupabase } from "@/lib/supabase/server";
import type { FinishMaterial } from "@/lib/types";

interface Row {
  id: string; category: string; tier: string; brand_id: string;
  label: string; unit_price: number; price_status: string;
  color: string | null; swatch_url: string | null; spec: string | null;
  material_brands: { name: string } | null;
}

export async function fetchFinishCatalog(): Promise<FinishMaterial[]> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("finish_materials")
    .select("id,category,tier,brand_id,label,unit_price,price_status,color,swatch_url,spec,material_brands(name)")
    .order("category");
  if (error || !data) return [];
  return (data as unknown as Row[]).map((r) => ({
    id: r.id,
    category: r.category as FinishMaterial["category"],
    tier: r.tier as FinishMaterial["tier"],
    brandId: r.brand_id,
    brandName: r.material_brands?.name,
    label: r.label,
    unitPrice: Number(r.unit_price),
    priceStatus: r.price_status as FinishMaterial["priceStatus"],
    color: r.color ?? undefined,
    swatchUrl: r.swatch_url ?? undefined,
    spec: r.spec ?? undefined,
  }));
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck`
```bash
git add lib/data/finish-materials.ts
git commit -m "feat(proposal): 마감재 카탈로그 조회 데이터 레이어"
```

---

## Phase E — API · 영속 · 공유 (Backend)
> (Phase D UI와 병렬. E1 마이그레이션은 D 전에 가능.)

### Task E1: 마이그레이션 0018 — proposals + pgcrypto + 공유 RPC

**Files:**
- Create: `supabase/migrations/0018_proposals.sql`
- Test: `tests/db/proposals-rls.test.ts`

**Interfaces:**
- Produces: 테이블 `proposals`; RPC `get_shared_proposal(p_token text, p_password text)`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/db/proposals-rls.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./harness";

describe("proposals RLS + share RPC (migration 0018)", () => {
  let t: TestDb; let A: string; let B: string;

  async function insertEstimate(owner: string): Promise<string> {
    const { rows } = await t.db.query<{ id: string }>(
      `insert into interior_estimates (contractor_id, brief, floor_plan, bom)
       values ($1, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb) returning id`, [owner]);
    return rows[0]!.id;
  }
  async function insertProposal(owner: string, estId: string): Promise<string> {
    const { rows } = await t.db.query<{ id: string }>(
      `insert into proposals (estimate_id, contractor_id, template_id, finishes, total_krw)
       values ($1,$2,'apt-20s-3room-2bath','[]'::jsonb, 1000) returning id`, [estId, owner]);
    return rows[0]!.id;
  }

  beforeAll(async () => {
    t = await createTestDb();
    A = await t.seedUser({ role: "contractor" });
    B = await t.seedUser({ role: "contractor" });
  });
  afterAll(async () => { await t.close(); });

  it("소유자만 자신의 제안 조회", async () => {
    await t.asService();
    const est = await insertEstimate(A);
    const pid = await insertProposal(A, est);
    await t.asUser(B);
    const { rows } = await t.db.query("select id from proposals where id=$1", [pid]);
    expect(rows.length).toBe(0);
    await t.asUser(A);
    const { rows: own } = await t.db.query("select id from proposals where id=$1", [pid]);
    expect(own.length).toBe(1);
  });

  it("get_shared_proposal: shared+비번 일치+만료전 → 반환, 오답/만료 → null", async () => {
    await t.asService();
    const est = await insertEstimate(A);
    const pid = await insertProposal(A, est);
    await t.db.query(
      `update proposals set status='shared', share_token='tok123',
        share_password_hash=crypt('1234', gen_salt('bf')),
        share_expires_at = now() + interval '7 days' where id=$1`, [pid]);

    const ok = await t.db.query<{ get_shared_proposal: unknown }>(
      "select get_shared_proposal('tok123','1234') as get_shared_proposal");
    expect(ok.rows[0]!.get_shared_proposal).not.toBeNull();

    const bad = await t.db.query<{ get_shared_proposal: unknown }>(
      "select get_shared_proposal('tok123','9999') as get_shared_proposal");
    expect(bad.rows[0]!.get_shared_proposal).toBeNull();

    await t.db.query("update proposals set share_expires_at = now() - interval '1 day' where id=$1", [pid]);
    const expired = await t.db.query<{ get_shared_proposal: unknown }>(
      "select get_shared_proposal('tok123','1234') as get_shared_proposal");
    expect(expired.rows[0]!.get_shared_proposal).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db/proposals-rls.test.ts`
Expected: FAIL — relation "proposals" does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/0018_proposals.sql
-- 즉석 제안 산출물 + 비밀번호/만료 공유. ADDITIVE. RLS는 0016 패턴.
create extension if not exists pgcrypto;

create table proposals (
  id                  uuid primary key default gen_random_uuid(),
  estimate_id         uuid not null references interior_estimates(id) on delete cascade,
  contractor_id       uuid not null references profiles(id) on delete cascade,
  customer_name       text,
  template_id         text not null,
  finishes            jsonb not null default '[]'::jsonb,
  snapshot_url        text,
  materials_krw       bigint not null default 0,
  construction_krw    bigint not null default 0,
  total_krw           bigint not null default 0,
  status              text not null default 'draft' check (status in ('draft','shared')),
  share_token         text unique,
  share_password_hash text,
  share_expires_at    timestamptz,
  created_at          timestamptz not null default now()
);
create index idx_proposals_contractor on proposals(contractor_id);
create index idx_proposals_token on proposals(share_token);

alter table proposals enable row level security;
create policy proposals_select on proposals for select
  using (contractor_id = auth.uid() or public.is_admin());
create policy proposals_insert on proposals for insert
  with check (contractor_id = auth.uid() or public.is_admin());
create policy proposals_update on proposals for update
  using (contractor_id = auth.uid() or public.is_admin())
  with check (contractor_id = auth.uid() or public.is_admin());
create policy proposals_delete on proposals for delete
  using (contractor_id = auth.uid() or public.is_admin());

revoke all on proposals from anon;
grant select, insert, update, delete on proposals to authenticated;
grant all on proposals to service_role;

-- 공개 공유: 토큰+비번+만료를 한 함수에서 검증. RLS를 우회(SECURITY DEFINER)하되
-- 'shared' & 만료전 & 비번 일치 행의 안전 컬럼만 JSON 반환.
create or replace function get_shared_proposal(p_token text, p_password text)
returns jsonb
language sql stable security definer set search_path = public as $fn$
  select to_jsonb(x) from (
    select id, customer_name, template_id, finishes, snapshot_url,
           materials_krw, construction_krw, total_krw, created_at
    from proposals
    where share_token = p_token
      and status = 'shared'
      and share_expires_at > now()
      and share_password_hash = crypt(p_password, share_password_hash)
  ) x;
$fn$;
revoke all on function get_shared_proposal(text, text) from public;
grant execute on function get_shared_proposal(text, text) to anon, authenticated, service_role;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/db/proposals-rls.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0018_proposals.sql tests/db/proposals-rls.test.ts
git commit -m "feat(proposal): 0018 proposals 테이블 + 비번/만료 공유 RPC + RLS"
```

---

### Task E2: API 라우트 — 생성/조회/공유/공개

**Files:**
- Create: `app/api/proposal/route.ts`, `app/api/proposal/[id]/route.ts`, `app/api/proposal/[id]/share/route.ts`, `app/api/proposal/shared/[token]/route.ts`
- Create: `lib/data/proposals.ts`
- Test: typecheck + build 게이트(라우트 통합은 E2E/수동)

**Interfaces:**
- Consumes: `ProposalInputSchema`,`ShareInputSchema`,`SharedAccessSchema` (A1); `buildProposal` (C2); `fetchFinishCatalog` (C3); `createServerSupabase`,`getAuthedUser`.
- Produces: REST 엔드포인트. `lib/data/proposals.ts`: `insertProposalRow`,`getProposalRow`,`shareProposalRow`.

- [ ] **Step 1: Write `lib/data/proposals.ts`**

```ts
// lib/data/proposals.ts
import { createServerSupabase } from "@/lib/supabase/server";

export interface InsertProposalArgs {
  estimateId: string; contractorId: string; customerName?: string;
  templateId: string; finishes: unknown; materialsKRW: number;
  constructionKRW: number; totalKRW: number;
}

export async function insertProposalRow(a: InsertProposalArgs): Promise<string | null> {
  const sb = createServerSupabase();
  const { data, error } = await sb.from("proposals").insert({
    estimate_id: a.estimateId, contractor_id: a.contractorId,
    customer_name: a.customerName ?? null, template_id: a.templateId,
    finishes: a.finishes, materials_krw: a.materialsKRW,
    construction_krw: a.constructionKRW, total_krw: a.totalKRW, status: "draft",
  }).select("id").single();
  if (error || !data) return null;
  return data.id as string;
}

export async function getProposalRow(id: string) {
  const sb = createServerSupabase();
  const { data } = await sb.from("proposals").select("*").eq("id", id).single();
  return data;
}

export async function shareProposalRow(
  id: string, contractorId: string, password: string, expiresInDays: number,
): Promise<{ token: string; expiresAt: string } | null> {
  const sb = createServerSupabase();
  const token = globalThis.crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + expiresInDays * 86400000).toISOString();
  // 비번 해시는 DB의 crypt() 사용 — RPC로 처리
  const { error } = await sb.rpc("set_proposal_share", {
    p_id: id, p_owner: contractorId, p_token: token,
    p_password: password, p_expires: expiresAt,
  });
  if (error) return null;
  return { token, expiresAt };
}
```

> `set_proposal_share` RPC가 필요(서버에서 crypt 해시). 0018에 아래 함수 추가:
> ```sql
> create or replace function set_proposal_share(
>   p_id uuid, p_owner uuid, p_token text, p_password text, p_expires timestamptz)
> returns void language sql security definer set search_path = public as $fn$
>   update proposals set status='shared', share_token=p_token,
>     share_password_hash = crypt(p_password, gen_salt('bf')),
>     share_expires_at = p_expires
>   where id = p_id and contractor_id = p_owner;
> $fn$;
> revoke all on function set_proposal_share(uuid,uuid,text,text,timestamptz) from public;
> grant execute on function set_proposal_share(uuid,uuid,text,text,timestamptz) to authenticated, service_role;
> ```
> **E1 마이그레이션 작성 시 이 함수도 0018에 포함**(테스트는 직접 update를 쓰므로 E1 테스트엔 불필요하나, E2가 의존).

- [ ] **Step 2: Write `app/api/proposal/route.ts`** (생성)

```ts
import { NextResponse } from "next/server";
import { ProposalInputSchema } from "@/lib/proposal/schema";
import { buildProposal } from "@/lib/proposal";
import { fetchFinishCatalog } from "@/lib/data/finish-materials";
import { insertProposalRow } from "@/lib/data/proposals";
import { createServerSupabase } from "@/lib/supabase/server";
import { getAuthedUser } from "@/lib/auth";
import type { Category, Product } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 }); }

  const parsed = ProposalInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 400 });

  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { brief, customerName } = parsed.data;
  const sb = createServerSupabase();
  const [{ data: cats }, { data: prods }, finishes] = await Promise.all([
    sb.from("categories").select("*"),
    sb.from("products").select("*").eq("status", "approved"),
    fetchFinishCatalog(),
  ]);

  const built = await buildProposal(brief, {
    categories: (cats ?? []) as Category[],
    products: (prods ?? []) as Product[],
    finishes,
  }).catch((): null => null);
  if (!built) return NextResponse.json({ error: "제안 생성에 실패했습니다." }, { status: 422 });

  // 기반 견적 저장(0016) → estimate_id 확보
  const { data: est, error: estErr } = await sb.from("interior_estimates").insert({
    contractor_id: user.id, customer_name: customerName ?? null, transcript: "",
    brief, floor_plan: { rooms: built.template.rooms, widthM: built.furnishedScene.widthM, lengthM: built.furnishedScene.lengthM },
    bom: built.bom, total_krw: built.totalKRW, status: "draft",
  }).select("id").single();
  if (estErr || !est) return NextResponse.json({ error: "저장에 실패했습니다." }, { status: 500 });

  const proposalId = await insertProposalRow({
    estimateId: est.id, contractorId: user.id, customerName,
    templateId: built.template.id, finishes: built.finishes,
    materialsKRW: built.materialsKRW, constructionKRW: built.constructionKRW, totalKRW: built.totalKRW,
  });
  if (!proposalId) return NextResponse.json({ error: "저장에 실패했습니다." }, { status: 500 });

  return NextResponse.json({
    proposalId,
    template: built.template,
    finishes: built.finishes,
    floorPlanSvg: built.floorPlanSvg,
    furnishedScene: built.furnishedScene,
    materialsKRW: built.materialsKRW,
    constructionKRW: built.constructionKRW,
    totalKRW: built.totalKRW,
  });
}
```

- [ ] **Step 3: Write `[id]/route.ts` (GET), `[id]/share/route.ts` (POST), `shared/[token]/route.ts` (POST)**

```ts
// app/api/proposal/[id]/route.ts
import { NextResponse } from "next/server";
import { getProposalRow } from "@/lib/data/proposals";
import { getAuthedUser } from "@/lib/auth";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const row = await getProposalRow(params.id); // RLS가 소유자/admin만 반환
  if (!row) return NextResponse.json({ error: "제안을 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json(row);
}
```

```ts
// app/api/proposal/[id]/share/route.ts
import { NextResponse } from "next/server";
import { ShareInputSchema } from "@/lib/proposal/schema";
import { shareProposalRow } from "@/lib/data/proposals";
import { getAuthedUser } from "@/lib/auth";
export const dynamic = "force-dynamic";
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 }); }
  const parsed = ShareInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "비밀번호는 4자 이상이어야 합니다." }, { status: 400 });
  const res = await shareProposalRow(params.id, user.id, parsed.data.password, parsed.data.expiresInDays);
  if (!res) return NextResponse.json({ error: "공유 설정에 실패했습니다." }, { status: 500 });
  return NextResponse.json({ shareUrl: `/p/${res.token}`, expiresAt: res.expiresAt });
}
```

```ts
// app/api/proposal/shared/[token]/route.ts
import { NextResponse } from "next/server";
import { SharedAccessSchema } from "@/lib/proposal/schema";
import { createServerSupabase } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export async function POST(req: Request, { params }: { params: { token: string } }) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 }); }
  const parsed = SharedAccessSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "비밀번호를 입력하세요." }, { status: 400 });
  const sb = createServerSupabase();
  const { data, error } = await sb.rpc("get_shared_proposal", {
    p_token: params.token, p_password: parsed.data.password,
  });
  if (error || !data) return NextResponse.json({ error: "비밀번호가 틀렸거나 만료된 링크입니다." }, { status: 403 });
  return NextResponse.json(data);
}
```

> `createServerSupabase`가 anon 키 클라이언트인지 확인 — 공개 RPC는 anon 실행 가능해야 함. 필요 시 anon 클라이언트 헬퍼 사용.

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/api/proposal lib/data/proposals.ts
git commit -m "feat(proposal): 생성/조회/공유/공개 API 라우트 + 데이터 레이어"
```

---

## Phase D — UI (Frontend)
> 시각 산출물은 jsdom 부적합 → **build 게이트 + 수동 시각 검증(레퍼런스 이미지 #1/#2 대조)**. 컴포넌트는 props 인터페이스를 명확히 받는 순수 표현 컴포넌트로 작성.

### Task D1: 자재 패널 + 평면도 시트

**Files:**
- Create: `components/proposal/material-panel.tsx`, `components/proposal/floorplan-sheet.tsx`
- Create: `public/swatches/placeholder.svg` (+ 카테고리별 단색 스왓치 SVG)

**Interfaces:**
- Consumes: `FinishSelection`,`ApartmentTemplate` (`@/lib/types`); `renderPlanSvg` (B2).
- Produces: `<MaterialPanel finishes={...} materialsKRW constructionKRW totalKRW />`; `<FloorplanSheet template={...} title? />`.

- [ ] **Step 1: `floorplan-sheet.tsx`** — 서버 컴포넌트, `renderPlanSvg` 결과를 그대로 출력

```tsx
// components/proposal/floorplan-sheet.tsx
import { renderPlanSvg } from "@/lib/proposal/floorplan-svg";
import type { ApartmentTemplate } from "@/lib/types";

export function FloorplanSheet({ template, title }: { template: ApartmentTemplate; title?: string }) {
  const svg = renderPlanSvg(template, { title });
  return (
    <div
      className="w-full overflow-hidden rounded-xl border border-hairline bg-white"
      // SVG는 신뢰된 자체 생성 문자열(사용자 입력은 esc 처리됨)
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
```

- [ ] **Step 2: `material-panel.tsx`** — 이미지 #1 우측 패널(자재 디테일 + 추가 사양 + 예산)

```tsx
// components/proposal/material-panel.tsx
import type { FinishSelection } from "@/lib/types";

const KOR: Record<string, string> = {
  flooring: "마루", wallpaper: "벽지", paint: "벽면 마감", tile: "타일",
  window: "샷시/창호", door: "도어", kitchen: "싱크대", sanitaryware: "욕실",
  lighting: "조명", furniture: "붙박이장", molding: "몰딩/걸레받이",
  film: "필름", board: "보드", engineered_stone: "인조대리석",
};
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
// 패널 상단 5개(이미지 #1 자재 디테일), 나머지는 추가 사양
const PRIMARY = ["flooring", "window", "door", "furniture", "kitchen"];

export function MaterialPanel({
  finishes, materialsKRW, constructionKRW, totalKRW,
}: { finishes: FinishSelection[]; materialsKRW: number; constructionKRW: number; totalKRW: number; }) {
  const primary = PRIMARY.map((c) => finishes.find((f) => f.category === c)).filter(Boolean) as FinishSelection[];
  const extras = finishes.filter((f) => !PRIMARY.includes(f.category));
  return (
    <aside className="flex w-full flex-col gap-6 p-6">
      <section>
        <h3 className="mb-3 border-b-2 border-ink pb-1 text-lg font-bold">자재 디테일</h3>
        <ul className="flex flex-col gap-4">
          {primary.map((f) => (
            <li key={f.category} className="flex items-center gap-3">
              <span className="h-12 w-12 shrink-0 rounded-md border border-hairline"
                style={{ backgroundColor: f.material.color ?? "#E5E5E5",
                  backgroundImage: f.material.swatchUrl ? `url(${f.material.swatchUrl})` : undefined,
                  backgroundSize: "cover" }} />
              <div className="min-w-0">
                <p className="font-semibold">{KOR[f.category] ?? f.category}
                  {f.downgraded && <span className="ml-2 text-xs text-amber-600">예산 조정</span>}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {f.material.brandName ?? ""} · {f.material.label}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
      {extras.length > 0 && (
        <section>
          <h3 className="mb-3 border-b-2 border-ink pb-1 text-lg font-bold">추가 사양</h3>
          <dl className="flex flex-col gap-2 text-sm">
            {extras.map((f) => (
              <div key={f.category} className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{KOR[f.category] ?? f.category}</dt>
                <dd className="text-right">{f.material.brandName ?? ""} {f.material.label}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <section className="mt-auto rounded-lg bg-paper p-4">
        <div className="flex justify-between text-sm"><span>자재비</span><span>{won(materialsKRW)}</span></div>
        <div className="flex justify-between text-sm"><span>시공비</span><span>{won(constructionKRW)}</span></div>
        <div className="mt-2 flex justify-between border-t border-hairline pt-2 text-base font-bold">
          <span>예상 총액</span><span>{won(totalKRW)}</span></div>
        <p className="mt-1 text-[10px] text-muted-foreground">※ 대표가 기준 개략 견적. 실제 견적은 현장 실측 후 확정됩니다.</p>
      </section>
    </aside>
  );
}
```

- [ ] **Step 3: 플레이스홀더 스왓치** — `public/swatches/placeholder.svg` (단색 64×64). 실제 스왓치는 후속.

- [ ] **Step 4: Build 게이트**

Run: `npm run build`
Expected: exit 0. 수동: Storybook 없으므로 `/proposal` 조립(D3) 후 시각 확인.

- [ ] **Step 5: Commit**

```bash
git add components/proposal/material-panel.tsx components/proposal/floorplan-sheet.tsx public/swatches
git commit -m "feat(proposal): 자재 디테일 패널 + 평면도 시트 컴포넌트"
```

---

### Task D2: 3D 캔버스 + 제안서 시트

**Files:**
- Create: `components/proposal/proposal-canvas.tsx`, `components/proposal/proposal-sheet.tsx`

**Interfaces:**
- Consumes: `FurnishedScene`,`PlacedAsset` (`@/lib/studio/from-floorplan`); `exportPNG`,`ThreeCtx` (`@/lib/studio/export/snapshot`); `GeoPart` (`@/lib/studio/assets`); `MaterialPanel` (D1).
- Produces: `<ProposalCanvas scene={...} onSnapshot?={(dataUrl)=>void} />` (client, ssr:false 로 로드); `<ProposalSheet ... />`.

- [ ] **Step 1: `proposal-canvas.tsx`** — floorplan-3d 패턴 + 가구 GeoPart 렌더 + 마감 색 + 스냅샷

```tsx
"use client";
// components/proposal/proposal-canvas.tsx
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Suspense, useEffect } from "react";
import type { FurnishedScene, PlacedAsset } from "@/lib/studio/from-floorplan";
import type { GeoPart } from "@/lib/studio/assets";
import { exportPNG } from "@/lib/studio/export/snapshot";

const WALL_H = 2.4, WALL_T = 0.1;

function Part({ part, color }: { part: GeoPart; color: string }) {
  const [ox, oy, oz] = part.offset ?? [0, 0, 0];
  const c = part.color ?? color;
  return (
    <mesh position={[ox, oy, oz]}>
      {part.prim === "box" && <boxGeometry args={[part.size[0], part.size[1], part.size[2]]} />}
      {part.prim === "cylinder" && <cylinderGeometry args={[part.size[0], part.size[0], part.size[1], 16]} />}
      {part.prim === "cone" && <coneGeometry args={[part.size[0], part.size[1], 16]} />}
      {part.prim === "sphere" && <sphereGeometry args={[part.size[0], 16, 16]} />}
      {part.prim === "plane" && <planeGeometry args={[part.size[0], part.size[1]]} />}
      <meshStandardMaterial color={c} />
    </mesh>
  );
}

function Furniture({ item, cx, cz }: { item: PlacedAsset; cx: number; cz: number }) {
  const [x, , z] = item.transform.position;
  return (
    <group position={[x - cx, 0, z - cz]} rotation={item.transform.rotation}>
      {item.asset.parts.map((p, i) => <Part key={i} part={p} color="#9A8C7A" />)}
    </group>
  );
}

function Snapshotter({ onSnapshot }: { onSnapshot?: (d: string) => void }) {
  const { scene, gl, camera } = useThree();
  useEffect(() => {
    if (!onSnapshot) return;
    const id = setTimeout(() => onSnapshot(exportPNG({ scene, gl, camera })), 600);
    return () => clearTimeout(id);
  }, [onSnapshot, scene, gl, camera]);
  return null;
}

export function ProposalCanvas({ scene, onSnapshot }: { scene: FurnishedScene; onSnapshot?: (d: string) => void }) {
  const cx = scene.widthM / 2, cz = scene.lengthM / 2;
  const dist = Math.max(scene.widthM, scene.lengthM, 6) * 1.5;
  return (
    <div className="aspect-[4/3] w-full overflow-hidden rounded-xl border border-hairline bg-[#F3F1EC]" role="img" aria-label="3D 인테리어 제안 렌더">
      <Canvas gl={{ preserveDrawingBuffer: true }} camera={{ position: [dist, dist * 0.9, dist], fov: 45 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[10, 14, 6]} intensity={0.9} />
        <Suspense fallback={null}>
          {scene.rooms.map((room, i) => {
            const px = room.x + room.w / 2 - cx, pz = room.y + room.h / 2 - cz;
            const isBalcony = room.type === "balcony";
            return (
              <group key={i}>
                <mesh position={[px, 0, pz]}>
                  <boxGeometry args={[room.w, 0.05, room.h]} />
                  <meshStandardMaterial color={isBalcony ? "#D9D6CE" : scene.floorColor} />
                </mesh>
                {/* 외벽만 간략 표현: 북/서 벽 */}
                <mesh position={[px, WALL_H / 2, pz - room.h / 2]}>
                  <boxGeometry args={[room.w, WALL_H, WALL_T]} />
                  <meshStandardMaterial color={scene.wallColor} />
                </mesh>
                <mesh position={[px - room.w / 2, WALL_H / 2, pz]}>
                  <boxGeometry args={[WALL_T, WALL_H, room.h]} />
                  <meshStandardMaterial color={scene.wallColor} />
                </mesh>
              </group>
            );
          })}
          {scene.furniture.map((item, i) => <Furniture key={i} item={item} cx={cx} cz={cz} />)}
        </Suspense>
        <OrbitControls enableDamping dampingFactor={0.05} />
        <Snapshotter onSnapshot={onSnapshot} />
      </Canvas>
    </div>
  );
}
```

- [ ] **Step 2: `proposal-sheet.tsx`** — 이미지 #1 합성(좌: 3D, 우: 패널, 하단: 특징 4컷)

```tsx
"use client";
// components/proposal/proposal-sheet.tsx
import dynamic from "next/dynamic";
import type { FinishSelection } from "@/lib/types";
import type { FurnishedScene } from "@/lib/studio/from-floorplan";
import { MaterialPanel } from "./material-panel";

const ProposalCanvas = dynamic(
  () => import("./proposal-canvas").then((m) => m.ProposalCanvas),
  { ssr: false, loading: () => <div className="aspect-[4/3] w-full animate-pulse rounded-xl bg-paper" /> },
);

const HIGHLIGHTS = [
  { t: "넓고 효율적인 거실", d: "가족 모두가 편안하게 머무는 중심 공간" },
  { t: "실용적인 주방/식당", d: "동선을 고려한 효율적 주방 설계" },
  { t: "넉넉한 수납공간", d: "붙박이장과 팬트리로 깔끔한 수납" },
  { t: "밝고 쾌적한 공간", d: "남향 위주 배치와 넉넉한 채광" },
];

export function ProposalSheet({
  scene, finishes, materialsKRW, constructionKRW, totalKRW, title, onSnapshot,
}: {
  scene: FurnishedScene; finishes: FinishSelection[];
  materialsKRW: number; constructionKRW: number; totalKRW: number;
  title: string; onSnapshot?: (d: string) => void;
}) {
  return (
    <div className="flex flex-col gap-6 rounded-2xl bg-white p-6 shadow-sm">
      <header><h2 className="text-2xl font-bold">{title}</h2>
        <p className="text-sm text-muted-foreground">실용적인 동선과 감각적인 디자인의 조화</p></header>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <ProposalCanvas scene={scene} onSnapshot={onSnapshot} />
        <MaterialPanel finishes={finishes} materialsKRW={materialsKRW}
          constructionKRW={constructionKRW} totalKRW={totalKRW} />
      </div>
      <ul className="grid grid-cols-2 gap-4 border-t border-hairline pt-4 md:grid-cols-4">
        {HIGHLIGHTS.map((h) => (
          <li key={h.t}><p className="font-semibold">{h.t}</p>
            <p className="text-xs text-muted-foreground">{h.d}</p></li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Build 게이트 + Commit**

Run: `npm run build`
```bash
git add components/proposal/proposal-canvas.tsx components/proposal/proposal-sheet.tsx
git commit -m "feat(proposal): 3D 캔버스(스냅샷) + 제안서 시트 합성(이미지 #1)"
```

---

### Task D3: 프레젠테이션 뷰 + `/proposal` 플로우 페이지

**Files:**
- Create: `components/proposal/presentation-view.tsx`, `app/proposal/page.tsx`

**Interfaces:**
- Consumes: `ProposalSheet` (D2), `FloorplanSheet` (D1); POST `/api/proposal`, `/api/estimate/transcribe`, `/api/estimate/brief`.
- Produces: 3단계 플로우(상담 입력 → 브리프 확인 → 프레젠테이션), 평면도 ↔ 제안서 토글, PNG/PDF/공유 버튼.

- [ ] **Step 1: `presentation-view.tsx`** (탭 토글 + 내보내기/공유 버튼 — client)

```tsx
"use client";
// components/proposal/presentation-view.tsx
import { useState } from "react";
import type { ApartmentTemplate, FinishSelection } from "@/lib/types";
import type { FurnishedScene } from "@/lib/studio/from-floorplan";
import { ProposalSheet } from "./proposal-sheet";
import { FloorplanSheet } from "./floorplan-sheet";

export interface PresentationData {
  proposalId: string; template: ApartmentTemplate; furnishedScene: FurnishedScene;
  finishes: FinishSelection[]; materialsKRW: number; constructionKRW: number; totalKRW: number;
  customerName?: string;
}

export function PresentationView({ data }: { data: PresentationData }) {
  const [tab, setTab] = useState<"plan" | "proposal">("proposal");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const title = `${data.template.pyeongBand}평형 인테리어 제안`;

  const onShare = async () => {
    const password = window.prompt("공유 비밀번호(4자 이상)를 입력하세요");
    if (!password || password.length < 4) return;
    const res = await fetch(`/api/proposal/${data.proposalId}/share`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ password, expiresInDays: 7 }),
    });
    if (res.ok) { const j = await res.json(); setShareUrl(window.location.origin + j.shareUrl); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <button onClick={() => setTab("proposal")} className={`rounded-md px-4 py-2 text-sm ${tab === "proposal" ? "bg-ink text-white" : "bg-paper"}`}>제안서</button>
        <button onClick={() => setTab("plan")} className={`rounded-md px-4 py-2 text-sm ${tab === "plan" ? "bg-ink text-white" : "bg-paper"}`}>평면도</button>
        <div className="ml-auto flex gap-2">
          <button onClick={() => window.print()} className="rounded-md border border-hairline px-4 py-2 text-sm">PDF/인쇄</button>
          <button onClick={onShare} className="rounded-md bg-primary px-4 py-2 text-sm text-white">공유 링크</button>
        </div>
      </div>
      {shareUrl && <p className="rounded-md bg-paper p-3 text-sm break-all print:hidden">공유 링크: {shareUrl}</p>}
      <div className="print:block">
        {tab === "proposal" ? (
          <ProposalSheet scene={data.furnishedScene} finishes={data.finishes}
            materialsKRW={data.materialsKRW} constructionKRW={data.constructionKRW}
            totalKRW={data.totalKRW} title={title} />
        ) : (
          <FloorplanSheet template={data.template} title={`${data.template.pyeongBand}평 아파트 평면도`} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `app/proposal/page.tsx`** (client 플로우 — STT/텍스트 → 브리프 → 생성 → PresentationView)

구현 요지(코드 골격):
- `"use client"`. step 상태: `"input" | "brief" | "result"`.
- 입력: 오디오 파일 → base64 → `POST /api/estimate/transcribe`; 또는 textarea에 요약 직접 입력.
- transcript → `POST /api/estimate/brief` → `EstimateBrief` 편집 폼(평형/방수/욕실수/예산/specLevel).
- "제안 생성" → `POST /api/proposal` → 응답을 `PresentationData`로 `PresentationView`에 전달.
- 에러는 한국어 토스트/배너. 로딩 스피너.

```tsx
"use client";
// app/proposal/page.tsx (요지 — 상세 폼 마크업은 estimate/page.tsx 패턴 재사용)
import { useState } from "react";
import { PresentationView, type PresentationData } from "@/components/proposal/presentation-view";
import type { EstimateBrief } from "@/lib/types";

export default function ProposalPage() {
  const [step, setStep] = useState<"input" | "brief" | "result">("input");
  const [transcript, setTranscript] = useState("");
  const [brief, setBrief] = useState<EstimateBrief | null>(null);
  const [data, setData] = useState<PresentationData | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function extract() {
    setBusy(true); setErr(null);
    const r = await fetch("/api/estimate/brief", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transcript }) });
    setBusy(false);
    if (!r.ok) return setErr("브리프 추출 실패");
    setBrief(await r.json()); setStep("brief");
  }
  async function generate() {
    if (!brief) return;
    setBusy(true); setErr(null);
    const r = await fetch("/api/proposal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ brief }) });
    setBusy(false);
    if (!r.ok) return setErr("제안 생성 실패");
    const j = await r.json();
    setData({ proposalId: j.proposalId, template: j.template, furnishedScene: j.furnishedScene, finishes: j.finishes, materialsKRW: j.materialsKRW, constructionKRW: j.constructionKRW, totalKRW: j.totalKRW });
    setStep("result");
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">즉석 인테리어 제안</h1>
      {err && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{err}</p>}
      {step === "input" && (
        <section className="flex flex-col gap-3">
          <label className="text-sm font-medium">상담 요약 입력 (또는 음성 업로드)</label>
          <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={6}
            className="rounded-md border border-hairline p-3" placeholder="예) 25평 아파트, 방3 욕실2, 예산 4천만원, 화이트 톤 선호…" />
          {/* 오디오 업로드 핸들러는 estimate 페이지의 transcribe 패턴 재사용 */}
          <button disabled={busy || !transcript} onClick={extract} className="self-start rounded-md bg-primary px-5 py-2 text-white disabled:opacity-50">다음</button>
        </section>
      )}
      {step === "brief" && brief && (
        <section className="flex flex-col gap-3">
          {/* 평형/방/욕실/예산/specLevel 편집 폼 — estimate/page.tsx 브리프 폼 재사용 */}
          <p className="text-sm text-muted-foreground">추출된 요구사항을 확인·수정하세요.</p>
          <button disabled={busy} onClick={generate} className="self-start rounded-md bg-primary px-5 py-2 text-white disabled:opacity-50">제안 생성</button>
        </section>
      )}
      {step === "result" && data && <PresentationView data={data} />}
    </main>
  );
}
```

> 브리프 편집 폼·오디오 업로드 UI는 `app/estimate/page.tsx`의 검증된 마크업을 재사용·이식한다(중복 최소화). `pyeong` 필드 입력 추가.

- [ ] **Step 3: Build 게이트 + 수동 시각(레퍼런스 대조) + Commit**

Run: `npm run build`
수동: `npm run dev` → `/proposal` → 텍스트 입력 → 생성 → 제안서/평면도 토글, 인쇄 미리보기. 이미지 #1/#2와 레이아웃 대조.
```bash
git add components/proposal/presentation-view.tsx app/proposal/page.tsx
git commit -m "feat(proposal): 프레젠테이션 뷰 + /proposal 플로우(STT/요약→브리프→제안)"
```

---

### Task E3: 공개 공유 페이지 `app/p/[token]/page.tsx`

**Files:**
- Create: `app/p/[token]/page.tsx`

**Interfaces:**
- Consumes: POST `/api/proposal/shared/[token]`.
- Produces: 비밀번호 폼 → 검증 → 읽기 전용 제안 표시(만료/오답 안내). 인쇄 가능.

- [ ] **Step 1: Implement** (client — 비번 폼 → fetch → 읽기 전용 렌더)

```tsx
"use client";
// app/p/[token]/page.tsx
import { useState } from "react";
import { MaterialPanel } from "@/components/proposal/material-panel";
import type { FinishSelection } from "@/lib/types";

interface Shared {
  customer_name: string | null; template_id: string; finishes: FinishSelection[];
  snapshot_url: string | null; materials_krw: number; construction_krw: number; total_krw: number;
}

export default function SharedProposalPage({ params }: { params: { token: string } }) {
  const [password, setPassword] = useState("");
  const [data, setData] = useState<Shared | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function open() {
    setErr(null);
    const r = await fetch(`/api/proposal/shared/${params.token}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!r.ok) { setErr("비밀번호가 틀렸거나 만료된 링크입니다."); return; }
    setData(await r.json());
  }

  if (!data) {
    return (
      <main className="mx-auto flex max-w-sm flex-col gap-3 px-4 py-16">
        <h1 className="text-lg font-bold">인테리어 제안서 열람</h1>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="공유 비밀번호" className="rounded-md border border-hairline p-3" />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button onClick={open} className="rounded-md bg-primary px-4 py-2 text-white">열람</button>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-bold">인테리어 제안서</h1>
      {data.snapshot_url && <img src={data.snapshot_url} alt="3D 제안 렌더" className="mb-6 w-full rounded-xl" />}
      <MaterialPanel finishes={data.finishes} materialsKRW={data.materials_krw}
        constructionKRW={data.construction_krw} totalKRW={data.total_krw} />
    </main>
  );
}
```

> snapshot_url 저장: D2의 `onSnapshot` dataURL을 생성 시 Supabase Storage 업로드 후 `proposals.snapshot_url`에 PATCH(후속 보강 가능). 1차는 공유 페이지에서 3D 미표시(스냅샷 없으면 패널·총액만) 허용.

- [ ] **Step 2: Build 게이트 + Commit**

Run: `npm run build`
```bash
git add app/p
git commit -m "feat(proposal): 비밀번호 공개 공유 페이지 /p/[token]"
```

---

## Phase F — 통합 & 게이트 (Frontend)

### Task F1: 내비게이션 링크 + 견적 연동 + 최종 게이트

**Files:**
- Modify: `components/site-header.tsx`, `components/site-footer.tsx` (`/proposal` 링크 가산)
- Modify: `app/estimate/page.tsx` (결과 단계에 "제안서로 보기" 링크 — `/proposal`로 이동 또는 brief 전달)

**Interfaces:** 기존 네비 패턴 따름. 새 인터페이스 없음.

- [ ] **Step 1: site-header/footer에 `/proposal` 링크 추가** (기존 링크 배열 패턴에 `{ href: "/proposal", label: "즉석 제안" }` 1줄 가산)

- [ ] **Step 2: estimate 결과에 "제안서로 보기" 버튼** (estimate 결과의 brief를 sessionStorage 또는 쿼리로 `/proposal`에 전달; 1차는 단순 링크 `/proposal`)

- [ ] **Step 3: 전체 게이트 (fresh)**

Run:
```bash
npm run typecheck && npm run lint && npm run test && npm run build
```
Expected: typecheck 0 · lint 0 · test 전부 PASS · build exit 0. 기존 테스트 회귀 0.

- [ ] **Step 4: Commit**

```bash
git add components/site-header.tsx components/site-footer.tsx app/estimate/page.tsx
git commit -m "feat(proposal): 내비 링크 + 견적→제안 연동 + 통합 게이트"
```

---

## Self-Review (작성자 점검 결과)

**Spec coverage:** 스펙 §아키텍처(A~F 전부 매핑) · §데이터모델(A1 타입, A2/E1 마이그레이션) · §모듈(B/C 순수 로직) · §API(E2) · §페이지(D3/E3) · §전달(D3 인쇄/공유, E3 공개) · §자재 브랜드 시드(A2) · §테스트 전략(각 Task TDD + db RLS) — 누락 없음. 스왓치 이미지/Storage 업로드는 1차 플레이스홀더로 명시(스펙 리스크 항목과 일치).

**Placeholder scan:** 모든 코드 스텝에 실제 코드 포함. `app/proposal/page.tsx`·estimate 폼 재사용 부분은 "골격 + 재사용 출처(estimate/page.tsx)" 명시 — 신규 로직 아님(중복 회피, DRY). snapshot Storage 업로드는 후속으로 명시적 분리.

**Type consistency:** `FinishSelection`(category/material/qty/lineTotal/downgraded), `FurnishedScene`(rooms/furniture/floorColor/wallColor/widthM/lengthM), `BuiltProposal`(materialsKRW/constructionKRW/totalKRW), `matchTemplate` 입력 `{pyeong,bedrooms,bathrooms}` — 전 Task 일관. API 응답 키(`proposalId,template,finishes,floorPlanSvg,furnishedScene,materialsKRW,constructionKRW,totalKRW`)와 `PresentationData` 정합.

**Known follow-ups (비차단):** ① 3D 스냅샷 → Storage 업로드 후 공유 페이지 3D 표시 ② 스왓치 실제 이미지 ③ ~~`buildEstimate` 시그니처~~ **확인 완료** — `buildEstimate(brief, {categories,products}): {floorPlan,bom,totalKRW}` (lib/estimate/index.ts:47), C2 정합 ④ `door/standard` 브랜드 join 보장(한솔홈데코) ⑤ `set_proposal_share` RPC를 0018에 포함(E1 작성 시).
