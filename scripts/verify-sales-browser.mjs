import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { registrationSchema } from '../shared/schemas/auth.ts'

// Production Node build + local Auth fixtures. Never reads .env or contacts live Supabase.
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href)
const base = 'http://127.0.0.1:3198'
const authBase = 'http://127.0.0.1:3199'
const salesId = '22222222-2222-4222-8222-222222222222'
const superId = '77777777-7777-4777-8777-777777777777'
const applicantId = '88888888-8888-4888-8888-888888888888'
const editorScopes = new Map()
const editorId = '11111111-1111-4111-8111-111111111111'
let signups = 0
let lastSignup
const errors = []
const accounts = new Map()
const password = 'FixturePassword123!'
for (const educationLevel of ['SD', 'SMP', 'SMA', 'SMK']) {
  assert.equal(
    registrationSchema.safeParse({
      email: 'editor@example.com',
      password,
      confirmPassword: password,
      role: 'editor',
      educationLevel,
    }).success,
    true,
  )
}
assert.equal(
  registrationSchema.safeParse({
    email: 'sales@example.com',
    password,
    confirmPassword: 'different',
  }).success,
  false,
)
assert.equal(
  registrationSchema.safeParse({
    email: 'sales@example.com',
    password,
    confirmPassword: password,
    role: 'editor',
  }).success,
  false,
)
const auth = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', base)
  res.setHeader('Access-Control-Allow-Headers', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Content-Type', 'application/json')
  if (req.method === 'OPTIONS') return res.end()
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}
  const url = new URL(req.url, authBase)
  if (url.pathname === '/auth/v1/signup') {
    signups++
    lastSignup = body
    if (body.email === 'throttle@example.com') {
      res.statusCode = 429
      return res.end(
        JSON.stringify({ code: 'over_email_send_rate_limit', msg: 'Too many requests' }),
      )
    }
    if (body.data?.registration_role === 'editor')
      editorScopes.set(applicantId, body.data.requested_education_level)
    return res.end(JSON.stringify({ user: { id: salesId, email: body.email }, session: null }))
  }
  if (url.pathname === '/auth/v1/token') {
    const id = body.email.startsWith('super')
      ? superId
      : body.email.startsWith('applicant')
        ? applicantId
        : body.email.startsWith('editor')
          ? editorId
          : salesId
    const user = {
      id,
      aud: 'authenticated',
      role: 'authenticated',
      email: body.email,
      email_confirmed_at: new Date().toISOString(),
      app_metadata: { provider: 'email' },
      user_metadata: {},
      identities: [],
      created_at: new Date().toISOString(),
    }
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: id, email: body.email, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) })}.fixture`
    accounts.set(token, user)
    return res.end(
      JSON.stringify({
        access_token: token,
        refresh_token: 'fixture-refresh',
        expires_in: 3600,
        token_type: 'bearer',
        user,
      }),
    )
  }
  const user = accounts.get(req.headers.authorization?.replace('Bearer ', ''))
  if (url.pathname === '/auth/v1/user') {
    if (!user) res.statusCode = 401
    return res.end(JSON.stringify(user ?? { msg: 'Unauthenticated' }))
  }
  if (url.pathname === '/auth/v1/logout') return res.end('{}')
  if (url.pathname === '/rest/v1/account_memberships') {
    const row = user
      ? {
          role:
            [editorId, superId].includes(user.id) || editorScopes.has(user.id) ? 'editor' : 'sales',
          is_super: user.id === superId,
        }
      : null
    return res.end(JSON.stringify(req.headers.accept?.includes('object') ? row : row ? [row] : []))
  }
  if (url.pathname === '/rest/v1/editor_scopes')
    return res.end(JSON.stringify([{ education_level: editorScopes.get(user?.id) ?? 'SD' }]))
  if (url.pathname === '/rest/v1/book_classifications') return res.end('[]')
  if (url.pathname === '/rest/v1/landing_hero')
    return res.end(
      JSON.stringify({ heading: 'Katalog buku', body: 'Fixture katalog untuk pengujian.' }),
    )
  if (url.pathname.startsWith('/rest/v1/rpc/')) {
    if (url.pathname.endsWith('/record_product_access')) return res.end('true')
    return res.end('[]')
  }
  if (url.pathname === '/rest/v1/products') {
    const row = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      slug: 'fixture-book',
      title: 'Buku Fixture',
      author: 'Penulis',
      curriculum: null,
      isbn: null,
      division_code: null,
      synopsis: 'Fixture',
      target_market: [],
      highlights: [],
      price: 10000,
      image_path: null,
      featured: true,
      book_code: '123',
      education_level: 'SD',
      subject: 'Matematika',
      grade: 1,
      publication_year: 2026,
    }
    const found =
      !user &&
      !['book_code', 'slug', 'id'].some(
        (key) => url.searchParams.has(key) && url.searchParams.get(key) !== 'eq.' + row[key],
      )
    const rows = found ? [row] : []
    res.setHeader('Content-Range', found ? '0-0/1' : '*/0')
    return res.end(
      JSON.stringify(req.headers.accept?.includes('object') ? (rows[0] ?? null) : rows),
    )
  }
  if (url.pathname === '/rest/v1/product_favorites') {
    res.setHeader('Content-Range', '*/0')
    return res.end('[]')
  }
  res.statusCode = 404
  res.end('{}')
})
auth.listen(3199, '127.0.0.1')
await once(auth, 'listening')
const app = spawn(process.execPath, ['.output/server/index.mjs'], {
  windowsHide: true,
  env: {
    ...process.env,
    PORT: '3198',
    HOST: '127.0.0.1',
    NUXT_CATALOG_SOURCE: 'supabase',
    NUXT_PUBLIC_SUPABASE_URL: authBase,
    NUXT_PUBLIC_SUPABASE_KEY: 'fixture-public-key',
    NUXT_PUBLIC_SITE_URL: base,
  },
  stdio: ['ignore', 'ignore', 'pipe'],
})
let appError = ''
app.stderr.on('data', (chunk) => {
  appError += chunk.toString()
})
let browser
try {
  for (let attempt = 0; ; attempt++) {
    try {
      if ((await fetch(base + '/healthz')).ok) break
    } catch {
      /* Await startup. */
    }
    if (attempt > 100 || app.exitCode !== null)
      throw new Error('Fixture app startup failed: ' + appError)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  const catalog = await (await fetch(base + '/api/products')).json()
  const product = catalog.products[0]
  for (const path of [
    '/',
    '/products',
    '/api/products?q=matematika',
    `/products/${product.bookCode || product.slug}`,
    `/api/products/${product.slug}`,
    '/healthz',
    '/login',
    '/register',
  ])
    assert.equal((await fetch(base + path)).status, 200, path)
  assert.equal((await fetch(base + '/products/missing-sales-test')).status, 404)
  assert.equal((await fetch(base + '/api/auth/session')).status, 401)
  for (const body of [
    { email: 'sales@example.com', password, role: 'editor' },
    { email: 'editor@example.com', password, role: 'editor', educationLevel: 'SD', isSuper: true },
    { email: 'editor@example.com', password, role: 'editor', educationLevel: 'SUPER' },
    { email: 'sales@example.com', password, role: 'sales', educationLevel: 'SD' },
    { email: 'sales@example.com', password: 'short' },
  ]) {
    assert.equal(
      (
        await fetch(base + '/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      ).status,
      400,
    )
  }
  assert.equal(signups, 0, 'Invalid requests never reach Auth')
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (/hydration.*mismatch/i.test(message.text())) errors.push(message.text())
  })
  async function open(path) {
    await page.goto(base + path)
    await page.waitForFunction(
      () =>
        document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$nuxt
          ?.isHydrating === false,
    )
  }
  await open('/login?returnTo=/favorites')
  await page.getByRole('link', { name: 'Daftar akun', exact: true }).click()
  assert.equal(new URL(page.url()).searchParams.get('returnTo'), '/favorites')
  assert.equal(await page.locator('input[type="radio"]').count(), 2)
  await page.locator('#register-email').fill('sales@example.com')
  await page.locator('#register-password').fill(password)
  await page.locator('#confirm-password').fill(password)
  await page.getByRole('button', { name: 'Daftar sebagai Sales', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Jika pendaftaran dapat diproses' }).waitFor()
  assert.equal(signups, 1)
  assert.equal(lastSignup.data?.role, undefined)
  assert.equal(lastSignup.data?.is_super, undefined)
  await page.getByRole('link', { name: 'Login', exact: true }).click()
  assert.equal(new URL(page.url()).searchParams.get('returnTo'), '/favorites')
  await page.locator('#email').fill('sales@example.com')
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  await page.waitForURL(base + '/favorites')
  await page.getByRole('heading', { name: 'Buku Favorit', exact: true }).waitFor()
  assert.equal(await page.getByRole('link', { name: 'Dashboard Editor', exact: true }).count(), 0)
  const session = await page.request.get(base + '/api/auth/session')
  assert.equal(session.status(), 200)
  assert.equal((await session.json()).role, 'sales')
  assert.equal((await page.request.get(base + '/api/admin/editor-session')).status(), 403)
  assert.equal((await page.request.get(base + '/api/admin/books')).status(), 403)
  await page.reload()
  await page.getByRole('heading', { name: 'Buku Favorit', exact: true }).waitFor()
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.screenshot({ path: join(tmpdir(), 'kpp-sales-favorites-mobile.png'), fullPage: true })
  await page.getByRole('button', { name: 'Keluar', exact: true }).click()
  await page.waitForURL(base + '/')
  await open('/login')
  await page.locator('#email').fill('sales@example.com')
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  await page.waitForURL(base + '/products')
  await page.getByRole('button', { name: 'Keluar', exact: true }).click()
  await page.waitForURL(base + '/')
  await open('/login?returnTo=/favorites')
  await page.locator('#email').fill('editor@example.com')
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  await page.waitForURL(base + '/favorites')
  assert.equal((await (await page.request.get(base + '/api/auth/session')).json()).role, 'editor')
  await page.getByRole('link', { name: 'Dashboard Editor', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Keluar', exact: true }).click()
  await page.waitForURL(base + '/')
  await open('/register')
  await page.getByRole('radio', { name: /Editor/ }).check()
  assert.deepEqual(await page.locator('#editor-education-level option').allTextContents(), [
    'Pilih jenjang pendidikan',
    'SD',
    'SMP',
    'SMA',
    'SMK',
  ])
  await page.locator('#editor-education-level').selectOption('SMP')
  await page.locator('#register-email').fill('applicant@example.com')
  await page.locator('#register-password').fill(password)
  await page.locator('#confirm-password').fill(password)
  await page.screenshot({ path: join(tmpdir(), 'kpp-editor-register-mobile.png'), fullPage: true })
  await page.getByRole('button', { name: 'Daftar sebagai Editor', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Jika pendaftaran dapat diproses' }).waitFor()
  assert.equal(lastSignup.data.registration_role, 'editor')
  assert.equal(lastSignup.data.requested_education_level, 'SMP')
  await page.getByRole('link', { name: 'Login', exact: true }).click()
  await page.locator('#email').fill('applicant@example.com')
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  await page.waitForURL(base + '/admin')
  const editorSession = await (await page.request.get(base + '/api/auth/session')).json()
  assert.equal(editorSession.role, 'editor')
  assert.deepEqual(editorSession.educationLevels, ['SMP'])
  assert.equal(editorSession.isSuper, false)
  assert.equal((await page.request.get(base + '/api/admin/books?level=SD')).status(), 403)
  assert.equal((await page.request.get(base + '/api/admin/books?level=SMP')).status(), 200)
  assert.equal(
    await page.getByRole('heading', { name: 'Pengajuan akun Editor', exact: true }).count(),
    0,
  )
  assert.equal((await page.request.get(base + '/api/admin/editor-requests')).status(), 404)
  await page.getByRole('button', { name: 'Keluar', exact: true }).click()
  await page.waitForURL(base + '/')
  await open('/register?returnTo=https://untrusted.example')
  assert.equal(
    await page.getByRole('link', { name: 'Login', exact: true }).getAttribute('href'),
    '/login',
  )
  await page.locator('#register-email').fill('throttle@example.com')
  await page.locator('#register-password').fill(password)
  await page.locator('#confirm-password').fill(password)
  await page.getByRole('button', { name: 'Daftar sebagai Sales', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Terlalu banyak percobaan' }).waitFor()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.screenshot({ path: join(tmpdir(), 'kpp-sales-register-mobile.png'), fullPage: true })
  assert.deepEqual(errors, [])
  console.log(
    'PASS: production-build route smoke; Sales signup/login/default destination/returnTo/logout; direct Editor registration and scoped login without approval; Editor login; forged-role rejection; 429 feedback; Sales admin denial; mobile layout; no hydration errors (local Auth fixtures only).',
  )
} finally {
  await browser?.close()
  app.kill()
  auth.closeAllConnections()
  await new Promise((resolve) => auth.close(resolve))
}
