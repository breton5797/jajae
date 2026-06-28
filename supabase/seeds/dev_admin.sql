-- 자재(Jajae) — LOCAL DEV ONLY auth seed.
--
-- Creates the dev-login admin (DEV_ADMIN_EMAIL / DEV_ADMIN_PASSWORD) so that
-- `supabase db reset` yields a working email/password admin for the dev-login
-- helper (app/api/dev-login). Real production auth is Kakao OAuth — this account
-- and password are a throwaway LOCAL credential and must never be used elsewhere.
--
-- Why a separate file (not supabase/seed.sql): the PGlite test harness
-- (tests/db/harness.ts) loads ONLY seed.sql against a minimal auth shim
-- (auth.users has just id+email, no pgcrypto). Putting auth.users/crypt() in
-- seed.sql would break every tests/db/* test. This file is wired in via
-- config.toml [db.seed].sql_paths so it runs on `supabase db reset` only.
--
-- The password below MUST match DEV_ADMIN_PASSWORD in .env.local.

do $$
declare
  v_id       uuid := '00000000-0000-0000-0000-0000000000ad';
  v_email    text := 'admin@jajae.local';
  v_password text := 'devadmin1234';
begin
  -- 1) auth user (bcrypt password via pgcrypto; email pre-confirmed)
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    v_email, extensions.crypt(v_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
    '', '', '', '', '', ''
  ) on conflict (id) do nothing;

  -- 2) email identity (GoTrue requires it for password sign-in)
  insert into auth.identities (
    id, user_id, provider_id, provider, identity_data,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_id, v_id::text, 'email',
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    now(), now(), now()
  ) on conflict (provider_id, provider) do nothing;

  -- 3) app profile with admin role
  insert into public.profiles (id, role, company_name, biz_status)
  values (v_id, 'admin', 'Dev Admin', 'verified')
  on conflict (id) do update set role = 'admin', biz_status = 'verified';
end $$;
