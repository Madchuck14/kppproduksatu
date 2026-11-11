begin;

-- Official employee data is populated by trusted operators, never by applicants.
alter table public.employee_registry
  add column if not exists name text check (name is null or (char_length(btrim(name)) between 1 and 200)),
  add column if not exists work_area text check (work_area is null or (char_length(btrim(work_area)) between 1 and 200));

create table if not exists public.sales_login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null unique,
  logged_in_at timestamptz not null default clock_timestamp()
);
create index if not exists sales_login_events_user_time
  on public.sales_login_events (user_id, logged_in_at desc);
alter table public.sales_login_events enable row level security;
revoke all on public.sales_login_events from public, anon, authenticated;
grant select on public.sales_login_events to authenticated;
drop policy if exists super_editor_reads_sales_logins on public.sales_login_events;
create policy super_editor_reads_sales_logins on public.sales_login_events
  for select to authenticated using (exists (
    select 1 from public.account_memberships m
    where m.user_id = (select auth.uid()) and m.role = 'editor' and m.is_super
  ));

-- Only the trusted login endpoint can call this after Auth verifies the password.
create or replace function public.record_sales_login(p_user_id uuid, p_session_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.account_memberships m
    join public.employee_registry e on e.user_id = m.user_id
    where m.user_id = p_user_id and m.role = 'sales') then
    raise exception 'sales_account_required' using errcode = '42501';
  end if;
  insert into public.sales_login_events (user_id, session_id)
    values (p_user_id, p_session_id) on conflict (session_id) do nothing;
end;
$$;
revoke all on function public.record_sales_login(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_sales_login(uuid, uuid) to service_role;

create or replace function public.get_sales_dashboard(p_page integer default 1)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare total_count integer; selected_page integer; result jsonb;
begin
  if not exists (select 1 from public.account_memberships m
    where m.user_id = (select auth.uid()) and m.role = 'editor' and m.is_super) then
    raise exception 'super_editor_required' using errcode = '42501';
  end if;
  if p_page is null or p_page < 1 or p_page > 100000 then
    raise exception 'invalid_page' using errcode = '22023';
  end if;
  select count(*) into total_count from public.account_memberships where role = 'sales';
  selected_page := least(p_page, greatest(1, (total_count + 19) / 20));
  with sales as (
    select m.user_id, e.nip, e.name, e.work_area,
      max(l.logged_in_at) as last_login, count(l.id)::integer as login_count
    from public.account_memberships m
    left join public.employee_registry e on e.user_id = m.user_id
    left join public.sales_login_events l on l.user_id = m.user_id
    where m.role = 'sales'
    group by m.user_id, e.nip, e.name, e.work_area
  ), paged as (
    select * from sales order by last_login desc nulls last, user_id
      limit 20 offset (selected_page - 1) * 20
  ), areas as (
    select work_area, count(*)::integer as registered,
      count(*) filter (where login_count > 0)::integer as users
    from sales group by work_area
  )
  select jsonb_build_object(
    'sales', coalesce((select jsonb_agg(jsonb_build_object(
      'id', user_id, 'nip', nip, 'name', name, 'placement', work_area,
      'lastLoginAt', last_login, 'loginCount', login_count
    ) order by last_login desc nulls last, user_id) from paged), '[]'::jsonb),
    'total', total_count, 'page', selected_page, 'pageSize', 20,
    'employeeDirectoryConnected', true,
    'usage', jsonb_build_object(
      'uniqueSales', (select count(*) from sales where login_count > 0),
      'loginEvents', (select coalesce(sum(login_count), 0) from sales),
      'areas', coalesce((select jsonb_agg(jsonb_build_object(
        'area', work_area, 'registered', registered, 'users', users
      ) order by work_area nulls last) from areas), '[]'::jsonb)
    )
  ) into result;
  return result;
end;
$$;
revoke all on function public.get_sales_dashboard(integer) from public, anon;
grant execute on function public.get_sales_dashboard(integer) to authenticated;

comment on table public.sales_login_events is
  'Successful Sales password logins through the application, one row per Auth session. Not online presence.';
notify pgrst, 'reload schema';
commit;
