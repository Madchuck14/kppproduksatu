import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { registrationCredentialsSchema, loginSchema } from '../shared/schemas/auth.ts'

// Local PostgreSQL and mocked Auth boundaries only; never reads .env or contacts Supabase.
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href)
const db = new PGlite()
const migration = '202611060001_employee_nip_auth.sql'
const legacy = '11111111-1111-4111-8111-111111111111'
const sales = '22222222-2222-4222-8222-222222222222'
const editor = '33333333-3333-4333-8333-333333333333'
const invalid = '44444444-4444-4444-8444-444444444444'
const password = 'FixturePassword123!'
async function user(id, nip, role = 'sales', level, trusted = true) {
  await db.query(
    'insert into auth.users (id,email,raw_user_meta_data,raw_app_meta_data) values ($1,$2,$3,$4)',
    [
      id,
      `${nip}@nip.invalid`,
      {
        nip,
        registration_role: role,
        ...(level ? { requested_education_level: level } : {}),
        is_super: true,
      },
      trusted ? { employee_registration: true } : {},
    ],
  )
}
async function snapshot() {
  return {
    accounts: (await db.query('select * from public.account_memberships order by user_id')).rows,
    scopes: (await db.query('select * from public.editor_scopes order by user_id,education_level'))
      .rows,
    registry: (await db.query('select * from public.employee_registry order by nip')).rows,
  }
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
  for (const name of (await readdir('supabase/migrations'))
    .filter((n) => n.endsWith('.sql') && n < migration)
    .sort())
    await db.exec(await readFile(`supabase/migrations/${name}`, 'utf8'))
  await user(legacy, '001', 'editor', 'SD')
  const oldAccounts = (await db.query('select * from public.account_memberships')).rows
  const sql = await readFile(`supabase/migrations/${migration}`, 'utf8')
  await db.exec(sql)
  assert.equal((await db.query('select * from public.employee_registry')).rows.length, 0)
  assert.deepEqual((await db.query('select * from public.account_memberships')).rows, oldAccounts)
  await db.exec(`insert into public.employee_registry (nip,role,education_level,user_id) values
    ('001','editor','SD','${legacy}'),('000123','sales',null,null),('000456','editor','SMP',null)`)
  for (const args of [
    [invalid, '999'],
    [invalid, '000123', 'editor', 'SD'],
    [invalid, '000456', 'editor', 'SD'],
    [invalid, '000123', 'sales', undefined, false],
  ]) {
    await assert.rejects(user(...args), /employee_registration_/)
    assert.equal((await db.query('select * from auth.users where id=$1', [invalid])).rows.length, 0)
  }
  assert.equal(
    (await db.query("select user_id from public.employee_registry where nip='000123'")).rows[0]
      .user_id,
    null,
  )
  await user(sales, '000123')
  await user(editor, '000456', 'editor', 'SMP')
  await assert.rejects(user(invalid, '000123'), /employee_registration_unavailable/)
  assert.deepEqual(
    (
      await db.query('select role,is_super from public.account_memberships where user_id=$1', [
        editor,
      ])
    ).rows[0],
    { role: 'editor', is_super: false },
  )
  assert.deepEqual(
    (await db.query('select education_level from public.editor_scopes where user_id=$1', [editor]))
      .rows,
    [{ education_level: 'SMP' }],
  )
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${editor}'`)
  assert.deepEqual((await db.query('select nip,user_id from public.employee_registry')).rows, [
    { nip: '000456', user_id: editor },
  ])
  await assert.rejects(db.query('select role from public.employee_registry'), /permission denied/)
  await assert.rejects(
    db.exec("insert into public.employee_registry (nip) values ('999')"),
    /permission denied/,
  )
  for (const level of ['SD', 'SMP', 'SMA', 'SMK'])
    assert.equal(
      (await db.query('select public.can_manage_book_level($1) as allowed', [level])).rows[0]
        .allowed,
      level === 'SMP',
    )
  await assert.rejects(
    db.exec('update public.account_memberships set is_super=true'),
    /permission denied/,
  )
  await db.exec('reset role; set role anon')
  await assert.rejects(db.query('select nip from public.employee_registry'), /permission denied/)
  await db.exec('reset role')
  await db.query('update auth.users set raw_user_meta_data=$1 where id=$2', [
    { nip: '001', registration_role: 'editor', requested_education_level: 'SMK' },
    sales,
  ])
  assert.equal(
    (await db.query('select role from public.account_memberships where user_id=$1', [sales]))
      .rows[0].role,
    'sales',
  )
  const saved = await snapshot()
  await db.exec(sql)
  assert.deepEqual(await snapshot(), saved, 'Retry preserves all identities and access')
  await db.exec(await readFile('supabase/rollback/202611060001_email_auth.sql', 'utf8'))
  assert.deepEqual(await snapshot(), saved, 'Rollback preserves registry and account data')
  await user(invalid, '999')
  await db.exec(sql)
  assert.equal(
    (await db.query('select user_id from public.employee_registry where nip=$1', ['001'])).rows[0]
      .user_id,
    legacy,
  )
} finally {
  await db.close()
}

