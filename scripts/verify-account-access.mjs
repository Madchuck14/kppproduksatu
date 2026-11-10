import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

// Isolated PostgreSQL and mocked request boundaries; no credentials or live writes.
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href)
const db = new PGlite()
const migration = await readFile(
  'supabase/migrations/202611100001_retire_admin_memberships.sql',
  'utf8',
)
const rollback = await readFile(
  'supabase/rollback/202611100001_restore_admin_memberships.sql',
  'utf8',
)
const ids = [1, 2, 3].map((n) => `${n}1111111-1111-4111-8111-111111111111`)
async function state() {
  const result = {}
  for (const table of [
    'account_memberships',
    'editor_scopes',
    'employee_registry',
    'product_favorites',
  ])
    result[table] = (await db.query(`select * from public.${table} order by 1,2`)).rows
  return result
}
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key,email text,email_confirmed_at timestamptz,
      raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
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
  await db.exec(await readFile('supabase/setup.sql', 'utf8'))
  await db.exec(rollback)
  for (const [index, id] of ids.entries()) {
    await db.query('insert into auth.users (id,raw_app_meta_data) values ($1,$2)', [
      id,
      { employee_provisioning: true },
    ])
    const role = index === 0 ? 'sales' : 'editor'
    await db.query(
      'insert into public.account_memberships (user_id,role,is_super) values ($1,$2,$3)',
      [id, role, index !== 1],
    )
    await db.query(
      'insert into public.employee_registry (nip,user_id,role,education_level) values ($1,$2,$3,$4)',
      [`00${index}`, id, role, index === 0 ? null : 'SD'],
    )
  }
  await db.query('insert into public.admin_memberships (user_id) values ($1),($2)', ids.slice(0, 2))
  await db.query('insert into public.editor_scopes values ($1,$2)', [ids[1], 'SD'])
  await db.exec(`
    insert into public.products (slug,title,book_code,education_level,published)
      values ('access-fixture','Fixture','901001','SD',true);
    insert into public.product_favorites (user_id,product_id)
      select '${ids[0]}',id from public.products;
  `)
  const before = await state()
  const legacy = (await db.query('select * from public.admin_memberships order by user_id')).rows
  await db.exec(migration)
  assert.equal(
    (await db.query("select to_regclass('public.admin_memberships') as name")).rows[0].name,
    null,
  )
  assert.deepEqual(
    (await db.query('select * from account_access_archive.admin_memberships order by user_id'))
      .rows,
    legacy,
  )
  assert.deepEqual(await state(), before)
  for (const [index, id] of ids.entries()) {
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${id}'`)
    assert.equal(
      (await db.query('select public.is_admin() as allowed')).rows[0].allowed,
      index === 2,
    )
    assert.equal(
      (await db.query("select public.can_manage_book_level('SMP') as allowed")).rows[0].allowed,
      index === 2,
    )
    await assert.rejects(
      db.query('select * from account_access_archive.admin_memberships'),
      /permission denied/,
    )
    await assert.rejects(
      db.exec('update public.account_memberships set is_super=true'),
      /permission denied/,
    )
    await db.exec('reset role')
  }
  await db.exec('set role anon')
  await assert.rejects(
    db.query('select * from account_access_archive.admin_memberships'),
    /permission denied/,
  )
  await assert.rejects(db.query('select public.is_admin()'), /permission denied/)
  await db.exec('reset role')
  await db.exec(migration)
  assert.deepEqual(await state(), before, 'Retry preserves current access and data')
  await db.exec(rollback)
  assert.deepEqual(
    (await db.query('select * from public.admin_memberships order by user_id')).rows,
    legacy,
  )
  assert.deepEqual(await state(), before, 'Rollback preserves active permissions and favorites')
  await db.exec(rollback)
  await db.exec(migration)
  assert.deepEqual(await state(), before, 'Forward after rollback preserves data')
} finally {
  await db.close()
}

let account
const output = ts.transpileModule(await readFile('server/utils/require-admin.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const exports = {}
new Function('require', 'exports', 'useRuntimeConfig', 'createError', output)(
  () => ({
    requireAccount: async () => {
      if (!account) throw Object.assign(new Error('Silakan login'), { statusCode: 401 })
      return account
    },
  }),
  exports,
  () => ({ public: { supabase: { url: 'https://fixture.supabase.co' } } }),
  (options) => Object.assign(new Error(options.statusMessage), options),
)
await assert.rejects(exports.requireAdmin({}), (error) => error.statusCode === 401)
for (const role of ['sales', 'editor']) {
  for (const isSuper of [false, true]) {
    account = { id: ids[0], nip: '000', role, isSuper, educationLevels: ['SD'] }
    if (role === 'editor' && isSuper) assert.deepEqual(await exports.requireAdmin({}), account)
    else await assert.rejects(exports.requireAdmin({}), (error) => error.statusCode === 403)
  }
}
console.log(
  'PASS: admin guard uses active super Editor role; archive isolation, no legacy privilege promotion, unchanged NIP/membership/scopes/favorites, retry, rollback and forward replay (isolated PostgreSQL).',
)
