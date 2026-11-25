-- STEP 43 – run once in Supabase → SQL Editor. Safe to run again.
-- A salary PIN for the employee's My Salary page. "Show amounts" asks for it, and the server only sends the money while the page is
-- unlocked (10 minutes after entering the PIN, or until the employee presses Hide amounts).
--   * The PIN is 4 to 6 digits, stored as a bcrypt hash (pgcrypto) in a table nobody can read directly: no policy, only the functions below.
--   * 5 wrong tries lock it for 15 minutes.
--   * Forgot the PIN? The employee enters their login password and chooses a new one.
-- Every function works on the signed-in person only (auth.uid()), so nobody can touch someone else's PIN.

create table if not exists public.salary_pins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pin_hash text not null,
  failed int not null default 0,
  locked_until timestamptz,
  unlocked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.salary_pins enable row level security; -- no policies: only the functions below can use it

-- 'none' (no PIN yet), 'locked' or 'open'
create or replace function public.salary_pin_state() returns text
language sql security definer stable set search_path = public as $$
  select coalesce((select case when unlocked_until > now() then 'open' else 'locked' end from public.salary_pins where user_id = auth.uid()), 'none');
$$;

-- Choose a PIN. If one exists already, the current PIN is needed too. Returns 'ok', 'wrong', 'locked' or 'invalid'.
create or replace function public.salary_pin_set(p_pin text, p_current text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  r public.salary_pins;
begin
  if me is null then raise exception 'Sign in first.'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then return 'invalid'; end if;
  select * into r from public.salary_pins where user_id = me for update;
  if r.user_id is null then
    insert into public.salary_pins (user_id, pin_hash, unlocked_until) values (me, extensions.crypt(p_pin, extensions.gen_salt('bf', 8)), now() + interval '10 minutes');
    return 'ok';
  end if;
  if r.locked_until is not null and r.locked_until > now() then return 'locked'; end if;
  if p_current is null or r.pin_hash <> extensions.crypt(p_current, r.pin_hash) then
    update public.salary_pins set failed = failed + 1, locked_until = case when failed + 1 >= 5 then now() + interval '15 minutes' else null end where user_id = me;
    return 'wrong';
  end if;
  update public.salary_pins set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 8)), failed = 0, locked_until = null, unlocked_until = now() + interval '10 minutes', updated_at = now() where user_id = me;
  return 'ok';
end $$;

-- Unlock with the PIN. Returns 'ok', 'wrong', 'locked' or 'none'.
create or replace function public.salary_pin_check(p_pin text) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  r public.salary_pins;
begin
  if me is null then raise exception 'Sign in first.'; end if;
  select * into r from public.salary_pins where user_id = me for update;
  if r.user_id is null then return 'none'; end if;
  if r.locked_until is not null and r.locked_until > now() then return 'locked'; end if;
  if p_pin is null or r.pin_hash <> extensions.crypt(p_pin, r.pin_hash) then
    update public.salary_pins set failed = failed + 1, locked_until = case when failed + 1 >= 5 then now() + interval '15 minutes' else null end where user_id = me;
    return 'wrong';
  end if;
  update public.salary_pins set failed = 0, locked_until = null, unlocked_until = now() + interval '10 minutes' where user_id = me;
  return 'ok';
end $$;

-- Forgot the PIN: the login password proves who it is, then a new PIN is set. Returns 'ok', 'wrong', 'locked' or 'invalid'.
create or replace function public.salary_pin_reset(p_password text, p_pin text) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  r public.salary_pins;
  good boolean;
begin
  if me is null then raise exception 'Sign in first.'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then return 'invalid'; end if;
  select * into r from public.salary_pins where user_id = me for update;
  if r.user_id is not null and r.locked_until is not null and r.locked_until > now() then return 'locked'; end if;
  select (encrypted_password = extensions.crypt(coalesce(p_password, ''), encrypted_password)) into good from auth.users where id = me;
  if not coalesce(good, false) then
    if r.user_id is not null then
      update public.salary_pins set failed = failed + 1, locked_until = case when failed + 1 >= 5 then now() + interval '15 minutes' else null end where user_id = me;
    end if;
    return 'wrong';
  end if;
  insert into public.salary_pins (user_id, pin_hash, unlocked_until) values (me, extensions.crypt(p_pin, extensions.gen_salt('bf', 8)), now() + interval '10 minutes')
  on conflict (user_id) do update set pin_hash = excluded.pin_hash, failed = 0, locked_until = null, unlocked_until = excluded.unlocked_until, updated_at = now();
  return 'ok';
end $$;

-- Hide amounts again right away.
create or replace function public.salary_pin_lock() returns void
language sql security definer set search_path = public as $$
  update public.salary_pins set unlocked_until = now() where user_id = auth.uid();
$$;

revoke all on function public.salary_pin_state() from public, anon;
revoke all on function public.salary_pin_set(text, text) from public, anon;
revoke all on function public.salary_pin_check(text) from public, anon;
revoke all on function public.salary_pin_reset(text, text) from public, anon;
revoke all on function public.salary_pin_lock() from public, anon;
grant execute on function public.salary_pin_state() to authenticated;
grant execute on function public.salary_pin_set(text, text) to authenticated;
grant execute on function public.salary_pin_check(text) to authenticated;
grant execute on function public.salary_pin_reset(text, text) to authenticated;
grant execute on function public.salary_pin_lock() to authenticated;
