-- STEP 8 – run once in Supabase → SQL Editor.
-- Database-level rules for the admin panel. The app also checks these and shows the same messages,
-- but the database is what actually enforces them (no service role key is ever used).
-- When auth.uid() is null (you editing a row by hand in the Table Editor / SQL Editor) the
-- approval rules are skipped, so manual fixes still work.

-- 1. Timesheets: only a submitted week can be approved; nobody approves or sends back their own.
create or replace function public.guard_week_status() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status and auth.uid() is not null then
    if new.status = 'approved' then
      if old.status <> 'submitted' then
        raise exception 'Only a submitted timesheet can be approved.';
      end if;
      if new.user_id = auth.uid() then
        raise exception 'You cannot approve your own timesheet.';
      end if;
    elsif old.status = 'approved' and new.user_id = auth.uid() then
      raise exception 'You cannot send back your own timesheet.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists guard_week_status on public.timesheet_weeks;
create trigger guard_week_status
  before update on public.timesheet_weeks
  for each row execute function public.guard_week_status();

-- 2. Requests: only pending requests can be decided; nobody decides their own.
--    (Employees can still cancel their own pending request.)
create or replace function public.guard_request_status() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status
     and new.status in ('approved', 'rejected')
     and auth.uid() is not null then
    if new.user_id = auth.uid() then
      raise exception 'You cannot decide your own request.';
    end if;
    if old.status <> 'pending' then
      raise exception 'Only a pending request can be approved or rejected.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists guard_request_status on public.requests;
create trigger guard_request_status
  before update on public.requests
  for each row execute function public.guard_request_status();

-- 3. Roles: admins only, never your own role, and always at least one admin left.
create or replace function public.set_user_role(target uuid, new_role public.user_role) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change roles.';
  end if;
  if target = auth.uid() then
    raise exception 'You cannot change your own role.';
  end if;
  if new_role = 'employee'
     and not exists (select 1 from public.profiles where role = 'admin' and id <> target) then
    raise exception 'At least one admin is required.';
  end if;
  update public.profiles set role = new_role where id = target;
  if not found then
    raise exception 'That person could not be found.';
  end if;
end $$;
