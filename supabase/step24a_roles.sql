-- Step 24a: two new roles (run this FIRST and on its own, then run step24_access.sql).
-- Postgres can't use a brand-new enum value in the same transaction that adds it, so this is a separate step.
alter type public.user_role add value if not exists 'manager';
alter type public.user_role add value if not exists 'viewer';
