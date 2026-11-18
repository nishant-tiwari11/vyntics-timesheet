-- STEP 24c – run once in Supabase → SQL Editor, AFTER step24_access.sql. Safe to run again.
--
-- Why: access_after_login() decided HOW someone signed in from auth.users.raw_app_meta_data->>'provider'. Supabase
-- writes that once, when the account is first created, and never updates it. An account that was first created
-- another way (email, an invite, by hand) and later signed in with Google still says "email", so a company Google
-- account was turned away with "You don't have access". Now the provider is the identity that signed in most recently.

create or replace function public.access_after_login() returns text
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  prov text;
  reason text;
begin
  if auth.uid() is null then return 'not_allowed'; end if;
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then return 'not_allowed'; end if;

  select i.provider into prov
  from auth.identities i
  where i.user_id = p.id
  order by i.last_sign_in_at desc nulls last
  limit 1;
  if prov is null then
    select coalesce(raw_app_meta_data ->> 'provider', '') into prov from auth.users where id = p.id;
  end if;

  reason := public.access_is_allowed(p.email, prov);
  if reason <> 'ok' then return reason; end if;
  update public.profiles set last_login_at = now() where id = p.id;
  return 'ok';
end $$;

revoke all on function public.access_after_login() from public, anon;
grant execute on function public.access_after_login() to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- DIAGNOSTIC (optional, read-only). Put the email that is being turned away on the first line and run only this part.
-- ---------------------------------------------------------------------------------------------------------------
-- with q as (select lower('PUT.THE.EMAIL@vyntics.com') as e)
-- select 'profile' as what, p.id::text as id, p.email, p.role::text as a, p.status as b, p.access_expires_on::text as c
--   from public.profiles p, q where lower(p.email) = q.e
-- union all
-- select 'auth user', u.id::text, u.email, u.raw_app_meta_data ->> 'provider', u.raw_app_meta_data ->> 'providers', u.banned_until::text
--   from auth.users u, q where lower(u.email) = q.e
-- union all
-- select 'identity', i.user_id::text, i.identity_data ->> 'email', i.provider, i.last_sign_in_at::text, null
--   from auth.identities i, q where lower(i.identity_data ->> 'email') = q.e
-- union all
-- select 'allowed list', null, a.email, a.login_method, a.status, a.expires_on::text
--   from public.allowed_users a, q where a.email = q.e
-- union all
-- select 'verdict google', null, q.e, public.access_is_allowed(q.e, 'google'), null, null from q
-- union all
-- select 'verdict email', null, q.e, public.access_is_allowed(q.e, 'email'), null, null from q;
