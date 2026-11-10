begin;

-- Enrollment policy: ordinary Editors may self-select exactly one education level.
-- Super membership and additional scopes remain exclusive to trusted provisioning.
create or replace function public.assign_new_sales_account()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  selected_role text := coalesce(new.raw_user_meta_data ->> 'registration_role', 'sales');
  selected_level text := new.raw_user_meta_data ->> 'requested_education_level';
  assigned_role text;
begin
  if selected_role not in ('sales', 'editor') then
    raise exception 'registration_invalid_role' using errcode = '22023';
  end if;
  if selected_role = 'editor' and (selected_level is null or selected_level not in ('SD', 'SMP', 'SMA', 'SMK')) then
    raise exception 'registration_invalid_level' using errcode = '22023';
  end if;
  if selected_role = 'sales' and selected_level is not null then
    raise exception 'registration_sales_has_level' using errcode = '22023';
  end if;
  insert into public.account_memberships (user_id, role, is_super)
  values (new.id, selected_role, false)
  on conflict (user_id) do nothing returning role into assigned_role;
  if assigned_role = 'editor' then
    insert into public.editor_scopes (user_id, education_level)
    values (new.id, selected_level);
  end if;
  return new;
end;
$$;
revoke all on function public.assign_new_sales_account() from public, anon, authenticated;

-- Retain historical requests and memberships without allowing the obsolete review flow.
revoke all on function public.review_editor_enrollment_request(uuid, text) from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
