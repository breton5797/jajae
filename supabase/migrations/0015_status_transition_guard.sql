-- 자재(Jajae) spec §12 — status transition guard on returns / as_requests. ADDITIVE.
-- returns_update / as_update RLS are row-level (not column-level), so without this a
-- contractor (contractor_id = auth.uid()) or supplier (supplies_order_item) could
-- `update returns set status='approved'` / `update as_requests set status='scheduled'`
-- and self-approve/self-schedule, bypassing the triage RPCs (0013/0014). Only an admin
-- or the trusted service_role backend (which includes the SECURITY DEFINER triage RPCs)
-- may change `status`. Non-status columns (reason/qty/issue) stay self-editable.
-- Mirrors prevent_profile_privilege_escalation (0012).
--
-- TRUST BOUNDARY: this guard (like 0012 and every RLS policy here) reads auth.role()
-- = the `request.jwt.claim.role` GUC, which PostgREST sets per request and a normal
-- REST call (one translated statement) cannot override. This holds ONLY while no raw
-- multi-statement SQL surface is exposed to non-admin callers — do NOT add a generic
-- execute_sql/query RPC callable by `authenticated`, or this (and 0012) can be bypassed
-- via set_config('request.jwt.claim.role','service_role',false). Service-role key access
-- is already fully trusted. Note: current_user / pg_has_role cannot replace auth.role()
-- here — inside a SECURITY DEFINER trigger they resolve to the function owner, not the
-- caller, so they would wrongly allow everyone.

create or replace function public.guard_return_status_transition()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' or public.is_admin() then
    return NEW; -- trusted backend / admin (incl. SECURITY DEFINER triage RPCs)
  end if;
  if NEW.status is distinct from OLD.status then
    raise exception 'return status can only be changed by an admin';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_returns_status_guard on returns;
create trigger trg_returns_status_guard
  before update on returns
  for each row execute function public.guard_return_status_transition();

create or replace function public.guard_as_request_status_transition()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' or public.is_admin() then
    return NEW; -- trusted backend / admin (incl. SECURITY DEFINER triage RPCs)
  end if;
  if NEW.status is distinct from OLD.status then
    raise exception 'as request status can only be changed by an admin';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_as_requests_status_guard on as_requests;
create trigger trg_as_requests_status_guard
  before update on as_requests
  for each row execute function public.guard_as_request_status_transition();
