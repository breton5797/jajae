-- 자재(Jajae) Phase 7 — autonomous procurement agent, fulfillment hubs, oversight.
-- ADDITIVE & data-preserving. Policy limits are enforced in the DB layer (trigger),
-- not prompt-only. agent_audit_log is append-only (reuses prevent_audit_mutation).

-- ---------- policy + agent ----------
create table if not exists agent_policies (
  id                   uuid primary key default gen_random_uuid(),
  contractor_id        uuid not null references profiles(id) on delete cascade unique,
  spend_cap            numeric not null default 0 check (spend_cap >= 0),
  supplier_allowlist   text[] not null default '{}',
  max_po               numeric not null default 0 check (max_po >= 0),
  escalation_threshold numeric not null default 0 check (escalation_threshold >= 0),
  category_limits      jsonb not null default '{}'::jsonb,
  enabled              boolean not null default false,
  created_at           timestamptz not null default now()
);

create table if not exists agent_decisions (
  id            uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references profiles(id) on delete cascade,
  input         jsonb not null default '{}'::jsonb,
  plan          jsonb not null default '{}'::jsonb,
  action        text not null default '',
  rationale     text not null default '',
  status        text not null default 'pending',
  created_at    timestamptz not null default now()
);

create table if not exists agent_actions (
  id               uuid primary key default gen_random_uuid(),
  decision_id      uuid not null references agent_decisions(id) on delete cascade,
  po_id            uuid references purchase_orders(id) on delete set null,
  executed_at      timestamptz not null default now(),
  reversible_until timestamptz not null,
  reversed         boolean not null default false
);

-- ---------- fulfillment hubs ----------
create table if not exists hubs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  location   text not null default '',
  lat        numeric,
  lng        numeric,
  capacity   int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists hub_inventory (
  id         uuid primary key default gen_random_uuid(),
  hub_id     uuid not null references hubs(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  qty        int not null default 0 check (qty >= 0),
  unique (hub_id, product_id)
);

create table if not exists fulfillment_routes (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  source_type text not null,
  hub_id      uuid references hubs(id) on delete set null,
  eta         date,
  status      text not null default 'planned',
  created_at  timestamptz not null default now()
);

-- ---------- immutable agent audit ----------
create table if not exists agent_audit_log (
  id            uuid primary key default gen_random_uuid(),
  contractor_id uuid,
  decision_id   uuid,
  action        text not null,
  amount        numeric not null default 0,
  detail        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

drop trigger if exists trg_agent_audit_immutable on agent_audit_log;
create trigger trg_agent_audit_immutable
  before update or delete on agent_audit_log
  for each row execute function public.prevent_audit_mutation();

create index if not exists idx_agentdec_contractor on agent_decisions(contractor_id);
create index if not exists idx_agentact_decision   on agent_actions(decision_id);
create index if not exists idx_hubinv_hub          on hub_inventory(hub_id);
create index if not exists idx_routes_order        on fulfillment_routes(order_id);
create index if not exists idx_agentaudit_contractor on agent_audit_log(contractor_id);

-- ---------- DB-LAYER policy enforcement ----------
-- An auto-executed agent action cannot violate the contractor's policy, even if a
-- (prompt-driven) planner proposes it: kill-switch off, max_po, and supplier
-- allowlist are checked here in the database before the action is recorded.
create or replace function public.enforce_agent_policy() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_status     text;
  v_contractor uuid;
  v_subtotal   numeric;
  v_supplier   uuid;
  v_maxpo      numeric;
  v_enabled    boolean;
  v_allow      text[];
begin
  select status, contractor_id into v_status, v_contractor
    from agent_decisions where id = NEW.decision_id;
  if v_status is distinct from 'auto_executed' then
    return NEW; -- only auto-executed actions are policy-gated here
  end if;

  select max_po, enabled, supplier_allowlist into v_maxpo, v_enabled, v_allow
    from agent_policies where contractor_id = v_contractor;

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
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_enforce_agent_policy on agent_actions;
create trigger trg_enforce_agent_policy
  before insert on agent_actions
  for each row execute function public.enforce_agent_policy();

-- ---------- RLS ----------
alter table agent_policies     enable row level security;
alter table agent_decisions    enable row level security;
alter table agent_actions      enable row level security;
alter table hubs               enable row level security;
alter table hub_inventory      enable row level security;
alter table fulfillment_routes enable row level security;
alter table agent_audit_log    enable row level security;

create policy agentpol_all on agent_policies for all
  using (contractor_id = auth.uid() or public.is_admin())
  with check (contractor_id = auth.uid() or public.is_admin());

create policy agentdec_select on agent_decisions for select
  using (contractor_id = auth.uid() or public.is_admin());
create policy agentdec_insert on agent_decisions for insert
  with check (contractor_id = auth.uid() or public.is_admin());
create policy agentdec_update on agent_decisions for update
  using (contractor_id = auth.uid() or public.is_admin())
  with check (contractor_id = auth.uid() or public.is_admin());

create policy agentact_select on agent_actions for select
  using (
    public.is_admin()
    or exists (select 1 from agent_decisions d
               where d.id = decision_id and d.contractor_id = auth.uid())
  );
create policy agentact_write on agent_actions for all
  using (
    public.is_admin()
    or exists (select 1 from agent_decisions d
               where d.id = decision_id and d.contractor_id = auth.uid())
  )
  with check (
    public.is_admin()
    or exists (select 1 from agent_decisions d
               where d.id = decision_id and d.contractor_id = auth.uid())
  );

-- hubs + inventory: readable by authenticated B2B users; admin writes
create policy hubs_select on hubs for select using (public.is_b2b_user());
create policy hubs_write on hubs for all
  using (public.is_admin()) with check (public.is_admin());
create policy hubinv_select on hub_inventory for select using (public.is_b2b_user());
create policy hubinv_write on hub_inventory for all
  using (public.is_admin()) with check (public.is_admin());

-- fulfillment routes: contractor (via order) or admin
create policy routes_select on fulfillment_routes for select
  using (public.owns_order(order_id) or public.is_admin());
create policy routes_write on fulfillment_routes for all
  using (public.owns_order(order_id) or public.is_admin())
  with check (public.owns_order(order_id) or public.is_admin());

-- agent audit: contractor own + admin; append-only via trigger
create policy agentaudit_select on agent_audit_log for select
  using (contractor_id = auth.uid() or public.is_admin());
create policy agentaudit_insert on agent_audit_log for insert
  with check (public.is_admin() or contractor_id = auth.uid());

-- ---------- grants ----------
grant select on hubs, hub_inventory to anon;
grant select, insert, update, delete on
  agent_policies, agent_decisions, agent_actions, hubs, hub_inventory,
  fulfillment_routes, agent_audit_log
  to authenticated;
grant all on
  agent_policies, agent_decisions, agent_actions, hubs, hub_inventory,
  fulfillment_routes, agent_audit_log
  to service_role;
