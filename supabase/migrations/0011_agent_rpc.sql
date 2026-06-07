-- 자재(Jajae) Phase 7 follow-up — atomic agent execution via plpgsql RPCs.
-- ADDITIVE. Completes three deferred items together:
--   (1) approve spend counts toward spend_cap (total agent-originated spend capped);
--   (2) order+PO+action are atomic — a policy breach / mid-sequence failure rolls
--       back fully (no orphan rows, no bricked decision);
--   (3) the order is attributed to the decision's contractor (not the caller).
-- Per-item limits (max_po / allowlist / kill-switch) remain human-overridable via
-- approval; spend_cap is the single ceiling that approvals also respect.

-- (3) orders_insert: allow admins to create an order on a contractor's behalf.
drop policy if exists orders_insert on orders;
create policy orders_insert on orders for insert
  with check (contractor_id = auth.uid() or public.is_admin());

-- Policy trigger: gate auto-executed AND human-approved actions. Only auto actions
-- are subject to kill-switch / max_po / allowlist; spend_cap (cumulative over both)
-- applies to both.
create or replace function public.enforce_agent_policy() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_status     text;
  v_contractor uuid;
  v_subtotal   numeric;
  v_supplier   uuid;
  v_maxpo      numeric;
  v_spendcap   numeric;
  v_spent      numeric;
  v_enabled    boolean;
  v_allow      text[];
begin
  select status, contractor_id into v_status, v_contractor
    from agent_decisions where id = NEW.decision_id;
  -- only agent-originated executed actions are policy-gated here
  if v_status not in ('auto_executed', 'approved') then
    return NEW;
  end if;

  -- FOR UPDATE serializes concurrent agent-PO inserts per contractor (TOCTOU guard)
  select max_po, spend_cap, enabled, supplier_allowlist
    into v_maxpo, v_spendcap, v_enabled, v_allow
    from agent_policies where contractor_id = v_contractor
    for update;
  -- Fail closed: with no policy row, spend_cap is NULL and `> NULL` would be a
  -- silent no-op — so an agent-originated action with no policy is DENIED. (The
  -- approve path is gated only by spend_cap, so this is its sole ceiling.)
  if not found then
    raise exception 'agent policy not configured';
  end if;

  if NEW.po_id is not null then
    select subtotal, supplier_id into v_subtotal, v_supplier
      from purchase_orders where id = NEW.po_id;
  end if;

  -- autonomy-only gates: a human approval overrides per-item limits + kill-switch
  if v_status = 'auto_executed' then
    if v_enabled is distinct from true then
      raise exception 'agent autonomy disabled (kill-switch)';
    end if;
    if NEW.po_id is not null then
      if v_subtotal > v_maxpo then
        raise exception 'auto-PO % exceeds max_po policy %', v_subtotal, v_maxpo;
      end if;
      if array_length(v_allow, 1) is not null
         and not (v_supplier::text = any(v_allow)) then
        raise exception 'supplier % not in policy allowlist', v_supplier;
      end if;
    end if;
  end if;

  -- spend_cap bounds TOTAL agent-originated spend (auto + approved), net of
  -- reversals — the one ceiling human approvals also respect.
  if NEW.po_id is not null then
    select coalesce(sum(po.subtotal), 0) into v_spent
      from agent_actions a
      join agent_decisions d on d.id = a.decision_id
      join purchase_orders po on po.id = a.po_id
      where d.contractor_id = v_contractor
        and d.status in ('auto_executed', 'approved')
        and a.reversed = false;
    if v_spent + v_subtotal > v_spendcap then
      raise exception
        'agent-PO would exceed spend_cap policy % (already committed %)',
        v_spendcap, v_spent;
    end if;
  end if;

  return NEW;
end;
$$;

-- ---------- atomic execution RPCs (SECURITY DEFINER) ----------
-- Each runs as a single transaction: any raise (incl. from the policy trigger)
-- rolls back every write in the function.

