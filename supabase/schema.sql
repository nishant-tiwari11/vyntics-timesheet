-- =====================================================================
-- Vyntics Timesheet Portal – database schema + Row Level Security
-- Run once in Supabase → SQL Editor → New query → paste all → Run.
-- Safe to re-run only on an empty project (it creates types/tables).
-- =====================================================================

create extension if not exists btree_gist;   -- needed for the overlap rule on requests

-- ---------- Enums ----------------------------------------------------
create type public.user_role      as enum ('employee', 'admin');
create type public.request_type   as enum ('leave', 'wfh');
create type public.request_status as enum ('pending', 'approved', 'rejected', 'cancelled');
create type public.week_status    as enum ('draft', 'submitted', 'approved', 'sent_back');

-- ---------- Tables ---------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text,
  role       public.user_role not null default 'employee',
  created_at timestamptz not null default now()
);

create table public.timesheet_weeks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  week_start   date not null check (extract(isodow from week_start) = 1),  -- must be a Monday
  status       public.week_status not null default 'draft',
  submitted_at timestamptz,
  reviewed_by  uuid references public.profiles (id) on delete set null,
  reviewed_at  timestamptz,
  admin_note   text,
  created_at   timestamptz not null default now(),
  unique (user_id, week_start)
);

create table public.timesheet_rows (
  id       uuid primary key default gen_random_uuid(),
  week_id  uuid not null references public.timesheet_weeks (id) on delete cascade,
  project  text not null default '',
  position int  not null default 0,
  mon numeric(4,2) not null default 0 check (mon between 0 and 24),
  tue numeric(4,2) not null default 0 check (tue between 0 and 24),
  wed numeric(4,2) not null default 0 check (wed between 0 and 24),
  thu numeric(4,2) not null default 0 check (thu between 0 and 24),
  fri numeric(4,2) not null default 0 check (fri between 0 and 24),
  sat numeric(4,2) not null default 0 check (sat between 0 and 24),
  sun numeric(4,2) not null default 0 check (sun between 0 and 24)
);

create table public.requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  type        public.request_type not null,
  from_date   date not null,
  to_date     date not null,
  reason      text,
  status      public.request_status not null default 'pending',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  admin_note  text,
  created_at  timestamptz not null default now(),
  check (to_date >= from_date),
  -- A person can't have two live (pending/approved) requests covering the same day.
  constraint requests_no_overlap exclude using gist (
    user_id with =,
    daterange(from_date, to_date, '[]') with &&
  ) where (status in ('pending', 'approved'))
);

create table public.work_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  log_date   date not null,
  content    text not null check (length(btrim(content)) > 0),
  hours      numeric(4,2) check (hours is null or hours between 0 and 24),
  created_at timestamptz not null default now()
);

create index on public.timesheet_weeks (user_id, week_start);
create index on public.timesheet_rows  (week_id);
create index on public.requests        (user_id, from_date);
create index on public.work_logs       (user_id, log_date);

-- ---------- Helper functions ----------------------------------------
-- "Today" for the office. CHANGE the time zone if your office is elsewhere.
create function public.portal_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

-- security definer so policies on profiles can call it without recursing into RLS.
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

-- Is the given week editable by its owner (draft / sent back)?
create function public.week_is_open(w uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.timesheet_weeks
    where id = w and user_id = auth.uid() and status in ('draft', 'sent_back')
  )
$$;

-- ---------- New user → profile (first account becomes admin) ---------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Serialise signups so two simultaneous "first" users can't both become admin.
  perform pg_advisory_xact_lock(7001);
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name'),
    case when exists (select 1 from public.profiles) then 'employee'::public.user_role
         else 'admin'::public.user_role end
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Admin: make / remove admin (only path to change a role) --
create function public.set_user_role(target uuid, new_role public.user_role) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change roles';
  end if;
  if new_role = 'employee'
     and (select count(*) from public.profiles where role = 'admin' and id <> target) = 0 then
    raise exception 'There must be at least one admin';
  end if;
  update public.profiles set role = new_role where id = target;
end $$;

revoke all on function public.set_user_role(uuid, public.user_role) from public, anon;
grant execute on function public.set_user_role(uuid, public.user_role) to authenticated;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles        enable row level security;
alter table public.timesheet_weeks enable row level security;
alter table public.timesheet_rows  enable row level security;
alter table public.requests        enable row level security;
alter table public.work_logs       enable row level security;

-- ---------- profiles ------------------------------------------------
-- No insert policy (the trigger creates rows) and no delete policy.
create policy "profiles: read own or admin" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());

create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Users may only edit their name; role changes go through set_user_role().
revoke update on public.profiles from authenticated, anon;
grant  update (full_name) on public.profiles to authenticated;

-- ---------- timesheet_weeks -----------------------------------------
create policy "weeks: read own or admin" on public.timesheet_weeks
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

create policy "weeks: insert own draft" on public.timesheet_weeks
  for insert to authenticated with check (user_id = auth.uid() and status = 'draft');

-- Owner can edit only while draft/sent back, and can only move it to draft/submitted
-- (never approve their own week). Submitted/approved weeks are therefore locked.
create policy "weeks: owner update while open" on public.timesheet_weeks
  for update to authenticated
  using      (user_id = auth.uid() and status in ('draft', 'sent_back'))
  with check (user_id = auth.uid() and status in ('draft', 'submitted'));

create policy "weeks: admin update" on public.timesheet_weeks
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- timesheet_rows ------------------------------------------
create policy "rows: read own or admin" on public.timesheet_rows
  for select to authenticated using (
    public.is_admin()
    or exists (select 1 from public.timesheet_weeks w
               where w.id = week_id and w.user_id = auth.uid())
  );

create policy "rows: insert while week open" on public.timesheet_rows
  for insert to authenticated with check (public.week_is_open(week_id));

create policy "rows: update while week open" on public.timesheet_rows
  for update to authenticated
  using (public.week_is_open(week_id)) with check (public.week_is_open(week_id));

create policy "rows: delete while week open" on public.timesheet_rows
  for delete to authenticated using (public.week_is_open(week_id));

-- ---------- requests ------------------------------------------------
create policy "requests: read own or admin" on public.requests
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

create policy "requests: insert own pending" on public.requests
  for insert to authenticated with check (user_id = auth.uid() and status = 'pending');

-- Employees can only cancel their own pending request.
create policy "requests: owner cancel pending" on public.requests
  for update to authenticated
  using      (user_id = auth.uid() and status = 'pending')
  with check (user_id = auth.uid() and status = 'cancelled');

create policy "requests: admin update" on public.requests
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- work_logs -----------------------------------------------
create policy "logs: read own or admin" on public.work_logs
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

create policy "logs: insert own for today" on public.work_logs
  for insert to authenticated
  with check (user_id = auth.uid() and log_date = public.portal_today());

-- Delete is allowed for today's entries only.
create policy "logs: delete own today" on public.work_logs
  for delete to authenticated
  using (user_id = auth.uid() and log_date = public.portal_today());
