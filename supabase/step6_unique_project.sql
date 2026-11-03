-- STEP 6 – run once in Supabase → SQL Editor.
-- A project can appear only once per week (case-insensitive). The page also checks this,
-- but the database is the final guard if two tabs race each other.

create unique index timesheet_rows_week_project_key
  on public.timesheet_rows (week_id, lower(project))
  where project <> '';
