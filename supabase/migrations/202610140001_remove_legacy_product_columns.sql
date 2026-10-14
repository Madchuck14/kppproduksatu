begin;

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
commit;
