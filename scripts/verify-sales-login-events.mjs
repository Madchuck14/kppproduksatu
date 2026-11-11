import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// Isolated PostgreSQL only; no credentials or live database access.
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href)
const db = new PGlite()
const ids = [1, 2, 3, 4, 5].map((n) => `${n}1111111-1111-4111-8111-111111111111`)
const sessions = [1, 2, 3].map((n) => `${n}2222222-2222-4222-8222-222222222222`)
const sql = await readFile('supabase/migrations/202611110002_sales_login_events.sql', 'utf8')
async function identity(id, role = 'authenticated') {
  await db.exec(`reset role; set role ${role}`)
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
}
async function dashboard(page = 1) {
  return (await db.query('select public.get_sales_dashboard($1) as value', [page])).rows[0].value
}
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to authenticated;
    create table public.account_memberships (
      user_id uuid primary key references auth.users(id), role text not null, is_super boolean not null
    );
    alter table public.account_memberships enable row level security;
    grant select on public.account_memberships to authenticated;
    create policy own_membership on public.account_memberships for select to authenticated
      using (user_id = auth.uid());
    create table public.employee_registry (
      nip text primary key, role text not null, education_level text,
      user_id uuid unique references auth.users(id)
    );
    alter table public.employee_registry enable row level security;
    grant select(nip, user_id) on public.employee_registry to authenticated;
    create policy own_nip on public.employee_registry for select to authenticated
      using (user_id = auth.uid());
  `)
  for (let i = 0; i < ids.length; i++) {
    await db.query('insert into auth.users values ($1)', [ids[i]])
    await db.query('insert into public.account_memberships values ($1,$2,$3)', [
      ids[i],
      i < 3 ? 'sales' : 'editor',
      i === 2 || i === 4,
    ])
    await db.query('insert into public.employee_registry values ($1,$2,$3,$4)', [
      `000${i}`,
      i < 3 ? 'sales' : 'editor',
      i < 3 ? null : 'SD',
      ids[i],
    ])
  }
  const before = (await db.query('select * from public.employee_registry order by nip')).rows
  await db.exec(sql)
  assert.deepEqual(
    (
      await db.query(
        'select nip,role,education_level,user_id from public.employee_registry order by nip',
      )
    ).rows,
    before,
    'Existing employee identities survive migration',
  )
  assert.equal((await db.query('select count(*) as n from public.sales_login_events')).rows[0].n, 0)
  await db.query(
    "update public.employee_registry set name='Sales Resmi',work_area='Jakarta' where user_id=$1",
    [ids[0]],
  )
  await db.query(
    "update public.employee_registry set name='Sales Kedua',work_area='Jakarta' where user_id=$1",
    [ids[1]],
  )
  await identity('', 'service_role')
  for (const session of sessions.slice(0, 2))
    await db.query('select public.record_sales_login($1,$2)', [ids[0], session])
  await db.query('select public.record_sales_login($1,$2)', [ids[0], sessions[0]])
  await db.query('select public.record_sales_login($1,$2)', [ids[2], sessions[2]])
  await assert.rejects(
    db.query('select public.record_sales_login($1,$2)', [ids[3], sessions[2]]),
    /sales_account_required/,
  )
  for (const id of ids.slice(0, 4)) {
    await identity(id)
    assert.equal((await db.query('select * from public.sales_login_events')).rows.length, 0)
    await assert.rejects(dashboard(), /super_editor_required/)
    await assert.rejects(
      db.query('select public.record_sales_login($1,$2)', [id, sessions[0]]),
      /permission denied/,
    )
    await assert.rejects(
      db.query('insert into public.sales_login_events(user_id,session_id) values($1,$2)', [
        id,
        sessions[0],
      ]),
      /permission denied/,
    )
    await assert.rejects(
      db.query("update public.employee_registry set work_area='Forged' where user_id=$1", [id]),
      /permission denied/,
    )
  }
  await identity(ids[4])
  const result = await dashboard()
  assert.equal(result.total, 3)
  assert.equal(result.usage.uniqueSales, 2, 'Repeated login counts one distinct Sales')
  assert.equal(result.usage.loginEvents, 3, 'Duplicate Auth session is idempotent')
  const row = result.sales.find((sales) => sales.id === ids[0])
  assert.equal(row.name, 'Sales Resmi')
  assert.equal(row.placement, 'Jakarta')
  assert.equal(row.nip, '0000')
  assert.equal(row.loginCount, 2)
  assert(row.lastLoginAt)
  assert.equal(result.sales.find((sales) => sales.id === ids[1]).lastLoginAt, null)
  assert.deepEqual(
    result.usage.areas.find((area) => area.area === 'Jakarta'),
    { area: 'Jakarta', registered: 2, users: 1 },
  )
  assert.equal((await dashboard(999)).page, 1)
  await assert.rejects(dashboard(0), /invalid_page/)
  assert.equal((await db.query('select * from public.sales_login_events')).rows.length, 3)
  await assert.rejects(db.query('delete from public.sales_login_events'), /permission denied/)
  await identity('', 'anon')
  await assert.rejects(dashboard(), /permission denied/)
  await assert.rejects(db.query('select * from public.sales_login_events'), /permission denied/)
  await db.exec('reset role')
  for (let index = 0; index < 22; index++) {
    const id = `77777777-7777-4777-8777-${String(index).padStart(12, '0')}`
    await db.query('insert into auth.users values ($1)', [id])
    await db.query("insert into public.account_memberships values ($1,'sales',false)", [id])
    await db.query(
      "insert into public.employee_registry (nip,role,user_id,name,work_area) values ($1,'sales',$2,'Tambahan','Bandung')",
      [`88${index}`, id],
    )
  }
  await identity(ids[4])
  const lastPage = await dashboard(999)
  assert.equal(lastPage.total, 25)
  assert.equal(lastPage.page, 2)
  assert.equal(lastPage.sales.length, 5)
  assert.equal(lastPage.usage.uniqueSales, 2, 'Summary covers all pages')
  assert.equal(lastPage.usage.areas.find((area) => area.area === 'Bandung').registered, 22)
  await db.exec('reset role')
  await db.exec(sql)
  assert.equal(
    (await db.query('select count(*) as n from public.sales_login_events')).rows[0].n,
    3,
    'Migration retry preserves events',
  )
  const periodSql = await readFile(
    'supabase/migrations/202611110003_sales_login_periods.sql',
    'utf8',
  )
  await db.exec(periodSql)
  assert.equal((await db.query('select count(*) as n from public.sales_login_events')).rows[0].n, 3)
  await identity(ids[4])
  const firstPeriods = await dashboard()
  assert.equal(firstPeriods.usage.loginEvents, 3, 'New migration preserves legacy aggregate')
  const day = firstPeriods.periods.todayStart
  const week = firstPeriods.periods.weekStart
  assert.equal(
    new Intl.DateTimeFormat('en', { timeZone: 'Asia/Jakarta', weekday: 'long' }).format(
      new Date(week),
    ),
    'Monday',
  )
  assert.equal(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(day)),
    '00',
  )
  await db.exec('reset role')
  await db.exec("set timezone = 'Pacific/Honolulu'; delete from public.sales_login_events")
  await db.query("update public.employee_registry set work_area='Bandung' where user_id=$1", [
    ids[1],
  ])
  let eventIndex = 0
  async function eventAt(userId, time) {
    const sessionId = `99999999-9999-4999-8999-${String(eventIndex++).padStart(12, '0')}`
    await db.query(
      'insert into public.sales_login_events(user_id,session_id,logged_in_at) values($1,$2,$3)',
      [userId, sessionId, time],
    )
  }
  // Inclusive WIB midnight, exclusive previous period, future events, tied leaders, unknown area.
  for (const id of ids.slice(0, 2)) {
    await eventAt(id, day)
    await eventAt(id, day)
  }
  await eventAt(ids[2], day)
  await eventAt(ids[0], new Date(new Date(day).getTime() - 1).toISOString())
  await eventAt(ids[0], new Date(new Date(week).getTime() - 1).toISOString())
  await eventAt(ids[0], new Date(Date.now() + 86400000).toISOString())
  await identity(ids[4])
  const periods = (await dashboard(2)).periods
  assert.equal(
    new Date(periods.todayStart).getTime(),
    new Date(firstPeriods.periods.todayStart).getTime(),
    'WIB boundaries independent of database timezone',
  )
  assert.equal(periods.today.loginEvents, 5, 'Unknown area included; past/future excluded')
  assert.deepEqual(periods.today.topAreas, [
    { area: 'Bandung', loginEvents: 2 },
    { area: 'Jakarta', loginEvents: 2 },
  ])
  const monday = new Date(day).getTime() === new Date(week).getTime()
  assert.equal(periods.week.loginEvents, monday ? 5 : 6)
  assert.deepEqual(
    periods.week.topAreas,
    monday ? periods.today.topAreas : [{ area: 'Jakarta', loginEvents: 3 }],
  )
  await db.exec('reset role; delete from public.sales_login_events')
  await identity(ids[4])
  assert.deepEqual((await dashboard()).periods.today, { loginEvents: 0, topAreas: [] })
  assert.deepEqual((await dashboard()).periods.week, { loginEvents: 0, topAreas: [] })
  await identity(ids[3])
  await assert.rejects(dashboard(), /super_editor_required/)
  await db.exec('reset role')
  await db.exec(periodSql)
  console.log(
    'PASS: migration preservation/retry, session idempotency, distinct Sales and area totals, trusted registry metadata, DB timestamps, null legacy logins, RLS and RPC denial for anon/Sales/Sales super/ordinary Editor, super Editor read-only access. Isolated PostgreSQL only.',
  )
} finally {
  await db.close()
}
