import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const cache = new Map()
let source = 'demo'
let client
function load(relative) {
  const filename = path.resolve(relative)
  if (cache.has(filename)) return cache.get(filename).exports
  const module = { exports: {} }
  cache.set(filename, module)
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const resolve = (id) => {
    if (id === '#supabase/server') return { serverSupabaseClient: async () => client }
    if (id.endsWith('/require-editor')) return { assertBookScope: () => {} }
    if (id.endsWith('/catalog-client')) return { getCatalogClient: () => client }
    if (id.endsWith('/storage')) return { getProductImageUrl: () => '/images/book-placeholder.svg' }
    if (id.startsWith('#shared/')) return load('shared/' + id.slice(8) + '.ts')
    if (id.startsWith('.')) return load(path.resolve(path.dirname(filename), id + '.ts'))
    return require(id)
  }
  new Function('require', 'module', 'exports', 'useRuntimeConfig', 'createError', output)(
    resolve,
    module,
    module.exports,
    () => ({ catalogSource: source, public: { supabase: { url: '' } } }),
    (error) => Object.assign(new Error(error.statusMessage), error),
  )
  return module.exports
}
const { catalogQuerySchema } = load('shared/schemas/catalog.ts')
const { bookInputSchema } = load('shared/schemas/editor.ts')
const { demoProducts } = load('server/data/products.ts')
const { listProducts, getLandingLevelCounts, mapProductRow } = load(
  'server/repositories/products.ts',
)
const input = {
  bookCode: '123',
  educationLevel: 'SD',
  subject: 'Matematika',
  title: 'Contoh',
  author: '',
  description: '',
  price: 0,
  publicationYear: null,
  featured: false,
  published: false,
}
assert.equal(bookInputSchema.parse(input).highlights, undefined, 'Legacy writes omit highlights')
assert.deepEqual(bookInputSchema.parse({ ...input, highlights: [] }).highlights, [])
assert.deepEqual(
  bookInputSchema.parse({ ...input, highlights: [' Latihan bertingkat '] }).highlights,
  ['Latihan bertingkat'],
)
for (const highlights of [
  null,
  'Point',
  [''],
  ['   '],
  [null],
  ['a'.repeat(201)],
  Array(7).fill('Point'),
])
  assert.equal(bookInputSchema.safeParse({ ...input, highlights }).success, false)
assert.equal(
  bookInputSchema.safeParse({ ...input, highlights: Array(6).fill('a'.repeat(200)) }).success,
  true,
)
for (const [level, grades] of Object.entries({
  SD: [1, 6],
  SMP: [7, 9],
  SMA: [10, 12],
  SMK: [10, 12],
})) {
  for (const grade of grades)
    assert.equal(
      bookInputSchema.safeParse({ ...input, educationLevel: level, grade }).success,
      true,
    )
}
for (const grade of [0, 7, 12, 1.5, '1'])
  assert.equal(bookInputSchema.safeParse({ ...input, grade }).success, false)
assert.equal(bookInputSchema.safeParse({ ...input, grade: null }).success, true)
assert.equal(bookInputSchema.parse(input).grade, undefined, 'Older editor clients can omit grade')
for (const query of [
  { grade: 1 },
  { level: 'SD', grade: 7 },
  { page: 0 },
  { pageSize: 100 },
  { sort: 'invalid' },
  { subject: 'invalid' },
])
  assert.equal(catalogQuerySchema.safeParse(query).success, false)
