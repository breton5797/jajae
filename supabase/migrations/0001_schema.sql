-- 자재(Jajae) — schema. Supabase-valid; also runs in PGlite (test harness
-- provides the `auth` shim + roles before applying migrations).

-- ---------- enums ----------
create type user_role        as enum ('contractor','supplier','admin');
create type biz_status       as enum ('pending','verified','rejected');
create type category_kind    as enum ('interior','structural');
create type product_status   as enum ('draft','pending','approved','rejected');
create type product_unit     as enum ('ea','box','sheet','roll','can','bag','ton','m','m2','pallet');
create type order_status     as enum ('pending','paid','partially_fulfilled','fulfilled','cancelled');
create type po_status        as enum ('pending','accepted','preparing','shipped','delivered','cancelled');
create type payment_method   as enum ('escrow','credit');
create type payment_status   as enum ('pending','held','released','failed','refunded');
create type delivery_status  as enum ('scheduled','in_transit','delivered','delayed');
create type return_status    as enum ('requested','approved','rejected','completed');
create type as_status        as enum ('requested','scheduled','in_progress','completed','rejected');
create type settlement_status as enum ('pending','held','released');

-- ---------- core tables ----------
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  role         user_role   not null default 'contractor',
  company_name text        not null default '',
  biz_no       text,
  biz_status   biz_status  not null default 'pending',
  credit_limit numeric     not null default 0 check (credit_limit >= 0),
  credit_used  numeric     not null default 0 check (credit_used >= 0),
  phone        text,
  created_at   timestamptz not null default now()
);

create table suppliers (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid references profiles(id) on delete set null,
  name       text not null,
  biz_no     text not null,
  status     biz_status not null default 'pending',
  rating     numeric not null default 0,
  created_at timestamptz not null default now()
);

create table categories (
  id        uuid primary key default gen_random_uuid(),
  parent_id uuid references categories(id) on delete cascade,
  kind      category_kind not null,
  name      text not null,
  slug      text not null unique,
  level     int  not null default 0,
  sort      int  not null default 0
);

create table products (
  id             uuid primary key default gen_random_uuid(),
  supplier_id    uuid not null references suppliers(id) on delete cascade,
  category_id    uuid not null references categories(id),
  name           text not null,
  brand          text not null default '',
  spec           jsonb not null default '{}'::jsonb,
  unit           product_unit not null default 'ea',
  unit_price     numeric not null check (unit_price >= 0),
  stock          int not null default 0 check (stock >= 0),
  lead_time_days int not null default 0 check (lead_time_days >= 0),
  spec_sheet_url text,
  status         product_status not null default 'pending',
  search         tsvector generated always as (
                   to_tsvector('simple',
                     coalesce(name,'') || ' ' || coalesce(brand,'') || ' ' ||
                     coalesce(spec::text,''))
                 ) stored,
  created_at     timestamptz not null default now()
);

create table sites (
  id             uuid primary key default gen_random_uuid(),
  contractor_id  uuid not null references profiles(id) on delete cascade,
  name           text not null,
  address        text not null default '',
  lat            numeric,
  lng            numeric,
  scheduled_date date,
  memo           text,
  created_at     timestamptz not null default now()
);

create table cart_items (
  id            uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references profiles(id) on delete cascade,
  product_id    uuid not null references products(id) on delete cascade,
  qty           int not null check (qty > 0),
  created_at    timestamptz not null default now(),
  unique (contractor_id, product_id)
);

create table orders (
  id             uuid primary key default gen_random_uuid(),
  contractor_id  uuid not null references profiles(id) on delete cascade,
  site_id        uuid references sites(id) on delete set null,
  status         order_status not null default 'pending',
  payment_method payment_method not null,
  payment_status payment_status not null default 'pending',
  subtotal       numeric not null default 0,
  platform_fee   numeric not null default 0,
  total          numeric not null default 0,
  toss_payment_key text,
  created_at     timestamptz not null default now()
);

create table purchase_orders (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references orders(id) on delete cascade,
  supplier_id        uuid not null references suppliers(id),
  status             po_status not null default 'pending',
  subtotal           numeric not null default 0,
  platform_fee       numeric not null default 0,
  expected_ship_date date,
  created_at         timestamptz not null default now()
);

create table order_items (
  id                  uuid primary key default gen_random_uuid(),
  po_id               uuid not null references purchase_orders(id) on delete cascade,
  product_id          uuid not null references products(id),
  name_snapshot       text not null,
  unit_price_snapshot numeric not null,
  qty                 int not null check (qty > 0),
  line_total          numeric not null,
  backordered         boolean not null default false,
  created_at          timestamptz not null default now()
);

create table deliveries (
  id             uuid primary key default gen_random_uuid(),
  po_id          uuid not null references purchase_orders(id) on delete cascade,
  site_id        uuid references sites(id) on delete set null,
  status         delivery_status not null default 'scheduled',
  scheduled_date date not null,
  delivered_at   timestamptz,
  tracking       text
);

create table returns (
  id            uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references order_items(id) on delete cascade,
  contractor_id uuid not null references profiles(id) on delete cascade,
  reason        text not null default '',
  qty           int not null check (qty > 0),
  status        return_status not null default 'requested',
  created_at    timestamptz not null default now()
);

create table as_requests (
  id             uuid primary key default gen_random_uuid(),
  order_item_id  uuid not null references order_items(id) on delete cascade,
  contractor_id  uuid not null references profiles(id) on delete cascade,
  site_id        uuid references sites(id) on delete set null,
  issue          text not null default '',
  status         as_status not null default 'requested',
  scheduled_date date,
  created_at     timestamptz not null default now()
);

create table ai_quotes (
  id            uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references profiles(id) on delete cascade,
  project_type  text not null,
  area_pyeong   numeric not null,
  dimensions    jsonb not null default '{}'::jsonb,
  spec_level    text not null,
  result        jsonb not null default '{}'::jsonb,
  est_total     numeric not null default 0,
  created_at    timestamptz not null default now()
);

create table settlements (
  id           uuid primary key default gen_random_uuid(),
  po_id        uuid not null references purchase_orders(id) on delete cascade,
  supplier_id  uuid not null references suppliers(id),
  gross        numeric not null default 0,
  platform_fee numeric not null default 0,
  net          numeric not null default 0,
  status       settlement_status not null default 'pending',
  released_at  timestamptz
);

-- ---------- indexes ----------
create index idx_categories_parent on categories(parent_id);
create index idx_products_category on products(category_id);
create index idx_products_supplier on products(supplier_id);
create index idx_products_status   on products(status);
create index idx_products_search   on products using gin(search);
create index idx_products_spec     on products using gin(spec jsonb_path_ops);
create index idx_sites_contractor  on sites(contractor_id);
create index idx_cart_contractor   on cart_items(contractor_id);
create index idx_orders_contractor on orders(contractor_id);
create index idx_po_order          on purchase_orders(order_id);
create index idx_po_supplier       on purchase_orders(supplier_id);
create index idx_oi_po             on order_items(po_id);
create index idx_deliveries_po     on deliveries(po_id);
create index idx_returns_contractor on returns(contractor_id);
create index idx_as_contractor     on as_requests(contractor_id);
create index idx_settlements_supplier on settlements(supplier_id);
