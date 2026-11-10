-- Step 16: holidays and festivals (run once in the Supabase SQL editor).
--
-- One row per holiday date. Everyone signed in can read; only admins add, change or delete.
--   public   : a day off for everyone (no timesheet hours needed, not counted as leave)
--   festival : a festival day, treated like a public holiday for hours and leave
--   optional : a holiday people may choose to take; it is shown on the calendar but is a normal working day
--
-- IMPORTANT: festival and religious dates move every year (they follow the lunar calendar and moon sightings).
-- The rows seeded below are a best-effort starting point for 2026, saved with reviewed = false.
-- An admin must check each date against the official company holiday list (Admin > Holidays) and mark it reviewed.

create table if not exists public.holidays (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  holiday_date date not null unique,
  type text not null check (type in ('public', 'optional', 'festival')),
  description text check (description is null or char_length(description) <= 500),
  year integer generated always as (extract(year from holiday_date)::integer) stored,
  reviewed boolean not null default false,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists holidays_year_idx on public.holidays (year, holiday_date);

alter table public.holidays enable row level security;

drop policy if exists "holidays: read" on public.holidays;
create policy "holidays: read" on public.holidays
  for select to authenticated using (true);

drop policy if exists "holidays: add" on public.holidays;
create policy "holidays: add" on public.holidays
  for insert to authenticated with check (public.is_admin());

drop policy if exists "holidays: change" on public.holidays;
create policy "holidays: change" on public.holidays
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "holidays: delete" on public.holidays;
create policy "holidays: delete" on public.holidays
  for delete to authenticated using (public.is_admin());

create or replace function public.guard_holiday_update() returns trigger
language plpgsql as $$
begin
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists guard_holiday_update on public.holidays;
create trigger guard_holiday_update
  before update on public.holidays
  for each row execute function public.guard_holiday_update();

-- ---------- Starter data: India, 2026 (NOT reviewed) ----------
insert into public.holidays (name, holiday_date, type, description) values
  ('Makar Sankranti / Pongal', '2026-01-14', 'festival', 'Harvest festival. Date is fixed by the solar calendar.'),
  ('Republic Day', '2026-01-26', 'public', 'National holiday.'),
  ('Maha Shivratri', '2026-02-15', 'festival', 'Lunar date. Check before use.'),
  ('Holi', '2026-03-04', 'public', 'Lunar date. Check before use.'),
  ('Ugadi / Gudi Padwa', '2026-03-19', 'optional', 'Lunar date. Check before use.'),
  ('Id-ul-Fitr (Eid)', '2026-03-21', 'public', 'Depends on moon sighting; may be a day earlier or later.'),
  ('Ram Navami', '2026-03-26', 'optional', 'Lunar date. Check before use.'),
  ('Mahavir Jayanti', '2026-03-31', 'optional', 'Lunar date. Check before use.'),
  ('Good Friday', '2026-04-03', 'public', 'Christian observance.'),
  ('Dr. Ambedkar Jayanti / Baisakhi', '2026-04-14', 'optional', 'Date is fixed.'),
  ('Buddha Purnima', '2026-05-01', 'optional', 'Lunar date. Check before use.'),
  ('Id-ul-Zuha (Bakrid)', '2026-05-27', 'public', 'Depends on moon sighting; may be a day earlier or later.'),
  ('Muharram', '2026-06-26', 'optional', 'Depends on moon sighting.'),
  ('Independence Day', '2026-08-15', 'public', 'National holiday.'),
  ('Id-e-Milad (Milad-un-Nabi)', '2026-08-26', 'optional', 'Depends on moon sighting.'),
  ('Raksha Bandhan', '2026-08-28', 'festival', 'Lunar date. Check before use.'),
  ('Janmashtami', '2026-09-04', 'optional', 'Lunar date. Check before use.'),
  ('Ganesh Chaturthi', '2026-09-14', 'festival', 'Lunar date. Check before use.'),
  ('Gandhi Jayanti', '2026-10-02', 'public', 'National holiday.'),
  ('Durga Puja (Maha Saptami)', '2026-10-17', 'optional', 'Lunar date. Check before use.'),
  ('Durga Puja (Maha Ashtami)', '2026-10-18', 'festival', 'Lunar date. Check before use.'),
  ('Durga Puja (Maha Navami)', '2026-10-19', 'festival', 'Lunar date. Check before use.'),
  ('Dussehra (Vijaya Dashami)', '2026-10-20', 'public', 'Lunar date. Check before use.'),
  ('Diwali (Lakshmi Puja)', '2026-11-08', 'public', 'Lunar date. Check before use.'),
  ('Bhai Dooj', '2026-11-11', 'optional', 'Lunar date. Check before use.'),
  ('Guru Nanak Jayanti', '2026-11-24', 'public', 'Lunar date. Check before use.'),
  ('Christmas', '2026-12-25', 'public', 'Date is fixed.')
on conflict (holiday_date) do nothing;
