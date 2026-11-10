-- STEP 13 – run once in Supabase → SQL Editor, after step12.
-- New accounts can only be created by signing in with Google, and only with an @vyntics.com address
-- that an admin has added (Admin → Access). The very first account (the future admin) needs no invitation
-- but must also use Google. Existing accounts are not touched.
-- The rule lives in the database, so calling Supabase's sign-up API directly cannot skip it.
-- When this refuses someone, Supabase reports "Database error saving new user".

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
