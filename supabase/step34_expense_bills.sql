-- STEP 34 – run once in Supabase → SQL Editor, AFTER step23_expenses.sql and step26_documents.sql. Safe to run again.
-- Bills (receipts) for expense claims: a photo or PDF attached to a claim.
--   * Files live in a PRIVATE storage bucket, "expense-bills", under "<owner id>/<random id>.<ext>". The real file name is only
--     kept in the table.
--   * The owner can add, see and remove bills while the claim is a draft or waiting for approval. After a decision the bills are
--     locked (they are the evidence for what was paid).
--   * Admins can see every bill (to approve the claim). Nobody else can.
--   * Reading a bill goes through a short-lived signed link made by the server after these rules have said yes.

create table if not exists public.expense_bills (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.expense_claims (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  storage_key text not null unique,
  original_filename text not null check (char_length(original_filename) between 1 and 160),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 8388608),
  created_at timestamptz not null default now()
);
create index if not exists expense_bills_claim_idx on public.expense_bills (claim_id);

alter table public.expense_bills enable row level security;

drop policy if exists "expense bills: own or admin read" on public.expense_bills;
create policy "expense bills: own or admin read" on public.expense_bills for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Add a bill to your own claim while it is a draft or pending, at most 5 per claim.
drop policy if exists "expense bills: own add while open" on public.expense_bills;
create policy "expense bills: own add while open" on public.expense_bills for insert to authenticated
  with check (
    user_id = auth.uid()
    and not public.is_viewer()
    and exists (select 1 from public.expense_claims c where c.id = claim_id and c.user_id = auth.uid() and c.status in ('draft', 'pending'))
    and (select count(*) from public.expense_bills b where b.claim_id = expense_bills.claim_id) < 5
  );

drop policy if exists "expense bills: own remove while open" on public.expense_bills;
create policy "expense bills: own remove while open" on public.expense_bills for delete to authenticated
  using (
    user_id = auth.uid()
    and not public.is_viewer()
    and exists (select 1 from public.expense_claims c where c.id = claim_id and c.user_id = auth.uid() and c.status in ('draft', 'pending'))
  );

-- ---------- The private bucket ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expense-bills', 'expense-bills', false, 8388608, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "expense bills bucket: read what the table lets you read" on storage.objects;
create policy "expense bills bucket: read what the table lets you read" on storage.objects
  for select to authenticated
  using (bucket_id = 'expense-bills' and exists (select 1 from public.expense_bills b where b.storage_key = objects.name));

drop policy if exists "expense bills bucket: add to own folder" on storage.objects;
create policy "expense bills bucket: add to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'expense-bills' and (storage.foldername(name))[1] = auth.uid()::text and not public.is_viewer());

drop policy if exists "expense bills bucket: remove from own folder" on storage.objects;
create policy "expense bills bucket: remove from own folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'expense-bills' and (storage.foldername(name))[1] = auth.uid()::text and not public.is_viewer());

notify pgrst, 'reload schema';
