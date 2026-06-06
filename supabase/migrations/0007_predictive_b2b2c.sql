-- 자재(Jajae) Phase 5 — forecasting, B2B2C client portal, owner analytics.
-- ADDITIVE & data-preserving. End clients (입주민) are auth users WITHOUT a
-- profiles row (no biz_no); they live in client_users and are scoped to invited
-- projects via project_clients.

-- ---------- forecasting ----------
create table if not exists forecasts (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references products(id) on delete cascade,
  period        text not null,                 -- YYYY-MM (target period)
  predicted_qty numeric not null default 0,
  confidence    numeric not null default 0,
  method        text not null default 'movingAvg',
  created_at    timestamptz not null default now(),
  unique (product_id, period)
);

create table if not exists reorder_rules (
  id             uuid primary key default gen_random_uuid(),
  contractor_id  uuid not null references profiles(id) on delete cascade,
  product_id     uuid not null references products(id) on delete cascade,
  threshold      int not null default 0 check (threshold >= 0),
  lead_time_days int not null default 7 check (lead_time_days >= 0),
  enabled        boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (contractor_id, product_id)
);

-- ---------- B2B2C ----------
create table if not exists client_users (
  id         uuid primary key references auth.users(id) on delete cascade,
  phone      text not null unique,
  kakao_id   text,
  name       text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists project_clients (
  id             uuid primary key default gen_random_uuid(),
  site_id        uuid not null references sites(id) on delete cascade,
  client_user_id uuid not null references client_users(id) on delete cascade,
  role           text not null default 'viewer',
  created_at     timestamptz not null default now(),
  unique (site_id, client_user_id)
);

create table if not exists client_selections (
  id         uuid primary key default gen_random_uuid(),
  site_id    uuid not null references sites(id) on delete cascade,
  title      text not null,
  option_set jsonb not null default '[]'::jsonb, -- client-safe options (no cost)
  chosen     jsonb not null default '[]'::jsonb,
  status     text not null default 'open',
  created_at timestamptz not null default now()
);

-- ---------- analytics ----------
create table if not exists analytics_snapshots (
  id                uuid primary key default gen_random_uuid(),
  period            text not null unique,
  gmv               numeric not null default 0,
  margin            numeric not null default 0,
  pb_share          numeric not null default 0,
  repeat_rate       numeric not null default 0,
  forecast_accuracy numeric not null default 0,
  data              jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists idx_forecasts_product   on forecasts(product_id);
create index if not exists idx_reorder_contractor  on reorder_rules(contractor_id);
create index if not exists idx_projclients_site    on project_clients(site_id);
create index if not exists idx_projclients_client  on project_clients(client_user_id);
create index if not exists idx_clientsel_site      on client_selections(site_id);

-- ---------- helpers ----------
-- A B2B user has a profiles row (contractor/supplier/admin); clients do not.
create or replace function public.is_b2b_user() returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid());
$$;

-- Can the current (client) user view this site? (invited via project_clients)
create or replace function public.client_can_view_site(p_site uuid) returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from project_clients pc
    where pc.site_id = p_site and pc.client_user_id = auth.uid());
$$;

-- ---------- RLS ----------
alter table forecasts          enable row level security;
alter table reorder_rules      enable row level security;
alter table client_users       enable row level security;
alter table project_clients    enable row level security;
alter table client_selections  enable row level security;
alter table analytics_snapshots enable row level security;

-- forecasts: B2B users (contractor/supplier/admin) read; clients CANNOT; admin writes
create policy forecasts_select on forecasts for select using (public.is_b2b_user());
create policy forecasts_write on forecasts for all
  using (public.is_admin()) with check (public.is_admin());

-- reorder rules: contractor owns
create policy reorder_all on reorder_rules for all
  using (contractor_id = auth.uid() or public.is_admin())
  with check (contractor_id = auth.uid() or public.is_admin());

-- client_users: self, admin, or the contractor who owns a site they're invited to
create policy clientusers_select on client_users for select
  using (
    id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from project_clients pc join sites s on s.id = pc.site_id
      where pc.client_user_id = client_users.id and s.contractor_id = auth.uid())
  );
create policy clientusers_upsert on client_users for insert
  with check (id = auth.uid());
create policy clientusers_update on client_users for update
  using (id = auth.uid()) with check (id = auth.uid());

-- project_clients: client sees own membership; site-owning contractor manages; admin full
create policy projclients_select on project_clients for select
  using (
    client_user_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from sites s where s.id = site_id and s.contractor_id = auth.uid())
  );
create policy projclients_write on project_clients for all
  using (
    public.is_admin()
    or exists (select 1 from sites s where s.id = site_id and s.contractor_id = auth.uid())
  )
  with check (
    public.is_admin()
    or exists (select 1 from sites s where s.id = site_id and s.contractor_id = auth.uid())
  );

-- client_selections: site-owning contractor manages; invited client reads + updates choice
create policy clientsel_select on client_selections for select
  using (
    public.is_admin()
    or public.client_can_view_site(site_id)
    or exists (select 1 from sites s where s.id = site_id and s.contractor_id = auth.uid())
  );
create policy clientsel_cwrite on client_selections for all
  using (
    public.is_admin()
    or exists (select 1 from sites s where s.id = site_id and s.contractor_id = auth.uid())
  )
  with check (
    public.is_admin()
    or exists (select 1 from sites s where s.id = site_id and s.contractor_id = auth.uid())
  );
-- invited client may record their choice (update chosen/status only on invited sites)
create policy clientsel_client_update on client_selections for update
  using (public.client_can_view_site(site_id))
  with check (public.client_can_view_site(site_id));

-- analytics: owner/admin only
create policy analytics_all on analytics_snapshots for all
  using (public.is_admin()) with check (public.is_admin());

-- B2B2C scoped reads: an invited client may read the site + its deliveries
-- (progress). Additional PERMISSIVE select policies — they OR with existing ones.
create policy sites_client_select on sites for select
  using (public.client_can_view_site(id));
create policy deliveries_client_select on deliveries for select
  using (site_id is not null and public.client_can_view_site(site_id));

-- ---------- grants ----------
grant select, insert, update, delete on
  forecasts, reorder_rules, client_users, project_clients, client_selections, analytics_snapshots
  to authenticated;
grant all on
  forecasts, reorder_rules, client_users, project_clients, client_selections, analytics_snapshots
  to service_role;