create or replace function public.agent_execute_auto(
  p_contractor uuid,
  p_supplier uuid,
  p_amount numeric,
  p_rationale text,
  p_plan jsonb,
  p_reversible_until timestamptz
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  v_order uuid;
  v_po    uuid;
  v_dec   uuid;
begin
  if p_contractor is distinct from auth.uid() and not public.is_admin() then
    raise exception 'unauthorized';
  end if;
  insert into orders (contractor_id, payment_method, status, subtotal, total)
    values (p_contractor, 'escrow', 'pending', p_amount, p_amount)
    returning id into v_order;
  insert into purchase_orders (order_id, supplier_id, status, subtotal)
    values (v_order, p_supplier, 'pending', p_amount)
    returning id into v_po;
  insert into agent_decisions (contractor_id, action, rationale, status, plan)
    values (p_contractor, 'reorder', p_rationale, 'auto_executed', p_plan)
    returning id into v_dec;
  -- enforce_agent_policy fires here; a violation raises -> full rollback
  insert into agent_actions (decision_id, po_id, reversible_until)
    values (v_dec, v_po, p_reversible_until);
  insert into agent_audit_log (contractor_id, decision_id, action, amount)
    values (p_contractor, v_dec, 'auto_po', p_amount);
  return v_po;
end;
$$;

create or replace function public.agent_approve_decision(
  p_decision_id uuid,
  p_reversible_until timestamptz
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  v_contractor uuid;
  v_status     text;
  v_plan       jsonb;
  v_amount     numeric;
  v_supplier   uuid;
  v_order      uuid;
  v_po         uuid;
begin
  select contractor_id, status, plan into v_contractor, v_status, v_plan
    from agent_decisions where id = p_decision_id for update;
  if v_contractor is null then raise exception 'decision not found'; end if;
  if v_contractor is distinct from auth.uid() and not public.is_admin() then
    raise exception 'unauthorized';
  end if;
  if v_status <> 'escalated' then
    raise exception 'decision not actionable (status=%)', v_status;
  end if;

  v_amount   := (v_plan->>'amount')::numeric;
  v_supplier := (v_plan->>'supplierId')::uuid;

  -- mark approved FIRST so the policy trigger gates this as agent-originated spend
  update agent_decisions set status = 'approved' where id = p_decision_id;

  insert into orders (contractor_id, payment_method, status, subtotal, total)
    values (v_contractor, 'escrow', 'pending', v_amount, v_amount)
    returning id into v_order;
  insert into purchase_orders (order_id, supplier_id, status, subtotal)
    values (v_order, v_supplier, 'pending', v_amount)
    returning id into v_po;
  -- spend_cap enforced here (max_po/allowlist bypassed for approvals); a breach
  -- raises -> whole txn rolls back -> status reverts to escalated (retryable)
  insert into agent_actions (decision_id, po_id, reversible_until)
    values (p_decision_id, v_po, p_reversible_until);
  insert into agent_audit_log (contractor_id, decision_id, action, amount)
    values (v_contractor, p_decision_id, 'approve_execute', v_amount);
  return v_po;
end;
$$;

create or replace function public.agent_reject_decision(p_decision_id uuid)
  returns void
  language plpgsql security definer set search_path = public as $$
declare
  v_contractor uuid;
  v_status     text;
begin
  select contractor_id, status into v_contractor, v_status
    from agent_decisions where id = p_decision_id for update;
  if v_contractor is null then raise exception 'decision not found'; end if;
  if v_contractor is distinct from auth.uid() and not public.is_admin() then
    raise exception 'unauthorized';
  end if;
  if v_status <> 'escalated' then
    raise exception 'decision not actionable (status=%)', v_status;
  end if;
  update agent_decisions set status = 'rejected' where id = p_decision_id;
  insert into agent_audit_log (contractor_id, decision_id, action, amount)
    values (v_contractor, p_decision_id, 'reject', 0);
end;
$$;

create or replace function public.agent_reverse_action(p_action_id uuid)
  returns void
  language plpgsql security definer set search_path = public as $$
declare
  v_decision   uuid;
  v_po         uuid;
  v_reversed   boolean;
  v_until      timestamptz;
  v_contractor uuid;
  v_orderid    uuid;
  v_amount     numeric := 0;
begin
  select a.decision_id, a.po_id, a.reversed, a.reversible_until, d.contractor_id
    into v_decision, v_po, v_reversed, v_until, v_contractor
    from agent_actions a join agent_decisions d on d.id = a.decision_id
    where a.id = p_action_id for update;
  if v_decision is null then raise exception 'action not found'; end if;
  if v_contractor is distinct from auth.uid() and not public.is_admin() then
    raise exception 'unauthorized';
  end if;
  if v_reversed then raise exception 'action already reversed'; end if;
  if v_until < now() then raise exception 'reversal window passed'; end if;

  if v_po is not null then
    select order_id, subtotal into v_orderid, v_amount
      from purchase_orders where id = v_po;
    if exists (select 1 from fulfillment_routes
               where order_id = v_orderid and status = 'dispatched') then
      raise exception 'order already dispatched; cannot reverse';
    end if;
    update purchase_orders set status = 'cancelled' where id = v_po;
    -- cancel the parent order too, so a reversal leaves no orphan 'pending' order
    update orders set status = 'cancelled' where id = v_orderid;
  end if;
  update agent_actions set reversed = true where id = p_action_id;
  insert into agent_audit_log (contractor_id, decision_id, action, amount)
    values (v_contractor, v_decision, 'reversal', coalesce(v_amount, 0));
end;
$$;

-- Postgres grants EXECUTE to PUBLIC by default; revoke so the in-function
-- auth.uid() guard is not the only thing standing between anon and these RPCs.
revoke execute on function
  public.agent_execute_auto(uuid, uuid, numeric, text, jsonb, timestamptz),
  public.agent_approve_decision(uuid, timestamptz),
  public.agent_reject_decision(uuid),
  public.agent_reverse_action(uuid)
  from public;
grant execute on function
  public.agent_execute_auto(uuid, uuid, numeric, text, jsonb, timestamptz),
  public.agent_approve_decision(uuid, timestamptz),
  public.agent_reject_decision(uuid),
  public.agent_reverse_action(uuid)
  to authenticated, service_role;
