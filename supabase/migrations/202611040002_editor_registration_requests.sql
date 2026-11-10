begin;

create table if not exists public.editor_enrollment_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  education_level text not null check (education_level in ('SD', 'SMP', 'SMA', 'SMK')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  check ((status = 'pending' and reviewed_at is null) or (status <> 'pending' and reviewed_at is not null))
);
alter table public.editor_enrollment_requests enable row level security;
revoke all on public.editor_enrollment_requests from anon, authenticated;
grant select on public.editor_enrollment_requests to authenticated;
grant all on public.editor_enrollment_requests to service_role;
create index if not exists editor_enrollment_pending_idx
  on public.editor_enrollment_requests (created_at, user_id) where status = 'pending';
drop policy if exists "Accounts read editor requests" on public.editor_enrollment_requests;
create policy "Accounts read editor requests" on public.editor_enrollment_requests
  for select to authenticated using (
    user_id = (select auth.uid()) or exists (
      select 1 from public.account_memberships m
      where m.user_id = (select auth.uid()) and m.role = 'editor' and m.is_super
    )
  );

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

create or replace function public.review_editor_enrollment_request(target_user uuid, decision text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  enrollment public.editor_enrollment_requests%rowtype;
  caller uuid := (select auth.uid());
  target_role text;
  target_super boolean;
begin
  if not exists (
    select 1 from public.account_memberships m
    where m.user_id = caller and m.role = 'editor' and m.is_super
  ) then
    raise exception 'enrollment_forbidden' using errcode = '42501';
  end if;
  if decision not in ('approved', 'rejected') or decision is null then
    raise exception 'enrollment_invalid_decision' using errcode = '22023';
  end if;
  select * into enrollment from public.editor_enrollment_requests
    where user_id = target_user for update;
  if not found then
    raise exception 'enrollment_not_found' using errcode = 'P0002';
  end if;
  if enrollment.status <> 'pending' then
    raise exception 'enrollment_already_reviewed' using errcode = 'P0001';
  end if;
  if decision = 'approved' then
    -- Lock membership too: never overwrite a concurrently provisioned Editor/super account.
    select role, is_super into target_role, target_super from public.account_memberships
      where user_id = target_user for update;
    if target_role is distinct from 'sales' or target_super is distinct from false
      or exists (select 1 from public.editor_scopes where user_id = target_user) then
      raise exception 'enrollment_account_changed' using errcode = 'P0001';
    end if;
    if not exists (select 1 from auth.users where id = target_user and email_confirmed_at is not null) then
      raise exception 'enrollment_email_unconfirmed' using errcode = 'P0001';
    end if;
    update public.account_memberships set role = 'editor', is_super = false where user_id = target_user;
    insert into public.editor_scopes (user_id, education_level) values (target_user, enrollment.education_level);
  end if;
  update public.editor_enrollment_requests
    set status = decision, reviewed_at = now(), reviewed_by = caller where user_id = target_user;
end;
$$;
revoke all on function public.review_editor_enrollment_request(uuid, text) from public, anon;
grant execute on function public.review_editor_enrollment_request(uuid, text) to authenticated;

notify pgrst, 'reload schema';
commit;
