begin;

create table public.product_structure_nodes (
  id uuid primary key default gen_random_uuid(),
  education_level text not null check (education_level in ('SD','SMP','SMA','SMK')),
  parent_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 200 and name ~ '[^[:space:]]'),
  sort_order integer not null default 0 check (sort_order >= 0),
  product_status text check (product_status is null or (char_length(btrim(product_status)) between 1 and 80 and product_status ~ '[^[:space:]]')),
  archived boolean not null default false,
  unique (id, education_level),
  foreign key (parent_id, education_level) references public.product_structure_nodes(id, education_level),
  check (parent_id is distinct from id)
);
create index product_structure_parent_idx on public.product_structure_nodes(education_level,parent_id,sort_order,id);
alter table public.products add column structure_node_id uuid references public.product_structure_nodes(id);
create index products_structure_node_idx on public.products(structure_node_id) where structure_node_id is not null;

-- Every topology write and every book placement write updates the same private row.
-- This serializes writers at READ COMMITTED. At REPEATABLE READ/SERIALIZABLE an
-- outdated writer fails with 40001 instead of validating against an old snapshot.
create schema if not exists product_structure_private;
revoke all on schema product_structure_private from public, anon, authenticated;
create table product_structure_private.write_guard (id boolean primary key check(id), revision bigint not null default 0);
insert into product_structure_private.write_guard(id) values(true);
create function public.lock_product_structure_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update product_structure_private.write_guard set revision = revision + 1 where id = true;
  return null;
end;
$$;
revoke all on function public.lock_product_structure_write() from public, anon, authenticated;
create trigger structure_serialize_writes before insert or update or delete on public.product_structure_nodes
  for each statement execute function public.lock_product_structure_write();
create trigger product_structure_serialize_writes before insert or update of structure_node_id,education_level on public.products
  for each statement execute function public.lock_product_structure_write();

create function public.validate_product_structure_node()
returns trigger language plpgsql security definer set search_path = '' as $$
declare parent_level text; parent_archived boolean;
begin
  if TG_OP = 'UPDATE' then
    if old.education_level <> new.education_level then raise exception 'structure_level_immutable' using errcode='22023'; end if;
    if old.archived then raise exception 'structure_archived' using errcode='22023'; end if;
  end if;
  if new.parent_id is not null then
    select education_level,archived into parent_level,parent_archived from public.product_structure_nodes where id=new.parent_id;
    if not found or parent_level <> new.education_level or parent_archived then
      raise exception 'structure_parent_invalid' using errcode='22023';
    end if;
    if exists (
      with recursive ancestors as (
        select id,parent_id from public.product_structure_nodes where id=new.parent_id
        union select n.id,n.parent_id from public.product_structure_nodes n join ancestors a on n.id=a.parent_id
      ) select 1 from ancestors where id=new.id
    ) then raise exception 'structure_cycle' using errcode='22023'; end if;
  end if;
  if new.archived then
    if exists (
      with recursive descendants as (
        select new.id as id
        union select n.id from public.product_structure_nodes n join descendants d on n.parent_id=d.id
      ) select 1 from public.products p join descendants d on p.structure_node_id=d.id
    ) then raise exception 'structure_in_use' using errcode='23514'; end if;
    if exists(select 1 from public.product_structure_nodes where parent_id=new.id and not archived) then
      raise exception 'structure_archive_children_first' using errcode='22023';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.validate_product_structure_node() from public, anon, authenticated;
create trigger validate_structure_node before insert or update on public.product_structure_nodes
  for each row execute function public.validate_product_structure_node();

create function public.validate_book_structure()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.structure_node_id is not null and not exists (
    select 1 from public.product_structure_nodes n where n.id=new.structure_node_id
      and n.education_level=new.education_level and not n.archived
  ) then raise exception 'book_structure_invalid' using errcode='23514'; end if;
  return new;
end;
$$;
revoke all on function public.validate_book_structure() from public, anon, authenticated;
create trigger validate_book_structure before insert or update of structure_node_id,education_level on public.products
  for each row execute function public.validate_book_structure();

alter table public.product_structure_nodes enable row level security;
revoke all on public.product_structure_nodes from public,anon,authenticated;
grant select on public.product_structure_nodes to anon,authenticated;
grant insert,update on public.product_structure_nodes to authenticated;
grant all on public.product_structure_nodes to service_role;
create policy structure_public_active on public.product_structure_nodes for select to anon,authenticated using(not archived);
create policy structure_super_read on public.product_structure_nodes for select to authenticated using(exists(
  select 1 from public.account_memberships m where m.user_id=(select auth.uid()) and m.role='editor' and m.is_super));
create policy structure_super_insert on public.product_structure_nodes for insert to authenticated with check(exists(
  select 1 from public.account_memberships m where m.user_id=(select auth.uid()) and m.role='editor' and m.is_super));
create policy structure_super_update on public.product_structure_nodes for update to authenticated using(exists(
  select 1 from public.account_memberships m where m.user_id=(select auth.uid()) and m.role='editor' and m.is_super)) with check(exists(
  select 1 from public.account_memberships m where m.user_id=(select auth.uid()) and m.role='editor' and m.is_super));

create function public.archive_product_structure_node(target_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare branch record; archived_count integer := 0;
begin
  if not exists(select 1 from public.account_memberships m where m.user_id=(select auth.uid()) and m.role='editor' and m.is_super) then
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
  ) then raise exception 'structure_in_use' using errcode='23514'; end if;
  for branch in
    with recursive descendants as (
      select id,0 as depth from public.product_structure_nodes where id=target_id
      union all select n.id,d.depth+1 from public.product_structure_nodes n join descendants d on n.parent_id=d.id
    ) select d.id from descendants d join public.product_structure_nodes n on n.id=d.id where not n.archived order by depth desc,d.id
  loop
    update public.product_structure_nodes set archived=true where id=branch.id;
    archived_count := archived_count+1;
  end loop;
  return archived_count;
end;
$$;
revoke all on function public.archive_product_structure_node(uuid) from public,anon;
grant execute on function public.archive_product_structure_node(uuid) to authenticated;

-- Intentionally no production seed: supplied diagrams are reference/test evidence.
notify pgrst,'reload schema';
commit;
