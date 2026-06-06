# 자재(Jajae) Phase 3 — 수익화·락인 레이어 — Design Spec

- Date: 2026-06-07
- Status: Approved-to-proceed (autonomous via `/goal`)
- Builds on Phase 1 (MVP) + Phase 2 (ops intelligence)

## Goal

Margin + lock-in: (1) PB(자체브랜드) 상품, (2) 공동구매(group-buy) 수요 집계,
(3) B2B 금융 자동화 — 월정산 + 전자세금계산서 + 여신. 회계/현금흐름 때문에 머무는 플랫폼.

## Naming guard

Phase-1 `settlements` = per-PO **supplier payout**. The new monthly contractor statement
is `contractor_settlements` (do NOT reuse/alter `settlements`).

## New modules (pure, boundary-enforced)

- `lib/pb` — `recommendPbCandidates` (demand×margin ranking; Claude optional + deterministic
  fallback), `computePbPrice(cost, marginRate)`, `buildPbProduct` (product row + pb_products row).
- `lib/groupbuy` — `sortTiers`, `currentTier`, `priceForQty`, `applyJoin`, `closeGroupBuy`
  (min-met → per-contractor order intents at final tier price; min-not-met → cancelled).
- `lib/finance` — `buildMonthlySettlement`, credit ledger (`creditStatus`, `canPlaceCreditOrder`
  with overdue block, `applyCreditCharge/Payment`, `isOverdue`); `popbill.ts` e-tax invoice
  wrapper (mock fallback + retryable failure state).

All depend on lib/types + lib/utils only. closeGroupBuy returns order **intents** (caller uses
lib/orders to persist) — no cross-module import.

## DB (migration 0005 — additive, data-preserving)

- `ALTER products ADD is_pb boolean default false, cost numeric, margin_rate numeric`
  (Product type gets these as OPTIONAL → existing constructions unaffected).
- `pb_products`(product_id→products, sku unique, category_id, cost, margin_rate, supplier_id)
- `group_buys`(product_id, supplier_id, title, start_at, end_at, min_qty, tiers jsonb,
  status, joined_qty, final_unit_price)
- `group_buy_joins`(group_buy_id, contractor_id, qty) unique(group_buy_id, contractor_id)
- `contractor_settlements`(contractor_id, period, gross, fee, net, status)
- `tax_invoices`(settlement_id→contractor_settlements, provider, provider_invoice_id, status, pdf_url)
- `credit_accounts`(contractor_id unique, limit_amount, used_amount, overdue_amount, due_date)
- RLS: contractor owns settlements/credit/joins; group_buys + pb_products public-read; supplier
  manages own pb_products/group_buys; admin full. Reuse `is_admin`/`owns_supplier` helpers.

## Flows

- **PB**: AI ranks candidate categories from order_items demand → admin creates PB SKU
  (product is_pb=true, unit_price=round(cost×(1+margin)), designated supplier) + pb_products row
  → catalog shows **PB badge** → orders route to designated supplier (reuses split).
- **Group-buy**: admin/supplier opens campaign w/ qty tiers → contractors join → joined_qty
  crosses tier → live price → on close, per-contractor POs at final price; min-not-met → cancel.
- **Finance**: month-end → aggregate **delivered** orders → contractor_settlement → e-tax
  invoice via Popbill (mock) → credit account updated; overdue blocks new credit orders.

## Edge cases

group-buy min-not-met (cancel), tier boundary (lowest unlocked tier wins), invoice failure
(status 'failed' → retryable), credit-limit exceed & **overdue block** at checkout, settlement
dispute (status 'disputed'), PB stockout (product.stock gate).

## DoD

tsc 0 · `npm test` all pass · **all prior E2E pass (regression)** · RLS isolates
settlements/credit per contractor · Phase-3 E2E (AI PB report → PB SKU in catalog → group-buy →
2 joins → tier drop → close→POs → month-end settlement → e-tax invoice → credit usage + overdue
block) · `next build` green; Vercel config ready.

## YAGNI

Real Popbill creds (mock issuance), real refund settlement to cards (state only), cron
scheduling (manual month-end trigger), websocket live price (poll/refresh).
