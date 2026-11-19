-- STEP 33 – run once in Supabase → SQL Editor, AFTER step24_access.sql and step32_settings.sql. Safe to run again.
-- Google Chat reminders:
--   * profiles.work_email         where Chat messages are sent (empty = use the sign-in email)
--   * profiles.chat_reminders     each person's own on/off switch (on by default)
--   * profiles.last_reminded_at / last_summary_at / last_digest_at   when each kind of message was last sent, so nobody gets two
--   * chat_settings               what an admin controls on Admin -> Settings: on/off, the time, the message, the extra messages
-- People can't write to these columns directly (profiles only allows editing the name); they use chat_reminders_set() below.
-- The scheduled job runs on the server with the service role, which is how it reads everyone and records what it sent.

alter table public.profiles add column if not exists work_email text;
alter table public.profiles add column if not exists chat_reminders boolean not null default true;
alter table public.profiles add column if not exists last_reminded_at timestamptz;
alter table public.profiles add column if not exists last_summary_at timestamptz;
alter table public.profiles add column if not exists last_digest_at timestamptz;
update public.profiles set work_email = lower(email) where work_email is null and email is not null;

create table if not exists public.chat_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  reminder_time text not null default '17:00' check (reminder_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  template text not null default 'Hi {name}, you have logged {hours} of {target} today. Please add your time log before you finish for the day.'
    check (char_length(btrim(template)) between 1 and 500),
  weekly_summary boolean not null default true,
  approval_digest boolean not null default true,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.chat_settings (id) values (true) on conflict (id) do nothing;

alter table public.chat_settings enable row level security;
drop policy if exists "chat settings: admin read" on public.chat_settings;
create policy "chat settings: admin read" on public.chat_settings for select to authenticated using (public.is_admin());

-- Admin: change the Chat settings. Writes what changed to the audit log.
create or replace function public.chat_settings_update(p_enabled boolean, p_time text, p_template text, p_summary boolean, p_digest boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  old public.chat_settings;
  changes text[] := '{}';
  tpl text := btrim(coalesce(p_template, ''));
begin
  if not public.access_caller_ok() then raise exception 'Only an admin can do that.'; end if;
  if p_time is null or p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Enter the reminder time as hours and minutes, for example 17:00.'; end if;
  if char_length(tpl) = 0 or char_length(tpl) > 500 then raise exception 'The message must be between 1 and 500 characters.'; end if;

  select * into old from public.chat_settings where id;
  if old.enabled is distinct from p_enabled then changes := changes || format('Reminders %s', case when p_enabled then 'turned on' else 'turned off' end); end if;
  if old.reminder_time is distinct from p_time then changes := changes || format('Reminder time %s to %s', old.reminder_time, p_time); end if;
  if old.template is distinct from tpl then changes := changes || 'Message changed'; end if;
  if old.weekly_summary is distinct from p_summary then changes := changes || format('Friday summary %s', case when p_summary then 'on' else 'off' end); end if;
  if old.approval_digest is distinct from p_digest then changes := changes || format('Approval messages %s', case when p_digest then 'on' else 'off' end); end if;

  update public.chat_settings
     set enabled = p_enabled, reminder_time = p_time, template = tpl, weekly_summary = p_summary, approval_digest = p_digest,
         updated_by = auth.uid(), updated_at = now()
   where id;
  if cardinality(changes) > 0 then
    perform public.access_audit_write('chat_settings_changed', 'Google Chat reminders', array_to_string(changes, '; '));
  end if;
end $$;

-- Anyone signed in: turn their own Chat reminders on or off.
create or replace function public.chat_reminders_set(p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in again.'; end if;
  update public.profiles set chat_reminders = coalesce(p_on, true) where id = auth.uid();
  perform public.access_audit_write('chat_reminders_set', null, case when p_on then 'Chat reminders on' else 'Chat reminders off' end);
end $$;

revoke all on function public.chat_settings_update(boolean, text, text, boolean, boolean) from public, anon;
revoke all on function public.chat_reminders_set(boolean) from public, anon;
grant execute on function public.chat_settings_update(boolean, text, text, boolean, boolean) to authenticated;
grant execute on function public.chat_reminders_set(boolean) to authenticated;

notify pgrst, 'reload schema';
