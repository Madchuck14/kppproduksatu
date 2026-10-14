begin;

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
commit;
