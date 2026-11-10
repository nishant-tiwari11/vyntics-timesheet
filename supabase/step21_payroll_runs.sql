-- Step 21: payroll runs, payslips and payslip queries (run once, after step20_payroll.sql).
--
-- A payroll RUN is one pay month. It moves Draft -> Reviewed -> Finalized -> Paid. While it is Draft or Reviewed, the
-- numbers are worked out live from approved data and can be adjusted. FINALIZING stores a PAYSLIP SNAPSHOT for every
-- employee: the full calculation, the settings and the structure that were used. From then on the data is locked, and
-- later changes to settings or salary structures never alter a past payslip.
-- Changing a finalized run needs REOPEN with a written reason. Reopening keeps the old payslips as superseded history and
-- writes an audit entry; finalizing again stores new snapshots.
--
-- PRIVACY
--   * Runs, adjustments and every employee's payslips: admins only.
--   * An employee can read only THEIR OWN payslips, and only live ones (finalized or paid, never a draft or preview).
--   * Employees can never change a payslip. Only the functions below can write one, and they check for an admin.
--   * An employee can see their own salary structure only while the admin setting "show to employees" is on.

alter table public.payroll_settings add column if not exists show_structure_to_employees boolean not null default false;

-- ---------- Tables ----------
create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  period_start date not null unique,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft', 'reviewed', 'finalized', 'paid')),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  finalized_by uuid references public.profiles (id) on delete set null,
  finalized_at timestamptz,
  paid_on date,
  reopen_count integer not null default 0,
  constraint payroll_runs_dates_ok check (period_end >= period_start)
);

-- Per employee, per run: extra loss-of-pay days an admin adds (for example an unreported absence).
create table if not exists public.payroll_run_inputs (
  run_id uuid not null references public.payroll_runs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  manual_lop_days integer not null default 0 check (manual_lop_days between 0 and 31),
  note text check (note is null or char_length(note) <= 200),
  primary key (run_id, user_id)
);

-- One-off bonuses, arrears, reimbursements and deductions.
create table if not exists public.payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.payroll_runs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('bonus', 'arrears', 'reimbursement', 'deduction')),
  label text not null check (char_length(btrim(label)) between 1 and 80),
  amount_paise bigint not null check (amount_paise > 0 and amount_paise < 1000000000000),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists payroll_adjustments_run_idx on public.payroll_adjustments (run_id, user_id);

-- The stored payslip. Written only by payroll_finalize_run().
create table if not exists public.payslips (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.payroll_runs (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status text not null default 'finalized' check (status in ('finalized', 'paid')),
  paid_on date,
  gross_paise bigint not null,
  deductions_paise bigint not null,
  net_paise bigint not null,
  payable_days integer not null,
  lop_days integer not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  snapshot jsonb not null,
  superseded_at timestamptz,
  created_at timestamptz not null default now()
);
-- One live payslip per person per month. A reopened run keeps the old ones as superseded history.
create unique index if not exists payslips_one_live on public.payslips (user_id, period_start) where superseded_at is null;
create index if not exists payslips_user_idx on public.payslips (user_id, period_start desc);

create table if not exists public.payroll_queries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  payslip_id uuid not null references public.payslips (id) on delete cascade,
  topic text not null check (char_length(btrim(topic)) between 1 and 80),
  message text not null check (char_length(btrim(message)) between 1 and 1000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  admin_reply text check (admin_reply is null or char_length(admin_reply) <= 1000),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists payroll_queries_user_idx on public.payroll_queries (user_id, created_at desc);

-- ---------- Helpers (run as the owner so policies can use them safely) ----------
create or replace function public.payroll_run_open(p_run uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.payroll_runs where id = p_run and status in ('draft', 'reviewed'))
$$;

create or replace function public.payroll_structure_visible() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select show_structure_to_employees from public.payroll_settings where id), false)
$$;

-- ---------- Row level security ----------
alter table public.payroll_runs enable row level security;
alter table public.payroll_run_inputs enable row level security;
alter table public.payroll_adjustments enable row level security;
alter table public.payslips enable row level security;
alter table public.payroll_queries enable row level security;

drop policy if exists "runs: admin read" on public.payroll_runs;
create policy "runs: admin read" on public.payroll_runs for select to authenticated using (public.is_admin());
drop policy if exists "runs: admin add" on public.payroll_runs;
create policy "runs: admin add" on public.payroll_runs for insert to authenticated with check (public.is_admin() and status = 'draft');
drop policy if exists "runs: admin delete draft" on public.payroll_runs;
create policy "runs: admin delete draft" on public.payroll_runs for delete to authenticated using (public.is_admin() and status = 'draft');
-- Status changes only through the functions below.

