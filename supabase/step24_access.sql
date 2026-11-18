-- Step 24: who may sign in, roles, teams and the access audit log (run after step24a_roles.sql).
--
-- WHO MAY SIGN IN (checked in the database, so calling Supabase's API directly can't skip it)
--   1. Google sign-in with an email on a company domain (access_settings.allowed_domains; the app copies the
--      ALLOWED_DOMAINS environment variable here when you run `npm run seed:users`), OR
--   2. an email on the allowed_users list (added by an admin, or by the seed script), signing in the way that
--      entry says: "google" or "password".
--   Disabled and expired accounts can't sign in; disabling also ends their sessions.
--
-- ROLES   admin > manager > employee > viewer
--   * employee: their own data. manager: their own data plus read-only access to their direct reports'.
--   * viewer: read-only everywhere (writes are refused by restrictive policies on every table people write to).
--   * admin: everything an admin could already do.
--
-- PASSWORDS are stored as bcrypt hashes (pgcrypto), in Supabase's own auth.users table, never in our tables.
-- LOCKOUT: 5 wrong passwords lock that account for 15 minutes (and Supabase itself refuses the sign-in meanwhile).
-- AUDIT: every access change (who, what, when) goes to access_audit. Passwords and tokens are never written there.

-- ---------- Columns on profiles ----------
alter table public.profiles add column if not exists manager_id uuid references public.profiles (id) on delete set null;
alter table public.profiles add column if not exists status text not null default 'active' check (status in ('active', 'disabled'));
alter table public.profiles add column if not exists access_expires_on date;
alter table public.profiles add column if not exists last_login_at timestamptz;
-- People can still change only their own name (column-level grant from schema.sql); the new columns are admin-only.

-- ---------- Tables ----------
create table if not exists public.access_settings (
  singleton boolean primary key default true check (singleton),
  allowed_domains text[] not null default array['vyntics.com'],
  updated_at timestamptz not null default now()
);
insert into public.access_settings (singleton) values (true) on conflict do nothing;

