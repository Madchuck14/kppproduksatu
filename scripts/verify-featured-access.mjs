import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { createError } from 'h3'

const require = createRequire(import.meta.url)
const cache = new Map()
let account = null
let reads = 0
let writes = 0
let bodies = 0
const hero = { heading: 'Judul', body: 'Isi' }
function load(relative) {
  const filename = path.resolve(relative)
  if (cache.has(filename)) return cache.get(filename).exports
  const module = { exports: {} }
  cache.set(filename, module)
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  function resolve(name) {
    if (name.endsWith('/require-account'))
      return {
        requireAccount: async () => {
          if (!account) throw createError({ statusCode: 401 })
          return account
        },
      }
    if (name.endsWith('/editor-books'))
      return {
        listFeaturedBooks: async () => {
          reads++
          return { books: [] }
        },
        saveFeaturedBooks: async () => {
          writes++
          return { selectedCount: 0 }
        },
      }
    if (name.endsWith('/repositories/landing-hero')) return { getLandingHero: async () => hero }
    if (name.startsWith('#shared/')) return load(`shared/${name.slice(8)}.ts`)
    if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), `${name}.ts`))
    return require(name)
  }
  new Function(
    'require',
    'module',
    'exports',
    'defineEventHandler',
    'createError',
    'getQuery',
    'readBody',
    'useRuntimeConfig',
    source,
  )(
    resolve,
    module,
    module.exports,
    (handler) => handler,
    createError,
    () => ({}),
    async (event) => {
      bodies++
      return event.body
    },
    () => ({ catalogSource: 'supabase' }),
  )
  return module.exports
}
const get = load('server/api/admin/featured-books/index.get.ts').default
const put = load('server/api/admin/featured-books/index.put.ts').default
for (const [session, status] of [
  [null, 401],
  [{ role: 'editor', isSuper: false }, 403],
  [{ role: 'sales', isSuper: true }, 403],
]) {
  account = session
  await assert.rejects(get({}), (error) => error.statusCode === status)
  await assert.rejects(put({ body: { bookIds: [], hero } }), (error) => error.statusCode === status)
}
assert.equal(
  reads + writes + bodies,
  0,
  'Unauthorized requests must stop before input or repository access',
)
account = { role: 'editor', isSuper: true }
assert.deepEqual((await get({})).hero, hero)
assert.deepEqual(await put({ body: { bookIds: [], hero } }), { selectedCount: 0 })
await assert.rejects(
  put({ body: { bookIds: [], hero: { heading: '', body: '' } } }),
  (error) => error.statusCode === 400,
)
assert.equal(reads, 1)
assert.equal(writes, 1)
console.log(
  'PASS: featured GET/PUT deny anonymous, ordinary Editor, and Sales super before body/repository access; super Editor accepted; invalid input rejected. No live requests.',
)
