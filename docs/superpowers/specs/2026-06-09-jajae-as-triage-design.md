# Phase 8-2 — AS 자동 트리아지 (After-Service Auto-Triage) 설계

> 2026-06-09 · 자재(Jajae) · Phase 8-2 (8-1 반품 트리아지 위에 구축)
> AS요청(`as_requests`) 도메인. **반품 트리아지(8-1)의 2계층 강제·append-only·가역 패턴을 재사용**하되,
> AS 고유 차이(금액/상한 없음, 자동 동작 = "예약")를 반영한다.
> 참조: `docs/superpowers/specs/2026-06-09-jajae-return-triage-design.md` (공유 머신러리 동일)

## 1. 배경 / 목표

AS요청(`as_requests`)은 현재 `lib/data/dashboard.ts`에서 조회만 될 뿐, 책임소재 판정·예약/거부 처리
흐름이 없다(반품과 동일하게 미해결 큐). 8-1과 동일하게 분류기(AI + 결정론 폴백)가 `issue`를 읽어
**제안**하고, DB 원자 RPC가 정책을 **재검증**해 적용한다.

**핵심 원칙(fail-closed, 8-1과 동일):** 분류기는 제안만. **자동 적용은 "명백한 공급사/배송 귀책 ×
고신뢰"인 건의 자동 예약(requested→scheduled)뿐**이며, 거부·모호·시공사귀책·저신뢰·킬스위치는 **전부
사람에게 에스컬레이션**한다. AI는 절대 자동 거부하지 않는다(거부는 사람만).

## 2. AS 델타 (반품 8-1과 다른 점)

| 항목 | 반품(8-1) | AS(8-2) |
|------|-----------|---------|
| 자유서술 필드 | `returns.reason` | `as_requests.issue` |
| 상태 enum | `requested→approved/rejected/completed` | `requested→scheduled/in_progress/completed/rejected` |
| 금액/상한 | 환불액 `qty×단가` ≤ `auto_approve_cap` | **없음** — 금액 게이트 제거 |
| 자동 동작 | 자동 **승인**(status='approved') | 자동 **예약**(status='scheduled', `scheduled_date`는 null 유지 → 배차 담당이 지정) |
| 자동 게이트 추가 | — | **책임소재 ∈ {supplier, delivery}** 조건 추가(시공사귀책은 자동 예약 안 함) |
| 가역 불가 상태 | `completed` | `in_progress`·`completed` (작업 착수 후 불가) |

## 3. 비목표 (YAGNI)

- `scheduled_date` 자동 산정(리드타임 계산) — 자동 예약은 날짜 null, 배차 담당이 지정
- AS 비용/견적 자동화, 기사 배정 자동화
- per-카테고리 정책, 알림/이메일

## 4. 데이터 모델 (마이그레이션 `0014_as_triage.sql`, additive)

`as_status` enum·`as_requests`는 변경하지 않는다. 에스컬레이션은 새 status가 아니라
`as_triage_decisions`에 `decision='escalate'` 로그 + `status='requested'` 유지로 표현(8-1과 동일).

### 4.1 `as_triage_policies` — 단일 관리자 정책 행 (킬스위치)

```sql
create table if not exists as_triage_policies (
  id             uuid primary key default gen_random_uuid(),
  singleton      boolean not null default true,
  min_confidence numeric not null default 0.8 check (min_confidence >= 0 and min_confidence <= 1),
  enabled        boolean not null default false,        -- 킬스위치(기본 OFF)
  created_at     timestamptz not null default now(),
  constraint as_triage_policies_singleton unique (singleton)
);
-- 시드: 1행(enabled=false). 상한 컬럼 없음(AS는 금액 게이트 없음).
```

자동 예약 가능 책임소재 `{supplier, delivery}`는 정책 컬럼이 아니라 규칙에 고정한다(YAGNI).

### 4.2 `as_triage_decisions` — append-only 감사 원장

