-- KPP PRODUK SATU - SETUP SUPABASE LENGKAP
-- Gabungan 29 migrasi berurutan, sampai versi 202610150006.
-- Untuk database Supabase BARU yang belum memiliki tabel aplikasi ini.
-- Jalankan seluruh file sebagai database owner melalui SQL Editor.
-- Jangan jalankan pada database existing atau hanya memilih section tertentu.
-- Satu transaksi: kegagalan membatalkan seluruh setup.
-- Tidak menyertakan seed demo, akun/kredensial, rollback, atau diagnostics.
-- Tidak mencatat versi pada supabase_migrations.schema_migrations.
-- Untuk workflow CLI/database existing tetap gunakan migrations/ dan riwayat versinya.
-- File dihasilkan oleh: node scripts/build-supabase-setup.mjs
-- Ubah sumber migrasi, lalu buat ulang file ini; jangan mengedit hasil secara manual.

begin;

-- PRASYARAT DAN PELINDUNG DATABASE EXISTING
-- Pastikan layanan Auth/Storage tersedia dan fondasi aplikasi belum terpasang.
do $setup_guard$
begin
  if to_regclass('auth.users') is null
    or to_regprocedure('auth.uid()') is null
    or to_regclass('storage.buckets') is null
    or to_regclass('storage.objects') is null then
    raise exception 'setup.sql memerlukan database Supabase dengan Auth dan Storage tersedia.';
  end if;
  if to_regclass('public.products') is not null
    or to_regclass('public.admin_memberships') is not null
    or to_regclass('public.account_memberships') is not null
    or to_regclass('public.book_classifications') is not null then
    raise exception 'setup.sql hanya untuk database baru. Gunakan migrasi incremental untuk database existing.';
  end if;
end;
$setup_guard$;

-- ============================================================================
-- BAGIAN 01: FONDASI KATALOG DAN ADMIN
-- Penjelasan: Membuat tabel produk, kategori, membership admin, RLS, dan bucket gambar publik.
-- Sumber: migrations/202610040001_catalog.sql
-- ============================================================================

create table public.admin_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_memberships enable row level security;

-- Admin membership can only be granted by the database owner/service role.
create policy "Members can read their membership" on public.admin_memberships
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.admin_memberships to authenticated;
revoke insert, update, delete on public.admin_memberships from anon, authenticated;

create function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.admin_memberships where user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 100),
  name text not null check (length(name) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 100),
  title text not null check (length(title) between 1 and 200),
  author text not null default '',
  description text not null default '',
  price integer not null default 0 check (price >= 0),
  image_path text,
  featured boolean not null default false,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.products.price is 'IDR whole rupiah; no floating-point amounts';
comment on column public.products.image_path is 'Relative object path inside product-images, not a hosting URL';
create index products_category_id_idx on public.products(category_id);
create index products_published_created_idx on public.products(created_at desc) where published;

create function public.set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

alter table public.categories enable row level security;
alter table public.products enable row level security;
grant select on public.categories, public.products to anon, authenticated;
grant insert, update, delete on public.categories, public.products to authenticated;

create policy "Public categories" on public.categories for select to anon, authenticated using (true);
create policy "Published products" on public.products for select to anon, authenticated using (published);
create policy "Admins manage categories" on public.categories for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins manage products" on public.products for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

-- Public bucket objects are readable via public URLs. Only admins can modify them.
create policy "Admins upload product images" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (select public.is_admin()));
create policy "Admins read product image metadata" on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()));
create policy "Admins update product images" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()))
  with check (bucket_id = 'product-images' and (select public.is_admin()));
create policy "Admins delete product images" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()));

-- ============================================================================
-- BAGIAN 02: ROLE AKUN DAN SCOPE EDITOR
-- Penjelasan: Menambahkan membership Sales/Editor, status super, scope jenjang, dan fungsi pemeriksaan akses.
-- Sumber: migrations/202610050001_account_access.sql
-- ============================================================================

create table public.account_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('sales', 'editor')),
  is_super boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.editor_scopes (
  user_id uuid not null references public.account_memberships(user_id) on delete cascade,
  education_level text not null check (education_level in ('SD', 'SMP', 'SMA', 'SMK')),
  primary key (user_id, education_level)
);

alter table public.account_memberships enable row level security;
alter table public.editor_scopes enable row level security;
revoke all on public.account_memberships, public.editor_scopes from anon, authenticated;
grant select on public.account_memberships, public.editor_scopes to authenticated;
grant all on public.account_memberships, public.editor_scopes to service_role;
create policy "Accounts read their membership" on public.account_memberships
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Editors read their scopes" on public.editor_scopes
  for select to authenticated using (
    user_id = (select auth.uid()) and exists (
      select 1 from public.account_memberships
      where user_id = (select auth.uid()) and role = 'editor'
    )
  );

create function public.has_editor_scope(target_level text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.account_memberships as membership
    join public.editor_scopes as scope on scope.user_id = membership.user_id
    where membership.user_id = (select auth.uid())
      and membership.role = 'editor'
      and scope.education_level = target_level
  );
$$;
revoke all on function public.has_editor_scope(text) from public;
grant execute on function public.has_editor_scope(text) to authenticated;

-- Product policies stay unchanged. Super Editor uses the existing full admin membership.
-- Scoped Editor CRUD needs the separate versioned product identity/education-level migration.

-- ============================================================================
-- BAGIAN 03: KATALOG EDITOR PER JENJANG
-- Penjelasan: Menambahkan kode buku dan jenjang serta membatasi CRUD dan unggahan menurut akses Editor.
-- Sumber: migrations/202610050002_editor_catalog.sql
-- ============================================================================

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

-- ============================================================================
-- BAGIAN 04: TAHUN TERBIT DAN MATERI BUKU
-- Penjelasan: Menambahkan tahun terbit, path materi, bucket privat, dan aturan unggahan berkas.
-- Sumber: migrations/202610060001_book_publication_materials.sql
-- ============================================================================

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

-- ============================================================================
-- BAGIAN 05: ATURAN JUDUL UNIK HISTORIS
-- Penjelasan: Memasang aturan judul unik versi awal; bagian 26 nanti mencabut aturan ini.
-- Sumber: migrations/202610060002_unique_book_title.sql
-- ============================================================================

do $$
begin
  if exists (
    select 1
    from public.products
    group by lower(btrim(title))
    having count(*) > 1
  ) then
    raise exception 'Duplicate book titles exist. Rename duplicates before applying this migration.';
  end if;
end;
$$;

create unique index products_title_unique on public.products (lower(btrim(title)));

-- ============================================================================
-- BAGIAN 06: AKSES MATERI BERDASARKAN AKUN
-- Penjelasan: Menyiapkan aturan akses materi untuk akun terdaftar tanpa memberikan hak Editor.
-- Sumber: migrations/202610060003_account_book_material_access.sql
-- ============================================================================

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

-- ============================================================================
-- BAGIAN 07: AKSES MATERI BUKU PUBLISHED
-- Penjelasan: Memperbarui fungsi akses materi berdasarkan status publikasi; aturan akhir diperbarui lagi pada bagian 21 dan 24.
-- Sumber: migrations/202610060004_public_book_material_access.sql
-- ============================================================================

