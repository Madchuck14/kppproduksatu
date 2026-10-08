begin;

-- Additive migration: UUID product identity and existing data stay unchanged.
create table public.product_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
create index product_favorites_recent_idx
  on public.product_favorites (user_id, created_at desc, product_id);
create index product_favorites_product_idx on public.product_favorites (product_id);

alter table public.product_favorites enable row level security;
revoke all on public.product_favorites from anon, authenticated;
grant select, insert, delete on public.product_favorites to authenticated;
grant all on public.product_favorites to service_role;

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

commit;
