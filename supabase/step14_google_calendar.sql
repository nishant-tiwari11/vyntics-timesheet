-- Step 14: Google Calendar connection (run once in the Supabase SQL editor).
--
-- Each employee can connect their Google Calendar. We keep only a refresh token, encrypted by the app
-- (AES-256-GCM, key in GOOGLE_TOKEN_ENCRYPTION_KEY) before it reaches the database, so the database never
-- holds a readable token. The tables below have row level security on and NO policies, and the browser
-- roles have no privileges on them: the only way in is through the functions at the bottom.
--
-- No service role key is used. An admin who approves a request can read the ENCRYPTED token of that
-- request's owner (only while the owner has a pending or approved request), which is what lets the
-- event land in the employee's calendar at approval time.

create table if not exists public.google_connections (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  token_ciphertext text not null,
  scope text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.request_google_events (
  request_id uuid primary key references public.requests (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_id text not null,
  created_at timestamptz not null default now()
);

alter table public.google_connections enable row level security;
alter table public.request_google_events enable row level security;
revoke all on public.google_connections from anon, authenticated;
revoke all on public.request_google_events from anon, authenticated;

-- Can the caller act on this person's Google connection? Yourself, or an admin while that person has a
-- pending or approved request.
create or replace function public.google_can_manage(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    p_user = auth.uid()
    or (
      public.is_admin()
      and exists (
        select 1 from public.requests r
        where r.user_id = p_user and r.status in ('pending', 'approved')
      )
    )
  )
$$;

-- Is the signed-in user connected?
create or replace function public.google_is_connected() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.google_connections where user_id = auth.uid())
$$;

-- Save (or replace) the signed-in user's encrypted token.
create or replace function public.google_save_connection(p_ciphertext text, p_scope text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;
  insert into public.google_connections (user_id, token_ciphertext, scope)
  values (auth.uid(), p_ciphertext, coalesce(p_scope, ''))
  on conflict (user_id) do update
    set token_ciphertext = excluded.token_ciphertext,
        scope = excluded.scope,
        updated_at = now();
end $$;

-- Read the encrypted token (still unreadable without the app's key).
create or replace function public.google_get_connection(p_user uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v text;
begin
  if not public.google_can_manage(p_user) then
    raise exception 'Not allowed.';
  end if;
  select token_ciphertext into v from public.google_connections where user_id = p_user;
  return v;
end $$;

-- Disconnect: yourself, or (when Google says the access was revoked) the person an admin is syncing for.
create or replace function public.google_delete_connection(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.google_can_manage(p_user) then
    raise exception 'Not allowed.';
  end if;
  delete from public.google_connections where user_id = p_user;
end $$;

-- The Google event that belongs to a request (so updates and deletes work and nothing is duplicated).
create or replace function public.google_get_event(p_request uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v text;
begin
  if not exists (
    select 1 from public.requests r where r.id = p_request and (r.user_id = auth.uid() or public.is_admin())
  ) then
    raise exception 'Not allowed.';
  end if;
  select event_id into v from public.request_google_events where request_id = p_request;
  return v;
end $$;

create or replace function public.google_set_event(p_request uuid, p_event text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from public.requests
  where id = p_request and (user_id = auth.uid() or public.is_admin());
  if v_owner is null then
    raise exception 'Not allowed.';
  end if;
  insert into public.request_google_events (request_id, user_id, event_id)
  values (p_request, v_owner, p_event)
  on conflict (request_id) do update set event_id = excluded.event_id;
end $$;

create or replace function public.google_clear_event(p_request uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.requests r where r.id = p_request and (r.user_id = auth.uid() or public.is_admin())
  ) then
    raise exception 'Not allowed.';
  end if;
  delete from public.request_google_events where request_id = p_request;
end $$;

-- Only signed-in users may call these (and each one checks who is calling).
revoke all on function public.google_can_manage(uuid) from public, anon;
revoke all on function public.google_is_connected() from public, anon;
revoke all on function public.google_save_connection(text, text) from public, anon;
revoke all on function public.google_get_connection(uuid) from public, anon;
revoke all on function public.google_delete_connection(uuid) from public, anon;
revoke all on function public.google_get_event(uuid) from public, anon;
revoke all on function public.google_set_event(uuid, text) from public, anon;
revoke all on function public.google_clear_event(uuid) from public, anon;
grant execute on function public.google_is_connected() to authenticated;
grant execute on function public.google_save_connection(text, text) to authenticated;
grant execute on function public.google_get_connection(uuid) to authenticated;
grant execute on function public.google_delete_connection(uuid) to authenticated;
grant execute on function public.google_get_event(uuid) to authenticated;
grant execute on function public.google_set_event(uuid, text) to authenticated;
grant execute on function public.google_clear_event(uuid) to authenticated;
