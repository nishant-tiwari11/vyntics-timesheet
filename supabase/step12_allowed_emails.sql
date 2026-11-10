-- STEP 12 – run once in Supabase → SQL Editor, after the other files.
-- Only email addresses an admin has added in advance can create an account (Google or password).
--   * The very first account (the future admin) needs no invitation.
--   * Everyone who already has an account is added to the list automatically, so nobody is locked out.
--   * Admins manage the list in the portal: Admin → Access.
-- The rule lives in the database, so it cannot be skipped by calling Supabase's API directly.
-- When this refuses someone, Supabase reports "Database error saving new user".

create table public.allowed_emails (
  email      text primary key
             check (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@vyntics\.com$'),
  added_by   uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.allowed_emails enable row level security;

create policy "allowed: admins read" on public.allowed_emails
  for select to authenticated using (public.is_admin());
create policy "allowed: admins add" on public.allowed_emails
  for insert to authenticated with check (public.is_admin());
create policy "allowed: admins remove" on public.allowed_emails
  for delete to authenticated using (public.is_admin());

-- Everyone who already has an account stays allowed.
insert into public.allowed_emails (email)
select lower(btrim(email)) from public.profiles
on conflict do nothing;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(coalesce(new.email, '')));
begin
  if v_email !~ '^[^@[:space:]]+@vyntics\.com$' then
    raise exception 'Only @vyntics.com email addresses can use this portal.';
  end if;

  perform pg_advisory_xact_lock(7001);

  -- The first account needs no invitation. Everyone after that must be on the list.
  if exists (select 1 from public.profiles)
     and not exists (select 1 from public.allowed_emails where email = v_email) then
    raise exception 'This email has not been added by an admin.';
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name'),
    case when exists (select 1 from public.profiles) then 'employee'::public.user_role
         else 'admin'::public.user_role end
  );
  return new;
end $$;
