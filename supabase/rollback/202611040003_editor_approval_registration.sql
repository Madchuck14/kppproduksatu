begin;

-- Preserve all accounts, granted scopes, and historical requests.
create or replace function public.assign_new_sales_account()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.account_memberships (user_id, role, is_super)
  values (new.id, 'sales', false) on conflict (user_id) do nothing;
  -- User metadata can request a scope, never grant it. Invalid direct-Auth metadata is ignored.
  if new.raw_user_meta_data ->> 'registration_role' = 'editor'
    and new.raw_user_meta_data ->> 'requested_education_level' in ('SD', 'SMP', 'SMA', 'SMK') then
    insert into public.editor_enrollment_requests (user_id, email, education_level)
    values (new.id, new.email, new.raw_user_meta_data ->> 'requested_education_level')
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.assign_new_sales_account() from public, anon, authenticated;


grant execute on function public.review_editor_enrollment_request(uuid, text) to authenticated;
notify pgrst, 'reload schema';
commit;
