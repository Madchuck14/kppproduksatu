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
const { productIdentifierSchema } = load('shared/schemas/catalog.ts')
const { bookInputSchema } = load('shared/schemas/editor.ts')
const { getProductPath } = load('shared/utils/product-path.ts')
const { demoProducts } = load('server/data/products.ts')
const { listProducts, getLandingLevelCounts, mapProductRow, getProduct } = load(
  'server/repositories/products.ts',
)
const input = {
  bookCode: '123',
  educationLevel: 'SD',
  subject: 'Matematika',
  title: 'Contoh',
  author: '',
  synopsis: null,
  targetMarket: [],
  divisionCode: null,
  price: 0,
  publicationYear: null,
  published: false,
}
assert.equal(bookInputSchema.parse(input).highlights, undefined, 'Legacy writes omit highlights')
assert.equal(bookInputSchema.parse(input).curriculum, undefined)
assert.equal(bookInputSchema.parse(input).isbn, undefined)
assert.equal(
  bookInputSchema.safeParse({ ...input, featured: true }).success,
  false,
  'Book editor input cannot change featured status',
)
assert.equal(productIdentifierSchema.safeParse('1001').success, true)
assert.equal(productIdentifierSchema.safeParse('ruang-untuk-bertumbuh').success, true)
assert.equal(productIdentifierSchema.safeParse('../products').success, false)
assert.equal(getProductPath(demoProducts[0]), '/products/1001')
assert.equal(
  getProductPath({ ...demoProducts[0], bookCode: null }),
  '/products/ruang-untuk-bertumbuh',
)
assert.equal((await getProduct({}, '1001')).id, demoProducts[0].id)
assert.equal((await getProduct({}, 'ruang-untuk-bertumbuh')).id, demoProducts[0].id)
assert.equal(
  bookInputSchema.parse({ ...input, title: 'Judul Sama' }).title,
  bookInputSchema.parse({ ...input, bookCode: '456', title: 'Judul Sama' }).title,
  'Different book codes may use the same title',
)
assert.equal(
  bookInputSchema.parse({ ...input, curriculum: '  Kurikulum Merdeka  ' }).curriculum,
  'Kurikulum Merdeka',
)
assert.equal(bookInputSchema.parse({ ...input, isbn: '978-0-306-40615-7' }).isbn, '9780306406157')
assert.equal(bookInputSchema.parse({ ...input, isbn: '0-306-40615-2' }).isbn, '0306406152')
assert.equal(bookInputSchema.parse({ ...input, isbn: '123456789x' }).isbn, '123456789X')
for (const isbn of ['', '123', '97803064061570', '12345678XX', 'ISBN 9780306406157', 9780306406157])
  assert.equal(bookInputSchema.safeParse({ ...input, isbn }).success, false)
for (const curriculum of ['', '   ', 'a'.repeat(201)])
  assert.equal(bookInputSchema.safeParse({ ...input, curriculum }).success, false)
