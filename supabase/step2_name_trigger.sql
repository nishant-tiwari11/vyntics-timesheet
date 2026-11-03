-- STEP 2 – run once in Supabase → SQL Editor (only if you already ran schema.sql in Step 1).
-- The signup form saves the person's name as user metadata "name"; this makes the
-- new-user trigger copy it into profiles.full_name. Behaviour is otherwise unchanged.

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
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

-- Optional: backfill the name for accounts you already created while testing.
update public.profiles p
set full_name = coalesce(u.raw_user_meta_data ->> 'name', u.raw_user_meta_data ->> 'full_name')
from auth.users u
where u.id = p.id and p.full_name is null;
