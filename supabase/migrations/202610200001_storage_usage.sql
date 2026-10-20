begin;

-- Aggregate only: Editors can see project usage without reading other levels' file metadata.
create or replace function public.editor_storage_usage_bytes()
returns bigint
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.account_memberships
    where user_id = (select auth.uid()) and role = 'editor'
  ) then
    raise exception using errcode = '42501', message = 'storage_usage_forbidden';
  end if;
  return (
    select coalesce(sum((metadata->>'size')::bigint), 0)::bigint
    from storage.objects
  );
end;
$$;

revoke all on function public.editor_storage_usage_bytes() from public, anon;
grant execute on function public.editor_storage_usage_bytes() to authenticated;

commit;
