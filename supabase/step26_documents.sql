-- STEP 26 – run once in Supabase → SQL Editor, AFTER step24_access.sql and step25_avatars.sql. Safe to run again.
-- Employee documents (offer letters, ID proof, ...). Files live in a PRIVATE storage bucket and are only ever served
-- by the app after it checks who is asking. How access works:
--   * Reading is decided by row-level security on employee_documents (below). The storage bucket's own read rule simply
--     asks "may this person see the row for this file?", so a file can never be read when its row can't.
--   * Writing is only possible through the functions doc_create and doc_delete, which check everything again.
--   * Who sees what: an employee sees their own documents (not the ones an admin marked "HR only"); a manager sees their
--     direct reports' documents, but not ID proof / bank / salary slips unless an admin switched on
--     profiles.can_view_sensitive_docs for that manager; an admin sees everything, including old versions.

alter table public.profiles add column if not exists can_view_sensitive_docs boolean not null default false;

create table if not exists public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null default gen_random_uuid(),           -- the same for every version of one document
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (category in (
    'offer_letter', 'appointment_letter', 'contract_nda', 'id_proof', 'address_proof', 'education',
    'previous_employment', 'bank_details', 'salary_slips', 'other')),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  original_filename text not null check (char_length(original_filename) <= 200),
  storage_key text not null unique,                           -- "<owner id>/<random id>", never the real file name
  mime_type text not null check (mime_type in (
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  status_reason text check (status_reason is null or char_length(status_reason) <= 300),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  visibility text not null default 'employee' check (visibility in ('employee', 'hr_only')),
  issue_date date,
  expiry_date date,
  notes text check (notes is null or char_length(notes) <= 500),
  uploaded_by uuid references public.profiles (id) on delete set null,
  version integer not null default 1,
  is_current boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint employee_documents_dates_ok check (expiry_date is null or issue_date is null or expiry_date >= issue_date)
);

create index if not exists employee_documents_user_idx on public.employee_documents (user_id) where deleted_at is null;
create index if not exists employee_documents_group_idx on public.employee_documents (group_id, version);
create unique index if not exists employee_documents_one_current on public.employee_documents (group_id) where is_current and deleted_at is null;

create table if not exists public.document_audit (
  id bigint generated always as identity primary key,
  document_id uuid not null,                                  -- no foreign key: the record outlives the document
  owner_id uuid,
  actor_id uuid,
  actor_email text,
  action text not null check (action in ('upload', 'replace', 'view', 'download', 'delete', 'verify', 'reject', 'visibility')),
  detail text check (detail is null or char_length(detail) <= 300),
  at timestamptz not null default now()
);
create index if not exists document_audit_doc_idx on public.document_audit (document_id, at desc);

alter table public.employee_documents enable row level security;
alter table public.document_audit enable row level security;

-- ---------- Helpers ----------
create or replace function public.doc_is_sensitive(p_category text) returns boolean
language sql immutable as $$ select p_category in ('id_proof', 'bank_details', 'salary_slips') $$;

create or replace function public.manager_can_view_sensitive_docs() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select can_view_sensitive_docs from public.profiles where id = auth.uid() and status = 'active'), false)
$$;

-- ---------- Who can read a document row ----------
drop policy if exists "documents: read" on public.employee_documents;
create policy "documents: read" on public.employee_documents
  for select to authenticated
  using (
    public.is_admin()
    or (
      deleted_at is null and is_current and visibility = 'employee'
      and (
        user_id = auth.uid()
        or (public.is_manager_of(user_id) and (not public.doc_is_sensitive(category) or public.manager_can_view_sensitive_docs()))
      )
    )
  );
-- No insert / update / delete policies: nobody writes to the table directly.

-- The audit trail: admins read it. Anyone may add a "view" or "download" entry, but only about a document they can see.
drop policy if exists "document audit: admin reads" on public.document_audit;
create policy "document audit: admin reads" on public.document_audit
  for select to authenticated using (public.is_admin());

drop policy if exists "document audit: log own views" on public.document_audit;
create policy "document audit: log own views" on public.document_audit
  for insert to authenticated
  with check (
    action in ('view', 'download')
    and actor_id = auth.uid()
    and exists (select 1 from public.employee_documents d where d.id = document_id)
  );

create or replace function public.document_audit_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.actor_id := auth.uid();
  new.actor_email := coalesce((select email from public.profiles where id = auth.uid()), 'system');
  new.owner_id := (select user_id from public.employee_documents where id = new.document_id);
  new.at := now();
  return new;
end $$;
drop trigger if exists document_audit_stamp on public.document_audit;
create trigger document_audit_stamp before insert on public.document_audit for each row execute function public.document_audit_stamp();

