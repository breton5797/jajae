-- 자재(Jajae) §DB 0021 — design_scenes (3D 스튜디오 씬 저장). ADDITIVE.
-- 시공사/디자이너가 스튜디오에서 편집한 DesignScene(JSON)을 저장·재로드한다.
-- 소유자 격리 RLS (0016/0018 패턴 동일: 소유자/admin, anon revoke, service 신뢰).

-- ---------- table ----------
create table design_scenes (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references profiles(id) on delete cascade,
  domain        text not null check (domain in (
                  'interior','architecture','landscape',
                  'webtoon_bg','stage','signage','furniture')),
  name          text not null,
  scene         jsonb not null,
  thumbnail_url text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------- indexes ----------
create index idx_design_scenes_owner on design_scenes(owner_id);

-- ---------- RLS ----------
alter table design_scenes enable row level security;

create policy design_scenes_select on design_scenes for select
  using (owner_id = auth.uid() or public.is_admin());
create policy design_scenes_insert on design_scenes for insert
  with check (owner_id = auth.uid() or public.is_admin());
create policy design_scenes_update on design_scenes for update
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());
create policy design_scenes_delete on design_scenes for delete
  using (owner_id = auth.uid() or public.is_admin());

-- 0003의 default privileges 가 anon read 를 자동 부여하므로 명시적으로 회수.
revoke all on design_scenes from anon;
grant select, insert, update, delete on design_scenes to authenticated;
grant all on design_scenes to service_role;
