import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { createApp, eventHandler, toNodeListener } from 'h3'
import { createServer } from 'node:http'

const require = createRequire(import.meta.url)
const cache = new Map()
let client
const request = { params: { slug: 'buku-uji', kind: 'product-knowledge' }, query: { preview: '1' } }
function load(relative) {
  const filename = path.resolve(relative)
  if (cache.has(filename)) return cache.get(filename).exports
  const module = { exports: {} }
  cache.set(filename, module)
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const resolve = (id) => {
    if (id === '#supabase/server') return { serverSupabaseClient: async () => client }
    if (id.startsWith('#shared/')) return load(`shared/${id.slice(8)}.ts`)
    if (id.startsWith('.')) return load(path.resolve(path.dirname(filename), `${id}.ts`))
    return require(id)
  }
  new Function(
    'require',
    'module',
    'exports',
    'createError',
    'defineEventHandler',
    'getRouterParam',
    'getQuery',
    'sendRedirect',
    code,
  )(
    resolve,
    module,
    module.exports,
    (error) => Object.assign(new Error(error.statusMessage), error),
    (handler) => handler,
    (_, key) => request.params[key],
    () => request.query,
    (_, url, status) => ({ url, status }),
  )
  return module.exports
}

const { validateMaterialBytes } = load('server/utils/book-material.ts')
const { readBookMaterial } = load('server/utils/book-material.ts')
const { validatePresentationSlide } = load('server/utils/presentation-slide.ts')
const pdf = new TextEncoder().encode('%PDF-1.7\n')
validateMaterialBytes(pdf, 'pdf')
for (const extension of ['ppt', 'pptx']) assert.throws(() => validateMaterialBytes(pdf, extension))
assert.throws(() => validateMaterialBytes(new Uint8Array([80, 75, 3, 4]), 'pptx'))
// Minimal ZIP directory fixture: format validation only, not an Office rendering test.
function zip(names) {
  const local = Buffer.from([80, 75, 3, 4])
  const entries = names.map((name) => {
    const filename = Buffer.from(name)
    const header = Buffer.alloc(46)
    header.writeUInt32LE(0x02014b50)
    header.writeUInt16LE(filename.length, 28)
    return Buffer.concat([header, filename])
  })
  const directory = Buffer.concat(entries)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50)
  end.writeUInt16LE(names.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(local.length, 16)
  return Buffer.concat([local, directory, end])
}
validateMaterialBytes(zip(['[Content_Types].xml', 'ppt/presentation.xml']), 'pptx')
assert.throws(() =>
  validateMaterialBytes(zip(['[Content_Types].xml', 'word/document.xml']), 'pptx'),
)
assert.throws(() =>
  validateMaterialBytes(
    zip(['[Content_Types].xml', 'ppt/presentation.xml', 'ppt/vbaProject.bin']),
    'pptx',
  ),
)
const ppt = Buffer.concat([
  Buffer.from([208, 207, 17, 224, 161, 177, 26, 225]),
  Buffer.from('PowerPoint Document', 'utf16le'),
])
validateMaterialBytes(ppt, 'ppt')
assert.throws(() => validateMaterialBytes(ppt.subarray(0, 8), 'ppt'))

// Exercise the real streaming upload reader and MIME routing through HTTP.
const app = createApp()
app.use(
  eventHandler(async (event) => {
    const kind = event.node.req.url.slice(1)
    const result = await readBookMaterial(event, kind)
    return { extension: result.extension, size: result.bytes.length }
  }),
)
const server = createServer(toNodeListener(app))
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
try {
  const base = `http://127.0.0.1:${server.address().port}`
  async function upload(kind, type, body, status) {
    const response = await fetch(`${base}/${kind}`, {
      method: 'POST',
      body,
      headers: { 'Content-Type': type },
    })
    assert.equal(response.status, status, `${kind}: ${type}`)
    return response.json()
  }
  assert.equal((await upload('flyer', 'application/pdf', pdf, 200)).extension, 'pdf')
  await upload('flyer', 'application/vnd.ms-powerpoint', ppt, 400)
  await upload(
    'flyer',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    zip(['[Content_Types].xml', 'ppt/presentation.xml']),
    400,
  )
  assert.equal(
    (await upload('product-knowledge', 'application/vnd.ms-powerpoint', ppt, 200)).extension,
    'ppt',
  )
  assert.equal(
    (
      await upload(
        'product-knowledge',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        zip(['[Content_Types].xml', 'ppt/presentation.xml']),
        200,
      )
    ).extension,
    'pptx',
  )
  await upload('product-knowledge', 'application/pdf', pdf, 400)
  await upload('product-knowledge', 'application/vnd.ms-powerpoint', pdf, 400)
  assert.equal((await upload('dummy', 'application/pdf', pdf, 200)).extension, 'pdf')
} finally {
  await new Promise((resolve) => server.close(resolve))
}
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(8)])
assert.equal(validatePresentationSlide(png, 'image/png'), 'png')
assert.equal(
  validatePresentationSlide(
    Buffer.concat([Buffer.from([255, 216, 255]), Buffer.alloc(13)]),
    'image/jpeg',
  ),
  'jpg',
)
assert.throws(() => validatePresentationSlide(pdf, 'image/png'))
assert.throws(() => validatePresentationSlide(png, 'image/svg+xml'))
assert.throws(() => validatePresentationSlide(Buffer.alloc(2 * 1024 * 1024 + 1), 'image/png'))

