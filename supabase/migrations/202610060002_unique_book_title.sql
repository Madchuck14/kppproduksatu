begin;

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

commit;
