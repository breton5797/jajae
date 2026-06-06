-- 자재(Jajae) — Row Level Security. Tenant isolation:
--   contractors see own sites/cart/orders/quotes/returns/AS;
--   suppliers see own products/POs/settlements;
--   admin sees all; catalog (categories + approved products + verified suppliers)
--   is publicly readable.
--
-- Cross-table ownership checks use SECURITY DEFINER helpers so they bypass RLS
-- on the referenced tables (no recursion, no leaks).

-- ---------- helper functions ----------
create or replace function public.is_admin() returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.owns_supplier(sup uuid) returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (select 1 from suppliers where id = sup and owner_id = auth.uid());
$$;

create or replace function public.owns_order(ord uuid) returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (select 1 from orders where id = ord and contractor_id = auth.uid());
$$;

create or replace function public.owns_po(p_po uuid) returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from purchase_orders po join orders o on o.id = po.order_id
    where po.id = p_po and o.contractor_id = auth.uid());
$$;

create or replace function public.supplies_po(p_po uuid) returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from purchase_orders po join suppliers s on s.id = po.supplier_id
    where po.id = p_po and s.owner_id = auth.uid());
$$;

create or replace function public.owns_order_item(p_item uuid) returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from order_items oi
      join purchase_orders po on po.id = oi.po_id
      join orders o on o.id = po.order_id
    where oi.id = p_item and o.contractor_id = auth.uid());
$$;

create or replace function public.supplies_order_item(p_item uuid) returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from order_items oi
      join purchase_orders po on po.id = oi.po_id
      join suppliers s on s.id = po.supplier_id
    where oi.id = p_item and s.owner_id = auth.uid());
$$;

-- ---------- enable RLS ----------
alter table profiles        enable row level security;
alter table suppliers       enable row level security;
alter table categories      enable row level security;
alter table products        enable row level security;
alter table sites           enable row level security;
alter table cart_items      enable row level security;
alter table orders          enable row level security;
alter table purchase_orders enable row level security;
alter table order_items     enable row level security;
alter table deliveries      enable row level security;
alter table returns         enable row level security;
alter table as_requests     enable row level security;
alter table ai_quotes       enable row level security;
alter table settlements     enable row level security;

-- ---------- profiles ----------
create policy profiles_select on profiles for select
  using (id = auth.uid() or public.is_admin());
create policy profiles_insert on profiles for insert
  with check (id = auth.uid());
create policy profiles_update on profiles for update
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- ---------- suppliers ----------
create policy suppliers_select on suppliers for select
  using (status = 'verified' or owner_id = auth.uid() or public.is_admin());
create policy suppliers_insert on suppliers for insert
  with check (owner_id = auth.uid() or public.is_admin());
create policy suppliers_update on suppliers for update
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());

-- ---------- categories (public read; admin write) ----------
create policy categories_select on categories for select using (true);
create policy categories_write on categories for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------- products ----------
create policy products_select on products for select
  using (status = 'approved' or public.owns_supplier(supplier_id) or public.is_admin());
create policy products_insert on products for insert
  with check (public.owns_supplier(supplier_id) or public.is_admin());
create policy products_update on products for update
  using (public.owns_supplier(supplier_id) or public.is_admin())
  with check (public.owns_supplier(supplier_id) or public.is_admin());
create policy products_delete on products for delete
  using (public.owns_supplier(supplier_id) or public.is_admin());

-- ---------- sites ----------
create policy sites_all on sites for all
  using (contractor_id = auth.uid() or public.is_admin())
  with check (contractor_id = auth.uid() or public.is_admin());

-- ---------- cart_items ----------
create policy cart_all on cart_items for all
  using (contractor_id = auth.uid() or public.is_admin())
  with check (contractor_id = auth.uid() or public.is_admin());

-- ---------- orders ----------
create policy orders_select on orders for select
  using (contractor_id = auth.uid() or public.is_admin());
create policy orders_insert on orders for insert
  with check (contractor_id = auth.uid());
create policy orders_update on orders for update
  using (contractor_id = auth.uid() or public.is_admin())
  with check (contractor_id = auth.uid() or public.is_admin());

-- ---------- purchase_orders ----------
create policy po_select on purchase_orders for select
  using (public.owns_order(order_id) or public.supplies_po(id) or public.is_admin());
create policy po_insert on purchase_orders for insert
  with check (public.owns_order(order_id) or public.is_admin());
create policy po_update on purchase_orders for update
  using (public.supplies_po(id) or public.is_admin())
  with check (public.supplies_po(id) or public.is_admin());

-- ---------- order_items ----------
create policy oi_select on order_items for select
  using (public.owns_po(po_id) or public.supplies_po(po_id) or public.is_admin());
create policy oi_insert on order_items for insert
  with check (public.owns_po(po_id) or public.is_admin());

-- ---------- deliveries ----------
create policy deliveries_select on deliveries for select
  using (public.owns_po(po_id) or public.supplies_po(po_id) or public.is_admin());
create policy deliveries_insert on deliveries for insert
  with check (public.owns_po(po_id) or public.is_admin());
create policy deliveries_update on deliveries for update
  using (public.supplies_po(po_id) or public.is_admin())
  with check (public.supplies_po(po_id) or public.is_admin());

-- ---------- returns ----------
create policy returns_select on returns for select
  using (contractor_id = auth.uid() or public.supplies_order_item(order_item_id) or public.is_admin());
create policy returns_insert on returns for insert
  with check (contractor_id = auth.uid() and public.owns_order_item(order_item_id));
create policy returns_update on returns for update
  using (contractor_id = auth.uid() or public.supplies_order_item(order_item_id) or public.is_admin())
  with check (contractor_id = auth.uid() or public.supplies_order_item(order_item_id) or public.is_admin());

-- ---------- as_requests ----------
create policy as_select on as_requests for select
  using (contractor_id = auth.uid() or public.supplies_order_item(order_item_id) or public.is_admin());
create policy as_insert on as_requests for insert
  with check (contractor_id = auth.uid() and public.owns_order_item(order_item_id));
create policy as_update on as_requests for update
  using (contractor_id = auth.uid() or public.supplies_order_item(order_item_id) or public.is_admin())
  with check (contractor_id = auth.uid() or public.supplies_order_item(order_item_id) or public.is_admin());

-- ---------- ai_quotes ----------
create policy quotes_all on ai_quotes for all
  using (contractor_id = auth.uid() or public.is_admin())
  with check (contractor_id = auth.uid() or public.is_admin());

-- ---------- settlements ----------
create policy settlements_select on settlements for select
  using (public.owns_supplier(supplier_id) or public.is_admin());
create policy settlements_write on settlements for all
  using (public.is_admin()) with check (public.is_admin());
