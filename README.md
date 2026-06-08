# 자재 (Jajae) — B2B 인테리어·건축자재 플랫폼

시공사(1인 인테리어 ~ 중소 건설사)를 위한 **인테리어 + 건축자재 통합 구매·운영 플랫폼**.
전 카테고리 검색 · **AI 자재 물량산출(BOM)** · 다중 공급사 통합주문 → **자동 PO 분할** ·
현장(現場)별 예산/일정/배송/반품/AS · B2B 금융 · 오픈 API · **자율 조달 에이전트**까지 한 곳에서.

> 차별점: 전 카테고리 폭(마감재+구조재) + AI 견적/BOM + 플랫폼 내 운영 책임(반품·AS·배송·정산)
> + 데이터 기반 예측 발주 + 정책으로 통제되는 자율 조달.

---

## 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | Next.js 14 (App Router) · React 18 · TypeScript (strict, `noUncheckedIndexedAccess`) |
| UI | Tailwind CSS · shadcn 스타일(Radix) · Pretendard · 브랜드 `#1A56DB` · 모바일 퍼스트 · 한국어 |
| 상태/데이터 | TanStack Query · Zustand |
| 백엔드 | Supabase (Postgres · RLS · Auth) · plpgsql 트리거/RPC |
| AI | Claude (`@anthropic-ai/sdk`) — 미설정 시 **결정론적 폴백** |
| 결제/세금/지도 | Toss Payments(에스크로/여신) · Popbill(전자세금계산서) · KakaoMap — 미설정 시 샌드박스/목 |
| 검증 | Vitest · `@electric-sql/pglite`(WASM Postgres)로 실제 RLS/E2E |
| 배포 | Vercel |

---

## 기능 맵 (7 페이즈로 점진 구축)

| # | 페이즈 | 핵심 기능 |
|---|--------|-----------|
| 1 | MVP | 전 카테고리 카탈로그·검색, AI BOM, 다중 공급사 장바구니 → 통합결제 → 공급사별 PO 자동 분할, 현장 배송/반품/AS, 시공사·공급사·관리자 콘솔 |
| 2 | 운영 인텔리전스 | 도면 기반 AI BOM, 가격 비교(price intelligence), 현장 예산·일정 워크스페이스 |
| 3 | 수익화·락인 | PB(자체 브랜드) 상품, 공동구매, B2B 금융(정산·전자세금계산서·여신) |
| 4 | 공급망·네트워크 | 물류 배차(배송 묶음), 공급사 평점, 커뮤니티/리뷰/추천 |
| 5 | 예측·수요확장 | 수요예측·자동발주, B2B2C 입주민 포털, 오너 애널리틱스 |
| 6 | 오픈 플랫폼 | Open API + 웹훅, ERP 동기화, 신용평가, 임베디드 금융(선정산) |
| 7 | 자율 조달 | 조달 에이전트, 풀필먼트 허브, 사람 개입(HITL) 가드레일, **DB/서버 레이어 정책 강제** |

---

## 빠른 시작

```bash
npm install
cp .env.example .env.local   # 키 입력 (없어도 빌드/테스트는 통과 — 폴백/목 경로)
npm run dev                  # http://localhost:3000
```

### 환경 변수 (`.env.example` 참고)

| 변수 | 미설정 시 |
|------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase 연동 필요 |
| `ANTHROPIC_API_KEY` | AI BOM/검색이 결정론적 폴백으로 동작 |
| `TOSS_SECRET_KEY` / `NEXT_PUBLIC_TOSS_CLIENT_KEY` | 결제는 샌드박스/목 경로 |
| `NEXT_PUBLIC_KAKAO_MAP_KEY` | 지도는 그레이스풀 폴백 |
| `PLATFORM_FEE_RATE` | 기본 `0.03` |

### Supabase 스키마/시드

```bash
supabase start      # 로컬 스택
supabase db reset   # supabase/migrations/* + seed.sql 적용
```

마이그레이션은 **순서대로 누적 적용**됩니다(`0001` → `0011`). 모두 additive·데이터 보존:

```
0001_schema        스키마           0007_predictive_b2b2c   예측·입주민 포털
0002_rls           RLS 정책         0008_openapi_finance    오픈API·임베디드 금융
0003_grants        권한             0009_autonomous_agent   자율 에이전트·허브·감사
0004_ops_intelligence 운영 지표     0010_agent_guardrails   spend_cap 백스톱·멱등성
0005_monetization  PB·공동구매·금융 0011_agent_rpc          원자적 RPC·총지출 cap
0006_network_logistics 물류·평점·커뮤니티
```

