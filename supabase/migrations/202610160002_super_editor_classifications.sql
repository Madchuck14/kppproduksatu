begin;

-- Classification management belongs exclusively to super Editors.
-- Public option reads and scoped book editing remain available.
drop policy if exists classifications_editor_insert on public.book_classifications;
drop policy if exists classifications_super_insert on public.book_classifications;
create policy classifications_super_insert on public.book_classifications for insert to authenticated
with check (
  exists (select 1 from public.account_memberships m
    where m.user_id = (select auth.uid()) and m.role = 'editor' and m.is_super)
);
create or replace function public.delete_book_classification(option_kind text, option_code text, option_level text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare target public.book_classifications%rowtype;
begin
  if not exists (
    select 1 from public.account_memberships m where m.user_id = (select auth.uid())
      and m.role = 'editor' and m.is_super
  ) then
    raise exception 'classification_forbidden' using errcode = '42501';
  end if;
  lock table public.products in share row exclusive mode;
  select * into target from public.book_classifications
    where kind = option_kind and code = option_code and education_level = option_level for update;
  if not found then return false; end if;
  if exists (
    select 1 from public.products p where
      (target.kind = 'division' and p.division_code = target.code)
      or (target.kind = 'subject' and p.subject = target.name and p.education_level = target.education_level)
      or (target.kind = 'curriculum' and lower(btrim(p.curriculum)) = lower(target.name))
  ) then raise exception 'classification_in_use' using errcode = 'P0001'; end if;
  delete from public.book_classifications
    where kind = target.kind and code = target.code and education_level = target.education_level;
  return true;
end;
$$;
revoke all on function public.delete_book_classification(text, text, text) from public, anon, authenticated;
grant execute on function public.delete_book_classification(text, text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
