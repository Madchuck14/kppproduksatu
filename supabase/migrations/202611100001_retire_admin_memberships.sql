begin;

-- Compatibility RPC: permissions now come exclusively from active membership.
-- Never promote legacy admins or overwrite existing Sales/Editor permissions.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.account_memberships
    where user_id = (select auth.uid()) and role = 'editor' and is_super
  );
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Preserve the original rows, constraints, and grants for rollback, outside the
-- exposed public schema. The application must never read this archive.
create schema if not exists account_access_archive;
revoke all on schema account_access_archive from public, anon, authenticated;
do $archive$
begin
  if to_regclass('public.admin_memberships') is not null then
    if to_regclass('account_access_archive.admin_memberships') is not null then
      raise exception 'admin_memberships archive already exists; inspect before retrying';
    end if;
    alter table public.admin_memberships set schema account_access_archive;
  end if;
end;
$archive$;

comment on table public.account_memberships is
  'Authoritative active account role and super status. Registry role/level are registration defaults only.';
comment on table public.employee_registry is
  'Allowed employee NIPs and Auth links. Role/education_level initialize membership/scopes at registration; later changes do not update active access.';

notify pgrst, 'reload schema';
commit;
