-- Step 20: payroll, milestone 1 (run once in the Supabase SQL editor).
-- Salary structures with history, payroll settings, configurable pay components, employee details and an audit log.
-- Payroll runs, payslips and reports are added in the next steps.
--
-- PRIVACY: every table here is readable and writable by ADMINS ONLY (row level security). Employees get no access to
-- salary data. Money is stored as whole PAISE (1 rupee = 100 paise) in integer columns, never as decimals or floats,
-- and percentages as BASIS POINTS (1% = 100), so no rounding error can creep in.
--
-- NOTHING STATUTORY IS HARD-CODED. PF, ESI, professional tax and TDS are created switched OFF with zero values.
-- Every rate and slab must be entered by your admins and verified by an accountant before payroll is used.

-- ---------- Employee details: joining date, leaving date, department ----------
create table if not exists public.employee_details (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  joined_on date not null,
  left_on date,
  department text check (department is null or char_length(btrim(department)) between 1 and 80),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint employee_details_dates_ok check (left_on is null or left_on >= joined_on)
);

-- Existing people start with the day their account was created as the joining date. Admins correct it in the portal.
insert into public.employee_details (user_id, joined_on)
select id, created_at::date from public.profiles
on conflict (user_id) do nothing;

-- ---------- Salary structures: one row per change, never overwritten ----------
create table if not exists public.salary_structures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  effective_from date not null,
  basic_paise bigint not null check (basic_paise >= 0 and basic_paise < 1000000000000),
  hra_paise bigint not null default 0 check (hra_paise >= 0 and hra_paise < 1000000000000),
  allowances_paise bigint not null default 0 check (allowances_paise >= 0 and allowances_paise < 1000000000000),
  deductions_paise bigint not null default 0 check (deductions_paise >= 0 and deductions_paise < 1000000000000),
  note text check (note is null or char_length(note) <= 300),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint salary_structures_one_per_date unique (user_id, effective_from)
);
create index if not exists salary_structures_user_idx on public.salary_structures (user_id, effective_from desc);

-- ---------- Settings (one row) ----------
create table if not exists public.payroll_settings (
  id boolean primary key default true check (id),
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  -- The pay month runs from this day to the day before it in the next month (1 = the calendar month).
  cycle_start_day integer not null default 1 check (cycle_start_day between 1 and 28),
  -- What a day's pay is worth: salary / every day of the month, or salary / working days only.
  pay_basis text not null default 'calendar_days' check (pay_basis in ('calendar_days', 'working_days')),
  -- Weekly off days as ISO weekdays (1 = Monday ... 7 = Sunday).
  weekly_off_days integer[] not null default '{6,7}' check (weekly_off_days <@ array[1, 2, 3, 4, 5, 6, 7]),
  -- Work on a holiday or week off: earn comp-off, or be paid. Never both for the same day.
  holiday_work_mode text not null default 'comp_off' check (holiday_work_mode in ('comp_off', 'pay')),
  overtime_enabled boolean not null default false,
  overtime_rate_bp integer not null default 15000 check (overtime_rate_bp between 10000 and 50000),
  holiday_work_rate_bp integer not null default 20000 check (holiday_work_rate_bp between 10000 and 50000),
  standard_hours_per_day numeric(4, 2) not null default 8 check (standard_hours_per_day > 0 and standard_hours_per_day <= 24),
  overtime_base text not null default 'basic' check (overtime_base in ('basic', 'gross')),
  -- Approved leave days per pay month that are paid; the rest are loss of pay. 0 until your policy is entered.
  paid_leave_per_month integer not null default 0 check (paid_leave_per_month between 0 and 31),
  round_net_to_rupee boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.payroll_settings (id) values (true) on conflict (id) do nothing;

-- ---------- Components: PF, ESI, professional tax, TDS and anything custom ----------
create table if not exists public.payroll_components (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]{2,30}$'),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  kind text not null check (kind in ('earning', 'deduction')),
  calc text not null check (calc in ('fixed', 'percent')),
  amount_paise bigint not null default 0 check (amount_paise >= 0 and amount_paise < 1000000000000),
  percent_bp integer not null default 0 check (percent_bp between 0 and 10000),
  percent_of text not null default 'basic' check (percent_of in ('basic', 'gross')),
  enabled boolean not null default false,
  statutory boolean not null default false,
  sort_order integer not null default 100,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  -- An earning can only be a percentage of basic (a percentage of gross would depend on itself).
  constraint payroll_components_earning_basis check (kind <> 'earning' or percent_of = 'basic')
);

