begin;

-- Compatibility transition: retain legacy memberships/Auth users/favorites for rollback.
-- Only Editor memberships are recognized by the application or exposed to their owner.
drop policy if exists "Accounts read their membership" on public.account_memberships;
create policy "Accounts read their membership" on public.account_memberships
  for select to authenticated using (user_id = (select auth.uid()) and role = 'editor');

drop policy if exists "Users read their favorites" on public.product_favorites;
drop policy if exists "Users favorite published books" on public.product_favorites;
drop policy if exists "Users remove their favorites" on public.product_favorites;
drop policy if exists "Editors read their favorites" on public.product_favorites;
drop policy if exists "Editors favorite published books" on public.product_favorites;
drop policy if exists "Editors remove their favorites" on public.product_favorites;

create policy "Editors read their favorites" on public.product_favorites
  for select to authenticated using (
    user_id = (select auth.uid()) and exists (
      select 1 from public.account_memberships m
      where m.user_id = (select auth.uid()) and m.role = 'editor'
    )
  );
create policy "Editors favorite published books" on public.product_favorites
  for insert to authenticated with check (
    user_id = (select auth.uid()) and exists (
      select 1 from public.account_memberships m
      where m.user_id = (select auth.uid()) and m.role = 'editor'
    ) and exists (
      select 1 from public.products p where p.id = product_id and p.published = true
    )
  );
create policy "Editors remove their favorites" on public.product_favorites
  for delete to authenticated using (
    user_id = (select auth.uid()) and exists (
      select 1 from public.account_memberships m
      where m.user_id = (select auth.uid()) and m.role = 'editor'
    )
  );

notify pgrst, 'reload schema';
commit;