const handler = load('server/api/products/[slug]/resources/[kind].get.ts').default
let user = null
let row = {
  product_knowledge_path: 'books/id/product-knowledge/original.pptx',
  product_knowledge_slide_paths: ['slide-2.png', 'slide-1.png'],
}
let databaseError = null
const operations = []
const signedCalls = []
let slideError = false
client = {
  auth: { getUser: async () => ({ data: { user }, error: null }) },
  from() {
    const query = {}
    for (const method of ['select', 'eq'])
      query[method] = (...args) => {
        operations.push([method, ...args])
        return query
      }
    query.maybeSingle = async () => ({ data: row, error: databaseError })
    return query
  },
  storage: {
    from: () => ({
      createSignedUrl: async (objectPath, expiry, options) => {
        signedCalls.push({ objectPath, expiry, options })
        return { data: { signedUrl: 'https://example.test/original' }, error: null }
      },
      createSignedUrls: async (paths, expiry) => {
        assert.equal(expiry, 60)
        return {
          data: paths.map((objectPath) => ({
            signedUrl: `https://example.test/${objectPath}`,
            error: slideError ? 'denied' : null,
          })),
          error: null,
        }
      },
    }),
  },
}
await assert.rejects(handler({}), (error) => error.statusCode === 401)
assert.equal(signedCalls.length, 0, 'Anonymous never receives signed URLs')
assert.equal(operations.length, 0, 'Auth precedes material query')
user = { id: 'sales-user' }
const result = await handler({})
assert.equal(result.format, 'pptx')
assert.deepEqual(result.slides, [
  'https://example.test/slide-2.png',
  'https://example.test/slide-1.png',
])
assert.ok(
  operations.some(
    (operation) => operation[0] === 'eq' && operation[1] === 'published' && operation[2] === true,
  ),
)
request.query = { download: '1' }
assert.equal((await handler({})).status, 302)
assert.deepEqual(signedCalls.at(-1).options, { download: 'buku-uji-product-knowledge.pptx' })
row.product_knowledge_path = 'books/id/product-knowledge/original.ppt'
await handler({})
assert.equal(signedCalls.at(-1).options.download, 'buku-uji-product-knowledge.ppt')
row.product_knowledge_path = 'books/id/product-knowledge/legacy.pdf'
request.query = { preview: '1' }
assert.equal((await handler({})).format, 'pdf', 'Legacy PDFs keep their actual format')
row.product_knowledge_path = 'books/id/product-knowledge/original.pptx'
row.product_knowledge_slide_paths = []
assert.deepEqual((await handler({})).slides, [], 'Original remains downloadable without preview')
row.product_knowledge_slide_paths = ['slide.png']
slideError = true
await assert.rejects(handler({}), (error) => error.statusCode === 503)
slideError = false
row.flyer_path = 'books/id/flyer/original.pdf'
request.params.kind = 'flyer'
const flyer = await handler({})
assert.equal(flyer.format, 'pdf')
assert.equal(flyer.slides, undefined, 'Flyer never receives PPT Produk slides')
request.query = { download: '1' }
await handler({})
assert.equal(signedCalls.at(-1).options.download, 'buku-uji-flyer.pdf')
request.params.kind = 'product-knowledge'
request.query = { preview: '1' }
row = null
await assert.rejects(handler({}), (error) => error.statusCode === 404)
databaseError = { code: '42501' }
await assert.rejects(handler({}), (error) => error.statusCode === 503)
console.log(
  'PASS: real upload MIME routing (Flyer/Dummy PDF, PPT Produk PPT/PPTX), signatures, ZIP type and macro rejection, image limits, anonymous denial, published-only query, ordered PPT Produk slides, isolated Flyer PDF, download extensions, legacy PDF, and error propagation.',
)
console.log(
  'Repository/Storage use stubs. Live Auth, Storage, RLS, and Office rendering are not verified.',
)
