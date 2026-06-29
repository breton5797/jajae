-- 자재(Jajae) Storage setup. Run on Supabase (NOT loaded by the PGlite test
-- harness — it references the `storage` schema). Creates buckets + per-user RLS.
-- 멱등(idempotent): 버킷 insert는 on conflict, 정책은 drop-if-exists 후 create.
-- `supabase db push`는 migrations/ 만 적용하므로 이 파일은 별도 실행한다(런북 §1 참조).

insert into storage.buckets (id, name, public)
values ('drawings', 'drawings', false), ('site-docs', 'site-docs', false)
on conflict (id) do nothing;

-- 제안서 3D 스냅샷: 공개 버킷(공유 링크 소비자가 비로그인 상태로 이미지 열람).
-- 업로드는 인증 사용자 본인 폴더만; 읽기는 public 버킷이라 공개 URL로 가능.
insert into storage.buckets (id, name, public)
values ('proposal-snapshots', 'proposal-snapshots', true)
on conflict (id) do nothing;

drop policy if exists "proposal-snapshots own files" on storage.objects;
create policy "proposal-snapshots own files"
  on storage.objects for all to authenticated
  using (bucket_id = 'proposal-snapshots' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'proposal-snapshots' and (storage.foldername(name))[1] = auth.uid()::text);

-- Owners can manage files in their own top-level folder ("<uid>/..."), per bucket.
drop policy if exists "drawings own files" on storage.objects;
create policy "drawings own files"
  on storage.objects for all to authenticated
  using (bucket_id = 'drawings' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'drawings' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "site-docs own files" on storage.objects;
create policy "site-docs own files"
  on storage.objects for all to authenticated
  using (bucket_id = 'site-docs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'site-docs' and (storage.foldername(name))[1] = auth.uid()::text);
