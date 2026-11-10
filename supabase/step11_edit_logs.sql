-- STEP 11 – run once in Supabase → SQL Editor, after step10_time_log.sql.
-- Changes the work log rules:
--   * entries can be added for any past date (not the future), not only today
--   * you can edit or delete your own entries while they are still pending
--   * once an admin approves or rejects an entry, it is locked
--   * an admin can still only change the status of someone else's entry
-- When auth.uid() is null (you editing by hand in the Table Editor / SQL Editor) the rules are skipped.

drop policy if exists "logs: insert own for today" on public.work_logs;
create policy "logs: insert own up to today" on public.work_logs
  for insert to authenticated
  with check (user_id = auth.uid() and log_date <= public.portal_today());

drop policy if exists "logs: delete own today" on public.work_logs;
create policy "logs: delete own pending" on public.work_logs
  for delete to authenticated
  using (user_id = auth.uid() and status = 'pending');

create policy "logs: update own pending" on public.work_logs
  for update to authenticated
  using (user_id = auth.uid() and status = 'pending')
  with check (user_id = auth.uid() and status = 'pending' and log_date <= public.portal_today());

create or replace function public.guard_log_update() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null then
    if new.user_id is distinct from old.user_id then
      raise exception 'Entries cannot be edited.';
    end if;

    if old.user_id = auth.uid() then
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
      -- Someone else's entry (admin): only the status can change.
      if new.log_date is distinct from old.log_date
         or new.content is distinct from old.content
         or new.hours is distinct from old.hours
         or new.start_time is distinct from old.start_time
         or new.end_time is distinct from old.end_time
         or new.project is distinct from old.project then
        raise exception 'Entries cannot be edited.';
      end if;
      if new.status is distinct from old.status then
        new.reviewed_by := auth.uid();
        new.reviewed_at := now();
      else
        new.reviewed_by := old.reviewed_by;
        new.reviewed_at := old.reviewed_at;
      end if;
    end if;
  end if;
  return new;
end $$;
