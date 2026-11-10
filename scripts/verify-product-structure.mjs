import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { z } from 'zod'
import { educationLevelSchema } from '../shared/schemas/auth.ts'
import { structureIds as ids, structureFixture } from './fixtures/product-structure.mjs'

const {
  structureInputSchema,
  structurePath,
  structureOptions,
  structureRowSchema,
  mapStructureRow,
} = await moduleAt('shared/schemas/product-structure.ts', {
  zod: { z },
  './auth': { educationLevelSchema },
})

const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href)
const db = new PGlite()
const migrationName = '202611100005_product_structure.sql'
const superId = '77777777-7777-4777-8777-777777777777'
const editorId = '11111111-1111-4111-8111-111111111111'
const salesId = '22222222-2222-4222-8222-222222222222'
const newRoot = 'a5555555-5555-4555-8555-555555555555'
async function role(id) {
  await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${id}'`)
}
async function addNode(node) {
  await db.query(
    'insert into public.product_structure_nodes(id,education_level,parent_id,name,sort_order,product_status) values($1,$2,$3,$4,$5,$6)',
    [node.id, node.educationLevel, node.parentId, node.name, node.sortOrder, node.productStatus],
  )
}
async function nodes() {
  return (
    await db.query('select * from public.product_structure_nodes where not archived')
  ).rows.map(mapStructureRow)
}
assert.equal(
  structurePath(structureFixture, ids.leaf)
    .map((node) => node.name)
    .join(' → '),
  'Buku Soal → Asesmen Formatif → Bupena Merdeka',
)
assert.equal(
  structureOptions(structureFixture).find((option) => option.id === ids.leaf).label,
  'Buku Soal → Asesmen Formatif → Bupena Merdeka',
)
assert.deepEqual(structurePath([{ ...structureFixture[0], parentId: ids.root }], ids.root), [])
assert.equal(
  structureInputSchema.safeParse({ ...structureFixture[0], archived: true }).success,
  false,
)
try {
  await db.exec(`
    create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;
    grant usage on schema auth to anon,authenticated;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated;
    grant select on storage.objects to anon,authenticated;
    grant insert,delete on storage.objects to authenticated;
  `)
  for (const name of (await readdir('supabase/migrations'))
    .filter((name) => name.endsWith('.sql') && name < migrationName)
    .sort())
    await db.exec(await readFile(`supabase/migrations/${name}`, 'utf8'))
  await db.exec(`
    insert into auth.users(id,raw_app_meta_data) values ('${superId}','{"employee_provisioning":true}'),('${editorId}','{"employee_provisioning":true}'),('${salesId}','{"employee_provisioning":true}');
    insert into public.account_memberships(user_id,role,is_super) values ('${superId}','editor',true),('${editorId}','editor',false),('${salesId}','sales',true);
    insert into public.editor_scopes values ('${editorId}','SD');
    insert into public.products(slug,title,book_code,education_level,published) values ('legacy-structure','Legacy','910000','SD',false);
  `)
  const legacy = (await db.query('select * from public.products')).rows
  await db.exec(await readFile(`supabase/migrations/${migrationName}`, 'utf8'))
  const after = (await db.query('select * from public.products')).rows
  assert.deepEqual(
    after.map(({ structure_node_id, ...row }) => {
      assert.equal(structure_node_id, null)
      return row
    }),
    legacy,
  )
  await role(superId)
  for (const node of structureFixture) await addNode(node)
  await assert.rejects(
    db.query('update public.product_structure_nodes set parent_id=$1 where id=$2', [
      ids.leaf,
      ids.root,
    ]),
    /structure_cycle/,
  )
  await assert.rejects(
    db.query('update public.product_structure_nodes set parent_id=$1 where id=$2', [
      ids.other,
      ids.child,
    ]),
    /structure_parent_invalid/,
  )
  await assert.rejects(
    db.query("update public.product_structure_nodes set education_level='SMP' where id=$1", [
      ids.leaf,
    ]),
    /structure_level_immutable/,
  )
  await assert.rejects(
    db.query('update public.product_structure_nodes set archived=true where id=$1', [ids.root]),
    /structure_archive_children_first/,
  )
  await role(editorId)
  await db.query(
    "insert into public.products(slug,title,book_code,education_level,published,structure_node_id) values('structure-public','Bupena','910001','SD',true,$1),('structure-draft','Draft','910002','SD',false,$1)",
    [ids.leaf],
  )
  await assert.rejects(
    db.query(
      "insert into public.products(slug,title,book_code,education_level,structure_node_id) values('cross-level','Invalid','910003','SD',$1)",
      [ids.other],
    ),
    /book_structure_invalid/,
  )
  await assert.rejects(
    db.query(
      "insert into public.products(slug,title,book_code,education_level,structure_node_id) values('outside-scope','Invalid','910004','SMP',$1)",
      [ids.other],
    ),
    /row-level security/,
    'A matching branch level does not grant a scoped Editor access to another education level',
  )
  await assert.rejects(addNode({ ...structureFixture[0], id: newRoot }), /row-level security/)
  assert.equal(
    (
      await db.query(
        "update public.product_structure_nodes set name='Forbidden' where id=$1 returning id",
        [ids.root],
      )
    ).rows.length,
    0,
  )
  await assert.rejects(
    db.query('select public.archive_product_structure_node($1)', [ids.root]),
    /structure_forbidden/,
  )
  await role(salesId)
  await assert.rejects(addNode({ ...structureFixture[0], id: newRoot }), /row-level security/)
  await assert.rejects(
    db.query('select public.archive_product_structure_node($1)', [ids.root]),
    /structure_forbidden/,
  )
  await role(superId)
  await assert.rejects(
    db.query('select public.archive_product_structure_node($1)', [ids.root]),
    /structure_in_use/,
  )
  await db.exec("update public.products set structure_node_id=null where book_code='910001'")
  await assert.rejects(
    db.query('select public.archive_product_structure_node($1)', [ids.root]),
    /structure_in_use/,
    'Draft alone prevents archival',
  )
  await db.query(
    "update public.product_structure_nodes set name='Penilaian Formatif' where id=$1",
    [ids.child],
  )
  assert.match(
    structurePath(await nodes(), ids.leaf)
      .map((node) => node.name)
      .join(' → '),
    /Penilaian Formatif/,
  )
  await addNode({ ...structureFixture[0], id: newRoot, name: 'Kategori baru' })
  await db.query('update public.product_structure_nodes set parent_id=$1 where id=$2', [
    newRoot,
    ids.child,
  ])
  assert.equal(structurePath(await nodes(), ids.leaf)[0].name, 'Kategori baru')
  assert.equal(
    (await db.query('select public.archive_product_structure_node($1) as count', [ids.root]))
      .rows[0].count,
    1,
  )
  await assert.rejects(
    db.query('update public.product_structure_nodes set parent_id=$1 where id=$2', [
      ids.root,
      ids.child,
    ]),
    /structure_parent_invalid/,
  )
  await assert.rejects(
    db.exec("update public.products set education_level='SMP' where book_code='910002'"),
    /book_structure_invalid/,
  )
  await db.exec(
    "update public.products set structure_node_id=null,education_level='SMP' where book_code='910002'",
  )
  assert.equal(
    (await db.query('select public.archive_product_structure_node($1) as count', [newRoot])).rows[0]
      .count,
    3,
  )
  await assert.rejects(
    db.query("update public.products set structure_node_id=$1 where book_code='910001'", [
      ids.leaf,
    ]),
    /book_structure_invalid/,
  )
  await db.exec("update public.products set title='Legacy saved' where book_code='910000'")
  await db.exec('reset role')
  const guard = (await db.query('select revision from product_structure_private.write_guard'))
    .rows[0].revision
  assert(Number(guard) > 0, 'Both topology and book placement writes use the serialization guard')
  await db.exec('set role anon')
  const publicNodes = await nodes()
  assert.deepEqual(
    publicNodes.map((node) => node.id),
    [ids.other],
  )
  assert.equal(
    (await db.query("select id from public.products where book_code='910002'")).rows.length,
    0,
    'Public cannot read draft',
  )
  await assert.rejects(
    db.query('select * from product_structure_private.write_guard'),
    /permission denied/,
  )
  await assert.rejects(
    db.query('select public.archive_product_structure_node($1)', [ids.other]),
    /permission denied/,
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
    defineEventHandler: (fn) => fn,
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
let allow = false
let writes = 0
const post = (
  await moduleAt('server/api/admin/product-structure/index.post.ts', {
    '#shared/schemas/product-structure': { structureInputSchema },
    '../../../utils/require-editor': {
      requireSuperEditor: async () => {
        if (!allow) throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
      },
    },
    '../../../repositories/product-structure': {
      saveStructureNode: async () => {
        writes++
        return structureFixture[0]
      },
    },
  })
).default
const input = {
  educationLevel: 'SD',
  name: 'Buku Soal',
  parentId: null,
  sortOrder: 0,
  productStatus: null,
}
await assert.rejects(post({ body: input }), (error) => error.statusCode === 403)
assert.equal(writes, 0)
allow = true
await assert.rejects(
  post({ body: { ...input, archived: true } }),
  (error) => error.statusCode === 400,
)
assert.deepEqual(await post({ body: input }), structureFixture[0])
const rows = structureFixture.map((node) => ({
  id: node.id,
  education_level: node.educationLevel,
  parent_id: node.parentId,
  name: node.name,
  sort_order: node.sortOrder,
  product_status: node.productStatus,
  archived: false,
}))
const query = {
  select: () => query,
  eq: () => query,
  order: () => query,
  range: async () => ({ data: rows.filter((row) => row.education_level === 'SD'), error: null }),
}
const repository = await moduleAt(
  'server/repositories/product-structure.ts',
  {
    zod: { z },
    '#supabase/server': {},
    '#shared/schemas/product-structure': { mapStructureRow, structurePath, structureRowSchema },
    '../utils/catalog-client': { getCatalogClient: () => ({ from: () => query }) },
  },
  { useRuntimeConfig: () => ({ catalogSource: 'supabase' }) },
)
await repository.validateBookStructure({}, ids.leaf, 'SD')
await assert.rejects(
  repository.validateBookStructure({}, ids.other, 'SD'),
  (error) => error.statusCode === 400,
)
const editorSchemas = await moduleAt('shared/schemas/editor.ts', {
  zod: { z },
  './auth': { educationLevelSchema },
  '../utils/book-grades': { getGradesForLevel: () => [1, 2, 3, 4, 5, 6] },
  '../utils/book-divisions': { divisionCodeSchema: z.string() },
  './landing-hero': { landingHeroSchema: z.object({ heading: z.string(), body: z.string() }) },
})
const inputBook = {
  bookCode: '910001',
  educationLevel: 'SD',
  structureNodeId: ids.leaf,
  divisionCode: null,
  subject: null,
  grade: 1,
  title: 'Fixture',
  author: 'Penulis',
  curriculum: null,
  isbn: null,
  synopsis: null,
  targetMarket: [],
  highlights: [],
  price: 100,
  publicationYear: 2026,
  published: true,
}
assert.equal(editorSchemas.bookInputSchema.safeParse(inputBook).success, true)
assert.equal(
  editorSchemas.bookInputSchema.safeParse({ ...inputBook, structureNodeId: 'wrong' }).success,
  false,
)
const { structureNodeId: omittedId, ...withoutStructure } = inputBook
assert.equal(omittedId, ids.leaf)
assert.equal(editorSchemas.bookInputSchema.safeParse(withoutStructure).success, true)
assert.equal(
  editorSchemas.bookInputSchema.safeParse({ ...inputBook, structureNodeId: null }).success,
  true,
)
const bookRow = {
  id: 'b1111111-1111-4111-8111-111111111111',
  slug: 'fixture',
  book_code: '910001',
  education_level: 'SD',
  structure_node_id: ids.leaf,
  division_code: null,
  subject: null,
  grade: 1,
  title: 'Fixture',
  author: 'Penulis',
  curriculum: null,
  isbn: null,
  synopsis: null,
  target_market: [],
  highlights: [],
  price: 100,
  publication_year: 2026,
  featured: false,
  published: true,
  image_path: null,
  flyer_path: null,
  dummy_book_path: null,
  product_knowledge_path: null,
  product_knowledge_preview_path: null,
  updated_at: '2026-11-10T00:00:00Z',
}
let writtenBook
const bookClient = {
  from: () => {
    const filters = []
    const q = {
      select: (columns) => {
        assert(columns.includes('structure_node_id'))
        return q
      },
      eq: (key, value) => {
        filters.push([key, value])
        return q
      },
      insert: (value) => {
        writtenBook = value
        return q
      },
      maybeSingle: async () => ({
        data: filters.every(([key, value]) => bookRow[key] === value) ? bookRow : null,
        error: null,
      }),
    }
    return q
  },
}
const commonDependencies = {
  zod: { z },
  '#shared/schemas/editor': editorSchemas,
  '#shared/schemas/auth': { educationLevelSchema },
  '#shared/utils/book-divisions': { divisionCodeSchema: z.string() },
  '../utils/catalog-client': { getCatalogClient: () => bookClient },
  '../utils/storage': { getProductImageUrl: () => '/fixture.png' },
}
const publicRepository = await moduleAt(
  'server/repositories/products.ts',
  {
    ...commonDependencies,
    '#shared/utils/landing-subjects': { landingSubjects: [] },
    '../data/products': { demoProducts: [] },
    './product-structure': { listProductStructure: async () => structureFixture },
    '#shared/schemas/product-structure': { structurePath },
  },
  {
    useRuntimeConfig: () => ({
      catalogSource: 'supabase',
      public: { supabase: { url: 'https://fixture.invalid' } },
    }),
  },
)
assert.deepEqual(
  (await publicRepository.getProduct({}, '910001')).structurePath.map((node) => node.name),
  ['Buku Soal', 'Asesmen Formatif', 'Bupena Merdeka'],
)
assert.equal((await publicRepository.getProduct({}, 'fixture')).structureNodeId, ids.leaf)
const editorRepository = await moduleAt(
  'server/repositories/editor-books.ts',
  {
    ...commonDependencies,
    '#supabase/server': { serverSupabaseClient: async () => bookClient },
    '../utils/require-editor': { assertBookScope: () => {} },
    './classifications': { validateBookClassifications: async () => {} },
    './product-structure': {
      validateBookStructure: repository.validateBookStructure,
      structureError: repository.structureError,
    },
  },
  { useRuntimeConfig: () => ({ public: { supabase: { url: 'https://fixture.invalid' } } }) },
)
assert.equal(
  (await editorRepository.getEditorBook({}, { isSuper: true }, bookRow.id)).structureNodeId,
  ids.leaf,
)
assert.equal(
  (await editorRepository.saveEditorBook({}, { isSuper: true }, inputBook)).structureNodeId,
  ids.leaf,
)
assert.equal(
  writtenBook.structure_node_id,
  ids.leaf,
  'Actual editor repository persists the branch ID',
)
console.log(
  'PASS: preserved legacy books; category/subbranch/leaf links, rename/reparent paths, null selection, wrong level/cycles/archived-parent rejected; draft/published references block subtree archive; release then archive hides descendants; ordinary Editor/Sales management denied by RLS/RPC and real handler guard; public active-only and draft isolation; private serialization guard runs; server branch validation. Isolated PostgreSQL, no live writes; multi-session contention requires local PostgreSQL.',
)
