-- STEP 37 – run once in Supabase → SQL Editor (after step31_projects.sql). Safe to run again.
-- Projects get a category: client work (which client project), internal (which area) or other. The names stay unique, so time
-- logs, the timesheet grid and payroll keep working exactly as before.

alter table public.projects add column if not exists category text not null default 'other'
  check (category in ('client', 'internal', 'other'));

-- Add a project in a category (replaces the one-argument version).
drop function if exists public.project_add(text);
create or replace function public.project_add(p_name text, p_category text default 'other') returns uuid
language plpgsql security definer set search_path = public as $$
declare n text := btrim(coalesce(p_name, '')); cat text := coalesce(nullif(p_category, ''), 'other'); new_id uuid;
begin
  if not public.access_caller_ok() then raise exception 'Only an admin can do that.'; end if;
  if n = '' then raise exception 'Enter the project''s name.'; end if;
  if char_length(n) > 60 then raise exception 'Keep the name to 60 characters or fewer.'; end if;
  if cat not in ('client', 'internal', 'other') then raise exception 'Choose client work, internal or other.'; end if;
  if exists (select 1 from public.projects where lower(btrim(name)) = lower(n)) then raise exception 'A project called "%" already exists.', n; end if;
  insert into public.projects (name, category, created_by) values (n, cat, auth.uid()) returning id into new_id;
  perform public.access_audit_write('project_added', n, cat);
  return new_id;
end $$;
revoke all on function public.project_add(text, text) from public, anon;
grant execute on function public.project_add(text, text) to authenticated;

-- Move a project to another category.
create or replace function public.project_set_category(p_id uuid, p_category text) returns void
language plpgsql security definer set search_path = public as $$
declare p public.projects;
begin
  if not public.access_caller_ok() then raise exception 'Only an admin can do that.'; end if;
  if p_category not in ('client', 'internal', 'other') then raise exception 'Choose client work, internal or other.'; end if;
  select * into p from public.projects where id = p_id;
  if p.id is null then raise exception 'That project no longer exists.'; end if;
  update public.projects set category = p_category, updated_at = now() where id = p_id;
  perform public.access_audit_write('project_moved', p.name, p_category);
end $$;
revoke all on function public.project_set_category(uuid, text) from public, anon;
grant execute on function public.project_set_category(uuid, text) to authenticated;

-- The projects to start with. Anything already there with the same name is left alone.
insert into public.projects (name, category) values
  ('AI Semantic', 'client'), ('QuickSight', 'client'), ('Royalty', 'client'),
  ('General works', 'internal'), ('Vyntics website', 'internal'), ('Timesheet website', 'internal'),
  ('Meeting', 'other')
on conflict ((lower(btrim(name)))) do nothing;

-- The old catch-all projects are archived, not deleted: hours already logged to them stay, they just can't be chosen again.
-- (Leave is handled by leave requests, and training isn't tracked as a project.)
update public.projects set active = false, updated_at = now()
where name in ('Client work', 'Internal', 'Meetings', 'Training', 'Leave')
  and exists (select 1 from public.projects where active and name not in ('Client work', 'Internal', 'Meetings', 'Training', 'Leave'));
update public.projects set category = 'client' where name = 'Client work';
update public.projects set category = 'internal' where name = 'Internal';

notify pgrst, 'reload schema';
