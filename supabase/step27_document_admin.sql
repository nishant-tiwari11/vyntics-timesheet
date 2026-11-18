-- STEP 27 – run once in Supabase → SQL Editor, AFTER step26_documents.sql. Safe to run again.
-- HR side of documents: verify / reject (the employee is told), "HR only" visibility, the manager permission for sensitive
-- documents, and in-app notifications with automatic reminders (missing required documents, documents about to expire).

alter table public.profiles add column if not exists docs_reminded_at timestamptz;

-- ---------- Notifications ----------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null check (char_length(title) <= 120),
  body text check (body is null or char_length(body) <= 300),
  link text check (link is null or (link like '/timesheet/%' and char_length(link) <= 200)),
  dedupe_key text,                                            -- the same reminder is only ever created once
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;

drop policy if exists "notifications: read own" on public.notifications;
create policy "notifications: read own" on public.notifications for select to authenticated using (user_id = auth.uid());
-- No insert / update / delete policies: notifications are created by the functions below and marked read by notifications_mark_read.

create or replace function public.notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text, p_key text) returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  values (p_user, p_kind, left(p_title, 120), left(p_body, 300), p_link, p_key)
  on conflict (user_id, dedupe_key) do nothing
$$;
revoke all on function public.notify(uuid, text, text, text, text, text) from public, anon, authenticated;

create or replace function public.notifications_mark_read(p_ids uuid[]) returns void
language sql security definer set search_path = public as $$
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids))
$$;
revoke all on function public.notifications_mark_read(uuid[]) from public, anon;
grant execute on function public.notifications_mark_read(uuid[]) to authenticated;

