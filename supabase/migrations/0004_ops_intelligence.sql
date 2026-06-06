-- 자재(Jajae) Phase 2 — ops intelligence. ADDITIVE & data-preserving:
-- ALTER ... ADD COLUMN IF NOT EXISTS + new tables. Reuses existing RLS helpers
-- (is_admin/owns_supplier). PGlite-compatible (no storage schema references).

-- ---------- sites: budget & schedule (preserves existing rows) ----------
alter table sites add column if not exists budget     numeric not null default 0;
alter table sites add column if not exists start_date date;
alter table sites add column if not exists end_date   date;

-- ---------- drawings (AI BOM from floor plans) ----------
create table if not exists drawings (
  id            uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references profiles(id) on delete cascade,
  site_id       uuid references sites(id) on delete set null,
  file_path     text not null,
  file_type     text not null default '',
  status        text not null default 'uploaded',
  rooms         jsonb not null default '[]'::jsonb,
  bom           jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

-- ---------- site documents ----------
create table if not exists site_documents (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references sites(id) on delete cascade,
  contractor_id uuid not null references profiles(id) on delete cascade,
  name          text not null,
  file_path     text not null,
  file_type     text not null default '',
  created_at    timestamptz not null default now()
);

-- ---------- site schedule / tasks ----------
create table if not exists site_tasks (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references sites(id) on delete cascade,
  contractor_id uuid not null references profiles(id) on delete cascade,
  title         text not null,
  phase         text not null default '',
  planned_date  date,
  done          boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ---------- price history (transparency / trend) ----------
create table if not exists price_history (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  unit_price  numeric not null check (unit_price >= 0),
  recorded_at timestamptz not null default now()
);

create index if not exists idx_drawings_contractor on drawings(contractor_id);
create index if not exists idx_sitedocs_site       on site_documents(site_id);
create index if not exists idx_sitetasks_site      on site_tasks(site_id);
create index if not exists idx_pricehist_product   on price_history(product_id);

-- ---------- RLS ----------
alter table drawings       enable row level security;
alter table site_documents enable row level security;
alter table site_tasks     enable row level security;
alter table price_history  enable row level security;

create policy drawings_all on drawings for all
  using (contractor_id = auth.uid() or public.is_admin())
  with check (contractor_id = auth.uid() or public.is_admin());

create policy sitedocs_all on site_documents for all
  using (contractor_id = auth.uid() or public.is_admin())
  with check (contractor_id = auth.uid() or public.is_admin());

create policy sitetasks_all on site_tasks for all
  using (contractor_id = auth.uid() or public.is_admin())
  with check (contractor_id = auth.uid() or public.is_admin());

-- price history is public-read (transparency); only the owning supplier/admin writes
create policy pricehist_select on price_history for select using (true);
create policy pricehist_write on price_history for all
  using (public.owns_supplier(supplier_id) or public.is_admin())
  with check (public.owns_supplier(supplier_id) or public.is_admin());

-- ---------- grants (new tables) ----------
grant select on price_history to anon;
grant select, insert, update, delete on drawings, site_documents, site_tasks, price_history to authenticated;
grant all on drawings, site_documents, site_tasks, price_history to service_role;
