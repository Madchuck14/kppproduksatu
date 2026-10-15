begin;

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

commit;
