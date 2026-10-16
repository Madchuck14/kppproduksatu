begin;

-- Preserve existing selections and copy; restrict both legacy and hero RPC callers.
create or replace function public.featured_products_count()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.account_memberships
    where user_id = (select auth.uid()) and role = 'editor' and is_super
  ) then
    raise exception using errcode = '42501', message = 'super_editor_required';
  end if;

  return (select count(*)::integer from public.products where featured);
end;
$$;

create or replace function public.set_featured_books(selected_book_ids uuid[])
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
    where user_id = (select auth.uid()) and role = 'editor' and is_super
  ) then
    raise exception using errcode = '42501', message = 'super_editor_required';
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

create or replace function public.enforce_featured_super_editor()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (tg_op = 'INSERT' and new.featured)
    or (tg_op = 'UPDATE' and new.featured is distinct from old.featured) then
    -- Trusted database maintenance without a user JWT remains possible.
    if (select auth.uid()) is not null and not exists (
      select 1 from public.account_memberships
      where user_id = (select auth.uid()) and role = 'editor' and is_super
    ) then
      raise exception using errcode = '42501', message = 'super_editor_required';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_featured_super_editor() from public, anon, authenticated;
drop trigger if exists products_featured_super_editor on public.products;
create trigger products_featured_super_editor
  before insert or update of featured on public.products
  for each row execute function public.enforce_featured_super_editor();

notify pgrst, 'reload schema';
commit;
