import assert from 'node:assert/strict'
import { loadEnvFile } from 'node:process'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServerClient } from '@supabase/ssr'

// Existing Editor session; all favorite data and mutations are browser fixtures.
loadEnvFile('.env')
const base = 'http://localhost:3000'
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const errors = []
function observe(page) {
  page.setDefaultNavigationTimeout(90000)
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (/hydration.*mismatch/i.test(message.text())) errors.push(message.text())
  })
}
async function hydrated(page) {
  await page.waitForFunction(
    () =>
      document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$nuxt?.isHydrating ===
      false,
  )
}
async function screenshot(page, name) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.screenshot({ path: join(tmpdir(), `kpp-${name}.png`), fullPage: true })
}
try {
  const guest = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  observe(guest)
  await guest.goto(base + '/', { waitUntil: 'domcontentloaded' })
  await hydrated(guest)
  assert.equal(await guest.locator('a[href="/favorites"]').count(), 0)
  assert.equal(await guest.locator('.favorite-icon-button').count(), 0)
  await guest.goto(base + '/favorites?q=matematika&level=SD', { waitUntil: 'domcontentloaded' })
  await guest.waitForURL(
    (url) => url.pathname === '/login' && url.searchParams.get('returnTo') === '/favorites',
  )
  assert.equal(await guest.locator('.favorites-grid').count(), 0)
  await screenshot(guest, 'editor-login-guest-desktop')
  await guest.setViewportSize({ width: 390, height: 844 })
  await screenshot(guest, 'editor-login-guest-mobile')
  await guest.close()

  const jar = new Map()
  const client = createServerClient(
    process.env.NUXT_PUBLIC_SUPABASE_URL,
    process.env.NUXT_PUBLIC_SUPABASE_KEY,
    {
      cookieOptions: { name: 'sb-kppproduksatu' },
      cookies: {
        getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
        setAll: (entries) => entries.forEach(({ name, value }) => jar.set(name, value)),
      },
    },
  )
  const login = await client.auth.signInWithPassword({
    email: process.env.SUPER_ACCOUNT_EDITOR_EMAIL,
    password: process.env.SUPER_ACCOUNT_EDITOR_PASSWORD,
  })
  assert.equal(login.error, null, 'Existing Editor session required')
  const ownerId = login.data.user.id
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addCookies(
    Array.from(jar, ([name, value]) => ({ name, value, url: base, sameSite: 'Lax' })),
  )
  const page = await context.newPage()
  observe(page)
  const catalog = await (await fetch(`${base}/api/products`)).json()
  assert.ok(catalog.products.length)
  let products = Array.from({ length: 4 }, (_, index) => ({
    ...catalog.products[index % catalog.products.length],
    id: `favorite-fixture-${index}`,
    title: [
      'Matematika Berpikir Logis',
      'Grow with English 2',
      'Pathway to English',
      'Berpikir Komputasional',
    ][index],
    educationLevel: index === 1 ? 'SD' : 'SMP',
    grade: index === 1 ? 5 : 7,
  }))
  let fail = false
  await page.route('**/api/favorites/ids', (route) =>
    route.fulfill({ json: { ownerId, ids: products.map(({ id }) => id) } }),
  )
  await page.route('**/api/favorites/*', async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback()
    products = products.filter(({ id }) => !route.request().url().endsWith(`/${id}`))
    await route.fulfill({ json: { saved: false } })
  })
  await page.route(/\/api\/favorites(?:\?|$)/, async (route) => {
    if (fail) return route.fulfill({ status: 500, json: { statusMessage: 'Fixture unavailable' } })
    const query = new URL(route.request().url()).searchParams
    const filtered = products.filter(
      (product) =>
        (!query.get('q') || product.title.toLowerCase().includes(query.get('q').toLowerCase())) &&
        (!query.get('level') || product.educationLevel === query.get('level')),
    )
    await route.fulfill({
      json: { ownerId, products: filtered, total: filtered.length, page: 1, pageSize: 24 },
    })
  })
  await page.goto(`${base}/contact`, { waitUntil: 'domcontentloaded' })
  await hydrated(page)
  await page.evaluate(() =>
    document
      .querySelector('#__nuxt')
      .__vue_app__.config.globalProperties.$nuxt.callHook('app:data:refresh', ['favorite-ids']),
  )
  await page.getByRole('link', { name: /^Favorit/i }).click()
  await page.locator('.favorites-grid article').nth(3).waitFor()
  assert.equal(await page.locator('.favorites-login-banner').count(), 0)
  assert.equal(
    await page
      .locator('.favorites-grid')
      .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length),
    4,
  )
  await page.getByRole('button', { name: /Hapus dari favorit: Matematika/ }).waitFor()
  await screenshot(page, 'favorites-desktop')
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok((await page.locator('#favorites-level').boundingBox()).width >= 160)
  await screenshot(page, 'favorites-mobile')
  await page.locator('#favorites-search').fill('tidak-ditemukan')
  await page.getByRole('button', { name: 'Cari', exact: true }).click()
  await page.getByRole('heading', { name: 'Tidak ada favorit yang sesuai pencarian' }).waitFor()
  assert.match(page.url(), /q=tidak-ditemukan/)
  await page.getByRole('link', { name: 'Hapus semua filter' }).click()
  await page.locator('.favorites-grid article').nth(3).waitFor()
  await page.locator('#favorites-level').selectOption('SD')
  await page.getByRole('button', { name: 'Cari', exact: true }).click()
  await page.waitForURL('**/favorites?level=SD')
  await page.waitForFunction(
    () => document.querySelectorAll('.favorites-grid article').length === 1,
  )
  await page.goBack()
  await page.locator('.favorites-grid article').nth(3).waitFor()
  for (let index = 0; index < 4; index++) {
    await page.locator('.favorites-grid button').first().click()
    await page.waitForFunction(
      (count) => document.querySelectorAll('.favorites-grid article').length === count,
      3 - index,
    )
  }
  await page.getByRole('heading', { name: 'Belum ada buku favorit', exact: true }).waitFor()
  await screenshot(page, 'favoritesempty-account-mobile')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await screenshot(page, 'favoritesempty-account-desktop')
  fail = true
  await page.goto(`${base}/contact`, { waitUntil: 'domcontentloaded' })
  await hydrated(page)
  await page.getByRole('link', { name: /^Favorit/i }).click()
  await page.getByRole('alert').filter({ hasText: 'Favorit belum dapat dimuat' }).waitFor()
  assert.equal(await page.locator('.favorites-empty').count(), 0)
  fail = false
  await page.getByRole('button', { name: 'Coba lagi', exact: true }).click()
  await page.getByRole('heading', { name: 'Belum ada buku favorit', exact: true }).waitFor()
  assert.deepEqual(errors, [])
  console.log(
    'PASS port 3000: public controls absent and guest redirected to Editor login, four-column favorites, mobile, search/filter/history, removal to empty, error/retry, no hydration errors. Favorite API mutations intercepted; no database writes.',
  )
} finally {
  await browser.close()
}