drop policy if exists "Accounts read published book materials" on storage.objects;
drop function if exists public.can_access_book_material(text);

create function public.can_access_public_book_material(object_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.products p
    where p.published
      and p.id::text = split_part(object_name, '/', 2)
      and object_name in (p.flyer_path, p.dummy_book_path, p.product_knowledge_path)
  );
$$;
revoke all on function public.can_access_public_book_material(text) from public;
grant execute on function public.can_access_public_book_material(text) to anon, authenticated;

create policy "Public reads published book materials" on storage.objects for select to anon, authenticated
  using (bucket_id = 'book-materials' and public.can_access_public_book_material(name));

-- ============================================================================
-- BAGIAN 08: MATA PELAJARAN PER JENJANG
-- Penjelasan: Menambahkan field mata pelajaran dan validasi daftar awal menurut jenjang pendidikan.
-- Sumber: migrations/202610060005_book_subjects.sql
-- ============================================================================

-- Expand only. Preserve UUIDs, references, and existing categories.
alter table public.products add column if not exists subject text;

-- Names and level mapping match daftarmapel.md and shared/utils/book-subjects.ts.
alter table public.products drop constraint if exists products_subject_level_valid;
alter table public.products add constraint products_subject_level_valid check (
  subject is null or (
    education_level is not null and (
      (education_level = 'SD' and subject in (
        'Pendidikan Agama dan Budi Pekerti',
        'Pendidikan Pancasila',
        'Bahasa Indonesia',
        'Matematika',
        'Ilmu Pengetahuan Alam dan Sosial (IPAS)',
        'Seni dan Budaya',
        'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)',
        'Bahasa Inggris',
        'Muatan Lokal (Bahasa Daerah)'
      )) or
      (education_level = 'SMP' and subject in (
        'Pendidikan Agama dan Budi Pekerti',
        'Pendidikan Pancasila',
        'Bahasa Indonesia',
        'Matematika',
        'Ilmu Pengetahuan Alam (IPA)',
        'Ilmu Pengetahuan Sosial (IPS)',
        'Bahasa Inggris',
        'Informatika',
        'Seni dan Prakarya',
        'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)',
        'Muatan Lokal (Bahasa Daerah)'
      )) or
      (education_level = 'SMA' and subject in (
        'Pendidikan Agama dan Budi Pekerti',
        'Pendidikan Pancasila',
        'Bahasa Indonesia',
        'Matematika',
        'Bahasa Inggris',
        'Sejarah',
        'Seni dan Budaya',
        'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)',
        'Informatika',
        'Biologi',
        'Fisika',
        'Kimia',
        'Matematika Lanjutan',
        'Ekonomi',
        'Sosiologi',
        'Geografi',
        'Antropologi',
        'Bahasa dan Sastra Indonesia',
        'Bahasa dan Sastra Inggris'
      ))
    )
  )
);
create index if not exists products_subject_idx on public.products (subject);
comment on column public.products.subject is 'Optional subject category from daftarmapel.md, validated by education level. NULL preserves legacy books; no SMK subjects have been supplied.';

-- Existing published-only and Editor level scope RLS policies remain in force.

-- ============================================================================
-- BAGIAN 09: FAVORIT PRIBADI
-- Penjelasan: Membuat relasi favorit user dan buku beserta RLS pemilik serta pembersihan referensi melalui FK.
-- Sumber: migrations/202610070001_product_favorites.sql
-- ============================================================================

-- Additive migration: UUID product identity and existing data stay unchanged.
create table public.product_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
create index product_favorites_recent_idx
  on public.product_favorites (user_id, created_at desc, product_id);
create index product_favorites_product_idx on public.product_favorites (product_id);

alter table public.product_favorites enable row level security;
revoke all on public.product_favorites from anon, authenticated;
grant select, insert, delete on public.product_favorites to authenticated;
grant all on public.product_favorites to service_role;

create policy "Users read their favorites" on public.product_favorites
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Users favorite published books" on public.product_favorites
  for insert to authenticated with check (
    user_id = (select auth.uid()) and exists (
      select 1 from public.products p where p.id = product_id and p.published = true
    )
  );
create policy "Users remove their favorites" on public.product_favorites
  for delete to authenticated using (user_id = (select auth.uid()));

-- ============================================================================
-- BAGIAN 10: MATA PELAJARAN SMK
-- Penjelasan: Memperluas daftar mata pelajaran agar SMK menerima daftar yang sama dengan SMA.
-- Sumber: migrations/202610070002_smk_subjects.sql
-- ============================================================================

-- Expand the allowed SMK subjects without changing existing product rows.
-- Names and level mapping match daftarmapel.md and shared/utils/book-subjects.ts.
alter table public.products drop constraint if exists products_subject_level_valid;
alter table public.products add constraint products_subject_level_valid check (
  subject is null or (
    education_level is not null and (
      (education_level = 'SD' and subject in (
        'Pendidikan Agama dan Budi Pekerti',
        'Pendidikan Pancasila',
        'Bahasa Indonesia',
        'Matematika',
        'Ilmu Pengetahuan Alam dan Sosial (IPAS)',
        'Seni dan Budaya',
        'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)',
        'Bahasa Inggris',
        'Muatan Lokal (Bahasa Daerah)'
      )) or
      (education_level = 'SMP' and subject in (
        'Pendidikan Agama dan Budi Pekerti',
        'Pendidikan Pancasila',
        'Bahasa Indonesia',
        'Matematika',
        'Ilmu Pengetahuan Alam (IPA)',
        'Ilmu Pengetahuan Sosial (IPS)',
        'Bahasa Inggris',
        'Informatika',
        'Seni dan Prakarya',
        'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)',
        'Muatan Lokal (Bahasa Daerah)'
      )) or
      (education_level in ('SMA', 'SMK') and subject in (
        'Pendidikan Agama dan Budi Pekerti',
        'Pendidikan Pancasila',
        'Bahasa Indonesia',
        'Matematika',
        'Bahasa Inggris',
        'Sejarah',
        'Seni dan Budaya',
        'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)',
        'Informatika',
        'Biologi',
        'Fisika',
        'Kimia',
        'Matematika Lanjutan',
        'Ekonomi',
        'Sosiologi',
        'Geografi',
        'Antropologi',
        'Bahasa dan Sastra Indonesia',
        'Bahasa dan Sastra Inggris'
      ))
    )
  )
);
comment on column public.products.subject is 'Optional subject category from daftarmapel.md, validated by education level. NULL preserves legacy books; SMK uses the same subject list as SMA.';

-- Existing published-only and Editor level scope RLS policies remain in force.

-- ============================================================================
-- BAGIAN 11: KELAS BUKU
-- Penjelasan: Menambahkan kelas opsional dan memvalidasi pasangan kelas dengan jenjang pendidikan.
-- Sumber: migrations/202610090001_book_grades.sql
-- ============================================================================

alter table public.products add column if not exists grade smallint;

alter table public.products drop constraint if exists products_grade_matches_level;
alter table public.products add constraint products_grade_matches_level check (
  grade is null or (
    education_level is not null and (
      (education_level = 'SD' and grade between 1 and 6) or
      (education_level = 'SMP' and grade between 7 and 9) or
      (education_level in ('SMA', 'SMK') and grade between 10 and 12)
    )
  )
);

