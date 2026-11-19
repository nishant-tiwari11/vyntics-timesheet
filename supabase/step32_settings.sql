-- STEP 32 – run once in Supabase → SQL Editor, AFTER step29_weekly_lock.sql and step24_access.sql. Safe to run again.
-- Settings an admin can change on Admin -> Settings, used everywhere:
--   * daily_target_hours  the hours a full working day is expected to have (dashboard, reports, "under target")
--   * weekly_off_days     which weekdays are the weekly off (1 = Monday ... 7 = Sunday). Default: Saturday and Sunday.
--                         Comp-off can be earned for work on these days.
--   * locked_through      an admin lock: employees can't add, change or delete time logs dated on or before this day.
--                         It adds to the weekly Sunday-night lock (step 29); admins can still correct anything.
-- Everyone signed in can read the settings (the pages need them). Nobody writes to the table directly: admins use
-- settings_update(), which checks the role and writes what changed to the audit log.
-- (Comp-off expiry and the earning rules stay in comp_off_settings, edited on the same Settings page.)

create table if not exists public.app_settings (
  id boolean primary key default true check (id),
  daily_target_hours numeric(4, 2) not null default 8 check (daily_target_hours > 0 and daily_target_hours <= 24),
  weekly_off_days smallint[] not null default array[6, 7]::smallint[],
  locked_through date,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint app_settings_off_days_ok check (weekly_off_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[] and cardinality(weekly_off_days) <= 6)
);
insert into public.app_settings (id) values (true) on conflict (id) do nothing;

alter table public.app_settings enable row level security;
drop policy if exists "settings: read" on public.app_settings;
create policy "settings: read" on public.app_settings for select to authenticated using (true);

-- ---------- Is this a weekly off day? ----------
create or replace function public.is_weekly_off(d date) returns boolean
language sql stable security definer set search_path = public as $$
  select extract(isodow from d)::smallint = any (coalesce((select weekly_off_days from public.app_settings where id), array[6, 7]::smallint[]))
$$;

-- A weekly off, a public holiday or a festival (replaces step 18's, which assumed Saturday and Sunday).
create or replace function public.is_day_off(d date) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_weekly_off(d)
    or exists (select 1 from public.holidays h where h.holiday_date = d and h.type in ('public', 'festival'))
$$;

-- ---------- Comp-off requests: the weekend rule now follows the weekly off days (the rest is as in step 17) ----------
create or replace function public.comp_off_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s public.comp_off_settings;
  today date := public.portal_today();
  month_total numeric;
begin
  select * into s from public.comp_off_settings where id;

  new.status := 'pending';
  new.approved_by := null;
  new.approved_at := null;
  new.expires_on := null;
  new.admin_note := null;

  if new.work_date > today then
    raise exception 'You can only ask for comp-off for a day you have already worked.';
  end if;

  if not (
    public.is_weekly_off(new.work_date)
    or exists (
      select 1 from public.holidays h
      where h.holiday_date = new.work_date and h.type in ('public', 'festival')
    )
  ) then
    raise exception 'Comp-off can only be earned for work on a weekly off day, a public holiday or a festival day.';
  end if;

  if exists (
    select 1 from public.requests r
    where r.user_id = new.user_id
      and r.type = 'leave'
      and r.status in ('pending', 'approved')
      and new.work_date between r.from_date and r.to_date
  ) then
    raise exception 'You have leave on that day, so it can''t also be a day you worked.';
  end if;

  if new.hours_worked >= s.full_day_hours then
    new.credit := 1;
  elsif new.hours_worked >= s.half_day_hours then
    new.credit := 0.5;
  else
    raise exception 'Work at least % hours for a half day of comp-off.', s.half_day_hours;
  end if;

  if s.monthly_cap > 0 then
    select coalesce(sum(credit), 0) into month_total
    from public.comp_off_requests
    where user_id = new.user_id
      and status in ('pending', 'approved')
      and date_trunc('month', work_date) = date_trunc('month', new.work_date);
    if month_total + new.credit > s.monthly_cap then
      raise exception 'The monthly limit is % days of comp-off. You have already asked for % this month.', s.monthly_cap, month_total;
    end if;
  end if;

  return new;
end $$;

-- ---------- The admin lock, inside the time log rules (the weekly lock of step 29 stays as it is) ----------
drop policy if exists "logs: insert own this week" on public.work_logs;
create policy "logs: insert own this week" on public.work_logs
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and log_date between date_trunc('week', public.portal_today())::date and public.portal_today()
    and log_date > coalesce((select locked_through from public.app_settings where id), date '0001-01-01')
  );

