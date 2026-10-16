begin;

-- Roll back only with the preceding application version; legacy accounts regain access.
drop policy if exists "Editors read their favorites" on public.product_favorites;
drop policy if exists "Editors favorite published books" on public.product_favorites;
drop policy if exists "Editors remove their favorites" on public.product_favorites;
drop policy if exists "Users read their favorites" on public.product_favorites;
drop policy if exists "Users favorite published books" on public.product_favorites;
drop policy if exists "Users remove their favorites" on public.product_favorites;

drop policy if exists "Accounts read their membership" on public.account_memberships;
create policy "Accounts read their membership" on public.account_memberships
  for select to authenticated using (user_id = (select auth.uid()));

create policy "Users read their favorites" on public.product_favorites
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Users favorite published books" on public.product_favorites
  for insert to authenticated with check (
    user_id = (select auth.uid()) and exists (
      select 1 from public.products p where p.id = product_id and p.published = true
    )
  );
create policy "Users remove their favorites" on public.product_favorites
  for delete to authenticated using (user_id = (select auth.uid()));


notify pgrst, 'reload schema';
commit;
