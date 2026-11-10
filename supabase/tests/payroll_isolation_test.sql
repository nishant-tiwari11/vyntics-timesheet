-- Run in the Supabase SQL editor AFTER step21_payroll_runs.sql. It changes nothing: it always ends by raising an error
-- that rolls everything back, and the error message is the test report.
--
-- It creates two payslips (one for an employee, one for an admin acting as "someone else"), then checks, as the employee,
-- that only their own payslip is visible and that nothing of anyone else's can be read, changed or queried.

do $$
declare
  adm uuid;
  emp uuid;
  run uuid;
  emp_slip uuid;
  adm_slip uuid;
  out text := '';
  n int;
begin
  select id into adm from public.profiles where role = 'admin' order by created_at limit 1;
  select id into emp from public.profiles where role = 'employee' order by created_at limit 1;
  if adm is null or emp is null then
    raise exception 'This test needs one admin and one employee in profiles.';
  end if;

  insert into public.payroll_runs (period_start, period_end, status, finalized_at)
    values (date '2099-01-01', date '2099-01-31', 'finalized', now()) returning id into run;
  insert into public.payslips (run_id, user_id, period_start, period_end, gross_paise, deductions_paise, net_paise, payable_days, lop_days, currency, snapshot)
    values (run, emp, date '2099-01-01', date '2099-01-31', 5000000, 400000, 4600000, 31, 0, 'INR', '{}'::jsonb) returning id into emp_slip;
  insert into public.payslips (run_id, user_id, period_start, period_end, gross_paise, deductions_paise, net_paise, payable_days, lop_days, currency, snapshot)
    values (run, adm, date '2099-01-01', date '2099-01-31', 9000000, 700000, 8300000, 31, 0, 'INR', '{}'::jsonb) returning id into adm_slip;

  -- ===== as the EMPLOYEE =====
  perform set_config('request.jwt.claims', json_build_object('sub', emp, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into n from public.payslips;
  out := out || 'employee sees ' || n || ' payslip(s) in total => expect 1' || E'\n';
  select count(*) into n from public.payslips where user_id = adm;
  out := out || 'employee asks for the admin''s payslip by user id => sees ' || n || ' => expect 0' || E'\n';
  select count(*) into n from public.payslips where id = adm_slip;
  out := out || 'employee asks for the admin''s payslip by its id => sees ' || n || ' => expect 0' || E'\n';
  select count(*) into n from public.payroll_runs;
  out := out || 'employee reads payroll runs => sees ' || n || ' => expect 0' || E'\n';
  select count(*) into n from public.payroll_adjustments;
  out := out || 'employee reads adjustments => sees ' || n || ' => expect 0' || E'\n';
  select count(*) into n from public.salary_structures;
  out := out || 'employee reads salary structures (setting off) => sees ' || n || ' => expect 0' || E'\n';

  begin
    update public.payslips set net_paise = 99999999 where id = emp_slip;
    get diagnostics n = row_count;
    out := out || 'employee edits their own payslip => changed ' || n || ' row(s) => expect 0' || E'\n';
  exception when others then out := out || 'employee edits their own payslip => ' || sqlerrm || E' => expect an error or 0 rows\n'; end;

  begin
    insert into public.payslips (run_id, user_id, period_start, period_end, gross_paise, deductions_paise, net_paise, payable_days, lop_days, currency, snapshot)
      values (run, emp, date '2099-02-01', date '2099-02-28', 1, 0, 1, 1, 0, 'INR', '{}'::jsonb);
    out := out || 'employee creates a payslip => OK (UNEXPECTED)' || E'\n';
  exception when others then out := out || 'employee creates a payslip => refused: ' || sqlerrm || E'\n'; end;

  begin
    perform public.payroll_log_self('viewed_payslip', adm_slip);
    out := out || 'employee logs a view of the admin''s payslip => OK (UNEXPECTED)' || E'\n';
  exception when others then out := out || 'employee logs a view of the admin''s payslip => refused: ' || sqlerrm || E'\n'; end;

  begin
    insert into public.payroll_queries (user_id, payslip_id, topic, message) values (emp, adm_slip, 'x', 'about someone else');
    out := out || 'employee raises a query on the admin''s payslip => OK (UNEXPECTED)' || E'\n';
  exception when others then out := out || 'employee raises a query on the admin''s payslip => refused: ' || sqlerrm || E'\n'; end;

  begin
    insert into public.payroll_queries (user_id, payslip_id, topic, message) values (emp, emp_slip, 'x', 'about my own');
    out := out || 'employee raises a query on their own payslip => OK' || E'\n';
  exception when others then out := out || 'employee raises a query on their own payslip => refused (UNEXPECTED): ' || sqlerrm || E'\n'; end;

  begin
    perform public.payroll_finalize_run(run, '[]'::jsonb);
    out := out || 'employee runs finalize => OK (UNEXPECTED)' || E'\n';
  exception when others then out := out || 'employee runs finalize => refused: ' || sqlerrm || E'\n'; end;

  execute 'reset role';

  -- ===== as the ADMIN =====
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.payslips;
  out := out || 'admin sees ' || n || ' payslip(s) in total => expect at least 2' || E'\n';
  execute 'reset role';

  raise exception E'RESULTS (rolled back, nothing was saved):\n%', out;
end $$;