create table if not exists public.allowed_users (
  email text primary key check (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  name text check (name is null or char_length(name) <= 100),
  role public.user_role not null default 'employee',
  status text not null default 'active' check (status in ('active', 'disabled')),
  expires_on date,
  login_method text not null default 'google' check (login_method in ('google', 'password')),
  seeded boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.access_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_email text not null default 'system',
  action text not null,
  target text,
  detail text check (detail is null or char_length(detail) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists access_audit_at_idx on public.access_audit (created_at desc);

create table if not exists public.login_attempts (
  id bigint generated always as identity primary key,
  email text not null,
  ip text,
  ok boolean not null,
  at timestamptz not null default now()
);
create index if not exists login_attempts_email_idx on public.login_attempts (email, at desc);
create index if not exists login_attempts_ip_idx on public.login_attempts (ip, at desc) where ip is not null;

alter table public.access_settings enable row level security;
alter table public.allowed_users enable row level security;
alter table public.access_audit enable row level security;
alter table public.login_attempts enable row level security;

drop policy if exists "access settings: admin read" on public.access_settings;
create policy "access settings: admin read" on public.access_settings for select to authenticated using (public.is_admin());
drop policy if exists "allowed users: admin read" on public.allowed_users;
create policy "allowed users: admin read" on public.allowed_users for select to authenticated using (public.is_admin());
drop policy if exists "access audit: admin read" on public.access_audit;
create policy "access audit: admin read" on public.access_audit for select to authenticated using (public.is_admin());
-- No write policies anywhere above, and none at all on login_attempts: only the functions below can change them.

-- ---------- Small helpers ----------
create or replace function public.access_caller_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
$$;

create or replace function public.access_audit_write(p_action text, p_target text, p_detail text) returns void
language sql security definer set search_path = public as $$
  insert into public.access_audit (actor_id, actor_email, action, target, detail)
  values (auth.uid(), coalesce((select email from public.profiles where id = auth.uid()), 'system'), p_action, p_target, left(p_detail, 300))
$$;

create or replace function public.access_norm_email(p_email text) returns text
language plpgsql immutable as $$
declare e text := lower(btrim(coalesce(p_email, '')));
begin
  if e !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(e) > 200 then
    raise exception 'Enter a valid email address.';
  end if;
  return e;
end $$;

create or replace function public.is_viewer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'viewer')
$$;

-- Is p_user one of MY direct reports (and am I a manager or an admin)?
create or replace function public.is_manager_of(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles t
    join public.profiles me on me.id = auth.uid()
    where t.id = p_user and t.manager_id = me.id and me.role in ('manager', 'admin') and me.status = 'active'
  )
$$;

-- ---------- The rule: may this email use the portal? Returns 'ok' or the reason. ----------
create or replace function public.access_is_allowed(p_email text, p_provider text) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  e text := lower(btrim(coalesce(p_email, '')));
  a public.allowed_users;
  p public.profiles;
  domains text[];
begin
  if e !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then return 'not_allowed'; end if;

  select * into p from public.profiles where lower(email) = e;
  if p.id is not null then
    if p.status <> 'active' then return 'disabled'; end if;
    if p.access_expires_on is not null and p.access_expires_on < public.portal_today() then return 'expired'; end if;
  end if;

  select * into a from public.allowed_users where email = e;
  if a.email is not null then
    if a.status <> 'active' then return 'disabled'; end if;
    if a.expires_on is not null and a.expires_on < public.portal_today() then return 'expired'; end if;
    if p_provider = 'email' and a.login_method <> 'password' then return 'not_allowed'; end if;
    if p_provider = 'google' and a.login_method <> 'google' then return 'not_allowed'; end if;
    return 'ok';
  end if;

  -- Not on the list: only a company-domain Google account.
  select allowed_domains into domains from public.access_settings where singleton;
  if p_provider = 'google' and split_part(e, '@', 2) = any (coalesce(domains, array['vyntics.com'])) then return 'ok'; end if;
  return 'not_allowed';
end $$;

-- ---------- New account -> profile (replaces the step 22 version) ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(coalesce(new.email, '')));
  v_provider text := coalesce(new.raw_app_meta_data ->> 'provider', '');
  v_reason text;
  a public.allowed_users;
begin
  if v_provider not in ('google', 'email') then
    raise exception 'Accounts can only be created with Google sign-in, or by an admin.';
  end if;
  v_reason := public.access_is_allowed(v_email, v_provider);
  if v_reason <> 'ok' then
    raise exception 'This email can''t use this portal (%).', v_reason;
  end if;

  perform pg_advisory_xact_lock(7001);
  select * into a from public.allowed_users where email = v_email;

  insert into public.profiles (id, email, full_name, role, access_expires_on)
  values (
    new.id,
    new.email,
    coalesce(nullif(btrim(coalesce(a.name, '')), ''), new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name'),
    case when a.email is not null then a.role
         when exists (select 1 from public.profiles) then 'employee'::public.user_role
         else 'admin'::public.user_role end,
    a.expires_on
  );
  return new;
end $$;

-- ---------- Keeping a person's Supabase account in step with their status ----------
create or replace function public.access_sync_account(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where lower(email) = p_email;
  if p.id is null then return; end if;
  if p.status <> 'active' or (p.access_expires_on is not null and p.access_expires_on < public.portal_today()) then
    update auth.users set banned_until = 'infinity' where id = p.id;
    delete from auth.sessions where user_id = p.id;
  else
    update auth.users set banned_until = null where id = p.id and banned_until is not null;
  end if;
end $$;

create or replace function public.access_active_admins_without(p_email text) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.profiles
  where role = 'admin' and status = 'active' and lower(email) <> p_email
$$;

-- ---------- Admin: add, change, remove ----------
-- Adds (or, with p_only_if_missing, only adds) a person to the allowed list. Never creates a Supabase account.
create or replace function public.access_add_user(
  p_email text, p_name text, p_role text, p_expires date, p_method text, p_seeded boolean, p_only_if_missing boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare
  e text;
  r public.user_role;
  existed boolean;
begin
  if not public.access_caller_ok() then raise exception 'Only an admin can do that.'; end if;
  e := public.access_norm_email(p_email);
  begin r := lower(coalesce(p_role, 'employee'))::public.user_role;
  exception when others then raise exception 'Choose a role: admin, manager, employee or viewer.'; end;
  if p_method not in ('google', 'password') then raise exception 'Choose how they sign in: google or password.'; end if;
  if p_expires is not null and p_expires < public.portal_today() then raise exception 'The expiry date can''t be in the past.'; end if;

  select exists (select 1 from public.allowed_users where email = e) into existed;
  if existed and p_only_if_missing then return; end if;

  insert into public.allowed_users (email, name, role, expires_on, login_method, seeded, created_by)
  values (e, nullif(btrim(coalesce(p_name, '')), ''), r, p_expires, p_method, coalesce(p_seeded, false), auth.uid())
  on conflict (email) do update
    set name = coalesce(excluded.name, public.allowed_users.name), role = excluded.role, expires_on = excluded.expires_on,
        login_method = excluded.login_method, updated_at = now();

  if exists (select 1 from public.profiles where lower(email) = e) then
    perform public.access_update_user(e, r::text, null, p_expires, p_expires is null);
  end if;
  perform public.access_audit_write(case when existed then 'user_updated' else 'user_added' end, e,
    'Role ' || r || ', sign-in ' || p_method || coalesce(', expires ' || p_expires::text, ''));
end $$;

-- Change role / status / expiry of someone already on the list and/or already signed in. NULL means "leave as is";
-- p_clear_expiry removes the expiry date.
create or replace function public.access_update_user(p_email text, p_role text, p_status text, p_expires date, p_clear_expiry boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  e text;
  r public.user_role;
  p public.profiles;
  a public.allowed_users;
  new_role public.user_role;
  new_status text;
begin
  if not public.access_caller_ok() then raise exception 'Only an admin can do that.'; end if;
  e := public.access_norm_email(p_email);
  if p_role is not null then
    begin r := lower(p_role)::public.user_role;
    exception when others then raise exception 'Choose a role: admin, manager, employee or viewer.'; end;
  end if;
  if p_status is not null and p_status not in ('active', 'disabled') then raise exception 'Choose active or disabled.'; end if;
  if p_expires is not null and p_expires < public.portal_today() then raise exception 'The expiry date can''t be in the past.'; end if;

  select * into p from public.profiles where lower(email) = e;
  select * into a from public.allowed_users where email = e;
  if p.id is null and a.email is null then raise exception 'That person isn''t on the list.'; end if;

  new_role := coalesce(r, p.role, a.role);
  new_status := coalesce(p_status, p.status, a.status);
  -- There must always be one active admin left.
  if p.id is not null and p.role = 'admin' and p.status = 'active' and (new_role <> 'admin' or new_status <> 'active')
     and public.access_active_admins_without(e) = 0 then
    raise exception 'There must be at least one active admin.';
  end if;

  if a.email is not null then
    update public.allowed_users
      set role = new_role, status = new_status,
          expires_on = case when p_clear_expiry then null else coalesce(p_expires, expires_on) end, updated_at = now()
      where email = e;
  end if;
  if p.id is not null then
    update public.profiles
      set role = new_role, status = new_status,
          access_expires_on = case when p_clear_expiry then null else coalesce(p_expires, access_expires_on) end
      where id = p.id;
    perform public.access_sync_account(e);
  end if;
  perform public.access_audit_write('user_changed', e,
    'Role ' || new_role || ', status ' || new_status || coalesce(', expires ' || p_expires::text, '') || case when p_clear_expiry then ', expiry removed' else '' end);
end $$;

-- Remove from the list. Someone who already has an account is disabled, not deleted: their timesheets, expenses
-- and payslips are kept.
create or replace function public.access_remove_user(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare
  e text;
  p public.profiles;
begin
  if not public.access_caller_ok() then raise exception 'Only an admin can do that.'; end if;
  e := public.access_norm_email(p_email);
  select * into p from public.profiles where lower(email) = e;
  if p.id is not null and p.id = auth.uid() then raise exception 'You can''t remove your own access.'; end if;
  if p.id is not null and p.role = 'admin' and p.status = 'active' and public.access_active_admins_without(e) = 0 then
    raise exception 'There must be at least one active admin.';
  end if;
  delete from public.allowed_users where email = e;
  if p.id is not null then
    update public.profiles set status = 'disabled' where id = p.id;
    perform public.access_sync_account(e);
  end if;
  perform public.access_audit_write('user_removed', e, case when p.id is not null then 'Removed from the list and disabled (data kept)' else 'Removed from the list' end);
end $$;

create or replace function public.access_set_manager(p_email text, p_manager_email text) returns void
language plpgsql security definer set search_path = public as $$
declare
  e text; m text; mid uuid; pid uuid; mrole public.user_role;
begin
  if not public.access_caller_ok() then raise exception 'Only an admin can do that.'; end if;
  e := public.access_norm_email(p_email);
  select id into pid from public.profiles where lower(email) = e;
  if pid is null then raise exception 'That person hasn''t signed in yet. Set their manager after their first sign-in.'; end if;
  if nullif(btrim(coalesce(p_manager_email, '')), '') is not null then
    m := public.access_norm_email(p_manager_email);
    select id, role into mid, mrole from public.profiles where lower(email) = m;
    if mid is null then raise exception 'That manager hasn''t signed in yet.'; end if;
    if mid = pid then raise exception 'A person can''t be their own manager.'; end if;
    if mrole not in ('manager', 'admin') then raise exception 'Choose someone whose role is manager or admin.'; end if;
  end if;
  update public.profiles set manager_id = mid where id = pid;
  perform public.access_audit_write('manager_set', e, 'Manager ' || coalesce(m, 'none'));
end $$;

-- ---------- Passwords (bcrypt, in Supabase's own auth table) ----------
create or replace function public.access_set_password(p_email text, p_password text) returns void
language plpgsql security definer set search_path = public as $$
declare e text; uid uuid;
begin
  if not public.access_caller_ok() then raise exception 'Only an admin can do that.'; end if;
  e := public.access_norm_email(p_email);
  if p_password is null or char_length(p_password) < 10 or char_length(p_password) > 72 then
    raise exception 'The password must be 10 to 72 characters.';
  end if;
  select id into uid from auth.users where lower(email) = e;
  if uid is null then raise exception 'That person has no password account.'; end if;
  if not exists (select 1 from public.allowed_users where email = e and login_method = 'password') then
    raise exception 'That person signs in with Google, not a password.';
  end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)), updated_at = now(), banned_until = null
    where id = uid;
  delete from auth.sessions where user_id = uid;
  delete from public.login_attempts where email = e;
  perform public.access_audit_write('password_reset', e, 'Password changed (the value is never recorded)');
  perform public.access_sync_account(e);
end $$;

-- Adds a person who signs in with an email and password. Creates the list entry and the Supabase account.
create or replace function public.access_create_password_user(p_email text, p_name text, p_role text, p_password text, p_expires date) returns void
language plpgsql security definer set search_path = public as $$
declare e text; uid uuid;
begin
  if not public.access_caller_ok() then raise exception 'Only an admin can do that.'; end if;
  e := public.access_norm_email(p_email);
  if p_password is null or char_length(p_password) < 10 or char_length(p_password) > 72 then
    raise exception 'The password must be 10 to 72 characters.';
  end if;
  if exists (select 1 from auth.identities where provider = 'google' and lower(coalesce(identity_data ->> 'email', '')) = e) then
    raise exception 'That person already signs in with Google.';
  end if;

  perform public.access_add_user(e, p_name, p_role, p_expires, 'password', false, false);

  select id into uid from auth.users where lower(email) = e;
  if uid is null then
    uid := gen_random_uuid();
    -- The empty-string token columns matter: Supabase Auth fails to read a user whose tokens are NULL.
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', e,
            extensions.crypt(p_password, extensions.gen_salt('bf', 10)), now(),
            '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('name', nullif(btrim(coalesce(p_name, '')), '')),
            now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', e, 'email_verified', true), 'email', now(), now(), now());
  else
    perform public.access_set_password(e, p_password);
  end if;
  perform public.access_audit_write('password_user_created', e, 'Password account created (the password is never recorded)');
end $$;

-- ---------- Sign-in bookkeeping ----------
-- Called right after a sign-in succeeds. 'ok' (and the time is recorded), or why this person must be turned away.
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
  select coalesce(raw_app_meta_data ->> 'provider', '') into prov from auth.users where id = p.id;
  reason := public.access_is_allowed(p.email, prov);
  if reason <> 'ok' then return reason; end if;
  update public.profiles set last_login_at = now() where id = p.id;
  return 'ok';
end $$;

-- Seconds this email (or this address) is still locked out for: 0 when not locked.
create or replace function public.access_login_locked(p_email text, p_ip text) returns integer
language plpgsql stable security definer set search_path = public as $$
declare
  e text := lower(btrim(coalesce(p_email, '')));
  last_ok timestamptz;
  fifth timestamptz;
  ip_fails integer := 0;
begin
  select max(at) into last_ok from public.login_attempts where email = e and ok;
  select at into fifth from public.login_attempts
    where email = e and not ok and at > now() - interval '15 minutes' and at > coalesce(last_ok, '-infinity')
    order by at desc offset 4 limit 1;
  if fifth is not null and fifth + interval '15 minutes' > now() then
    return ceil(extract(epoch from (fifth + interval '15 minutes' - now())))::integer;
  end if;
  if p_ip is not null then
    select count(*) into ip_fails from public.login_attempts where ip = p_ip and not ok and at > now() - interval '15 minutes';
    if ip_fails >= 30 then return 900; end if;
  end if;
  return 0;
end $$;

create or replace function public.access_login_failed(p_email text, p_ip text) returns integer
language plpgsql security definer set search_path = public as $$
declare
  e text := lower(left(btrim(coalesce(p_email, '')), 200));
  left_s integer;
begin
  if e = '' then return 0; end if;
  insert into public.login_attempts (email, ip, ok) values (e, left(p_ip, 64), false);
  left_s := public.access_login_locked(e, p_ip);
  if left_s > 0 then
    -- Supabase itself refuses this account too, so a direct call to its API can't get around the lock.
    update auth.users set banned_until = now() + (left_s || ' seconds')::interval
      where lower(email) = e and (banned_until is null or banned_until < now() + (left_s || ' seconds')::interval);
    if exists (select 1 from public.profiles where lower(email) = e) then
      insert into public.access_audit (actor_email, action, target, detail)
      values ('system', 'account_locked', e, 'Locked for 15 minutes after 5 wrong passwords');
    end if;
  end if;
  return left_s;
end $$;

create or replace function public.access_login_ok(p_email text, p_ip text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.login_attempts (email, ip, ok) values (lower(left(btrim(coalesce(p_email, '')), 200)), left(p_ip, 64), true);
  delete from public.login_attempts where at < now() - interval '30 days';
end $$;

-- ---------- Roles: read-only viewers, and managers reading their team ----------
do $$
declare t text;
begin
  -- A viewer can never write to anything people normally write to.
  foreach t in array array['work_logs', 'timesheet_weeks', 'timesheet_rows', 'requests', 'comp_off_requests', 'calendar_events', 'expense_claims', 'payroll_queries', 'profiles']
  loop
    execute format('drop policy if exists %I on public.%I', t || ': viewers can''t insert', t);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (not public.is_viewer())', t || ': viewers can''t insert', t);
    execute format('drop policy if exists %I on public.%I', t || ': viewers can''t update', t);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (not public.is_viewer())', t || ': viewers can''t update', t);
    execute format('drop policy if exists %I on public.%I', t || ': viewers can''t delete', t);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using (not public.is_viewer())', t || ': viewers can''t delete', t);
  end loop;
  -- A manager can read (not change) their direct reports' records.
  foreach t in array array['work_logs', 'timesheet_weeks', 'requests', 'comp_off_requests', 'expense_claims']
  loop
    execute format('drop policy if exists %I on public.%I', t || ': managers read team', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_manager_of(user_id))', t || ': managers read team', t);
  end loop;
end $$;

drop policy if exists "rows: managers read team" on public.timesheet_rows;
create policy "rows: managers read team" on public.timesheet_rows for select to authenticated
  using (exists (select 1 from public.timesheet_weeks w where w.id = week_id and public.is_manager_of(w.user_id)));

drop policy if exists "profiles: managers read team" on public.profiles;
create policy "profiles: managers read team" on public.profiles for select to authenticated using (public.is_manager_of(id));

-- Changing a role through the old Admin -> Employees button: keep the "one admin must remain" rule for every demotion.
create or replace function public.set_user_role(target uuid, new_role public.user_role) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change roles';
  end if;
  if new_role <> 'admin' and (select count(*) from public.profiles where role = 'admin' and status = 'active' and id <> target) = 0 then
    raise exception 'There must be at least one admin';
  end if;
  update public.profiles set role = new_role where id = target;
  perform public.access_audit_write('role_changed', (select email from public.profiles where id = target), 'Role ' || new_role);
end $$;

-- ---------- Who may call what ----------
revoke all on function public.access_caller_ok() from public, anon;
revoke all on function public.access_audit_write(text, text, text) from public, anon, authenticated;
revoke all on function public.access_norm_email(text) from public, anon;
revoke all on function public.access_is_allowed(text, text) from public, anon, authenticated;
revoke all on function public.access_sync_account(text) from public, anon, authenticated;
revoke all on function public.access_active_admins_without(text) from public, anon, authenticated;
revoke all on function public.access_add_user(text, text, text, date, text, boolean, boolean) from public, anon;
revoke all on function public.access_update_user(text, text, text, date, boolean) from public, anon;
revoke all on function public.access_remove_user(text) from public, anon;
revoke all on function public.access_set_manager(text, text) from public, anon;
revoke all on function public.access_set_password(text, text) from public, anon;
revoke all on function public.access_create_password_user(text, text, text, text, date) from public, anon;
revoke all on function public.access_after_login() from public, anon;
revoke all on function public.access_login_locked(text, text) from public;
revoke all on function public.access_login_failed(text, text) from public;
revoke all on function public.access_login_ok(text, text) from public;
revoke all on function public.is_viewer() from public, anon;
revoke all on function public.is_manager_of(uuid) from public, anon;

grant execute on function public.access_caller_ok() to authenticated, service_role;
grant execute on function public.access_add_user(text, text, text, date, text, boolean, boolean) to authenticated, service_role;
grant execute on function public.access_update_user(text, text, text, date, boolean) to authenticated, service_role;
grant execute on function public.access_remove_user(text) to authenticated, service_role;
grant execute on function public.access_set_manager(text, text) to authenticated, service_role;
grant execute on function public.access_set_password(text, text) to authenticated, service_role;
grant execute on function public.access_create_password_user(text, text, text, text, date) to authenticated, service_role;
grant execute on function public.access_after_login() to authenticated;
-- The lockout checks run before anyone is signed in, so the sign-in page (anon key) must be able to call them.
grant execute on function public.access_login_locked(text, text) to anon, authenticated, service_role;
grant execute on function public.access_login_failed(text, text) to anon, authenticated, service_role;
grant execute on function public.access_login_ok(text, text) to anon, authenticated, service_role;
grant execute on function public.is_viewer() to authenticated;
grant execute on function public.is_manager_of(uuid) to authenticated;
