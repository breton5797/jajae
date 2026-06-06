# 자재 (Jajae) — B2B 인테리어·건축자재 플랫폼 MVP

시공사(1인 인테리어 ~ 중소 건설사)를 위한 **인테리어 + 건축자재 통합 구매 플랫폼**.
전 카테고리 검색 · **AI 자재 물량산출(BOM)** · 다중 공급사 통합주문 → **자동 PO 분할** ·
현장(現場)별 배송/반품/AS 운영까지 한 곳에서.

> 차별점: 오늘의집 건자재몰·자재로 대비 **전 카테고리 폭(마감재+구조재)** + **AI 견적/BOM** +
> **플랫폼 내 운영 책임(반품·AS·배송 스케줄)**.

## 스택

Next.js 14 (App Router) · Supabase (Postgres · RLS · Auth) · TypeScript(strict) ·
Tailwind + shadcn 스타일 UI · TanStack Query · Zustand · Vercel.
Pretendard · 브랜드 `#1A56DB`. 모바일 퍼스트, 한국어.
AI: Claude API (미설정 시 결정론적 폴백). 결제: Toss Payments(에스크로/여신, 미설정 시 샌드박스).

## 빠른 시작

```bash
npm install
cp .env.example .env.local   # 키 입력 (없어도 빌드/테스트는 통과)
npm run dev
```

### 환경 변수

`.env.example` 참고. `ANTHROPIC_API_KEY` / `TOSS_SECRET_KEY` / Kakao 미설정 시 각각
결정론적 폴백·샌드박스 경로로 동작합니다. Supabase 연동 시 `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` 필요.

### Supabase 스키마/시드

```bash
supabase start          # 로컬 스택
supabase db reset       # migrations/ + seed.sql 적용
```

마이그레이션: `supabase/migrations/0001_schema.sql`(스키마) · `0002_rls.sql`(RLS) ·
`0003_grants.sql`(권한). 시드: `supabase/seed.sql`(카테고리·공급사·상품).

## 아키텍처 (모듈 경계)

도메인 로직은 순수 함수로 분리되어 단위 테스트됩니다. ESLint(`import/no-restricted-paths`)로
상호 의존을 차단합니다.

| 모듈 | 책임 |
|------|------|
| `lib/catalog` | 카테고리 트리, 상품 필터/검색, 자연어→필터 매핑 |
| `lib/orders` | 장바구니→공급사별 PO 분할, 부분품절/백오더, 혼합 리드타임 분할배송 |
| `lib/ai-quote`| BOM 생성(Claude/폴백), 상품 매칭 |
| `lib/settlement`| 정산(에스크로 보류/정산, 여신 한도, 인보이스) |
| `lib/data/*` | 서버 데이터 로더(IO) — 순수 도메인과 분리 |

데이터 흐름: 카카오 로그인 → 사업자번호 인증 → 카탈로그/검색 → 교차 카테고리·다중 공급사
장바구니 → 현장 배정 → 결제(에스크로/여신) → **공급사별 PO 자동 분할** → 리드타임별
분할 배송 → 현장별 배송/반품/AS → 배송확정 시 에스크로 정산.

## 검증 (Definition of Done)

```bash
npm run typecheck   # 1) tsc --noEmit  (0 errors)
npm test            # 2) vitest        (unit + RLS + E2E)
npm run build       # 6) next build
```

- **#3 RLS**: `tests/db/rls.test.ts` — PGlite(WASM Postgres)에 실제 스키마+RLS를 적재하고
  `SET ROLE authenticated` + JWT claim GUC로 테넌트 격리를 증명(교차 조회 0건).
- **#4 시드**: `tests/db/seed.test.ts` — 인테리어 9 + 구조재 7 (요건 ≥8/≥5) 및 BOM 카테고리
  전부 재고 보유 상품 존재 검증.
- **#5 E2E**: `tests/e2e/full-flow.test.ts` — 로그인→사업자인증→AI BOM→교차 카테고리·다중
  공급사 장바구니→현장 배정→Toss 테스트 결제→**PO 3건 이상 분할**→분할 배송 + 반품/AS.

> RLS/E2E는 클라우드 없이 PGlite로 실제 Postgres 동작을 검증합니다. 운영 Supabase는
> 동일 마이그레이션을 사용합니다.

## 배포 (Vercel)

`vercel.json` 포함. `VERCEL_TOKEN` + 위 환경 변수 설정 후:

```bash
npx vercel deploy --prod   # 또는 GitHub 연동 자동 배포
```

## 라우트

`/` 랜딩 · `/login` 카카오+사업자인증 · `/catalog` 카탈로그/검색 · `/catalog/[id]` 상세 ·
`/ai-quote` AI 견적 · `/cart` 장바구니 · `/checkout` 통합결제 · `/dashboard` 시공사 대시보드 ·
`/supplier` 공급사 콘솔 · `/admin` 운영 콘솔.
API: `/api/ai-quote` · `/api/checkout` · `/api/biz-verify` · `/auth/callback`.
