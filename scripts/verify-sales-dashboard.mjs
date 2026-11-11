import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { z } from 'zod'
import { nipSchema } from '../shared/schemas/auth.ts'

const createError = (options) => Object.assign(new Error(options.statusMessage), options)
async function moduleAt(path, dependencies, globals = {}) {
  const output = ts.transpileModule(await readFile(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  const scope = { createError, ...globals }
  new Function('require', 'exports', ...Object.keys(scope), output)(
    (name) => {
      assert(name in dependencies, `Unexpected import ${name}`)
      return dependencies[name]
    },
    exports,
    ...Object.values(scope),
  )
  return exports
}
const contracts = await moduleAt('shared/schemas/sales-dashboard.ts', {
  zod: { z },
  './auth': { nipSchema },
})
for (const page of ['0', '-1', '1.5', 'bad', '100001'])
  assert.equal(contracts.salesDashboardQuerySchema.safeParse({ page }).success, false)

let account
let reads = 0
const guards = await moduleAt(
  'server/utils/require-editor.ts',
  {
    './require-account': {
      requireAccount: async () => {
        if (!account) throw createError({ statusCode: 401, statusMessage: 'Login' })
        return account
      },
    },
  },
  { useRuntimeConfig: () => ({ catalogSource: 'supabase' }) },
)
const endpoint = (
  await moduleAt(
    'server/api/admin/sales-dashboard.get.ts',
    {
      '#shared/schemas/sales-dashboard': contracts,
      '../../utils/require-editor': guards,
      '../../repositories/sales-dashboard': {
        getSalesDashboard: async (_event, page) => {
          reads++
          return { page }
        },
      },
    },
    {
      defineEventHandler: (handler) => handler,
      getQuery: (event) => event.query ?? {},
      setHeader: (event, key, value) => ((event.headers ??= {})[key] = value),
    },
  )
).default
await assert.rejects(endpoint({}), (error) => error.statusCode === 401)
for (const identity of [
  { role: 'sales', isSuper: false },
  { role: 'sales', isSuper: true },
  { role: 'editor', isSuper: false },
]) {
  account = identity
  await assert.rejects(endpoint({}), (error) => error.statusCode === 403)
}
assert.equal(reads, 0, 'Rejected users never reach administrative reads')
account = { role: 'editor', isSuper: true }
for (const query of [{ page: 'bad' }, { role: 'sales' }])
  await assert.rejects(endpoint({ query }), (error) => error.statusCode === 400)
const event = { query: { page: '2' } }
assert.deepEqual(await endpoint(event), { page: 2 })
assert.equal(event.headers['Cache-Control'], 'private, no-store')

const fixture = {
  sales: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      nip: '0001',
      name: 'Sales Resmi',
      placement: 'Jakarta',
      lastLoginAt: '2026-11-11T01:02:03Z',
      loginCount: 2,
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
  employeeDirectoryConnected: true,
  periods: {
    asOf: '2026-11-11T01:02:03Z',
    todayStart: '2026-11-10T17:00:00Z',
    weekStart: '2026-11-08T17:00:00Z',
    today: { loginEvents: 2, topAreas: [{ area: 'Jakarta', loginEvents: 2 }] },
    week: { loginEvents: 5, topAreas: [{ area: 'Jakarta', loginEvents: 5 }] },
  },
  usage: { uniqueSales: 1, loginEvents: 2, areas: [{ area: 'Jakarta', registered: 1, users: 1 }] },
}
let fail = false
let malformed = false
const { getSalesDashboard } = await moduleAt('server/repositories/sales-dashboard.ts', {
  '#supabase/server': {
    serverSupabaseClient: async () => ({
      rpc: async (name, body) => {
        assert.equal(name, 'get_sales_dashboard')
        assert.deepEqual(body, { p_page: 1 })
        return { data: malformed ? {} : fixture, error: fail ? {} : null }
      },
    }),
  },
  '#shared/schemas/sales-dashboard': contracts,
})
assert.deepEqual(await getSalesDashboard({}, 1), fixture)
fail = true
await assert.rejects(getSalesDashboard({}, 1), (error) => error.statusCode === 503)
fail = false
malformed = true
await assert.rejects(getSalesDashboard({}, 1), (error) => error.statusCode === 503)

let role = 'sales'
let writeFails = false
const writes = []
const { recordSalesLogin } = await moduleAt('server/repositories/sales-login-events.ts', {
  zod: { z },
  '../utils/employee-registry': {
    getEmployeeAdmin: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { role }, error: null }) }),
        }),
      }),
      rpc: async (name, body) => {
        writes.push({ name, body })
        return { error: writeFails ? {} : null }
      },
    }),
  },
})
const sessionId = '22222222-2222-4222-8222-222222222222'
const token =
  'header.' +
  Buffer.from(JSON.stringify({ session_id: sessionId })).toString('base64url') +
  '.signature'
await recordSalesLogin({}, fixture.sales[0].id, token)
assert.deepEqual(writes[0], {
  name: 'record_sales_login',
  body: { p_user_id: fixture.sales[0].id, p_session_id: sessionId },
})
role = 'editor'
await recordSalesLogin({}, fixture.sales[0].id, 'no-token-needed')
assert.equal(writes.length, 1)
role = 'sales'
await assert.rejects(
  recordSalesLogin({}, fixture.sales[0].id, 'invalid'),
  (error) => error.statusCode === 503,
)
writeFails = true
await assert.rejects(
  recordSalesLogin({}, fixture.sales[0].id, token),
  (error) => error.statusCode === 503,
)
console.log(
  'PASS: super Editor-only API, private response, query validation, dashboard RPC validation/failures, verified-session recording, Editor skip, malformed token and recording failures. Fixtures only.',
)
