begin;

-- Ordinary Editors may add subjects only within their assigned education levels.
-- The existing super Editor policy and delete permissions remain unchanged.
drop policy if exists classifications_scoped_subject_insert on public.book_classifications;
create policy classifications_scoped_subject_insert
on public.book_classifications for insert to authenticated
with check (
  kind = 'subject'
  and exists (
    select 1 from public.account_memberships m
    where m.user_id = (select auth.uid()) and m.role = 'editor'
  )
  and public.has_editor_scope(education_level)
);

notify pgrst, 'reload schema';
commit;
