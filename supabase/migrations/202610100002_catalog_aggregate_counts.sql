begin;

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
commit;
