begin;

-- Self-reported profile labels, never an authorization scope.
create or replace function public.valid_sales_areas(areas text[])
returns boolean language plpgsql immutable set search_path = ''
as $$
declare area text;
begin
  if areas is null or cardinality(areas) > 10 then return false; end if;
  if cardinality(areas) > 0 and array_ndims(areas) <> 1 then return false; end if;
  foreach area in array areas loop
    if area is null or char_length(btrim(area)) not between 1 and 100
      or area !~ '[^[:space:]]' then return false; end if;
  end loop;
  return not exists (
    select 1 from unnest(areas) as a(value) group by lower(btrim(value)) having count(*) > 1
  );
end;
$$;
revoke all on function public.valid_sales_areas(text[]) from public, anon;
grant execute on function public.valid_sales_areas(text[]) to authenticated, service_role;

alter table public.account_memberships add column if not exists sales_areas text[] not null
  default '{}'::text[] constraint account_sales_areas_valid check (public.valid_sales_areas(sales_areas));
grant update (sales_areas) on public.account_memberships to authenticated;
drop policy if exists sales_update_own_areas on public.account_memberships;
create policy sales_update_own_areas on public.account_memberships
  for update to authenticated
  using (user_id = (select auth.uid()) and role = 'sales')
  with check (user_id = (select auth.uid()) and role = 'sales');

comment on column public.account_memberships.sales_areas is
  'Self-reported Sales areas. Profile only; not trusted IT assignment and never grants permissions.';
notify pgrst, 'reload schema';
commit;