-- ---------- Verify or reject ----------
create or replace function public.doc_review(p_id uuid, p_decision text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  d public.employee_documents;
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into me from public.profiles where id = auth.uid() and status = 'active' and role = 'admin';
  if me.id is null then raise exception 'Only an admin can do that.'; end if;
  if p_decision not in ('verified', 'rejected') then raise exception 'Choose verify or reject.'; end if;
  if p_decision = 'rejected' and (reason is null or char_length(reason) < 3) then raise exception 'Give a reason for rejecting this document.'; end if;
  if reason is not null and char_length(reason) > 300 then raise exception 'Keep the reason to 300 characters or fewer.'; end if;
  select * into d from public.employee_documents where id = p_id for update;
  if d.id is null or d.deleted_at is not null then raise exception 'That document no longer exists.'; end if;
  if not d.is_current then raise exception 'Only the current version can be reviewed.'; end if;

  update public.employee_documents
     set status = p_decision, status_reason = case when p_decision = 'rejected' then reason else null end,
         reviewed_by = me.id, reviewed_at = now()
   where id = d.id;

  insert into public.document_audit (document_id, owner_id, actor_id, actor_email, action, detail)
  values (d.id, d.user_id, me.id, me.email, case when p_decision = 'verified' then 'verify' else 'reject' end, left(coalesce(reason, d.name), 300));

  if d.visibility = 'employee' and d.user_id <> me.id then
    perform public.notify(d.user_id, 'doc_review',
      case when p_decision = 'verified' then 'Document verified' else 'Document rejected' end,
      d.name || case when p_decision = 'rejected' then ': ' || reason else '' end,
      '/timesheet/profile?tab=documents',
      'review:' || d.id || ':' || p_decision || ':' || extract(epoch from now())::bigint);
  end if;
end $$;

-- ---------- Who can see a document: the employee, or HR only ----------
create or replace function public.doc_set_visibility(p_id uuid, p_visibility text) returns void
language plpgsql security definer set search_path = public as $$
declare me public.profiles; d public.employee_documents;
begin
  select * into me from public.profiles where id = auth.uid() and status = 'active' and role = 'admin';
  if me.id is null then raise exception 'Only an admin can do that.'; end if;
  if p_visibility not in ('employee', 'hr_only') then raise exception 'Choose who can see this document.'; end if;
  select * into d from public.employee_documents where id = p_id and deleted_at is null for update;
  if d.id is null then raise exception 'That document no longer exists.'; end if;
  update public.employee_documents set visibility = p_visibility where group_id = d.group_id and deleted_at is null;
  insert into public.document_audit (document_id, owner_id, actor_id, actor_email, action, detail)
  values (d.id, d.user_id, me.id, me.email, 'visibility', case when p_visibility = 'hr_only' then 'HR only' else 'Visible to employee' end);
end $$;

-- ---------- Managers and sensitive documents ----------
create or replace function public.doc_set_manager_sensitive(p_user uuid, p_allowed boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me public.profiles; t public.profiles;
begin
  select * into me from public.profiles where id = auth.uid() and status = 'active' and role = 'admin';
  if me.id is null then raise exception 'Only an admin can do that.'; end if;
  select * into t from public.profiles where id = p_user;
  if t.id is null then raise exception 'That person could not be found.'; end if;
  if t.role <> 'manager' then raise exception 'Only managers can be given this permission.'; end if;
  update public.profiles set can_view_sensitive_docs = coalesce(p_allowed, false) where id = p_user;
  perform public.access_audit_write('manager_sensitive_docs', t.email, case when p_allowed then 'Can view ID, bank and salary documents of their team' else 'Can no longer view sensitive documents' end);
end $$;

-- ---------- Reminders ----------
-- How many of the required categories does this person still have no current document for?
create or replace function public.docs_missing_count(p_user uuid) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from unnest(array['offer_letter', 'appointment_letter', 'contract_nda', 'id_proof', 'address_proof',
                                              'education', 'previous_employment', 'bank_details']) c
  where not exists (
    select 1 from public.employee_documents d
    where d.user_id = p_user and d.category = c and d.is_current and d.deleted_at is null and d.status <> 'rejected'
  )
$$;
revoke all on function public.docs_missing_count(uuid) from public, anon, authenticated; -- internal: used by the reminder functions only

-- The signed-in person's own reminders, made at most every six hours and never twice for the same thing:
-- a weekly "documents missing" note, and one note per document that is about to expire or has expired.
create or replace function public.docs_refresh_reminders() returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  today date := public.portal_today();
  missing integer;
  d record;
begin
  select * into me from public.profiles where id = auth.uid() and status = 'active';
  if me.id is null or me.role not in ('employee', 'manager') then return; end if;
  if me.docs_reminded_at is not null and me.docs_reminded_at > now() - interval '6 hours' then return; end if;
  update public.profiles set docs_reminded_at = now() where id = me.id;

  missing := public.docs_missing_count(me.id);
  if missing > 0 then
    perform public.notify(me.id, 'docs_missing', 'Documents missing',
      missing || ' required ' || case when missing = 1 then 'document still needs' else 'documents still need' end || ' to be uploaded.',
      '/timesheet/profile?tab=documents', 'missing:' || to_char(today, 'IYYY-"W"IW'));
  end if;

  for d in
    select id, name, expiry_date from public.employee_documents
    where user_id = me.id and is_current and deleted_at is null and expiry_date is not null and expiry_date <= today + 30
  loop
    perform public.notify(me.id, 'docs_expiry',
      case when d.expiry_date < today then 'Document expired' else 'Document expiring soon' end,
      d.name || (case when d.expiry_date < today then ' expired on ' else ' expires on ' end) || to_char(d.expiry_date, 'DD Mon YYYY') || '.',
      '/timesheet/profile?tab=documents', 'expiry:' || d.id || ':' || d.expiry_date);
  end loop;
end $$;
revoke all on function public.docs_refresh_reminders() from public, anon;
grant execute on function public.docs_refresh_reminders() to authenticated;

-- Admin: nudge one employee about their missing required documents (once a day per person).
create or replace function public.docs_send_reminder(p_user uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare me public.profiles; missing integer; key text := 'nudge:' || public.portal_today();
begin
  select * into me from public.profiles where id = auth.uid() and status = 'active' and role = 'admin';
  if me.id is null then raise exception 'Only an admin can do that.'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'That person could not be found.'; end if;
  missing := public.docs_missing_count(p_user);
  if missing = 0 then raise exception 'That person has uploaded all their required documents.'; end if;
  if exists (select 1 from public.notifications where user_id = p_user and dedupe_key = key) then return false; end if;
  perform public.notify(p_user, 'docs_missing', 'Please upload your documents',
    missing || ' required ' || case when missing = 1 then 'document is' else 'documents are' end || ' still missing. HR asked you to upload ' || case when missing = 1 then 'it' else 'them' end || '.',
    '/timesheet/profile?tab=documents', key);
  return true;
end $$;

revoke all on function public.doc_review(uuid, text, text) from public, anon;
revoke all on function public.doc_set_visibility(uuid, text) from public, anon;
revoke all on function public.doc_set_manager_sensitive(uuid, boolean) from public, anon;
revoke all on function public.docs_send_reminder(uuid) from public, anon;
grant execute on function public.doc_review(uuid, text, text) to authenticated;
grant execute on function public.doc_set_visibility(uuid, text) to authenticated;
grant execute on function public.doc_set_manager_sensitive(uuid, boolean) to authenticated;
grant execute on function public.docs_send_reminder(uuid) to authenticated;
