import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { parse, compileScript } from '@vue/compiler-sfc'
import { ref, watch, nextTick } from 'vue'

const require = createRequire(import.meta.url)
let rows = []
let databaseError = null
let reads = 0
const client = {
  from() {
    let levels
    let start = 0
    let end = 499
    return {
      select() {
        return this
      },
      order() {
        return this
      },
      in(_column, values) {
        levels = values
        return this
      },
      range(first, last) {
        start = first
        end = last
        return this
      },
      then(resolve, reject) {
        reads++
        const visible = levels ? rows.filter((row) => levels.includes(row.level)) : rows
        return Promise.resolve({ data: visible.slice(start, end + 1), error: databaseError }).then(
          resolve,
          reject,
        )
      },
    }
  },
}
const cache = new Map()
function evaluate(source, resolve, globals = {}) {
  const module = { exports: {} }
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('require', 'module', 'exports', ...Object.keys(globals), output)(
    resolve,
    module,
    module.exports,
    ...Object.values(globals),
  )
  return module.exports
}
function load(relative) {
  const filename = path.resolve(relative)
  if (cache.has(filename)) return cache.get(filename)
  const result = evaluate(
    fs.readFileSync(filename, 'utf8'),
    (id) => {
      if (id === '#supabase/server') return { serverSupabaseClient: async () => client }
      if (id.startsWith('#shared/')) return load('shared/' + id.slice(8) + '.ts')
      if (filename.includes(`${path.sep}server${path.sep}`) && id.startsWith('.')) return {}
      if (id.startsWith('.')) return load(path.resolve(path.dirname(filename), id + '.ts'))
      return require(id)
    },
    {
      createError: (error) => Object.assign(new Error(error.statusMessage), error),
    },
  )
  cache.set(filename, result)
  return result
}
const { bookTitleSimilarity } = load('shared/utils/book-title-similarity.ts')
assert.equal(bookTitleSimilarity('MATEMATIKA — SD', 'matematika sd'), 1)
assert.ok(bookTitleSimilarity('Matematika SD', 'Matemtika SD') > 0.5)
assert.equal(bookTitleSimilarity('IPA', 'XYZ'), 0)
assert.equal(bookTitleSimilarity('...', '...'), 0)
const { searchBookDescriptions } = load('server/repositories/editor-books.ts')
rows = Array.from({ length: 505 }, (_, i) => ({
  id: String(i).padStart(5, '0'),
  title: `Buku lain ${i}`,
  book_code: String(i),
  level: 'SD',
}))
rows.push({ id: 'late', title: 'Matematika SD', book_code: '999', level: 'SD' })
rows.push({ id: 'hidden', title: 'Matematika SD', book_code: '998', level: 'SMA' })
const editor = { isSuper: false, educationLevels: ['SD'] }
const matches = await searchBookDescriptions({}, editor, 'Matematika SD')
assert.equal(matches[0].id, 'late', 'Best match beyond first database page must be found')
assert.ok(reads >= 2)
assert.ok(matches.length <= 8)
assert.ok(!matches.some((book) => book.id === 'hidden'), 'Editor scope applies before ranking')
const superMatches = await searchBookDescriptions({}, { isSuper: true }, 'Matematika SD')
assert.ok(superMatches.some((book) => book.id === 'hidden'))
databaseError = { code: 'unavailable' }
await assert.rejects(searchBookDescriptions({}, editor, 'Matematika'), { statusCode: 503 })

const { descriptor } = parse(fs.readFileSync('app/components/BookDescriptionAutofill.vue', 'utf8'))
const script = compileScript(descriptor, { id: 'autofill-proof' })
let response
let rejectRequest = false
let confirmReplacement = true
const emitted = []
const component = evaluate(script.content, require, {
  ref,
  watch,
  $fetch: async () => {
    if (rejectRequest) throw new Error('Fixture failure')
    return response
  },
  window: { confirm: () => confirmReplacement },
}).default
const props = { hasDescription: false, currentId: 'self' }
const state = component.setup(props, { expose() {}, emit: (...args) => emitted.push(args) })
state.query.value = 'Matematika'
await nextTick()
response = [
  { id: 'self', title: 'Current' },
  { id: 'source', title: 'Matematika', bookCode: '123' },
]
await state.search()
assert.deepEqual(
  state.results.value.map((book) => book.id),
  ['source'],
)
state.selected.value = 'source'
response = {
  book: { synopsis: 'Sinopsis sumber', highlights: ['Unggul'], targetMarket: ['Siswa SD'] },
}
await state.autofill()
assert.deepEqual(
  emitted[0],
  ['fill', response.book],
  'Actual detail response envelope populates all three fields',
)
props.hasDescription = true
confirmReplacement = false
await state.autofill()
assert.equal(emitted.length, 1, 'Cancel preserves current fields')
confirmReplacement = true
rejectRequest = true
await state.autofill()
assert.equal(emitted.length, 1, 'Failed fetch preserves current fields')
assert.match(state.message.value, /gagal/)
rejectRequest = false
response = { book: { synopsis: null, highlights: [], targetMarket: [] } }
await state.autofill()
assert.equal(emitted.length, 1, 'Empty source preserves current fields')
state.query.value = 'Judul lain'
await nextTick()
assert.equal(state.selected.value, '')
assert.deepEqual(state.results.value, [])
response = []
await state.search()
assert.equal(state.searched.value, true)
assert.equal(state.results.value.length, 0)
console.log(
  'PASS: similarity, pagination, scope, database failure, autofill, cancel, empty source, failed detail, query reset.',
)
