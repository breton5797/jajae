-- 자재(Jajae) Phase 7 hardening (code-review P0). ADDITIVE & data-preserving.
-- Closes two DB-layer gaps the original 0009 trigger left open:
--   (1) spend_cap was never enforced cumulatively — only max_po / allowlist /
--       kill-switch were checked, so repeated runs could exceed the period cap;
--   (2) nothing stopped a decision from spawning more than one executed action,
--       so a duplicate approval / re-run could mint a second auto-PO.

-- (1) One executed action per decision: duplicate auto-PO backstop.
create unique index if not exists agent_actions_decision_uniq
  on agent_actions(decision_id);

-- (2) DB-LAYER policy enforcement — now also caps CUMULATIVE autonomous spend.
-- Sums prior auto-executed, non-reversed PO subtotals for the contractor and
-- rejects an auto-PO that would push the running total past spend_cap.
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
  if v_status is distinct from 'auto_executed' then
    return NEW; -- only auto-executed actions are policy-gated here
  end if;

  -- FOR UPDATE serializes concurrent auto-PO inserts for the same contractor,
  -- so the cumulative-spend check below is not a check-then-act race (TOCTOU).
  select max_po, spend_cap, enabled, supplier_allowlist
    into v_maxpo, v_spendcap, v_enabled, v_allow
    from agent_policies where contractor_id = v_contractor
    for update;

  if v_enabled is distinct from true then
    raise exception 'agent autonomy disabled (kill-switch)';
  end if;

  if NEW.po_id is not null then
    select subtotal, supplier_id into v_subtotal, v_supplier
      from purchase_orders where id = NEW.po_id;
    if v_subtotal > v_maxpo then
      raise exception 'auto-PO % exceeds max_po policy %', v_subtotal, v_maxpo;
    end if;
    if array_length(v_allow, 1) is not null
       and not (v_supplier::text = any(v_allow)) then
      raise exception 'supplier % not in policy allowlist', v_supplier;
    end if;

    -- cumulative autonomous spend (this run + every prior auto-executed,
    -- non-reversed action) must stay within spend_cap.
    select coalesce(sum(po.subtotal), 0) into v_spent
      from agent_actions a
      join agent_decisions d on d.id = a.decision_id
      join purchase_orders po on po.id = a.po_id
      where d.contractor_id = v_contractor
        and d.status = 'auto_executed'
        and a.reversed = false;
    if v_spent + v_subtotal > v_spendcap then
      raise exception
        'auto-PO would exceed spend_cap policy % (already committed %)',
        v_spendcap, v_spent;
    end if;
  end if;

  return NEW;
end;
$$;
