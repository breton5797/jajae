# Phase 8-1 — 반품 자동 트리아지 (Return Auto-Triage) 설계

> 2026-06-09 · 자재(Jajae) 플랫폼 · Phase 8 첫 스펙
> 분쟁/AS 자동 트리아지 방향의 **반품(returns) 도메인 MVP**. AS요청 경로는 후속 스펙.

## 1. 배경 / 목표

현재 반품(`returns`)은 `lib/data/admin.ts`에서 `status='requested'`로 **조회만** 될 뿐, 승인/거부를
처리하는 라우트·로직이 없다(=100% 수동, 사실상 미해결 큐). Phase 7이 구축한 **2계층 정책 강제**
(서버 평가 + DB 트리거/원자 RPC + append-only 감사 + 가역)을 반품이라는 **고빈도·언어중심·가역적**
도메인에 재사용해, 사유 분류와 해결을 안전하게 자동화한다.

**핵심 원칙(fail-closed):** 분류기(AI 또는 결정론 폴백)는 *제안*만 한다. 환불 적용 여부는 **DB 원자
RPC가 정책을 재검증**해 결정한다. 자동 적용은 **"명백한 환불 승인 × 환불액 ≤ 관리자 상한"** 한 경우뿐이며,
거부·모호·저신뢰·상한 초과·킬스위치는 **전부 사람에게 에스컬레이션**한다. AI는 절대 자동 거부하지 않는다.

## 2. 비목표 (YAGNI — 이번 스펙 제외)

- AS요청(`as_requests`) 트리아지 경로 (구조 동일 → 후속 스펙에서 패턴 복제)
- 자동 거부 / 자동 AS예약 / 자동 환불 *집행*(여기선 `returns.status` 전이까지만; 실제 환급/에스크로
  연동은 기존 결제·정산 도메인 책임)
- per-카테고리·per-공급사 트리아지 정책 (단일 관리자 정책 행으로 시작)
- 알림/이메일, 분쟁 채팅, 반품 사진 비전 분석

## 3. 데이터 모델 (마이그레이션 `0013_triage.sql`, additive·데이터 보존)

기존 enum/테이블은 변경하지 않는다. `return_status`('requested','approved','rejected','completed')는
그대로 사용한다. **에스컬레이션은 새 status 값이 아니라** `triage_decisions`에 `decision='escalate'`
로그를 남기고 `returns.status='requested'`를 유지하는 것으로 표현한다(enum 변경 회피).

### 3.1 `triage_policies` — 단일 관리자 정책 행 (킬스위치 포함)

```sql
create table if not exists triage_policies (
  id               uuid primary key default gen_random_uuid(),
  singleton        boolean not null default true,           -- 단일 행 보장
  auto_approve_cap numeric not null default 0 check (auto_approve_cap >= 0),
  min_confidence   numeric not null default 0.8 check (min_confidence >= 0 and min_confidence <= 1),
  enabled          boolean not null default false,          -- 킬스위치(기본 OFF = fail-closed)
  created_at       timestamptz not null default now(),
  constraint triage_policies_singleton unique (singleton)
);
-- 시드: 1행(enabled=false, auto_approve_cap=0) → 관리자가 명시적으로 켜기 전까지 자동승인 0건
```

### 3.2 `triage_decisions` — append-only 감사 원장

```sql
create table if not exists triage_decisions (
  id             uuid primary key default gen_random_uuid(),
  return_id      uuid not null references returns(id) on delete cascade,
  source         text not null check (source in ('auto','admin','reversal')),
  decision       text not null check (decision in ('approve','reject','escalate')),
  responsibility text not null check (responsibility in ('supplier','delivery','contractor','ambiguous')),
  confidence     numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  rationale      text not null default '',
  refund_amount  numeric not null default 0 check (refund_amount >= 0),
  reversed_of    uuid references triage_decisions(id),
  actor          uuid references profiles(id),              -- 수동 결정자(자동/시스템은 null)
  created_at     timestamptz not null default now()
);
-- append-only: 기존 public.prevent_audit_mutation() 트리거(0008) 재사용(update/delete 차단)
```

