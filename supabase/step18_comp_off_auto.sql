-- Step 18: comp-off created automatically from time logs (run once, after step17_comp_off.sql).
--
-- When a time log is saved, changed or deleted, the database looks at that person's total hours for the day:
--   * Day is a weekend, public holiday or festival, the person has not opted out, and the hours reach the
--     half-day rule  ->  a PENDING comp-off request exists for the day (created if missing, updated if pending).
--   * Hours fall to zero / below the rule / the person opts out  ->  a pending request is cancelled.
--   * The request was already APPROVED and the credit would change  ->  it is flagged for re-approval with the
--     proposed hours and credit, and the approved credit stays untouched until an admin decides.
--   * A request for the day was already rejected  ->  no new one is created.
-- Doing this in the database (a trigger on work_logs) means every way of saving a log behaves the same.
-- A problem in this step never blocks saving the time log itself.

alter table public.work_logs add column if not exists no_comp_off boolean not null default false;

alter table public.comp_off_requests
  add column if not exists timesheet_entry_id uuid references public.work_logs (id) on delete set null,
  add column if not exists auto_created boolean not null default false,
  add column if not exists needs_reapproval boolean not null default false,
  add column if not exists proposed_hours numeric(4, 2),
  add column if not exists proposed_credit numeric(2, 1);

alter table public.comp_off_requests drop constraint if exists comp_off_proposed_credit_ok;
alter table public.comp_off_requests
  add constraint comp_off_proposed_credit_ok check (proposed_credit is null or proposed_credit in (0, 0.5, 1));

-- Half day / full day / nothing, from the admin's settings.
create or replace function public.comp_off_credit_for(h numeric) returns numeric
language sql stable security definer set search_path = public as $$
  select case
    when h >= s.full_day_hours then 1
    when h >= s.half_day_hours then 0.5
    else 0
  end
  from public.comp_off_settings s where s.id
$$;

-- Is this a day off (weekend, public holiday or festival)?
create or replace function public.is_day_off(d date) returns boolean
language sql stable security definer set search_path = public as $$
  select extract(isodow from d) in (6, 7)
    or exists (select 1 from public.holidays h where h.holiday_date = d and h.type in ('public', 'festival'))
$$;

-- ---------- Changes to a request: the earlier rules, plus the automatic updates from time logs ----------
create or replace function public.comp_off_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s public.comp_off_settings;
begin
  -- Automatic updates made by comp_off_sync / the re-approval function set this flag for the one transaction.
  if current_setting('app.comp_off_sync', true) = 'on' then
    if new.user_id is distinct from old.user_id or new.work_date is distinct from old.work_date then
      raise exception 'A comp-off request can''t move to another person or day.';
    end if;
    return new;
  end if;

  if new.user_id is distinct from old.user_id
     or new.work_date is distinct from old.work_date
     or new.hours_worked is distinct from old.hours_worked
     or new.credit is distinct from old.credit
     or new.reason is distinct from old.reason
     or new.created_at is distinct from old.created_at
     or new.timesheet_entry_id is distinct from old.timesheet_entry_id
     or new.auto_created is distinct from old.auto_created
     or new.needs_reapproval is distinct from old.needs_reapproval
     or new.proposed_hours is distinct from old.proposed_hours
     or new.proposed_credit is distinct from old.proposed_credit then
    raise exception 'A comp-off request can''t be edited. Cancel it and ask again.';
  end if;

  if new.status is distinct from old.status then
    if old.status <> 'pending' then
      raise exception 'Only a pending request can be decided or cancelled.';
    end if;
    if new.status = 'cancelled' then
      if old.user_id <> auth.uid() then
        raise exception 'Only the person who asked can cancel a request.';
      end if;
    elsif new.status in ('approved', 'rejected') then
      if not public.is_admin() then
        raise exception 'Only an admin can approve or reject.';
      end if;
      if old.user_id = auth.uid() then
        raise exception 'You cannot decide your own request.';
      end if;
      new.approved_by := auth.uid();
      new.approved_at := now();
      if new.status = 'approved' then
        select * into s from public.comp_off_settings where id;
        new.expires_on := public.portal_today() + s.expiry_days;
      else
        new.expires_on := null;
      end if;
    else
      raise exception 'That status isn''t allowed.';
    end if;
  else
    if new.admin_note is distinct from old.admin_note and not public.is_admin() then
      raise exception 'Only an admin can add a note.';
    end if;
    new.approved_by := old.approved_by;
    new.approved_at := old.approved_at;
    new.expires_on := old.expires_on;
  end if;
  return new;
end $$;

-- ---------- The automatic part ----------
create or replace function public.comp_off_sync(p_user uuid, p_date date) returns void
language plpgsql security definer set search_path = public as $$
declare
  s public.comp_off_settings;
  total numeric;
  opted_out boolean;
  entry uuid;
  want numeric;
  r public.comp_off_requests;
  other numeric;
