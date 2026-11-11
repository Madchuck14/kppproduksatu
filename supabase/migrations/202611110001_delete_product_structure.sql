begin;

-- Keep archive RPC/column for older clients and existing archived records.
-- No DELETE grant: only this checked RPC may remove an entire unused subtree.
create function public.delete_product_structure_node(target_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare deleted_count integer;
begin
  if not exists (
    select 1 from public.account_memberships m
    where m.user_id=(select auth.uid()) and m.role='editor' and m.is_super
  ) then
    raise exception 'structure_forbidden' using errcode='42501';
  end if;

  update product_structure_private.write_guard set revision=revision+1 where id=true;
  if not exists(select 1 from public.product_structure_nodes where id=target_id and not archived) then
    raise exception 'structure_missing' using errcode='22023';
  end if;

  if exists (
    with recursive descendants as (
      select id from public.product_structure_nodes where id=target_id
      union select n.id from public.product_structure_nodes n join descendants d on n.parent_id=d.id
    ) select 1 from public.products p join descendants d on p.structure_node_id=d.id
  ) then
    raise exception 'structure_in_use' using errcode='23514';
  end if;

  -- A single statement removes children and parents atomically, including any
  -- archived descendants. Foreign keys remain an additional reference boundary.
  with recursive descendants as (
    select id from public.product_structure_nodes where id=target_id
    union select n.id from public.product_structure_nodes n join descendants d on n.parent_id=d.id
  )
  delete from public.product_structure_nodes n using descendants d where n.id=d.id;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
revoke all on function public.delete_product_structure_node(uuid) from public,anon;
grant execute on function public.delete_product_structure_node(uuid) to authenticated;

notify pgrst,'reload schema';
commit;
