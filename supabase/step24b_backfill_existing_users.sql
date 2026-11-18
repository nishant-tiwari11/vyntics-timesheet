-- STEP 24b – run once in Supabase → SQL Editor, AFTER step24_access.sql. Safe to run again.
--
-- Why: step 24 only lets someone sign in if they are on the "allowed_users" list or use a Google account on a
-- company domain. People who already had an account before step 24 and are NOT on a company domain (for example a
-- Gmail address an admin had added earlier) were never copied to that list, so they were turned away with
-- "You don't have access". This adds them, keeping their current role, status and expiry.
-- Nobody already on the list is changed, and company-domain accounts are left alone (they need no entry).

insert into public.allowed_users (email, name, role, status, expires_on, login_method, seeded)
select
  lower(btrim(p.email)),
  nullif(btrim(coalesce(p.full_name, '')), ''),
  p.role,
  case when p.status = 'active' then 'active' else 'disabled' end,
  p.access_expires_on,
  case when coalesce(u.raw_app_meta_data ->> 'provider', 'google') = 'email' then 'password' else 'google' end,
  true
from public.profiles p
left join auth.users u on u.id = p.id
where p.email is not null
  and lower(btrim(p.email)) ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  and split_part(lower(btrim(p.email)), '@', 2)
      <> all (coalesce((select allowed_domains from public.access_settings where singleton), array['vyntics.com']))
on conflict (email) do nothing;

-- Check: everyone listed here has an entry now.
select p.email, p.role, p.status, a.login_method
from public.profiles p
left join public.allowed_users a on a.email = lower(btrim(p.email))
order by p.email;
