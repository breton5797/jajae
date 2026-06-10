-- 자재(Jajae) spec §12 — status transition guard on returns / as_requests. ADDITIVE.
-- returns_update / as_update RLS are row-level (not column-level), so without this a
-- contractor (contractor_id = auth.uid()) or supplier (supplies_order_item) could
-- `update returns set status='approved'` / `update as_requests set status='scheduled'`
-- and self-approve/self-schedule, bypassing the triage RPCs (0013/0014). Only an admin
-- or the trusted service_role backend (which includes the SECURITY DEFINER triage RPCs)
-- may change `status`. Non-status columns (reason/qty/issue) stay self-editable.
-- Mirrors prevent_profile_privilege_escalation (0012).

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
