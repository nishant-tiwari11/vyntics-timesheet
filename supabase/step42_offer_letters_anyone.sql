-- STEP 42 – run once in Supabase → SQL Editor, AFTER step41_offer_letters.sql. Safe to run again.
-- An admin can make an offer letter for ANYONE by typing their details, even a person who has no account in the portal yet.
-- Such a letter has no employee linked (user_id is empty): it can be previewed, saved as a draft and downloaded as a PDF. To SEND it
-- (put it on someone's profile for them to accept) it must first be linked to an employee, which an admin can do on the draft.
-- Nothing else changes: an employee still only reads their own sent or accepted letter.

alter table public.offer_letters alter column user_id drop not null;

-- p_user may now be null (a letter for someone with no account). On a draft, a non-null p_user links it to that employee.
create or replace function public.offer_save(p_id uuid, p_user uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  old public.offer_letters;
  new_id uuid := gen_random_uuid();
  etype text;
  who text;
begin
  if not public.is_admin() then raise exception 'Only an admin can do that.'; end if;
  if jsonb_typeof(p_data) is distinct from 'object' or char_length(p_data::text) > 60000 then raise exception 'The letter details are not valid.'; end if;
  etype := p_data ->> 'engagementType';
  if etype is null or etype not in ('unpaid_internship', 'paid_internship', 'phased_internship', 'full_time') then raise exception 'Choose the type of letter.'; end if;
  who := left(btrim(coalesce(p_data ->> 'candidateName', '')), 100);
  if who = '' then raise exception 'Enter the employee''s name.'; end if;
  if p_user is not null and not exists (select 1 from public.profiles where id = p_user) then raise exception 'That person could not be found.'; end if;

  if p_id is null then
    insert into public.offer_letters (id, group_id, user_id, engagement_type, candidate_name, data, created_by)
    values (new_id, new_id, p_user, etype, who, p_data, auth.uid());
    perform public.access_audit_write('offer_created', who, 'Offer letter draft created (' || etype || ')' || case when p_user is null then ', not linked to an employee' else '' end);
    return new_id;
  end if;

  select * into old from public.offer_letters where id = p_id for update;
  if old.id is null then raise exception 'That letter could not be found.'; end if;
  if not old.is_current then raise exception 'This is an older version. Open the latest version to change it.'; end if;

  if old.status = 'draft' then
    update public.offer_letters
       set data = p_data, engagement_type = etype, candidate_name = who, updated_at = now(), user_id = coalesce(p_user, old.user_id)
     where id = old.id;
    perform public.access_audit_write('offer_edited', who, 'Offer letter draft edited, version ' || old.version);
    return old.id;
  end if;

  update public.offer_letters set is_current = false where id = old.id;
  insert into public.offer_letters (id, group_id, version, user_id, engagement_type, candidate_name, data, created_by)
  values (new_id, old.group_id, old.version + 1, old.user_id, etype, who, p_data, auth.uid());
  perform public.access_audit_write('offer_version_created', who, 'New draft version ' || (old.version + 1) || ' of a letter that was already ' || old.status);
  return new_id;
end $$;

-- Sending needs an employee to send it to.
create or replace function public.offer_mark_sent(p_id uuid, p_doc uuid) returns void
language plpgsql security definer set search_path = public as $$
declare l public.offer_letters;
begin
  if not public.is_admin() then raise exception 'Only an admin can do that.'; end if;
  select * into l from public.offer_letters where id = p_id for update;
  if l.id is null then raise exception 'That letter could not be found.'; end if;
  if l.user_id is null then raise exception 'Link this letter to an employee before sending it.'; end if;
  if not l.is_current or l.status <> 'draft' then raise exception 'Only the current draft can be sent.'; end if;
  update public.offer_letters set status = 'sent', sent_at = now(), document_id = p_doc, updated_at = now() where id = l.id;
  perform public.access_audit_write('offer_sent', l.candidate_name, 'Offer letter sent, version ' || l.version);
end $$;

revoke all on function public.offer_save(uuid, uuid, jsonb) from public, anon;
revoke all on function public.offer_mark_sent(uuid, uuid) from public, anon;
grant execute on function public.offer_save(uuid, uuid, jsonb) to authenticated;
grant execute on function public.offer_mark_sent(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