**Idempotency / 용어**
- **트리아지됨(triaged)** = 해당 `return_id`에 `triage_decisions` 행이 1개 이상 존재. 자동 경로는
  **triaged 아닌**(=행 0개) `requested` 반품만 처리한다(escalate 로그도 행이므로, 한 번 자동
  에스컬레이션되면 자동 재처리되지 않고 사람 큐에 남는다).
- **직전 적용 결정** = `source in ('auto','admin')` ∧ `decision in ('approve','reject')` 이면서
  아직 상쇄(같은 건의 후속 `reversal` 행)되지 않은 최신 행. 가역(§5.3)의 대상.
- 가역 후에는 행이 남아 있으므로 자동 경로가 다시 돌지 않고 **관리자 수동** 처리 대상이 된다.

## 4. 결정 규칙 (서버·DB 동일 — defense in depth)

순수 함수 `decideTriage`와 plpgsql RPC가 **동일한 규칙**을 양쪽에서 적용한다.

```
auto_approve  ⟺  enabled
              ∧  classification.decision = 'approve'
              ∧  classification.confidence ≥ policy.min_confidence
              ∧  refundAmount ≤ policy.auto_approve_cap
그 외 모든 경우 → escalate
```

`refundAmount = returns.qty × order_items.unit_price_snapshot` (DB에서 산출, caller 신뢰 안 함).

> **운영 주의(`min_confidence`):** `min_confidence=0`으로 두면 신뢰도 게이트가 무력화되어
> `approve@0.0`도 (상한 내·enabled 시) 자동 승인될 수 있다. 권장 운영값은 ≥ 0.7이며, 관리자
> UI는 0이 아닌 값을 입력하도록 안내한다. (킬스위치·상한이 여전히 상위 가드로 작동.)

## 5. 원자적 RPC (plpgsql · `security definer` · fail-closed)

### 5.1 `triage_auto_resolve_return(p_return_id, p_proposed_decision, p_responsibility, p_confidence, p_rationale) returns text`

자동 경로. **DB가 최종 결정**한다(분류기는 제안일 뿐).

0. 신뢰 호출자 검증: `if not (auth.role() = 'service_role' or public.is_admin()) then raise 'unauthorized'`.
1. `select ... from returns where id=p_return_id for update` — 없으면 `raise 'return not found'`.
2. `triage_decisions` 행 존재 → `raise 'return already triaged'` (idempotency, §3.2).
3. `status <> 'requested'` → `raise 'return not actionable (status=%)'`.
4. `refund_amount` 산출(order_items join).

> **체크 순서(중요):** idempotency(2)를 not-actionable(3)보다 **먼저** 검사한다. 자동 승인으로
> `status='approved'`가 된 건을 재호출하면 "이미 트리아지됨"이 떠야 하고(결정 행이 곧 처리 여부의
> 진실), 자동 에스컬레이션된 건(status는 'requested' 유지)도 결정 행 존재로 재처리가 막혀야 하기
> 때문이다. 둘 다 raise이며 라우트에서 409로 매핑된다.
5. 정책 1행 읽기 — 없으면 `raise 'triage policy not configured'` (**fail-closed**).
6. §4 규칙으로 `v_decision` 계산:
   - `approve`: `update returns set status='approved'`; `insert triage_decisions(source='auto', decision='approve', ...)`.
   - `escalate`(상한 초과·저신뢰·비-approve·킬스위치): `insert triage_decisions(source='auto', decision='escalate', ...)`; status 유지.
7. `return v_decision`.

> 상한 초과는 **에러가 아니라 정상 흐름** → raise 아닌 escalate. raise는 not-found / not-actionable /
> already-triaged / no-policy 에서만(=fail-closed 가드).

### 5.2 `triage_admin_resolve_return(p_return_id, p_decision) returns void`

관리자 수동(`p_decision ∈ {'approve','reject'}`). 사람은 상한 오버라이드 가능하나 **전부 기록**.

