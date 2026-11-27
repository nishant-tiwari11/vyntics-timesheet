-- STEP 45 – run once in Supabase → SQL Editor. Safe to run again.
-- Ticket Management, phase 1: raise a ticket, follow it, comment, change its status, assign it.
--
-- WHO CAN SEE A TICKET (enforced here in the database, not only on the page):
--   * the person who raised it, the person it is assigned to, and people who follow it;
--   * admins;
--   * support staff of the ticket's department (an admin marks them in ticket_support);
--   * a manager, for tickets raised by their direct reports, UNLESS the category is "sensitive" (HR and payroll by default).
--     Sensitive tickets are seen only by the raiser, the assignee, followers, department support staff and admins.
-- Every change goes through the functions below (there are no insert/update/delete policies), so each one is checked against the
-- workflow rules and written to the history.
--
-- WORKFLOW: open → assigned → in progress → pending review → resolved → closed. Also on hold and reopened.
--   Resolving needs resolution notes. Only the person who raised a ticket can confirm (close) or reopen it after it is resolved.

-- ---------- Lookups ----------
create table if not exists public.ticket_statuses (
  key text primary key,
  label text not null,
  sort int not null,
  is_final boolean not null default false
);
insert into public.ticket_statuses (key, label, sort, is_final) values
  ('open', 'Open', 1, false),
  ('assigned', 'Assigned', 2, false),
  ('in_progress', 'In progress', 3, false),
  ('on_hold', 'On hold', 4, false),
  ('pending_review', 'Pending review', 5, false),
  ('resolved', 'Resolved', 6, false),
  ('closed', 'Closed', 7, true),
  ('reopened', 'Reopened', 8, false)
on conflict (key) do nothing;

create table if not exists public.ticket_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 2 and 60),
  department text not null check (char_length(btrim(department)) between 2 and 60),
  sensitive boolean not null default false,
  active boolean not null default true,
  sort int not null default 0
);
insert into public.ticket_categories (name, department, sensitive, sort) values
  ('Timesheet Issues', 'HR', false, 1),
  ('Attendance Issues', 'HR', false, 2),
  ('HR Requests', 'HR', true, 3),
  ('IT Support', 'IT', false, 4),
  ('Payroll and Finance', 'Finance', true, 5),
  ('Project Management', 'Project Management', false, 6),
  ('Administration', 'Administration', false, 7),
  ('General Requests', 'Administration', false, 8)
on conflict (name) do nothing;

-- Support staff: people who handle the tickets of one department.
create table if not exists public.ticket_support (
  user_id uuid not null references public.profiles (id) on delete cascade,
  department text not null check (char_length(btrim(department)) between 2 and 60),
  primary key (user_id, department)
);

-- ---------- Tickets ----------
create sequence if not exists public.ticket_number_seq;

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  number bigint not null unique default nextval('public.ticket_number_seq'),
  raised_by uuid not null references public.profiles (id) on delete cascade,
  category_id uuid not null references public.ticket_categories (id),
  department text not null,
  subject text not null check (char_length(btrim(subject)) between 3 and 150),
  description text not null default '' check (char_length(description) <= 5000),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'open' references public.ticket_statuses (key),
  assignee_id uuid references public.profiles (id) on delete set null,
  due_on date,
  project text check (project is null or char_length(project) <= 120),
  work_log_id uuid references public.work_logs (id) on delete set null,
  resolution_notes text check (resolution_notes is null or char_length(resolution_notes) <= 2000),
  position double precision not null default extract(epoch from clock_timestamp()),   -- the order inside a board column (phase 2)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  closed_at timestamptz
);
create index if not exists tickets_raised_idx on public.tickets (raised_by, created_at desc);
create index if not exists tickets_assignee_idx on public.tickets (assignee_id) where assignee_id is not null;
create index if not exists tickets_dept_status_idx on public.tickets (department, status);
create index if not exists tickets_work_log_idx on public.tickets (work_log_id) where work_log_id is not null;

create table if not exists public.ticket_followers (
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (ticket_id, user_id)
);

create table if not exists public.ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 3000),
  internal boolean not null default false,          -- an internal note: only staff can read it
  created_at timestamptz not null default now()
);
create index if not exists ticket_comments_ticket_idx on public.ticket_comments (ticket_id, created_at);

create table if not exists public.ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  uploader_id uuid not null references public.profiles (id) on delete cascade,
  storage_key text not null unique,
  original_filename text not null check (char_length(original_filename) between 1 and 160),
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  is_screenshot boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ticket_attachments_ticket_idx on public.ticket_attachments (ticket_id);

