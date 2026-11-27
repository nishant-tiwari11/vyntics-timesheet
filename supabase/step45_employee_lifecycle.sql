-- Removed employees are archived, never deleted. Apply after step44.
begin;
alter table public.profiles add column if not exists removed_at timestamptz;
alter table public.allowed_users add column if not exists removed_at timestamptz;

create table if not exists public.employee_activity_archive (
  id bigint generated always as identity primary key,
  batch_id uuid not null,
  user_id uuid not null references public.profiles(id),
  table_name text not null,
  row_data jsonb not null,
  archived_at timestamptz not null default now()
);
alter table public.employee_activity_archive enable row level security;
revoke all on public.employee_activity_archive from anon, authenticated;
grant select on public.employee_activity_archive to authenticated;
drop policy if exists "archive: admin read" on public.employee_activity_archive;
create policy "archive: admin read" on public.employee_activity_archive for select to authenticated using (public.is_admin());
create index if not exists employee_activity_archive_user_idx on public.employee_activity_archive(user_id, archived_at);

create or replace function public.employee_is_current(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id=p_user and removed_at is null)
$$;
revoke all on function public.employee_is_current(uuid) from public, anon;
grant execute on function public.employee_is_current(uuid) to authenticated;

-- Financial ledgers (expenses, bills, payslips, payroll) deliberately retain their existing visibility.
do $$
declare t text;
begin
  foreach t in array array['work_logs','timesheet_weeks','requests','comp_off_requests','duty_logs','employee_documents','employee_onboarding','offer_letters','notifications','request_google_events','google_connections','salary_structures'] loop
    execute format('drop policy if exists "employee: current only" on public.%I',t);
    execute format('create policy "employee: current only" on public.%I as restrictive for all to authenticated using (public.employee_is_current(user_id)) with check (public.employee_is_current(user_id))',t);
  end loop;
end $$;
drop policy if exists "employee: current only" on public.timesheet_rows;
create policy "employee: current only" on public.timesheet_rows as restrictive for all to authenticated
using (exists(select 1 from public.timesheet_weeks w where w.id=week_id))
with check (exists(select 1 from public.timesheet_weeks w where w.id=week_id));
drop policy if exists "employee: current only" on public.calendar_events;
create policy "employee: current only" on public.calendar_events as restrictive for all to authenticated
using (owner_id is null or public.employee_is_current(owner_id))
with check (owner_id is null or public.employee_is_current(owner_id));

-- Ordinary Enable / Add must not silently bypass the explicit restoration choice.
create or replace function public.employee_lifecycle_guard() returns trigger
language plpgsql set search_path=public as $$
begin
  if old.removed_at is not null and new.removed_at is not null and new.status='active' then
    raise exception 'Restore this person from Removed employees first.';
  end if;
  if new.removed_at is distinct from old.removed_at and not public.access_caller_ok() then
    raise exception 'Only an admin can remove or restore an employee.';
  end if;
  return new;
end $$;
drop trigger if exists employee_lifecycle_guard on public.profiles;
create trigger employee_lifecycle_guard before update on public.profiles for each row execute function public.employee_lifecycle_guard();
drop trigger if exists employee_lifecycle_guard on public.allowed_users;
create trigger employee_lifecycle_guard before update on public.allowed_users for each row execute function public.employee_lifecycle_guard();

create or replace function public.access_archive_user(p_email text) returns void
language plpgsql security definer set search_path=public as $$
declare e text; p public.profiles; a public.allowed_users;
begin
  if not public.access_caller_ok() then raise exception 'Only an admin can do that.'; end if;
  perform pg_advisory_xact_lock(hashtext('employee lifecycle'));
  e:=public.access_norm_email(p_email);
  select * into p from public.profiles where lower(email)=e for update;
  select * into a from public.allowed_users where email=e for update;
  if p.id is null and a.email is null then raise exception 'That person is not on the employee list.'; end if;
  if p.id=auth.uid() then raise exception 'You cannot remove your own account.'; end if;
  if p.role='admin' and p.status='active' and public.access_active_admins_without(e)=0 then raise exception 'There must be at least one active admin.'; end if;
  if coalesce(p.removed_at,a.removed_at) is not null then return; end if;
  update public.allowed_users set removed_at=now(),status='disabled',updated_at=now() where email=e;
  update public.profiles set removed_at=now(),status='disabled' where id=p.id;
  -- Close open stretches so time cannot keep accruing while the account is removed.
  update public.duty_logs set ended_at=greatest(started_at,now()),auto_closed=true where user_id=p.id and ended_at is null;
  perform public.access_sync_account(e);
  perform public.access_audit_write('user_removed',e,'Moved to Removed employees; activity hidden; documents and financial history retained');
