begin;

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
commit;
