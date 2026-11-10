begin;

-- Intentionally empty; trusted operators populate employee identities and access.
create table if not exists public.employee_registry (
  nip text primary key check (nip ~ '^[0-9]{1,32}$'),
  role text not null default 'sales' check (role in ('sales', 'editor')),
  education_level text check (education_level in ('SD', 'SMP', 'SMA', 'SMK')),
  user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((role = 'sales' and education_level is null)
    or (role = 'editor' and education_level is not null))
);
alter table public.employee_registry enable row level security;
revoke all on public.employee_registry from public, anon, authenticated;
grant all on public.employee_registry to service_role;
grant select (nip, user_id) on public.employee_registry to authenticated;
drop policy if exists employee_reads_own_nip on public.employee_registry;
create policy employee_reads_own_nip on public.employee_registry
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.assign_new_sales_account()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  employee public.employee_registry%rowtype;
  selected_nip text := new.raw_user_meta_data ->> 'nip';
begin
  -- app_metadata is writable only through trusted Auth administration.
  if new.raw_app_meta_data ->> 'employee_provisioning' = 'true' then
    return new;
  end if;
  if coalesce(new.raw_app_meta_data ->> 'employee_registration', '') <> 'true' then
    raise exception 'employee_registration_server_required' using errcode = '42501';
  end if;
  select * into employee from public.employee_registry where nip = selected_nip for update;
  if not found or employee.user_id is not null then
    raise exception 'employee_registration_unavailable' using errcode = '22023';
  end if;
  if new.email is distinct from selected_nip || '@nip.invalid'
    or new.raw_user_meta_data ->> 'registration_role' is distinct from employee.role
    or new.raw_user_meta_data ->> 'requested_education_level' is distinct from employee.education_level then
    raise exception 'employee_registration_mismatch' using errcode = '22023';
  end if;
  update public.employee_registry set user_id = new.id where nip = selected_nip;
  insert into public.account_memberships (user_id, role, is_super)
    values (new.id, employee.role, false);
  if employee.role = 'editor' then
    insert into public.editor_scopes (user_id, education_level)
      values (new.id, employee.education_level);
  end if;
  return new;
end;
$$;
revoke all on function public.assign_new_sales_account() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