create index if not exists products_published_level_grade_idx
  on public.products (education_level, grade) where published = true;

comment on column public.products.grade is
  'Optional school grade: SD 1-6, SMP 7-9, SMA/SMK 10-12. Existing books remain NULL.';

-- ============================================================================
-- BAGIAN 12: KEUNGGULAN BUKU
-- Penjelasan: Menambahkan daftar keunggulan buku dengan validasi jumlah dan panjang setiap poin.
-- Sumber: migrations/202610100001_book_highlights.sql
-- ============================================================================

alter table public.products
  add column if not exists highlights text[] not null default '{}'::text[];

create or replace function public.valid_book_highlights(items text[])
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select items is not null
    and cardinality(items) <= 6
    and (cardinality(items) = 0 or array_ndims(items) = 1)
    and not exists (
      select 1 from unnest(items) as point(value)
      where value is null
        or value !~ '[^[:space:]]'
        or char_length(btrim(value)) not between 1 and 200
    );
$$;

alter table public.products drop constraint if exists products_highlights_valid;
alter table public.products add constraint products_highlights_valid
  check (public.valid_book_highlights(highlights));

comment on column public.products.highlights is
  'Public book advantages: ordered list of at most six nonblank points, each up to 200 characters. Existing books default to an empty list.';

-- ============================================================================
-- BAGIAN 13: AGREGASI JUMLAH KATALOG
-- Penjelasan: Membuat RPC jumlah buku per jenjang dan mapel tanpa mengunduh seluruh metadata produk.
-- Sumber: migrations/202610100002_catalog_aggregate_counts.sql
-- ============================================================================

-- Invoker permissions preserve RLS; explicit published checks also protect callers
-- with broader product visibility. Old clients remain compatible.
create or replace function public.catalog_level_counts()
returns table (education_level text, book_count bigint)
language sql stable security invoker set search_path = ''
as $$
  select p.education_level, count(*)
  from public.products as p
  where p.published = true and p.education_level is not null
  group by p.education_level;
$$;

create or replace function public.catalog_subject_counts(
  search_text text default '',
  filter_level text default null,
  filter_grade integer default null,
  filter_featured boolean default null
)
returns table (subject text, book_count bigint)
language sql stable security invoker set search_path = ''
as $$
  select p.subject, count(*)
  from public.products as p
  where p.published = true
    and p.subject is not null
    and (filter_level is null or p.education_level = filter_level)
    and (filter_grade is null or p.grade = filter_grade)
    and (filter_featured is null or p.featured = filter_featured)
    and (
      coalesce(search_text, '') = ''
      or p.title ilike '%' || search_text || '%'
      or p.author ilike '%' || search_text || '%'
      or p.book_code ilike '%' || search_text || '%'
      or p.subject ilike '%' || search_text || '%'
    )
  group by p.subject;
$$;

revoke all on function public.catalog_level_counts() from public;
revoke all on function public.catalog_subject_counts(text, text, integer, boolean) from public;
grant execute on function public.catalog_level_counts() to anon, authenticated;
grant execute on function public.catalog_subject_counts(text, text, integer, boolean) to anon, authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- BAGIAN 14: DIVISI BUKU
-- Penjelasan: Menambahkan kode divisi opsional dengan enam pilihan awal, terpisah dari otorisasi jenjang.
-- Sumber: migrations/202610130001_book_divisions.sql
-- ============================================================================

-- Expand only: existing books keep NULL until their division is confirmed.
alter table public.products add column if not exists division_code text;

alter table public.products drop constraint if exists products_division_code_valid;
alter table public.products add constraint products_division_code_valid check (
  division_code is null or division_code in (
    'sd-1-mipa',
    'sd-2-ips-bhs',
    'smp-sma-mipa',
    'smk',
    'phibeta',
    'intelecto'
  )
);

comment on column public.products.division_code is
  'Optional fixed book division code: sd-1-mipa (SD 1 MIPA), sd-2-ips-bhs (SD 2 IPS BHS), smp-sma-mipa (SMP/SMA MIPA), smk (SMK), phibeta (PHIBETA), intelecto (INTELECTO). One division per book; existing books remain NULL. Independent of education level and Editor authorization.';

-- ============================================================================
-- BAGIAN 15: SINOPSIS DAN TARGET PASAR
-- Penjelasan: Menambahkan sinopsis dan label target pasar tanpa menebak isinya dari data deskripsi lama.
-- Sumber: migrations/202610130002_book_synopsis_target_market.sql
-- ============================================================================

-- Expand only: keep description for existing API readers and Editor writers.
-- Do not assume that legacy short descriptions are complete book synopses.
alter table public.products add column if not exists synopsis text;
alter table public.products
  add column if not exists target_market text[] not null default '{}'::text[];

alter table public.products drop constraint if exists products_synopsis_valid;
alter table public.products add constraint products_synopsis_valid check (
  synopsis is null or (
    char_length(synopsis) <= 20000
    and synopsis ~ '[^[:space:]]'
  )
);

create or replace function public.valid_book_target_market(items text[])
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select items is not null
    and cardinality(items) <= 10
    and (cardinality(items) = 0 or array_ndims(items) = 1)
    and not exists (
      select 1 from unnest(items) as audience(value)
      where value is null
        or value !~ '[^[:space:]]'
        or char_length(value) not between 1 and 200
    );
$$;

alter table public.products drop constraint if exists products_target_market_valid;
alter table public.products add constraint products_target_market_valid
  check (public.valid_book_target_market(target_market));

comment on column public.products.synopsis is
  'Public book synopsis replacing the Contents section. Optional, nonblank text up to 20000 characters. Existing books remain NULL pending editorial review; legacy description is not copied automatically.';
comment on column public.products.target_market is
  'Public intended audience replacing Benefits: ordered list of at most ten nonblank labels, each up to 200 characters. Empty means not yet provided. Labels are editorial content, not Auth roles or Editor scopes.';
comment on column public.products.description is
  'Legacy short description retained for existing API and Editor compatibility. The revised detail design removes the short-description section and uses synopsis for Contents. Do not drop until all readers and writers have migrated.';

-- ============================================================================
-- BAGIAN 16: POPULARITAS DAN KOLEKSI KATALOG
-- Penjelasan: Membuat ledger akses harian, counter popularitas, serta RPC kelompok jenjang dan divisi.
-- Sumber: migrations/202610130003_catalog_popularity.sql
-- ============================================================================

create table if not exists public.product_access_days (
  product_id uuid not null references public.products(id) on delete cascade,
  visitor_id uuid not null,
  access_day date not null,
  primary key (product_id, visitor_id, access_day)
);
create table if not exists public.product_access_stats (
  product_id uuid primary key references public.products(id) on delete cascade,
  access_count bigint not null default 0 check (access_count >= 0)
);
alter table public.product_access_days enable row level security;
alter table public.product_access_stats enable row level security;
revoke all on public.product_access_days, public.product_access_stats from anon, authenticated;
grant select on public.product_access_stats to anon, authenticated;
drop policy if exists "Public published book statistics" on public.product_access_stats;
create policy "Public published book statistics" on public.product_access_stats
  for select to anon, authenticated using (
    exists (select 1 from public.products p where p.id = product_id and p.published = true)
  );

