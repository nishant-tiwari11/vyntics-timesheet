-- Run after step45. Every fixture and account change is rolled back.
begin;
do $$
declare admin_id uuid; e text:='lifecycle-'||gen_random_uuid()::text||'@example.test'; u uuid; category uuid; w uuid;
begin
  select id into admin_id from public.profiles where role='admin' and status='active' and removed_at is null limit 1;
  if admin_id is null then raise exception 'Test requires an active admin'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  perform public.access_create_password_user(e,'Lifecycle Test','employee','Lifecycle-test-only-123!',null);
  select id into u from public.profiles where email=e;
  if u is null then raise exception 'Fixture account was not created'; end if;
  perform set_config('lifecycle.test_email',e,true);
  perform set_config('lifecycle.test_user',u::text,true);
  insert into public.work_logs(user_id,log_date,content,hours,start_time,end_time,project)
  values(u,public.portal_today(),'Lifecycle fixture',1,'09:00','10:00','');
  insert into public.duty_logs(user_id,duty_date,started_at,location) values(u,public.portal_today(),now()-interval '1 hour','office');
  insert into public.employee_details(user_id,joined_on,department) values(u,public.portal_today()-30,'Lifecycle fixture') on conflict(user_id) do update set department='Lifecycle fixture';
  insert into public.salary_structures(user_id,effective_from,basic_paise) values(u,public.portal_today()-30,1000000);
  insert into public.requests(user_id,type,from_date,to_date,reason) values(u,'wfh',public.portal_today()+7,public.portal_today()+7,'Lifecycle fixture');
  insert into public.timesheet_weeks(user_id,week_start) values(u,date_trunc('week',public.portal_today())::date) returning id into w;
  insert into public.timesheet_rows(week_id,project,position,mon) values(w,'Lifecycle fixture',0,1);
  insert into public.employee_documents(user_id,category,name,original_filename,storage_key,mime_type,size_bytes)
  values(u,'id_proof','Lifecycle fixture','fixture.pdf',u::text||'/lifecycle-test','application/pdf',1);
  select id into category from public.expense_categories limit 1;
  if category is null then insert into public.expense_categories(name) values('Lifecycle fixture') returning id into category; end if;
  insert into public.expense_claims(user_id,category_id,expense_date,description,claimed_paise)
  values(u,category,public.portal_today(),'Lifecycle fixture',10000);
end $$;
set local role authenticated;
do $$
declare e text:=current_setting('lifecycle.test_email'); u uuid:=current_setting('lifecycle.test_user')::uuid;
begin
  perform public.access_archive_user(e);
  if not exists(select 1 from public.profiles where id=u and removed_at is not null and status='disabled') then raise exception 'Remove did not archive account'; end if;
  if exists(select 1 from public.work_logs where user_id=u) then raise exception 'Removed time logs leaked'; end if;
  if exists(select 1 from public.timesheet_rows where week_id in(select id from public.timesheet_weeks where user_id=u)) then raise exception 'Removed weekly rows leaked'; end if;
  if exists(select 1 from public.employee_documents where user_id=u) then raise exception 'Removed documents leaked'; end if;
  if (select count(*) from public.expense_claims where user_id=u)<>1 then raise exception 'Removal hid expenses'; end if;
  begin
    perform public.access_update_user(e,null,'active',null,false);
    raise exception 'Enable bypassed restoration';
  exception when others then
    if sqlerrm='Enable bypassed restoration' then raise; end if;
  end;
  perform public.access_restore_user(e,'retrieve');
  if (select count(*) from public.work_logs where user_id=u)<>1 then raise exception 'Retrieve did not restore logs'; end if;
  if (select count(*) from public.requests where user_id=u)<>1 then raise exception 'Retrieve did not restore requests'; end if;
  if (select count(*) from public.employee_documents where user_id=u)<>1 then raise exception 'Retrieve did not restore documents'; end if;
  if exists(select 1 from public.duty_logs where user_id=u and ended_at is null) then raise exception 'Duty kept accruing while removed'; end if;
  perform public.access_archive_user(e);
  perform public.access_restore_user(e,'fresh');
  if exists(select 1 from public.work_logs where user_id=u) then raise exception 'Fresh start retained working logs'; end if;
  if exists(select 1 from public.duty_logs where user_id=u) then raise exception 'Fresh start retained duty logs'; end if;
  if exists(select 1 from public.requests where user_id=u) then raise exception 'Fresh start retained requests'; end if;
  if exists(select 1 from public.timesheet_weeks where user_id=u) then raise exception 'Fresh start retained weekly timesheets'; end if;
  if (select count(*) from public.salary_structures where user_id=u)<>1 then raise exception 'Fresh start changed financial salary history'; end if;
  if (select count(*) from public.employee_activity_archive where user_id=u and table_name='work_logs')<>1 then raise exception 'Fresh start lost archived logs'; end if;
  if (select count(*) from public.employee_activity_archive where user_id=u and table_name='timesheet_rows')<>1 then raise exception 'Fresh start lost archived weekly rows'; end if;
  if (select count(*) from public.employee_documents where user_id=u)<>1 then raise exception 'Fresh start lost documents'; end if;
  if (select count(*) from public.expense_claims where user_id=u)<>1 then raise exception 'Fresh start changed expenses'; end if;
  if not exists(select 1 from public.profiles where id=u and removed_at is null and status='active') then raise exception 'Restored account is not active'; end if;
end $$;
reset role;
select 'Employee lifecycle tests passed' as result;
rollback;