end $$;

create or replace function public.access_remove_user(p_email text) returns void
language sql security definer set search_path=public as $$ select public.access_archive_user(p_email) $$;

create or replace function public.access_restore_user(p_email text,p_mode text) returns void
language plpgsql security definer set search_path=public as $$
declare e text; p public.profiles; a public.allowed_users; t text; batch uuid:=gen_random_uuid();
begin
  if not public.access_caller_ok() then raise exception 'Only an admin can do that.'; end if;
  if p_mode not in ('fresh','retrieve') or p_mode is null then raise exception 'Choose Fresh start or Retrieve old data.'; end if;
  perform pg_advisory_xact_lock(hashtext('employee lifecycle'));
  e:=public.access_norm_email(p_email);
  select * into p from public.profiles where lower(email)=e for update;
  select * into a from public.allowed_users where email=e for update;
  if coalesce(p.removed_at,a.removed_at) is null then raise exception 'That person is not in Removed employees.'; end if;
  if p_mode='fresh' and p.id is not null then
    -- Snapshot before clearing working tables. All statements roll back together on any failure.
    insert into public.employee_activity_archive(batch_id,user_id,table_name,row_data)
    select batch,p.id,'timesheet_rows',to_jsonb(r) from public.timesheet_rows r join public.timesheet_weeks w on w.id=r.week_id where w.user_id=p.id;
    delete from public.timesheet_rows where week_id in(select id from public.timesheet_weeks where user_id=p.id);
    foreach t in array array['request_google_events','comp_off_requests','work_logs','timesheet_weeks','requests','duty_logs'] loop
      execute format('insert into public.employee_activity_archive(batch_id,user_id,table_name,row_data) select $1,$2,$3,to_jsonb(r) from public.%I r where user_id=$2',t) using batch,p.id,t;
    end loop;
    -- Remove dependants before their parents. Snapshots above retain every original row.
    delete from public.request_google_events where user_id=p.id;
    delete from public.comp_off_requests where user_id=p.id;
    delete from public.work_logs where user_id=p.id;
    delete from public.timesheet_weeks where user_id=p.id;
    delete from public.requests where user_id=p.id;
    delete from public.duty_logs where user_id=p.id;
    insert into public.employee_activity_archive(batch_id,user_id,table_name,row_data)
    select batch,p.id,'calendar_events',to_jsonb(r) from public.calendar_events r where owner_id=p.id;
    delete from public.calendar_events where owner_id=p.id;
    insert into public.employee_activity_archive(batch_id,user_id,table_name,row_data)
    select batch,p.id,'notifications',to_jsonb(r) from public.notifications r where user_id=p.id;
    delete from public.notifications where user_id=p.id;
    insert into public.employee_activity_archive(batch_id,user_id,table_name,row_data)
    select batch,p.id,'employee_details',to_jsonb(r) from public.employee_details r where user_id=p.id;
    update public.employee_details set joined_on=public.portal_today(),left_on=null,department=null where user_id=p.id;
    update public.profiles set manager_id=null,docs_reminded_at=null,last_reminded_at=null,last_summary_at=null,last_digest_at=null where id=p.id;
  end if;
  update public.allowed_users set removed_at=null,status='active',expires_on=null,updated_at=now() where email=e;
  update public.profiles set removed_at=null,status='active',access_expires_on=null where id=p.id;
  perform public.access_sync_account(e);
  perform public.access_audit_write('user_restored',e,case when p_mode='fresh' then 'Fresh start; previous activity archived; documents, expenses and payslips retained' else 'Restored with previous data' end);
end $$;
revoke all on function public.access_archive_user(text) from public,anon;
revoke all on function public.access_restore_user(text,text) from public,anon;
revoke all on function public.employee_lifecycle_guard() from public,anon;
grant execute on function public.access_archive_user(text) to authenticated,service_role;
grant execute on function public.access_restore_user(text,text) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
