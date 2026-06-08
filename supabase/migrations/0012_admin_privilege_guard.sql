-- 자재(Jajae) — privilege-escalation guard on profiles. ADDITIVE.
-- profiles_update RLS permits self-update (id = auth.uid()) and RLS is row-level,
-- not column-level — so without this trigger a non-admin could
-- `update profiles set role='admin'` (or raise their own credit_limit) and defeat
-- every admin gate. Only an admin (or the trusted service_role backend) may change
-- the privilege/financial columns. biz_no / biz_status stay self-updatable so the
-- business-number verification flow (app/api/biz-verify) keeps working.
create or replace function public.prevent_profile_privilege_escalation()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' or public.is_admin() then
    return NEW; -- trusted backend / admin may change anything
  end if;
  if NEW.role is distinct from OLD.role then
    raise exception 'role can only be changed by an admin';
  end if;
  if NEW.credit_limit is distinct from OLD.credit_limit then
    raise exception 'credit_limit can only be changed by an admin';
  end if;
  -- credit_used may only INCREASE for a non-admin (consumed at checkout); a
  -- decrease (credit repayment) is an admin/finance action — blocking self-
  -- decrease stops a user from freeing their own credit to bypass the limit.
  if NEW.credit_used < OLD.credit_used then
    raise exception 'credit_used cannot be reduced by a non-admin';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_profiles_no_privesc on profiles;
create trigger trg_profiles_no_privesc
  before update on profiles
  for each row execute function public.prevent_profile_privilege_escalation();
