# 자율 조달 에이전트 — 지출 cap 정합·트랜잭션 원자화·소유 귀속 설계

날짜: 2026-06-08
범위: Phase 7 자율 조달 에이전트의 코드리뷰 후속 3건 (별도 범위로 분리되어 있던 항목)

## 배경

직전 커밋(`fdac3a9`)에서 spend_cap 누적 미적용·승인 멱등성 P0 2건과 적대적 검증 정합성
이슈를 수정했으나, 다음 3건은 "설계/아키텍처 결정"으로 보류했다. 본 작업에서 완성한다.

1. **approve 지출의 cap 산입** — 현재 spend_cap은 `auto_executed`(자율) 지출만 묶고,
   사람이 승인한 에스컬레이션 지출은 cap 밖. → **에이전트 발기 지출 총량**(자율+승인)을
   cap으로 묶는다.
2. **동시성 orphan / 트랜잭션화** — order+PO+action 이 비원자적이라 (a) 승인 중 일시 실패 시
   order/PO orphan, (b) 동시 이중 승인 시 중복 order/PO. → RPC(plpgsql)로 원자화.
3. **decision.contractor_id 귀속** — 승인 시 order.contractor_id 가 호출자(user.id)로 들어가
   관리자 대리승인 시 소유가 틀어짐. orders_insert RLS에 is_admin() 선행 후, 주문을
   결정 소유자에게 귀속.

## 핵심 통찰: 한 번의 RPC 원자화로 3건 동시 해결

승인 경로를 단일 plpgsql 함수(트랜잭션) 안에서
`status='approved'` → order → PO → action → audit 순으로 실행하면:
- 트리거 `enforce_agent_policy`가 action insert 시점에 status='approved'를 보고 **spend_cap 적용**(항목1).
- 함수 전체가 한 트랜잭션 → spend_cap 위반/일시 실패 시 **전부 롤백**(status는 escalated로 복귀)
  → orphan/brick 제거(항목2).
- SECURITY DEFINER 함수가 order.contractor_id = 결정 소유자로 기록(항목3).

## 설계 결정 (DR)

- **DR-1 (하드 캡):** spend_cap = 에이전트 발기 지출 총량의 단일 상한.
  - cumulative = Σ(auto_executed + approved, 미취소 PO subtotal).
  - 자율 실행(auto)·사람 승인(approve) **둘 다** spend_cap을 초과하면 거부.
  - 단, **per-item 한도(max_po·allowlist·escalation_threshold)는 사람 승인이 오버라이드** 가능
    (에스컬레이션의 목적). spend_cap만이 사람도 못 넘는 총량 천장.
  - 대안(소프트 캡: 승인은 cap 산입하되 차단 안 함)은 채택하지 않음. 필요 시 트리거의
    approved 분기에서 spend_cap raise 한 줄 제거로 전환 가능(문서화).
- **DR-2 (킬스위치 범위):** 킬스위치(enabled=false)는 **자율(auto) 실행만** 정지.
  사람 승인은 명시적 인간 행위이므로 허용. (승인도 막고 싶으면 approved 분기에 enabled 체크 추가.)
- **DR-3 (RPC 권한):** 모든 RPC는 SECURITY DEFINER. 내부에서 `auth.uid()`로
  `contractor_id = auth.uid() or is_admin()` 검증(SECURITY DEFINER가 RLS를 우회하므로 필수).

## 구현

### 마이그레이션 0011_agent_rpc.sql (additive)
- `orders_insert` RLS: `with check (contractor_id = auth.uid() or public.is_admin())` 로 교체.
- `enforce_agent_policy()` 재정의:
  - gated status 집합을 `('auto_executed','approved')`로 확장.
  - auto_executed에만 kill-switch·max_po·allowlist 적용.
  - spend_cap은 auto+approved 양쪽에 적용, cumulative는 두 status 합산(미취소).
  - 정책행 `for update` 유지(TOCTOU 직렬화).
- RPC 함수 4종 (SECURITY DEFINER, search_path=public, grant execute to authenticated):
  - `agent_execute_auto(contractor, supplier, amount, rationale, plan jsonb, reversible_until) → po uuid`
  - `agent_approve_decision(decision_id, reversible_until) → po uuid`
  - `agent_reject_decision(decision_id) → void`
  - `agent_reverse_action(action_id) → void` (취소 PO subtotal을 reversal amount로 기록)

### 서버 라우트 (얇은 래퍼로 축소)
- `app/api/agent/run/route.ts`: auto 항목마다 `rpc('agent_execute_auto', …)` 호출.
  alreadySpent는 `sumNetAgentSpend`(auto_po+approve_execute−reversal)로 계산.
- `app/api/agent/decision/[id]/route.ts`: approve→`rpc('agent_approve_decision')`,
  reject→`rpc('agent_reject_decision')`. 에러 메시지를 409/422/500로 매핑.
- `app/api/agent/action/[id]/reverse/route.ts`: `rpc('agent_reverse_action')`.

### lib/policy
- `sumNetAutoSpend` → `sumNetAgentSpend`로 개명 + `approve_execute` 가산.

## 테스트 (TDD, PGlite DB 레이어 — RPC가 트랜잭션/트리거를 그대로 실행)
신규 `tests/db/phase7-rpc.test.ts`:
- auto: RPC가 order+PO+decision+action+audit 원자 생성; over-cap auto는 raise + **롤백(주문 0건)**.
- approve: escalated 승인 원자 실행; **승인 지출이 cap에 산입**(이후 auto가 막힘);
  **승인이 cap 초과 시 raise + 롤백(status=escalated 유지, orphan 0)**; 비-escalated 승인 raise;
  타인 결정 승인 unauthorized raise; per-item(max_po) 초과는 승인으로 통과(오버라이드).
- reject: escalated만 reject; 그 외 raise.
- reverse: 취소+correct amount; 이중 reverse raise; dispatched raise.
- 동시성(이중 승인): for-update+status 체크로 2번째 raise(단일 커넥션 PGlite 한계는 주석).
기존 `tests/db/phase7-rls.test.ts`의 "approved bypasses" 케이스는 신규 의미(approved는 spend_cap
준수)로 갱신. `tests/unit/policy.test.ts`는 개명 반영.

## 검증/완료 기준
- `tsc --noEmit` 0, 전체 vitest 0 실패, `next build` 0 에러.
- RED→GREEN(0011 적용 전 신규 RPC 테스트 실패 → 적용 후 통과).
- 적대적 검증(다중 렌즈) 후 발견 이슈 반영.
