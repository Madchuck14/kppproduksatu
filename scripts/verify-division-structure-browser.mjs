import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const base = process.env.STRUCTURE_TEST_BASE_URL || 'http://localhost:3000'
  await page.goto(`${base}/divisi`, { waitUntil: 'networkidle' })
  const section = page.getByRole('region', { name: 'Struktur Produk', exact: true })
  await section.waitFor()
  let fail = false
  await page.route('**/api/catalog/product-structure?**', (route) => {
    const level = new URL(route.request().url()).searchParams.get('level')
    const nodes = [
      { id: '11111111-1111-4111-8111-111111111111', parentId: null, name: `Kategori ${level}` },
      {
        id: '22222222-2222-4222-8222-222222222222',
        parentId: '11111111-1111-4111-8111-111111111111',
        name: `Cabang ${level}`,
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        parentId: null,
        name: `Kategori lain ${level}`,
      },
    ].map((node) => ({
      ...node,
      educationLevel: level,
      sortOrder: 0,
      archived: false,
      productStatus: 'Produk 2026',
    }))
    return route.fulfill({
      status: fail ? 500 : 200,
      contentType: 'application/json',
      body: JSON.stringify(fail ? { message: 'Fixture error' } : level === 'SMK' ? [] : nodes),
    })
  })
  const select = page.getByLabel('Jenjang pendidikan', { exact: true })
  await select.selectOption('SMP')
  await section.getByRole('link', { name: 'Cabang SMP Produk 2026', exact: true }).waitFor()
  assert.equal(new URL(page.url()).searchParams.get('level'), 'SMP')
  assert.match(
    await section
      .getByRole('link', { name: 'Cabang SMP Produk 2026', exact: true })
      .getAttribute('href'),
    /structure=22222222/,
  )
  await select.selectOption('SMA')
  await section.getByRole('link', { name: 'Cabang SMA Produk 2026', exact: true }).waitFor()
  await page.goBack()
  await section.getByRole('link', { name: 'Cabang SMP Produk 2026', exact: true }).waitFor()
  async function verifyHorizontalLayout() {
    await page.waitForFunction(() => {
      const diagram = document.querySelector('.diagram')
      if (!diagram) return false
      const bounds = diagram.getBoundingClientRect()
      const paths = Array.from(diagram.querySelectorAll('svg path')).map((path) =>
        path
          .getAttribute('d')
          .match(/-?\d+(?:\.\d+)?/g)
          .map(Number),
      )
      const cards = Array.from(diagram.querySelectorAll('[data-structure-id]'))
      return (
        paths.length === cards.length &&
        cards.every((card) => {
          const parent = card.closest('ul').previousElementSibling
          const from = parent.getBoundingClientRect()
          const to = card.getBoundingClientRect()
          return paths.some(
            ([x1, y1, , y2, x2]) =>
              Math.abs(x1 - (from.right - bounds.left)) < 0.75 &&
              Math.abs(y1 - (from.top + from.height / 2 - bounds.top)) < 0.75 &&
              Math.abs(x2 - (to.left - bounds.left)) < 0.75 &&
              Math.abs(y2 - (to.top + to.height / 2 - bounds.top)) < 0.75,
          )
        })
      )
    })
    const root = await section.locator('.diagram-root').boundingBox()
    const category = await section
      .getByRole('link', { name: 'Kategori SMP Produk 2026', exact: true })
      .boundingBox()
    const child = await section
      .getByRole('link', { name: 'Cabang SMP Produk 2026', exact: true })
      .boundingBox()
    assert.ok(category.x >= root.x + root.width)
    assert.ok(child.x >= category.x + category.width)
    assert.ok(
      await section.locator('.node, .diagram-root').evaluateAll((elements) =>
        elements.every((element) => {
          const style = getComputedStyle(element)
          return style.writingMode === 'horizontal-tb' && style.transform === 'none'
        }),
      ),
    )
  }
  await verifyHorizontalLayout()
  await mkdir('output/qa', { recursive: true })
  await section.screenshot({ path: 'output/qa/division-structure-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await verifyHorizontalLayout()
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  assert.ok(
    await section.locator('.diagram-content').evaluate((el) => el.scrollWidth <= el.clientWidth),
  )
  await section.screenshot({ path: 'output/qa/division-structure-mobile.png' })
  await select.selectOption('SMK')
  await section.getByText('Struktur Produk SMK belum tersedia.', { exact: true }).waitFor()
  fail = true
  await select.selectOption('SD')
  await section.getByText('Struktur produk belum dapat dimuat.', { exact: true }).waitFor()
  fail = false
  await section.getByRole('button', { name: 'Coba lagi' }).click()
  await section.getByRole('link', { name: 'Cabang SD Produk 2026', exact: true }).waitFor()
  const catalogRequests = []
  await page.route('**/api/products?**', (route) => {
    const query = new URL(route.request().url()).searchParams
    catalogRequests.push(Object.fromEntries(query))
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        source: 'demo',
        products: [],
        total: 0,
        page: 1,
        pageSize: 15,
        subjectCounts: {},
      }),
    })
  })
  await section.getByRole('link', { name: 'Cabang SD Produk 2026', exact: true }).click()
  await page.getByRole('button', { name: 'Hapus filter struktur', exact: true }).waitFor()
  assert.equal(new URL(page.url()).pathname, '/products')
  assert.equal(new URL(page.url()).searchParams.get('level'), 'SD')
  assert.equal(
    new URL(page.url()).searchParams.get('structure'),
    '22222222-2222-4222-8222-222222222222',
  )
  await page.getByText('Struktur Produk: Kategori SD / Cabang SD', { exact: true }).waitFor()
  assert.ok(
    catalogRequests.some(
      (query) => query.level === 'SD' && query.structure === '22222222-2222-4222-8222-222222222222',
    ),
  )
  assert.equal(
    await page
      .locator('.level-segments')
      .getByRole('button', { name: 'SD', exact: true })
      .getAttribute('aria-pressed'),
    'true',
  )
  await page.getByLabel('Urutkan buku').selectOption('title-asc')
  assert.equal(
    new URL(page.url()).searchParams.get('structure'),
    '22222222-2222-4222-8222-222222222222',
  )
  await page.locator('.level-segments').getByRole('button', { name: 'SMP', exact: true }).click()
  assert.equal(new URL(page.url()).searchParams.has('structure'), false)
  await page.goBack()
  await page.getByRole('button', { name: 'Hapus filter struktur', exact: true }).click()
  assert.equal(new URL(page.url()).searchParams.has('structure'), false)
  assert.equal(new URL(page.url()).searchParams.get('level'), 'SD')
  assert.deepEqual(errors, [])
  console.log(
    'PASS: division diagram/connectors, levels, URL/back, catalog navigation with active structure/level filters, filter removal/level change/sorting, mobile without horizontal scroll, empty state, error/retry. API fixtures; no live mutations.',
  )
} finally {
  await browser.close()
}
