# 상태 전이 가드 (Status Transition Guard) 설계 — spec §12 후속

> 2026-06-11 · 자재(Jajae) · Phase 8-1/8-2 트리아지 스펙 §12의 보안 로드맵 항목 구현

## 1. 배경 / 목표

`0002_rls.sql`의 `returns_update`·`as_update` 정책은 **행 단위**(컬럼 단위 아님)라,
`contractor_id = auth.uid()` 또는 `supplies_order_item(...)`(공급사)인 사용자가 자신의
`returns`/`as_requests` 행에서 **임의 컬럼(= `status` 포함)을 직접 변경**할 수 있다.

→ 시공사가 `update returns set status='approved'`로 **자기 환불을 자가 승인**하거나, 공급사/시공사가
`update as_requests set status='scheduled'`로 자가 예약하여 트리아지 RPC(0013/0014)를 우회할 수 있다.

본 페이즈에서 `status`는 금전을 직접 움직이지 않으나(환급 집행·배차/정산은 범위 외), **향후 연동 시
악용 가능**하므로 트리아지 스펙 §12가 "연동 전 전이 트리거 필수"로 명시했다. 이를 **선제적으로** 구현한다.

## 2. 목표 / 비목표

- **목표:** 비신뢰 호출자(시공사·공급사)가 `returns.status`·`as_requests.status`를 **직접** 바꾸지
  못하게 차단. 정상 전이(승인/예약/거부/가역)는 모두 admin/service 컨텍스트의 SECURITY DEFINER
  트리아지 RPC를 경유하므로 영향 없음. 비-`status` 필드(reason/qty/issue) 자가 편집은 **그대로 허용**.
- **비목표(YAGNI):** 비신뢰 actor의 일부 합법 전이 허용(예: 공급사가 AS를 `scheduled→in_progress→
  completed`). 현재 그런 흐름이 없으므로 **모든 비신뢰 status 변경을 차단**한다. 실제 필요해지면 그때
  명시적 허용을 추가한다.

## 3. 설계 (마이그레이션 `0015_status_transition_guard.sql`, additive)

`0012_admin_privilege_guard.sql`의 `prevent_profile_privilege_escalation`를 **그대로 미러링**한다
(이미 검증된 패턴 — admin-gate 테스트 green).

각 테이블에 `BEFORE UPDATE` 트리거 1개:

```
if auth.role() = 'service_role' or public.is_admin() then
  return NEW;                 -- 신뢰 백엔드/관리자(= SECURITY DEFINER 트리아지 RPC 포함)
end if;
if NEW.status is distinct from OLD.status then
  raise exception '<table> status can only be changed by an admin';
end if;
return NEW;                   -- status 외 컬럼 편집은 허용
```

- `returns` → `public.guard_return_status_transition()` + 트리거 `trg_returns_status_guard`
- `as_requests` → `public.guard_as_request_status_transition()` + 트리거 `trg_as_requests_status_guard`

**왜 정상 흐름을 안 깨는가:**
- 앱/lib 코드 어디에도 returns/as_requests의 `status`를 직접 UPDATE하는 곳이 없음(전부 트리아지 RPC).
- 트리아지 RPC 4종(`triage_auto_resolve_return`/`triage_admin_resolve_return`/`triage_reverse_resolution`,
  AS 3종)은 `auth.role()='service_role'`(자동 실행은 service 클라이언트) 또는 admin 호출 → 가드 통과.
- `seed.sql`은 returns/as_requests를 INSERT/UPDATE하지 않음 → 시드 로드 영향 없음.

## 4. 테스트 (TDD · 회귀 불변)

`tests/db/status-transition-guard.test.ts` (PGlite):
- 시공사 직접 `update returns set status='approved'` → **raise**, status는 'requested' 유지.
- 시공사 직접 `update as_requests set status='scheduled'` → **raise**.
- 공급사(supplies_order_item) 직접 `update as_requests set status` → **raise** (§12 공급사 벡터).
- 시공사 비-status 편집(`update returns set reason=...`) → **허용**.
- 관리자 직접 `update returns set status='approved'` → **허용**.
- 회귀: 트리아지 RPC(관리자 호출) status 전이가 가드 하에서도 정상 동작.
- 기존 278 테스트 전부 유지(전체 스위트 회귀).

## 5. 검증 / 완료 기준 (DoD)

- `tsc 0` · `lint 0` · 전체 vitest 0 실패(신규 포함) · `next build` green.
- RED→GREEN: `0015` 적용 **전** 신규 가드 테스트 실패(자가변경이 통과됨) → 적용 **후** 통과.
- 적대적 리뷰.

## 6. 향후 (잔여 §12)

`status` 전이 트리거가 있어도, **실제 환급 집행(에스크로 해제)·AS 배차/정산** 연동 시에는 추가로
각 전이의 의미(누가 어떤 상태로)별 세분화가 필요할 수 있다(예: 공급사 AS 진행 허용). 그 시점에 본
가드를 확장한다.
