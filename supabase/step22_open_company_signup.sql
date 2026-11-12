-- STEP 22 – run once in Supabase → SQL Editor (after step13).
-- Anyone who signs in with a Google account ending in @vyntics.com gets an account, with no invitation needed.
-- Still enforced, in the database:
--   * Google sign-in only (no passwords, no other providers).
--   * The address must end in @vyntics.com. Google only issues those to people in your Google Workspace.
--   * The first account ever created is the admin; everyone after that is an employee.
-- The "allowed_emails" list and Admin -> Access are no longer needed to sign in (they do no harm).
-- To go back to invitation-only, run step13_google_only.sql again.

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(coalesce(new.email, '')));
begin
  if coalesce(new.raw_app_meta_data ->> 'provider', '') <> 'google' then
    raise exception 'Accounts can only be created with Google sign-in.';
  end if;

  if v_email !~ '^[^@[:space:]]+@vyntics\.com$' then
    raise exception 'Only @vyntics.com email addresses can use this portal.';
  end if;

  perform pg_advisory_xact_lock(7001);

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
