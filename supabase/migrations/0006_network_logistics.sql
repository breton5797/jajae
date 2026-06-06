-- 자재(Jajae) Phase 4 — logistics, ratings, community. ADDITIVE & data-preserving.

-- sites gain a region for delivery batching (preserves existing rows)
alter table sites add column if not exists region text not null default '';
-- purchase_orders gain a fine-grained tracking status (separate from po_status)
alter table purchase_orders add column if not exists track_status text not null default 'ready';

-- ---------- logistics ----------
create table if not exists delivery_runs (
  id         uuid primary key default gen_random_uuid(),
  region     text not null,
  run_date   date not null,
  route      jsonb not null default '{}'::jsonb,
  status     text not null default 'planned',
  created_at timestamptz not null default now()
);

create table if not exists run_pos (
  id       uuid primary key default gen_random_uuid(),
  run_id   uuid not null references delivery_runs(id) on delete cascade,
  po_id    uuid not null references purchase_orders(id) on delete cascade,
  sequence int not null default 0,
  unique (run_id, po_id)
);

-- ---------- supplier ratings (detailed = private to owner; public badge = suppliers.rating) ----------
create table if not exists supplier_ratings (
  id           uuid primary key default gen_random_uuid(),
  supplier_id  uuid not null references suppliers(id) on delete cascade unique,
  on_time      numeric not null default 0,
  return_rate  numeric not null default 0,
  quality_avg  numeric not null default 0,
  composite    numeric not null default 0,
  order_count  int not null default 0,
  review_count int not null default 0,
  updated_at   timestamptz not null default now()
);

-- ---------- community ----------
create table if not exists reviews (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references products(id) on delete cascade,
  contractor_id uuid not null references profiles(id) on delete cascade,
  rating        int not null check (rating between 1 and 5),
  body          text not null default '',
  photos        jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  unique (product_id, contractor_id)
);

create table if not exists community_posts (
  id            uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references profiles(id) on delete cascade,
  type          text not null default 'thread',
  title         text not null,
  body          text not null default '',
  created_at    timestamptz not null default now()
);

create table if not exists referrals (
  id          uuid primary key default gen_random_uuid(),
  inviter_id  uuid not null references profiles(id) on delete cascade,
  invitee_id  uuid references profiles(id) on delete set null,
  code        text not null unique,
  reward      numeric not null default 0,
  status      text not null default 'invited',
  created_at  timestamptz not null default now(),
  check (invitee_id is null or invitee_id <> inviter_id) -- no self-referral
);

create index if not exists idx_runpos_run      on run_pos(run_id);
create index if not exists idx_runpos_po       on run_pos(po_id);
create index if not exists idx_reviews_product on reviews(product_id);
create index if not exists idx_posts_author    on community_posts(contractor_id);
create index if not exists idx_referrals_inviter on referrals(inviter_id);

-- ---------- helper: who can view a delivery run (definer bypasses RLS) ----------
create or replace function public.can_view_run(p_run uuid) returns boolean
  language sql security definer stable set search_path = public as $$
  select public.is_admin()
    or exists (
      select 1 from run_pos rp
        join purchase_orders po on po.id = rp.po_id
        join suppliers s on s.id = po.supplier_id
      where rp.run_id = p_run and s.owner_id = auth.uid())
    or exists (
      select 1 from run_pos rp
        join purchase_orders po on po.id = rp.po_id
        join orders o on o.id = po.order_id
      where rp.run_id = p_run and o.contractor_id = auth.uid());
$$;

-- ---------- RLS ----------
alter table delivery_runs    enable row level security;
alter table run_pos          enable row level security;
alter table supplier_ratings enable row level security;
alter table reviews          enable row level security;
alter table community_posts  enable row level security;
alter table referrals        enable row level security;

-- delivery runs: visible to admin + suppliers/contractors with a PO in the run
create policy runs_select on delivery_runs for select using (public.can_view_run(id));
create policy runs_write on delivery_runs for all
  using (public.is_admin()) with check (public.is_admin());

-- run_pos: each party sees only rows tied to their own PO (hides competitors)
create policy runpos_select on run_pos for select
  using (public.is_admin() or public.owns_po(po_id) or public.supplies_po(po_id));
create policy runpos_write on run_pos for all
  using (public.is_admin()) with check (public.is_admin());

-- supplier_ratings: DETAILED metrics private to owning supplier + admin (hides competitors)
create policy ratings_select on supplier_ratings for select
  using (public.owns_supplier(supplier_id) or public.is_admin());
create policy ratings_write on supplier_ratings for all
  using (public.is_admin()) with check (public.is_admin());

-- reviews: public-read; author edits OWN only
create policy reviews_select on reviews for select using (true);
create policy reviews_insert on reviews for insert
  with check (contractor_id = auth.uid());
create policy reviews_update on reviews for update
  using (contractor_id = auth.uid()) with check (contractor_id = auth.uid());
create policy reviews_delete on reviews for delete
  using (contractor_id = auth.uid() or public.is_admin());

-- community posts: public-read; author edits own
create policy posts_select on community_posts for select using (true);
create policy posts_insert on community_posts for insert
  with check (contractor_id = auth.uid());
create policy posts_update on community_posts for update
  using (contractor_id = auth.uid() or public.is_admin())
  with check (contractor_id = auth.uid() or public.is_admin());
create policy posts_delete on community_posts for delete
  using (contractor_id = auth.uid() or public.is_admin());

-- referrals: inviter or invitee sees own; admin full
create policy referrals_select on referrals for select
  using (inviter_id = auth.uid() or invitee_id = auth.uid() or public.is_admin());
create policy referrals_insert on referrals for insert
  with check (inviter_id = auth.uid());
create policy referrals_update on referrals for update
  using (inviter_id = auth.uid() or public.is_admin())
  with check (inviter_id = auth.uid() or public.is_admin());

-- ---------- grants ----------
grant select on supplier_ratings, reviews, community_posts to anon;
grant select, insert, update, delete on
  delivery_runs, run_pos, supplier_ratings, reviews, community_posts, referrals
  to authenticated;
grant all on
  delivery_runs, run_pos, supplier_ratings, reviews, community_posts, referrals
  to service_role;
