begin;

-- Expand the existing business key; preserve every identity and account mapping.
alter table public.employee_registry
  drop constraint if exists employee_registry_nip_check;
alter table public.employee_registry
  add constraint employee_registry_nip_check check (nip ~ '^[A-Z0-9]{1,32}$');

create or replace function public.assign_new_sales_account()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  employee public.employee_registry%rowtype;
  selected_nip text := new.raw_user_meta_data ->> 'nip';
begin
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
  -- Supabase Auth normalizes email identities to lowercase; the registry key stays uppercase.
  if new.email is distinct from lower(selected_nip) || '@nip.invalid'
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
