import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import ts from 'typescript'
import { createApp, eventHandler, toNodeListener, readBody, createError } from 'h3'

const require = createRequire(import.meta.url)
const cache = new Map()
const id = '11111111-1111-4111-8111-111111111111'
const account = { role: 'editor', isSuper: false, educationLevels: ['SD'] }
let authenticated = true
let level = 'SD'
let stored
let infoSize
let infoType
let pointer = 'previous.ppt'
let requestedKind = 'product-knowledge'
let signed = 0
const bucket = {
  createSignedUploadUrl: async (objectPath) => {
    signed += 1
    return { data: { token: 'test-token', path: objectPath }, error: null }
  },
  info: async () => ({ data: { size: infoSize, contentType: infoType }, error: null }),
  download: async () => ({ data: new Blob([stored]), error: null }),
}
function load(relative) {
  const filename = path.resolve(relative)
  if (cache.has(filename)) return cache.get(filename).exports
  const module = { exports: {} }
  cache.set(filename, module)
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const resolve = (name) => {
    if (name === '#supabase/server')
      return { serverSupabaseClient: async () => ({ storage: { from: () => bucket } }) }
    if (name.endsWith('/require-account'))
      return {
        requireAccount: async () => {
          if (!authenticated) throw createError({ statusCode: 401 })
          return account
        },
      }
    if (name.endsWith('/editor-books'))
      return {
        getEditorBook: async (_, editor) => {
          load('server/utils/require-editor.ts').assertBookScope(editor, level)
          return { bookCode: '123', educationLevel: level }
        },
        setEditorBookMaterial: async (_, editor, bookId, kind, objectPath) => {
          load('server/utils/require-editor.ts').assertBookScope(editor, level)
          pointer = objectPath
          return {
            id: bookId,
            kind,
          }
        },
      }
    if (name.startsWith('#shared/')) return load(`shared/${name.slice(8)}.ts`)
    if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), `${name}.ts`))
    return require(name)
  }
  new Function(
    'require',
    'module',
    'exports',
    'defineEventHandler',
    'readBody',
    'createError',
    'useRuntimeConfig',
    output,
  )(
    resolve,
    module,
    module.exports,
    (handler) => handler,
    readBody,
    createError,
    () => ({ catalogSource: 'supabase' }),
  )
  return module.exports
}
const prepare = load('server/api/admin/books/[id]/materials/[kind]/upload-url.post.ts').default
const complete = load('server/api/admin/books/[id]/materials/[kind]/complete.post.ts').default
const app = createApp()
app.use(
  eventHandler(async (event) => {
    event.context.params = { id, kind: requestedKind }
    return event.path === '/prepare' ? prepare(event) : complete(event)
  }),
)
const server = createServer(toNodeListener(app))
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`
const type = 'application/vnd.ms-powerpoint'
const size = 10 * 1024 * 1024
async function post(route, body, status) {
  const response = await fetch(`${base}/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  assert.equal(response.status, status)
  return response.json()
}
try {
  authenticated = false
  await post('prepare', { type, size }, 401)
  authenticated = true
  account.role = 'sales'
  await post('prepare', { type, size }, 403)
  account.role = 'editor'
  level = 'SMP'
  await post('prepare', { type, size }, 403)
  level = 'SD'
  await post('prepare', { type, size: 10 * 1024 * 1024 + 1 }, 413)
  await post('prepare', { type: 'application/zip', size }, 400)
  assert.equal(signed, 0)
  const upload = await post('prepare', { type, size }, 200)
  const body = { path: upload.path, type, size }
  stored = Buffer.alloc(size)
  Buffer.from([208, 207, 17, 224, 161, 177, 26, 225]).copy(stored)
  Buffer.from('PowerPoint Document', 'utf16le').copy(stored, 8)
  infoSize = size
  infoType = type
  await post(
    'complete',
    { ...body, path: upload.path.replace(id, '22222222-2222-4222-8222-222222222222') },
    400,
  )
  await post(
    'complete',
    { ...body, path: upload.path.replace('/product-knowledge/', '/dummy/') },
    400,
  )
  infoSize = 10 * 1024 * 1024 + 1
  await post('complete', body, 413)
  infoSize = size - 1
  await post('complete', body, 400)
  infoSize = size
  infoType = 'application/pdf'
  await post('complete', body, 400)
  infoType = type
  stored.fill(0)
  await post('complete', body, 400)
  assert.equal(pointer, 'previous.ppt')
  Buffer.from([208, 207, 17, 224, 161, 177, 26, 225]).copy(stored)
  Buffer.from('PowerPoint Document', 'utf16le').copy(stored, 8)
  authenticated = false
  await post('complete', body, 401)
  authenticated = true
  level = 'SMP'
  await post('complete', body, 403)
  level = 'SD'
  assert.equal(pointer, 'previous.ppt')
  await post('complete', body, 200)
  assert.equal(pointer, upload.path)
  assert.ok(Buffer.byteLength(JSON.stringify(body)) < 500)
  requestedKind = 'product-knowledge-preview'
  const previewType = 'application/pdf'
  const previewBytes = Buffer.from('%PDF-1.7\nmanual preview')
  const previewUpload = await post('prepare', { type: previewType, size: previewBytes.length }, 200)
  stored = previewBytes
  infoSize = previewBytes.length
  infoType = previewType
  await post(
    'complete',
    {
      path: previewUpload.path,
      type: previewType,
      size: previewBytes.length,
    },
    200,
  )
  assert.match(pointer, new RegExp(`^books/${id}/product-knowledge-preview/.+\\.pdf$`))
  for (const kind of ['dummy', 'flyer', 'product-knowledge', 'product-knowledge-preview']) {
    requestedKind = kind
    const maxSize = (kind === 'dummy' ? 15 : 10) * 1024 * 1024
    const mime = kind === 'product-knowledge' ? type : 'application/pdf'
    await post('prepare', { type: mime, size: maxSize + 1 }, 413)
    const boundary = await post('prepare', { type: mime, size: maxSize }, 200)
    infoType = mime
    infoSize = maxSize + 1
    await post('complete', { path: boundary.path, type: mime, size: maxSize }, 413)
    stored = Buffer.alloc(maxSize)
    if (kind === 'product-knowledge') {
      Buffer.from([208, 207, 17, 224, 161, 177, 26, 225]).copy(stored)
      Buffer.from('PowerPoint Document', 'utf16le').copy(stored, 8)
    } else Buffer.from('%PDF-1.7').copy(stored)
    infoSize = maxSize
    await post('complete', { path: boundary.path, type: mime, size: maxSize }, 200)
  }
  console.log(
    'PASS: Dummy 15 MB; all other materials 10 MB; exact limits accepted; one byte over rejected at prepare and completion.',
  )
  console.log(
    'PASS: 10 MiB PPT and PDF preview validation; small JSON API bodies; auth/scope recheck; path/type/size/signature rejection; previous material retained on failure.',
  )
} finally {
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
}