begin
  perform set_config('app.comp_off_sync', 'on', true);
  select * into s from public.comp_off_settings where id;

  select coalesce(sum(hours), 0), coalesce(bool_or(no_comp_off), false), (array_agg(id order by created_at desc))[1]
    into total, opted_out, entry
  from public.work_logs
  where user_id = p_user and log_date = p_date and status <> 'rejected';

  -- What the day is worth: nothing unless it is a day off, hours count, and the person has not opted out.
  want := case when public.is_day_off(p_date) and not opted_out then public.comp_off_credit_for(total) else 0 end;

  select * into r from public.comp_off_requests
  where user_id = p_user and work_date = p_date and status in ('pending', 'approved')
  order by created_at desc limit 1;

  if r.id is null then
    -- Nothing yet: create one, unless it was already rejected for this day.
    if want > 0 and not exists (
      select 1 from public.comp_off_requests where user_id = p_user and work_date = p_date and status = 'rejected'
    ) then
      insert into public.comp_off_requests (user_id, work_date, hours_worked, reason, timesheet_entry_id, auto_created)
      values (p_user, p_date, total, 'Worked on a day off (from the timesheet).', entry, true);
    end if;

  elsif r.status = 'pending' then
    if want = 0 then
      update public.comp_off_requests set status = 'cancelled' where id = r.id;
    else
      -- Keep the monthly limit when a bigger day would push it over.
      select coalesce(sum(credit), 0) into other from public.comp_off_requests
      where user_id = p_user and id <> r.id and status in ('pending', 'approved')
        and date_trunc('month', work_date) = date_trunc('month', p_date);
      if s.monthly_cap = 0 or other + want <= s.monthly_cap or want <= r.credit then
        update public.comp_off_requests
          set hours_worked = total, credit = want, timesheet_entry_id = entry
          where id = r.id;
      end if;
    end if;

  else
    -- Already approved: never change the credit quietly. Flag it for an admin to approve again.
    if want <> r.credit then
      update public.comp_off_requests
        set needs_reapproval = true, proposed_hours = total, proposed_credit = want, timesheet_entry_id = entry
        where id = r.id;
    elsif r.needs_reapproval then
      update public.comp_off_requests
        set needs_reapproval = false, proposed_hours = null, proposed_credit = null
        where id = r.id;
    end if;
  end if;
end $$;

-- Run it after every change to a time log. A failure here is swallowed so the log is always saved.
create or replace function public.work_logs_comp_off() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if tg_op in ('INSERT', 'UPDATE') then
      perform public.comp_off_sync(new.user_id, new.log_date);
    end if;
    if tg_op = 'DELETE' or (tg_op = 'UPDATE' and (old.log_date <> new.log_date or old.user_id <> new.user_id)) then
      perform public.comp_off_sync(old.user_id, old.log_date);
    end if;
  exception when others then
    raise warning 'comp-off sync skipped: %', sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists work_logs_comp_off on public.work_logs;
create trigger work_logs_comp_off
  after insert or update or delete on public.work_logs
  for each row execute function public.work_logs_comp_off();

-- ---------- An admin decides a re-approval ----------
-- Approve: the proposed hours and credit replace the old ones (a proposed credit of 0 withdraws the comp-off).
-- Reject: the approved credit stays exactly as it was.
create or replace function public.comp_off_decide_reapproval(p_id uuid, p_approve boolean, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.comp_off_requests;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can decide this.';
  end if;
  select * into r from public.comp_off_requests where id = p_id for update;
  if r.id is null or r.status <> 'approved' or not r.needs_reapproval then
    raise exception 'That request no longer needs a decision. Please refresh.';
  end if;
  if r.user_id = auth.uid() then
    raise exception 'You cannot decide your own request.';
  end if;

  perform set_config('app.comp_off_sync', 'on', true);
  if p_approve then
    if r.proposed_credit = 0 then
      update public.comp_off_requests
        set status = 'cancelled', needs_reapproval = false, proposed_hours = null, proposed_credit = null,
            admin_note = nullif(left(btrim(coalesce(p_note, '')), 500), '')
        where id = r.id;
    else
      update public.comp_off_requests
        set hours_worked = r.proposed_hours, credit = r.proposed_credit, needs_reapproval = false,
            proposed_hours = null, proposed_credit = null, approved_by = auth.uid(), approved_at = now(),
            admin_note = nullif(left(btrim(coalesce(p_note, '')), 500), '')
        where id = r.id;
    end if;
  else
    update public.comp_off_requests
      set needs_reapproval = false, proposed_hours = null, proposed_credit = null,
          admin_note = nullif(left(btrim(coalesce(p_note, '')), 500), '')
      where id = r.id;
  end if;
end $$;

revoke all on function public.comp_off_decide_reapproval(uuid, boolean, text) from public, anon;
grant execute on function public.comp_off_decide_reapproval(uuid, boolean, text) to authenticated;
revoke all on function public.comp_off_sync(uuid, date) from public, anon, authenticated;
revoke all on function public.comp_off_credit_for(numeric) from public, anon;
revoke all on function public.is_day_off(date) from public, anon;
grant execute on function public.comp_off_credit_for(numeric) to authenticated;
grant execute on function public.is_day_off(date) to authenticated;
