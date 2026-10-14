import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Real generated PPTX, actual renderer. All material requests are intercepted locally.
for (const key of ['PLAYWRIGHT_MODULE_PATH', 'PPTXGENJS_MODULE_PATH'])
  if (!process.env[key]) throw new Error(`${key} belum ditentukan.`)
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href)
const { default: PptxGenJS } = await import(pathToFileURL(process.env.PPTXGENJS_MODULE_PATH).href)
const deck = new PptxGenJS()
deck.layout = 'LAYOUT_WIDE'
const first = deck.addSlide()
first.addText('PPT Produk Uji', {
  x: 1,
  y: 1,
  w: 10,
  h: 1,
  fontSize: 32,
  color: '1F5C3F',
  fontFace: 'Arial',
})
first.addImage({
  data: 'image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=',
  x: 1,
  y: 3,
  w: 1,
  h: 1,
})
const second = deck.addSlide()
second.addText('Slide Kedua', { x: 1, y: 1, w: 10, h: 1, fontSize: 28, fontFace: 'Arial' })
second.addTable(
  [
    ['Jenjang', 'Jumlah'],
    ['SD', '12'],
    ['SMP', '8'],
  ],
  { x: 1, y: 2.5, w: 8, h: 2, fontFace: 'Arial' },
)
const third = deck.addSlide()
third.addText('Grafik Buku', { x: 1, y: 0.5, w: 10, h: 1, fontSize: 28, fontFace: 'Arial' })
third.addChart(deck.ChartType.bar, [{ name: 'Buku', labels: ['SD', 'SMP'], values: [12, 8] }], {
  x: 1,
  y: 2,
  w: 8,
  h: 3,
})
const bytes = await deck.write({ outputType: 'nodebuffer' })
const base = process.env.PRESENTATION_TEST_BASE_URL ?? 'http://localhost:3100'
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
})
try {
  const page = await browser.newPage()
  const remoteRequests = []
  let dummyFetches = 0
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== new URL(base).origin) {
      remoteRequests.push(url.origin)
      return route.abort()
    }
    if (url.pathname.endsWith('/resources'))
      return route.fulfill({
        json: {
          flyer: true,
          flyerFormat: 'pdf',
          dummy: true,
          productKnowledge: true,
          presentationFormat: 'pptx',
          productKnowledgeFormat: 'PPTX',
        },
      })
    if (url.pathname.endsWith('/resources/product-knowledge'))
      return route.fulfill({
        json: {
          url: `${base}/__test-deck.pptx`,
          format: 'pptx',
        },
      })
    if (url.pathname === '/__test-deck.pptx')
      return route.fulfill({
        contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        body: bytes,
      })
    if (url.pathname.endsWith('/resources/dummy')) dummyFetches += 1
    return route.continue()
  })
  await page.addInitScript(() => {
    window.__drawnText = []
    const native = CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
      window.__drawnText.push(String(text))
      return native.call(this, text, ...args)
    }
  })
  const catalog = await (await fetch(`${base}/api/products`)).json()
  const slug = catalog.products[0].slug
  await page.goto(`${base}/products`, { waitUntil: 'networkidle' })
  await page.evaluate(
    (slug) =>
      document
        .querySelector('#__nuxt')
        .__vue_app__.config.globalProperties.$router.push(`/products/${slug}`),
    slug,
  )
  await page.getByRole('button', { name: 'Lihat: PPT Produk', exact: true }).waitFor()
  assert.equal(
    await page.getByRole('button', { name: 'Lihat: File Dummy Buku', exact: true }).count(),
    0,
  )
  assert.ok(
    await page
      .getByRole('link', { name: 'Login untuk membuka Dummy Buku', exact: true })
      .isVisible(),
  )
  assert.equal(
    new URL(await page.locator('#dummy a').getAttribute('href'), base).searchParams.get('returnTo'),
    `/products/${slug}#dummy`,
  )
  await page.getByRole('button', { name: 'Lihat: PPT Produk', exact: true }).click()
  await page.waitForFunction(
    () =>
      document.querySelector('.viewer-controls [aria-live]')?.textContent.replace(/\s/g, '') ===
      '1/3',
    { timeout: 60000 },
  )
  const text = await page.evaluate(() => window.__drawnText.join('').replace(/\s/g, ''))
  assert.ok(text.includes('PPTProdukUji'), 'First slide text actually rendered to canvas')
  await page.getByRole('button', { name: 'Berikutnya', exact: true }).click()
  await page.waitForFunction(
    () =>
      document.querySelector('.viewer-controls [aria-live]')?.textContent.replace(/\s/g, '') ===
      '2/3',
  )
  assert.ok((await page.evaluate(() => window.__drawnText.join(''))).includes('Slide Kedua'))
  await page.getByRole('button', { name: 'Berikutnya', exact: true }).click()
  await page.waitForFunction(
    () =>
      document.querySelector('.viewer-controls [aria-live]')?.textContent.replace(/\s/g, '') ===
      '3/3',
  )
  await page.getByRole('button', { name: 'Perbesar slide', exact: true }).click()
  assert.ok(await page.getByText('125%', { exact: true }).isVisible())
  await page.screenshot({ path: join(tmpdir(), 'kpp-pptx-viewer-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.powerpoint-viewer canvas')
    if (!canvas || canvas.getBoundingClientRect().width >= 600) return false
    if (document.querySelector('.slide-viewport')?.getAttribute('aria-busy') !== 'false')
      return false
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    // The fixture's red bars prove the chart finished drawing after responsive resize.
    for (let i = 0; i < pixels.length; i += 4)
      if (
        pixels[i] > 120 &&
        pixels[i + 1] < 140 &&
        pixels[i + 2] < 140 &&
        pixels[i] > pixels[i + 1] * 1.3
      )
        return true
    return false
  })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await page.screenshot({ path: join(tmpdir(), 'kpp-pptx-viewer-mobile.png'), fullPage: true })
  await page.getByRole('button', { name: 'Tutup', exact: true }).click()
  assert.equal(await page.locator('.powerpoint-viewer').count(), 0)
  await page.getByRole('button', { name: 'Lihat: PPT Produk', exact: true }).click()
  await page.waitForFunction(
    () =>
      document.querySelector('.viewer-controls [aria-live]')?.textContent.replace(/\s/g, '') ===
      '1/3',
  )
  assert.equal(dummyFetches, 0, 'Anonymous browser never requests Dummy content')
  assert.deepEqual(remoteRequests, [], 'No Microsoft, CDN, or conversion service requests')
  console.log(
    'PASS: real PPTX with text/image/table/chart, original-file fetch, anonymous preview, Dummy login link, slide navigation, zoom, desktop/mobile, close/reopen, and no external viewer/CDN requests.',
  )
  console.log(
    'Material data is intercepted; this does not verify live Supabase or client presentation fidelity.',
  )
} finally {
  await browser.close()
}
