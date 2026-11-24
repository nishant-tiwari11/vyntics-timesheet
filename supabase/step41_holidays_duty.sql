-- STEP 41 – run once in Supabase → SQL Editor. Safe to run again.
--  1. Holidays: a public holiday or festival is no longer an office day off by itself. An admin decides, per holiday, whether the
--     office is closed. Until they decide, the day is a normal working day for hours, leave and pay.
--  2. Duty logs: employees go on duty (from the office or from home) and off duty. Each stretch is stored with its start and stop.

-- ---------- 1. Holidays: office off or open ----------
alter table public.holidays add column if not exists office_off boolean not null default false;
alter table public.holidays add column if not exists office_off_decided boolean not null default false;

-- Days already gone keep behaving as they did, so past hours, leave and payroll don't change under anyone. Holidays that are
-- today or later start undecided (and open). Optional holidays were never days off: nothing to decide.
update public.holidays
set office_off = (type in ('public', 'festival')), office_off_decided = true
where holiday_date < public.portal_today() and not office_off_decided;
update public.holidays set office_off_decided = true where type = 'optional' and not office_off_decided;

-- The comp-off rules ask "is this a day off?": weekends, and holidays the office is closed for.
create or replace function public.is_day_off(d date) returns boolean
language sql stable security definer set search_path = public as $$
  select extract(isodow from d) in (6, 7)
    or exists (select 1 from public.holidays h where h.holiday_date = d and h.office_off)
$$;

-- Admin: say whether the office is closed on a holiday.
create or replace function public.holiday_set_office_off(p_id uuid, p_off boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only an admin can do this.'; end if;
  update public.holidays set office_off = coalesce(p_off, false), office_off_decided = true, updated_at = now() where id = p_id;
  if not found then raise exception 'That holiday no longer exists.'; end if;
end $$;
revoke all on function public.holiday_set_office_off(uuid, boolean) from public, anon;
grant execute on function public.holiday_set_office_off(uuid, boolean) to authenticated;

-- Admin: a heads-up in the bell for every public holiday or festival in the next 3 days that nobody has decided yet.
create or replace function public.holidays_refresh_reminders() returns void
language plpgsql security definer set search_path = public as $$
declare h record; a record;
begin
  if not public.is_admin() then return; end if;
  for h in
    select id, name, holiday_date from public.holidays
    where type in ('public', 'festival') and not office_off_decided
      and holiday_date >= public.portal_today() and holiday_date <= public.portal_today() + 3
  loop
    for a in select id from public.profiles where role = 'admin' and status = 'active' loop
      perform public.notify(a.id, 'holiday', h.name || case when h.holiday_date = public.portal_today() then ' is today' when h.holiday_date = public.portal_today() + 1 then ' is tomorrow' else ' is on ' || to_char(h.holiday_date, 'DD Mon') end,
        'Is the office closed? Mark it as an office off day, or keep it a working day.', '/timesheet/admin?tab=holidays', 'holiday:' || h.id);
    end loop;
  end loop;
end $$;
revoke all on function public.holidays_refresh_reminders() from public, anon;
grant execute on function public.holidays_refresh_reminders() to authenticated;

-- ---------- 2. Duty logs ----------
create table if not exists public.duty_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  duty_date date not null,                 -- the office-time day it started on
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  location text not null check (location in ('office', 'wfh')),
  auto_closed boolean not null default false,   -- the person forgot to go off duty; it was closed at the end of that day
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);
create index if not exists duty_logs_user_date_idx on public.duty_logs (user_id, duty_date);
create index if not exists duty_logs_date_idx on public.duty_logs (duty_date);
-- One open stretch per person.
create unique index if not exists duty_logs_one_open on public.duty_logs (user_id) where ended_at is null;

alter table public.duty_logs enable row level security;
drop policy if exists "duty: read own, team or admin" on public.duty_logs;
create policy "duty: read own, team or admin" on public.duty_logs
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()) or public.is_manager_of(user_id));
-- Nobody writes to the table directly: the two functions below do it for the signed-in person.

-- Close any stretch left open from an earlier day, at the end of that day.
create or replace function public.duty_close_stale(p_user uuid) returns void
language sql security definer set search_path = public as $$
  update public.duty_logs
     set ended_at = least(now(), ((duty_date + 1)::timestamp at time zone 'Asia/Kolkata') - interval '1 second'), auto_closed = true
   where user_id = p_user and ended_at is null and duty_date < public.portal_today()
$$;

create or replace function public.duty_start(p_location text) returns uuid
language plpgsql security definer set search_path = public as $$
declare me public.profiles; new_id uuid;
begin
  select * into me from public.profiles where id = auth.uid() and status = 'active';
  if me.id is null then raise exception 'Please sign in again.'; end if;
  if me.role not in ('employee', 'manager') then raise exception 'Going on duty is for employees and managers.'; end if;
  if p_location not in ('office', 'wfh') then raise exception 'Choose office or work from home.'; end if;
  perform public.duty_close_stale(me.id);
  if exists (select 1 from public.duty_logs where user_id = me.id and ended_at is null) then raise exception 'You are already on duty.'; end if;
  insert into public.duty_logs (user_id, duty_date, location) values (me.id, public.portal_today(), p_location) returning id into new_id;
  return new_id;
end $$;

create or replace function public.duty_stop() returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please sign in again.'; end if;
  perform public.duty_close_stale(me);
  update public.duty_logs set ended_at = now() where user_id = me and ended_at is null;
  if not found then raise exception 'You are not on duty.'; end if;
end $$;

revoke all on function public.duty_close_stale(uuid) from public, anon, authenticated;
revoke all on function public.duty_start(text) from public, anon;
revoke all on function public.duty_stop() from public, anon;
grant execute on function public.duty_start(text) to authenticated;
grant execute on function public.duty_stop() to authenticated;

notify pgrst, 'reload schema';
