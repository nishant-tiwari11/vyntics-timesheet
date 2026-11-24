-- STEP 41 – run once in Supabase → SQL Editor, AFTER step24_access.sql and step26_documents.sql. Safe to run again.
-- Offer letters: one master template for four engagement types (unpaid / paid / phased internship, full-time).
--   * offer_settings   the company details and the editable wording of each clause (one row, set once by an admin)
--   * offer_letters    every letter and every version of it: Draft -> Sent -> Accepted. Once sent, a letter is locked: changing it
--                      creates a NEW draft version (the old one stays, marked not current).
-- The PDFs live in the private documents bucket and are listed on the employee's profile (employee_documents, category
-- offer_letter), so this step needs no new storage. Only admins write letters and settings; an employee can read their own SENT or
-- ACCEPTED letter and accept it. Every create / edit / send / accept is written to the audit log (access_audit).

create table if not exists public.offer_settings (
  id boolean primary key default true check (id),
  company jsonb not null default '{}'::jsonb,
  clauses jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.offer_settings (id) values (true) on conflict (id) do nothing;
alter table public.offer_settings enable row level security;
-- Anyone signed in can read the company details and wording (an employee reads their own letter with them); only admins change them.
drop policy if exists "offer settings: admin read" on public.offer_settings;
drop policy if exists "offer settings: signed in read" on public.offer_settings;
create policy "offer settings: signed in read" on public.offer_settings for select to authenticated using (true);

create table if not exists public.offer_letters (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  version integer not null default 1 check (version >= 1),
  is_current boolean not null default true,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted')),
  engagement_type text not null check (engagement_type in ('unpaid_internship', 'paid_internship', 'phased_internship', 'full_time')),
  candidate_name text not null check (char_length(candidate_name) between 1 and 100),
  data jsonb not null,
  document_id uuid references public.employee_documents (id) on delete set null,
  signed_document_id uuid references public.employee_documents (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  accepted_at timestamptz,
  accepted_name text check (accepted_name is null or char_length(accepted_name) <= 100),
  accepted_on date,
  accept_method text check (accept_method in ('typed', 'upload')),
  unique (group_id, version)
);
create index if not exists offer_letters_user_idx on public.offer_letters (user_id, created_at desc);
create index if not exists offer_letters_group_idx on public.offer_letters (group_id, version desc);
create index if not exists offer_letters_list_idx on public.offer_letters (is_current, status, engagement_type);

alter table public.offer_letters enable row level security;
drop policy if exists "offer letters: admin read" on public.offer_letters;
create policy "offer letters: admin read" on public.offer_letters for select to authenticated using (public.is_admin());
drop policy if exists "offer letters: own sent or accepted" on public.offer_letters;
create policy "offer letters: own sent or accepted" on public.offer_letters for select to authenticated
  using (user_id = auth.uid() and is_current and status in ('sent', 'accepted'));

-- ---------- Settings (admin) ----------
create or replace function public.offer_settings_save(p_company jsonb, p_clauses jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only an admin can do that.'; end if;
  if jsonb_typeof(p_company) is distinct from 'object' or jsonb_typeof(p_clauses) is distinct from 'object' then raise exception 'Those settings are not valid.'; end if;
  if char_length(p_company::text) > 4000 or char_length(p_clauses::text) > 120000 then raise exception 'Those settings are too long.'; end if;
  update public.offer_settings set company = p_company, clauses = p_clauses, updated_by = auth.uid(), updated_at = now() where id;
  perform public.access_audit_write('offer_settings_changed', 'Offer letter settings', 'Company details or clause wording changed');
end $$;

-- ---------- Create, edit or version a letter (admin) ----------
-- p_id null: a new draft. p_id of a draft: the draft is changed. p_id of a sent or accepted letter: it is left as it is and a new draft
-- version of it is created (it must be the current version).
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

  if p_id is null then
    if not exists (select 1 from public.profiles where id = p_user) then raise exception 'That person could not be found.'; end if;
    insert into public.offer_letters (id, group_id, user_id, engagement_type, candidate_name, data, created_by)
    values (new_id, new_id, p_user, etype, who, p_data, auth.uid());
    perform public.access_audit_write('offer_created', who, 'Offer letter draft created (' || etype || ')');
    return new_id;
  end if;

  select * into old from public.offer_letters where id = p_id for update;
  if old.id is null then raise exception 'That letter could not be found.'; end if;
  if not old.is_current then raise exception 'This is an older version. Open the latest version to change it.'; end if;

  if old.status = 'draft' then
    update public.offer_letters set data = p_data, engagement_type = etype, candidate_name = who, updated_at = now() where id = old.id;
    perform public.access_audit_write('offer_edited', who, 'Offer letter draft edited, version ' || old.version);
    return old.id;
  end if;

  update public.offer_letters set is_current = false where id = old.id;
  insert into public.offer_letters (id, group_id, version, user_id, engagement_type, candidate_name, data, created_by)
  values (new_id, old.group_id, old.version + 1, old.user_id, etype, who, p_data, auth.uid());
  perform public.access_audit_write('offer_version_created', who, 'New draft version ' || (old.version + 1) || ' of a letter that was already ' || old.status);
  return new_id;
end $$;

-- ---------- Send (admin): Draft -> Sent. The PDF has already been stored on the employee's profile (p_doc). ----------
create or replace function public.offer_mark_sent(p_id uuid, p_doc uuid) returns void
language plpgsql security definer set search_path = public as $$
declare l public.offer_letters;
begin
  if not public.is_admin() then raise exception 'Only an admin can do that.'; end if;
  select * into l from public.offer_letters where id = p_id for update;
  if l.id is null then raise exception 'That letter could not be found.'; end if;
  if not l.is_current or l.status <> 'draft' then raise exception 'Only the current draft can be sent.'; end if;
  update public.offer_letters set status = 'sent', sent_at = now(), document_id = p_doc, updated_at = now() where id = l.id;
  perform public.access_audit_write('offer_sent', l.candidate_name, 'Offer letter sent, version ' || l.version);
end $$;

-- ---------- Accept (the employee): typed name and date, or an uploaded signed copy (p_doc) ----------
create or replace function public.offer_accept(p_id uuid, p_name text, p_on date, p_method text, p_signed_doc uuid) returns void
language plpgsql security definer set search_path = public as $$
declare l public.offer_letters; today date := public.portal_today();
begin
  if auth.uid() is null then raise exception 'Please sign in again.'; end if;
  select * into l from public.offer_letters where id = p_id for update;
  if l.id is null or l.user_id <> auth.uid() then raise exception 'That letter could not be found.'; end if;
  if not l.is_current or l.status <> 'sent' then raise exception 'This letter is not waiting for your acceptance.'; end if;
  if p_method not in ('typed', 'upload') then raise exception 'Choose how you are accepting.'; end if;
  if p_method = 'typed' then
    if char_length(btrim(coalesce(p_name, ''))) not between 2 and 100 then raise exception 'Type your full name.'; end if;
    if p_on is null or p_on < today - 1 or p_on > today + 1 then raise exception 'Use today''s date.'; end if;
  elsif p_signed_doc is null then
    raise exception 'Upload the signed copy first.';
  end if;
  update public.offer_letters
     set status = 'accepted', accepted_at = now(), accept_method = p_method, updated_at = now(),
         accepted_name = case when p_method = 'typed' then btrim(p_name) else null end,
         accepted_on = case when p_method = 'typed' then p_on else today end,
         signed_document_id = case when p_method = 'upload' then p_signed_doc else null end
   where id = l.id;
  perform public.access_audit_write('offer_accepted', l.candidate_name, 'Accepted by ' || p_method || ', version ' || l.version);
end $$;

-- ---------- Delete a draft (admin) ----------
create or replace function public.offer_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare l public.offer_letters;
begin
  if not public.is_admin() then raise exception 'Only an admin can do that.'; end if;
  select * into l from public.offer_letters where id = p_id for update;
  if l.id is null then raise exception 'That letter could not be found.'; end if;
  if l.status <> 'draft' then raise exception 'Only a draft can be deleted. A sent letter stays on record.'; end if;
  delete from public.offer_letters where id = l.id;
  -- If this was a newer version of a letter, the one before it is the current version again.
  update public.offer_letters set is_current = true
   where group_id = l.group_id and version = (select max(version) from public.offer_letters where group_id = l.group_id);
  perform public.access_audit_write('offer_deleted', l.candidate_name, 'Offer letter draft deleted, version ' || l.version);
end $$;

revoke all on function public.offer_settings_save(jsonb, jsonb) from public, anon;
revoke all on function public.offer_save(uuid, uuid, jsonb) from public, anon;
revoke all on function public.offer_mark_sent(uuid, uuid) from public, anon;
revoke all on function public.offer_accept(uuid, text, date, text, uuid) from public, anon;
revoke all on function public.offer_delete(uuid) from public, anon;
grant execute on function public.offer_settings_save(jsonb, jsonb) to authenticated;
grant execute on function public.offer_save(uuid, uuid, jsonb) to authenticated;
grant execute on function public.offer_mark_sent(uuid, uuid) to authenticated;
grant execute on function public.offer_accept(uuid, text, date, text, uuid) to authenticated;
grant execute on function public.offer_delete(uuid) to authenticated;

notify pgrst, 'reload schema';
