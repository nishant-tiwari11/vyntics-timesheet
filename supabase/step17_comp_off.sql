-- Step 17: comp-off (compensatory off). Run once in the Supabase SQL editor.
--
-- How it works
--   Earning : an employee asks for comp-off for a day they worked on a weekend, public holiday or festival day.
--             An admin approves it and it becomes a CREDIT of 0.5 or 1 day that expires after N days.
--   Using   : a leave request with comp_off = true spends credits, one per working day, oldest expiry first.
--   Balance : never stored. It is worked out from the two tables below every time it is read, so it can't drift,
--             and a rejected or cancelled leave request gives its days back automatically.
--
-- What the database itself enforces (not only the app): eligible dates, no future dates, no duplicate day, the
-- hours-to-credit rule, the monthly cap, that nobody approves their own request, and the status changes allowed.
-- The leave balance check (enough unexpired credit) is done in the app when the request is made.

-- ---------- Settings: one row, edited by admins ----------
create table if not exists public.comp_off_settings (
  id boolean primary key default true check (id),
  half_day_hours numeric(4, 2) not null default 4 check (half_day_hours > 0),
  full_day_hours numeric(4, 2) not null default 8 check (full_day_hours > 0),
  expiry_days integer not null default 90 check (expiry_days between 1 and 730),
  monthly_cap numeric(4, 1) not null default 2 check (monthly_cap >= 0), -- days a person can earn per month; 0 = no limit
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint comp_off_hours_order check (full_day_hours >= half_day_hours)
);
insert into public.comp_off_settings (id) values (true) on conflict (id) do nothing;

alter table public.comp_off_settings enable row level security;
drop policy if exists "comp-off settings: read" on public.comp_off_settings;
create policy "comp-off settings: read" on public.comp_off_settings for select to authenticated using (true);
drop policy if exists "comp-off settings: change" on public.comp_off_settings;
create policy "comp-off settings: change" on public.comp_off_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- Requests to earn comp-off ----------
create table if not exists public.comp_off_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  work_date date not null,
  hours_worked numeric(4, 2) not null check (hours_worked > 0 and hours_worked <= 24),
  reason text check (reason is null or char_length(reason) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  credit numeric(2, 1) not null default 1 check (credit in (0.5, 1)),
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  expires_on date,
  admin_note text check (admin_note is null or char_length(admin_note) <= 500),
  created_at timestamptz not null default now()
);

-- One live request per person per day (a rejected or cancelled one can be asked for again).
create unique index if not exists comp_off_one_per_day
  on public.comp_off_requests (user_id, work_date) where status in ('pending', 'approved');
create index if not exists comp_off_user_idx on public.comp_off_requests (user_id, status);

alter table public.comp_off_requests enable row level security;

drop policy if exists "comp-off: read" on public.comp_off_requests;
create policy "comp-off: read" on public.comp_off_requests
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists "comp-off: ask" on public.comp_off_requests;
create policy "comp-off: ask" on public.comp_off_requests
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "comp-off: decide or cancel" on public.comp_off_requests;
create policy "comp-off: decide or cancel" on public.comp_off_requests
  for update to authenticated
  using ((user_id = auth.uid() and status = 'pending') or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- Rules applied to every new request (the credit is set here, so nobody can pick their own).
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
    extract(isodow from new.work_date) in (6, 7)
    or exists (
      select 1 from public.holidays h
      where h.holiday_date = new.work_date and h.type in ('public', 'festival')
    )
  ) then
    raise exception 'Comp-off can only be earned for work on a weekend, a public holiday or a festival day.';
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

drop trigger if exists comp_off_before_insert on public.comp_off_requests;
create trigger comp_off_before_insert
  before insert on public.comp_off_requests
  for each row execute function public.comp_off_before_insert();

-- Rules for changes: who can move a request to which status, and nothing else may change.
create or replace function public.comp_off_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s public.comp_off_settings;
begin
  if new.user_id is distinct from old.user_id
     or new.work_date is distinct from old.work_date
     or new.hours_worked is distinct from old.hours_worked
     or new.credit is distinct from old.credit
     or new.reason is distinct from old.reason
     or new.created_at is distinct from old.created_at then
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
      if not public.is_admin() then
        raise exception 'Only an admin can approve or reject.';
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
    -- No status change: only an admin may add a note.
    if new.admin_note is distinct from old.admin_note and not public.is_admin() then
      raise exception 'Only an admin can add a note.';
    end if;
    new.approved_by := old.approved_by;
    new.approved_at := old.approved_at;
    new.expires_on := old.expires_on;
  end if;
  return new;
end $$;

drop trigger if exists comp_off_before_update on public.comp_off_requests;
create trigger comp_off_before_update
  before update on public.comp_off_requests
  for each row execute function public.comp_off_before_update();

-- ---------- A leave request can be paid for with comp-off ----------
alter table public.requests add column if not exists comp_off boolean not null default false;
alter table public.requests drop constraint if exists requests_comp_off_leave_only;
alter table public.requests add constraint requests_comp_off_leave_only check (not comp_off or type = 'leave');