drop policy if exists "logs: delete own pending this week" on public.work_logs;
create policy "logs: delete own pending this week" on public.work_logs
  for delete to authenticated
  using (
    user_id = auth.uid() and status = 'pending'
    and log_date >= date_trunc('week', public.portal_today())::date
    and log_date > coalesce((select locked_through from public.app_settings where id), date '0001-01-01')
  );

drop policy if exists "logs: update own pending this week" on public.work_logs;
create policy "logs: update own pending this week" on public.work_logs
  for update to authenticated
  using (
    user_id = auth.uid() and status = 'pending'
    and log_date >= date_trunc('week', public.portal_today())::date
    and log_date > coalesce((select locked_through from public.app_settings where id), date '0001-01-01')
  )
  with check (
    user_id = auth.uid() and status = 'pending'
    and log_date between date_trunc('week', public.portal_today())::date and public.portal_today()
    and log_date > coalesce((select locked_through from public.app_settings where id), date '0001-01-01')
  );

-- ---------- Change the settings (admins only), and say what changed in the audit log ----------
create or replace function public.settings_update(p_target numeric, p_off integer[], p_locked date) returns void
language plpgsql security definer set search_path = public as $$
declare
  old public.app_settings;
  names text[] := array['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  off smallint[];
  changes text[] := '{}';
begin
  if not public.access_caller_ok() then raise exception 'Only an admin can do that.'; end if;
  if p_target is null or p_target <= 0 or p_target > 24 then raise exception 'The daily target must be more than 0 and at most 24 hours.'; end if;
  if exists (select 1 from unnest(coalesce(p_off, '{}')) d where d is null or d < 1 or d > 7) then raise exception 'Choose weekdays from Monday to Sunday.'; end if;
  select coalesce(array_agg(d::smallint order by d), '{}') into off from (select distinct unnest(coalesce(p_off, '{}')) as d) x;
  if cardinality(off) > 6 then raise exception 'At least one day of the week must be a working day.'; end if;
  if p_locked is not null and p_locked > public.portal_today() then raise exception 'The lock date can''t be in the future.'; end if;

  select * into old from public.app_settings where id;
  if old.daily_target_hours is distinct from round(p_target, 2) then
    changes := changes || format('Daily target %s to %s h', trim_scale(old.daily_target_hours), trim_scale(round(p_target, 2)));
  end if;
  if old.weekly_off_days is distinct from off then
    changes := changes || format('Weekly off %s to %s',
      coalesce((select string_agg(names[x], ', ' order by x) from unnest(old.weekly_off_days) x), 'none'),
      coalesce((select string_agg(names[x], ', ' order by x) from unnest(off) x), 'none'));
  end if;
  if old.locked_through is distinct from p_locked then
    changes := changes || format('Locked through %s to %s', coalesce(old.locked_through::text, 'nothing'), coalesce(p_locked::text, 'nothing'));
  end if;

  update public.app_settings
     set daily_target_hours = round(p_target, 2), weekly_off_days = off, locked_through = p_locked, updated_by = auth.uid(), updated_at = now()
   where id;
  if cardinality(changes) > 0 then
    perform public.access_audit_write('settings_changed', 'Working time and lock', array_to_string(changes, '; '));
  end if;
end $$;

revoke all on function public.is_weekly_off(date) from public, anon;
revoke all on function public.settings_update(numeric, integer[], date) from public, anon;
grant execute on function public.is_weekly_off(date) to authenticated;
grant execute on function public.settings_update(numeric, integer[], date) to authenticated;

notify pgrst, 'reload schema';
