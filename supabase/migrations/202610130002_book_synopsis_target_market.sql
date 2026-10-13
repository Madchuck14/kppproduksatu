begin;

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

commit;
