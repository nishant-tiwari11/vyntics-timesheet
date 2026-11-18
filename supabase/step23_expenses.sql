-- Step 23: expense claims that are reimbursed through payroll (run once, after step21_payroll_runs.sql).
--
-- FLOW   draft -> pending -> approved -> added_to_payroll -> reimbursed          (or pending -> rejected)
--   * An employee saves a DRAFT, then submits it (PENDING).
--   * An admin APPROVES it with the amount to pay (never more than claimed, never more than the category limit) and
--     the payroll month it should go in. If that month already has an open (draft or reviewed) payroll run the claim is
--     linked to it straight away (ADDED_TO_PAYROLL); otherwise it stays APPROVED until that run is created.
--   * FINALIZING the run marks every linked claim REIMBURSED, with the pay month and the date. Marking the run paid
--     stamps the payment date. Reopening a run puts its claims back to ADDED_TO_PAYROLL.
--   * Before the run is finalized an admin can take a claim out of it: it goes back to APPROVED for the NEXT month.
--
-- SAFETY
--   * A claim has one payroll_run_id, so it can be in only one run. It can never be linked to a finalized or paid run.
--   * Only the approved amount reaches salary. Category limits are checked in the database, not just in the page.
--   * Employees see only their own claims. Only the functions below can approve, reject, link or reimburse.
--   * Every change is written to expense_events by a trigger: who, what, when, and which payroll month.

-- ---------- Tables ----------
create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  -- The most that can be approved for ONE claim in this category (null = no limit).
  limit_paise bigint check (limit_paise is null or (limit_paise > 0 and limit_paise < 1000000000000)),
  -- Taxable categories are paid as part of taxable earnings. The default (false) keeps them out of tax, PF and ESI.
  taxable boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists expense_categories_name_key on public.expense_categories (lower(btrim(name)));

insert into public.expense_categories (name)
select n from (values ('Travel'), ('Meals'), ('Internet & phone'), ('Software & subscriptions'), ('Equipment'), ('Other')) as v (n)
where not exists (select 1 from public.expense_categories);

