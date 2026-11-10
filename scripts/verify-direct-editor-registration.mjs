import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// Isolated PostgreSQL only. No credentials, live signup, or email delivery.
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href)
const db = new PGlite()
const migration = '202611040003_direct_editor_registration.sql'
const legacy = '11111111-1111-4111-8111-111111111111'
const sales = '22222222-2222-4222-8222-222222222222'
const editors = ['SD', 'SMP', 'SMA', 'SMK'].map((level, i) => ({
  level,
  id: `44444444-4444-4444-8444-44444444444${i}`,
}))
async function session(id) {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id])
  await db.exec(id ? 'set role authenticated' : 'set role anon')
}
async function user(id, metadata) {
  await db.query('insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,$3)', [
    id,
    `${id}@example.com`,
    metadata,
  ])
}
async function snapshot() {
  return {
    accounts: (await db.query('select * from public.account_memberships order by user_id')).rows,
    scopes: (await db.query('select * from public.editor_scopes order by user_id,education_level'))
      .rows,
    requests: (await db.query('select * from public.editor_enrollment_requests order by user_id'))
      .rows,
  }
}
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
    $$;
    grant usage on schema auth to anon,authenticated;
    create schema storage;
    create table storage.buckets (id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated;
    grant select on storage.objects to anon,authenticated;
    grant insert,delete on storage.objects to authenticated;
  `)
  for (const name of (await readdir('supabase/migrations'))
    .filter((n) => n.endsWith('.sql') && n < migration)
    .sort())
    await db.exec(await readFile(`supabase/migrations/${name}`, 'utf8'))
  await user(legacy, { registration_role: 'editor', requested_education_level: 'SD' })
  const before = await snapshot()
  const sql = await readFile(`supabase/migrations/${migration}`, 'utf8')
  await db.exec(sql)
  await db.exec(sql)
  assert.deepEqual(await snapshot(), before, 'Existing memberships/scopes/history preserved')
  await user(sales, { registration_role: 'sales', role: 'editor', is_super: true })
  for (const { id, level } of editors) {
    // Even unconfirmed Auth users are assigned immediately; Supabase Auth still owns email confirmation/login.
    await user(id, {
      registration_role: 'editor',
      requested_education_level: level,
      is_super: true,
      role: 'super',
      educationLevels: ['SD', 'SMP', 'SMA', 'SMK'],
    })
    assert.deepEqual(
      (
        await db.query('select role,is_super from public.account_memberships where user_id=$1', [
          id,
        ])
      ).rows[0],
      { role: 'editor', is_super: false },
    )
    assert.deepEqual(
      (await db.query('select education_level from public.editor_scopes where user_id=$1', [id]))
        .rows,
      [{ education_level: level }],
    )
    assert.equal(
      (await db.query('select * from public.editor_enrollment_requests where user_id=$1', [id]))
        .rows.length,
      0,
    )
    await session(id)
    for (const target of ['SD', 'SMP', 'SMA', 'SMK'])
      assert.equal(
        (await db.query('select public.can_manage_book_level($1) as allowed', [target])).rows[0]
          .allowed,
        target === level,
      )
    await assert.rejects(
      db.query("insert into public.editor_scopes values ($1,'SD')", [id]),
      /permission denied/,
    )
    await assert.rejects(
      db.query('update public.account_memberships set is_super=true where user_id=$1', [id]),
      /permission denied/,
    )
    await assert.rejects(
      db.query("select public.review_editor_enrollment_request($1,'approved')", [legacy]),
      /permission denied/,
    )
    await db.exec('reset role')
    await db.query('update auth.users set raw_user_meta_data=$1 where id=$2', [
      { registration_role: 'editor', requested_education_level: 'SMK', is_super: true },
      id,
    ])
    assert.deepEqual(
      (await db.query('select education_level from public.editor_scopes where user_id=$1', [id]))
        .rows,
      [{ education_level: level }],
      'Later metadata edits cannot change scope',
    )
  }
  assert.deepEqual(
    (
      await db.query('select role,is_super from public.account_memberships where user_id=$1', [
        sales,
      ])
    ).rows[0],
    { role: 'sales', is_super: false },
  )
  assert.equal(
    (await db.query('select * from public.editor_scopes where user_id=$1', [sales])).rows.length,
    0,
  )
  const invalid = '66666666-6666-4666-8666-666666666666'
  for (const metadata of [
    { registration_role: 'super', requested_education_level: 'SD' },
    { registration_role: 'editor' },
    { registration_role: 'editor', requested_education_level: 'ALL' },
    { registration_role: 'editor', requested_education_level: ['SD', 'SMP'] },
    { registration_role: 'sales', requested_education_level: 'SD' },
  ]) {
    await assert.rejects(
      user(invalid, metadata),
      /registration_(invalid_role|invalid_level|sales_has_level)/,
    )
    assert.equal(
      (await db.query('select * from auth.users where id=$1', [invalid])).rows.length,
      0,
      'Failed signup is atomic',
    )
  }
  const saved = await snapshot()
  await db.exec(
    await readFile('supabase/rollback/202611040003_editor_approval_registration.sql', 'utf8'),
  )
  assert.deepEqual(await snapshot(), saved, 'Rollback never deletes existing accounts/scopes')
  await db.exec(sql)
  assert.deepEqual(await snapshot(), saved)
  console.log(
    'PASS: immediate Editor assignment for SD/SMP/SMA/SMK; exactly one scope; no approval; no super escalation; invalid direct-Auth signup rejected atomically; later metadata edits ignored; Sales unchanged; existing history preserved; retry and rollback.',
  )
} finally {
  await db.close()
}