create table if not exists public.ticket_subtasks (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 150),
  done boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ticket_subtasks_ticket_idx on public.ticket_subtasks (ticket_id);

create table if not exists public.ticket_status_history (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id uuid references public.profiles (id) on delete set null,
  note text check (note is null or char_length(note) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists ticket_status_history_idx on public.ticket_status_history (ticket_id, created_at);

create table if not exists public.ticket_activity_logs (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,                              -- created, status, assigned, edited, comment, attachment, follower, subtask
  detail text check (detail is null or char_length(detail) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists ticket_activity_idx on public.ticket_activity_logs (ticket_id, created_at);

-- ---------- Who can see and who can change ----------
create or replace function public.ticket_can_see_as(p_user uuid, p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.tickets t
    join public.ticket_categories c on c.id = t.category_id
    join public.profiles u on u.id = p_user and u.status = 'active'
    where t.id = p_id and (
      t.raised_by = p_user
      or t.assignee_id = p_user
      or u.role = 'admin'
      or exists (select 1 from public.ticket_support s where s.user_id = p_user and s.department = t.department)
      or exists (select 1 from public.ticket_followers f where f.ticket_id = t.id and f.user_id = p_user)
      or (not c.sensitive and u.role = 'manager' and exists (select 1 from public.profiles r where r.id = t.raised_by and r.manager_id = p_user))
    )
  )
$$;

-- Staff = may work on the ticket: change its status, assign it, add internal notes.
create or replace function public.ticket_is_staff_as(p_user uuid, p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.tickets t
    join public.ticket_categories c on c.id = t.category_id
    join public.profiles u on u.id = p_user and u.status = 'active'
    where t.id = p_id and (
      u.role = 'admin'
      or t.assignee_id = p_user
      or exists (select 1 from public.ticket_support s where s.user_id = p_user and s.department = t.department)
      or (not c.sensitive and u.role = 'manager' and exists (select 1 from public.profiles r where r.id = t.raised_by and r.manager_id = p_user))
    )
  )
$$;

create or replace function public.ticket_can_see(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$ select public.ticket_can_see_as(auth.uid(), p_id) $$;
create or replace function public.ticket_is_staff(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$ select public.ticket_is_staff_as(auth.uid(), p_id) $$;

alter table public.ticket_statuses enable row level security;
alter table public.ticket_categories enable row level security;
alter table public.ticket_support enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_followers enable row level security;
alter table public.ticket_comments enable row level security;
alter table public.ticket_attachments enable row level security;
alter table public.ticket_subtasks enable row level security;
alter table public.ticket_status_history enable row level security;
alter table public.ticket_activity_logs enable row level security;

drop policy if exists "ticket statuses: read" on public.ticket_statuses;
create policy "ticket statuses: read" on public.ticket_statuses for select to authenticated using (true);
drop policy if exists "ticket categories: read" on public.ticket_categories;
create policy "ticket categories: read" on public.ticket_categories for select to authenticated using (true);
drop policy if exists "ticket support: read own or admin" on public.ticket_support;
create policy "ticket support: read own or admin" on public.ticket_support for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists "tickets: read" on public.tickets;
create policy "tickets: read" on public.tickets for select to authenticated using (public.ticket_can_see(id));
drop policy if exists "ticket followers: read" on public.ticket_followers;
create policy "ticket followers: read" on public.ticket_followers for select to authenticated using (public.ticket_can_see(ticket_id));
drop policy if exists "ticket comments: read" on public.ticket_comments;
create policy "ticket comments: read" on public.ticket_comments for select to authenticated
  using (public.ticket_can_see(ticket_id) and (not internal or public.ticket_is_staff(ticket_id)));
drop policy if exists "ticket attachments: read" on public.ticket_attachments;
create policy "ticket attachments: read" on public.ticket_attachments for select to authenticated using (public.ticket_can_see(ticket_id));
drop policy if exists "ticket subtasks: read" on public.ticket_subtasks;
create policy "ticket subtasks: read" on public.ticket_subtasks for select to authenticated using (public.ticket_can_see(ticket_id));
drop policy if exists "ticket status history: read" on public.ticket_status_history;
create policy "ticket status history: read" on public.ticket_status_history for select to authenticated using (public.ticket_can_see(ticket_id));
drop policy if exists "ticket activity: read" on public.ticket_activity_logs;
create policy "ticket activity: read" on public.ticket_activity_logs for select to authenticated using (public.ticket_can_see(ticket_id));

grant select on public.ticket_statuses, public.ticket_categories, public.ticket_support, public.tickets, public.ticket_followers,
  public.ticket_comments, public.ticket_attachments, public.ticket_subtasks, public.ticket_status_history, public.ticket_activity_logs to authenticated;
grant all on public.ticket_statuses, public.ticket_categories, public.ticket_support, public.tickets, public.ticket_followers,
  public.ticket_comments, public.ticket_attachments, public.ticket_subtasks, public.ticket_status_history, public.ticket_activity_logs to service_role;
grant usage, select on sequence public.ticket_number_seq to service_role;

-- ---------- Small helpers ----------
create or replace function public.ticket_log(p_ticket uuid, p_action text, p_detail text) returns void
language sql security definer set search_path = public as $$
  insert into public.ticket_activity_logs (ticket_id, actor_id, action, detail) values (p_ticket, auth.uid(), p_action, left(p_detail, 500))
$$;

-- Tell someone about a ticket (the bell). Never the person who made the change.
create or replace function public.ticket_tell(p_ticket uuid, p_user uuid, p_title text, p_body text, p_event text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_user = auth.uid() then return; end if;
  if not public.ticket_can_see_as(p_user, p_ticket) then return; end if;
  perform public.notify(p_user, 'ticket', p_title, p_body, '/timesheet/tickets?t=' || p_ticket,
    'tk:' || p_ticket || ':' || p_event || ':' || extract(epoch from clock_timestamp())::bigint || ':' || substr(p_user::text, 1, 8));
end $$;

-- Tell the raiser, the assignee and the followers.
create or replace function public.ticket_tell_all(p_ticket uuid, p_title text, p_body text, p_event text) returns void
language plpgsql security definer set search_path = public as $$
declare t public.tickets; f uuid;
begin
  select * into t from public.tickets where id = p_ticket;
  if t.id is null then return; end if;
  perform public.ticket_tell(p_ticket, t.raised_by, p_title, p_body, p_event);
  perform public.ticket_tell(p_ticket, t.assignee_id, p_title, p_body, p_event);
  for f in select user_id from public.ticket_followers where ticket_id = p_ticket and user_id is distinct from t.raised_by and user_id is distinct from t.assignee_id loop
    perform public.ticket_tell(p_ticket, f, p_title, p_body, p_event);
  end loop;
end $$;

-- ---------- Raise a ticket ----------
create or replace function public.ticket_create(p_category uuid, p_subject text, p_description text, p_priority text, p_project text, p_work_log uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  cat public.ticket_categories;
  tid uuid;
  subj text := btrim(coalesce(p_subject, ''));
  descr text := coalesce(p_description, '');
  pr text := coalesce(nullif(btrim(coalesce(p_priority, '')), ''), 'medium');
  proj text := nullif(btrim(coalesce(p_project, '')), '');
  n bigint;
  s uuid;
  told boolean := false;
begin
  select * into me from public.profiles where id = auth.uid() and status = 'active' and role <> 'viewer';
  if me.id is null then raise exception 'You can''t raise tickets.'; end if;
  select * into cat from public.ticket_categories where id = p_category and active;
  if cat.id is null then raise exception 'Choose a category.'; end if;
  if char_length(subj) < 3 then raise exception 'Give the ticket a subject of at least 3 characters.'; end if;
  if char_length(subj) > 150 then raise exception 'Keep the subject to 150 characters or fewer.'; end if;
  if char_length(descr) > 5000 then raise exception 'Keep the description to 5000 characters or fewer.'; end if;
  if pr not in ('low', 'medium', 'high', 'urgent') then raise exception 'Choose a priority.'; end if;
  if proj is not null and char_length(proj) > 120 then raise exception 'That project name is too long.'; end if;
  if p_work_log is not null and not exists (select 1 from public.work_logs w where w.id = p_work_log and w.user_id = me.id) then
    raise exception 'That time log is not yours.';
  end if;

  insert into public.tickets (raised_by, category_id, department, subject, description, priority, project, work_log_id)
  values (me.id, cat.id, cat.department, subj, descr, pr, proj, p_work_log)
  returning id, number into tid, n;
  insert into public.ticket_followers (ticket_id, user_id) values (tid, me.id);
  insert into public.ticket_status_history (ticket_id, from_status, to_status, actor_id) values (tid, null, 'open', me.id);
  perform public.ticket_log(tid, 'created', cat.name || ' · ' || pr);

  -- The department's support staff hear about it; when nobody is marked yet, the admins do.
  for s in select user_id from public.ticket_support where department = cat.department loop
    perform public.ticket_tell(tid, s, 'New ticket', 'TCK-' || lpad(n::text, 5, '0') || ': ' || subj, 'new');
    told := true;
  end loop;
  if not told then
    for s in select id from public.profiles where role = 'admin' and status = 'active' loop
      perform public.ticket_tell(tid, s, 'New ticket', 'TCK-' || lpad(n::text, 5, '0') || ': ' || subj, 'new');
    end loop;
  end if;
  return tid;
end $$;

-- ---------- Status changes ----------
create or replace function public.ticket_set_status(p_id uuid, p_to text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  t public.tickets;
  staff boolean;
  raiser boolean;
  admin boolean;
  note text := nullif(btrim(coalesce(p_note, '')), '');
  ok boolean := false;
  by_raiser boolean := false;
  label text;
begin
  select * into me from public.profiles where id = auth.uid() and status = 'active' and role <> 'viewer';
  if me.id is null then raise exception 'You can''t change tickets.'; end if;
  select * into t from public.tickets where id = p_id for update;
  if t.id is null or not public.ticket_can_see(p_id) then raise exception 'That ticket could not be found.'; end if;
  if not exists (select 1 from public.ticket_statuses where key = p_to) then raise exception 'Choose a status.'; end if;
  if p_to = t.status then return; end if;
  if note is not null and char_length(note) > 2000 then raise exception 'Keep the note to 2000 characters or fewer.'; end if;

  staff := public.ticket_is_staff(p_id);
  raiser := t.raised_by = me.id;
  admin := me.role = 'admin';

  -- Moves only the person who raised the ticket makes: withdraw it, confirm the fix, or say it isn't fixed.
  if (t.status = 'open' and p_to = 'closed') or (t.status = 'resolved' and p_to in ('closed', 'reopened')) or (t.status = 'closed' and p_to = 'reopened') then
    by_raiser := true;
  end if;
  -- Every other allowed move (staff).
  ok := case t.status
    when 'open' then p_to in ('assigned', 'in_progress', 'on_hold')
    when 'assigned' then p_to in ('open', 'in_progress', 'on_hold')
    when 'in_progress' then p_to in ('assigned', 'on_hold', 'pending_review', 'resolved')
    when 'on_hold' then p_to in ('assigned', 'in_progress')
    when 'pending_review' then p_to in ('in_progress', 'resolved')
    when 'reopened' then p_to in ('assigned', 'in_progress', 'on_hold')
    when 'resolved' then false
    else false end;

  if by_raiser and (raiser or admin or (staff and t.status = 'resolved' and p_to = 'closed')) then
    ok := true;
  elsif ok and not (staff or admin) then
    raise exception 'Only the people handling this ticket can do that.';
  elsif not ok then
    raise exception 'A ticket can''t go from % to % here.', replace(t.status, '_', ' '), replace(p_to, '_', ' ');
  end if;

  if p_to = 'resolved' and (note is null or char_length(note) < 3) then raise exception 'Write the resolution notes before resolving the ticket.'; end if;
  if p_to = 'assigned' and t.assignee_id is null then raise exception 'Choose who to assign it to first.'; end if;
  if p_to = 'reopened' and (note is null or char_length(note) < 3) then raise exception 'Say why the ticket is being reopened.'; end if;

  update public.tickets set
    status = p_to,
    updated_at = now(),
    resolution_notes = case when p_to = 'resolved' then note else resolution_notes end,
    resolved_at = case when p_to = 'resolved' then now() when p_to = 'reopened' then null else resolved_at end,
    closed_at = case when p_to = 'closed' then now() when p_to = 'reopened' then null else closed_at end
  where id = p_id;

  insert into public.ticket_status_history (ticket_id, from_status, to_status, actor_id, note) values (p_id, t.status, p_to, me.id, note);
  perform public.ticket_log(p_id, 'status', replace(t.status, '_', ' ') || ' → ' || replace(p_to, '_', ' '));

  select ts.label into label from public.ticket_statuses ts where ts.key = p_to;
  perform public.ticket_tell_all(p_id,
    case p_to when 'resolved' then 'Ticket resolved' when 'reopened' then 'Ticket reopened' when 'closed' then 'Ticket closed' else 'Ticket status changed' end,
    'TCK-' || lpad(t.number::text, 5, '0') || ': ' || label, 'status');
end $$;

-- ---------- Assign ----------
create or replace function public.ticket_assign(p_id uuid, p_assignee uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  t public.tickets;
  who public.profiles;
begin
  select * into me from public.profiles where id = auth.uid() and status = 'active' and role <> 'viewer';
  if me.id is null then raise exception 'You can''t change tickets.'; end if;
  select * into t from public.tickets where id = p_id for update;
  if t.id is null or not public.ticket_can_see(p_id) then raise exception 'That ticket could not be found.'; end if;
  if not public.ticket_is_staff(p_id) then raise exception 'Only the people handling this ticket can assign it.'; end if;
  if t.status = 'closed' then raise exception 'Reopen the ticket before assigning it.'; end if;
  if p_assignee is not null then
    select * into who from public.profiles where id = p_assignee and status = 'active' and role <> 'viewer';
    if who.id is null then raise exception 'Choose an active person.'; end if;
  end if;
  if p_assignee is not distinct from t.assignee_id then return; end if;

  update public.tickets set assignee_id = p_assignee, updated_at = now(),
    status = case when p_assignee is not null and status in ('open', 'reopened') then 'assigned' when p_assignee is null and status = 'assigned' then 'open' else status end
  where id = p_id;
  if p_assignee is not null then
    insert into public.ticket_followers (ticket_id, user_id) values (p_id, p_assignee) on conflict do nothing;
  end if;
  if t.status in ('open', 'reopened') and p_assignee is not null then
    insert into public.ticket_status_history (ticket_id, from_status, to_status, actor_id) values (p_id, t.status, 'assigned', me.id);
  elsif t.status = 'assigned' and p_assignee is null then
    insert into public.ticket_status_history (ticket_id, from_status, to_status, actor_id) values (p_id, 'assigned', 'open', me.id);
  end if;
  perform public.ticket_log(p_id, 'assigned', coalesce('to ' || coalesce(nullif(who.full_name, ''), who.email), 'unassigned'));
  if p_assignee is not null then
    perform public.ticket_tell(p_id, p_assignee, 'Ticket assigned to you', 'TCK-' || lpad(t.number::text, 5, '0') || ': ' || t.subject, 'assign');
  end if;
  perform public.ticket_tell(p_id, t.raised_by, 'Your ticket was assigned', 'TCK-' || lpad(t.number::text, 5, '0') || ': ' || t.subject, 'assigned-raiser');
end $$;

-- ---------- Edit fields ----------
-- p_changes may hold: subject, description, priority, due_on (a date, or "" to clear).
-- The person who raised it can edit the subject and description while it is still open; staff can edit subject, priority and due date.
create or replace function public.ticket_update(p_id uuid, p_changes jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  t public.tickets;
  staff boolean;
  raiser_edit boolean;
  subj text;
  descr text;
  pr text;
  due date;
  changed text[] := '{}';
begin
  select * into me from public.profiles where id = auth.uid() and status = 'active' and role <> 'viewer';
  if me.id is null then raise exception 'You can''t change tickets.'; end if;
  select * into t from public.tickets where id = p_id for update;
  if t.id is null or not public.ticket_can_see(p_id) then raise exception 'That ticket could not be found.'; end if;
  staff := public.ticket_is_staff(p_id);
  raiser_edit := t.raised_by = me.id and t.status in ('open', 'reopened');
  if not (staff or raiser_edit) then raise exception 'You can''t edit this ticket now.'; end if;
  if t.status = 'closed' then raise exception 'Reopen the ticket before editing it.'; end if;

  subj := t.subject; descr := t.description; pr := t.priority; due := t.due_on;
  if p_changes ? 'subject' then
    subj := btrim(coalesce(p_changes ->> 'subject', ''));
    if char_length(subj) < 3 or char_length(subj) > 150 then raise exception 'The subject must be 3 to 150 characters.'; end if;
    if subj is distinct from t.subject then changed := changed || 'subject'; end if;
  end if;
  if p_changes ? 'description' then
    descr := coalesce(p_changes ->> 'description', '');
    if char_length(descr) > 5000 then raise exception 'Keep the description to 5000 characters or fewer.'; end if;
    if descr is distinct from t.description then changed := changed || 'description'; end if;
  end if;
  if p_changes ? 'priority' then
    if not staff then raise exception 'Only the people handling this ticket can change its priority.'; end if;
    pr := p_changes ->> 'priority';
    if pr not in ('low', 'medium', 'high', 'urgent') then raise exception 'Choose a priority.'; end if;
    if pr is distinct from t.priority then changed := changed || 'priority'; end if;
  end if;
  if p_changes ? 'due_on' then
    if not staff then raise exception 'Only the people handling this ticket can set the deadline.'; end if;
    due := nullif(p_changes ->> 'due_on', '')::date;
    if due is distinct from t.due_on then changed := changed || 'due date'; end if;
  end if;
  if array_length(changed, 1) is null then return; end if;
  if ('subject' = any (changed) or 'description' = any (changed)) and not (staff or raiser_edit) then raise exception 'You can''t edit this ticket now.'; end if;

  update public.tickets set subject = subj, description = descr, priority = pr, due_on = due, updated_at = now() where id = p_id;
  perform public.ticket_log(p_id, 'edited', array_to_string(changed, ', '));
  if 'priority' = any (changed) or 'due date' = any (changed) then
    perform public.ticket_tell_all(p_id, 'Ticket updated', 'TCK-' || lpad(t.number::text, 5, '0') || ': ' || array_to_string(changed, ', ') || ' changed', 'edit');
  end if;
end $$;

-- ---------- Comments ----------
create or replace function public.ticket_comment_add(p_id uuid, p_body text, p_internal boolean, p_mentions uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  t public.tickets;
  body text := btrim(coalesce(p_body, ''));
  cid uuid;
  internal boolean := coalesce(p_internal, false);
  m uuid;
  code text;
begin
  select * into me from public.profiles where id = auth.uid() and status = 'active' and role <> 'viewer';
  if me.id is null then raise exception 'You can''t comment on tickets.'; end if;
  select * into t from public.tickets where id = p_id;
  if t.id is null or not public.ticket_can_see(p_id) then raise exception 'That ticket could not be found.'; end if;
  if t.status = 'closed' then raise exception 'This ticket is closed. Reopen it to add a comment.'; end if;
  if char_length(body) < 1 then raise exception 'Write a comment first.'; end if;
  if char_length(body) > 3000 then raise exception 'Keep the comment to 3000 characters or fewer.'; end if;
  if internal and not public.ticket_is_staff(p_id) then raise exception 'Only the people handling this ticket can add internal notes.'; end if;

  insert into public.ticket_comments (ticket_id, author_id, body, internal) values (p_id, me.id, body, internal) returning id into cid;
  update public.tickets set updated_at = now() where id = p_id;
  insert into public.ticket_followers (ticket_id, user_id) values (p_id, me.id) on conflict do nothing;
  perform public.ticket_log(p_id, 'comment', case when internal then 'internal note' else 'comment' end);

  code := 'TCK-' || lpad(t.number::text, 5, '0');
  -- People tagged with @ are told, if they are allowed to see the ticket (an internal note only goes to staff).
  if p_mentions is not null then
    foreach m in array p_mentions[1:10] loop
      if m is distinct from me.id and (not internal or public.ticket_is_staff_as(m, p_id)) then
        perform public.ticket_tell(p_id, m, 'You were mentioned', code || ': ' || left(body, 120), 'mention');
      end if;
    end loop;
  end if;
  if internal then
    -- Only staff are told about internal notes.
    if t.assignee_id is not null and public.ticket_is_staff_as(t.assignee_id, p_id) then
      perform public.ticket_tell(p_id, t.assignee_id, 'New internal note', code, 'note');
    end if;
  else
    perform public.ticket_tell_all(p_id, 'New comment', code || ': ' || left(body, 120), 'comment');
  end if;
  return cid;
end $$;

-- ---------- Followers and subtasks ----------
create or replace function public.ticket_follow(p_id uuid, p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  select * into me from public.profiles where id = auth.uid() and status = 'active' and role <> 'viewer';
  if me.id is null then raise exception 'You can''t change tickets.'; end if;
  if not public.ticket_can_see(p_id) then raise exception 'That ticket could not be found.'; end if;
  if p_user is distinct from me.id and not public.ticket_is_staff(p_id) then raise exception 'Only the people handling this ticket can add followers.'; end if;
  if coalesce(p_on, true) then
    if not exists (select 1 from public.profiles where id = p_user and status = 'active' and role <> 'viewer') then raise exception 'Choose an active person.'; end if;
    insert into public.ticket_followers (ticket_id, user_id) values (p_id, p_user) on conflict do nothing;
    perform public.ticket_log(p_id, 'follower', 'added');
  else
    delete from public.ticket_followers where ticket_id = p_id and user_id = p_user and p_user <> (select raised_by from public.tickets where id = p_id);
    perform public.ticket_log(p_id, 'follower', 'removed');
  end if;
end $$;

create or replace function public.ticket_subtask_add(p_id uuid, p_title text) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid; title text := btrim(coalesce(p_title, ''));
begin
  if not public.ticket_is_staff(p_id) then raise exception 'Only the people handling this ticket can add subtasks.'; end if;
  if char_length(title) < 1 or char_length(title) > 150 then raise exception 'A subtask needs a title of up to 150 characters.'; end if;
  if (select count(*) from public.ticket_subtasks where ticket_id = p_id) >= 30 then raise exception 'A ticket can have up to 30 subtasks.'; end if;
  insert into public.ticket_subtasks (ticket_id, title, created_by) values (p_id, title, auth.uid()) returning id into sid;
  perform public.ticket_log(p_id, 'subtask', 'added: ' || left(title, 80));
  return sid;
end $$;

create or replace function public.ticket_subtask_set(p_sub uuid, p_done boolean) returns void
language plpgsql security definer set search_path = public as $$
declare tid uuid;
begin
  select ticket_id into tid from public.ticket_subtasks where id = p_sub;
  if tid is null or not public.ticket_is_staff(tid) then raise exception 'Only the people handling this ticket can change subtasks.'; end if;
  update public.ticket_subtasks set done = coalesce(p_done, false) where id = p_sub;
  perform public.ticket_log(tid, 'subtask', case when coalesce(p_done, false) then 'completed' else 'reopened' end);
end $$;

create or replace function public.ticket_subtask_delete(p_sub uuid) returns void
language plpgsql security definer set search_path = public as $$
declare tid uuid;
begin
  select ticket_id into tid from public.ticket_subtasks where id = p_sub;
  if tid is null or not public.ticket_is_staff(tid) then raise exception 'Only the people handling this ticket can change subtasks.'; end if;
  delete from public.ticket_subtasks where id = p_sub;
  perform public.ticket_log(tid, 'subtask', 'removed');
end $$;

-- ---------- Attachments ----------
-- The file is uploaded first (to the caller's own folder); this records it against the ticket.
create or replace function public.ticket_attach(p_id uuid, p_key text, p_filename text, p_mime text, p_size int, p_screenshot boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare me public.profiles; t public.tickets; aid uuid;
begin
  select * into me from public.profiles where id = auth.uid() and status = 'active' and role <> 'viewer';
  if me.id is null then raise exception 'You can''t change tickets.'; end if;
  select * into t from public.tickets where id = p_id;
  if t.id is null or not public.ticket_can_see(p_id) then raise exception 'That ticket could not be found.'; end if;
  if not (t.raised_by = me.id or public.ticket_is_staff(p_id)) then raise exception 'Only the person who raised the ticket or the people handling it can attach files.'; end if;
  if t.status = 'closed' then raise exception 'This ticket is closed. Reopen it to attach files.'; end if;
  if split_part(p_key, '/', 1) <> me.id::text then raise exception 'That file is not in your folder.'; end if;
  if (select count(*) from public.ticket_attachments where ticket_id = p_id) >= 15 then raise exception 'A ticket can have up to 15 attachments.'; end if;
  insert into public.ticket_attachments (ticket_id, uploader_id, storage_key, original_filename, mime_type, size_bytes, is_screenshot)
  values (p_id, me.id, p_key, p_filename, p_mime, p_size, coalesce(p_screenshot, false)) returning id into aid;
  update public.tickets set updated_at = now() where id = p_id;
  perform public.ticket_log(p_id, 'attachment', left(p_filename, 120));
  return aid;
end $$;

-- ---------- People, for names and pickers ----------
-- Names only (no email) of active people, so a ticket can show who raised it and who handles it.
create or replace function public.ticket_people(p_ids uuid[]) returns table (id uuid, name text)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(btrim(p.full_name), ''), split_part(p.email, '@', 1))
  from public.profiles p
  where p.id = any (coalesce(p_ids, '{}')) and auth.uid() is not null and not public.is_viewer()
$$;

-- Who a ticket can be assigned to or mentioned: the people allowed to see it, as seen by staff.
create or replace function public.ticket_people_for(p_id uuid) returns table (id uuid, name text, can_handle boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.ticket_can_see(p_id) then return; end if;
  return query
    select p.id, coalesce(nullif(btrim(p.full_name), ''), split_part(p.email, '@', 1)), public.ticket_is_staff_as(p.id, p_id)
    from public.profiles p
    where p.status = 'active' and p.role <> 'viewer'
      and (public.ticket_can_see_as(p.id, p_id) or (public.ticket_is_staff(p_id) and (p.role in ('admin', 'manager') or exists (select 1 from public.ticket_support s where s.user_id = p.id))))
    order by 2
    limit 200;
end $$;

-- Admins mark people as support staff for a department (used by Ticket Settings in phase 2; also usable from here).
create or replace function public.ticket_support_set(p_user uuid, p_department text, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only an admin can do that.'; end if;
  if not exists (select 1 from public.ticket_categories where department = p_department) then raise exception 'Unknown department.'; end if;
  if coalesce(p_on, true) then
    insert into public.ticket_support (user_id, department) values (p_user, p_department) on conflict do nothing;
  else
    delete from public.ticket_support where user_id = p_user and department = p_department;
  end if;
end $$;

-- Which of my own time logs have a ticket against them, for the "view linked tickets" link on the work log.
create or replace function public.ticket_for_logs(p_logs uuid[]) returns table (work_log_id uuid, ticket_id uuid, number bigint, status text)
language sql stable security definer set search_path = public as $$
  select t.work_log_id, t.id, t.number, t.status from public.tickets t
  where t.work_log_id = any (coalesce(p_logs, '{}')) and t.raised_by = auth.uid()
$$;

revoke all on function public.ticket_can_see_as(uuid, uuid), public.ticket_is_staff_as(uuid, uuid), public.ticket_log(uuid, text, text),
  public.ticket_tell(uuid, uuid, text, text, text), public.ticket_tell_all(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.ticket_can_see(uuid), public.ticket_is_staff(uuid), public.ticket_create(uuid, text, text, text, text, uuid),
  public.ticket_set_status(uuid, text, text), public.ticket_assign(uuid, uuid), public.ticket_update(uuid, jsonb),
  public.ticket_comment_add(uuid, text, boolean, uuid[]), public.ticket_follow(uuid, uuid, boolean), public.ticket_subtask_add(uuid, text),
  public.ticket_subtask_set(uuid, boolean), public.ticket_subtask_delete(uuid), public.ticket_attach(uuid, text, text, text, int, boolean),
  public.ticket_people(uuid[]), public.ticket_people_for(uuid), public.ticket_support_set(uuid, text, boolean), public.ticket_for_logs(uuid[])
  from public, anon;
grant execute on function public.ticket_can_see(uuid), public.ticket_is_staff(uuid), public.ticket_create(uuid, text, text, text, text, uuid),
  public.ticket_set_status(uuid, text, text), public.ticket_assign(uuid, uuid), public.ticket_update(uuid, jsonb),
  public.ticket_comment_add(uuid, text, boolean, uuid[]), public.ticket_follow(uuid, uuid, boolean), public.ticket_subtask_add(uuid, text),
  public.ticket_subtask_set(uuid, boolean), public.ticket_subtask_delete(uuid), public.ticket_attach(uuid, text, text, text, int, boolean),
  public.ticket_people(uuid[]), public.ticket_people_for(uuid), public.ticket_support_set(uuid, text, boolean), public.ticket_for_logs(uuid[])
  to authenticated;
-- The policies call these as the signed-in person, so they must be allowed to run them.
grant execute on function public.ticket_can_see_as(uuid, uuid), public.ticket_is_staff_as(uuid, uuid) to authenticated;

-- ---------- The private bucket for ticket files ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ticket-files', 'ticket-files', false, 10485760, array[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "ticket files bucket: read what the table lets you read" on storage.objects;
create policy "ticket files bucket: read what the table lets you read" on storage.objects
  for select to authenticated
  using (bucket_id = 'ticket-files' and exists (select 1 from public.ticket_attachments a where a.storage_key = objects.name));

drop policy if exists "ticket files bucket: add to own folder" on storage.objects;
create policy "ticket files bucket: add to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'ticket-files' and (storage.foldername(name))[1] = auth.uid()::text and not public.is_viewer());

drop policy if exists "ticket files bucket: remove from own folder" on storage.objects;
create policy "ticket files bucket: remove from own folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'ticket-files' and (storage.foldername(name))[1] = auth.uid()::text and not public.is_viewer());

notify pgrst, 'reload schema';
