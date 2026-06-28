-- 자재(Jajae) interior-estimate spec §데이터 모델 — interior_estimates table + RLS. ADDITIVE.
-- Stores one auto-generated interior estimate per contractor (transcript → brief →
-- floor_plan + bom + total). Tenant isolation mirrors the existing model (0002):
--   * the owning contractor sees/writes only own rows  (contractor_id = auth.uid()),
--   * admin sees/writes everything                      (public.is_admin(), the same
--     SECURITY DEFINER helper defined in 0002 — NOT redefined here),
--   * the trusted service_role backend bypasses RLS entirely (BYPASSRLS) and needs no
--     policy — same as every other table here (we enable, never FORCE, row security).
--
-- TRUST BOUNDARY: like 0002/0012/0015 these policies read auth.uid() / auth.role()
-- (the `request.jwt.claim.*` GUCs PostgREST sets per request); a normal REST call
-- cannot override them. The insert WITH CHECK forces contractor_id = auth.uid() for
-- non-admins so a caller cannot create rows owned by someone else. `status` carries no
-- transition guard this round — the spec ships the field only (the 'shared' link flow
-- is a follow-up), so no privileged state machine exists to protect yet.

-- ---------- table ----------
create table interior_estimates (
  id            uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references profiles(id) on delete cascade,
  customer_name text,
  transcript    text not null default '',
  brief         jsonb not null,
  floor_plan    jsonb not null,
  bom           jsonb not null,
  total_krw     bigint not null default 0,
  status        text not null default 'draft' check (status in ('draft','shared')),
  created_at    timestamptz not null default now()
);

-- ---------- indexes ----------
create index idx_interior_estimates_contractor on interior_estimates(contractor_id);
create index idx_interior_estimates_status     on interior_estimates(status);

-- ---------- enable RLS ----------
alter table interior_estimates enable row level security;

-- ---------- policies ----------
-- Owner sees own rows; admin sees all.
create policy interior_estimates_select on interior_estimates for select
  using (contractor_id = auth.uid() or public.is_admin());
-- Non-admins may only create rows they own; admins may insert on anyone's behalf.
create policy interior_estimates_insert on interior_estimates for insert
  with check (contractor_id = auth.uid() or public.is_admin());
create policy interior_estimates_update on interior_estimates for update
  using (contractor_id = auth.uid() or public.is_admin())
  with check (contractor_id = auth.uid() or public.is_admin());
create policy interior_estimates_delete on interior_estimates for delete
  using (contractor_id = auth.uid() or public.is_admin());

-- ---------- grants (consistent with 0003; least privilege — no anon read) ----------
-- 0003's `alter default privileges ... grant select ... to anon` would auto-grant anon
-- read on this new table; estimates are private (no public/share endpoint yet), so
-- revoke it. RLS would already block anon (auth.uid() is null), this is defense-in-depth.
revoke all on interior_estimates from anon;
grant select, insert, update, delete on interior_estimates to authenticated;
grant all on interior_estimates to service_role;
