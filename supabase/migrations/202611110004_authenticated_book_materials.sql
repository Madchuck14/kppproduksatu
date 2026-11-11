begin;

-- Keep catalog metadata public while requiring Auth for every promotional file.
update storage.buckets set public = false where id = 'book-materials';
create or replace function public.can_access_public_book_material(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.products p
    where p.published and p.id::text = split_part(object_name, '/', 2)
      and object_name in (
        p.flyer_path,
        p.dummy_book_path,
        p.product_knowledge_path,
        p.product_knowledge_preview_path
      )
  );
$$;
revoke all on function public.can_access_public_book_material(text) from public, anon, authenticated;
grant execute on function public.can_access_public_book_material(text) to authenticated;

drop policy if exists "Accounts read published book materials" on storage.objects;
drop policy if exists "Public reads published book materials" on storage.objects;
drop policy if exists "Readers access published book materials" on storage.objects;
create policy "Readers access published book materials" on storage.objects for select to authenticated
  using (bucket_id = 'book-materials' and public.can_access_public_book_material(name));

notify pgrst, 'reload schema';
commit;
