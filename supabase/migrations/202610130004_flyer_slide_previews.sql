begin;

-- Keep legacy PDFs and UUID references; no conversion or deletion of existing files.
alter table public.products add column if not exists flyer_slide_paths text[] not null default '{}';

create or replace function public.valid_flyer_slides(product_id uuid, paths text[])
returns boolean language sql immutable set search_path = '' as $$
  select paths is not null
    and coalesce(array_ndims(paths), 1) = 1
    and cardinality(paths) <= 20
    and not exists (
      select 1 from unnest(paths) path
      where path is null or path !~ (
        '^books/' || product_id::text || '/flyer-slides/[0-9a-f-]{36}\.(png|jpg)$'
      )
    )
    and cardinality(paths) = (select count(distinct path) from unnest(paths) path);
$$;
alter table public.products drop constraint if exists products_flyer_slides_valid;
alter table public.products add constraint products_flyer_slides_valid
  check (public.valid_flyer_slides(id, flyer_slide_paths)
    and (cardinality(flyer_slide_paths) = 0 or (flyer_path is not null and flyer_path ~ '\.(ppt|pptx)$')));

create or replace function public.can_manage_book_material(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.products p
    where (
      object_name ~ '^books/[0-9a-f-]{36}/(flyer|dummy|product-knowledge)/[0-9a-f-]{36}\.(pdf|ppt|pptx)$'
      or object_name ~ '^books/[0-9a-f-]{36}/flyer-slides/[0-9a-f-]{36}\.(png|jpg)$'
    )
    and p.id::text = split_part(object_name, '/', 2)
    and public.can_manage_book_level(p.education_level)
  );
$$;
revoke all on function public.can_manage_book_material(text) from public;
grant execute on function public.can_manage_book_material(text) to authenticated;

-- Replace anonymous material reads with authenticated published-only access.
drop policy if exists "Public reads published book materials" on storage.objects;
drop policy if exists "Accounts read published book materials" on storage.objects;
create or replace function public.can_access_public_book_material(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.products p
    where p.published and p.id::text = split_part(object_name, '/', 2)
      and (object_name in (p.flyer_path, p.dummy_book_path, p.product_knowledge_path)
        or object_name = any(p.flyer_slide_paths))
  );
$$;
revoke all on function public.can_access_public_book_material(text) from public, anon;
grant execute on function public.can_access_public_book_material(text) to authenticated;
create policy "Accounts read published book materials" on storage.objects for select to authenticated
  using (bucket_id = 'book-materials' and public.can_access_public_book_material(name));

comment on column public.products.flyer_slide_paths is 'Ordered private PNG/JPG previews in book-materials; replace as one set after uploading the original PPT/PPTX.';
commit;
