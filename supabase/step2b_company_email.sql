-- STEP 2b – run once in Supabase → SQL Editor.
-- Server-side enforcement of the @vyntics.com rule. The browser check is only a courtesy:
-- anyone can call Supabase's sign-up API directly, so the database must refuse too.
-- When this raises, Supabase returns "Database error saving new user", which the
-- login form shows as "Only @vyntics.com email addresses can use this portal."
--
-- NOTE: the domain also appears here, because the database can't read the app's constant.
-- If it ever changes, update lib/companyEmail.ts AND this function.

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if lower(btrim(coalesce(new.email, ''))) !~ '^[^@[:space:]]+@vyntics\.com$' then
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
