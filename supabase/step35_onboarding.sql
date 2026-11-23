-- STEP 35 – run once in Supabase → SQL Editor (after step26/27 documents and step24 access).
-- Employee onboarding: the new document categories, the bank / experience answers, and names taken from the work email.
-- Safe to run again.

-- ---------- 1. Document categories ----------
-- Old categories stay allowed (existing documents keep working); the app simply stops offering the ones HR no longer wants
-- (employment contract / NDA, address proof, ...). The new ones are what onboarding collects.
alter table public.employee_documents drop constraint if exists employee_documents_category_check;
alter table public.employee_documents add constraint employee_documents_category_check check (category in (
  'offer_letter', 'appointment_letter', 'contract_nda', 'id_proof', 'address_proof', 'education',
  'previous_employment', 'bank_details', 'salary_slips', 'other',
  'degree', 'marksheets', 'aadhaar', 'passport_photo', 'prev_offer_letter', 'prev_payslip'));

create or replace function public.doc_is_sensitive(p_category text) returns boolean
language sql immutable as $$ select p_category in ('id_proof', 'bank_details', 'salary_slips', 'aadhaar', 'prev_payslip') $$;

-- ---------- 2. Onboarding answers ----------
create table if not exists public.employee_onboarding (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  degree_mode text check (degree_mode in ('degree', 'marksheets')),
  bank_holder text check (bank_holder is null or char_length(bank_holder) <= 100),
  bank_name text check (bank_name is null or char_length(bank_name) <= 100),
  bank_account text check (bank_account is null or bank_account ~ '^[0-9]{6,20}$'),
  bank_ifsc text check (bank_ifsc is null or bank_ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  bank_branch text check (bank_branch is null or char_length(bank_branch) <= 100),
  bank_account_type text check (bank_account_type in ('savings', 'salary', 'current')),
  bank_confirmed boolean not null default false,
  has_experience boolean,
  experience_type text check (experience_type in ('free_internship', 'paid')),
  submitted_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.employee_onboarding enable row level security;

-- The person reads their own answers; admins read everyone's. Managers do not (bank details). Nobody writes directly.
drop policy if exists "onboarding: read own or admin" on public.employee_onboarding;
create policy "onboarding: read own or admin" on public.employee_onboarding
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- Save the answers (and optionally submit). Only the signed-in person, and only until they have submitted.
create or replace function public.onboarding_save(
  p_degree_mode text, p_holder text, p_bank text, p_account text, p_ifsc text, p_branch text, p_type text,
  p_confirmed boolean, p_has_exp boolean, p_exp_type text, p_submit boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  cur public.employee_onboarding;
begin
  select * into me from public.profiles where id = auth.uid() and status = 'active';
  if me.id is null then raise exception 'Please sign in again.'; end if;
  if me.role in ('viewer') then raise exception 'You have read-only access.'; end if;
  select * into cur from public.employee_onboarding where user_id = me.id;
  if cur.submitted_at is not null then raise exception 'Your onboarding is already submitted.'; end if;

  insert into public.employee_onboarding
    (user_id, degree_mode, bank_holder, bank_name, bank_account, bank_ifsc, bank_branch, bank_account_type,
     bank_confirmed, has_experience, experience_type, submitted_at, updated_at)
  values
    (me.id, nullif(p_degree_mode, ''), nullif(btrim(p_holder), ''), nullif(btrim(p_bank), ''), nullif(btrim(p_account), ''),
     nullif(upper(btrim(p_ifsc)), ''), nullif(btrim(p_branch), ''), nullif(p_type, ''), coalesce(p_confirmed, false),
     p_has_exp, nullif(p_exp_type, ''), case when p_submit then now() end, now())
  on conflict (user_id) do update set
    degree_mode = excluded.degree_mode, bank_holder = excluded.bank_holder, bank_name = excluded.bank_name,
    bank_account = excluded.bank_account, bank_ifsc = excluded.bank_ifsc, bank_branch = excluded.bank_branch,
    bank_account_type = excluded.bank_account_type, bank_confirmed = excluded.bank_confirmed,
    has_experience = excluded.has_experience, experience_type = excluded.experience_type,
    submitted_at = excluded.submitted_at, updated_at = now();
end $$;
grant execute on function public.onboarding_save(text, text, text, text, text, text, text, boolean, boolean, text, boolean) to authenticated;

-- An admin can open a submitted onboarding again (for example when something must be redone).
create or replace function public.onboarding_reopen(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only an admin can do this.'; end if;
  update public.employee_onboarding set submitted_at = null, updated_at = now() where user_id = p_user;
end $$;
grant execute on function public.onboarding_reopen(uuid) to authenticated;

-- ---------- 3. Names come from the work email ----------
-- ved.sharma@vyntics.com -> "Ved Sharma"; ved@vyntics.com -> "Ved". Other domains return null: an admin types the name.
-- NOTE: the domain is written here because the database can't read the app's constant (lib/companyEmail.ts).
create or replace function public.name_from_email(p_email text) returns text
language sql immutable as $$
  select case
    when lower(split_part(p_email, '@', 2)) <> 'vyntics.com' then null
    when position('.' in split_part(p_email, '@', 1)) > 0 then
      initcap(replace(split_part(split_part(p_email, '@', 1), '.', 1), '_', ' ')) || ' ' ||
      initcap(replace(substr(split_part(p_email, '@', 1), position('.' in split_part(p_email, '@', 1)) + 1), '.', ' '))
    else initcap(split_part(p_email, '@', 1))
  end $$;

-- Called right after sign-in: sets the signed-in person's name from their work email.
create or replace function public.profile_sync_name() returns void
language sql security definer set search_path = public as $$
  update public.profiles set full_name = public.name_from_email(email)
  where id = auth.uid() and public.name_from_email(email) is not null and full_name is distinct from public.name_from_email(email)
$$;
grant execute on function public.profile_sync_name() to authenticated;

-- An admin sets anyone's name (for people whose email isn't on the company domain).
create or replace function public.admin_set_name(p_user uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only an admin can do this.'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 100 then raise exception 'Enter a name of up to 100 characters.'; end if;
  update public.profiles set full_name = btrim(p_name) where id = p_user;
  update public.allowed_users set name = btrim(p_name) where lower(email) = (select lower(email) from public.profiles where id = p_user);
end $$;
grant execute on function public.admin_set_name(uuid, text) to authenticated;

-- People can no longer rename themselves (the name comes from the email or from an admin).
revoke update (full_name) on public.profiles from authenticated;

-- One-time: fix the names already on file.
update public.profiles set full_name = public.name_from_email(email)
where public.name_from_email(email) is not null and full_name is distinct from public.name_from_email(email);

-- OPTIONAL: people who joined before onboarding existed will be asked to do it at their next sign-in. To exempt them instead,
-- run this once:
--   insert into public.employee_onboarding (user_id, submitted_at) select id, now() from public.profiles on conflict do nothing;

-- ---------- 4. Reminders and notices now point at onboarding ----------
-- The weekly "documents missing" note was about the old required list; onboarding replaces it (the portal won't open until it
-- is done), so there is nothing to nudge about any more.
create or replace function public.docs_missing_count(p_user uuid) returns integer
language sql stable security definer set search_path = public as $$ select 0 $$;
revoke all on function public.docs_missing_count(uuid) from public, anon, authenticated;

-- Admin: remind one employee to finish onboarding (once a day per person).
create or replace function public.docs_send_reminder(p_user uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare me public.profiles; key text := 'nudge:' || public.portal_today();
begin
  select * into me from public.profiles where id = auth.uid() and status = 'active' and role = 'admin';
  if me.id is null then raise exception 'Only an admin can do that.'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'That person could not be found.'; end if;
  if exists (select 1 from public.employee_onboarding where user_id = p_user and submitted_at is not null) then
    raise exception 'That person has already submitted their onboarding.';
  end if;
  if exists (select 1 from public.notifications where user_id = p_user and dedupe_key = key) then return false; end if;
  perform public.notify(p_user, 'docs_missing', 'Please finish your onboarding',
    'HR is waiting for your documents and bank details.', '/timesheet/onboarding', key);
  return true;
end $$;
revoke all on function public.docs_send_reminder(uuid) from public, anon;
grant execute on function public.docs_send_reminder(uuid) to authenticated;

-- Verify or reject: the employee's notice opens the onboarding page, where a rejected file is replaced.
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
      '/timesheet/onboarding',
      'review:' || d.id || ':' || p_decision || ':' || extract(epoch from now())::bigint);
  end if;
end $$;
revoke all on function public.doc_review(uuid, text, text) from public, anon;
grant execute on function public.doc_review(uuid, text, text) to authenticated;
