import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import {
  contactPageSchema,
  defaultContactPage as currentContactPage,
  contactPhoneHref,
  contactWhatsappHref,
} from '../shared/schemas/contact-page.ts'

// Isolated PostgreSQL and actual endpoint/repository code with mocked external boundaries.
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href)
const db = new PGlite()
const sql = await readFile('supabase/migrations/202611100002_contact_page.sql', 'utf8')
const defaultContactPage = Object.fromEntries(
  Object.entries(currentContactPage).filter(([key]) => key !== 'phones'),
)
assert.deepEqual(contactPageSchema.parse(defaultContactPage), currentContactPage)
assert.equal(contactPhoneHref('(021) 871 7006'), 'tel:0218717006')
assert.equal(contactWhatsappHref('08191-1500-885'), 'https://wa.me/6281911500885')
assert.equal(contactWhatsappHref('+62 819 1150 0885'), 'https://wa.me/6281911500885')
const invalid = [
  { ...defaultContactPage, heading: ' ' },
  { ...defaultContactPage, description: 'a'.repeat(601) },
  { ...defaultContactPage, email: 'bad' },
  { ...defaultContactPage, phone: 'javascript:alert(1)' },
  { ...defaultContactPage, whatsapp: '123' },
  ...[
    'javascript:alert(1)',
    'http://www.google.com/maps/embed',
    'https://evil.example/maps/embed',
    'https://www.google.com.evil.example/maps/embed',
    'https://www.google.com/maps/embed/../search',
    'https://www.google.com/maps/embed"><script>',
  ].map((mapEmbedUrl) => ({ ...defaultContactPage, mapEmbedUrl })),
  { ...defaultContactPage, hours: [] },
  { ...defaultContactPage, hours: [{ day: 'x', time: 'x' }, defaultContactPage.hours[1]] },
  { ...defaultContactPage, isSuper: true },
]
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
    $$;
    grant usage on schema auth to anon,authenticated;
    create table public.account_memberships (user_id uuid primary key,role text,is_super boolean);
    alter table public.account_memberships enable row level security;
    grant select on public.account_memberships to authenticated;
    create policy own_membership on public.account_memberships for select to authenticated using(user_id=(select auth.uid()));
  `)
  await db.exec(sql)
  assert.deepEqual(
    (await db.query('select content from public.contact_page')).rows[0].content,
    defaultContactPage,
  )
  for (const value of invalid) {
    assert.equal(contactPageSchema.safeParse(value).success, false)
    assert.equal(
      (await db.query('select public.valid_contact_page($1) as valid', [value])).rows[0].valid,
      false,
    )
  }
  for (const [index, [role, isSuper]] of [
    ['sales', false],
    ['sales', true],
    ['editor', false],
    ['editor', true],
  ].entries()) {
    const id = `${index + 1}1111111-1111-4111-8111-111111111111`
    await db.query('insert into public.account_memberships values($1,$2,$3)', [id, role, isSuper])
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${id}'`)
    const content = { ...defaultContactPage, heading: `Updated ${index}` }
    const result = await db.query('update public.contact_page set content=$1 returning content', [
      content,
    ])
    assert.equal(result.rows.length, role === 'editor' && isSuper ? 1 : 0)
    await assert.rejects(db.exec('delete from public.contact_page'), /permission denied/)
    await assert.rejects(
      db.query('insert into public.contact_page values(false,$1)', [content]),
      /permission denied/,
    )
    await db.exec('reset role')
  }
  const saved = (await db.query('select content from public.contact_page')).rows[0].content
  await db.exec(sql)
  assert.deepEqual(
    (await db.query('select content from public.contact_page')).rows[0].content,
    saved,
    'Migration retry preserves edited content',
  )
  await db.exec('set role anon')
  assert.deepEqual(
    (await db.query('select content from public.contact_page')).rows[0].content,
    saved,
  )
  await assert.rejects(
    db.query('update public.contact_page set content=$1', [defaultContactPage]),
    /permission denied/,
  )
  await db.exec('reset role')
  await assert.rejects(
    db.query('update public.contact_page set content=$1', [invalid[0]]),
    /check constraint/,
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
let allowed = false
let savedCount = 0
const put = (
  await moduleAt('server/api/admin/contact.put.ts', {
    '#shared/schemas/contact-page': { contactPageSchema },
    '../../utils/require-editor': {
      requireSuperEditor: async () => {
        if (!allowed) throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
      },
    },
    '../../repositories/contact-page': {
      saveContactPage: async (_event, content) => {
        savedCount++
        return content
      },
    },
  })
).default
await assert.rejects(put({ body: defaultContactPage }), (error) => error.statusCode === 403)
assert.equal(savedCount, 0)
allowed = true
await assert.rejects(put({ body: invalid[0] }), (error) => error.statusCode === 400)
assert.equal(savedCount, 0)
assert.deepEqual(await put({ body: defaultContactPage }), currentContactPage)
assert.equal(savedCount, 1)
let source = 'demo'
const unavailable = {
  from: () => ({
    select: () => ({
      eq: () => ({ single: async () => ({ error: { code: 'missing' }, data: null }) }),
    }),
  }),
}
const repository = await moduleAt(
  'server/repositories/contact-page.ts',
  {
    '#shared/schemas/contact-page': { contactPageSchema, defaultContactPage: currentContactPage },
    '#supabase/server': {},
    '../utils/catalog-client': { getCatalogClient: () => unavailable },
  },
  { useRuntimeConfig: () => ({ catalogSource: source }) },
)
assert.deepEqual(await repository.getContactPage({}), currentContactPage)
source = 'supabase'
await assert.rejects(repository.getContactPage({}), (error) => error.statusCode === 503)
console.log(
  'PASS: seeded content matches existing page; strict validation and map URLs; anonymous reads, super Editor-only writes including RLS; no insert/delete; migration retry preserves edits; actual PUT validates after guard; Supabase failures never fall back to demo.',
)