insert into public.payroll_components (code, name, kind, calc, percent_of, enabled, statutory, sort_order) values
  ('pf', 'Provident fund', 'deduction', 'percent', 'basic', false, true, 10),
  ('esi', 'ESI', 'deduction', 'percent', 'gross', false, true, 20),
  ('professional_tax', 'Professional tax', 'deduction', 'fixed', 'basic', false, true, 30),
  ('tds', 'TDS', 'deduction', 'fixed', 'basic', false, true, 40)
on conflict (code) do nothing;

-- ---------- Audit log: who viewed, changed or finalised what, and when ----------
-- The detail text never contains salary figures.
create table if not exists public.payroll_audit (
  id bigint generated always as identity primary key,
  actor_id uuid default auth.uid() references public.profiles (id) on delete set null,
  action text not null check (char_length(action) between 1 and 60),
  entity text not null check (char_length(entity) between 1 and 60),
  entity_id text,
  detail text check (detail is null or char_length(detail) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists payroll_audit_time_idx on public.payroll_audit (created_at desc);

-- ---------- Row level security: admins only ----------
alter table public.employee_details enable row level security;
alter table public.salary_structures enable row level security;
alter table public.payroll_settings enable row level security;
alter table public.payroll_components enable row level security;
alter table public.payroll_audit enable row level security;

drop policy if exists "details: admin read" on public.employee_details;
create policy "details: admin read" on public.employee_details for select to authenticated using (public.is_admin());
drop policy if exists "details: admin add" on public.employee_details;
create policy "details: admin add" on public.employee_details for insert to authenticated with check (public.is_admin());
drop policy if exists "details: admin change" on public.employee_details;
create policy "details: admin change" on public.employee_details for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "structures: admin read" on public.salary_structures;
create policy "structures: admin read" on public.salary_structures for select to authenticated using (public.is_admin());
drop policy if exists "structures: admin add" on public.salary_structures;
create policy "structures: admin add" on public.salary_structures for insert to authenticated with check (public.is_admin());
-- No update or delete policy on purpose: history is never overwritten.

drop policy if exists "payroll settings: admin read" on public.payroll_settings;
create policy "payroll settings: admin read" on public.payroll_settings for select to authenticated using (public.is_admin());
drop policy if exists "payroll settings: admin change" on public.payroll_settings;
create policy "payroll settings: admin change" on public.payroll_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "components: admin read" on public.payroll_components;
create policy "components: admin read" on public.payroll_components for select to authenticated using (public.is_admin());
drop policy if exists "components: admin add" on public.payroll_components;
create policy "components: admin add" on public.payroll_components for insert to authenticated with check (public.is_admin());
drop policy if exists "components: admin change" on public.payroll_components;
create policy "components: admin change" on public.payroll_components for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "components: admin delete custom" on public.payroll_components;
create policy "components: admin delete custom" on public.payroll_components for delete to authenticated using (public.is_admin() and not statutory);

drop policy if exists "audit: admin read" on public.payroll_audit;
create policy "audit: admin read" on public.payroll_audit for select to authenticated using (public.is_admin());
drop policy if exists "audit: admin write" on public.payroll_audit;
create policy "audit: admin write" on public.payroll_audit for insert to authenticated with check (public.is_admin() and actor_id = auth.uid());

-- ---------- History can't be rewritten (even by an admin through the API) ----------
create or replace function public.payroll_history_locked() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null then
    raise exception 'This record is part of the payroll history and can''t be changed or deleted. Add a new one instead.';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists salary_structures_locked on public.salary_structures;
create trigger salary_structures_locked before update or delete on public.salary_structures
  for each row execute function public.payroll_history_locked();

drop trigger if exists payroll_audit_locked on public.payroll_audit;
create trigger payroll_audit_locked before update or delete on public.payroll_audit
  for each row execute function public.payroll_history_locked();

-- ---------- Keep updated_at honest ----------
create or replace function public.payroll_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists employee_details_touch on public.employee_details;
create trigger employee_details_touch before update on public.employee_details for each row execute function public.payroll_touch();
drop trigger if exists payroll_settings_touch on public.payroll_settings;
create trigger payroll_settings_touch before update on public.payroll_settings for each row execute function public.payroll_touch();
drop trigger if exists payroll_components_touch on public.payroll_components;
create trigger payroll_components_touch before update on public.payroll_components for each row execute function public.payroll_touch();