assert.equal(catalogQuerySchema.parse({ level: 'SMP', grade: '8' }).grade, 8)
assert.deepEqual(
  catalogQuerySchema.parse({ subject: ['Matematika', 'Bahasa Indonesia'] }).subject,
  ['Matematika', 'Bahasa Indonesia'],
)
const base = demoProducts[0]
demoProducts.splice(
  0,
  demoProducts.length,
  ...Array.from({ length: 76 }, (_, index) => ({
    ...base,
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    slug: `book-${index}`,
    title: `Book ${String(index).padStart(3, '0')}`,
    bookCode: String(1000 + index),
    educationLevel: index < 70 ? 'SD' : 'SMP',
    grade: index < 70 ? 1 : 7,
    subject: index % 2 ? 'Matematika' : 'Bahasa Indonesia',
  })),
  { ...base, id: 'legacy', grade: null },
)
const list = (options = {}) => listProducts({}, { q: '', ...options })
let result = await list({ page: 5, pageSize: 15 })
assert.equal(result.total, 77)
assert.equal(result.products.length, 15)
assert.equal(result.products[0].bookCode, '1060')
result = await list({ level: 'SD', grade: 1, page: 1, subject: 'Matematika' })
assert.equal(result.total, 35)
assert.equal(result.subjectCounts['Bahasa Indonesia'], 35, 'Facet counts ignore selected subjects')
assert.ok(result.products.every((book) => book.grade === 1 && book.subject === 'Matematika'))
result = await list({
  subject: ['Matematika', 'Bahasa Indonesia'],
  page: 1,
  pageSize: 30,
  sort: 'title-desc',
})
assert.equal(result.products[0].bookCode, '1075')
assert.equal(result.products.length, 30)
assert.equal((await list({ page: 999 })).page, 6)
assert.equal((await list({ q: '1074', page: 1 })).total, 1)
assert.equal((await list({ q: 'missing', page: 4 })).page, 1)
assert.equal((await list({ q: 'missing', page: 4 })).total, 0)
assert.equal((await getLandingLevelCounts({})).SD, 70)
assert.equal((await list()).products.length, 77, 'Unpaged demo API remains compatible')
source = 'supabase'
const calls = []
const row = {
  id: base.id,
  slug: base.slug,
  title: base.title,
  author: base.author,
  description: base.description,
  price: base.price,
  image_path: null,
  featured: true,
  book_code: '123',
  education_level: 'SD',
  grade: 1,
  subject: 'Matematika',
  publication_year: 2026,
}
assert.deepEqual(mapProductRow({}, row).highlights, [], 'Legacy row mapping defaults empty')
assert.deepEqual(mapProductRow({}, { ...row, highlights: ['Point A', 'Point B'] }).highlights, [
  'Point A',
  'Point B',
])
client = {
  from() {
    const operations = []
    calls.push(operations)
    const query = {}
    for (const method of ['select', 'eq', 'in', 'or', 'order', 'range', 'limit'])
      query[method] = (...args) => {
        operations.push([method, ...args])
        return query
      }
    query.then = (resolve) =>
      resolve({
        data: operations[0][1] === 'subject' ? [{ subject: 'Matematika' }] : [row],
        count: 70,
        error: null,
      })
    return query
  },
}
result = await list({ level: 'SD', grade: 1, page: 5, subject: ['Matematika'], sort: 'title-asc' })
assert.equal(result.total, 70)
assert.equal(result.products[0].grade, 1)
assert.ok(
  calls.every((operations) =>
    operations.some((op) => op[0] === 'eq' && op[1] === 'published' && op[2] === true),
  ),
)
assert.ok(
  calls.every((operations) =>
    operations.some((op) => op[0] === 'eq' && op[1] === 'grade' && op[2] === 1),
  ),
)
assert.ok(calls[0].some((op) => op[0] === 'range' && op[1] === 60 && op[2] === 74))
assert.ok(calls[0].some((op) => op[0] === 'order' && op[1] === 'title' && op[2].ascending))
client.from = () => {
  throw new Error('database unavailable')
}
await assert.rejects(list(), /database unavailable/, 'Database failure must not fall back to demo')
const { saveEditorBook } = load('server/repositories/editor-books.ts')
let editorRow = {
  ...row,
  highlights: ['Existing point'],
  published: true,
  flyer_path: null,
  dummy_book_path: null,
  product_knowledge_path: null,
  updated_at: '2026-10-10T00:00:00Z',
}
const writes = []
client = {
  from() {
    let duplicate = false
    const query = {}
    for (const method of ['select', 'eq', 'in', 'neq', 'limit']) query[method] = () => query
    query.ilike = () => {
      duplicate = true
      return query
    }
    for (const method of ['insert', 'update'])
      query[method] = (value) => {
        writes.push(value)
        editorRow = { ...editorRow, ...value }
        return query
      }
    query.maybeSingle = async () => ({ data: duplicate ? null : editorRow, error: null })
    return query
  },
}
const account = { role: 'editor', isSuper: true, educationLevels: ['SD'] }
assert.deepEqual(
  (await saveEditorBook({}, account, bookInputSchema.parse(input), row.id)).highlights,
  ['Existing point'],
)
assert.equal(
  Object.hasOwn(writes.at(-1), 'highlights'),
  false,
  'Legacy update must not overwrite highlights',
)
assert.deepEqual(
  (
    await saveEditorBook(
      {},
      account,
      bookInputSchema.parse({ ...input, highlights: [' Point A ', 'Point B'] }),
      row.id,
    )
  ).highlights,
  ['Point A', 'Point B'],
)
assert.deepEqual(
  (await saveEditorBook({}, account, bookInputSchema.parse({ ...input, highlights: [] }), row.id))
    .highlights,
  [],
)
assert.deepEqual(
  (
    await saveEditorBook(
      {},
      account,
      bookInputSchema.parse({ ...input, highlights: ['New book point'] }),
    )
  ).highlights,
  ['New book point'],
)
console.log(
  'PASS: highlights validation, public mapping, create/update roundtrip, empty-list clearing, and legacy-write preservation (repository stub).',
)
console.log(
  'PASS: grade validation, legacy input, pagination beyond 60, sorting, multi-subject filters, facets, empty results, school counts, published-only query constraints, and database failure propagation.',
)
console.log(
  'Database behavior uses a query stub; this does not verify live PostgreSQL constraints or RLS.',
)