assert.equal(
  bookInputSchema.safeParse({ ...input, curriculum: 'a'.repeat(200), isbn: null }).success,
  true,
)
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
  division_code: null,
  synopsis: null,
  target_market: [],
  slug: base.slug,
  title: base.title,
  author: base.author,
  curriculum: 'Kurikulum Merdeka',
  isbn: '0306406152',
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
assert.equal(mapProductRow({}, row).curriculum, 'Kurikulum Merdeka')
assert.equal(mapProductRow({}, row).isbn, '0306406152')
assert.equal(mapProductRow({}, row).description, '')
assert.equal(
  mapProductRow({}, { ...row, synopsis: 'Sinopsis buku' }).description,
  'Sinopsis buku',
  'Compatibility description derives from synopsis without the removed column',
)
assert.deepEqual(mapProductRow({}, { ...row, highlights: ['Point A', 'Point B'] }).highlights, [
  'Point A',
  'Point B',
])
client = {
  rpc: async () => ({ data: null, error: { code: 'PGRST202' } }),
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
let lookupIdentifier = '123'
const lookupCalls = []
client = {
  from() {
    const operations = []
    const query = {}
    query.select = (...args) => {
      operations.push(['select', ...args])
      return query
    }
    query.eq = (...args) => {
      operations.push(['eq', ...args])
      return query
    }
    query.maybeSingle = async () => {
      lookupCalls.push(operations)
      const match = operations.find(
        ([method, field, value]) =>
          method === 'eq' &&
          (field === 'book_code' || field === 'slug') &&
          value === lookupIdentifier,
      )
      return { data: match ? row : null, error: null }
    }
    return query
  },
}
assert.equal((await getProduct({}, '123')).bookCode, '123')
assert.equal(lookupCalls.length, 1, 'Book code resolves before any legacy slug lookup')
lookupIdentifier = 'ruang-untuk-bertumbuh'
assert.equal((await getProduct({}, lookupIdentifier)).slug, 'ruang-untuk-bertumbuh')
assert.equal(lookupCalls.length, 2, 'Legacy slug resolves after a code lookup misses')
assert.ok(
  lookupCalls.every((operations) =>
    operations.some((operation) => operation[0] === 'eq' && operation[1] === 'published'),
  ),
)
client = {
  rpc: async () => ({ data: null, error: { code: 'PGRST202' } }),
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
const rpcCalls = []
client.rpc = async (name, args) => {
  rpcCalls.push([name, args])
  return {
    data:
      name === 'catalog_level_counts'
        ? [{ education_level: 'SD', book_count: 1070 }]
        : [
            { subject: 'Matematika', book_count: 700 },
            { subject: 'Bahasa Indonesia', book_count: 370 },
          ],
    error: null,
  }
}
calls.length = 0
result = await list({
  q: 'Book,(123)',
  level: 'SD',
  grade: 1,
  featured: 'false',
  page: 1,
  subject: 'Matematika',
})
assert.equal(calls.length, 1, 'Aggregated facets avoid subject-row downloads')
assert.deepEqual(result.subjectCounts, { Matematika: 700, 'Bahasa Indonesia': 370 })
assert.deepEqual(rpcCalls[0], [
  'catalog_subject_counts',
  {
    search_text: 'Book123',
    filter_level: 'SD',
    filter_grade: 1,
    filter_featured: false,
  },
])
assert.deepEqual(await getLandingLevelCounts({}), { SD: 1070, SMP: 0, SMA: 0, SMK: 0 })
assert.equal(calls.length, 1, 'Level counts use one RPC without individual count queries')
client.rpc = async () => ({ data: null, error: { code: '42501' } })
await assert.rejects(getLandingLevelCounts({}), /Jumlah buku belum tersedia/)
await assert.rejects(list({ page: 1 }), /Jumlah buku belum tersedia/)
client.rpc = async () => ({ data: null, error: { code: 'PGRST202' } })
calls.length = 0
assert.equal((await getLandingLevelCounts({})).SD, 70)
assert.equal(calls.length, 4, 'Missing migration preserves the previous count path')
console.log(
  'PASS: grouped count RPCs, sanitized facet filters, zero counts, rollout compatibility, and RPC failure propagation.',
)
client.from = () => {
  throw new Error('database unavailable')
}
await assert.rejects(list(), /database unavailable/, 'Database failure must not fall back to demo')
const { saveEditorBook, setEditorBookMaterial } = load('server/repositories/editor-books.ts')
let editorRow = {
  ...row,
  division_code: null,
  synopsis: null,
  target_market: [],
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
assert.equal(editorRow.featured, true, 'Editing a book preserves its featured status')
assert.equal(
  Object.hasOwn(writes.at(-1), 'highlights'),
  false,
  'Legacy update must not overwrite highlights',
)
assert.equal(
  Object.hasOwn(writes.at(-1), 'featured'),
  false,
  'Book editor updates cannot change featured status',
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
await saveEditorBook(
  {},
  account,
  bookInputSchema.parse({ ...input, title: 'Judul Diperbarui' }),
  row.id,
)
assert.equal(writes.at(-1).slug, row.slug, 'Editing retains the existing legacy slug')
assert.deepEqual(
  (
    await saveEditorBook(
      {},
      account,
      bookInputSchema.parse({
        ...input,
        bookCode: '456',
        highlights: ['New book point'],
      }),
    )
  ).highlights,
  ['New book point'],
)
assert.equal(
  Object.hasOwn(writes.at(-1), 'featured'),
  false,
  'New books use the database default and are not implicitly featured',
)
assert.equal(writes.at(-1).slug, 'contoh-456', 'New slugs include the unique book code')
const sameTitleNewEdition = await saveEditorBook(
  {},
  account,
  bookInputSchema.parse({ ...input, bookCode: '789', title: 'Judul Sama' }),
)
assert.equal(sameTitleNewEdition.title, 'Judul Sama')
assert.equal(writes.at(-1).slug, 'judul-sama-789')
assert.equal(editorRow.slug, 'judul-sama-789')
console.log(
  'PASS: highlights, duplicate titles with unique book codes, code-based slugs, legacy slug preservation, and editor roundtrip (repository stub).',
)
assert.equal(
  editorRow.curriculum,
  'Kurikulum Merdeka',
  'Omitted metadata preserves saved curriculum',
)
assert.equal(editorRow.isbn, '0306406152', 'Omitted metadata preserves saved ISBN')
assert.equal(Object.hasOwn(writes.at(-1), 'curriculum'), false)
assert.equal(Object.hasOwn(writes.at(-1), 'isbn'), false)
const metadata = await saveEditorBook(
  {},
  account,
  bookInputSchema.parse({
    ...input,
    curriculum: ' Kurikulum sekolah khusus ',
    isbn: '978-0-306-40615-7',
  }),
  row.id,
)
assert.equal(metadata.curriculum, 'Kurikulum sekolah khusus')
assert.equal(metadata.isbn, '9780306406157')
const clearedMetadata = await saveEditorBook(
  {},
  account,
  bookInputSchema.parse({
    ...input,
    curriculum: null,
    isbn: null,
  }),
  row.id,
)
assert.equal(clearedMetadata.curriculum, null)
assert.equal(clearedMetadata.isbn, null)
console.log(
  'PASS: curriculum/ISBN normalization, bounds, leading zeros, optional legacy writes, metadata roundtrip, public mapping, and explicit clearing.',
)
editorRow = {
  ...editorRow,
  flyer_path: 'books/id/flyer/original.pdf',
  product_knowledge_path: 'books/id/product-knowledge/original.pptx',
  product_knowledge_preview_path: 'books/id/product-knowledge-preview/original.pdf',
}
await setEditorBookMaterial(
  {},
  account,
  row.id,
  'product-knowledge',
  'books/id/product-knowledge/new.pptx',
)
assert.deepEqual(writes.at(-1), {
  product_knowledge_path: 'books/id/product-knowledge/new.pptx',
})
assert.equal(editorRow.flyer_path, 'books/id/flyer/original.pdf')
assert.equal(
  editorRow.product_knowledge_preview_path,
  'books/id/product-knowledge-preview/original.pdf',
)
await setEditorBookMaterial(
  {},
  account,
  row.id,
  'product-knowledge-preview',
  'books/id/product-knowledge-preview/new.pdf',
)
assert.deepEqual(writes.at(-1), {
  product_knowledge_preview_path: 'books/id/product-knowledge-preview/new.pdf',
})
await setEditorBookMaterial({}, account, row.id, 'flyer', 'books/id/flyer/replacement.pdf')
assert.deepEqual(writes.at(-1), {
  flyer_path: 'books/id/flyer/replacement.pdf',
})
assert.equal(editorRow.product_knowledge_path, 'books/id/product-knowledge/new.pptx')
assert.equal(editorRow.product_knowledge_preview_path, 'books/id/product-knowledge-preview/new.pdf')
console.log(
  'PASS: PPT download and PDF preview update independently; replacing Flyer preserves both product files (repository stub).',
)
console.log(
  'PASS: grade validation, legacy input, pagination beyond 60, sorting, multi-subject filters, facets, empty results, school counts, published-only query constraints, and database failure propagation.',
)
const { getCatalogBrowse } = load('server/repositories/catalog-browse.ts')
const first = {
  ...row,
  division_code: 'sd-1-mipa',
  synopsis: 'Sinopsis tersimpan',
  target_market: ['Guru SD'],
}
const second = { ...first, id: '11111111-1111-4111-8111-111111111111', slug: 'ranked-second' }
function legacy(book) {
  const result = { ...book }
  for (const key of ['division_code', 'synopsis', 'target_market']) delete result[key]
  return result
}
let rpcBooks = [legacy(second), legacy(first)]
let detailRows = [first, second]
let detailError = null
let rpcError = null
const detailCalls = []
client = {
  rpc: async () => ({
    data: [{ group_code: 'SD', book_count: 2, books: rpcBooks }],
    error: rpcError,
  }),
  from() {
    const query = {}
    for (const method of ['select', 'in', 'eq'])
      query[method] = (...args) => {
        detailCalls.push([method, ...args])
        return query
      }
    query.then = (resolve) => resolve({ data: detailRows, error: detailError })
    return query
  },
}
const browse = await getCatalogBrowse({}, 'level')
assert.deepEqual(
  browse.groups[0].products.map((book) => book.id),
  [second.id, first.id],
  'Metadata read preserves RPC rank',
)
assert.equal(browse.groups[0].products[0].synopsis, 'Sinopsis tersimpan')
assert.deepEqual(browse.groups[0].products[0].targetMarket, ['Guru SD'])
assert.equal(browse.groups[0].products[0].divisionCode, 'sd-1-mipa')
assert.equal(detailCalls.filter((call) => call[0] === 'select').length, 1)
assert.ok(
  detailCalls.some((call) => call[0] === 'eq' && call[1] === 'published' && call[2] === true),
)
assert.equal(
  detailCalls[0][1].includes('flyer_path'),
  false,
  'Metadata query excludes private materials',
)
rpcBooks = [legacy(first), legacy(first)]
detailCalls.length = 0
await getCatalogBrowse({}, 'level')
assert.deepEqual(
  detailCalls.find((call) => call[0] === 'in')[2],
  [first.id],
  'Repeated ranked IDs use one metadata lookup',
)
detailRows = []
assert.deepEqual(
  (await getCatalogBrowse({}, 'level')).groups[0].products,
  [],
  'Unpublished/missing metadata is not exposed',
)
detailError = { code: '42501' }
await assert.rejects(getCatalogBrowse({}, 'level'), (error) => error.statusCode === 503)
detailError = null
rpcBooks = [second, first]
detailCalls.length = 0
assert.equal((await getCatalogBrowse({}, 'level')).groups[0].products.length, 2)
assert.equal(detailCalls.length, 0, 'Current RPC avoids extra queries')
rpcBooks = [{ ...second }]
delete rpcBooks[0].curriculum
delete rpcBooks[0].isbn
detailRows = [second]
detailCalls.length = 0
const metadataBrowse = await getCatalogBrowse({}, 'level')
assert.equal(metadataBrowse.groups[0].products[0].curriculum, 'Kurikulum Merdeka')
assert.equal(metadataBrowse.groups[0].products[0].isbn, '0306406152')
assert.equal(
  detailCalls.filter((call) => call[0] === 'select').length,
  1,
  'Previous RPC loads real curriculum/ISBN',
)
rpcError = { code: 'PGRST202' }
await assert.rejects(getCatalogBrowse({}, 'level'), (error) => error.statusCode === 503)
source = 'demo'
assert.ok((await getCatalogBrowse({}, 'level')).groups.every((group) => !group.products.length))
console.log(
  'PASS: legacy ranking RPC loads real public metadata once, retains order, deduplicates IDs, excludes unpublished/private data, propagates failures, and preserves current RPC/demo paths.',
)
console.log(
  'Database behavior uses a query stub; this does not verify live PostgreSQL constraints or RLS.',
)
