-- STEP 46 – run once in Supabase → SQL Editor, after step 45. Safe to run again.
-- Ticket Settings (admin only): manage the ticket categories and who the support staff of each department are.
--   * A category routes its tickets to a department. "Restricted" categories (HR, payroll) are seen only by the person who raised the
--     ticket, the assignee, followers, the department's support staff and admins; managers don't see them.
--   * Changing a category's department only affects tickets raised after that; existing tickets keep their department.
--     Changing "restricted" applies to existing tickets of the category at once.
--   * Every change is written to the audit log (Admin → Audit log).
-- A category is never deleted (tickets point to it): switch it off and it can't be chosen for new tickets.

create or replace function public.ticket_category_save(p_id uuid, p_name text, p_department text, p_sensitive boolean, p_active boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  n text := btrim(coalesce(p_name, ''));
  d text := btrim(coalesce(p_department, ''));
  cid uuid := p_id;
  old public.ticket_categories;
begin
  if not public.access_caller_ok() then raise exception 'Only an admin can do that.'; end if;
  if char_length(n) < 2 or char_length(n) > 60 then raise exception 'The category name must be 2 to 60 characters.'; end if;
  if char_length(d) < 2 or char_length(d) > 60 then raise exception 'The department name must be 2 to 60 characters.'; end if;
  if exists (select 1 from public.ticket_categories where lower(name) = lower(n) and id is distinct from p_id) then
    raise exception 'A category called "%" already exists.', n;
  end if;
  if p_id is null then
    insert into public.ticket_categories (name, department, sensitive, active, sort)
    values (n, d, coalesce(p_sensitive, false), coalesce(p_active, true), coalesce((select max(sort) from public.ticket_categories), 0) + 1)
    returning id into cid;
    perform public.access_audit_write('ticket_category_added', n, 'Routes to ' || d || case when coalesce(p_sensitive, false) then ' (restricted)' else '' end);
  else
    select * into old from public.ticket_categories where id = p_id for update;
    if old.id is null then raise exception 'That category no longer exists.'; end if;
    update public.ticket_categories set name = n, department = d, sensitive = coalesce(p_sensitive, sensitive), active = coalesce(p_active, active) where id = p_id;
    perform public.access_audit_write('ticket_category_changed', old.name,
      concat_ws('; ',
        case when old.name <> n then 'renamed to ' || n end,
        case when old.department <> d then 'department ' || old.department || ' → ' || d end,
        case when p_sensitive is not null and old.sensitive <> p_sensitive then case when p_sensitive then 'now restricted' else 'no longer restricted' end end,
        case when p_active is not null and old.active <> p_active then case when p_active then 'switched on' else 'switched off' end end));
  end if;
  return cid;
end $$;

-- Put the categories in this order (the first id is shown first).
create or replace function public.ticket_category_reorder(p_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare i int;
begin
  if not public.access_caller_ok() then raise exception 'Only an admin can do that.'; end if;
  for i in 1 .. coalesce(array_length(p_ids, 1), 0) loop
    update public.ticket_categories set sort = i where id = p_ids[i];
  end loop;
  perform public.access_audit_write('ticket_categories_reordered', null, null);
end $$;

-- Mark (or unmark) someone as support staff for a department. Replaces the step 45 version so the change is audited.
create or replace function public.ticket_support_set(p_user uuid, p_department text, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if not public.access_caller_ok() then raise exception 'Only an admin can do that.'; end if;
  if not exists (select 1 from public.ticket_categories where department = p_department) then raise exception 'Unknown department.'; end if;
  select coalesce(nullif(btrim(full_name), ''), email) into who from public.profiles where id = p_user and status = 'active' and role <> 'viewer';
  if who is null then raise exception 'Choose an active person.'; end if;
  if coalesce(p_on, true) then
    insert into public.ticket_support (user_id, department) values (p_user, p_department) on conflict do nothing;
    perform public.access_audit_write('ticket_support_added', who, 'Support for ' || p_department);
  else
    delete from public.ticket_support where user_id = p_user and department = p_department;
    perform public.access_audit_write('ticket_support_removed', who, 'Support for ' || p_department);
  end if;
end $$;

revoke all on function public.ticket_category_save(uuid, text, text, boolean, boolean) from public, anon;
revoke all on function public.ticket_category_reorder(uuid[]) from public, anon;
revoke all on function public.ticket_support_set(uuid, text, boolean) from public, anon;
grant execute on function public.ticket_category_save(uuid, text, text, boolean, boolean) to authenticated;
grant execute on function public.ticket_category_reorder(uuid[]) to authenticated;
grant execute on function public.ticket_support_set(uuid, text, boolean) to authenticated;

notify pgrst, 'reload schema';
