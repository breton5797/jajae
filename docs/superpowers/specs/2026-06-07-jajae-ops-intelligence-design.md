# 자재(Jajae) Phase 2 — 운영 인텔리전스 업그레이드 — Design Spec

- Date: 2026-06-07
- Status: Approved-to-proceed (autonomous via `/goal`)
- Builds on: `2026-06-07-jajae-b2b-materials-platform-design.md` (Phase 1 MVP)

## Goal

Catalog/commerce MVP → intelligence-driven contractor ops tool, sticky beyond commerce:
(1) drawing-based AI BOM, (2) cross-supplier price intelligence + history, (3) 현장-level
budget & schedule workspace, (4) dashboard widgets. Additive, must NOT break Phase-1 E2E.

## New modules (boundary-enforced)

- `lib/ai-quote/drawing.ts` + `rooms-bom.ts` — EXTEND ai-quote: floor plan → rooms → reuse
  `generateBomDeterministic` (no rewrite). Claude **vision** when key present; manual rooms fallback.
- `lib/pricing` — `comparePrices` (per-spec, cross-supplier stats), `buildPriceTrend`
  (from order_items + price_history), `lowestPriceAlerts`. Pure; depends on lib/types only.
- `lib/projects` — `computeSiteBudget` (budget vs actual), `buildOrderTimeline`,
  `scheduleProgress`. Pure; depends on lib/types only.

## DB changes (migration 0004 — data-preserving)

- `ALTER TABLE sites ADD COLUMN budget numeric default 0, start_date date, end_date date`
  (additive → existing rows preserved).
- New tables: `drawings`(contractor_id, site_id?, file_path, file_type, status, rooms jsonb,
  bom jsonb), `site_documents`(site_id, contractor_id, name, file_path, file_type),
  `site_tasks`(site_id, contractor_id, title, phase, planned_date, done),
  `price_history`(product_id, supplier_id, unit_price, recorded_at).
- RLS: contractor owns drawings/site_documents/site_tasks (via contractor_id); price_history
  public-read (price transparency), supplier/admin write. Grants for anon/authenticated.
- Storage (separate `supabase/storage.sql`, not loaded by PGlite harness): buckets `drawings`,
  `site-docs` + storage RLS. App uses `lib/storage.ts` wrapper at runtime.

## Test substrate

- Harness now loads ALL `supabase/migrations/*.sql` (so 0004 auto-applies in PGlite).
- New tests: pricing, projects, rooms-bom (unit); new-table RLS isolation; **migration
  preserves data** (seed intact + new columns/tables exist); drawing→BOM→cart E2E extension.
- Phase-1 suite must stay green.

## UI (Korean, mobile-first, #1A56DB)

- `/ai-quote` gains a 도면 업로드 탭 (file → /api/ai-quote/drawing → BOM → add to cart).
- `/price-intelligence` — category/spec comparison table + SVG trend chart (no chart dep).
- `/sites` list + `/sites/[siteId]` workspace (budget bar, order timeline, schedule, docs).
- `/dashboard` widgets: 예산 소진율, 최저가 알림, 배송 예정.
- API: `/api/ai-quote/drawing`, `/api/price-intelligence`, `/api/sites/[siteId]` (budget/tasks/docs).

## Definition of Done

`npx tsc --noEmit` 0 · `npm test` all pass (incl. new + Phase-1 E2E) · new-table RLS blocks
cross-tenant · migration preserves existing seed data · `next build` green · Vercel config ready.

## YAGNI

No OCR pipeline beyond Claude vision; no real-time collaboration; no Gantt lib (simple list +
SVG bar); price trend from existing data only (no external price feeds).
