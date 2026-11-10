import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { z } from 'zod'
import { saveSalesAreasSchema, storedSalesAreasSchema } from '../shared/schemas/sales-areas.ts'
import { educationLevelSchema, nipSchema } from '../shared/schemas/auth.ts'

const invalid = [
  [],
  [''],
  ['a'.repeat(101)],
  Array.from({ length: 11 }, (_, i) => `Area ${i}`),
  ['Jakarta', ' jakarta '],
  [1],
  [null],
]
for (const areas of invalid) assert.equal(saveSalesAreasSchema.safeParse({ areas }).success, false)
for (const payload of [
  { areas: ['Jakarta'], role: 'editor' },
  { areas: ['Jakarta'], userId: 'other' },
  { areas: ['Jakarta'], isSuper: true },
])
  assert.equal(saveSalesAreasSchema.safeParse(payload).success, false)
assert.deepEqual(saveSalesAreasSchema.parse({ areas: [' Jakarta Timur ', 'Bekasi'] }), {
  areas: ['Jakarta Timur', 'Bekasi'],
})

const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href)
const db = new PGlite()
const migrationName = '202611100004_sales_areas.sql'
const migration = await readFile(`supabase/migrations/${migrationName}`, 'utf8')
const ids = [1, 2, 3].map((n) => `${n}1111111-1111-4111-8111-111111111111`)
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;
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
    .filter((name) => name.endsWith('.sql') && name < migrationName)
    .sort())
    await db.exec(await readFile(`supabase/migrations/${name}`, 'utf8'))
  for (const [index, id] of ids.entries()) {
    await db.query('insert into auth.users(id,raw_app_meta_data) values($1,$2)', [
      id,
      { employee_provisioning: true },
    ])
    await db.query(
      'insert into public.account_memberships(user_id,role,is_super) values($1,$2,$3)',
      [id, index === 2 ? 'editor' : 'sales', index === 2],
    )
  }
  const before = (
    await db.query(
      'select user_id,role,is_super,created_at from public.account_memberships order by user_id',
    )
  ).rows
  await db.exec(migration)
  assert.deepEqual(
    (
      await db.query(
        'select user_id,role,is_super,created_at from public.account_memberships order by user_id',
      )
    ).rows,
    before,
  )
  assert(
    (await db.query('select sales_areas from public.account_memberships')).rows.every(
      (row) => row.sales_areas.length === 0,
    ),
  )
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${ids[0]}'`)
  assert.equal(
    (
      await db.query(
        'update public.account_memberships set sales_areas=$1 where user_id=$2 returning user_id',
        [['Jakarta Timur', 'Bekasi'], ids[0]],
      )
    ).rows.length,
    1,
  )
  assert.equal(
    (
      await db.query(
        'update public.account_memberships set sales_areas=$1 where user_id=$2 returning user_id',
        [['Other'], ids[1]],
      )
    ).rows.length,
    0,
  )
  await assert.rejects(
    db.exec("update public.account_memberships set role='editor'"),
    /permission denied/,
  )
  await assert.rejects(
    db.exec('update public.account_memberships set is_super=true'),
    /permission denied/,
  )
  await assert.rejects(
    db.exec(`update public.account_memberships set user_id='${ids[1]}'`),
    /permission denied/,
  )
  for (const areas of [[''], ['a'.repeat(101)], ['Jakarta', 'jakarta'], [null]])
    await assert.rejects(
      db.query('update public.account_memberships set sales_areas=$1', [areas]),
      /check constraint/,
    )
  assert.equal(
    (await db.query("select public.can_manage_book_level('SD') as allowed")).rows[0].allowed,
    false,
    'Self-reported area never grants Editor scope',
  )
  await db.exec(`set request.jwt.claim.sub='${ids[2]}'`)
  assert.equal(
    (
      await db.query('update public.account_memberships set sales_areas=$1 returning user_id', [
        ['Editor area'],
      ])
    ).rows.length,
    0,
  )
  await db.exec('reset role;set role anon')
  await assert.rejects(
    db.exec("update public.account_memberships set sales_areas=array['X']"),
    /permission denied/,
  )
  await db.exec('reset role')
  await db.exec(migration)
  assert.deepEqual(
    (
      await db.query('select sales_areas from public.account_memberships where user_id=$1', [
        ids[0],
      ])
    ).rows[0].sales_areas,
    ['Jakarta Timur', 'Bekasi'],
  )
} finally {
  await db.close()
}

async function moduleAt(path, dependencies, globals = {}) {
  const output = ts.transpileModule(await readFile(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  const scope = {
    defineEventHandler: (handler) => handler,
    readBody: (event) => event.body,
    createError: (options) => Object.assign(new Error(options.statusMessage), options),
    ...globals,
  }
  new Function('require', 'exports', ...Object.keys(scope), output)(
    (name) => dependencies[name],
    exports,
    ...Object.values(scope),
  )
  return exports
}
let account
let written
const handler = (
  await moduleAt('server/api/auth/sales-areas.put.ts', {
    '#shared/schemas/sales-areas': { saveSalesAreasSchema },
    '../../utils/require-account': {
      requireAccount: async () => {
        if (!account) throw Object.assign(new Error('Login'), { statusCode: 401 })
        return account
      },
    },
    '../../repositories/sales-areas': {
      saveSalesAreas: async (_event, owner, areas) => {
        written = { id: owner.id, areas }
        return { areas }
      },
    },
  })
).default
await assert.rejects(handler({ body: { areas: ['Jakarta'] } }), (error) => error.statusCode === 401)
account = { id: ids[2], role: 'editor' }
await assert.rejects(handler({ body: { areas: ['Jakarta'] } }), (error) => error.statusCode === 403)
assert.equal(written, undefined)
account = { id: ids[0], role: 'sales' }
await assert.rejects(
  handler({ body: { areas: ['Jakarta'], userId: ids[1] } }),
  (error) => error.statusCode === 400,
)
assert.deepEqual(await handler({ body: { areas: [' Jakarta '] } }), { areas: ['Jakarta'] })
assert.deepEqual(written, { id: ids[0], areas: ['Jakarta'] })
let sessionRole = 'sales'
const client = {
  auth: { getUser: async () => ({ data: { user: { id: ids[0] } }, error: null }) },
  from: (name) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data:
            name === 'employee_registry'
              ? { nip: '000123' }
              : { role: sessionRole, is_super: false, sales_areas: ['Jakarta', 'Bekasi'] },
          error: null,
        }),
      }),
    }),
  }),
}
const session = (
  await moduleAt('server/utils/require-account.ts', {
    zod: { z },
    '#supabase/server': { serverSupabaseClient: async () => client },
    '#shared/schemas/auth': { educationLevelSchema, nipSchema },
    '#shared/schemas/sales-areas': { storedSalesAreasSchema },
  })
).requireAccount
assert.deepEqual((await session({})).salesAreas, ['Jakarta', 'Bekasi'])
sessionRole = 'invalid'
await assert.rejects(session({}), (error) => error.statusCode === 403)
console.log(
  'PASS: trimmed multi-area profile, duplicate/length/count/forged-role rejection; own Sales column-only RLS, foreign accounts and Editors denied, role/super/ID protected, no Editor scope escalation; data preservation/retry, actual endpoint ownership and session area read (isolated PostgreSQL).',
)
