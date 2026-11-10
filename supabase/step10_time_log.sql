-- STEP 10 – run once in Supabase → SQL Editor, after the other files.
-- Adds start time, end time, project and an approval status to work log entries.
-- Existing entries keep working: they simply have no times or project, and count as "pending".
-- Rules are enforced by the database. When auth.uid() is null (you editing by hand in the
-- Table Editor / SQL Editor) the rules are skipped, so manual fixes still work.

create type public.log_status as enum ('pending', 'approved', 'rejected');

alter table public.work_logs
  add column start_time  time,
  add column end_time    time,
  add column project     text check (project is null or length(project) <= 60),
  add column status      public.log_status not null default 'pending',
  add column reviewed_by uuid references public.profiles (id) on delete set null,
  add column reviewed_at timestamptz,
  add constraint work_logs_times_ok check (
    (start_time is null) = (end_time is null)
    and (start_time is null or end_time > start_time)
  );

create index on public.work_logs (log_date);
create index on public.work_logs (status);

-- Admins can decide entries. The trigger below limits what an update may change.
create policy "logs: admin decides" on public.work_logs
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- New entries always start as pending.
create or replace function public.guard_log_insert() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null then
    new.status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;
  return new;
end $$;

drop trigger if exists guard_log_insert on public.work_logs;
create trigger guard_log_insert
  before insert on public.work_logs
  for each row execute function public.guard_log_insert();

-- Updates: only the status can change, nobody decides their own entry, and the reviewer is recorded.
create or replace function public.guard_log_update() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null then
    if new.user_id is distinct from old.user_id
       or new.log_date is distinct from old.log_date
       or new.content is distinct from old.content
       or new.hours is distinct from old.hours
       or new.start_time is distinct from old.start_time
       or new.end_time is distinct from old.end_time
       or new.project is distinct from old.project then
      raise exception 'Entries cannot be edited.';
    end if;
    if new.status is distinct from old.status then
      if new.user_id = auth.uid() then
        raise exception 'You cannot decide your own entry.';
      end if;
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    else
      new.reviewed_by := old.reviewed_by;
      new.reviewed_at := old.reviewed_at;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists guard_log_update on public.work_logs;
create trigger guard_log_update
  before update on public.work_logs
  for each row execute function public.guard_log_update();
