-- Step 19: the 7-day time log window, and admins who can fix any time log on any date.
-- Run once in the Supabase SQL editor. It REPLACES step11_edit_logs.sql (if you never ran step 11, this is the one to run;
-- if you did, running this simply swaps its rules for these).
--
-- EMPLOYEES
--   * Add a log for any day from 7 days ago up to today (never the future).
--   * Edit or delete your own log while it is still PENDING and its day is within the last 7 days.
--   * Once an admin approves or rejects a log, or its day is older than 7 days, it is locked.
--   "7 days" means a log for day D can be changed until D + 7.
-- ADMINS
--   * Add, edit and delete ANY employee's time log on ANY past date (never the future), including locked ones.
--   * An entry an admin adds or changes for someone else is approved automatically (the admin is the approver).
--   * An admin still cannot approve or reject their OWN entries; they can edit them, and another admin decides.
-- When auth.uid() is null (you editing by hand in the Table Editor / SQL Editor) the rules are skipped.

-- ---------- Row level security ----------
drop policy if exists "logs: insert own for today" on public.work_logs;
drop policy if exists "logs: insert own up to today" on public.work_logs;
drop policy if exists "logs: insert own within 7 days" on public.work_logs;
create policy "logs: insert own within 7 days" on public.work_logs
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and log_date between public.portal_today() - 7 and public.portal_today()
  );

drop policy if exists "logs: admin adds" on public.work_logs;
create policy "logs: admin adds" on public.work_logs
  for insert to authenticated
  with check (public.is_admin() and log_date <= public.portal_today());

drop policy if exists "logs: delete own today" on public.work_logs;
drop policy if exists "logs: delete own pending" on public.work_logs;
drop policy if exists "logs: delete own pending within 7 days" on public.work_logs;
create policy "logs: delete own pending within 7 days" on public.work_logs
  for delete to authenticated
  using (user_id = auth.uid() and status = 'pending' and log_date >= public.portal_today() - 7);

drop policy if exists "logs: admin deletes" on public.work_logs;
create policy "logs: admin deletes" on public.work_logs
  for delete to authenticated
  using (public.is_admin());

drop policy if exists "logs: update own pending" on public.work_logs;
drop policy if exists "logs: update own pending within 7 days" on public.work_logs;
create policy "logs: update own pending within 7 days" on public.work_logs
  for update to authenticated
  using (user_id = auth.uid() and status = 'pending' and log_date >= public.portal_today() - 7)
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and log_date between public.portal_today() - 7 and public.portal_today()
  );

-- "logs: admin decides" (from step 10) already lets admins update any row. The guard below limits what they can do.

-- ---------- New entries ----------
create or replace function public.guard_log_insert() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null then
    if public.is_admin() and new.user_id <> auth.uid() then
      -- An admin adding an entry for someone else: it is approved on the spot.
      new.status := 'approved';
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    else
      new.status := 'pending';
      new.reviewed_by := null;
      new.reviewed_at := null;
    end if;
  end if;
  return new;
end $$;

-- ---------- Changes ----------
create or replace function public.guard_log_update() returns trigger
language plpgsql as $$
declare
  details_changed boolean;
begin
  if auth.uid() is not null then
    if new.user_id is distinct from old.user_id then
      raise exception 'Entries cannot be edited.';
    end if;

    details_changed :=
      new.log_date is distinct from old.log_date
      or new.content is distinct from old.content
      or new.hours is distinct from old.hours
      or new.start_time is distinct from old.start_time
      or new.end_time is distinct from old.end_time
      or new.project is distinct from old.project;

    if public.is_admin() then
      if old.user_id = auth.uid() then
        -- An admin's own entry: editable any time, but never decided by themselves.
        if new.status is distinct from old.status then
          raise exception 'You cannot decide your own entry.';
        end if;
        new.reviewed_by := old.reviewed_by;
        new.reviewed_at := old.reviewed_at;
      else
        -- Someone else's entry: an admin may change anything. Editing details approves it unless the admin chose a status.
        if details_changed and new.status is not distinct from old.status then
          new.status := 'approved';
        end if;
        if details_changed or new.status is distinct from old.status then
          new.reviewed_by := auth.uid();
          new.reviewed_at := now();
        else
          new.reviewed_by := old.reviewed_by;
          new.reviewed_at := old.reviewed_at;
        end if;
      end if;

    elsif old.user_id = auth.uid() then
      -- Your own entry: details can change while pending, the status never.
      if new.status is distinct from old.status then
        raise exception 'You cannot decide your own entry.';
      end if;
      if old.status <> 'pending' then
        raise exception 'Only a pending entry can be edited.';
      end if;
      new.reviewed_by := old.reviewed_by;
      new.reviewed_at := old.reviewed_at;

    else
      raise exception 'Entries cannot be edited.';
    end if;
  end if;
  return new;
end $$;
