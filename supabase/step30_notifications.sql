-- STEP 30 – run once in Supabase → SQL Editor, AFTER step27_document_admin.sql. Safe to run again.
-- More things to tell people about. When a decision is made, the person it is about gets a notification (the bell in the top
-- bar), made by the database itself so it happens however the decision was saved:
--   * a leave / work-from-home / comp-off leave request is approved or rejected
--   * a time log is approved or rejected
--   * a comp-off request is approved or rejected
--   * an expense claim is approved, rejected or reimbursed
--   * a payslip is ready (or has been updated after a payroll run was reopened)
-- Each notification is made at most once for the same decision, and a problem making one can NEVER stop the decision itself
-- from being saved (the notification part is wrapped so any error is ignored).

create or replace function public.notify_request_decision() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  label text;
begin
  if old.status::text = 'pending' and new.status::text in ('approved', 'rejected') then
    begin
      label := case
        when coalesce((to_jsonb(new) ->> 'comp_off')::boolean, false) then 'Comp-off leave'
        when new.type::text = 'wfh' then 'Work from home'
        else 'Leave'
      end;
      perform public.notify(new.user_id, 'request', label || ' ' || new.status::text,
        to_char(new.from_date, 'DD Mon YYYY') || case when new.to_date <> new.from_date then ' to ' || to_char(new.to_date, 'DD Mon YYYY') else '' end
          || case when nullif(btrim(coalesce(new.admin_note, '')), '') is not null then '. ' || new.admin_note else '' end,
        '/timesheet/leave', 'request:' || new.id || ':' || new.status::text);
    exception when others then null;
    end;
  end if;
  return new;
end $$;

drop trigger if exists notify_request_decision on public.requests;
create trigger notify_request_decision after update of status on public.requests
  for each row when (old.status is distinct from new.status) execute function public.notify_request_decision();

create or replace function public.notify_log_decision() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status::text = 'pending' and new.status::text in ('approved', 'rejected') then
    begin
      perform public.notify(new.user_id, 'work_log', 'Time log ' || new.status::text,
        coalesce(nullif(new.project, ''), 'Time log') || ' on ' || to_char(new.log_date, 'DD Mon YYYY')
          || case when new.hours is not null then ' (' || trim(to_char(new.hours, 'FM990.00')) || ' h)' else '' end,
        '/timesheet/worklog', 'log:' || new.id || ':' || new.status::text);
    exception when others then null;
    end;
  end if;
  return new;
end $$;

drop trigger if exists notify_log_decision on public.work_logs;
create trigger notify_log_decision after update of status on public.work_logs
  for each row when (old.status is distinct from new.status) execute function public.notify_log_decision();

create or replace function public.notify_comp_off_decision() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'pending' and new.status in ('approved', 'rejected') then
    begin
      perform public.notify(new.user_id, 'comp_off', 'Comp-off ' || new.status,
        to_char(new.work_date, 'DD Mon YYYY')
          || case when new.status = 'approved' then ' (' || trim(to_char(new.credit, 'FM0.0')) || ' day)' else '' end
          || case when nullif(btrim(coalesce(new.admin_note, '')), '') is not null then '. ' || new.admin_note else '' end,
        '/timesheet/leave#comp-off', 'compoff:' || new.id || ':' || new.status);
    exception when others then null;
    end;
  end if;
  return new;
end $$;

drop trigger if exists notify_comp_off_decision on public.comp_off_requests;
create trigger notify_comp_off_decision after update of status on public.comp_off_requests
  for each row when (old.status is distinct from new.status) execute function public.notify_comp_off_decision();

create or replace function public.notify_expense_decision() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('approved', 'rejected', 'reimbursed') then
    begin
      perform public.notify(new.user_id, 'expense', 'Expense claim ' || new.status,
        'EXP-' || lpad(new.claim_no::text, 5, '0') || ': ' || left(new.description, 60)
          || case when new.status = 'approved' and new.approved_paise is not null then ' (approved INR ' || trim(to_char(new.approved_paise / 100.0, 'FM999999999990.00')) || ')' else '' end
          || case when new.status = 'rejected' and nullif(btrim(coalesce(new.decision_note, '')), '') is not null then '. ' || new.decision_note else '' end,
        '/timesheet/expenses', 'expense:' || new.id || ':' || new.status);
    exception when others then null;
    end;
  end if;
  return new;
end $$;

drop trigger if exists notify_expense_decision on public.expense_claims;
create trigger notify_expense_decision after update of status on public.expense_claims
  for each row when (old.status is distinct from new.status) execute function public.notify_expense_decision();

create or replace function public.notify_payslip_ready() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('finalized', 'paid') then
    begin
      perform public.notify(new.user_id, 'payslip',
        case when exists (select 1 from public.payslips p where p.user_id = new.user_id and p.period_start = new.period_start and p.id <> new.id)
             then 'Payslip updated' else 'Payslip ready' end,
        'Your payslip for ' || trim(to_char(new.period_start, 'FMMonth YYYY')) || ' is available in My Salary.',
        '/timesheet/salary', 'payslip:' || new.id);
    exception when others then null;
    end;
  end if;
  return new;
end $$;

drop trigger if exists notify_payslip_ready on public.payslips;
create trigger notify_payslip_ready after insert on public.payslips
  for each row execute function public.notify_payslip_ready();

notify pgrst, 'reload schema';
