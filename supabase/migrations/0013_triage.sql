-- 자재(Jajae) Phase 8-1 — 반품 자동 트리아지 (return auto-triage). ADDITIVE.
-- 분류기(AI/폴백)는 제안만; DB가 정책을 재검증해 결정한다. 자동 결과는 '상한 내 명백
-- 승인'뿐이고 그 외는 escalate(status='requested' 유지 + 로그). fail-closed: 정책 행
-- 없으면 raise. triage_decisions는 append-only(prevent_audit_mutation 재사용).
-- 에스컬레이션은 새 status 값이 아니라 decision='escalate' 로그로 표현(enum 불변).

-- ---------- tables ----------
create table if not exists triage_policies (
  id               uuid primary key default gen_random_uuid(),
  singleton        boolean not null default true,
  auto_approve_cap numeric not null default 0 check (auto_approve_cap >= 0),
  min_confidence   numeric not null default 0.8 check (min_confidence >= 0 and min_confidence <= 1),
  enabled          boolean not null default false,
  created_at       timestamptz not null default now(),
  constraint triage_policies_singleton unique (singleton)
);

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
  actor          uuid references profiles(id),
  created_at     timestamptz not null default now()
);
create index if not exists triage_decisions_return_idx on triage_decisions(return_id);

-- 정책 단일 행 시드(비활성·상한 0 → 관리자가 켜기 전까지 자동승인 0건)
insert into triage_policies (singleton, auto_approve_cap, min_confidence, enabled)
  values (true, 0, 0.8, false)
  on conflict (singleton) do nothing;

-- ---------- append-only audit (0008 트리거 함수 재사용) ----------
drop trigger if exists trg_triage_decisions_noupd on triage_decisions;
create trigger trg_triage_decisions_noupd
  before update or delete on triage_decisions
  for each row execute function public.prevent_audit_mutation();

-- ---------- RLS ----------
alter table triage_policies  enable row level security;
alter table triage_decisions enable row level security;

create policy triagepol_all on triage_policies for all
  using (public.is_admin()) with check (public.is_admin());

-- 시공사는 본인 반품의 트리아지 결과만, 관리자는 전체 select. 쓰기는 SECURITY DEFINER
-- RPC만(직접 insert 정책 없음 → RLS 기본 거부), update/delete는 append-only 트리거가 차단.
create policy triagedec_select on triage_decisions for select
  using (
    public.is_admin()
    or exists (
      select 1 from returns r
      where r.id = triage_decisions.return_id and r.contractor_id = auth.uid()
    )
  );

-- ---------- RPC: 자동 경로 (DB가 approve vs escalate 결정) ----------
create or replace function public.triage_auto_resolve_return(
  p_return_id uuid,
  p_proposed_decision text,
  p_responsibility text,
  p_confidence numeric,
  p_rationale text
) returns text
  language plpgsql security definer set search_path = public as $$
declare
  v_status   text;
  v_qty      int;
  v_unit     numeric;
  v_refund   numeric;
  v_enabled  boolean;
  v_cap      numeric;
  v_minconf  numeric;
  v_decision text;
begin
  if not (auth.role() = 'service_role' or public.is_admin()) then
    raise exception 'unauthorized';
  end if;

  select status, qty into v_status, v_qty
    from returns where id = p_return_id for update;
  if not found then raise exception 'return not found'; end if;
  if exists (select 1 from triage_decisions where return_id = p_return_id) then
    raise exception 'return already triaged';
  end if;
  if v_status <> 'requested' then
    raise exception 'return not actionable (status=%)', v_status;
  end if;

  select oi.unit_price_snapshot into v_unit
    from order_items oi
    join returns r on r.order_item_id = oi.id
    where r.id = p_return_id;
  v_refund := v_qty * v_unit;

  select enabled, auto_approve_cap, min_confidence
    into v_enabled, v_cap, v_minconf
    from triage_policies where singleton = true;
  if not found then raise exception 'triage policy not configured'; end if;

  if v_enabled
     and p_proposed_decision = 'approve'
     and p_confidence >= v_minconf
     and v_refund <= v_cap then
    v_decision := 'approve';
  else
    v_decision := 'escalate';
  end if;

  if v_decision = 'approve' then
    update returns set status = 'approved' where id = p_return_id;
  end if;

  insert into triage_decisions
    (return_id, source, decision, responsibility, confidence, rationale, refund_amount)
    values (p_return_id, 'auto', v_decision, p_responsibility, p_confidence, p_rationale, v_refund);

  return v_decision;
