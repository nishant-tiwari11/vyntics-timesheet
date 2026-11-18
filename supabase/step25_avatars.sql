-- STEP 25 – run once in Supabase → SQL Editor, AFTER step24_access.sql. Safe to run again.
-- Profile pictures. One private storage bucket, one file per person ("<user id>.webp", 400x400 WebP, made by the app).
--   * Any signed-in person can see any photo (the app serves them through /timesheet/avatar/<id>; the bucket is NOT public).
--   * A person can add, replace or remove only their own photo. An admin can do it for anyone. Viewers (read-only role) can't.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 1048576, array['image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars: signed-in can read" on storage.objects;
create policy "avatars: signed-in can read" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars');

drop policy if exists "avatars: own or admin add" on storage.objects;
create policy "avatars: own or admin add" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (public.is_admin() or (name = auth.uid()::text || '.webp' and not public.is_viewer()))
  );

drop policy if exists "avatars: own or admin replace" on storage.objects;
create policy "avatars: own or admin replace" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (public.is_admin() or (name = auth.uid()::text || '.webp' and not public.is_viewer())))
  with check (bucket_id = 'avatars' and (public.is_admin() or (name = auth.uid()::text || '.webp' and not public.is_viewer())));

drop policy if exists "avatars: own or admin remove" on storage.objects;
create policy "avatars: own or admin remove" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (public.is_admin() or (name = auth.uid()::text || '.webp' and not public.is_viewer())));
