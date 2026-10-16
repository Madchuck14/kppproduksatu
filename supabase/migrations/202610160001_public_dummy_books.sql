begin;

-- Published materials are public through RLS; the bucket and drafts remain private.
create or replace function public.can_access_public_book_material(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
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
grant execute on function public.can_access_public_book_material(text) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