-- Only this narrowly scoped function may record anonymous accesses.
-- No client-controlled day, count, or draft access is accepted.
create or replace function public.record_product_access(book_slug text, visitor uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  book_id uuid;
  inserted_id uuid;
begin
  if visitor is null then
    raise exception 'Visitor is required' using errcode = '22023';
  end if;
  select p.id into book_id from public.products p
    where p.slug = book_slug and p.published = true for share;
  if book_id is null then
    return false;
  end if;
  insert into public.product_access_days (product_id, visitor_id, access_day)
    values (book_id, visitor, (pg_catalog.now() at time zone 'UTC')::date)
    on conflict do nothing returning product_id into inserted_id;
  if inserted_id is not null then
    insert into public.product_access_stats (product_id, access_count) values (book_id, 1)
      on conflict (product_id) do update
        set access_count = public.product_access_stats.access_count + 1;
  end if;
  return true;
end;
$$;
revoke all on function public.record_product_access(text, uuid) from public, anon, authenticated;
grant execute on function public.record_product_access(text, uuid) to anon, authenticated;

-- One request supplies counts and up to four accessed books per group.
-- Explicit columns exclude private storage paths from anonymous responses.
create or replace function public.catalog_browse_groups(group_kind text)
returns table (group_code text, book_count bigint, books jsonb)
language sql
stable
security invoker
set search_path = ''
as $$
  with groups as (
    select code, position from pg_catalog.unnest(
      case group_kind
        when 'level' then array['SD', 'SMP', 'SMA', 'SMK']
        when 'division' then array['sd-1-mipa', 'sd-2-ips-bhs', 'smp-sma-mipa', 'smk', 'phibeta', 'intelecto']
        else array[]::text[]
      end
    ) with ordinality as g(code, position)
  ), catalog as (
    select p.id, p.slug, p.title, p.author, p.description, p.highlights, p.price,
      p.image_path, p.featured, p.book_code, p.education_level, p.grade, p.subject,
      p.publication_year, p.created_at,
      case group_kind when 'level' then p.education_level else p.division_code end as code,
      coalesce(s.access_count, 0) as access_count
    from public.products p
    left join public.product_access_stats s on s.product_id = p.id
    where p.published = true
  )
  select g.code,
    (select count(*) from catalog c where c.code = g.code),
    coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(top_books) - 'created_at' - 'code' - 'access_count'
        order by top_books.access_count desc, top_books.created_at desc, top_books.id)
      from (
        select c.* from catalog c where c.code = g.code and c.access_count > 0
        order by c.access_count desc, c.created_at desc, c.id limit 4
      ) top_books
    ), '[]'::jsonb)
  from groups g order by g.position;
$$;
revoke all on function public.catalog_browse_groups(text) from public, anon, authenticated;
grant execute on function public.catalog_browse_groups(text) to anon, authenticated;

-- Preserve the existing facet RPC signature for old clients.
create or replace function public.catalog_division_subject_counts(
  filter_division text,
  search_text text default '',
  filter_level text default null,
  filter_grade integer default null,
  filter_featured boolean default null
)
returns table (subject text, book_count bigint)
language sql stable security invoker set search_path = ''
as $$
  select p.subject, count(*) from public.products p
  where p.published = true and p.subject is not null
    and p.division_code = filter_division
    and (filter_level is null or p.education_level = filter_level)
    and (filter_grade is null or p.grade = filter_grade)
    and (filter_featured is null or p.featured = filter_featured)
    and (
      coalesce(search_text, '') = ''
      or p.title ilike '%' || search_text || '%'
      or p.author ilike '%' || search_text || '%'
      or p.book_code ilike '%' || search_text || '%'
      or p.subject ilike '%' || search_text || '%'
    )
  group by p.subject;
$$;
revoke all on function public.catalog_division_subject_counts(text, text, text, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.catalog_division_subject_counts(text, text, text, integer, boolean)
  to anon, authenticated;

comment on table public.product_access_days is
  'Private deduplication ledger: one published book access per browser identifier per UTC day. Not a verified unique-person count.';
comment on table public.product_access_stats is
  'Lifetime deduplicated browser-day accesses. Updated atomically by record_product_access only.';

notify pgrst, 'reload schema';

-- ============================================================================
-- BAGIAN 17: PREVIEW FLYER HISTORIS
-- Penjelasan: Menyiapkan preview slide Flyer versi lama; kolom ini diarsipkan dan dihapus pada bagian 20.
-- Sumber: migrations/202610130004_flyer_slide_previews.sql
-- ============================================================================

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

-- ============================================================================
-- BAGIAN 18: METADATA BUKU PADA RANKING
-- Penjelasan: Melengkapi hasil RPC ranking dengan metadata publik buku tanpa mengekspos materi privat.
-- Sumber: migrations/202610130005_catalog_browse_book_details.sql
-- ============================================================================

-- Include public detail fields in catalog browse RPC results without exposing storage paths.
create or replace function public.catalog_browse_groups(group_kind text)
returns table (group_code text, book_count bigint, books jsonb)
language sql
stable
security invoker
set search_path = ''
as $$
  with groups as (
    select code, position from pg_catalog.unnest(
      case group_kind
        when 'level' then array['SD', 'SMP', 'SMA', 'SMK']
        when 'division' then array['sd-1-mipa', 'sd-2-ips-bhs', 'smp-sma-mipa', 'smk', 'phibeta', 'intelecto']
        else array[]::text[]
      end
    ) with ordinality as g(code, position)
  ), catalog as (
    select p.id, p.slug, p.title, p.author, p.description, p.division_code, p.synopsis,
      p.target_market, p.highlights, p.price, p.image_path, p.featured, p.book_code,
      p.education_level, p.grade, p.subject, p.publication_year, p.created_at,
      case group_kind when 'level' then p.education_level else p.division_code end as code,
      coalesce(s.access_count, 0) as access_count
    from public.products p
    left join public.product_access_stats s on s.product_id = p.id
    where p.published = true
  )
  select g.code,
    (select count(*) from catalog c where c.code = g.code),
    coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(top_books) - 'created_at' - 'code' - 'access_count'
        order by top_books.access_count desc, top_books.created_at desc, top_books.id)
      from (
        select c.* from catalog c where c.code = g.code and c.access_count > 0
        order by c.access_count desc, c.created_at desc, c.id limit 4
      ) top_books
    ), '[]'::jsonb)
  from groups g order by g.position;
$$;

revoke all on function public.catalog_browse_groups(text) from public, anon, authenticated;
grant execute on function public.catalog_browse_groups(text) to anon, authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- BAGIAN 19: PREVIEW PRESENTASI HISTORIS
-- Penjelasan: Menyiapkan metadata gambar slide PPT versi lama sebelum beralih ke PDF tampilan.
-- Sumber: migrations/202610130006_product_presentation_previews.sql
-- ============================================================================

-- Correct the presentation owner without moving or deleting previously uploaded files.
alter table public.products add column if not exists product_knowledge_slide_paths text[] not null default '{}';

