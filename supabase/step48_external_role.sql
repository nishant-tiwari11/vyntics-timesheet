-- STEP 48 – run once in Supabase → SQL Editor. Safe to run again.
-- A new role, "External": someone who works with the company but isn't on its staff. In the portal an External is the same as an
-- employee (timesheet, leave, expenses, going on duty, onboarding documents); only the label differs, so admins can tell them apart
-- in Employees and the headcount.
--
-- RUN IN TWO PARTS. A new value of an enum type can't be used in the statement batch that creates it, so:
--   Part 1 (alone):  the first statement below.
--   Part 2 (after):  everything from "PART 2" down.
-- Adding a person or changing a role needs nothing else: access_add_user and access_update_user turn the role text into this
-- type, so they accept 'external' as soon as part 1 has run.

-- ---------- PART 1 ----------
alter type public.user_role add value if not exists 'external';

-- ---------- PART 2 ----------
-- The two database functions that named only employees and managers now include externals. (Same as before otherwise.)
create or replace function public.docs_refresh_reminders() returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  today date := public.portal_today();
  missing integer;
  d record;
begin
  select * into me from public.profiles where id = auth.uid() and status = 'active';
  if me.id is null or me.role::text not in ('employee', 'external', 'manager') then return; end if;
  if me.docs_reminded_at is not null and me.docs_reminded_at > now() - interval '6 hours' then return; end if;
  update public.profiles set docs_reminded_at = now() where id = me.id;

  missing := public.docs_missing_count(me.id);
  if missing > 0 then
    perform public.notify(me.id, 'docs_missing', 'Documents missing',
      missing || ' required ' || case when missing = 1 then 'document still needs' else 'documents still need' end || ' to be uploaded.',
      '/timesheet/profile?tab=documents', 'missing:' || to_char(today, 'IYYY-"W"IW'));
  end if;

  for d in
    select id, name, expiry_date from public.employee_documents
    where user_id = me.id and is_current and deleted_at is null and expiry_date is not null and expiry_date <= today + 30
  loop
    perform public.notify(me.id, 'docs_expiry',
      case when d.expiry_date < today then 'Document expired' else 'Document expiring soon' end,
      d.name || (case when d.expiry_date < today then ' expired on ' else ' expires on ' end) || to_char(d.expiry_date, 'DD Mon YYYY') || '.',
      '/timesheet/profile?tab=documents', 'expiry:' || d.id || ':' || d.expiry_date);
  end loop;
end $$;

create or replace function public.duty_start(p_location text) returns uuid
language plpgsql security definer set search_path = public as $$
declare me public.profiles; new_id uuid;
begin
  select * into me from public.profiles where id = auth.uid() and status = 'active';
  if me.id is null then raise exception 'Please sign in again.'; end if;
  if me.role::text not in ('employee', 'external', 'manager') then raise exception 'Going on duty is for employees, externals and managers.'; end if;
  if p_location not in ('office', 'wfh') then raise exception 'Choose office or work from home.'; end if;
  perform public.duty_close_stale(me.id);
  if exists (select 1 from public.duty_logs where user_id = me.id and ended_at is null) then raise exception 'You are already on duty.'; end if;
  insert into public.duty_logs (user_id, duty_date, location) values (me.id, public.portal_today(), p_location) returning id into new_id;
  return new_id;
end $$;

revoke all on function public.duty_start(text) from public, anon;
grant execute on function public.duty_start(text) to authenticated;

notify pgrst, 'reload schema';
