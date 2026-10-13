import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// Browser UI proof with labelled fixtures; never writes live popularity statistics.
const modulePath = process.env.PLAYWRIGHT_MODULE_PATH
if (!modulePath) throw new Error('PLAYWRIGHT_MODULE_PATH belum ditentukan.')
const { chromium } = await import(pathToFileURL(modulePath).href)
const base = process.env.CATALOG_TEST_BASE_URL || 'http://localhost:3000'
const output = process.env.CATALOG_SCREENSHOT_DIR
const book = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'buku-uji-browser',
  title: 'Buku Uji Browser',
  author: 'Penulis Uji',
  description: 'Data uji tampilan.',
  price: 80000,
  imageUrl: '/images/book-placeholder.svg',
  featured: false,
  educationLevel: 'SD',
  grade: 4,
  subject: 'Matematika',
}
const levels = ['SD', 'SMP', 'SMA', 'SMK']
const divisions = ['sd-1-mipa', 'sd-2-ips-bhs', 'smp-sma-mipa', 'smk', 'phibeta', 'intelecto']
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  let accesses = 0
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/api/catalog/browse?*', async (route) => {
    const kind = new URL(route.request().url()).searchParams.get('kind')
    const codes = kind === 'level' ? levels : divisions
    await route.fulfill({
      json: {
        source: 'demo',
        groups: codes.map((code, index) => ({
          code,
          total: index === 0 ? 4 : 0,
          products: index === 0 ? [book] : [],
        })),
      },
    })
  })
  await page.route('**/api/products/*/access', async (route) => {
    assert.equal(route.request().method(), 'POST')
    assert.match(route.request().postDataJSON().visitor, /^[0-9a-f-]{36}$/i)
    accesses++
    await route.fulfill({ json: { recorded: false } })
  })
  for (const path of ['/jenjang', '/divisi']) {
    const response = await fetch(`${base}${path}`)
    assert.equal(response.status, 200, `SSR ${path}`)
    assert.match(await response.text(), /Buku Paling Sering Diakses/)
  }
  await page.goto(base, { waitUntil: 'networkidle' })
  await page
    .getByRole('navigation', { name: 'Navigasi utama' })
    .getByRole('link', { name: 'Jenjang', exact: true })
    .click()
  await page.getByRole('heading', { name: 'Jenjang', exact: true }).waitFor()
  await page.getByText(book.title, { exact: true }).waitFor()
  assert.equal(await page.locator('.group-card').count(), 4)
  if (output) {
    await mkdir(output, { recursive: true })
    await page.screenshot({ path: `${output}/jenjang-desktop.png`, fullPage: true })
  }
  await page.getByRole('link', { name: 'Buku SD 4 buku', exact: true }).click()
  await page.waitForURL('**/jenjang?level=SD')
  assert.equal(await page.locator('.book-shelf').count(), 1)
  await page.goBack()
  await page.waitForURL('**/jenjang')
  assert.equal(await page.locator('.book-shelf').count(), 4)
  await page
    .getByRole('navigation', { name: 'Navigasi utama' })
    .getByRole('link', { name: 'Divisi', exact: true })
    .click()
  await page.getByRole('heading', { name: 'Divisi', exact: true }).waitFor()
  assert.equal(await page.locator('.group-card').count(), 6)
  await page.getByRole('link', { name: 'SD 1 MIPA 4 buku', exact: true }).click()
  await page.waitForURL('**/divisi?division=sd-1-mipa')
  assert.equal(await page.locator('.book-shelf').count(), 1)
  assert.match(await page.locator('.shelf-heading a').getAttribute('href'), /division=sd-1-mipa/)
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
    'Mobile overflow',
  )
  if (output) await page.screenshot({ path: `${output}/divisi-mobile.png`, fullPage: true })
  // Start from an actual published book, but intercept its tracking write.
  const catalog = await (await fetch(`${base}/api/products`)).json()
  if (catalog.products?.length) {
    const slug = catalog.products[0].slug
    await page.goto(`${base}/products/${slug}`, { waitUntil: 'networkidle' })
    assert.equal(accesses, 1, 'Detail mount records one request')
    await page.reload({ waitUntil: 'networkidle' })
    assert.equal(accesses, 2, 'Reload retries; DB owns daily deduplication')
  }
  assert.deepEqual(errors, [], 'Browser errors')
  console.log(
    'PASS: SSR, routing, selection, history, cards, mobile, detail tracking (mocked writes).',
  )
} finally {
  await browser.close()
}
