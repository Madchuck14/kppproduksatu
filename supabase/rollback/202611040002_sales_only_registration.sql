begin;

-- Preserve enrollment history, existing Editor memberships, and granted scopes.
revoke execute on function public.review_editor_enrollment_request(uuid, text) from authenticated;

create or replace function public.assign_new_sales_account()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.account_memberships (user_id, role, is_super)
  values (new.id, 'sales', false)
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.assign_new_sales_account() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
