-- STEP 36 – run once in Supabase → SQL Editor (after step17/18 comp-off and step20 payroll). Safe to run again.
-- Leave approvals: the ADMIN decides what kind of leave it is when approving (paid, comp-off or unpaid), and leave can be a
-- half day. Comp-off may go negative (leave taken before the credit is earned; later weekend or holiday work pays it back).

alter table public.requests add column if not exists day_part text not null default 'full'
  check (day_part in ('full', 'first_half', 'second_half'));
alter table public.requests add column if not exists leave_kind text
  check (leave_kind is null or leave_kind in ('paid', 'comp_off', 'unpaid'));

-- A half day is a single day.
alter table public.requests drop constraint if exists requests_half_day_single;
alter table public.requests add constraint requests_half_day_single check (day_part = 'full' or from_date = to_date);

-- Work-from-home never has a leave kind.
alter table public.requests drop constraint if exists requests_kind_only_leave;
alter table public.requests add constraint requests_kind_only_leave check (leave_kind is null or type = 'leave');

-- Leave that was already approved against comp-off keeps meaning exactly that.
update public.requests set leave_kind = 'comp_off' where comp_off = true and type = 'leave' and status = 'approved' and leave_kind is null;

create index if not exists requests_kind_idx on public.requests (user_id, leave_kind) where status = 'approved';
