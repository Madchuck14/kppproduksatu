-- Run with uploads paused, before restoring the old application.
-- Keep the archive. Do not delete storage objects during cleanup or rollback.
begin;
lock table public.products in access exclusive mode;
alter table public.products add column if not exists description text not null default '';
alter table public.products add column if not exists flyer_slide_paths text[] not null default '{}';

-- Restore only archived fields; retain timestamps and current book content.
do $$
declare
  timestamp_trigger_enabled boolean;
begin
  select exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.products'::regclass
      and tgname = 'products_updated_at' and tgenabled = 'O'
  ) into timestamp_trigger_enabled;
  if timestamp_trigger_enabled then
    alter table public.products disable trigger products_updated_at;
  end if;
  update public.products p set description = a.description, flyer_slide_paths = a.flyer_slide_paths
    from catalog_cleanup_archive.product_legacy_columns a where a.product_id = p.id;
  if timestamp_trigger_enabled then
    alter table public.products enable trigger products_updated_at;
  end if;
end;
$$;

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
      or object_name ~ '^books/[0-9a-f-]{36}/(flyer-slides|presentation-slides)/[0-9a-f-]{36}\.(png|jpg)$'
    )
    and p.id::text = split_part(object_name, '/', 2)
    and public.can_manage_book_level(p.education_level)
  );
$$;
revoke all on function public.can_manage_book_material(text) from public;
grant execute on function public.can_manage_book_material(text) to authenticated;

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
commit;
