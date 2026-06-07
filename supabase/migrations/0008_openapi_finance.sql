-- 자재(Jajae) Phase 6 — Open API, ERP sync, credit scoring, embedded finance.
-- ADDITIVE & data-preserving. finance_audit_log is APPEND-ONLY (trigger-enforced).

-- ---------- Open API ----------
create table if not exists api_clients (
  id         uuid primary key default gen_random_uuid(),
  partner_id uuid not null references profiles(id) on delete cascade,
  name       text not null,
  key_hash   text not null unique,
  key_prefix text not null,
  scopes     text[] not null default '{}',
  status     text not null default 'active',
  rate_limit int not null default 1000,
  created_at timestamptz not null default now()
);

create table if not exists api_logs (
  id        uuid primary key default gen_random_uuid(),
  client_id uuid not null references api_clients(id) on delete cascade,
  endpoint  text not null,
  method    text not null default 'GET',
  status    int not null default 200,
  ts        timestamptz not null default now()
);

create table if not exists webhooks (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references api_clients(id) on delete cascade,
  event      text not null,
  url        text not null,
  secret     text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists webhook_deliveries (
  id              uuid primary key default gen_random_uuid(),
  webhook_id      uuid not null references webhooks(id) on delete cascade,
  event           text not null,
  status          text not null default 'pending',
  attempts        int not null default 0,
  last_attempt_at timestamptz,
  payload         jsonb not null default '{}'::jsonb
);

-- ---------- ERP sync ----------
create table if not exists erp_syncs (
  id          uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers(id) on delete cascade,
  direction   text not null,
  external_id text not null default '',
  last_sync   timestamptz,
  status      text not null default 'idle',
  version     int not null default 0
);

-- ---------- credit scoring ----------
create table if not exists credit_scores (
  id            uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references profiles(id) on delete cascade unique,
  score         int not null default 0,
  grade         text not null default 'NEW',
  factors       jsonb not null default '[]'::jsonb, -- factor contributions (NOT weights)
  updated_at    timestamptz not null default now()
);

-- ---------- embedded finance ----------
create table if not exists finance_requests (
  id            uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references profiles(id) on delete cascade,
  type          text not null,
  amount        numeric not null check (amount >= 0),
  fee           numeric not null default 0,
  rate          numeric not null default 0,
  status        text not null default 'requested',
  due_date      date,
  disbursed_at  timestamptz,
  created_at    timestamptz not null default now()
);

create table if not exists repayments (
  id                 uuid primary key default gen_random_uuid(),
  finance_request_id uuid not null references finance_requests(id) on delete cascade,
  amount             numeric not null check (amount >= 0),
  paid_at            timestamptz not null default now(),
  source             text not null default 'settlement'
);

-- ---------- immutable finance audit log ----------
create table if not exists finance_audit_log (
  id            uuid primary key default gen_random_uuid(),
  actor_id      uuid,
  contractor_id uuid,
  action        text not null,
  amount        numeric not null default 0,
  ref_id        uuid,
  detail        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create or replace function public.prevent_audit_mutation() returns trigger
  language plpgsql as $$
begin
  raise exception 'finance_audit_log is append-only';
end;
$$;

drop trigger if exists trg_audit_immutable on finance_audit_log;
create trigger trg_audit_immutable
  before update or delete on finance_audit_log
  for each row execute function public.prevent_audit_mutation();

create index if not exists idx_apilogs_client   on api_logs(client_id, ts);
create index if not exists idx_webhooks_client   on webhooks(client_id);
create index if not exists idx_whdeliv_webhook   on webhook_deliveries(webhook_id);
create index if not exists idx_erpsyncs_supplier on erp_syncs(supplier_id);
create index if not exists idx_finreq_contractor on finance_requests(contractor_id);
create index if not exists idx_repay_request     on repayments(finance_request_id);
create index if not exists idx_audit_contractor  on finance_audit_log(contractor_id);

-- ---------- helpers ----------
create or replace function public.owns_api_client(p_client uuid) returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (select 1 from api_clients where id = p_client and partner_id = auth.uid());
$$;

create or replace function public.owns_finance_request(p_req uuid) returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (select 1 from finance_requests where id = p_req and contractor_id = auth.uid());
$$;

-- ---------- RLS ----------
alter table api_clients        enable row level security;
alter table api_logs           enable row level security;
alter table webhooks           enable row level security;
alter table webhook_deliveries enable row level security;
alter table erp_syncs          enable row level security;
alter table credit_scores      enable row level security;
alter table finance_requests   enable row level security;
alter table repayments         enable row level security;
alter table finance_audit_log  enable row level security;

-- partner owns their API clients/logs/webhooks
create policy apiclients_all on api_clients for all
  using (partner_id = auth.uid() or public.is_admin())
  with check (partner_id = auth.uid() or public.is_admin());
create policy apilogs_select on api_logs for select
  using (public.owns_api_client(client_id) or public.is_admin());
create policy apilogs_insert on api_logs for insert
  with check (public.owns_api_client(client_id) or public.is_admin());
create policy webhooks_all on webhooks for all
  using (public.owns_api_client(client_id) or public.is_admin())
  with check (public.owns_api_client(client_id) or public.is_admin());
create policy whdeliv_select on webhook_deliveries for select
  using (
    public.is_admin()
    or exists (select 1 from webhooks w where w.id = webhook_id and public.owns_api_client(w.client_id))
  );

-- erp syncs: owning supplier or admin
create policy erpsyncs_all on erp_syncs for all
  using (public.owns_supplier(supplier_id) or public.is_admin())
  with check (public.owns_supplier(supplier_id) or public.is_admin());

-- credit scores: contractor own (score + factors; weights are code-only) or admin
create policy scores_select on credit_scores for select
  using (contractor_id = auth.uid() or public.is_admin());
create policy scores_write on credit_scores for all
  using (public.is_admin()) with check (public.is_admin());

-- finance requests + repayments: contractor own or admin
create policy finreq_select on finance_requests for select
  using (contractor_id = auth.uid() or public.is_admin());
create policy finreq_insert on finance_requests for insert
  with check (contractor_id = auth.uid());
create policy finreq_update on finance_requests for update
  using (public.is_admin()) with check (public.is_admin());
create policy repay_select on repayments for select
  using (public.owns_finance_request(finance_request_id) or public.is_admin());
create policy repay_write on repayments for all
  using (public.is_admin()) with check (public.is_admin());

-- audit log: contractor sees own, admin all; INSERT only (trigger blocks update/delete)
create policy audit_select on finance_audit_log for select
  using (contractor_id = auth.uid() or public.is_admin());
create policy audit_insert on finance_audit_log for insert
  with check (public.is_admin() or contractor_id = auth.uid());

-- ---------- grants ----------
grant select, insert, update, delete on
  api_clients, api_logs, webhooks, webhook_deliveries, erp_syncs,
  credit_scores, finance_requests, repayments, finance_audit_log
  to authenticated;
grant all on
  api_clients, api_logs, webhooks, webhook_deliveries, erp_syncs,
  credit_scores, finance_requests, repayments, finance_audit_log
  to service_role;
