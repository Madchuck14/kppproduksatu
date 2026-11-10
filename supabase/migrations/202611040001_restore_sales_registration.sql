begin;

-- New Auth users always start as ordinary Sales, including direct Auth signups.
-- Never trust user-editable metadata for Editor, super access, or education scopes.
create or replace function public.assign_new_sales_account()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.account_memberships (user_id, role, is_super)
  values (new.id, 'sales', false)
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.assign_new_sales_account() from public, anon, authenticated;
drop trigger if exists auth_user_sales_account on auth.users;
create trigger auth_user_sales_account after insert on auth.users
  for each row execute function public.assign_new_sales_account();

-- Existing memberships and accounts without membership are deliberately preserved.
drop policy if exists "Accounts read their membership" on public.account_memberships;
create policy "Accounts read their membership" on public.account_memberships
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Editors read their favorites" on public.product_favorites;
drop policy if exists "Editors favorite published books" on public.product_favorites;
drop policy if exists "Editors remove their favorites" on public.product_favorites;
drop policy if exists "Accounts read their favorites" on public.product_favorites;
drop policy if exists "Accounts favorite published books" on public.product_favorites;
drop policy if exists "Accounts remove their favorites" on public.product_favorites;

create policy "Accounts read their favorites" on public.product_favorites
  for select to authenticated using (
    user_id = (select auth.uid()) and exists (
      select 1 from public.account_memberships m
      where m.user_id = (select auth.uid()) and m.role in ('sales', 'editor')
    )
  );
create policy "Accounts favorite published books" on public.product_favorites
  for insert to authenticated with check (
    user_id = (select auth.uid()) and exists (
      select 1 from public.account_memberships m
      where m.user_id = (select auth.uid()) and m.role in ('sales', 'editor')
    ) and exists (
      select 1 from public.products p where p.id = product_id and p.published = true
    )
  );
create policy "Accounts remove their favorites" on public.product_favorites
  for delete to authenticated using (
    user_id = (select auth.uid()) and exists (
      select 1 from public.account_memberships m
      where m.user_id = (select auth.uid()) and m.role in ('sales', 'editor')
    )
  );

notify pgrst, 'reload schema';
commit;
