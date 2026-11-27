-- STEP 44 – run once in Supabase → SQL Editor, after step 43. Safe to run again.
-- Remembers how many digits each person's salary PIN has (4 to 6), so the PIN box on My Salary can show exactly that many boxes.
--   * Only the LENGTH is stored, never the PIN. The PIN itself stays a bcrypt hash.
--   * People who already have a PIN: the length is recorded the next time they enter it correctly. Until then the box shows six.
-- salary_pin_length() works on the signed-in person only (auth.uid()), like the other functions.

alter table public.salary_pins add column if not exists pin_length smallint check (pin_length between 4 and 6);

create or replace function public.salary_pin_length() returns int
language sql security definer stable set search_path = public as $$
  select pin_length::int from public.salary_pins where user_id = auth.uid();
$$;

-- Choose a PIN (as in step 43, now also remembering its length).
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
    insert into public.salary_pins (user_id, pin_hash, pin_length, unlocked_until) values (me, extensions.crypt(p_pin, extensions.gen_salt('bf', 8)), length(p_pin), now() + interval '10 minutes');
    return 'ok';
  end if;
  if r.locked_until is not null and r.locked_until > now() then return 'locked'; end if;
  if p_current is null or r.pin_hash <> extensions.crypt(p_current, r.pin_hash) then
    update public.salary_pins set failed = failed + 1, locked_until = case when failed + 1 >= 5 then now() + interval '15 minutes' else null end where user_id = me;
    return 'wrong';
  end if;
  update public.salary_pins set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 8)), pin_length = length(p_pin), failed = 0, locked_until = null, unlocked_until = now() + interval '10 minutes', updated_at = now() where user_id = me;
  return 'ok';
end $$;

-- Unlock with the PIN (as in step 43; a correct PIN also records its length for people who had set it before this step).
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
  update public.salary_pins set failed = 0, locked_until = null, unlocked_until = now() + interval '10 minutes', pin_length = length(p_pin) where user_id = me;
  return 'ok';
end $$;

-- Forgot the PIN (as in step 43, now also remembering the new PIN's length).
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
  insert into public.salary_pins (user_id, pin_hash, pin_length, unlocked_until) values (me, extensions.crypt(p_pin, extensions.gen_salt('bf', 8)), length(p_pin), now() + interval '10 minutes')
  on conflict (user_id) do update set pin_hash = excluded.pin_hash, pin_length = excluded.pin_length, failed = 0, locked_until = null, unlocked_until = excluded.unlocked_until, updated_at = now();
  return 'ok';
end $$;

revoke all on function public.salary_pin_length() from public, anon;
grant execute on function public.salary_pin_length() to authenticated;
