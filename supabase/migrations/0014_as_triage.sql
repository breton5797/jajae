-- 자재(Jajae) Phase 8-2 — AS 자동 트리아지. ADDITIVE.
-- 분류기는 제안만; DB가 정책을 재검증해 결정한다. 자동 결과는 '공급사/배송 귀책·고신뢰'의 자동
-- 예약(requested→scheduled)뿐이고 그 외는 escalate(status 유지 + 로그). fail-closed: 정책 행 없으면
-- raise. as_triage_decisions는 append-only(prevent_audit_mutation 재사용). 금액/상한 개념 없음.

-- ---------- tables ----------
create table if not exists as_triage_policies (
  id             uuid primary key default gen_random_uuid(),
  singleton      boolean not null default true,
  min_confidence numeric not null default 0.8 check (min_confidence >= 0 and min_confidence <= 1),
  enabled        boolean not null default false,
  created_at     timestamptz not null default now(),
  constraint as_triage_policies_singleton unique (singleton)
);

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

-- 정책 단일 행 시드(비활성)
insert into as_triage_policies (singleton, min_confidence, enabled)
  values (true, 0.8, false)
  on conflict (singleton) do nothing;

-- ---------- append-only audit (0008 트리거 함수 재사용) ----------
drop trigger if exists trg_as_triage_decisions_noupd on as_triage_decisions;
create trigger trg_as_triage_decisions_noupd
  before update or delete on as_triage_decisions
  for each row execute function public.prevent_audit_mutation();

-- ---------- RLS ----------
alter table as_triage_policies  enable row level security;
alter table as_triage_decisions enable row level security;

create policy as_triagepol_all on as_triage_policies for all
  using (public.is_admin()) with check (public.is_admin());

create policy as_triagedec_select on as_triage_decisions for select
  using (
    public.is_admin()
    or exists (
      select 1 from as_requests r
      where r.id = as_triage_decisions.as_request_id and r.contractor_id = auth.uid()
    )
  );
