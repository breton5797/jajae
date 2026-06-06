-- 자재(Jajae) Phase 3 — monetization & lock-in. ADDITIVE & data-preserving.
-- NOTE: `settlements` (Phase 1) = supplier payout per PO. The contractor monthly
-- statement here is a DISTINCT table `contractor_settlements`.

-- ---------- products: PB flags (preserves existing rows) ----------
alter table products add column if not exists is_pb       boolean not null default false;
alter table products add column if not exists cost        numeric;
alter table products add column if not exists margin_rate numeric;

-- ---------- PB products ----------
create table if not exists pb_products (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  sku         text not null unique,
  category_id uuid not null references categories(id),
  cost        numeric not null check (cost >= 0),
  margin_rate numeric not null default 0 check (margin_rate >= 0),
  supplier_id uuid not null references suppliers(id),
  created_at  timestamptz not null default now()
);

-- ---------- group buys ----------
create table if not exists group_buys (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references products(id) on delete cascade,
  supplier_id      uuid not null references suppliers(id),
  title            text not null,
  start_at         timestamptz not null default now(),
  end_at           timestamptz not null,
  min_qty          int not null default 1 check (min_qty > 0),
  tiers            jsonb not null default '[]'::jsonb,
  status           text not null default 'open',
  joined_qty       int not null default 0 check (joined_qty >= 0),
  final_unit_price numeric,
  created_at       timestamptz not null default now()
);

create table if not exists group_buy_joins (
  id            uuid primary key default gen_random_uuid(),
  group_buy_id  uuid not null references group_buys(id) on delete cascade,
  contractor_id uuid not null references profiles(id) on delete cascade,
  qty           int not null check (qty > 0),
  created_at    timestamptz not null default now(),
  unique (group_buy_id, contractor_id)
);

-- ---------- finance: contractor monthly settlement ----------
create table if not exists contractor_settlements (
  id            uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references profiles(id) on delete cascade,
  period        text not null,                 -- YYYY-MM
  gross         numeric not null default 0,
  fee           numeric not null default 0,
  net           numeric not null default 0,
  status        text not null default 'draft', -- draft|issued|paid|disputed
  created_at    timestamptz not null default now(),
  unique (contractor_id, period)
);

create table if not exists tax_invoices (
  id                  uuid primary key default gen_random_uuid(),
  settlement_id       uuid not null references contractor_settlements(id) on delete cascade,
  provider            text not null default 'popbill',
  provider_invoice_id text,
  status              text not null default 'pending', -- pending|issued|failed
  pdf_url             text,
  created_at          timestamptz not null default now()
);

create table if not exists credit_accounts (
  id             uuid primary key default gen_random_uuid(),
  contractor_id  uuid not null references profiles(id) on delete cascade unique,
  limit_amount   numeric not null default 0 check (limit_amount >= 0),
  used_amount    numeric not null default 0 check (used_amount >= 0),
  overdue_amount numeric not null default 0 check (overdue_amount >= 0),
  due_date       date,
  created_at     timestamptz not null default now()
);

create index if not exists idx_pb_products_product on pb_products(product_id);
create index if not exists idx_groupbuys_status    on group_buys(status);
create index if not exists idx_gbjoins_gb          on group_buy_joins(group_buy_id);
create index if not exists idx_csettle_contractor  on contractor_settlements(contractor_id);
create index if not exists idx_taxinv_settlement   on tax_invoices(settlement_id);
create index if not exists idx_credit_contractor   on credit_accounts(contractor_id);

-- ---------- RLS ----------
alter table pb_products             enable row level security;
alter table group_buys              enable row level security;
alter table group_buy_joins         enable row level security;
alter table contractor_settlements  enable row level security;
alter table tax_invoices            enable row level security;
alter table credit_accounts         enable row level security;

-- PB products: public-read (catalog); supplier(owner)/admin write
create policy pb_select on pb_products for select using (true);
create policy pb_write on pb_products for all
  using (public.owns_supplier(supplier_id) or public.is_admin())
  with check (public.owns_supplier(supplier_id) or public.is_admin());

-- group buys: public-read; owning supplier/admin write
create policy gb_select on group_buys for select using (true);
create policy gb_write on group_buys for all
  using (public.owns_supplier(supplier_id) or public.is_admin())
  with check (public.owns_supplier(supplier_id) or public.is_admin());

-- joins: contractor owns own join; supplier of the campaign + admin can read
create policy gbjoin_select on group_buy_joins for select
  using (
    contractor_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from group_buys g join suppliers s on s.id = g.supplier_id
               where g.id = group_buy_id and s.owner_id = auth.uid())
  );
create policy gbjoin_insert on group_buy_joins for insert
  with check (contractor_id = auth.uid());
create policy gbjoin_update on group_buy_joins for update
  using (contractor_id = auth.uid() or public.is_admin())
  with check (contractor_id = auth.uid() or public.is_admin());

-- contractor settlements: contractor owns; admin full
create policy csettle_select on contractor_settlements for select
  using (contractor_id = auth.uid() or public.is_admin());
create policy csettle_write on contractor_settlements for all
  using (public.is_admin()) with check (public.is_admin());

-- tax invoices: visible to the settlement's contractor + admin; admin writes
create policy taxinv_select on tax_invoices for select
  using (
    public.is_admin()
    or exists (select 1 from contractor_settlements cs
               where cs.id = settlement_id and cs.contractor_id = auth.uid())
  );
create policy taxinv_write on tax_invoices for all
  using (public.is_admin()) with check (public.is_admin());

-- credit accounts: contractor owns; admin full
create policy credit_select on credit_accounts for select
  using (contractor_id = auth.uid() or public.is_admin());
create policy credit_write on credit_accounts for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------- grants ----------
grant select on pb_products, group_buys to anon;
grant select, insert, update, delete on
  pb_products, group_buys, group_buy_joins, contractor_settlements, tax_invoices, credit_accounts
  to authenticated;
grant all on
  pb_products, group_buys, group_buy_joins, contractor_settlements, tax_invoices, credit_accounts
  to service_role;