create or replace function public.valid_presentation_slides(product_id uuid, paths text[])
returns boolean language sql immutable set search_path = '' as $$
  select paths is not null
    and coalesce(array_ndims(paths), 1) = 1
    and cardinality(paths) <= 20
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
    and (cardinality(product_knowledge_slide_paths) = 0 or
      (product_knowledge_path is not null and product_knowledge_path ~ '\.(ppt|pptx)$')));

create or replace function public.can_manage_book_material(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.products p
    where (
      object_name ~ '^books/[0-9a-f-]{36}/(flyer|dummy|product-knowledge)/[0-9a-f-]{36}\.(pdf|ppt|pptx)$'
      or object_name ~ '^books/[0-9a-f-]{36}/(flyer-slides|presentation-slides)/[0-9a-f-]{36}\.(png|jpg)$'
    )
    and p.id::text = split_part(object_name, '/', 2)
    and public.can_manage_book_level(p.education_level)
  );
$$;
revoke all on function public.can_manage_book_material(text) from public;
grant execute on function public.can_manage_book_material(text) to authenticated;

-- Retain authenticated access to old flyer previews for rollback; new readers use PPT Produk.
create or replace function public.can_access_public_book_material(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.products p
    where p.published and p.id::text = split_part(object_name, '/', 2)
      and (object_name in (p.flyer_path, p.dummy_book_path, p.product_knowledge_path)
        or object_name = any(p.flyer_slide_paths)
        or object_name = any(p.product_knowledge_slide_paths))
  );
$$;
revoke all on function public.can_access_public_book_material(text) from public, anon;
grant execute on function public.can_access_public_book_material(text) to authenticated;

comment on column public.products.product_knowledge_slide_paths is 'Ordered private PNG/JPG previews of PPT Produk in book-materials; replaced after original PPT/PPTX upload.';
comment on column public.products.flyer_slide_paths is 'Legacy preview metadata retained for rollback; current Flyer uploads use PDF and clear this list.';

-- ============================================================================
-- BAGIAN 20: ARSIP DAN CLEANUP KOLOM LAMA
-- Penjelasan: Mengarsipkan deskripsi dan preview Flyer lama ke schema privat, lalu menghapus kolom yang tidak dipakai.
-- Sumber: migrations/202610140001_remove_legacy_product_columns.sql
-- ============================================================================

-- Run only after deploying readers/writers that no longer require these columns.
-- Keep uploads paused during rollout; older Flyer writers clear legacy previews.
lock table public.products in access exclusive mode;

-- Preserve exact legacy values privately, without treating short descriptions as synopses.
create schema if not exists catalog_cleanup_archive;
revoke all on schema catalog_cleanup_archive from public, anon, authenticated;
create table if not exists catalog_cleanup_archive.product_legacy_columns (
  product_id uuid primary key,
  description text not null,
  flyer_slide_paths text[] not null,
  archived_at timestamptz not null default now()
);
alter table catalog_cleanup_archive.product_legacy_columns enable row level security;
revoke all on catalog_cleanup_archive.product_legacy_columns from public, anon, authenticated;

do $$
declare
  legacy_columns integer;
begin
  select count(*) into legacy_columns from information_schema.columns
    where table_schema = 'public' and table_name = 'products'
      and column_name in ('description', 'flyer_slide_paths');
  if legacy_columns = 1 then
    raise exception 'Partial legacy schema: restore missing column before running cleanup';
  elsif legacy_columns = 2 then
    execute 'insert into catalog_cleanup_archive.product_legacy_columns
      (product_id, description, flyer_slide_paths)
      select id, description, flyer_slide_paths from public.products
      on conflict (product_id) do update set
        description = excluded.description,
        flyer_slide_paths = excluded.flyer_slide_paths,
        archived_at = now()';
    if exists (
      select 1 from public.products p
      left join catalog_cleanup_archive.product_legacy_columns a on a.product_id = p.id
      where a.product_id is null
        or a.description is distinct from (to_jsonb(p)->>'description')
        or to_jsonb(a.flyer_slide_paths) is distinct from (to_jsonb(p)->'flyer_slide_paths')
    ) then
      raise exception 'Legacy archive verification failed';
    end if;
  end if;
end;
$$;

-- Keep the same published-only and authenticated storage boundaries.
create or replace function public.can_access_public_book_material(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.products p
    where p.published and p.id::text = split_part(object_name, '/', 2)
      and (object_name in (p.flyer_path, p.dummy_book_path, p.product_knowledge_path)
        or object_name = any(p.product_knowledge_slide_paths))
  );
$$;
revoke all on function public.can_access_public_book_material(text) from public, anon;
grant execute on function public.can_access_public_book_material(text) to authenticated;

create or replace function public.can_manage_book_material(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.products p
    where (
      object_name ~ '^books/[0-9a-f-]{36}/(flyer|dummy|product-knowledge)/[0-9a-f-]{36}\.(pdf|ppt|pptx)$'
      or object_name ~ '^books/[0-9a-f-]{36}/presentation-slides/[0-9a-f-]{36}\.(png|jpg)$'
    )
    and p.id::text = split_part(object_name, '/', 2)
    and public.can_manage_book_level(p.education_level)
  );
$$;
revoke all on function public.can_manage_book_material(text) from public;
grant execute on function public.can_manage_book_material(text) to authenticated;

-- Keep the JSON API description key as a synopsis alias for existing consumers.
create or replace function public.catalog_browse_groups(group_kind text)
returns table (group_code text, book_count bigint, books jsonb)
language sql stable security invoker set search_path = '' as $$
  with groups as (
    select code, position from pg_catalog.unnest(
      case group_kind
        when 'level' then array['SD', 'SMP', 'SMA', 'SMK']
        when 'division' then array['sd-1-mipa', 'sd-2-ips-bhs', 'smp-sma-mipa', 'smk', 'phibeta', 'intelecto']
        else array[]::text[]
      end
    ) with ordinality as g(code, position)
  ), catalog as (
    select p.id, p.slug, p.title, p.author, coalesce(p.synopsis, '') as description,
      p.division_code, p.synopsis, p.target_market, p.highlights, p.price, p.image_path,
      p.featured, p.book_code, p.education_level, p.grade, p.subject, p.publication_year,
      p.created_at,
      case group_kind when 'level' then p.education_level else p.division_code end as code,
      coalesce(s.access_count, 0) as access_count
    from public.products p
    left join public.product_access_stats s on s.product_id = p.id
    where p.published = true
  )
  select g.code,
    (select count(*) from catalog c where c.code = g.code),
    coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(top_books) - 'created_at' - 'code' - 'access_count'
        order by top_books.access_count desc, top_books.created_at desc, top_books.id)
      from (
        select c.* from catalog c where c.code = g.code and c.access_count > 0
        order by c.access_count desc, c.created_at desc, c.id limit 4
      ) top_books
    ), '[]'::jsonb)
  from groups g order by g.position;
$$;
revoke all on function public.catalog_browse_groups(text) from public, anon, authenticated;
grant execute on function public.catalog_browse_groups(text) to anon, authenticated;

