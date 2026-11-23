-- STEP 38 – run once in Supabase → SQL Editor (after step35_onboarding.sql). Safe to run again.
-- An admin can skip onboarding for a particular person: they sign in and use the portal straight away. Kept by email, so it
-- works before the person has ever signed in (when adding them) and after.

create table if not exists public.onboarding_exemptions (
  email text primary key check (email = lower(email)),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.onboarding_exemptions enable row level security;
drop policy if exists "onboarding exemptions: admin reads" on public.onboarding_exemptions;
create policy "onboarding exemptions: admin reads" on public.onboarding_exemptions for select to authenticated using (public.is_admin());

-- Admin: skip (or require again) onboarding for one person.
create or replace function public.onboarding_skip(p_email text, p_skip boolean) returns void
language plpgsql security definer set search_path = public as $$
declare e text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.is_admin() then raise exception 'Only an admin can do this.'; end if;
  if e = '' then raise exception 'Enter an email address.'; end if;
  if coalesce(p_skip, false) then
    insert into public.onboarding_exemptions (email, created_by) values (e, auth.uid()) on conflict (email) do nothing;
  else
    delete from public.onboarding_exemptions where email = e;
  end if;
end $$;
revoke all on function public.onboarding_skip(text, boolean) from public, anon;
grant execute on function public.onboarding_skip(text, boolean) to authenticated;

-- Is the signed-in person exempt? (They can't read the table themselves.)
create or replace function public.onboarding_exempt() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.onboarding_exemptions x
    where x.email = lower((select email from public.profiles where id = auth.uid()))
  )
$$;
revoke all on function public.onboarding_exempt() from public, anon;
grant execute on function public.onboarding_exempt() to authenticated;

notify pgrst, 'reload schema';
