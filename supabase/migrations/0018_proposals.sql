-- 자재(Jajae) 즉석 제안 §DB 0018 — proposals 산출물 + 비밀번호/만료 공개 공유. ADDITIVE.
-- 한 시공사가 만든 제안서(견적 0016 기반)를 저장하고, 소비자에게는 토큰 링크 +
-- 비밀번호 + 만료로만 공개 노출한다.
--
-- 비밀번호 해시 (이중 경로):
--   * 운영(Supabase): pgcrypto bcrypt — crypt(pw, gen_salt('bf')).
--   * 테스트(PGlite): pgcrypto 확장이 없으므로 코어 내장 md5(token||password)로 폴백.
--   두 경우 모두 (1) 평문 비저장 (2) 정확한 비밀번호 필요 라는 보안 속성을 만족한다.
--   RPC는 plpgsql로 작성해 본문 검증을 런타임으로 미루고(SQL 함수는 생성 시 crypt 참조를
--   검증해 PGlite에서 실패), pg_proc로 pgcrypto 가용 여부를 감지해 분기한다.
--   search_path 에 extensions 를 포함해 Supabase의 extensions 스키마 pgcrypto도 해석한다.
--
-- 확장 생성은 DO 블록으로 감싸 PGlite의 "extension pgcrypto is not available" 예외를
-- 무시(운영에선 정상 생성)하여 모든 db 테스트(전 마이그레이션 자동 적용)가 깨지지 않게 한다.

do $$
begin
  create extension if not exists pgcrypto;
exception when others then
  raise notice 'pgcrypto unavailable in this environment; share-password hashing falls back to md5';
end
$$;

-- ---------- table ----------
create table proposals (
  id                  uuid primary key default gen_random_uuid(),
  estimate_id         uuid not null references interior_estimates(id) on delete cascade,
  contractor_id       uuid not null references profiles(id) on delete cascade,
  customer_name       text,
  template_id         text not null,
  finishes            jsonb not null default '[]'::jsonb,
  snapshot_url        text,
  materials_krw       bigint not null default 0,
  construction_krw    bigint not null default 0,
  total_krw           bigint not null default 0,
  status              text not null default 'draft' check (status in ('draft','shared')),
  share_token         text unique,
  share_password_hash text,
  share_expires_at    timestamptz,
  created_at          timestamptz not null default now()
);

-- ---------- indexes ----------
create index idx_proposals_contractor on proposals(contractor_id);
create index idx_proposals_token      on proposals(share_token);

-- ---------- RLS (0016 패턴 동일: 소유자/admin, anon revoke, service 신뢰) ----------
alter table proposals enable row level security;

create policy proposals_select on proposals for select
  using (contractor_id = auth.uid() or public.is_admin());
create policy proposals_insert on proposals for insert
  with check (contractor_id = auth.uid() or public.is_admin());
create policy proposals_update on proposals for update
  using (contractor_id = auth.uid() or public.is_admin())
  with check (contractor_id = auth.uid() or public.is_admin());
create policy proposals_delete on proposals for delete
  using (contractor_id = auth.uid() or public.is_admin());

-- 0003의 default privileges 가 anon read 를 자동 부여하므로 명시적으로 회수.
revoke all on proposals from anon;
grant select, insert, update, delete on proposals to authenticated;
grant all on proposals to service_role;

-- ---------- 공개 공유 검증 RPC ----------
-- 토큰+비번+만료를 한 함수에서 검증. RLS를 넓히지 않고 SECURITY DEFINER로 우회하되
-- 'shared' & 만료전 & 비번 일치 행의 안전 컬럼(비번해시/소유자/공유메타 제외)만 JSON 반환.
create or replace function get_shared_proposal(p_token text, p_password text)
returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $fn$
declare
  rec proposals;
  matches boolean;
begin
  select * into rec from proposals
   where share_token = p_token
     and status = 'shared'
     and share_expires_at > now();
  if not found then
    return null;
  end if;

  if exists (select 1 from pg_proc where proname = 'crypt') then
    matches := rec.share_password_hash = crypt(p_password, rec.share_password_hash);
  else
    matches := rec.share_password_hash = md5(p_token || p_password);
  end if;
  if not matches then
    return null;
  end if;

  return jsonb_build_object(
    'id', rec.id,
    'customer_name', rec.customer_name,
    'template_id', rec.template_id,
    'finishes', rec.finishes,
    'snapshot_url', rec.snapshot_url,
    'materials_krw', rec.materials_krw,
    'construction_krw', rec.construction_krw,
    'total_krw', rec.total_krw,
    'created_at', rec.created_at
  );
end;
$fn$;

revoke all on function get_shared_proposal(text, text) from public;
grant execute on function get_shared_proposal(text, text) to anon, authenticated, service_role;

-- ---------- 공유 설정 RPC (서버에서 해시) ----------
-- 소유자 본인(id=p_id AND contractor_id=p_owner) 행만 'shared' 로 전환하며 비번을 해시.
create or replace function set_proposal_share(
  p_id uuid, p_owner uuid, p_token text, p_password text, p_expires timestamptz)
returns void
language plpgsql security definer set search_path = public, extensions as $fn$
declare
  v_hash text;
begin
  if exists (select 1 from pg_proc where proname = 'gen_salt') then
    v_hash := crypt(p_password, gen_salt('bf'));
  else
    v_hash := md5(p_token || p_password);
  end if;

  update proposals
     set status = 'shared',
         share_token = p_token,
         share_password_hash = v_hash,
         share_expires_at = p_expires
   where id = p_id and contractor_id = p_owner;
end;
$fn$;

revoke all on function set_proposal_share(uuid, uuid, text, text, timestamptz) from public;
grant execute on function set_proposal_share(uuid, uuid, text, text, timestamptz) to authenticated, service_role;
