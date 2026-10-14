begin;

-- User requirement: published Flyer and PPT Produk are public; only Dummy Buku requires login.
-- Keep the bucket private so drafts and unrelated objects never become publicly readable.
-- This change does not send documents to any third-party viewer.
create or replace function public.can_access_public_book_material(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.products p
    where p.published and p.id::text = split_part(object_name, '/', 2)
      and (
        (
          object_name in (p.flyer_path, p.product_knowledge_path)
          and object_name ~ (
            '^books/' || p.id::text || '/(flyer|product-knowledge)/[0-9a-f-]{36}\.(pdf|ppt|pptx)$'
          )
          and object_name is distinct from p.dummy_book_path
        )
        or ((select auth.uid()) is not null
          and (object_name = p.dummy_book_path
            or object_name = any(p.product_knowledge_slide_paths)))
      )
  );
$$;
revoke all on function public.can_access_public_book_material(text) from public, anon, authenticated;
grant execute on function public.can_access_public_book_material(text) to anon, authenticated;

drop policy if exists "Accounts read published book materials" on storage.objects;
drop policy if exists "Public reads published book materials" on storage.objects;
drop policy if exists "Readers access published book materials" on storage.objects;
create policy "Readers access published book materials" on storage.objects for select to anon, authenticated
  using (bucket_id = 'book-materials' and public.can_access_public_book_material(name));

notify pgrst, 'reload schema';
commit;
