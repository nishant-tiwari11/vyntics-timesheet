-- STEP 3 – run once in Supabase → SQL Editor.
-- reopenWeek() moves a SUBMITTED week back to draft. The Step 1 policy only let owners
-- update weeks that were already draft/sent_back, so that move was blocked.
-- After this, owners can update a week that is draft, sent_back or submitted, but can still
-- only set it to draft or submitted. Approved weeks stay locked, and nobody can self-approve.
-- Rows stay editable only while the week is draft/sent_back (week_is_open), so a submitted
-- week's hours are still locked.

drop policy "weeks: owner update while open" on public.timesheet_weeks;

create policy "weeks: owner update while open" on public.timesheet_weeks
  for update to authenticated
  using      (user_id = auth.uid() and status in ('draft', 'sent_back', 'submitted'))
  with check (user_id = auth.uid() and status in ('draft', 'submitted'));
