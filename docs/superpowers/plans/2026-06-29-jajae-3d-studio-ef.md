# 3D 스튜디오 (Phase E/F: AI 실사 프리뷰 + 저장/로드 + 견적 시드) — Implementation Plan

> 스펙: `docs/superpowers/specs/2026-06-29-jajae-3d-studio-design.md` (승인됨 2026-06-29, 범위 A~F).
> 선행: Phase A~D 머지 완료(PR #11, `f97b8d2`). 이번 범위 = **스펙 Phase E + F**, 단일 PR.
> 결정(2026-06-29): ① E→F 한 번에. ② AI 렌더는 기존 `lib/proposal/ai-render.ts` 파이프라인 **재사용·일반화**(OpenAI gpt-image-1, 키 검증 완료).

## 현재 상태(머지본 기준)
- AI 렌더 코어(`lib/proposal/ai-render.ts`)는 이미 provider-agnostic(`STUDIO_RENDER_API_KEY`→`OPENAI_API_KEY` 폴백) — **제안서에만** 연결. 스튜디오 에디터엔 AI 버튼/프리뷰 **없음**.
- `/studio` nav 링크(헤더·푸터)는 **이미 존재**. ⇒ 이번 범위 제외.
- `lib/studio/from-floorplan.ts`는 제안서용 `FurnishedScene`을 만듦 — 에디터용 `DesignScene`(SceneObject[]) 변환기는 **없음**.
- `design_scenes` 테이블·API **없음**. 다음 마이그레이션 번호 = **0021**.

## Global Constraints
- 신규 npm 의존성 **없음**. AI 렌더는 기존 OpenAI img2img 경로 재사용.
- 불변 패턴(씬 조작은 새 객체 반환), `console.log` 금지, 하드코딩 시크릿 금지, zod 경계 검증.
- API 라우트 컨벤션: `export const dynamic = "force-dynamic"`, `getAuthedUser()`(@/lib/auth) + `createServerSupabase()`(@/lib/supabase/server), `NextResponse.json`.
- three/r3f 클라이언트 전용(`"use client"` + `next/dynamic ssr:false`).
- **게이트**: `npm run typecheck`(0) · `npm run lint`(0) · `npm test`(전부) · `npm run build`(exit 0). **기존 회귀 0**(특히 proposal AI 렌더 테스트).
- 파일 소유권: **Backend** = `lib/render/*`, `lib/studio/{ai-render,from-estimate,schema}.ts`, `lib/proposal/ai-render.ts`(리팩터), `app/api/studio/**`, `supabase/migrations/0021_*.sql` · **Frontend** = `app/studio/**`, `components/studio/**`, 견적 결과 버튼 · **QA** = `tests/**`.

---

## Phase E — 스튜디오 AI 실사 프리뷰

- **E1**(Backend) 공유 코어 추출 — `lib/render/image-edit.ts`: 기존 `lib/proposal/ai-render.ts`의 `resolveProvider`·`openaiEdit`·`RenderResult`·`renderAvailable`를 이동(behavior-preserving). `lib/proposal/ai-render.ts`는 interior/floorplan 프롬프트만 유지하고 공유 코어를 import(공개 API·동작 불변 — **proposal 테스트 회귀 0** 필수).
- **E2**(Backend) `lib/studio/ai-render.ts`: `STUDIO_DOMAIN_PROMPTS: Record<StudioDomain,string>`(인테리어/건축/조경/웹툰배경/무대/간판/가구 7종) + `renderStudioPhotoreal(imageDataUrl, domain): Promise<RenderResult>` — 공유 코어 호출. 키 없으면 mock(원본 스냅샷 + "AI 렌더 미설정" note).
- **E3**(Backend) `app/api/studio/render/route.ts`: `POST {imageBase64, domain}` → `{imageUrl, provider, mock, note?}`; `GET` 가용성(`{available}`). zod(`StudioRenderSchema`) 경계 검증, `maxDuration = 300`. (proposal/render 라우트 컨벤션 동일.)
- **E4**(Frontend) `components/studio/ai-preview.tsx`(신규): 결과 이미지 + provider note + "다운로드"·"닫기". 생성 중 로딩(90~165초 안내). `components/studio/toolbar.tsx`에 **"AI 실사"** 버튼 추가. `app/studio/page.tsx`: 캔버스 PNG 스냅샷(`exportPNG(ctx)`)→`/api/studio/render` POST→프리뷰 표시. 키 미설정 시 폴백 표시.
- 검증(E): `tests/unit/studio-ai-render.test.ts` — 도메인→프롬프트 매핑, **키 부재 폴백**(mock=true·원본 반환), 공유 코어 회귀(proposal 동작 불변). build.

## Phase F — 저장/로드 + 견적 시드

- **F1**(Backend) `supabase/migrations/0021_design_scenes.sql` (ADDITIVE, 0016/0018 패턴):
  `design_scenes`(`id uuid pk default gen_random_uuid()`, `owner_id uuid not null → profiles(id)`, `domain text check(7종)`, `name text not null`, `scene jsonb not null`, `thumbnail_url text null`, `created_at`, `updated_at`). RLS: owner select/insert/update/delete, admin all, service_role, **`revoke ... from anon`**.
- **F2**(Backend) zod + API:
  - `lib/studio/schema.ts`에 `SaveScenePayloadSchema`({`name`, `domain`, `scene`(DesignSceneSchema), `thumbnailUrl?`}) 추가.
  - `app/api/studio/scenes/route.ts`: `POST`(auth→insert owner_id=user.id, `{id}` 반환), `GET`(본인 씬 목록: id/name/domain/thumbnail_url/created_at).
  - `app/api/studio/scenes/[id]/route.ts`: `GET`(단건 로드, RLS), `DELETE`(본인 삭제).
- **F3**(Backend) `lib/studio/from-estimate.ts`: `floorPlanToDesignScene(floorPlan): DesignScene` — **순수**. 견적 `floor_plan`(룸 배열)→ 룸별 floor/wall SceneObject + 룸 타입별 기본 가구(ENRICH_BY_TYPE 재사용)→ SceneObject(assetId·transform·color). 결정론 id(`obj-N`). (스펙 §from-floorplan의 `FloorPlan→DesignScene` 의도 구현 — 기존 FurnishedScene 변환기와 별개.)
- **F4**(Frontend) `app/studio/page.tsx` 와이어링:
  - **저장**: toolbar "저장" → 이름 입력 → `POST /api/studio/scenes`. 비로그인 시 로그인 안내. (thumbnail은 MVP에서 null — 스냅샷 업로드는 후속.)
  - **불러오기**: `components/studio/scene-library.tsx`(신규) — `GET scenes` 목록 → 선택 → `GET scenes/[id]` → `setScene`. toolbar "내 디자인" 버튼.
  - **견적 시드**: `?from=estimate&id=...` → `GET /api/estimate/[id]` → `floorPlanToDesignScene(floorPlan)` → 초기 씬.
- **F5**(Frontend) 견적/제안 결과에 **"3D 스튜디오에서 편집"** 버튼 → `/studio?from=estimate&id=<id>`.
- 검증(F): `tests/unit/studio-from-estimate.test.ts`(룸→오브젝트·색·결정론 id), `tests/db/design-scenes-rls.test.ts`(PGlite: owner 격리·anon revoke·admin), schema 테스트(SaveScenePayload). db RLS + build.

---

## 의존성 그래프
```
E1(공유코어) → E2(studio ai-render) → E3(API) → E4(UI)
F1(0021) → F2(scenes API) ─┐
F3(from-estimate) ─────────┼→ F4(page 와이어링) → F5(견적 버튼)
                  QA(E4테스트·F RLS·converter·schema) ← E2,F1,F2,F3
```
E와 F는 상호 독립(병렬 가능). E4·F4는 같은 `app/studio/page.tsx` 편집 → 순차 또는 신중 머지.

## 가정 / 열린 항목
- **견적 `floor_plan` 구조**: `interior_estimates.floor_plan` jsonb(룸 배열). F3 변환기는 이 구조 기준 — 실제 필드는 구현 시 `lib/types` FloorPlan으로 확정.
- **썸네일**: 0021에 `thumbnail_url` 컬럼은 두되, 값 채우기(스냅샷→Storage 업로드, `proposal-snapshots` 버킷 패턴)는 **후속**. MVP 목록은 도메인+이름+날짜.
- **AI 비용/시간**: 재사용 경로라 1회 90~165초 + 비용. 스튜디오는 **수동 버튼**(auto-run 아님)이라 제안서보다 비용 통제 쉬움.

## DoD (스펙 §수용기준 3·4)
1. `/studio`에서 **AI 실사 프리뷰**(키 있으면 실사, 없으면 원본 폴백).
2. 견적 평면도 → 스튜디오 **시드**, 씬 **저장/로드**(RLS 격리).
3. 키 미설정에도 빌드·테스트 통과, **4게이트 + 회귀 0**(proposal AI 렌더 포함).
