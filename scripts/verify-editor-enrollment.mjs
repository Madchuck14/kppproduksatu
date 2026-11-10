import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// Local PostgreSQL only: never reads credentials or contacts Supabase.
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href)
const db = new PGlite()
const migration = '202611040002_editor_registration_requests.sql'
const superEditor = '11111111-1111-4111-8111-111111111111'
const editor = '22222222-2222-4222-8222-222222222222'
const superSales = '33333333-3333-4333-8333-333333333333'
const applicants = ['SD', 'SMP', 'SMA', 'SMK'].map((level, i) => ({
  level,
  id: `44444444-4444-4444-8444-44444444444${i}`,
}))
const rejected = '55555555-5555-4555-8555-555555555555'
const invalid = '66666666-6666-4666-8666-666666666666'
async function session(id) {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
  await db.exec(id ? 'set role authenticated' : 'set role anon')
}
async function user(id, metadata, confirmed = true) {
  await db.query(
    'insert into auth.users (id,email,email_confirmed_at,raw_user_meta_data) values ($1,$2,$3,$4)',
    [id, `${id}@example.com`, confirmed ? new Date().toISOString() : null, metadata],
  )
}
async function review(id, decision = 'approved') {
  return db.query('select public.review_editor_enrollment_request($1,$2)', [id, decision])
}
async function snapshot() {
  return {
    accounts: (await db.query('select * from public.account_memberships order by user_id')).rows,
    scopes: (await db.query('select * from public.editor_scopes order by user_id, education_level'))
      .rows,
    requests: (await db.query('select * from public.editor_enrollment_requests order by user_id'))
      .rows,
  }
}
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to anon, authenticated;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, metadata jsonb);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated;
    grant select on storage.objects to anon, authenticated;
    grant insert, delete on storage.objects to authenticated;
  `)
  for (const name of (await readdir('supabase/migrations'))
    .filter((n) => n.endsWith('.sql') && n < migration)
    .sort())
    await db.exec(await readFile(`supabase/migrations/${name}`, 'utf8'))
  for (const id of [superEditor, editor, superSales]) await user(id, {})
  await db.query(
    "update public.account_memberships set role='editor', is_super=(user_id=$1) where user_id in ($1,$2)",
    [superEditor, editor],
  )
  await db.query('update public.account_memberships set is_super=true where user_id=$1', [
    superSales,
  ])
  await db.query("insert into public.editor_scopes values ($1,'SD')", [editor])
  const sql = await readFile(`supabase/migrations/${migration}`, 'utf8')
  await db.exec(sql)
  const before = await snapshot()
  await db.exec(sql)
  assert.deepEqual(await snapshot(), before)
  for (const { id, level } of applicants) {
    await user(
      id,
      {
        registration_role: 'editor',
        requested_education_level: level,
        role: 'editor',
        is_super: true,
      },
      level !== 'SMK',
    )
    assert.deepEqual(
      (
        await db.query('select role,is_super from public.account_memberships where user_id=$1', [
          id,
        ])
      ).rows[0],
      { role: 'sales', is_super: false },
    )
    const request = (
      await db.query(
        'select education_level,status from public.editor_enrollment_requests where user_id=$1',
        [id],
      )
    ).rows[0]
    assert.deepEqual(request, { education_level: level, status: 'pending' })
  }
  await user(rejected, { registration_role: 'editor', requested_education_level: 'SMA' })
  await user(invalid, {
    registration_role: 'editor',
    requested_education_level: 'SUPER',
    is_super: true,
  })
  assert.equal(
    (await db.query('select * from public.editor_enrollment_requests where user_id=$1', [invalid]))
      .rows.length,
    0,
  )
  // Changing editable metadata after signup cannot change the persisted request or its scope.
  await db.query(
    "update auth.users set raw_user_meta_data='{" +
      '"registration_role":"editor","requested_education_level":"SMK"' +
      "}' where id=$1",
    [applicants[0].id],
  )
  for (const id of [superSales, editor, applicants[0].id]) {
    await session(id)
    await assert.rejects(review(applicants[0].id), /enrollment_forbidden/)
    await assert.rejects(
      db.query("update public.editor_enrollment_requests set status='approved'"),
      /permission denied/,
    )
    await assert.rejects(
      db.query("insert into public.editor_scopes values ($1,'SMP')", [id]),
      /permission denied/,
    )
    const rows = (await db.query('select * from public.editor_enrollment_requests')).rows
    assert.equal(rows.length, id === applicants[0].id ? 1 : 0)
    await assert.rejects(
      db.query(
        "update public.account_memberships set role='editor',is_super=true where user_id=$1",
        [id],
      ),
      /permission denied/,
    )
  }
  await session('')
  await assert.rejects(review(applicants[0].id), /permission denied/)
  await assert.rejects(
    db.query('select * from public.editor_enrollment_requests'),
    /permission denied/,
  )
  await session(superEditor)
  assert.equal((await db.query('select * from public.editor_enrollment_requests')).rows.length, 5)
  await assert.rejects(review(invalid), /enrollment_not_found/)
  await assert.rejects(review(applicants[0].id, 'super'), /enrollment_invalid_decision/)
  await assert.rejects(review(applicants[3].id), /enrollment_email_unconfirmed/)
  for (const { id, level } of applicants.slice(0, 3)) {
    await review(id)
    await assert.rejects(review(id), /enrollment_already_reviewed/)
    await session(id)
    const membership = (await db.query('select role,is_super from public.account_memberships'))
      .rows[0]
    assert.deepEqual(membership, { role: 'editor', is_super: false })
    const scopes = (await db.query('select education_level from public.editor_scopes')).rows
    assert.deepEqual(scopes, [{ education_level: level }])
    for (const target of ['SD', 'SMP', 'SMA', 'SMK'])
      assert.equal(
        (await db.query('select public.can_manage_book_level($1) as allowed', [target])).rows[0]
          .allowed,
        target === level,
      )
    await session(superEditor)
  }
  await review(rejected, 'rejected')
  await assert.rejects(review(rejected), /enrollment_already_reviewed/)
  await session(rejected)
  assert.equal(
    (await db.query('select role from public.account_memberships')).rows[0].role,
    'sales',
  )
  assert.equal(
    (await db.query('select status from public.editor_enrollment_requests')).rows[0].status,
    'rejected',
  )
  await db.exec('reset role')
  await db.query('update auth.users set email_confirmed_at=now() where id=$1', [applicants[3].id])
  await session(superEditor)
  const decisions = await Promise.allSettled([
    review(applicants[3].id),
    review(applicants[3].id, 'rejected'),
  ])
  assert.equal(
    decisions.filter((r) => r.status === 'fulfilled').length,
    1,
    'Only one competing decision succeeds',
  )
  await db.exec('reset role')
  const provisioned = '77777777-7777-4777-8777-777777777777'
  await user(provisioned, { registration_role: 'editor', requested_education_level: 'SD' })
  await db.query("update public.account_memberships set role='editor' where user_id=$1", [
    provisioned,
  ])
  await db.query("insert into public.editor_scopes values ($1,'SMK')", [provisioned])
  await session(superEditor)
  await assert.rejects(review(provisioned), /enrollment_account_changed/)
  await db.exec('reset role')
  const history = await snapshot()
  await db.exec(
    await readFile('supabase/rollback/202611040002_sales_only_registration.sql', 'utf8'),
  )
  assert.deepEqual(
    await snapshot(),
    history,
    'Rollback preserves requests, memberships, and scopes',
  )
  await session(superEditor)
  await assert.rejects(review(invalid), /permission denied/)
  await db.exec('reset role')
  await db.exec(sql)
  assert.deepEqual(await snapshot(), history)
  console.log(
    'PASS: four Editor enrollment levels; pending grants no Editor/super; metadata changes ignored; only super Editor reviews; confirmed-email gate; owner isolation; approval scope; rejection; competing/repeated review; preservation, retry, rollback.',
  )
} finally {
  await db.close()
}
