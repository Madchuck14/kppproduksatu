import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// Use the already running port 3000. Auth mutations are browser fixtures, never live calls.
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href)
const base = 'http://localhost:3000'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (/hydration.*mismatch/i.test(message.text())) errors.push(message.text())
})
const password = 'FixturePassword123!'
const id = '22222222-2222-4222-8222-222222222222'
let registered
let loginBody
let loggedIn = false
let failLogin = true
const account = {
  id,
  nip: '000123',
  role: 'sales',
  isSuper: false,
  educationLevels: [],
  salesAreas: [],
}
let areaSaves = 0
const user = {
  id,
  aud: 'authenticated',
  role: 'authenticated',
  email: '000123@nip.invalid',
  app_metadata: { provider: 'email' },
  user_metadata: {},
  identities: [],
  created_at: new Date().toISOString(),
}
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: id, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) })}.fixture`
const respond = (route, status, body) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
await page.route('**/api/auth/register', (route) => {
  registered = route.request().postDataJSON()
  if (registered.nip === '999999')
    return respond(route, 400, {
      statusCode: 400,
      statusMessage: 'NIK tidak cocok dengan data karyawan perusahaan.',
      data: { code: 'NIP_NOT_FOUND' },
    })
  return respond(route, 200, {
    message: 'Pendaftaran berhasil. Silakan masuk dengan NIK dan kata sandi Anda.',
  })
})
await page.route('**/api/auth/login', (route) => {
  loginBody = route.request().postDataJSON()
  if (failLogin) return respond(route, 401, { statusCode: 401, statusMessage: 'Login gagal.' })
  loggedIn = true
  return respond(route, 200, { access_token: accessToken, refresh_token: 'fixture-refresh' })
})
await page.route('**/api/auth/session', (route) =>
  respond(route, loggedIn ? 200 : 401, loggedIn ? account : { statusCode: 401 }),
)
await page.route('**/api/auth/sales-areas', (route) => {
  areaSaves++
  return respond(route, 500, { statusMessage: 'Area collection is no longer part of login.' })
})
await page.route('**/auth/v1/**', (route) => {
  if (route.request().url().includes('/logout')) {
    loggedIn = false
    return respond(route, 200, {})
  }
  return respond(route, 200, user)
})
await page.route('**/api/favorites**', (route) =>
  respond(
    route,
    200,
    route.request().url().includes('/ids')
      ? { ownerId: id, ids: [] }
      : { ownerId: id, products: [], total: 0, page: 1, pageSize: 24 },
  ),
)
async function open(path) {
  await page.goto(base + path)
  await page.waitForFunction(
    () =>
      document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$nuxt?.isHydrating ===
      false,
  )
}
try {
  const catalog = await (await fetch(base + '/api/products')).json()
  const product = catalog.products[0]
  for (const path of [
    '/',
    '/products',
    '/api/products?q=matematika',
    '/healthz',
    '/login',
    '/register',
    ...(product
      ? [
          `/products/${product.bookCode || product.slug}`,
          `/api/products/${product.bookCode || product.slug}`,
        ]
      : []),
  ])
    assert.equal((await fetch(base + path)).status, 200, path)
  assert.equal((await fetch(base + '/products/missing-nip-fixture-xyz')).status, 404)
  assert.equal((await fetch(base + '/api/auth/session')).status, 401)
  for (const body of [
    { email: 'old@example.com', password },
    { nip: 'abc-123', password },
    { nip: '123', password, isSuper: true },
  ])
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
  await mkdir('artifacts/nip-auth', { recursive: true })
  await open('/login?returnTo=/favorites')
  assert.equal(await page.locator('input[type="email"]').count(), 0)
  await page.getByLabel('Nomor Induk Karyawan (NIK)', { exact: true }).waitFor()
  await page.getByRole('link', { name: 'Daftar akun', exact: true }).click()
  assert.equal(new URL(page.url()).searchParams.get('returnTo'), '/favorites')
  assert.equal(await page.locator('input[type="email"]').count(), 0)
  const enabled = await page.locator('#register-nip').isEnabled()
  if (enabled) {
    await page.locator('#register-nip').fill('kry001a')
    await page.locator('#register-password').fill(password)
    await page.locator('#confirm-password').fill('wrong-password')
    await page.getByRole('button', { name: 'Daftar sebagai Sales', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: 'Konfirmasi kata sandi tidak cocok' }).waitFor()
    assert.equal(registered, undefined)
    await page.locator('#confirm-password').fill(password)
    await page.locator('#register-nip').fill('999999')
    await page.getByRole('button', { name: 'Daftar sebagai Sales', exact: true }).click()
    await page
      .getByRole('alert')
      .filter({
        hasText: 'NIK tidak cocok dengan data karyawan perusahaan.',
      })
      .waitFor()
    await page.locator('#register-nip').fill('kry001a')
    await page.getByRole('radio', { name: /Editor/ }).check()
    await page.locator('#editor-education-level').selectOption('SMP')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: 'artifacts/nip-auth/register-mobile.png', fullPage: true })
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    )
    await page.getByRole('button', { name: 'Daftar sebagai Editor', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Pendaftaran berhasil' }).waitFor()
    assert.deepEqual(registered, {
      nip: 'KRY001A',
      password,
      role: 'editor',
      educationLevel: 'SMP',
    })
    await page.getByRole('link', { name: 'Login', exact: true }).click()
    assert.equal(new URL(page.url()).searchParams.get('returnTo'), '/favorites')
    await page.locator('#nip').fill('kry001a')
    await page.locator('#password').fill(password)
    await page.getByRole('button', { name: 'Masuk', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: 'Periksa NIK dan kata sandi' }).waitFor()
    assert.deepEqual(loginBody, { nip: 'KRY001A', password })
    await page.screenshot({ path: 'artifacts/nip-auth/login-mobile.png', fullPage: true })
    failLogin = false
    await page.getByRole('button', { name: 'Masuk', exact: true }).click()
    await page.waitForURL(base + '/favorites')
    await page.getByRole('heading', { name: 'Buku Favorit', exact: true }).waitFor()
    assert.equal(areaSaves, 0, 'Sales goes directly to returnTo without saving areas')
    assert.equal(await page.locator('.sales-area-summary').count(), 0)
    assert.equal(await page.getByRole('link', { name: 'Ubah area', exact: true }).count(), 0)
    assert.equal(await page.getByRole('link', { name: 'Dashboard Editor', exact: true }).count(), 0)
    await page.getByRole('button', { name: 'Keluar', exact: true }).click()
    await page.waitForURL(base + '/')
    assert.equal(
      await page.locator('.sales-area-summary').count(),
      0,
      'Area identity disappears on logout',
    )
    account.role = 'editor'
    account.educationLevels = ['SMP']
    await open('/login?returnTo=/products')
    await page.locator('#nip').fill('000123')
    await page.locator('#password').fill(password)
    await page.getByRole('button', { name: 'Masuk', exact: true }).click()
    await page.waitForURL(base + '/products')
    assert.equal(
      await page.getByRole('heading', { name: 'Area Sales Anda', exact: true }).count(),
      0,
      'Editors skip Sales area step',
    )
    assert.equal(await page.locator('.sales-area-summary').count(), 0)
  }
  assert.deepEqual(errors, [])
  console.log(
    `PASS: port 3000 public SSR/API/404, invalid auth input, NIK-only forms and returnTo; ${enabled ? 'fixture registration, password confirmation, Editor level, failed/successful login, Sales navigation, logout, mobile overflow/screenshots' : 'demo disables auth (interactive checks unavailable)'}. No live Auth mutations.`,
  )
} finally {
  await browser.close()
}
