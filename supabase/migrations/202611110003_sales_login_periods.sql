begin;

-- Calendar periods use WIB; weeks start Monday. Existing response fields are preserved.
create or replace function public.get_sales_dashboard(p_page integer default 1)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  total_count integer; selected_page integer; result jsonb;
  as_of timestamptz := statement_timestamp();
  day_start timestamptz := date_trunc('day', as_of at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta';
  week_start timestamptz := date_trunc('week', as_of at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta';
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
  with recent_logins as (
    select e.work_area as area, l.logged_in_at
    from public.sales_login_events l
    join public.account_memberships m on m.user_id = l.user_id and m.role = 'sales'
    left join public.employee_registry e on e.user_id = l.user_id
    where l.logged_in_at >= week_start and l.logged_in_at <= as_of
  ), area_counts as (
    select area, count(*) filter (where logged_in_at >= day_start) as today_count,
      count(*) as week_count
    from recent_logins where area is not null group by area
  ), sales as (
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
    'periods', jsonb_build_object(
      'asOf', as_of, 'todayStart', day_start, 'weekStart', week_start,
      'today', jsonb_build_object(
        'loginEvents', (select count(*) from recent_logins where logged_in_at >= day_start),
        'topAreas', coalesce((select jsonb_agg(jsonb_build_object(
          'area', area, 'loginEvents', today_count
        ) order by area) from area_counts
          where today_count > 0 and today_count = (select max(today_count) from area_counts)), '[]'::jsonb)
      ),
      'week', jsonb_build_object(
        'loginEvents', (select count(*) from recent_logins),
        'topAreas', coalesce((select jsonb_agg(jsonb_build_object(
          'area', area, 'loginEvents', week_count
        ) order by area) from area_counts
          where week_count > 0 and week_count = (select max(week_count) from area_counts)), '[]'::jsonb)
      )
    ),
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

notify pgrst, 'reload schema';
commit;
