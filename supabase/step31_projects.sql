-- STEP 31 – run once in Supabase → SQL Editor, AFTER step24_access.sql. Safe to run again.
-- Projects people can log time against, managed by admins on Admin -> Projects (replacing the fixed list that was in the code).
--   * Everyone signed in can read the list (the time log form needs it). Nobody writes to the table directly: admins use the
--     functions below, which check the role and write to the audit log (Admin -> Audit Log).
--   * A project is never deleted: it is ARCHIVED. Old time logs keep their project name, and archived projects can't be chosen
--     for new entries. A project can only be renamed while nothing is logged against it.
--   * The five projects that existed before are added automatically.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists projects_name_key on public.projects (lower(btrim(name)));

insert into public.projects (name)
select v from (values ('Client work'), ('Internal'), ('Meetings'), ('Training'), ('Leave')) as t (v)
where not exists (select 1 from public.projects);

alter table public.projects enable row level security;
drop policy if exists "projects: read" on public.projects;
create policy "projects: read" on public.projects for select to authenticated using (true);

-- ---------- Add ----------
create or replace function public.project_add(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare n text := btrim(coalesce(p_name, '')); new_id uuid;
begin
  if not public.access_caller_ok() then raise exception 'Only an admin can do that.'; end if;
  if n = '' then raise exception 'Enter the project''s name.'; end if;
  if char_length(n) > 60 then raise exception 'Keep the name to 60 characters or fewer.'; end if;
  if exists (select 1 from public.projects where lower(btrim(name)) = lower(n)) then raise exception 'A project called "%" already exists.', n; end if;
  insert into public.projects (name, created_by) values (n, auth.uid()) returning id into new_id;
  perform public.access_audit_write('project_added', n, null);
  return new_id;
end $$;

-- ---------- Rename (only while nothing is logged against it) ----------
create or replace function public.project_rename(p_id uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare n text := btrim(coalesce(p_name, '')); old_name text;
begin
  if not public.access_caller_ok() then raise exception 'Only an admin can do that.'; end if;
  select name into old_name from public.projects where id = p_id;
  if old_name is null then raise exception 'That project no longer exists.'; end if;
  if n = '' then raise exception 'Enter the project''s name.'; end if;
  if char_length(n) > 60 then raise exception 'Keep the name to 60 characters or fewer.'; end if;
  if lower(n) = lower(btrim(old_name)) and n = old_name then return; end if;
  if exists (select 1 from public.projects where id <> p_id and lower(btrim(name)) = lower(n)) then raise exception 'A project called "%" already exists.', n; end if;
  if exists (select 1 from public.work_logs where project = old_name) then
    raise exception '"%" already has time logged to it, so it can''t be renamed. Archive it and add a new project instead.', old_name;
  end if;
  update public.projects set name = n, updated_at = now() where id = p_id;
  perform public.access_audit_write('project_renamed', old_name, 'Now called ' || n);
end $$;

-- ---------- Archive / restore ----------
create or replace function public.project_set_active(p_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare p public.projects;
begin
  if not public.access_caller_ok() then raise exception 'Only an admin can do that.'; end if;
  select * into p from public.projects where id = p_id;
  if p.id is null then raise exception 'That project no longer exists.'; end if;
  if p.active = coalesce(p_active, false) then return; end if;
  if not coalesce(p_active, false) and not exists (select 1 from public.projects where active and id <> p_id) then
    raise exception 'At least one project must stay active, or nobody could log time.';
  end if;
  update public.projects set active = coalesce(p_active, false), updated_at = now() where id = p_id;
  perform public.access_audit_write(case when p_active then 'project_restored' else 'project_archived' end, p.name, null);
end $$;

-- ---------- How much each project has been used (as the signed-in admin: row-level security lets admins read everyone's logs) ----------
create or replace function public.project_usage() returns table (name text, entries bigint, hours numeric, last_used date)
language sql stable as $$
  select coalesce(nullif(project, ''), '(no project)'), count(*), coalesce(sum(hours) filter (where status <> 'rejected'), 0), max(log_date)
  from public.work_logs group by 1
$$;

revoke all on function public.project_add(text) from public, anon;
revoke all on function public.project_rename(uuid, text) from public, anon;
revoke all on function public.project_set_active(uuid, boolean) from public, anon;
revoke all on function public.project_usage() from public, anon;
grant execute on function public.project_add(text) to authenticated;
grant execute on function public.project_rename(uuid, text) to authenticated;
grant execute on function public.project_set_active(uuid, boolean) to authenticated;
grant execute on function public.project_usage() to authenticated;

notify pgrst, 'reload schema';