---

## 아키텍처 (모듈 경계)

도메인 로직은 **순수 함수**로 분리되어 단위 테스트되며, ESLint `import/no-restricted-paths`로
도메인 간 상호 의존을 차단합니다. IO(서버 데이터 로더)는 `lib/data/*`로 분리됩니다.

| 그룹 | 모듈 |
|------|------|
| 커머스 | `catalog` · `orders` · `payments` · `pricing` · `pb` · `groupbuy` |
| 운영 | `projects` · `ai-quote` · `logistics` · `fulfillment` · `forecast` |
| 금융 | `settlement` · `finance` · `scoring` |
| 네트워크 | `ratings` · `community` · `client-portal` · `analytics` |
| 플랫폼 | `openapi` · `erp` · `agent` · `policy` |
| 인프라 | `data`(IO 로더) · `supabase` · `store` |

### 자율 조달 정책 강제 (Phase 7, 2계층 방어)

`spend_cap`(에이전트 발기 지출 총량 = 자율 + 사람 승인)은 **서버와 DB 두 계층에서** 강제됩니다.

- **서버**: `lib/policy`가 `agent_audit_log` 순(net) 지출을 누적해 정책 평가.
- **DB**: plpgsql 트리거 `enforce_agent_policy` + 원자적 RPC(`agent_execute_auto` /
  `agent_approve_decision` / `agent_reject_decision` / `agent_reverse_action`).
  order+PO+action이 한 트랜잭션이라 정책 위반 시 전부 롤백(orphan/중복 없음),
  `FOR UPDATE`로 동시성 직렬화, 정책 행 없으면 fail-closed 거부.
- per-item 한도(max_po·allowlist·escalation_threshold·kill-switch)는 사람 승인이
  오버라이드 가능하나, `spend_cap`만은 승인도 못 넘는 단일 천장.

---

## 검증 (Definition of Done)

```bash
npm run typecheck   # tsc --noEmit              → 0 errors
npm run lint        # next lint                 → 0 warnings/errors
npm run build       # next build
npm test            # vitest run  → 42 files / 216 tests
```

- **RLS/E2E without cloud**: `tests/db/*`는 PGlite(WASM Postgres)에 실제 마이그레이션+시드를
  적재하고, `SET ROLE` + JWT claim GUC로 PostgREST와 동일한 방식으로 사용자를 흉내내어
  테넌트 격리·트리거·RPC·롤백을 증명합니다. (운영 Supabase는 동일 마이그레이션 사용.)
- **결정론적 오프라인 테스트**: AI/결제/세금계산서는 키 없이도 폴백 경로로 통과.
- **회귀**: 각 페이즈는 이전 페이즈 E2E를 깨지 않음을 하드 요건으로 검증.

---

## 라우트

**페이지**: `/`(랜딩) · `/login`(카카오+사업자인증) · `/catalog`·`/catalog/[id]` ·
`/ai-quote` · `/drawing`(도면 BOM) · `/cart` · `/checkout` · `/dashboard` · `/sites`·`/sites/[siteId]`(현장) ·
`/price-intelligence` · `/group-buy` · `/finance`·`/financing` · `/forecast`(수요예측) ·
`/community`·`/referral` · `/client`(입주민 포털) · `/partner`·`/api-docs`(오픈 플랫폼) ·
`/agent`(자율 조달) · `/supplier`(공급사) · `/admin`(운영 콘솔: PB·배차·애널리틱스·허브·에이전트 현황).

**API**: `agent/run`·`agent/decision/[id]`·`agent/action/[id]/reverse`·`agent/policy` ·
`ai-quote`·`ai-quote/drawing` · `checkout`·`biz-verify` · `group-buy/*` ·
`finance/*`(invoice·request·settlement) · `logistics/*` · `forecast/draft` ·
`client/*` · `partner/*`(clients·webhooks) · `pb/recommend` · `reviews`·`referral` ·
`v1/products`·`v1/inventory`·`v1/pos`(Open API) · `auth/callback`.

---

## 배포 (Vercel)

`vercel.json` 포함. `VERCEL_TOKEN` + 위 환경 변수 설정 후 `npx vercel deploy --prod`
(또는 GitHub 연동 자동 배포).

> 현재 외부 통합(Toss·Popbill·Kakao·Supabase 클라우드)은 키 미설정 시 목/폴백으로 동작하며,
> RLS·E2E는 PGlite로 실제 Postgres 동작을 검증합니다. 운영 전환 시 실 키/프로젝트 연결이 필요합니다.

---

## 라이선스

Proprietary. All rights reserved.
