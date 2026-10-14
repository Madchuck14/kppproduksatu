begin;

alter table public.products
  add column if not exists product_knowledge_slide_paths text[] not null default '{}',
  add column if not exists product_knowledge_preview_status text not null default 'none',
  add column if not exists product_knowledge_preview_error text;

update public.products p set
  product_knowledge_slide_paths = a.slide_paths,
  product_knowledge_preview_status = a.preview_status,
  product_knowledge_preview_error = a.preview_error
from catalog_cleanup_archive.presentation_converter_columns a
where a.product_id = p.id;

alter table public.products
  drop constraint if exists products_product_knowledge_preview_status_valid;
alter table public.products
  add constraint products_product_knowledge_preview_status_valid
  check (product_knowledge_preview_status = any (array['none', 'processing', 'ready', 'failed']));

create or replace function public.valid_presentation_slides(product_id uuid, paths text[])
returns boolean language sql immutable set search_path = '' as $$
  select paths is not null
    and coalesce(array_ndims(paths), 1) = 1
    and cardinality(paths) <= 50
    and not exists (
      select 1 from unnest(paths) path
      where path is null or path !~ (
        '^books/' || product_id::text || '/presentation-slides/[0-9a-f-]{36}\.(png|jpg)$'
      )
    )
    and cardinality(paths) = (select count(distinct path) from unnest(paths) path);
$$;

alter table public.products drop constraint if exists products_presentation_slides_valid;
alter table public.products add constraint products_presentation_slides_valid
  check (public.valid_presentation_slides(id, product_knowledge_slide_paths)
    and (cardinality(product_knowledge_slide_paths) = 0
      or (product_knowledge_path is not null and product_knowledge_path ~ '\.(ppt|pptx)$')));

create or replace function public.can_manage_book_material(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.products p
    where (
      object_name ~ '^books/[0-9a-f-]{36}/(flyer|dummy|product-knowledge-preview)/[0-9a-f-]{36}\.pdf$'
      or object_name ~ '^books/[0-9a-f-]{36}/product-knowledge/[0-9a-f-]{36}\.(ppt|pptx)$'
      or object_name ~ '^books/[0-9a-f-]{36}/presentation-slides/[0-9a-f-]{36}\.(png|jpg)$'
    )
    and p.id::text = split_part(object_name, '/', 2)
    and public.can_manage_book_level(p.education_level)
  );
$$;
revoke all on function public.can_manage_book_material(text) from public;
grant execute on function public.can_manage_book_material(text) to authenticated;

create or replace function public.can_access_public_book_material(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.products p
    where p.published and p.id::text = split_part(object_name, '/', 2)
      and (
        (object_name in (
          p.flyer_path,
          p.product_knowledge_path,
          p.product_knowledge_preview_path
        ) and object_name is distinct from p.dummy_book_path)
        or object_name = any(p.product_knowledge_slide_paths)
        or ((select auth.uid()) is not null and object_name = p.dummy_book_path)
      )
  );
$$;
revoke all on function public.can_access_public_book_material(text) from public, anon, authenticated;
grant execute on function public.can_access_public_book_material(text) to anon, authenticated;

drop policy if exists "Readers access published book materials" on storage.objects;
create policy "Readers access published book materials" on storage.objects for select to anon, authenticated
  using (bucket_id = 'book-materials' and public.can_access_public_book_material(name));

notify pgrst, 'reload schema';
commit;
