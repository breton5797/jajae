-- 자재(Jajae) Storage setup. Run on Supabase (NOT loaded by the PGlite test
-- harness — it references the `storage` schema). Creates buckets + per-user RLS.

insert into storage.buckets (id, name, public)
values ('drawings', 'drawings', false), ('site-docs', 'site-docs', false)
on conflict (id) do nothing;

-- Owners can manage files in their own top-level folder ("<uid>/..."), per bucket.
create policy "drawings own files"
  on storage.objects for all to authenticated
  using (bucket_id = 'drawings' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'drawings' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "site-docs own files"
  on storage.objects for all to authenticated
  using (bucket_id = 'site-docs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'site-docs' and (storage.foldername(name))[1] = auth.uid()::text);