1. 호출자 검증: `if not (auth.role() = 'service_role' or public.is_admin()) then raise 'unauthorized'`.
2. `for update`; `status <> 'requested'` → `raise 'return not actionable'`.
3. `update returns set status = (approve→'approved' | reject→'rejected')`.
4. `insert triage_decisions(source='admin', decision=p_decision, actor=auth.uid(), refund_amount, ...)`.

### 5.3 `triage_reverse_resolution(p_return_id) returns void`

관리자 가역(approve/reject 되돌리기, Phase 7 reverse 패턴).

1. 관리자 검증(상동).
2. `for update`; `status = 'completed'` → `raise 'return already completed; cannot reverse'`(환급 집행 후 불가).
3. **직전 적용 결정**(§3.2) 조회 — 없으면 `raise 'no active resolution to reverse'`.
4. `update returns set status='requested'` (관리자 수동 재처리 가능 상태로 원복).
5. `insert triage_decisions(source='reversal', decision='escalate', reversed_of=<직전적용결정id>, actor=auth.uid(), refund_amount)`
   (상쇄 행; 직전 적용 결정이 상쇄되어 "직전 적용 결정 없음"이 된다).

> 시간 윈도우는 두지 않는다(상태 기반: `completed` 전까지 관리자 가역). 단순·관리자 게이트로 충분.

## 6. RLS

| 테이블 | 시공사(contractor) | 관리자(admin) | 쓰기 |
|---|---|---|---|
| `triage_policies` | 불가 | select/insert/update | 관리자만 |
| `triage_decisions` | 본인 반품(`returns.contractor_id = auth.uid()`) 행 select | 전체 select | RPC(`security definer`)만 insert; append-only 트리거가 update/delete 차단 |

0012의 admin 권한 게이트·0009/0011의 RLS 패턴을 따른다.

## 7. 모듈 (작은 파일·high cohesion)

### `lib/triage/` (순수 — `lib/policy` 스타일, 한국어 사유, 무부수효과)

- `schema.ts` — zod `ReturnClassificationSchema`
  ```ts
  z.object({
    responsibility: z.enum(['supplier','delivery','contractor','ambiguous']),
    decision:       z.enum(['approve','reject','ambiguous']),
    confidence:     z.number().min(0).max(1),
    rationale:      z.string(),
  })
  ```
- `index.ts`
  - `computeRefundAmount(qty, unitPriceSnapshot): number`
  - `decideTriage(classification, refundAmount, policy): { decision: 'auto_approve'|'escalate'; reasons: string[] }` (§4 규칙, 한국어 사유)
  - `classifyReturnFallback(reason, refundAmount): Classification` — **보수적 키워드 규칙**: 명백한
    하자 신호(`파손`·`불량`·`오배송`·`하자`·`깨짐` 등) 매칭 시 `decision='approve'` + 중간 신뢰도,
    그 외 `decision='ambiguous'` + 저신뢰(기본 에스컬레이션 유도). 절대 throw 안 함.
- `anthropic.ts` — `classifyReturnWithAI(input): Promise<Classification | null>`
  - Anthropic SDK + 한국어 JSON-only 시스템 프롬프트 + zod 검증. 무키/에러 시 `null`(→폴백).
  - `lib/ai-quote/anthropic.ts`와 동일하게 **무네트워크 테스트 제외**(격리·방어적).

### `lib/data/triage.ts` (IO 로더)

- 트리아지 큐 조회: `requested` 반품 + 산출 환불액 + 최신 `triage_decisions`(분류/사유) join.
  자동 처리 대상 = `status='requested'` ∧ `triage_decisions` 행 0개(§3.2 idempotency).

## 8. 라우트 / UI (한국어·모바일퍼스트·#1A56DB)

- `app/api/triage/route.ts` — `POST`: 관리자가 자동 트리아지 일괄 실행.
  대상 반품마다 `classifyReturnWithAI() ?? classifyReturnFallback()` → `decideTriage`(서버 프리체크)
  → `rpc('triage_auto_resolve_return', …)`(DB 최종 결정). 응답: `{ approved, escalated }` 집계.
