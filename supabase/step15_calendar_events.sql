-- Step 15: events for the Events calendar (run once in the Supabase SQL editor).
--
-- One table holds every event someone creates. Leave and WFH come from the existing `requests` table and
-- attendance from `work_logs`, so those are read from there and nothing is copied.
--
-- Who can see and change what (enforced here, by row level security, not only in the app):
--   personal : visible to and editable by its owner only (not even admins see it)
--   company, holiday, meeting, project : visible to everyone signed in, created/edited/deleted by admins only
--
-- Dates and times follow the same style as work_logs: plain dates and clock times in the office time zone.
-- A NULL start_time means an all-day event.

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  calendar text not null check (calendar in ('personal', 'company', 'holiday', 'meeting', 'project')),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (description is null or char_length(description) <= 2000),
  location text check (location is null or char_length(location) <= 200),
  meeting_link text check (meeting_link is null or (char_length(meeting_link) <= 500 and meeting_link ~* '^https?://')),
  color text not null default 'black' check (color in ('black', 'slate', 'gray', 'light', 'outline')),
  starts_on date not null,
  ends_on date not null,
  start_time time,
  end_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_events_dates_ok check (ends_on >= starts_on),
  constraint calendar_events_times_ok check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and (ends_on > starts_on or end_time > start_time))
  )
);

create index if not exists calendar_events_range_idx on public.calendar_events (starts_on, ends_on);
create index if not exists calendar_events_owner_idx on public.calendar_events (owner_id);

alter table public.calendar_events enable row level security;

drop policy if exists "events: read" on public.calendar_events;
create policy "events: read" on public.calendar_events
  for select to authenticated
  using (calendar <> 'personal' or owner_id = auth.uid());

drop policy if exists "events: create" on public.calendar_events;
create policy "events: create" on public.calendar_events
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and (calendar = 'personal' or public.is_admin())
  );

drop policy if exists "events: change" on public.calendar_events;
create policy "events: change" on public.calendar_events
  for update to authenticated
  using ((calendar = 'personal' and owner_id = auth.uid()) or (calendar <> 'personal' and public.is_admin()))
  with check ((calendar = 'personal' and owner_id = auth.uid()) or (calendar <> 'personal' and public.is_admin()));

drop policy if exists "events: delete" on public.calendar_events;
create policy "events: delete" on public.calendar_events
  for delete to authenticated
  using ((calendar = 'personal' and owner_id = auth.uid()) or (calendar <> 'personal' and public.is_admin()));

-- The owner never changes, and updated_at is kept honest.
create or replace function public.guard_event_update() returns trigger
language plpgsql as $$
begin
  new.owner_id := old.owner_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists guard_event_update on public.calendar_events;
create trigger guard_event_update
  before update on public.calendar_events
  for each row execute function public.guard_event_update();

-- Attendance is built from work logs, and admins can see everyone's logs already (existing policy).
-- Nothing to add for leave: approved rows in `requests` are readable by their owner and by admins.