alter table public.products drop constraint if exists products_flyer_slides_valid;
alter table public.products drop column if exists flyer_slide_paths;
alter table public.products drop column if exists description;
drop function if exists public.valid_flyer_slides(uuid, text[]);

notify pgrst, 'reload schema';

-- ============================================================================
-- BAGIAN 21: FLYER DAN PPT PUBLIK
-- Penjelasan: Mengizinkan akses Flyer/PPT buku published tanpa login; Dummy dan materi draf tetap terlindungi.
-- Sumber: migrations/202610140002_public_promotional_materials.sql
-- ============================================================================

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

-- ============================================================================
-- BAGIAN 22: KURIKULUM DAN ISBN
-- Penjelasan: Menambahkan metadata kurikulum/ISBN opsional serta memasukkannya ke hasil RPC ranking.
-- Sumber: migrations/202610140003_book_curriculum_isbn.sql
-- ============================================================================

-- Optional public metadata. Do not rewrite books, UUIDs, timestamps, or references.
alter table public.products add column if not exists curriculum text;
alter table public.products add column if not exists isbn text;
alter table public.products drop constraint if exists products_curriculum_valid;
alter table public.products add constraint products_curriculum_valid
  check (curriculum is null or (char_length(curriculum) between 1 and 200
    and curriculum ~ '[^[:space:]]' and curriculum = btrim(curriculum)));
alter table public.products drop constraint if exists products_isbn_format;
alter table public.products add constraint products_isbn_format
  check (isbn is null or isbn ~ '^([0-9]{9}[0-9X]|[0-9]{13})$');
comment on column public.products.curriculum is 'Optional free-text curriculum label, at most 200 characters.';
comment on column public.products.isbn is 'Optional ISBN-10 or ISBN-13 text without spaces/hyphens; uppercase X allowed only as final ISBN-10 character. Format validation only, no checksum validation or uniqueness requirement.';

-- Keep ranking and public visibility unchanged while including the new detail fields.
create or replace function public.catalog_browse_groups(group_kind text)
returns table (group_code text, book_count bigint, books jsonb)
language sql stable security invoker set search_path = '' as $$
  with groups as (
    select code, position from pg_catalog.unnest(
      case group_kind
        when 'level' then array['SD', 'SMP', 'SMA', 'SMK']
        when 'division' then array['sd-1-mipa', 'sd-2-ips-bhs', 'smp-sma-mipa', 'smk', 'phibeta', 'intelecto']
        else array[]::text[]
      end
    ) with ordinality as g(code, position)
  ), catalog as (
    select p.id, p.slug, p.title, p.author, p.curriculum, p.isbn,
      coalesce(p.synopsis, '') as description, p.division_code, p.synopsis, p.target_market,
      p.highlights, p.price, p.image_path, p.featured, p.book_code, p.education_level,
      p.grade, p.subject, p.publication_year, p.created_at,
      case group_kind when 'level' then p.education_level else p.division_code end as code,
      coalesce(s.access_count, 0) as access_count
    from public.products p
    left join public.product_access_stats s on s.product_id = p.id
    where p.published = true
  )
  select g.code,
    (select count(*) from catalog c where c.code = g.code),
    coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(top_books) - 'created_at' - 'code' - 'access_count'
        order by top_books.access_count desc, top_books.created_at desc, top_books.id)
      from (
        select c.* from catalog c where c.code = g.code and c.access_count > 0
        order by c.access_count desc, c.created_at desc, c.id limit 4
      ) top_books
    ), '[]'::jsonb)
  from groups g order by g.position;
$$;
revoke all on function public.catalog_browse_groups(text) from public, anon, authenticated;
grant execute on function public.catalog_browse_groups(text) to anon, authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- BAGIAN 23: STATUS CONVERTER HISTORIS
-- Penjelasan: Menyiapkan status converter PPT versi lama; bagian berikutnya mengarsipkan metadata dan menggantinya.
-- Sumber: migrations/202610140004_server_presentation_previews.sql
-- ============================================================================

-- Static slide previews generated by the trusted LibreOffice converter.
-- Re-create the path column when a previous cleanup removed it; existing values stay intact.
alter table public.products
  add column if not exists product_knowledge_slide_paths text[] not null default '{}';
alter table public.products
  add column if not exists product_knowledge_preview_status text not null default 'none';
alter table public.products
  add column if not exists product_knowledge_preview_error text;

update public.products
set product_knowledge_preview_status = case
  when product_knowledge_path is null then 'none'
  when cardinality(product_knowledge_slide_paths) > 0 then 'ready'
  else 'failed'
end
where product_knowledge_preview_status = 'none';

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
      object_name ~ '^books/[0-9a-f-]{36}/(flyer|dummy|product-knowledge)/[0-9a-f-]{36}\.(pdf|ppt|pptx)$'
      or object_name ~ '^books/[0-9a-f-]{36}/presentation-slides/[0-9a-f-]{36}\.(png|jpg)$'
    )
    and p.id::text = split_part(object_name, '/', 2)
    and public.can_manage_book_level(p.education_level)
  );
$$;
revoke all on function public.can_manage_book_material(text) from public;
grant execute on function public.can_manage_book_material(text) to authenticated;

-- Published Flyer, original PowerPoint, and generated slides are public. Dummy stays login-only.
create or replace function public.can_access_public_book_material(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.products p
    where p.published and p.id::text = split_part(object_name, '/', 2)
      and (
        (object_name in (p.flyer_path, p.product_knowledge_path)
          and object_name is distinct from p.dummy_book_path)
        or object_name = any(p.product_knowledge_slide_paths)
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

comment on column public.products.product_knowledge_slide_paths is
  'Ordered JPG previews generated from the current PowerPoint by the trusted converter.';
comment on column public.products.product_knowledge_preview_status is
  'PowerPoint conversion lifecycle: none, processing, ready, or failed.';
comment on column public.products.product_knowledge_preview_error is
  'Short operator-safe conversion failure message; never contains document contents or secrets.';

notify pgrst, 'reload schema';

-- ============================================================================
-- BAGIAN 24: PDF TAMPILAN DAN POWERPOINT UNDUHAN
-- Penjelasan: Menambahkan PDF preview unggahan manual, memperbarui akses Storage, dan mengarsipkan kolom converter lama.
-- Sumber: migrations/202610140005_manual_product_knowledge_pdf.sql
-- ============================================================================

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

-- ============================================================================
-- BAGIAN 25: BUKU PILIHAN BERANDA
-- Penjelasan: Membatasi pilihan global menjadi delapan buku dan menyediakan RPC perubahan atomik sesuai scope Editor.
-- Sumber: migrations/202610150001_featured_books_limit.sql
-- ============================================================================

create function public.lock_featured_products()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(742015, 8);
  return null;
end;
$$;

create function public.enforce_featured_products_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.products where featured) > 8 then
    raise exception using
      errcode = 'P0001',
      message = 'featured_product_limit_exceeded';
  end if;
  return null;
end;
$$;

create trigger products_featured_limit_lock
before insert or update of featured on public.products
for each statement execute function public.lock_featured_products();

create trigger products_featured_limit_check
after insert or update of featured on public.products
for each statement execute function public.enforce_featured_products_limit();

create function public.featured_products_count()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.account_memberships
    where user_id = (select auth.uid()) and role = 'editor'
  ) then
    raise exception using errcode = '42501', message = 'editor_required';
  end if;

  return (select count(*)::integer from public.products where featured);
