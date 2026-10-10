begin;

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

commit;