-- ---------- Add a document, or a new version of one ----------
-- The app uploads the file first, then calls this. A replacement keeps the old version (hidden from the employee, shown to
-- admins) and becomes the current one. An employee can only add for themselves; only an admin can pick "HR only".
create or replace function public.doc_create(
  p_user uuid, p_category text, p_name text, p_filename text, p_key text, p_mime text, p_size integer,
  p_issue date, p_expiry date, p_notes text, p_visibility text, p_replace uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  old public.employee_documents;
  new_id uuid := gen_random_uuid();
  gid uuid := gen_random_uuid();
  ver integer := 1;
  cat text := p_category;
  vis text := coalesce(nullif(p_visibility, ''), 'employee');
begin
  select * into me from public.profiles where id = auth.uid() and status = 'active';
  if me.id is null then raise exception 'Please sign in again.'; end if;
  if me.role <> 'admin' and (p_user <> me.id or me.role = 'viewer') then raise exception 'You can only add documents to your own profile.'; end if;
  if me.role <> 'admin' then vis := 'employee'; end if;
  if vis not in ('employee', 'hr_only') then raise exception 'Choose who can see this document.'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'That person could not be found.'; end if;
  if split_part(p_key, '/', 1) <> p_user::text then raise exception 'The file is in the wrong place.'; end if;

  if p_replace is not null then
    select * into old from public.employee_documents where id = p_replace for update;
    if old.id is null or old.deleted_at is not null or not old.is_current or old.user_id <> p_user then
      raise exception 'That document can no longer be replaced. Please refresh.';
    end if;
    if me.role <> 'admin' and old.visibility <> 'employee' then raise exception 'That document can no longer be replaced.'; end if;
    update public.employee_documents set is_current = false where id = old.id;
    gid := old.group_id;
    ver := old.version + 1;
    cat := old.category;
    if me.role <> 'admin' then vis := old.visibility; end if;
  end if;

  insert into public.employee_documents
    (id, group_id, user_id, category, name, original_filename, storage_key, mime_type, size_bytes,
     issue_date, expiry_date, notes, visibility, uploaded_by, version)
  values (new_id, gid, p_user, cat, btrim(p_name), left(p_filename, 200), p_key, p_mime, p_size,
          p_issue, p_expiry, nullif(btrim(coalesce(p_notes, '')), ''), vis, me.id, ver);

  insert into public.document_audit (document_id, owner_id, actor_id, actor_email, action, detail)
  values (new_id, p_user, me.id, me.email, case when p_replace is null then 'upload' else 'replace' end,
          left(cat || ', version ' || ver || ', ' || p_size || ' bytes', 300));
  return new_id;
end $$;

-- ---------- Delete a document (and all its versions) ----------
-- Employees can delete their own documents until they are verified; admins can delete anything. The rows are kept (marked
-- deleted) for the audit trail; the function returns the file keys so the app can remove the files themselves.
create or replace function public.doc_delete(p_id uuid) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  d public.employee_documents;
  keys text[];
begin
  select * into me from public.profiles where id = auth.uid() and status = 'active';
  if me.id is null then raise exception 'Please sign in again.'; end if;
  select * into d from public.employee_documents where id = p_id;
  if d.id is null or d.deleted_at is not null then raise exception 'That document no longer exists.'; end if;
  if me.role <> 'admin' then
    if d.user_id <> me.id or me.role = 'viewer' or d.visibility <> 'employee' or not d.is_current then raise exception 'You can''t delete that document.'; end if;
    if exists (select 1 from public.employee_documents where group_id = d.group_id and status = 'verified' and deleted_at is null and is_current) then
      raise exception 'A verified document can''t be deleted. Ask an admin.';
    end if;
  end if;
  select array_agg(storage_key) into keys from public.employee_documents where group_id = d.group_id and deleted_at is null;
  update public.employee_documents set deleted_at = now(), is_current = false where group_id = d.group_id and deleted_at is null;
  insert into public.document_audit (document_id, owner_id, actor_id, actor_email, action, detail)
  values (d.id, d.user_id, me.id, me.email, 'delete', left(d.category || ': ' || d.name, 300));
  return keys;
end $$;

revoke all on function public.doc_create(uuid, text, text, text, text, text, integer, date, date, text, text, uuid) from public, anon;
revoke all on function public.doc_delete(uuid) from public, anon;
grant execute on function public.doc_create(uuid, text, text, text, text, text, integer, date, date, text, text, uuid) to authenticated;
grant execute on function public.doc_delete(uuid) to authenticated;

-- ---------- The private bucket ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760, array[
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "documents bucket: read what the table lets you read" on storage.objects;
create policy "documents bucket: read what the table lets you read" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and exists (select 1 from public.employee_documents d where d.storage_key = objects.name));

drop policy if exists "documents bucket: add to own folder or admin" on storage.objects;
create policy "documents bucket: add to own folder or admin" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (public.is_admin() or ((storage.foldername(name))[1] = auth.uid()::text and not public.is_viewer()))
  );

drop policy if exists "documents bucket: remove own or admin" on storage.objects;
create policy "documents bucket: remove own or admin" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and (public.is_admin() or ((storage.foldername(name))[1] = auth.uid()::text and not public.is_viewer()))
  );