end;
$$;

-- ---------- RPC: 관리자 수동 결정 (상한 오버라이드 가능, 전부 기록) ----------
create or replace function public.triage_admin_resolve_return(
  p_return_id uuid,
  p_decision text
) returns void
  language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_qty    int;
  v_unit   numeric;
begin
  if not (auth.role() = 'service_role' or public.is_admin()) then
    raise exception 'unauthorized';
  end if;
  if p_decision not in ('approve','reject') then
    raise exception 'invalid decision %', p_decision;
  end if;
  select status, qty into v_status, v_qty from returns where id = p_return_id for update;
  if not found then raise exception 'return not found'; end if;
  if v_status <> 'requested' then
    raise exception 'return not actionable (status=%)', v_status;
  end if;
  select oi.unit_price_snapshot into v_unit
    from order_items oi join returns r on r.order_item_id = oi.id
    where r.id = p_return_id;

  update returns
    set status = (case when p_decision = 'approve' then 'approved' else 'rejected' end)::return_status
    where id = p_return_id;
  insert into triage_decisions
    (return_id, source, decision, responsibility, confidence, rationale, refund_amount, actor)
    values (p_return_id, 'admin', p_decision, 'ambiguous', 1, '관리자 수동 결정', v_qty * v_unit, auth.uid());
end;
$$;

-- ---------- RPC: 관리자 가역 (직전 적용 결정 되돌리기) ----------
create or replace function public.triage_reverse_resolution(p_return_id uuid)
  returns void
  language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_dec    uuid;
  v_refund numeric;
begin
  if not (auth.role() = 'service_role' or public.is_admin()) then
    raise exception 'unauthorized';
  end if;
  select status into v_status from returns where id = p_return_id for update;
  if not found then raise exception 'return not found'; end if;
  if v_status = 'completed' then
    raise exception 'return already completed; cannot reverse';
  end if;
  -- 직전 적용 결정(approve/reject, 아직 상쇄되지 않음)
  select d.id, d.refund_amount into v_dec, v_refund
    from triage_decisions d
    where d.return_id = p_return_id
      and d.source in ('auto','admin')
      and d.decision in ('approve','reject')
      and not exists (select 1 from triage_decisions x where x.reversed_of = d.id)
    order by d.created_at desc
    limit 1;
  if v_dec is null then raise exception 'no active resolution to reverse'; end if;

  update returns set status = 'requested' where id = p_return_id;
  insert into triage_decisions
    (return_id, source, decision, responsibility, confidence, rationale, refund_amount, reversed_of, actor)
    values (p_return_id, 'reversal', 'escalate', 'ambiguous', 0, '관리자 가역', v_refund, v_dec, auth.uid());
end;
$$;

-- ---------- grants (PUBLIC 기본 EXECUTE 회수 후 authenticated/service_role만) ----------
revoke execute on function
  public.triage_auto_resolve_return(uuid, text, text, numeric, text),
  public.triage_admin_resolve_return(uuid, text),
  public.triage_reverse_resolution(uuid)
  from public;
grant execute on function
  public.triage_auto_resolve_return(uuid, text, text, numeric, text),
  public.triage_admin_resolve_return(uuid, text),
  public.triage_reverse_resolution(uuid)
  to authenticated, service_role;