create table if not exists public.expense_claims (
  id uuid primary key default gen_random_uuid(),
  claim_no bigint generated always as identity,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  category_id uuid not null references public.expense_categories (id) on delete restrict,
  expense_date date not null,
  description text not null check (char_length(btrim(description)) between 1 and 300),
  claimed_paise bigint not null check (claimed_paise > 0 and claimed_paise < 1000000000000),
  approved_paise bigint check (approved_paise is null or (approved_paise > 0 and approved_paise < 1000000000000)),
  status text not null default 'draft'
    check (status in ('draft', 'pending', 'approved', 'added_to_payroll', 'reimbursed', 'rejected')),
  -- The pay month ("2026-11") it is meant to be paid with, set when approved.
  payroll_month text check (payroll_month is null or payroll_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  -- The ONE run it is in. Set only while added_to_payroll or reimbursed.
  payroll_run_id uuid references public.payroll_runs (id) on delete set null,
  -- Whether it was taxable when approved (copied from the category, so a later change can't alter a past claim).
  taxable boolean not null default false,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 300),
  reimbursed_on date,
  reimbursed_month text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expense_claims_run_only_when_linked check (
    (status in ('added_to_payroll', 'reimbursed')) = (payroll_run_id is not null)
  ),
  constraint expense_claims_approved_not_over_claimed check (approved_paise is null or approved_paise <= claimed_paise)
);
create index if not exists expense_claims_user_idx on public.expense_claims (user_id, expense_date desc);
create index if not exists expense_claims_run_idx on public.expense_claims (payroll_run_id) where payroll_run_id is not null;
create index if not exists expense_claims_status_idx on public.expense_claims (status, payroll_month);

-- The audit trail: one row per change, written only by the trigger below. No foreign key on claim_id so a deleted
-- draft keeps its history.
create table if not exists public.expense_events (
  id bigint generated always as identity primary key,
  claim_id uuid not null,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists expense_events_claim_idx on public.expense_events (claim_id, created_at);

-- ---------- Row level security ----------
alter table public.expense_categories enable row level security;
alter table public.expense_claims enable row level security;
alter table public.expense_events enable row level security;

drop policy if exists "expense categories: read" on public.expense_categories;
create policy "expense categories: read" on public.expense_categories for select to authenticated using (true);
drop policy if exists "expense categories: admin write" on public.expense_categories;
create policy "expense categories: admin write" on public.expense_categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "expense claims: own or admin read" on public.expense_claims;
create policy "expense claims: own or admin read" on public.expense_claims for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- An employee can start a claim as a draft or already submitted, and nothing else about it.
drop policy if exists "expense claims: own add" on public.expense_claims;
create policy "expense claims: own add" on public.expense_claims for insert to authenticated
  with check (
    user_id = auth.uid() and status in ('draft', 'pending')
    and approved_paise is null and payroll_month is null and payroll_run_id is null
    and decided_by is null and decided_at is null and reimbursed_on is null and taxable = false
  );

-- ...change it while it is still a draft (and submit it)...
drop policy if exists "expense claims: own edit draft" on public.expense_claims;
create policy "expense claims: own edit draft" on public.expense_claims for update to authenticated
  using (user_id = auth.uid() and status = 'draft')
  with check (
    user_id = auth.uid() and status in ('draft', 'pending')
    and approved_paise is null and payroll_month is null and payroll_run_id is null
    and decided_by is null and decided_at is null and reimbursed_on is null and taxable = false
  );

-- ...and throw a draft away.
drop policy if exists "expense claims: own delete draft" on public.expense_claims;
create policy "expense claims: own delete draft" on public.expense_claims for delete to authenticated
  using (user_id = auth.uid() and status = 'draft');
-- Admins have no direct write policy: they go through expense_approve / expense_reject / expense_remove_from_run.

drop policy if exists "expense events: own or admin read" on public.expense_events;
create policy "expense events: own or admin read" on public.expense_events for select to authenticated
  using (public.is_admin() or exists (select 1 from public.expense_claims c where c.id = claim_id and c.user_id = auth.uid()));

-- ---------- The audit trigger ----------
create or replace function public.expense_claims_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  act text;
  info text;
begin
  if tg_op = 'DELETE' then
    insert into public.expense_events (claim_id, actor_id, action, detail) values (old.id, auth.uid(), 'deleted', 'Deleted a ' || old.status || ' claim');
    return old;
  end if;
  if tg_op = 'INSERT' then
    insert into public.expense_events (claim_id, actor_id, action, detail)
    values (new.id, auth.uid(), case when new.status = 'pending' then 'submitted' else 'created' end, 'Claimed ' || new.claimed_paise || ' paise');
    return new;
  end if;

  new.updated_at := now();
  if new.status is distinct from old.status then
    act := case
      when new.status = 'pending' then 'submitted'
      when new.status = 'rejected' then 'rejected'
      when new.status = 'reimbursed' then 'reimbursed'
      when old.status = 'pending' and new.status in ('approved', 'added_to_payroll') then 'approved'
      when new.status = 'added_to_payroll' and old.status = 'reimbursed' then 'reopened'
      when new.status = 'added_to_payroll' then 'added_to_payroll'
      when new.status = 'approved' and old.status = 'added_to_payroll' then 'removed_from_payroll'
      when new.status = 'approved' then 'approved'
      else new.status end;
    info := old.status || ' -> ' || new.status
      || coalesce(', approved ' || new.approved_paise || ' paise', '')
      || coalesce(', payroll month ' || new.payroll_month, '')
      || coalesce(', note: ' || new.decision_note, '');
  elsif new.reimbursed_on is distinct from old.reimbursed_on and new.status = 'reimbursed' then
    act := 'paid';
    info := 'Payment date ' || coalesce(new.reimbursed_on::text, 'none') || ', payroll month ' || coalesce(new.reimbursed_month, new.payroll_month, 'none');
  elsif new.payroll_month is distinct from old.payroll_month or new.approved_paise is distinct from old.approved_paise then
    act := 'changed';
    info := 'Payroll month ' || coalesce(old.payroll_month, 'none') || ' -> ' || coalesce(new.payroll_month, 'none');
  else
    act := 'edited';
    info := 'Details changed';
  end if;
  insert into public.expense_events (claim_id, actor_id, action, detail) values (new.id, auth.uid(), act, left(info, 300));
  return new;
end $$;

drop trigger if exists expense_claims_audit_ins on public.expense_claims;
create trigger expense_claims_audit_ins after insert or delete on public.expense_claims
  for each row execute function public.expense_claims_audit();
drop trigger if exists expense_claims_audit_upd on public.expense_claims;
create trigger expense_claims_audit_upd before update on public.expense_claims
  for each row execute function public.expense_claims_audit();

-- A claim's date can't be in the future, and a claim can't move on from a finalized run by any other route.
create or replace function public.expense_claims_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.expense_date is distinct from old.expense_date then
    if new.expense_date > public.portal_today() then raise exception 'The expense date can''t be in the future.'; end if;
  end if;
  if tg_op = 'UPDATE' and old.status = 'reimbursed' and new.status = 'reimbursed' then
    if new.approved_paise is distinct from old.approved_paise or new.payroll_run_id is distinct from old.payroll_run_id
       or new.claimed_paise is distinct from old.claimed_paise or new.description is distinct from old.description then
      raise exception 'This expense has been reimbursed, so it is locked.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists expense_claims_guard on public.expense_claims;
create trigger expense_claims_guard before insert or update on public.expense_claims
  for each row execute function public.expense_claims_guard();

-- ---------- Helpers ----------
-- The run (if any) for a pay month "YYYY-MM". A pay month is named after the month it ENDS in.
create or replace function public.expense_run_for_month(p_month text) returns public.payroll_runs
language sql stable security definer set search_path = public as $$
  select * from public.payroll_runs where to_char(period_end, 'YYYY-MM') = p_month limit 1
$$;

-- Changing what is in a reviewed run sends it back to draft, so a changed figure is never signed off by mistake.
create or replace function public.expense_touch_run(p_run uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.payroll_runs set status = 'draft', reviewed_by = null, reviewed_at = null where id = p_run and status = 'reviewed';
end $$;

-- Link every approved claim waiting for this run's month to the run (used when a run is created or a claim is moved).
create or replace function public.expense_sync_run(p_run uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  r public.payroll_runs;
  n integer;
begin
  if not public.is_admin() then raise exception 'Only an admin can do that.'; end if;
  select * into r from public.payroll_runs where id = p_run for update;
  if r.id is null or r.status not in ('draft', 'reviewed') then return 0; end if;
  update public.expense_claims
    set status = 'added_to_payroll', payroll_run_id = p_run
    where status = 'approved' and payroll_run_id is null and payroll_month = to_char(r.period_end, 'YYYY-MM');
  get diagnostics n = row_count;
  if n > 0 then perform public.expense_touch_run(p_run); end if;
  return n;
end $$;

-- ---------- Admin decisions ----------
create or replace function public.expense_approve(p_claim uuid, p_amount bigint, p_month text, p_note text) returns text
language plpgsql security definer set search_path = public as $$
declare
  c public.expense_claims;
  cat public.expense_categories;
  r public.payroll_runs;
  note text := nullif(left(btrim(coalesce(p_note, '')), 300), '');
begin
  if not public.is_admin() then raise exception 'Only an admin can do that.'; end if;
  select * into c from public.expense_claims where id = p_claim for update;
  if c.id is null then raise exception 'That expense no longer exists.'; end if;
  if c.status <> 'pending' then raise exception 'Only a pending claim can be approved.'; end if;
  if p_month is null or p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Choose the payroll month.'; end if;

  select * into cat from public.expense_categories where id = c.category_id;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter the amount to approve.'; end if;
  if p_amount > c.claimed_paise then raise exception 'You can''t approve more than was claimed.'; end if;
  if cat.limit_paise is not null and p_amount > cat.limit_paise then
    raise exception 'The limit for % is % per claim. Approve that or less.', cat.name, to_char(cat.limit_paise / 100.0, 'FM999999999990.00');
  end if;

  r := public.expense_run_for_month(p_month);
  if r.id is not null and r.status in ('finalized', 'paid') then
    raise exception 'The payroll for that month is already finalized. Choose a later month.';
  end if;

  update public.expense_claims
    set approved_paise = p_amount, payroll_month = p_month, taxable = cat.taxable,
        decided_by = auth.uid(), decided_at = now(), decision_note = note,
        status = case when r.id is not null then 'added_to_payroll' else 'approved' end,
        payroll_run_id = r.id
    where id = p_claim;
  if r.id is not null then perform public.expense_touch_run(r.id); end if;
  return case when r.id is not null then 'added_to_payroll' else 'approved' end;
end $$;

create or replace function public.expense_reject(p_claim uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.expense_claims;
  note text := nullif(left(btrim(coalesce(p_note, '')), 300), '');
begin
  if not public.is_admin() then raise exception 'Only an admin can do that.'; end if;
  select * into c from public.expense_claims where id = p_claim for update;
  if c.id is null then raise exception 'That expense no longer exists.'; end if;
  if c.status <> 'pending' then raise exception 'Only a pending claim can be rejected.'; end if;
  update public.expense_claims
    set status = 'rejected', approved_paise = null, payroll_month = null, decided_by = auth.uid(), decided_at = now(), decision_note = note
    where id = p_claim;
end $$;

-- Take a claim out of a run that is not finalized yet. It goes back to approved, for the NEXT month's run.
create or replace function public.expense_remove_from_run(p_claim uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.expense_claims;
  r public.payroll_runs;
  nxt text;
  nr public.payroll_runs;
begin
  if not public.is_admin() then raise exception 'Only an admin can do that.'; end if;
  select * into c from public.expense_claims where id = p_claim for update;
  if c.id is null then raise exception 'That expense no longer exists.'; end if;
  if c.status = 'reimbursed' then raise exception 'This expense has been reimbursed, so it is locked.'; end if;
  if c.status <> 'added_to_payroll' then raise exception 'This expense is not in a payroll run.'; end if;
  select * into r from public.payroll_runs where id = c.payroll_run_id for update;
  if r.id is not null and r.status not in ('draft', 'reviewed') then
    raise exception 'That payroll month is finalized, so its expenses are locked. Reopen the run first.';
  end if;
  nxt := to_char((to_date(coalesce(c.payroll_month, to_char(r.period_end, 'YYYY-MM')) || '-01', 'YYYY-MM-DD') + interval '1 month')::date, 'YYYY-MM');
  update public.expense_claims set status = 'approved', payroll_run_id = null, payroll_month = nxt where id = p_claim;
  if r.id is not null then perform public.expense_touch_run(r.id); end if;
  nr := public.expense_run_for_month(nxt);
  if nr.id is not null and nr.status in ('draft', 'reviewed') then perform public.expense_sync_run(nr.id); end if;
end $$;

-- ---------- Payroll workflow: finalize, pay and reopen now look after the linked claims ----------
-- (These replace the step 21 versions; everything they did before is kept.)
create or replace function public.payroll_finalize_run(p_run uuid, p_payslips jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare
  r public.payroll_runs;
  item jsonb;
  n integer := 0;
  left_over integer;
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

  -- The claims that are in the stored payslips become reimbursed, with this pay month and today's date.
  update public.expense_claims
    set status = 'reimbursed', reimbursed_on = public.portal_today(), reimbursed_month = to_char(r.period_end, 'YYYY-MM')
    where payroll_run_id = p_run and status = 'added_to_payroll'
      and id in (
        select (e ->> 'claimId')::uuid
        from jsonb_array_elements(p_payslips) it, jsonb_array_elements(coalesce(it -> 'snapshot' -> 'payslip' -> 'expenses', '[]'::jsonb)) e
      );

  -- A claim added to the run while this was being finalized would be missing from the payslips: stop, so nothing is lost.
  select count(*) into left_over from public.expense_claims where payroll_run_id = p_run and status = 'added_to_payroll';
  if left_over > 0 then
    raise exception 'An expense was added to this run while finalizing. Open the run, check it, and finalize again.';
  end if;

  update public.payroll_runs set status = 'finalized', finalized_by = auth.uid(), finalized_at = now(), paid_on = null where id = p_run;
  perform public.payroll_audit_write('run_finalized', 'payroll_run', p_run::text, n || ' payslips stored');
  return n;
end $$;

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
  update public.expense_claims set reimbursed_on = p_paid_on where payroll_run_id = p_run and status = 'reimbursed';
  perform public.payroll_audit_write('run_paid', 'payroll_run', p_run::text, 'Marked as paid on ' || p_paid_on);
end $$;

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
  update public.expense_claims
    set status = 'added_to_payroll', reimbursed_on = null, reimbursed_month = null
    where payroll_run_id = p_run and status = 'reimbursed';
  update public.payroll_runs
    set status = 'reviewed', finalized_by = null, finalized_at = null, paid_on = null, reopen_count = reopen_count + 1
    where id = p_run;
  perform public.payroll_audit_write('run_reopened', 'payroll_run', p_run::text, 'Reopened: ' || why);
end $$;

-- Deleting a draft run frees its claims for the next run instead of leaving them pointing at nothing.
create or replace function public.payroll_runs_release_expenses() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.expense_claims set status = 'approved', payroll_run_id = null where payroll_run_id = old.id and status = 'added_to_payroll';
  return old;
end $$;
drop trigger if exists payroll_runs_release_expenses on public.payroll_runs;
create trigger payroll_runs_release_expenses before delete on public.payroll_runs
  for each row execute function public.payroll_runs_release_expenses();

revoke all on function public.expense_run_for_month(text) from public, anon, authenticated;
revoke all on function public.expense_touch_run(uuid) from public, anon, authenticated;
revoke all on function public.expense_sync_run(uuid) from public, anon;
revoke all on function public.expense_approve(uuid, bigint, text, text) from public, anon;
revoke all on function public.expense_reject(uuid, text) from public, anon;
revoke all on function public.expense_remove_from_run(uuid) from public, anon;
grant execute on function public.expense_sync_run(uuid) to authenticated;
grant execute on function public.expense_approve(uuid, bigint, text, text) to authenticated;
grant execute on function public.expense_reject(uuid, text) to authenticated;
grant execute on function public.expense_remove_from_run(uuid) to authenticated;
