import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { z } from 'zod'

const createError = (options) => Object.assign(new Error(options.statusMessage), options)
async function moduleAt(path, dependencies, globals = {}) {
  const output = ts.transpileModule(await readFile(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  const scope = { createError, ...globals }
  new Function('require', 'exports', ...Object.keys(scope), output)(
    (name) => {
      assert(name in dependencies, name)
      return dependencies[name]
    },
    exports,
    ...Object.values(scope),
  )
  return exports
}
const resourceTypes = await moduleAt('server/utils/book-resource.ts', { zod: { z } })
let loggedIn = false
let expired = false
let productReads = 0
let draft = false
const signedCalls = []
const client = {
  auth: {
    getUser: async () => ({
      data: { user: loggedIn ? { id: 'fixture' } : null },
      error: expired ? {} : null,
    }),
  },
  from: () => ({
    select: () => ({
      eq: () => ({
        eq: (key, value) => {
          assert.equal(key, 'published')
          assert.equal(value, true)
          return {
            maybeSingle: async () => ({
              error: null,
              data: draft
                ? null
                : {
                    flyer_path: 'flyer.pdf',
                    dummy_book_path: 'dummy.pdf',
                    product_knowledge_path: 'slides.pptx',
                    product_knowledge_preview_path: 'slides.pdf',
                  },
            }),
          }
        },
      }),
    }),
  }),
  storage: {
    from: (bucket) => {
      assert.equal(bucket, 'book-materials')
      return {
        createSignedUrl: async (path, ttl, options) => {
          signedCalls.push({ path, ttl, options })
          return { data: { signedUrl: 'https://fixture.invalid/signed' }, error: null }
        },
      }
    },
  },
}
const repo = await moduleAt(
  'server/repositories/book-resources.ts',
  {
    '#supabase/server': { serverSupabaseClient: async () => client },
    '../utils/book-resource': resourceTypes,
    './products': {
      getProduct: async () => {
        productReads++
        return { id: 'book' }
      },
    },
  },
  { useRuntimeConfig: () => ({ catalogSource: 'supabase' }) },
)
const endpoint = (
  await moduleAt(
    'server/api/products/[slug]/resources/[kind].get.ts',
    {
      '#shared/schemas/catalog': { productIdentifierSchema: z.string().min(1) },
      '../../../../utils/book-resource': resourceTypes,
      '../../../../repositories/book-resources': repo,
    },
    {
      defineEventHandler: (handler) => handler,
      getRouterParam: (event, key) => event[key],
      getQuery: (event) => event.query,
      setHeader: (event, key, value) => ((event.headers ??= {})[key] = value),
      sendRedirect: (_event, url, status) => ({ url, status }),
    },
  )
).default
for (const kind of ['dummy', 'flyer', 'product-knowledge']) {
  for (const query of [{}, { preview: '1' }, { download: '1' }]) {
    await assert.rejects(
      endpoint({ slug: '123', kind, query }),
      (error) => error.statusCode === 401,
    )
  }
}
assert.equal(productReads, 0, 'Authentication precedes product/material lookup')
assert.equal(signedCalls.length, 0, 'Anonymous receives no signed file URL')
loggedIn = true
expired = true
await assert.rejects(
  endpoint({ slug: '123', kind: 'flyer', query: { preview: '1' } }),
  (error) => error.statusCode === 401,
)
expired = false
for (const kind of ['dummy', 'flyer', 'product-knowledge']) {
  const event = { slug: '123', kind, query: { preview: '1' } }
  assert.deepEqual(await endpoint(event), { url: 'https://fixture.invalid/signed', format: 'pdf' })
  assert.equal(event.headers['Cache-Control'], 'private, no-store')
  assert.deepEqual(await endpoint({ slug: '123', kind, query: { download: '1' } }), {
    url: 'https://fixture.invalid/signed',
    status: 302,
  })
}
assert.equal(signedCalls.length, 6)
assert(signedCalls.every((call) => call.ttl === 60))
assert.equal(
  signedCalls.find((call) => call.path === 'slides.pptx').options.download,
  '123-product-knowledge.pptx',
)
draft = true
await assert.rejects(
  endpoint({ slug: '123', kind: 'flyer', query: {} }),
  (error) => error.statusCode === 404,
)
assert.equal(signedCalls.length, 6, 'No URL issued for unpublished/missing material')
console.log(
  'PASS: real repository/endpoint authentication for every material, preview and download; expired session denial; private no-store, signed URL TTL, PPT/PDF selection and published-only checks. Fixtures only.',
)
