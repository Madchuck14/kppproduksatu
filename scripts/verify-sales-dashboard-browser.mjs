import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// Browser API fixtures only; never mutates Supabase or employee records.
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const base = process.env.SALES_DASHBOARD_TEST_BASE_URL || 'http://localhost:3000'
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const account = {
  id: '11111111-1111-4111-8111-111111111111',
  role: 'editor',
  isSuper: true,
  educationLevels: ['SD', 'SMP', 'SMA', 'SMK'],
}
let fail = false
let empty = false
await page.route('**/api/**', (route) => {
  const url = new URL(route.request().url())
  if (!url.pathname.startsWith('/api/')) return route.continue()
  if (route.request().method() !== 'GET') throw new Error('Unexpected mutation')
  if (url.pathname === '/api/admin/editor-session') return route.fulfill({ json: account })
  if (url.pathname === '/api/admin/sales-dashboard') {
    if (fail) return route.fulfill({ status: 503, json: { statusMessage: 'Fixture failure' } })
    const second = url.searchParams.get('page') === '2'
    return route.fulfill({
      json: {
        sales: empty
          ? []
          : [
              {
                id: '33333333-3333-4333-8333-333333333333',
                nip: second ? '000124' : '000123',
                name: 'Sales Resmi',
                placement: 'Jakarta Timur',
                lastLoginAt: second ? null : '2026-11-11T01:02:03Z',
                loginCount: second ? 0 : 2,
              },
            ],
        total: empty ? 0 : 21,
        page: second ? 2 : 1,
        pageSize: 20,
        employeeDirectoryConnected: true,
        periods: {
          asOf: '2026-11-11T01:02:03Z',
          todayStart: '2026-11-10T17:00:00Z',
          weekStart: '2026-11-08T17:00:00Z',
          today: {
            loginEvents: empty ? 0 : 14,
            topAreas: empty
              ? []
              : [
                  { area: 'Jakarta Timur', loginEvents: 7 },
                  { area: 'Bandung', loginEvents: 7 },
                ],
          },
          week: {
            loginEvents: empty ? 0 : 30,
            topAreas: empty ? [] : [{ area: 'Jakarta Timur', loginEvents: 20 }],
          },
        },
        usage: {
          uniqueSales: 1,
          loginEvents: 2,
          areas: empty ? [] : [{ area: 'Jakarta Timur', registered: 21, users: 1 }],
        },
      },
    })
  }
  return route.fulfill({ status: 401, json: { statusCode: 401 } })
})
async function navigate(path) {
  await page.evaluate(
    (destination) =>
      document
        .querySelector('#__nuxt')
        .__vue_app__.config.globalProperties.$router.push(destination),
    path,
  )
}
try {
  await page.goto(base + '/login')
  await page.waitForFunction(() => Boolean(document.querySelector('#__nuxt')?.__vue_app__))
  await navigate('/admin/daerah-penjualan')
  await page.getByRole('heading', { name: 'Catatan Login', exact: true }).waitFor()
  const menu = page.getByRole('navigation', { name: 'Menu pengelolaan' })
  assert.equal(await menu.locator('[aria-current="page"]').innerText(), 'Catatan Login')
  await page.getByRole('cell', { name: '000123', exact: true }).waitFor()
  await page.getByRole('cell', { name: 'Sales Resmi', exact: true }).waitFor()
  assert.equal(await page.getByRole('cell', { name: 'Jakarta Timur', exact: true }).count(), 1)
  const summary = page.getByLabel('Ringkasan aktivitas login')
  assert.deepEqual(
    (await summary.locator('strong').allTextContents()).map((value) => value.trim()),
    ['14', '30', '7', '20'],
  )
  await summary.getByText('Jakarta Timur, Bandung', { exact: true }).waitFor()
  await summary.getByText('Total login hari ini', { exact: true }).waitFor()
  await summary.getByText('Total login minggu ini', { exact: true }).waitFor()
  assert.match(await page.locator('time').innerText(), /08[.:]02[.:]03/)
  assert.equal(await page.locator('time').getAttribute('datetime'), '2026-11-11T01:02:03Z')
  await mkdir('.data/sales-dashboard-qa', { recursive: true })
  await page.screenshot({ path: '.data/sales-dashboard-qa/desktop.png', fullPage: true })
  await page.getByRole('link', { name: 'Berikutnya', exact: true }).click()
  await page.getByRole('cell', { name: '000124', exact: true }).waitFor()
  await page.getByRole('cell', { name: 'Belum ada login tercatat', exact: true }).waitFor()
  assert.equal(new URL(page.url()).searchParams.get('page'), '2')
  await page.setViewportSize({ width: 390, height: 844 })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.screenshot({ path: '.data/sales-dashboard-qa/mobile.png', fullPage: true })
  fail = true
  await page.getByRole('button', { name: 'Muat ulang', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Catatan login belum dapat dimuat' }).waitFor()
  fail = false
  empty = true
  await page.getByRole('button', { name: 'Muat ulang', exact: true }).click()
  await page
    .getByText('Belum ada akun Sales untuk ditampilkan dalam catatan login.', { exact: true })
    .waitFor()
  assert.deepEqual(await summary.locator('strong').allTextContents(), ['0', '0', '0', '0'])
  await navigate('/login')
  account.isSuper = false
  await assert.rejects(
    navigate('/admin/daerah-penjualan'),
    /Halaman ini hanya dapat diakses oleh Editor super/,
  )
  assert.equal(await menu.getByRole('link', { name: 'Catatan Login', exact: true }).count(), 0)
  assert.deepEqual(errors, [])
  console.log(
    'PASS: super menu/page, active navigation, WIB timestamp, directory notice, pagination, never-logged-in, retry/empty state, mobile overflow, ordinary Editor denial. Browser fixtures only.',
  )
} catch (error) {
  console.error(JSON.stringify({ url: page.url(), errors }))
  throw error
} finally {
  await browser.close()
}