```sql
create table if not exists as_triage_decisions (
  id             uuid primary key default gen_random_uuid(),
  as_request_id  uuid not null references as_requests(id) on delete cascade,
  source         text not null check (source in ('auto','admin','reversal')),
  decision       text not null check (decision in ('schedule','reject','escalate')),
  responsibility text not null check (responsibility in ('supplier','delivery','contractor','ambiguous')),
  confidence     numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  rationale      text not null default '',
  reversed_of    uuid references as_triage_decisions(id),
  actor          uuid references profiles(id),
  created_at     timestamptz not null default now()
);
create index if not exists as_triage_decisions_req_idx on as_triage_decisions(as_request_id);
-- append-only: public.prevent_audit_mutation()(0008) 트리거 재사용. 금액 컬럼 없음.
```

**Idempotency / 용어(8-1과 동일):** 트리아지됨 = `as_triage_decisions` 행 ≥1. 자동 경로는 행 0개인
`requested` 건만 처리. 직전 적용 결정 = `source in('auto','admin') ∧ decision in('schedule','reject')`
이며 미상쇄된 최신 행(가역 대상).

## 5. 결정 규칙 (서버·DB 동일 — defense in depth)

```
auto_schedule  ⟺  enabled
               ∧  classification.decision = 'approve'        -- 분류기 출력은 8-1과 동일 형태 재사용
               ∧  classification.responsibility ∈ {'supplier','delivery'}
               ∧  classification.confidence ≥ policy.min_confidence
그 외 모든 경우 → escalate
```

> 분류기 출력 형태(`responsibility`/`decision`(approve|reject|ambiguous)/`confidence`/`rationale`)는 8-1의
> `ReturnClassificationSchema`를 그대로 재사용한다(범용 "결함 분류"). AS에서 `decision='approve'`는
> "정당한 결함성 AS → 예약" 의미. 서버 매퍼가 이를 `schedule`/`escalate`로 변환해 RPC에 전달한다.

## 6. 원자적 RPC (plpgsql · `security definer` · fail-closed)

### 6.1 `as_triage_auto_resolve(p_as_request_id, p_proposed_decision, p_responsibility, p_confidence, p_rationale) returns text`

자동 경로. **DB가 최종 결정.**

0. `if not (auth.role()='service_role' or public.is_admin()) then raise 'unauthorized'`.
1. `select status into v_status from as_requests where id=p_as_request_id for update` — 없으면 `raise 'as request not found'`.
2. `as_triage_decisions` 행 존재 → `raise 'as request already triaged'` (idempotency, **not-actionable보다 먼저**).
3. `v_status <> 'requested'` → `raise 'as request not actionable (status=%)'`.
4. 정책 1행 읽기 — 없으면 `raise 'as triage policy not configured'` (**fail-closed**).
5. 결정: `enabled ∧ p_proposed_decision='schedule' ∧ p_responsibility in('supplier','delivery') ∧ p_confidence ≥ min_confidence` → `'schedule'`, 아니면 `'escalate'`.
6. `schedule`: `update as_requests set status='scheduled' where id=...` (scheduled_date 미설정/null 유지). `escalate`: status 유지.
7. `insert as_triage_decisions(source='auto', decision=v_decision, ...)`; `return v_decision`.

> raise는 not-found / already-triaged / not-actionable / no-policy / unauthorized 에서만. 비자격(상한 개념
> 없음·시공사귀책·저신뢰·킬스위치)은 **정상 흐름 escalate**.

### 6.2 `as_triage_admin_resolve(p_as_request_id, p_decision) returns void`

관리자 수동(`p_decision ∈ {'schedule','reject'}`).

1. 호출자 검증(상동). 2. `for update`; `status <> 'requested'` → raise 'not actionable'.
3. `update as_requests set status = (schedule→'scheduled' | reject→'rejected')`.
4. `insert as_triage_decisions(source='admin', decision=p_decision, actor=auth.uid(), ...)`.

### 6.3 `as_triage_reverse(p_as_request_id) returns void`

관리자 가역(schedule/reject 되돌리기).

1. 검증(상동). 2. `for update`; `status in ('in_progress','completed')` → `raise 'as request in progress or completed; cannot reverse'`(작업 착수 후 불가).
3. 직전 적용 결정(§4.2) 조회 — 없으면 `raise 'no active resolution to reverse'`.
4. `update as_requests set status='requested'`.
5. `insert as_triage_decisions(source='reversal', decision='escalate', reversed_of=<직전적용id>, actor=auth.uid())`.

### grants
`as_triage_auto_resolve(uuid,text,text,numeric,text)` · `as_triage_admin_resolve(uuid,text)` ·
`as_triage_reverse(uuid)` — PUBLIC EXECUTE revoke 후 `authenticated, service_role` grant.

