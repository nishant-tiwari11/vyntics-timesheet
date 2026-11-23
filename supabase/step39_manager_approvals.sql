-- STEP 39 – run once in Supabase → SQL Editor (after step17/18 comp-off, step24 access and step36). Safe to run again.
-- A manager can decide leave, work-from-home and comp-off requests for the people who report to them (their direct reports),
-- and nobody else's. Admins can still decide everything. Nobody can decide their own request.

-- ---------- Leave and work from home ----------
drop policy if exists "requests: manager decide" on public.requests;
create policy "requests: manager decide" on public.requests
  for update to authenticated
  using (public.is_manager_of(user_id) and user_id <> auth.uid() and status = 'pending')
  with check (public.is_manager_of(user_id) and user_id <> auth.uid());

-- Whoever is not the owner or an admin may only change the decision, never the request itself.
create or replace function public.requests_guard() returns trigger
language plpgsql as $$
begin
  if not public.is_admin() and auth.uid() is distinct from old.user_id then
    if new.user_id is distinct from old.user_id or new.type is distinct from old.type
       or new.from_date is distinct from old.from_date or new.to_date is distinct from old.to_date
       or new.reason is distinct from old.reason or new.day_part is distinct from old.day_part
       or new.created_at is distinct from old.created_at then
      raise exception 'Only the decision can be changed on someone else''s request.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists requests_guard on public.requests;
create trigger requests_guard before update on public.requests for each row execute function public.requests_guard();

-- ---------- Comp-off credit requests ----------
drop policy if exists "comp-off: decide or cancel" on public.comp_off_requests;
create policy "comp-off: decide or cancel" on public.comp_off_requests
  for update to authenticated
  using ((user_id = auth.uid() and status = 'pending') or public.is_admin() or public.is_manager_of(user_id))
  with check (user_id = auth.uid() or public.is_admin() or public.is_manager_of(user_id));

create or replace function public.comp_off_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s public.comp_off_settings;
  can_decide boolean := public.is_admin() or public.is_manager_of(old.user_id);
begin
  -- Automatic updates made by comp_off_sync / the re-approval function set this flag for the one transaction.
  if current_setting('app.comp_off_sync', true) = 'on' then
    if new.user_id is distinct from old.user_id or new.work_date is distinct from old.work_date then
      raise exception 'A comp-off request can''t move to another person or day.';
    end if;
    return new;
  end if;

  if new.user_id is distinct from old.user_id
     or new.work_date is distinct from old.work_date
     or new.hours_worked is distinct from old.hours_worked
     or new.credit is distinct from old.credit
     or new.reason is distinct from old.reason
     or new.created_at is distinct from old.created_at
     or new.timesheet_entry_id is distinct from old.timesheet_entry_id
     or new.auto_created is distinct from old.auto_created
     or new.needs_reapproval is distinct from old.needs_reapproval
     or new.proposed_hours is distinct from old.proposed_hours
     or new.proposed_credit is distinct from old.proposed_credit then
    raise exception 'A comp-off request can''t be edited. Cancel it and ask again.';
  end if;

  if new.status is distinct from old.status then
    if old.status <> 'pending' then
      raise exception 'Only a pending request can be decided or cancelled.';
    end if;
    if new.status = 'cancelled' then
      if old.user_id <> auth.uid() then
        raise exception 'Only the person who asked can cancel a request.';
      end if;
    elsif new.status in ('approved', 'rejected') then
      if not can_decide then
        raise exception 'Only an admin or their manager can approve or reject.';
      end if;
      if old.user_id = auth.uid() then
        raise exception 'You cannot decide your own request.';
      end if;
      new.approved_by := auth.uid();
      new.approved_at := now();
      if new.status = 'approved' then
        select * into s from public.comp_off_settings where id;
        new.expires_on := public.portal_today() + s.expiry_days;
      else
        new.expires_on := null;
      end if;
    else
      raise exception 'That status isn''t allowed.';
    end if;
  else
    if new.admin_note is distinct from old.admin_note and not can_decide then
      raise exception 'Only an admin or their manager can add a note.';
    end if;
    new.approved_by := old.approved_by;
    new.approved_at := old.approved_at;
    new.expires_on := old.expires_on;
  end if;
  return new;
end $$;

-- ---------- Paid leave allowance, readable by admins and managers (the payroll settings table is admin only) ----------
create or replace function public.paid_leave_quota() returns integer
language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'manager') and status = 'active')
              then (select paid_leave_per_month from public.payroll_settings limit 1) end
$$;
revoke all on function public.paid_leave_quota() from public, anon;
grant execute on function public.paid_leave_quota() to authenticated;

notify pgrst, 'reload schema';
