begin;

alter table public.products add column if not exists publication_year smallint;
alter table public.products add column if not exists flyer_path text;
alter table public.products add column if not exists dummy_book_path text;
alter table public.products add column if not exists product_knowledge_path text;
alter table public.products add constraint products_publication_year_valid
  check (publication_year is null or publication_year between 1000 and 9999);

-- Keep legacy non-numeric codes readable. New inserts and updates must use digits only.
alter table public.products drop constraint if exists products_book_code_format;
alter table public.products add constraint products_book_code_numeric
  check (book_code is null or book_code ~ '^[0-9]{1,50}$') not valid;

comment on column public.products.publication_year is 'Four-digit publication year.';
comment on column public.products.flyer_path is 'Private object path inside book-materials.';
comment on column public.products.dummy_book_path is 'Private object path inside book-materials.';
comment on column public.products.product_knowledge_path is 'Private object path inside book-materials.';

insert into storage.buckets (id, name, public, file_size_limit)
values ('book-materials', 'book-materials', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create function public.can_manage_book_material(object_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.products p
    where object_name ~ '^books/[0-9a-f-]{36}/(flyer|dummy|product-knowledge)/[0-9a-f-]{36}\.(pdf|ppt|pptx)$'
      and p.id::text = split_part(object_name, '/', 2)
      and public.can_manage_book_level(p.education_level)
  );
$$;
revoke all on function public.can_manage_book_material(text) from public;
grant execute on function public.can_manage_book_material(text) to authenticated;

create policy "Editors upload book materials" on storage.objects for insert to authenticated
  with check (bucket_id = 'book-materials' and public.can_manage_book_material(name));
create policy "Editors read book material metadata" on storage.objects for select to authenticated
  using (bucket_id = 'book-materials' and public.can_manage_book_material(name));
create policy "Editors delete book materials" on storage.objects for delete to authenticated
  using (bucket_id = 'book-materials' and public.can_manage_book_material(name));

commit;