## 7. RLS

| 테이블 | 시공사 | 관리자 | 쓰기 |
|--------|--------|--------|------|
| `as_triage_policies` | 불가 | 전체 | 관리자만 |
| `as_triage_decisions` | 본인 AS요청(`as_requests.contractor_id=auth.uid()`) select | 전체 select | RPC(SECURITY DEFINER)만 insert; append-only 트리거가 update/delete 차단 |

## 8. 모듈 (작은 파일)

- `lib/triage/as.ts` (순수) — `decideAsTriage(c, policy)`(§5 규칙, `outcome: 'auto_schedule'|'escalate'`),
  `classifyAsRequestFallback(issue)`(AS 결함 신호: `불량·하자·파손·오작동·누수·균열·소음·고장·작동` 등 →
  approve+supplier, 그 외 ambiguous). `ReturnClassification` 타입/스키마 재사용.
- `lib/triage/as-anthropic.ts` — `classifyAsRequestWithAI(input): Promise<ReturnClassification|null>`
  (AS 전용 한국어 프롬프트; 무키/에러 시 null). `lib/triage/anthropic.ts` 패턴.
- `lib/data/triage.ts` (확장) — `loadAsTriageConsole()` 추가(큐: `requested` AS + 최신 분류 join).

## 9. 라우트 / UI

- `app/api/as-triage/route.ts` — POST(자동 실행: `classifyAsRequestWithAI ?? classifyAsRequestFallback`
  → `decideAsTriage` → `as_triage_auto_resolve` RPC, 집계 `{scheduled, escalated}`) · PATCH(정책: enabled·min_confidence).
- `app/api/as-triage/[id]/route.ts` — POST `{action:'schedule'|'reject'|'reverse'}` → admin/reverse RPC, `mapRpcError`.
- `app/admin/triage/page.tsx` (확장) — 기존 반품 큐 아래 **AS 트리아지 섹션** 추가(정책·실행·행별 예약/거부/가역).
- `components/as-triage-controls.tsx` — `RunAsTriageButton`·`AsTriagePolicyForm`·`AsTriageRowActions`.

## 10. 테스트 (TDD · 회귀 불변)

- `tests/unit/as-triage.test.ts` — `decideAsTriage` 경계(책임소재 allowlist·신뢰도·킬스위치·비-approve),
  `classifyAsRequestFallback` 보수성.
- `tests/db/phase8-as-triage.test.ts` (PGlite) — RLS 격리 · auto schedule(공급사귀책 고신뢰)→status='scheduled'+로그 ·
  시공사귀책/저신뢰/킬스위치→escalate · idempotency raise · not-actionable raise · fail-closed(정책없음) raise ·
  admin schedule/reject(기록) · 비관리자 unauthorized · reverse 원복+상쇄 · in_progress/completed 가역 raise ·
  append-only 차단.
- `tests/e2e/phase8-as-flow.test.ts` — AS 접수 → 자동 트리아지(예약/에스컬레이션) → 관리자 수동 → 가역.
  서버 `decideAsTriage` ≡ DB 결정 단언. 기존 페이즈 회귀 통과.

## 11. 검증 / 완료 기준 (DoD)

- `tsc 0` · `lint 0` · 전체 vitest 0 실패(신규 포함) · `next build` green.
- RED→GREEN: `0014` 적용 전 신규 RPC/RLS 테스트 실패 → 후 통과.
- 적대적 다중렌즈 검증.

## 12. 보안 로드맵 주의 (8-1과 공유)

`0002_rls.sql`의 `as_update`는 **시공사(본인)·공급사(해당 order_item 공급)·관리자**의 `as_requests`
self-update를 허용한다(컬럼 가드·전이 트리거 없음). 본 페이즈에서 `scheduled`/`rejected`는 **금전을
직접 움직이지 않으므로**(배차·기사 비용 연동은 범위 외) 위험이 없고, self-flip은 감사
`as_triage_decision`도 남기지 않는다. 그러나 **향후 AS 상태를 실제 배차·정산과 연동하는 페이즈에서는**
status 전이 트리거(예약/거부는 관리자·RPC만)를 반드시 추가할 것. (8-1의 `returns` self-flip 주의와 동일.)