- `app/api/triage/[id]/route.ts` — `POST { action: 'approve'|'reject'|'reverse' }`:
  `triage_admin_resolve_return` / `triage_reverse_resolution` 호출. 에러→409/422/401/500 매핑.
- `app/admin/triage/page.tsx` + 컨트롤 컴포넌트 — 큐(분류·책임·신뢰도·환불액·사유), "자동 처리 실행"
  버튼, 행별 승인/거부/가역, 정책 편집(상한·신뢰도 임계·킬스위치).

## 9. 엣지 케이스

- 무키/AI 오류 → 폴백(보수적, 기본 에스컬레이션).
- 정책 미설정·킬스위치 → 자동 0건(전부 에스컬레이션), RPC는 정책행 없으면 raise.
- 환불액 = 상한 **경계값**(≤ 이므로 정확히 상한이면 자동승인).
- 동시/중복 자동 실행 → `for update` + 활성결정 체크로 이중 처리 raise.
- 이미 `approved/rejected/completed` 건 재처리 → not-actionable raise.
- 가역 후 재트리아지 가능(status='requested' 원복).

## 10. 테스트 (TDD · RED→GREEN · 222개 회귀 불변)

- `tests/unit/triage.test.ts` — `decideTriage` 경계(상한±1·신뢰도 임계·킬스위치·비-approve→escalate),
  `computeRefundAmount`, `classifyReturnFallback` 보수성(명백 신호만 approve, 기본 ambiguous).
- `tests/db/phase8-triage.test.ts` (PGlite) —
  - RLS: 시공사는 타인 반품 트리아지 결과 못 봄; `triage_policies`는 관리자 전용.
  - `triage_auto_resolve_return`: 상한 이하 approve → status='approved' + auto 로그(원자); 상한 초과 →
    'escalate' 반환 + status 유지 + escalate 로그; 저신뢰 → escalate; 킬스위치/정책없음 → escalate/raise.
  - idempotency: 이미 트리아지된 건 재호출 raise; not-actionable raise.
  - `triage_admin_resolve_return`: 관리자 승인/거부(상한 오버라이드) 기록; 비관리자 unauthorized raise.
  - `triage_reverse_resolution`: 원복 + 상쇄 로그; completed 가역 raise; 활성결정 없음 raise.
  - append-only: `triage_decisions` update/delete 차단.
- `tests/e2e/phase8-flow.test.ts` — 반품 접수 → 자동 트리아지 → (상한 내)자동승인 / (초과)에스컬레이션
  → 관리자 수동 결정 → 가역. 기존 페이즈 E2E 회귀 통과.

## 11. 검증 / 완료 기준 (DoD)

- `npx tsc --noEmit` 0 · `npm run lint` 0 · `npm test` 전체 0 실패(신규 포함) · `next build` green.
- RED→GREEN: `0013` 적용 **전** 신규 RPC/RLS 테스트 실패 → 적용 **후** 통과.
- 적대적 다중렌즈 검증 후 발견 이슈 반영.
- ESLint `import/no-restricted-paths` 위반 없음(triage 순수 ↔ data IO 경계 유지).

## 12. 후속 의존성 / 보안 로드맵 주의

- **`returns.status` 자가 전이(기존 RLS):** `0002_rls.sql`의 `returns_update`는 시공사가 본인 반품
  행을 self-update할 수 있게 허용한다(컬럼 가드·전이 트리거 없음). 본 페이즈에서는 `status` 변경이
  **금전을 움직이지 않으므로**(환급 집행은 §2 범위 외, self-flip은 감사 `triage_decision`도 남기지
  않음) 위험이 없다. 그러나 **향후 `returns.status='approved'`를 실제 에스크로 환급 집행과 연동하는
  페이즈에서는** 이 self-update가 악용 가능해진다 → 그 전에 status 전이 트리거(승인은 관리자/RPC만)
  를 반드시 추가할 것.
