begin;

alter table public.products
  add column if not exists product_knowledge_preview_path text;

alter table public.products
  drop constraint if exists products_product_knowledge_preview_path_valid;
alter table public.products
  add constraint products_product_knowledge_preview_path_valid check (
    product_knowledge_preview_path is null
    or product_knowledge_preview_path ~ (
      '^books/' || id::text || '/product-knowledge-preview/[0-9a-f-]{36}\.pdf$'
    )
  );

create schema if not exists catalog_cleanup_archive;
revoke all on schema catalog_cleanup_archive from public, anon, authenticated;

create table if not exists catalog_cleanup_archive.presentation_converter_columns (
  product_id uuid primary key,
  slide_paths text[] not null default '{}',
  preview_status text not null,
  preview_error text,
  archived_at timestamp with time zone not null default now()
);
revoke all on table catalog_cleanup_archive.presentation_converter_columns
  from public, anon, authenticated;
alter table catalog_cleanup_archive.presentation_converter_columns enable row level security;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products'
      and column_name = 'product_knowledge_slide_paths'
  ) then
    execute $archive$
      insert into catalog_cleanup_archive.presentation_converter_columns (
        product_id,
        slide_paths,
        preview_status,
        preview_error
      )
      select
        id,
        product_knowledge_slide_paths,
        product_knowledge_preview_status,
        product_knowledge_preview_error
      from public.products
      on conflict (product_id) do update set
        slide_paths = excluded.slide_paths,
        preview_status = excluded.preview_status,
        preview_error = excluded.preview_error,
        archived_at = now()
    $archive$;
  end if;
end;
$$;

create or replace function public.can_manage_book_material(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.products p
    where (
      object_name ~ '^books/[0-9a-f-]{36}/(flyer|dummy|product-knowledge-preview)/[0-9a-f-]{36}\.pdf$'
      or object_name ~ '^books/[0-9a-f-]{36}/product-knowledge/[0-9a-f-]{36}\.(ppt|pptx)$'
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
        or ((select auth.uid()) is not null and object_name = p.dummy_book_path)
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

alter table public.products drop constraint if exists products_presentation_slides_valid;
alter table public.products drop constraint if exists products_product_knowledge_preview_status_valid;
drop function if exists public.valid_presentation_slides(uuid, text[]);
alter table public.products
  drop column if exists product_knowledge_slide_paths,
  drop column if exists product_knowledge_preview_status,
  drop column if exists product_knowledge_preview_error;

comment on column public.products.product_knowledge_preview_path is
  'PDF uploaded by an Editor and used to display PPT Produk without server conversion.';

notify pgrst, 'reload schema';
commit;