// Execute the actual endpoint code with only its external Auth/registry boundaries mocked.
async function endpoint(path, dependencies) {
  const output = ts.transpileModule(await readFile(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  new Function('require', 'exports', 'defineEventHandler', 'readBody', 'createError', output)(
    (name) => {
      if (name === '#shared/schemas/auth') return { registrationCredentialsSchema, loginSchema }
      return dependencies
    },
    exports,
    (handler) => handler,
    (event) => event.body,
    (options) => Object.assign(new Error(options.statusMessage), options),
  )
  return exports.default
}
let employee = { nip: '000123', role: 'sales', education_level: null, user_id: null }
let created
let authError = null
let authUser = { id: sales, email: 'legacy@example.com' }
let loginUserId = sales
let credentials
const dependencies = {
  findEmployee: async () => employee,
  getEmployeeAdmin: () => ({
    auth: {
      admin: {
        createUser: async (attributes) => {
          created = attributes
          return { error: authError }
        },
        getUserById: async () => ({ data: { user: authUser }, error: null }),
      },
    },
  }),
  getCatalogClient: () => ({
    auth: {
      signInWithPassword: async (input) => {
        credentials = input
        return {
          data: {
            user: { id: loginUserId },
            session: { access_token: 'fixture-access', refresh_token: 'fixture-refresh' },
          },
          error: authError,
        }
      },
    },
  }),
}
const register = await endpoint('server/api/auth/register.post.ts', dependencies)
const login = await endpoint('server/api/auth/login.post.ts', dependencies)
for (const body of [
  { nip: 'bad', password },
  { nip: '123', password: 'short' },
  { nip: '123', password, role: 'editor' },
  { nip: '123', password, role: 'sales', educationLevel: 'SD' },
  { nip: '123', password, isSuper: true },
  { email: 'old@example.com', password },
])
  await assert.rejects(register({ body }), (error) => error.statusCode === 400)
assert.equal(created, undefined)
for (const row of [
  null,
  { ...employee, user_id: sales },
  { ...employee, role: 'editor', education_level: 'SD' },
]) {
  employee = row
  await assert.rejects(
    register({ body: { nip: '000123', password } }),
    (error) => error.statusCode === 400,
  )
}
employee = { nip: '000123', role: 'sales', education_level: null, user_id: null }
assert.match((await register({ body: { nip: '000123', password } })).message, /berhasil/)
assert.equal(created.email, '000123@nip.invalid')
assert.equal(created.email_confirm, true)
assert.deepEqual(created.app_metadata, { employee_registration: true })
assert.equal(created.user_metadata.is_super, undefined)
authError = { status: 429 }
await assert.rejects(
  register({ body: { nip: '000123', password } }),
  (error) => error.statusCode === 429,
)
authError = null
employee.user_id = sales
assert.deepEqual(await login({ body: { nip: '000123', password } }), {
  access_token: 'fixture-access',
  refresh_token: 'fixture-refresh',
})
assert.equal(credentials.email, 'legacy@example.com', 'Legacy Auth identity preserved')
authUser = { id: sales, email: '000123@nip.invalid' }
await login({ body: { nip: '000123', password } })
assert.equal(credentials.email, '000123@nip.invalid')
loginUserId = editor
await assert.rejects(
  login({ body: { nip: '000123', password } }),
  (error) => error.statusCode === 401,
)
loginUserId = sales
authError = { status: 400 }
await assert.rejects(
  login({ body: { nip: '000123', password: 'wrong' } }),
  (error) => error.statusCode === 401,
)
authError = { status: 429 }
await assert.rejects(
  login({ body: { nip: '000123', password } }),
  (error) => error.statusCode === 429,
)
authError = null
employee = null
await assert.rejects(login({ body: { nip: '999', password } }), (error) => error.statusCode === 401)
console.log(
  'PASS: empty registry, legacy preservation, atomic/duplicate claims, trusted role/scope, RLS isolation, metadata tampering, retry/rollback; actual register/login handlers with local Auth boundaries, NIP validation, legacy identity, wrong password/user and 429.',
)
