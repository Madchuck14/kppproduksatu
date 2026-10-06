begin;

create function public.can_access_book_material(object_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.products p
    join public.account_memberships m on m.user_id = (select auth.uid())
    where p.published
      and p.id::text = split_part(object_name, '/', 2)
      and object_name in (p.flyer_path, p.dummy_book_path, p.product_knowledge_path)
  );
$$;
revoke all on function public.can_access_book_material(text) from public;
grant execute on function public.can_access_book_material(text) to authenticated;

create policy "Accounts read published book materials" on storage.objects for select to authenticated
  using (bucket_id = 'book-materials' and public.can_access_book_material(name));

commit;