end;
$$;

create function public.set_featured_books(selected_book_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_ids uuid[] := coalesce(selected_book_ids, '{}'::uuid[]);
begin
  if not exists (
    select 1 from public.account_memberships
    where user_id = (select auth.uid()) and role = 'editor'
  ) then
    raise exception using errcode = '42501', message = 'editor_required';
  end if;

  if cardinality(selected_ids) > 8
    or cardinality(selected_ids) <> (select count(distinct id) from unnest(selected_ids) as ids(id))
  then
    raise exception using errcode = '22023', message = 'invalid_featured_books';
  end if;

  perform pg_advisory_xact_lock(742015, 8);

  if exists (
    select 1
    from unnest(selected_ids) as ids(id)
    left join public.products as product on product.id = ids.id
    where product.id is null
      or not public.can_manage_book_level(product.education_level)
  ) then
    raise exception using errcode = '42501', message = 'featured_book_out_of_scope';
  end if;

  update public.products as product
  set featured = product.id = any(selected_ids)
  where public.can_manage_book_level(product.education_level)
    and product.featured is distinct from (product.id = any(selected_ids));

  return (select count(*)::integer from public.products where featured);
end;
$$;

revoke all on function public.lock_featured_products() from public, anon, authenticated;
revoke all on function public.enforce_featured_products_limit() from public, anon, authenticated;
revoke all on function public.featured_products_count() from public, anon;
revoke all on function public.set_featured_books(uuid[]) from public, anon;
grant execute on function public.featured_products_count() to authenticated;
grant execute on function public.set_featured_books(uuid[]) to authenticated;

-- ============================================================================
-- BAGIAN 26: JUDUL BOLEH SAMA
-- Penjelasan: Mencabut indeks judul unik; kode buku dan slug tetap menjadi identifier unik masing-masing.
-- Sumber: migrations/202610150002_allow_duplicate_book_titles.sql
-- ============================================================================

drop index if exists public.products_title_unique;

-- ============================================================================
-- BAGIAN 27: REGISTRY KLASIFIKASI BUKU
-- Penjelasan: Membuat opsi kurikulum/divisi/mapel, mengisi daftar awal, serta mengganti validasi statis dengan registry.
-- Sumber: migrations/202610150004_book_classifications.sql
-- ============================================================================

-- Additive registry. Products, UUIDs, and existing references are retained.
create table if not exists public.book_classifications (
  kind text not null check (kind in ('curriculum', 'division', 'subject')),
  code text not null check (char_length(code) between 1 and 200),
  name text not null check (char_length(name) between 1 and 200 and name = btrim(name) and name ~ '[^[:space:]]'),
  education_level text not null default '',
  position bigint generated by default as identity,
  primary key (kind, code, education_level),
  check ((kind = 'subject' and education_level in ('SD', 'SMP', 'SMA', 'SMK')) or (kind <> 'subject' and education_level = '')),
  check (kind <> 'division' or (char_length(code) <= 100 and code ~ '^[a-z0-9]+(-[a-z0-9]+)*$')),
  check (kind <> 'subject' or code = name)
);
create unique index if not exists book_classifications_name_unique
  on public.book_classifications (kind, lower(name), education_level);

insert into public.book_classifications (kind, code, name) values
  ('division', 'sd-1-mipa', 'SD 1 MIPA'),
  ('division', 'sd-2-ips-bhs', 'SD 2 IPS BHS'),
  ('division', 'smp-sma-mipa', 'SMP/SMA MIPA'),
  ('division', 'smk', 'SMK'),
  ('division', 'phibeta', 'PHIBETA'),
  ('division', 'intelecto', 'INTELECTO')
on conflict do nothing;

with subjects as (
  select level, unnest(array[
    'Pendidikan Agama dan Budi Pekerti', 'Pendidikan Pancasila', 'Bahasa Indonesia',
    'Matematika', 'Bahasa Inggris', 'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)'
  ]) as name from unnest(array['SD', 'SMP', 'SMA', 'SMK']) as level
  union all
  select 'SD', unnest(array['Ilmu Pengetahuan Alam dan Sosial (IPAS)', 'Seni dan Budaya', 'Muatan Lokal (Bahasa Daerah)'])
  union all
  select 'SMP', unnest(array['Ilmu Pengetahuan Alam (IPA)', 'Ilmu Pengetahuan Sosial (IPS)', 'Informatika', 'Seni dan Prakarya', 'Muatan Lokal (Bahasa Daerah)'])
  union all
  select level, unnest(array['Sejarah', 'Seni dan Budaya', 'Informatika', 'Biologi', 'Fisika', 'Kimia', 'Matematika Lanjutan', 'Ekonomi', 'Sosiologi', 'Geografi', 'Antropologi', 'Bahasa dan Sastra Indonesia', 'Bahasa dan Sastra Inggris'])
  from unnest(array['SMA', 'SMK']) as level
)
insert into public.book_classifications (kind, code, name, education_level)
select 'subject', name, name, level from subjects on conflict do nothing;

-- Include public curriculum labels without modifying existing book metadata.
insert into public.book_classifications (kind, code, name)
select 'curriculum', curriculum, curriculum from (
  select distinct on (lower(curriculum)) curriculum from public.products
  where curriculum is not null and published = true order by lower(curriculum), curriculum
) labels on conflict do nothing;

alter table public.book_classifications enable row level security;
revoke all on public.book_classifications from public, anon, authenticated;
grant select on public.book_classifications to anon, authenticated;
grant insert (kind, code, name, education_level) on public.book_classifications to authenticated;
grant usage on sequence public.book_classifications_position_seq to authenticated;
drop policy if exists classifications_public_read on public.book_classifications;
create policy classifications_public_read on public.book_classifications for select to anon, authenticated using (true);
drop policy if exists classifications_editor_insert on public.book_classifications;
create policy classifications_editor_insert on public.book_classifications for insert to authenticated
with check (
  exists (select 1 from public.account_memberships m
    where m.user_id = (select auth.uid()) and m.role = 'editor'
      and (m.is_super or exists (select 1 from public.editor_scopes s where s.user_id = m.user_id)))
  and (kind <> 'subject' or public.has_editor_scope(education_level))
);

alter table public.products drop constraint if exists products_division_code_valid;
alter table public.products drop constraint if exists products_subject_level_valid;
-- Validate at the database boundary as well as in the server repository.
create or replace function public.validate_product_classifications()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.division_code is not null and not exists (
    select 1 from public.book_classifications where kind = 'division' and code = new.division_code
  ) then raise exception 'Divisi belum terdaftar' using errcode = '23514'; end if;
  if new.subject is not null and not exists (
    select 1 from public.book_classifications where kind = 'subject'
      and name = new.subject and education_level = new.education_level
  ) then raise exception 'Mata pelajaran tidak sesuai jenjang' using errcode = '23514'; end if;
  return new;
end;
$$;
drop trigger if exists products_classifications_valid on public.products;
create trigger products_classifications_valid before insert or update on public.products
for each row execute function public.validate_product_classifications();

create or replace function public.catalog_browse_groups(group_kind text)
returns table (group_code text, book_count bigint, books jsonb)
language sql stable security invoker set search_path = '' as $$
  with groups as (
    select code, position from public.book_classifications where group_kind = 'division' and kind = 'division'
    union all
    select code, position from pg_catalog.unnest(array['SD', 'SMP', 'SMA', 'SMK']) with ordinality as g(code, position)
    where group_kind = 'level'
  ), catalog as (
    select p.id, p.slug, p.title, p.author, p.curriculum, p.isbn,
      coalesce(p.synopsis, '') as description, p.division_code, p.synopsis, p.target_market,
      p.highlights, p.price, p.image_path, p.featured, p.book_code, p.education_level,
      p.grade, p.subject, p.publication_year, p.created_at,
      case group_kind when 'level' then p.education_level else p.division_code end as code,
      coalesce(s.access_count, 0) as access_count
    from public.products p left join public.product_access_stats s on s.product_id = p.id
    where p.published = true
  )
  select g.code, (select count(*) from catalog c where c.code = g.code),
    coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(top_books) - 'created_at' - 'code' - 'access_count'
      order by top_books.access_count desc, top_books.created_at desc, top_books.id)
      from (select c.* from catalog c where c.code = g.code and c.access_count > 0
        order by c.access_count desc, c.created_at desc, c.id limit 4) top_books), '[]'::jsonb)
  from groups g order by g.position;
