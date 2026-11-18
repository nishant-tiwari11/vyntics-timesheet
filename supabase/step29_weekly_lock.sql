-- STEP 29 – run once in Supabase → SQL Editor. Safe to run again. It REPLACES the 7-day window from step19_timesheet_window.sql.
-- The timesheet now locks every Sunday night.
--
-- EMPLOYEES
--   * The week is Monday to Sunday in office time (public.portal_today(), Asia/Kolkata).
--   * Add a log for any day from this week's Monday up to today (never the future).
--   * Edit or delete your own log while it is still PENDING and its day is in the CURRENT week.
--   * From Monday 00:00 (the moment Sunday night ends) the week that just ended is locked: nothing in it can be added,
--     changed or deleted by an employee. An approved or rejected log is always locked, as before.
-- ADMINS
--   * Unchanged (step 19): they can still add, edit and delete any employee's log on any past date, including locked weeks.
-- When auth.uid() is null (you editing by hand in the Table Editor / SQL Editor) the rules are skipped.
-- date_trunc('week', d) is the Monday of d's week.

-- ---------- Adding ----------
drop policy if exists "logs: insert own within 7 days" on public.work_logs;
drop policy if exists "logs: insert own this week" on public.work_logs;
create policy "logs: insert own this week" on public.work_logs
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and log_date between date_trunc('week', public.portal_today())::date and public.portal_today()
  );

-- ---------- Deleting ----------
drop policy if exists "logs: delete own pending within 7 days" on public.work_logs;
drop policy if exists "logs: delete own pending this week" on public.work_logs;
create policy "logs: delete own pending this week" on public.work_logs
  for delete to authenticated
  using (user_id = auth.uid() and status = 'pending' and log_date >= date_trunc('week', public.portal_today())::date);

-- ---------- Changing ----------
drop policy if exists "logs: update own pending within 7 days" on public.work_logs;
drop policy if exists "logs: update own pending this week" on public.work_logs;
create policy "logs: update own pending this week" on public.work_logs
  for update to authenticated
  using (user_id = auth.uid() and status = 'pending' and log_date >= date_trunc('week', public.portal_today())::date)
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and log_date between date_trunc('week', public.portal_today())::date and public.portal_today()
  );

notify pgrst, 'reload schema';
