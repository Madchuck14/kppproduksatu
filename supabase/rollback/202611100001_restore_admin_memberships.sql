begin;

-- Restore before deploying the legacy application/provisioning scripts.
-- Active account permissions, employee links, and favorites remain unchanged.
do $restore$
begin
  if to_regclass('account_access_archive.admin_memberships') is not null then
    if to_regclass('public.admin_memberships') is not null then
      raise exception 'public.admin_memberships already exists; inspect before restoring';
    end if;
    alter table account_access_archive.admin_memberships set schema public;
  elsif to_regclass('public.admin_memberships') is null then
    raise exception 'admin_memberships archive missing; cannot restore';
  end if;
end;
$restore$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.admin_memberships where user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

notify pgrst, 'reload schema';
commit;
