-- STEP 40 – run once in Supabase → SQL Editor. Safe to run again. Speed only: no change in who can see or do anything.
--  1. Row-level security policies call auth.uid() and is_admin() once per query instead of once per row
--     (the "auth_rls_initplan" advisor). Same rules, faster reads as the data grows.
--  2. Every single-column foreign key gets an index (the "unindexed_foreign_keys" advisor): joins and deletes stay fast.
--  3. A few indexes for the screens that read the most.

-- ---------- 1. Policies ----------
do $$
declare
  p record;
  q text;
  w text;
  clauses text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') ~ '(auth\.uid\(\)|is_admin\(\))' or coalesce(with_check, '') ~ '(auth\.uid\(\)|is_admin\(\))')
  loop
    q := p.qual;
    w := p.with_check;
    -- Keep calls that are already wrapped, wrap the rest.
    foreach clauses in array array['q', 'w'] loop
      declare t text := case clauses when 'q' then q else w end;
      begin
        if t is not null then
          t := replace(t, '( SELECT auth.uid() AS uid)', '@@UID@@');
          t := replace(t, '( SELECT is_admin() AS is_admin)', '@@ADMIN@@');
          t := replace(t, '( SELECT public.is_admin() AS is_admin)', '@@ADMIN@@');
          t := replace(t, 'auth.uid()', '( SELECT auth.uid() AS uid)');
          t := regexp_replace(t, '(public\.)?is_admin\(\)', '( SELECT is_admin() AS is_admin)', 'g');
          t := replace(t, '@@UID@@', '( SELECT auth.uid() AS uid)');
          t := replace(t, '@@ADMIN@@', '( SELECT is_admin() AS is_admin)');
          if clauses = 'q' then q := t; else w := t; end if;
        end if;
      end;
    end loop;

    execute format('alter policy %I on %I.%I%s%s',
      p.policyname, p.schemaname, p.tablename,
      case when q is not null then ' using (' || q || ')' else '' end,
      case when w is not null then ' with check (' || w || ')' else '' end);
  end loop;
end $$;

-- ---------- 2. Foreign key indexes ----------
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tbl, a.attname as col, c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace and array_length(c.conkey, 1) = 1
      and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])
  loop
    execute format('create index if not exists %I on %s (%I)', 'idx_' || left(r.conname, 55), r.tbl, r.col);
  end loop;
end $$;

-- ---------- 3. Hot reads ----------
-- work_logs (by date, by person and date) and notifications (by person) were already indexed; requests get two more.
create index if not exists requests_status_from_idx on public.requests (status, from_date);
create index if not exists requests_user_status_idx on public.requests (user_id, status);

analyze;
