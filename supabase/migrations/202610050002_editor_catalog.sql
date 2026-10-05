begin;

-- Expand only: existing UUIDs, slugs, rows, and references remain intact.
alter table public.products add column if not exists book_code text;
alter table public.products add column if not exists education_level text;
create unique index if not exists products_book_code_unique on public.products (book_code);
alter table public.products add constraint products_book_code_format
  check (book_code is null or book_code ~ '^[A-Z0-9][A-Z0-9._-]{0,49}$');
alter table public.products add constraint products_education_level_valid
  check (education_level is null or education_level in ('SD', 'SMP', 'SMA', 'SMK'));
create index products_education_level_idx on public.products (education_level);
comment on column public.products.book_code is 'Unique uppercase business key; UUID remains the primary key. NULL legacy values must be completed by a super Editor.';

create function public.can_manage_book_level(target_level text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.account_memberships m
    where m.user_id = (select auth.uid()) and m.role = 'editor'
      and (m.is_super or exists (
        select 1 from public.editor_scopes s
        where s.user_id = m.user_id and s.education_level = target_level
      ))
  );
$$;
revoke all on function public.can_manage_book_level(text) from public;
grant execute on function public.can_manage_book_level(text) to authenticated;

-- Remove the old broad admin bypass; Editor membership + scope owns book access.
drop policy "Admins manage products" on public.products;
create policy "Editors read managed products" on public.products for select to authenticated
  using (public.can_manage_book_level(education_level));
create policy "Editors insert scoped products" on public.products for insert to authenticated
  with check (book_code is not null and education_level is not null
    and public.can_manage_book_level(education_level));
create policy "Editors update scoped products" on public.products for update to authenticated
  using (public.can_manage_book_level(education_level))
  with check (book_code is not null and education_level is not null
    and public.can_manage_book_level(education_level));
create policy "Editors delete scoped products" on public.products for delete to authenticated
  using (public.can_manage_book_level(education_level));

create function public.can_manage_book_image(object_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.products p
    where object_name ~ '^books/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|avif)$'
      and p.id::text = split_part(object_name, '/', 2)
      and public.can_manage_book_level(p.education_level)
  );
$$;
revoke all on function public.can_manage_book_image(text) from public;
grant execute on function public.can_manage_book_image(text) to authenticated;

drop policy "Admins upload product images" on storage.objects;
drop policy "Admins read product image metadata" on storage.objects;
drop policy "Admins update product images" on storage.objects;
drop policy "Admins delete product images" on storage.objects;
create policy "Editors upload book images" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.can_manage_book_image(name));
create policy "Editors read book image metadata" on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and public.can_manage_book_image(name));
create policy "Editors delete book images" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.can_manage_book_image(name));
-- Uploads use unique immutable paths. Replacing a cover never overwrites another object.

commit;
