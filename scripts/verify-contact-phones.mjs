import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import {
  contactPageSchema,
  contactPhonesSchema,
  defaultContactPage,
} from '../shared/schemas/contact-page.ts'

const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href)
const db = new PGlite()
const migration = await readFile('supabase/migrations/202611100003_contact_phones.sql', 'utf8')
const legacy = Object.fromEntries(
  Object.entries(defaultContactPage).filter(([key]) => key !== 'phones'),
)
const phones = [
  { label: 'Kantor pusat', number: '(021) 871 7006' },
  { label: 'Customer service', number: '+62 21 1234567' },
]
const invalid = [
  [],
  Array.from({ length: 11 }, () => phones[0]),
  [{ label: '', number: '123' }],
  [{ label: 'a'.repeat(61), number: '123' }],
  [{ label: 'Sales', number: 'abc' }],
  [{ label: 'Sales', number: '1'.repeat(41) }],
  [{ label: 'Sales', number: '123', extra: true }],
  ['123'],
  {},
]
assert.deepEqual(
  contactPageSchema.parse(legacy),
  defaultContactPage,
  'Legacy phone receives default label',
)
assert.equal(
  contactPageSchema.parse({ ...legacy, phones: phones.slice(1) }).phone,
  phones[1].number,
  'First number remains available to older clients',
)
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;
    grant usage on schema auth to anon,authenticated;
    create table public.account_memberships(user_id uuid primary key,role text,is_super boolean);
    grant select on public.account_memberships to authenticated;
  `)
  await db.exec(await readFile('supabase/migrations/202611100002_contact_page.sql', 'utf8'))
  const before = (await db.query('select content from public.contact_page')).rows[0].content
  await db.exec(migration)
  assert.deepEqual(
    (await db.query('select content,phones from public.contact_page')).rows[0],
    { content: before, phones: null },
    'Migration preserves old content byte-for-byte',
  )
  for (const value of invalid) {
    assert.equal(contactPhonesSchema.safeParse(value).success, false)
    assert.equal(
      (await db.query('select public.valid_contact_phones($1) as valid', [JSON.stringify(value)]))
        .rows[0].valid,
      false,
    )
    await assert.rejects(
      db.query('update public.contact_page set phones=$1', [JSON.stringify(value)]),
      /check constraint/,
    )
  }
  for (const [index, [role, isSuper]] of [
    ['sales', true],
    ['editor', false],
    ['editor', true],
  ].entries()) {
    const id = `${index + 1}1111111-1111-4111-8111-111111111111`
    await db.query('insert into public.account_memberships values($1,$2,$3)', [id, role, isSuper])
    await db.exec(`set role authenticated;set request.jwt.claim.sub='${id}'`)
    const result = await db.query('update public.contact_page set phones=$1 returning phones', [
      JSON.stringify(phones),
    ])
    assert.equal(result.rows.length, role === 'editor' && isSuper ? 1 : 0)
    await db.exec('reset role')
  }
  await db.exec(migration)
  assert.deepEqual(
    (await db.query('select phones from public.contact_page')).rows[0].phones,
    phones,
    'Retry preserves new phone entries',
  )
  await db.exec('set role anon')
  assert.deepEqual(
    (await db.query('select phones from public.contact_page')).rows[0].phones,
    phones,
  )
  await assert.rejects(
    db.query('update public.contact_page set phones=$1', [JSON.stringify(phones)]),
    /permission denied/,
  )
} finally {
  await db.close()
}

let row = { content: legacy, phones: null }
let written
const query = {
  select: () => query,
  eq: () => query,
  single: async () => ({ data: row, error: null }),
  update: (value) => {
    written = value
    row = value
    return query
  },
}
const client = { from: () => query }
const exports = {}
const output = ts.transpileModule(await readFile('server/repositories/contact-page.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
new Function('require', 'exports', 'useRuntimeConfig', 'createError', output)(
  (name) =>
    name === '#shared/schemas/contact-page'
      ? { contactPageSchema, defaultContactPage }
      : name === '#supabase/server'
        ? { serverSupabaseClient: async () => client }
        : { getCatalogClient: () => client },
  exports,
  () => ({ catalogSource: 'supabase' }),
  (options) => Object.assign(new Error(options.statusMessage), options),
)
assert.deepEqual(await exports.getContactPage({}), defaultContactPage)
const next = contactPageSchema.parse({ ...legacy, phones })
assert.deepEqual(await exports.saveContactPage({}, next), next)
assert.equal('phones' in written.content, false, 'Legacy content CHECK remains valid')
assert.deepEqual(written.phones, phones)
assert.deepEqual(await exports.getContactPage({}), next)
const remaining = contactPageSchema.parse({ ...legacy, phones: phones.slice(1) })
await exports.saveContactPage({}, remaining)
assert.equal(
  written.content.phone,
  phones[1].number,
  'Removing the first entry updates the legacy primary number',
)
assert.deepEqual(written.phones, phones.slice(1))
console.log(
  'PASS: legacy number/label fallback, first-number compatibility, atomic repository save/read, 1–10 validated labelled phones, RLS super-only writes/public reads, migration preserves existing content and retry preserves extra numbers.',
)
