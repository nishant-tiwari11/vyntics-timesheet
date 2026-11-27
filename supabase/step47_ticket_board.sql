-- STEP 47 – run once in Supabase → SQL Editor, after step 45. Safe to run again (it replaces the earlier version of ticket_move).
-- The project board: dragging a ticket card to another column (a status change) and/or to another place in a column (its position).
--   * One function does both so they succeed or fail together.
--   * A card can be dropped on any column it can reach: when the workflow needs steps in between, they are taken one by one, each one
--     going through the same checks as everywhere else (ticket_set_status: allowed moves, resolution notes, history, notifications).
--     Open → Pending review goes via In progress; Open → Resolved goes via In progress (and needs resolution notes).
--   * Only the people handling the ticket can move it.

-- The next status on the way from one status to another, or null when there is no way (e.g. back to Open from In progress).
create or replace function public.ticket_next_hop(p_current text, p_target text) returns text
language sql immutable set search_path = public as $$
  select case
    when p_current = p_target then null
    when (case p_current
            when 'open' then p_target in ('assigned', 'in_progress', 'on_hold')
            when 'assigned' then p_target in ('open', 'in_progress', 'on_hold')
            when 'in_progress' then p_target in ('assigned', 'on_hold', 'pending_review', 'resolved')
            when 'on_hold' then p_target in ('assigned', 'in_progress')
            when 'pending_review' then p_target in ('in_progress', 'resolved')
            when 'reopened' then p_target in ('assigned', 'in_progress', 'on_hold')
            when 'resolved' then p_target = 'closed'
            else false end) then p_target
    when p_target in ('pending_review', 'resolved', 'closed') and p_current in ('open', 'assigned', 'on_hold', 'reopened') then 'in_progress'
    when p_target = 'closed' and p_current in ('in_progress', 'pending_review') then 'resolved'
    else null
  end
$$;

create or replace function public.ticket_move(p_id uuid, p_to text, p_note text, p_position double precision) returns void
language plpgsql security definer set search_path = public as $$
declare
  t public.tickets;
  cur text;
  hop text;
  guard int := 0;
begin
  select * into t from public.tickets where id = p_id;
  if t.id is null or not public.ticket_can_see(p_id) then raise exception 'That ticket could not be found.'; end if;
  if not public.ticket_is_staff(p_id) then raise exception 'Only the people handling this ticket can move it.'; end if;
  if p_to is not null and p_to <> t.status then
    cur := t.status;
    while cur <> p_to loop
      guard := guard + 1;
      hop := public.ticket_next_hop(cur, p_to);
      if hop is null or guard > 4 then
        raise exception 'A ticket can''t go from % to % here.', replace(t.status, '_', ' '), replace(p_to, '_', ' ');
      end if;
      -- The resolution notes belong to the step that resolves the ticket.
      perform public.ticket_set_status(p_id, hop, case when hop = 'resolved' then p_note else null end);
      cur := hop;
    end loop;
  end if;
  if p_position is not null then
    update public.tickets set position = p_position where id = p_id;
  end if;
end $$;

revoke all on function public.ticket_next_hop(text, text) from public, anon;
revoke all on function public.ticket_move(uuid, text, text, double precision) from public, anon;
grant execute on function public.ticket_move(uuid, text, text, double precision) to authenticated;

notify pgrst, 'reload schema';
