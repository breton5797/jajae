# 자재 (Jajae) — B2B 인테리어·건축자재 플랫폼 MVP — Design Spec

- Date: 2026-06-07
- Status: Approved-to-proceed (autonomous via `/goal`; user pre-authorized execution without blocking)

## 1. Problem & Differentiation

Korean interior contractors (1-person 인테리어 가게 ~ small/mid 건설사) currently juggle many
suppliers, phone-quotes, and manual 물량 산출. Existing players (오늘의집 건자재몰, 자재로) are
narrow-catalog and lack operational ownership.

**Differentiation:** (1) full-catalog breadth — finishing + structural; (2) AI quoting/BOM
(자재 물량 산출); (3) in-platform operational ownership — multi-supplier consolidated order →
auto-split POs → staged delivery → returns/AS/settlement, all per 현장(site).

## 2. Stack (assumption-confirmed)

Next.js 14 App Router · Supabase (Postgres + RLS + Auth) · TypeScript strict · Tailwind +
shadcn-style UI · TanStack Query · Zustand · Vercel. Pretendard, brand `#1A56DB`. Korean,
mobile-first.

**Test/verify substrate (no cloud creds in CI):**
- RLS proven with **PGlite** (Postgres-in-WASM) running the real schema+policies.
- Anthropic/Toss/Kakao have real client shapes + deterministic fallbacks for offline tests.

## 3. Domain Model (Postgres)

Enums: `user_role(contractor|supplier|admin)`, `biz_status(pending|verified|rejected)`,
`product_status(draft|pending|approved|rejected)`, `category_kind(interior|structural)`,
`order_status(pending|paid|partially_fulfilled|fulfilled|cancelled)`,
`po_status(pending|accepted|preparing|shipped|delivered|cancelled)`,
`payment_method(escrow|credit)`, `payment_status(pending|held|released|failed|refunded)`,
`delivery_status(scheduled|in_transit|delivered|delayed)`,
`return_status(requested|approved|rejected|completed)`,
`as_status(requested|scheduled|in_progress|completed|rejected)`,
`settlement_status(pending|held|released)`.

Tables (FKs abbreviated): `profiles`(id=auth.uid, role, company_name, biz_no, biz_status,
credit_limit, credit_used), `suppliers`(owner_id, name, biz_no, status, rating),
`categories`(parent_id, kind, name, slug, level, sort), `products`(supplier_id, category_id,
name, brand, spec jsonb, unit, unit_price, stock, lead_time_days, spec_sheet_url, status,
search tsvector), `sites`(contractor_id, name, address, lat, lng, scheduled_date),
`cart_items`(contractor_id, product_id, qty), `orders`(contractor_id, site_id, status,
payment_method, payment_status, subtotal, platform_fee, total, toss_payment_key),
`purchase_orders`(order_id, supplier_id, status, subtotal, platform_fee, expected_ship_date),
`order_items`(po_id, product_id, name_snapshot, unit_price_snapshot, qty, line_total,
backordered), `deliveries`(po_id, site_id, status, scheduled_date, delivered_at),
`returns`(order_item_id, contractor_id, reason, qty, status),
`as_requests`(order_item_id, contractor_id, site_id, issue, status, scheduled_date),
`ai_quotes`(contractor_id, project_type, area_pyeong, dimensions jsonb, spec_level, result
jsonb, est_total), `settlements`(po_id, supplier_id, gross, platform_fee, net, status).

## 4. RLS (tenant isolation)

- profiles: self read/update; admin all.
- suppliers: owner manage; admin all; verified rows publicly readable.
- categories: public read; admin write.
- products: public read where `status='approved'`; supplier manages own; admin all.
- sites / cart_items / orders / ai_quotes: contractor owns; admin all.
- purchase_orders / order_items: contractor via parent order OR supplier (own); admin all.
- returns / as_requests: contractor owns; supplier sees those tied to own POs; admin all.
- settlements: supplier owns; admin all.

**DoD test:** contractor B SELECT on contractor A's order/site → 0 rows; supplier Y on
supplier X's PO → 0 rows.

## 5. Module Boundaries (`lib/*`, ESLint-enforced)

- `lib/catalog` — category tree, search/filter, NL→filter mapping (AI-assisted + fallback).
- `lib/orders` — cart→order, **split into per-supplier POs**, partial-stockout (split/backorder),
  mixed lead-time **staged deliveries**.
- `lib/ai-quote` — `generateBOM(input)` (Claude or deterministic), `matchSupplier`.
- `lib/settlement` — per-PO subtotal+fee, escrow hold/release, credit-limit check, invoices.

Boundary rule: domain modules may import `lib/types`, `lib/utils` only — not each other
(orders may read catalog types only). Enforced via `import/no-restricted-paths`.

## 6. Key Flows

Kakao login → biz_no verify → browse tree/search → cross-category multi-supplier cart →
assign 현장 → checkout (Toss escrow | credit) → **auto-split per-supplier POs** → suppliers
fulfill by lead-time → dashboard tracks staged delivery / returns / AS per site → settlement
on delivery-confirm (escrow release) or credit invoice.

AI BOM: project(24평 리모델링)+dims+spec → BOM JSON (category,item,qty,unit,est_price,
supplier_match) → one-click add-all to cart.

## 7. Edge Cases

partial stockout (split + backorder line), mixed lead-times (staged delivery groups),
biz_no fail (verify rejected, B2B gate closed), credit-limit exceed (block credit checkout),
return/AS approval workflow, mixed shipping units (bulk vs piece in PO grouping).

## 8. Verification (Definition of Done)

1. `npx tsc --noEmit` → 0 errors.
2. `npm test` → all pass (unit + RLS(PGlite) + E2E integration).
3. RLS blocks cross-tenant reads (PGlite test).
4. Seed ≥8 interior + ≥5 structural categories (+ products/suppliers/users).
5. E2E integration test: login→verify→AI BOM→cross-category multi-supplier cart→assign
   site→Toss test pay→split ≥3 POs→staged delivery + return/AS.
6. `next build` succeeds; `vercel.json` ready (remote deploy needs `VERCEL_TOKEN`).

## 9. Out of scope (YAGNI for MVP)

Real-time chat, in-app messaging, mobile native app, multi-currency, advanced analytics,
KakaoMap live routing (stub geocode), real Toss webhooks (test-confirm path only).
