-- STEP 28 – run once in Supabase → SQL Editor, AFTER step26_documents.sql. Safe to run again (run it again if you ran an
-- earlier version of this file: it only adds what is missing).
-- The offer letter template, managed by admins on Admin -> Documents -> Offer letter. One row per template. It is either
-- the editable wording (kind 'text') or the admin's own Word file with {{placeholders}} (kind 'docx'; the file itself lives
-- in the private documents bucket under templates/). Only admins can read or change any of it: letters are made on the server.

create table if not exists public.document_templates (
  id text primary key check (id in ('offer_letter')),
  body text not null check (char_length(body) between 20 and 6000),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.document_templates add column if not exists kind text not null default 'text' check (kind in ('text', 'docx'));
alter table public.document_templates add column if not exists file_key text check (file_key is null or file_key like 'templates/%');
alter table public.document_templates add column if not exists file_name text check (file_name is null or char_length(file_name) <= 200);

alter table public.document_templates enable row level security;

drop policy if exists "templates: admin reads" on public.document_templates;
create policy "templates: admin reads" on public.document_templates
  for select to authenticated using (public.is_admin());

drop policy if exists "templates: admin adds" on public.document_templates;
create policy "templates: admin adds" on public.document_templates
  for insert to authenticated with check (public.is_admin());

drop policy if exists "templates: admin changes" on public.document_templates;
create policy "templates: admin changes" on public.document_templates
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- The uploaded Word file: only an admin can read it. (Adding and removing is already limited to admins by step 26's rules.)
drop policy if exists "documents bucket: admin reads templates" on storage.objects;
create policy "documents bucket: admin reads templates" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = 'templates' and public.is_admin());

notify pgrst, 'reload schema';