$$;
revoke all on function public.catalog_browse_groups(text) from public, anon, authenticated;
grant execute on function public.catalog_browse_groups(text) to anon, authenticated;
notify pgrst, 'reload schema';

-- ============================================================================
-- BAGIAN 28: RPC HAPUS KLASIFIKASI
-- Penjelasan: Menambahkan RPC hapus dengan pemeriksaan scope dan referensi buku; perlindungan bawaan historis dicabut pada bagian 29.
-- Sumber: migrations/202610150005_delete_book_classifications.sql
-- ============================================================================

alter table public.book_classifications add column if not exists is_builtin boolean not null default false;
-- Only the original six divisions and canonical level/subject pairs are protected.
update public.book_classifications set is_builtin = true where kind = 'division'
  and code in ('sd-1-mipa', 'sd-2-ips-bhs', 'smp-sma-mipa', 'smk', 'phibeta', 'intelecto');
with subjects as (
  select level, unnest(array[
    'Pendidikan Agama dan Budi Pekerti', 'Pendidikan Pancasila', 'Bahasa Indonesia',
    'Matematika', 'Bahasa Inggris', 'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)'
  ]) as name from unnest(array['SD', 'SMP', 'SMA', 'SMK']) as level
  union all
  select 'SD', unnest(array['Ilmu Pengetahuan Alam dan Sosial (IPAS)', 'Seni dan Budaya', 'Muatan Lokal (Bahasa Daerah)'])
  union all
  select 'SMP', unnest(array['Ilmu Pengetahuan Alam (IPA)', 'Ilmu Pengetahuan Sosial (IPS)', 'Informatika', 'Seni dan Prakarya', 'Muatan Lokal (Bahasa Daerah)'])
  union all
  select level, unnest(array['Sejarah', 'Seni dan Budaya', 'Informatika', 'Biologi', 'Fisika', 'Kimia', 'Matematika Lanjutan', 'Ekonomi', 'Sosiologi', 'Geografi', 'Antropologi', 'Bahasa dan Sastra Indonesia', 'Bahasa dan Sastra Inggris'])
  from unnest(array['SMA', 'SMK']) as level
)
update public.book_classifications c set is_builtin = true from subjects s
where c.kind = 'subject' and c.code = s.name and c.education_level = s.level;

-- No direct DELETE grant: this RPC alone checks all products, including hidden drafts.
-- The table lock serializes deletion with product writers so references cannot race.
create or replace function public.delete_book_classification(option_kind text, option_code text, option_level text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare target public.book_classifications%rowtype;
begin
  if not exists (
    select 1 from public.account_memberships m where m.user_id = (select auth.uid())
      and m.role = 'editor' and (m.is_super or exists (
        select 1 from public.editor_scopes s where s.user_id = m.user_id
      ))
  ) or (option_kind = 'subject' and not public.has_editor_scope(option_level)) then
    raise exception 'classification_forbidden' using errcode = '42501';
  end if;
  lock table public.products in share row exclusive mode;
  select * into target from public.book_classifications
    where kind = option_kind and code = option_code and education_level = option_level for update;
  if not found then return false; end if;
  if target.is_builtin then raise exception 'classification_builtin' using errcode = 'P0001'; end if;
  if exists (
    select 1 from public.products p where
      (target.kind = 'division' and p.division_code = target.code)
      or (target.kind = 'subject' and p.subject = target.name and p.education_level = target.education_level)
      or (target.kind = 'curriculum' and lower(btrim(p.curriculum)) = lower(target.name))
  ) then raise exception 'classification_in_use' using errcode = 'P0001'; end if;
  delete from public.book_classifications
    where kind = target.kind and code = target.code and education_level = target.education_level;
  return true;
end;
$$;
revoke all on function public.delete_book_classification(text, text, text) from public, anon, authenticated;
grant execute on function public.delete_book_classification(text, text, text) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- BAGIAN 29: SEMUA KLASIFIKASI DAPAT DIHAPUS
-- Penjelasan: Mengizinkan hapus permanen semua opsi yang tidak dipakai buku, termasuk divisi dan mapel awal.
-- Sumber: migrations/202610150006_delete_all_book_classifications.sql
-- ============================================================================

-- Remove the default-option restriction without changing registry rows or books.
-- is_builtin is retained only for schema compatibility with the preceding migration.
create or replace function public.delete_book_classification(option_kind text, option_code text, option_level text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare target public.book_classifications%rowtype;
begin
  if not exists (
    select 1 from public.account_memberships m where m.user_id = (select auth.uid())
      and m.role = 'editor' and (m.is_super or exists (
        select 1 from public.editor_scopes s where s.user_id = m.user_id
      ))
  ) or (option_kind = 'subject' and not public.has_editor_scope(option_level)) then
    raise exception 'classification_forbidden' using errcode = '42501';
  end if;
  lock table public.products in share row exclusive mode;
  select * into target from public.book_classifications
    where kind = option_kind and code = option_code and education_level = option_level for update;
  if not found then return false; end if;
  if exists (
    select 1 from public.products p where
      (target.kind = 'division' and p.division_code = target.code)
      or (target.kind = 'subject' and p.subject = target.name and p.education_level = target.education_level)
      or (target.kind = 'curriculum' and lower(btrim(p.curriculum)) = lower(target.name))
  ) then raise exception 'classification_in_use' using errcode = 'P0001'; end if;
  delete from public.book_classifications
    where kind = target.kind and code = target.code and education_level = target.education_level;
  return true;
end;
$$;
revoke all on function public.delete_book_classification(text, text, text) from public, anon, authenticated;
grant execute on function public.delete_book_classification(text, text, text) to authenticated;

notify pgrst, 'reload schema';

-- SELESAI: simpan seluruh perubahan setup secara atomik.
commit;