drop policy if exists "inputs: admin read" on public.payroll_run_inputs;
create policy "inputs: admin read" on public.payroll_run_inputs for select to authenticated using (public.is_admin());
drop policy if exists "inputs: admin write while open" on public.payroll_run_inputs;
create policy "inputs: admin write while open" on public.payroll_run_inputs for all to authenticated
  using (public.is_admin() and public.payroll_run_open(run_id))
  with check (public.is_admin() and public.payroll_run_open(run_id));

drop policy if exists "adjustments: admin read" on public.payroll_adjustments;
create policy "adjustments: admin read" on public.payroll_adjustments for select to authenticated using (public.is_admin());
drop policy if exists "adjustments: admin write while open" on public.payroll_adjustments;
create policy "adjustments: admin write while open" on public.payroll_adjustments for all to authenticated
  using (public.is_admin() and public.payroll_run_open(run_id))
  with check (public.is_admin() and public.payroll_run_open(run_id));

drop policy if exists "payslips: admin read" on public.payslips;
create policy "payslips: admin read" on public.payslips for select to authenticated using (public.is_admin());
drop policy if exists "payslips: own live" on public.payslips;
create policy "payslips: own live" on public.payslips for select to authenticated
  using (user_id = auth.uid() and superseded_at is null);
-- No insert, update or delete policy: payslips can't be written from the app, only by payroll_finalize_run().

drop policy if exists "queries: own read" on public.payroll_queries;
create policy "queries: own read" on public.payroll_queries for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "queries: own ask" on public.payroll_queries;
create policy "queries: own ask" on public.payroll_queries for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.payslips p where p.id = payslip_id and p.user_id = auth.uid() and p.superseded_at is null)
  );
drop policy if exists "queries: admin answer" on public.payroll_queries;
create policy "queries: admin answer" on public.payroll_queries for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- An employee may read their OWN salary structure only while the admin setting is on.
drop policy if exists "structures: own when shared" on public.salary_structures;
create policy "structures: own when shared" on public.salary_structures for select to authenticated
  using (user_id = auth.uid() and public.payroll_structure_visible());

-- ---------- Queries: what may change ----------
create or replace function public.payroll_query_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.status := 'open';
    new.admin_reply := null;
    new.resolved_by := null;
    new.resolved_at := null;
  elsif auth.uid() is not null then
    if new.user_id is distinct from old.user_id or new.payslip_id is distinct from old.payslip_id
       or new.topic is distinct from old.topic or new.message is distinct from old.message
       or new.created_at is distinct from old.created_at then
      raise exception 'A query can''t be edited. Raise a new one.';
    end if;
    if new.status = 'resolved' and old.status <> 'resolved' then
      new.resolved_by := auth.uid();
      new.resolved_at := now();
    elsif new.status = 'open' then
      new.resolved_by := null;
      new.resolved_at := null;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists payroll_query_guard on public.payroll_queries;
create trigger payroll_query_guard before insert or update on public.payroll_queries
  for each row execute function public.payroll_query_guard();

-- ---------- The workflow, as functions that check for an admin ----------
create or replace function public.payroll_audit_write(p_action text, p_entity text, p_entity_id text, p_detail text) returns void
language sql security definer set search_path = public as $$
  insert into public.payroll_audit (actor_id, action, entity, entity_id, detail)
  values (auth.uid(), p_action, p_entity, p_entity_id, left(p_detail, 300))
$$;

