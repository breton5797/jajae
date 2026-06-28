# 인테리어 견적서 자동 생성 — Implementation Plan

> 스펙: `docs/superpowers/specs/2026-06-29-jajae-interior-estimate-design.md` (승인됨 2026-06-29).
> 실행: team-orchestrator (Lead + Backend/Frontend/QA). 각 에이전트는 **스펙을 먼저 읽을 것**.

## Global Constraints

- 기존 컨벤션 준수: 순수 로직 `lib/*`, IO는 API 라우트, AI/외부는 **키 없으면 폴백**(기존 `lib/ai-quote/drawing.ts` 패턴).
- 불변 패턴(spread, no mutation), `console.log` 금지, 하드코딩 시크릿 금지, zod 경계 검증.
- 게이트: `npm run typecheck`(0) · `npm run lint`(0) · `npm test`(전부) · `npm run build`(exit 0).
- 파일 소유권(충돌 방지): **Backend** = `lib/stt/*`,`lib/estimate/*`,`lib/floorplan/*`,`lib/env.ts`,`lib/types.ts`,`app/api/estimate/**`,`supabase/migrations/0016_*` · **Frontend** = `app/estimate/**`,`components/estimate/**`,`components/site-header.tsx`,`components/site-footer.tsx` · **QA** = `tests/**`.
- 회귀 금지: 기존 페이즈 테스트/페이지 무손상.

---

## Phase A — Foundation (Backend, 선행 필수 / 나머지 전부 차단)

- **A1** `lib/types.ts` 가산: `EstimateRoom`,`EstimateBrief`,`FloorPlanRoom`,`FloorPlan`,`InteriorEstimate` (스펙 데이터모델). 기존 타입 변경 금지.
- **A2** `lib/estimate/schema.ts`: zod `TranscribeSchema`,`BriefSchema`,`EstimateInputSchema`. `SpecLevel`/`ProjectType`/`RoomType` 재사용.
- **A3** `lib/env.ts`: `openaiApiKey(): string | null` lazy getter 가산. `.env.example`에 `OPENAI_API_KEY=` 추가.
- **A4** `lib/stt/whisper.ts`: `transcribeAudio(b64, mime): Promise<string|null>` — 키 없으면 `null`(→수동 폴백). 네트워크 없는 테스트는 키 없음 경로.
- **A5** `lib/estimate/brief.ts`: `extractBrief(transcript): Promise<EstimateBrief>` — Claude(JSON 추출 패턴) + **결정론 키워드 폴백**(평형/방개수/스펙 추정). zod 검증.
- **A6** `app/api/estimate/transcribe/route.ts`, `app/api/estimate/brief/route.ts` — parse→safeParse→호출→한국어 에러.

검증: `npm run typecheck`, brief 폴백 단위테스트(QA가 A5 직후 착수 가능).

---

## Phase B — 평면도 + 자재 조립 (Backend, A 이후)

- **B1** `lib/floorplan/layout.ts`: `layoutRooms(rooms: EstimateRoom[]): FloorPlan` **순수 함수** — 면적 내림차순 행(shelf) 패킹, 좌표·bounds 산출, 치수 없으면 `sqrt(area)` 정사각 근사. (테스트 핵심)
- **B2** `lib/estimate/index.ts`: `buildEstimate(brief, catalog): {floorPlan, bom, totalKRW}` — `roomsToBomInput`+`generateBom`(또는 `bomFromRooms`)+`matchBomToProducts` 재사용, 총액 합산.
- **B3** `app/api/estimate/route.ts` (POST): `{brief, customerName?}` → 조립 → `interior_estimates` insert(서버) → `{id, floorPlan, bom, totalKRW}`. `app/api/estimate/[id]/route.ts` (GET): RLS 소유자/admin.

검증: 레이아웃 단위테스트, typecheck.

---

## Phase C — 2D/3D + 위저드 (Frontend, B의 타입/응답 형태 이후)

- **C1** `components/estimate/floorplan-2d.tsx`: `FloorPlan`→SVG(서버 컴포넌트). 방 사각형+라벨+치수.
- **C2** `components/estimate/floorplan-3d.tsx`: `@react-three/fiber`+`drei`, 벽 압출(높이 2.4m)+자재 색/텍스처+OrbitControls. `next/dynamic` `ssr:false`. reduced-motion 시 정적.
- **C3** `app/estimate/page.tsx`: 4단계 위저드(업로드/전사→브리프 편집→결과(2D+3D+자재+총액)→저장). TanStack Query로 API 호출, Zustand 불필요 시 로컬 상태.
- **C4** `components/site-header.tsx`/`site-footer.tsx`: `/estimate` 링크 가산(기존 NAV/컬럼 패턴, 기능 불변).

의존성: `three`,`@react-three/fiber`,`@react-three/drei` 추가(Backend가 package.json 1회 추가 후 Frontend 사용 — 충돌 방지 위해 **A3에서 Backend가 deps도 추가**).
검증: 2D jsdom 컴포넌트 테스트, build 게이트(3D), 수동 시각.

---

## Phase D — 영속화 + 검증 (Backend 마이그레이션 + QA)

- **D1** `supabase/migrations/0016_interior_estimate.sql` (ADDITIVE): `interior_estimates` 테이블 + RLS(contractor 본인/admin/service_role, 0002·0012 패턴) + grants.
- **D2** QA: `tests/unit/floorplan.test.ts`(레이아웃), `tests/unit/estimate-brief.test.ts`(폴백), `tests/db/estimate-rls.test.ts`(PGlite 소유자 격리), `tests/components/estimate/*`(2D).
- **D3** 전체 게이트 + 기존 회귀 확인(`git diff main --stat` 범위 점검).

---

## 의존성 그래프

```
A(types/schema/env/stt/brief/api) ──▶ B(floorplan/estimate/api) ──▶ C(2D/3D/wizard)
            │                                  │
            └──────────────▶ D1(migration) ◀───┘
                              D2/D3(tests/verify) ◀── B,C
```

## DoD (스펙 §수용기준)

1. 오디오/수동 전사 → 브리프 추출·편집 2. 브리프→평면도+3D+자재+총액 3. `interior_estimates` 저장·RLS
4. 키 미설정 폴백 통과 5. 4게이트 통과·회귀 없음