-- Draft <-> Reviewed.
create or replace function public.payroll_review_run(p_run uuid, p_reviewed boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.payroll_runs;
begin
  if not public.is_admin() then raise exception 'Only an admin can do that.'; end if;
  select * into r from public.payroll_runs where id = p_run for update;
  if r.id is null then raise exception 'That payroll run no longer exists.'; end if;
  if p_reviewed then
    if r.status <> 'draft' then raise exception 'Only a draft run can be marked as reviewed.'; end if;
    update public.payroll_runs set status = 'reviewed', reviewed_by = auth.uid(), reviewed_at = now() where id = p_run;
    perform public.payroll_audit_write('run_reviewed', 'payroll_run', p_run::text, 'Marked as reviewed');
  else
    if r.status <> 'reviewed' then raise exception 'Only a reviewed run can go back to draft.'; end if;
    update public.payroll_runs set status = 'draft', reviewed_by = null, reviewed_at = null where id = p_run;
    perform public.payroll_audit_write('run_back_to_draft', 'payroll_run', p_run::text, 'Moved back to draft');
  end if;
end $$;

-- Reviewed -> Finalized, storing a snapshot of every payslip in one step.
create or replace function public.payroll_finalize_run(p_run uuid, p_payslips jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare
  r public.payroll_runs;
  item jsonb;
  n integer := 0;
begin
  if not public.is_admin() then raise exception 'Only an admin can do that.'; end if;
  select * into r from public.payroll_runs where id = p_run for update;
  if r.id is null then raise exception 'That payroll run no longer exists.'; end if;
  if r.status <> 'reviewed' then raise exception 'Mark the run as reviewed before finalizing it.'; end if;
  if jsonb_typeof(p_payslips) <> 'array' or jsonb_array_length(p_payslips) = 0 then
    raise exception 'There are no payslips to finalize.';
  end if;

  for item in select * from jsonb_array_elements(p_payslips) loop
    insert into public.payslips (run_id, user_id, period_start, period_end, gross_paise, deductions_paise, net_paise,
                                 payable_days, lop_days, currency, snapshot)
    values (p_run, (item ->> 'user_id')::uuid, r.period_start, r.period_end,
            (item ->> 'gross')::bigint, (item ->> 'deductions')::bigint, (item ->> 'net')::bigint,
            (item ->> 'payable_days')::integer, (item ->> 'lop_days')::integer, item ->> 'currency', item -> 'snapshot');
    n := n + 1;
  end loop;

  update public.payroll_runs set status = 'finalized', finalized_by = auth.uid(), finalized_at = now(), paid_on = null where id = p_run;
  perform public.payroll_audit_write('run_finalized', 'payroll_run', p_run::text, n || ' payslips stored');
  return n;
end $$;

-- Finalized -> Paid.
create or replace function public.payroll_mark_paid(p_run uuid, p_paid_on date) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.payroll_runs;
begin
  if not public.is_admin() then raise exception 'Only an admin can do that.'; end if;
  select * into r from public.payroll_runs where id = p_run for update;
  if r.id is null then raise exception 'That payroll run no longer exists.'; end if;
  if r.status <> 'finalized' then raise exception 'Only a finalized run can be marked as paid.'; end if;
  if p_paid_on is null or p_paid_on > public.portal_today() then raise exception 'Choose the date the salary was paid (not in the future).'; end if;
  update public.payroll_runs set status = 'paid', paid_on = p_paid_on where id = p_run;
  update public.payslips set status = 'paid', paid_on = p_paid_on where run_id = p_run and superseded_at is null;
  perform public.payroll_audit_write('run_paid', 'payroll_run', p_run::text, 'Marked as paid on ' || p_paid_on);
end $$;

-- Finalized or Paid -> Reviewed, with a written reason. The old payslips stay as superseded history.
create or replace function public.payroll_reopen_run(p_run uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.payroll_runs;
  why text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_admin() then raise exception 'Only an admin can do that.'; end if;
  if char_length(why) < 3 or char_length(why) > 300 then raise exception 'Write a reason for reopening (3 to 300 characters).'; end if;
  select * into r from public.payroll_runs where id = p_run for update;
  if r.id is null then raise exception 'That payroll run no longer exists.'; end if;
  if r.status not in ('finalized', 'paid') then raise exception 'Only a finalized or paid run can be reopened.'; end if;
  update public.payslips set superseded_at = now() where run_id = p_run and superseded_at is null;
  update public.payroll_runs
    set status = 'reviewed', finalized_by = null, finalized_at = null, paid_on = null, reopen_count = reopen_count + 1
    where id = p_run;
  perform public.payroll_audit_write('run_reopened', 'payroll_run', p_run::text, 'Reopened: ' || why);
end $$;

-- An employee's own views and downloads are written to the same audit log.
create or replace function public.payroll_log_self(p_action text, p_payslip uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  if p_action not in ('viewed_payslip', 'downloaded_payslip', 'downloaded_year', 'viewed_my_salary') then
    raise exception 'Unknown action.';
  end if;
  if p_payslip is not null and not exists (select 1 from public.payslips where id = p_payslip and user_id = auth.uid()) then
    raise exception 'Not allowed.';
  end if;
  perform public.payroll_audit_write(p_action, 'payslip', p_payslip::text, 'The employee opened their own payslip data');
end $$;

revoke all on function public.payroll_run_open(uuid) from public, anon;
revoke all on function public.payroll_structure_visible() from public, anon;
revoke all on function public.payroll_audit_write(text, text, text, text) from public, anon, authenticated;
revoke all on function public.payroll_review_run(uuid, boolean) from public, anon;
revoke all on function public.payroll_finalize_run(uuid, jsonb) from public, anon;
revoke all on function public.payroll_mark_paid(uuid, date) from public, anon;
revoke all on function public.payroll_reopen_run(uuid, text) from public, anon;
revoke all on function public.payroll_log_self(text, uuid) from public, anon;
grant execute on function public.payroll_run_open(uuid) to authenticated;
grant execute on function public.payroll_structure_visible() to authenticated;
grant execute on function public.payroll_review_run(uuid, boolean) to authenticated;
grant execute on function public.payroll_finalize_run(uuid, jsonb) to authenticated;
grant execute on function public.payroll_mark_paid(uuid, date) to authenticated;
grant execute on function public.payroll_reopen_run(uuid, text) to authenticated;
grant execute on function public.payroll_log_self(text, uuid) to authenticated;
