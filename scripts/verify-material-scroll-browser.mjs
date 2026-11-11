import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdir } from 'node:fs/promises'

if (!process.env.PLAYWRIGHT_MODULE_PATH) throw new Error('PLAYWRIGHT_MODULE_PATH belum ditentukan.')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href)
const base = 'http://localhost:3000'
const catalog = await (await fetch(`${base}/api/products`)).json()
const book = catalog.products[0]
assert.ok(book, 'Requires a published book for read-only local browser proof')
// Three-page PDF fixture generated in memory. No files or live materials are uploaded.
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>',
]
for (let index = 0; index < 3; index++) {
  const content = `BT /F1 24 Tf 50 740 Td (Preview page ${index + 1}) Tj ET`
  objects.push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 9 0 R >> >> /Contents ${4 + index * 2} 0 R >>`,
  )
  objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`)
}
objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
let pdf = '%PDF-1.4\n'
const offsets = [0]
for (const [index, object] of objects.entries()) {
  offsets.push(Buffer.byteLength(pdf))
  pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
}
const xref = Buffer.byteLength(pdf)
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
pdf += offsets
  .slice(1)
  .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
  .join('')
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(30000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/api/products/*/access', (route) =>
    route.fulfill({ json: { recorded: false } }),
  )
  await page.route('**/api/products/*/resources', (route) =>
    route.fulfill({
      json: {
        flyer: true,
        flyerFormat: 'pdf',
        dummy: true,
        productKnowledge: true,
        productKnowledgePreview: true,
        productKnowledgeFormat: 'PPTX',
      },
    }),
  )
  await page.route('**/api/products/*/resources/*?preview=1', (route) =>
    route.fulfill({ json: { url: `${base}/__viewer-test__/material.pdf` } }),
  )
  await page.route('**/__viewer-test__/material.pdf', (route) =>
    route.fulfill({ contentType: 'application/pdf', body: Buffer.from(pdf) }),
  )
  const userId = '22222222-2222-4222-8222-222222222222'
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, role: 'authenticated', aud: 'authenticated', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 })}.fixture`
  const user = {
    id: userId,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'fixture@nip.invalid',
    app_metadata: { provider: 'email' },
    user_metadata: {},
    identities: [],
    created_at: new Date().toISOString(),
  }
  const account = {
    id: userId,
    nip: '000123',
    role: 'sales',
    isSuper: false,
    educationLevels: [],
    salesAreas: [],
  }
  await page.route('**/auth/v1/**', (route) => route.fulfill({ json: user }))
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({ json: { access_token: token, refresh_token: 'fixture-refresh' } }),
  )
  await page.route('**/api/auth/session', (route) => route.fulfill({ json: account }))
  await page.route('**/api/favorites**', (route) =>
    route.fulfill({
      json: { ownerId: userId, ids: [], products: [], total: 0, page: 1, pageSize: 24 },
    }),
  )
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => Boolean(document.querySelector('#__nuxt')?.__vue_app__))
  await page.evaluate(
    (identifier) =>
      document
        .querySelector('#__nuxt')
        .__vue_app__.config.globalProperties.$router.push(`/products/${identifier}`),
    book.bookCode || book.slug,
  )
  const cards = page.locator('.resource-card')
  await cards.first().waitFor()
  assert.equal(
    await page.getByRole('link', { name: /Login untuk melihat materi promosi:/ }).count(),
    3,
  )
  assert.equal(await page.getByRole('button', { name: /^Lihat:/ }).count(), 0)
  assert.equal(await page.locator('.resource-card a[href*="download=1"]').count(), 0)
  await mkdir('.data/materials-qa', { recursive: true })
  await page.locator('.detail-resources').screenshot({ path: '.data/materials-qa/locked.png' })
  for (const kind of ['dummy', 'product-knowledge', 'flyer']) {
    const link = page
      .locator(`#${kind}`)
      .getByRole('link', { name: /Login untuk melihat materi promosi:/ })
    const destination = new URL(await link.getAttribute('href'), base)
    assert.equal(destination.pathname, '/login')
    assert.equal(
      destination.searchParams.get('returnTo'),
      `/products/${book.bookCode || book.slug}#${kind}`,
    )
  }
  await page
    .locator('#dummy')
    .getByRole('link', { name: /Login untuk melihat materi promosi:/ })
    .click()
  await page.locator('#nip').fill('000123')
  await page.locator('#password').fill('FixturePassword123!')
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  await page.waitForURL(`${base}/products/${book.bookCode || book.slug}#dummy`)
  await page.getByRole('button', { name: 'Lihat: File Dummy Buku', exact: true }).waitFor()
  assert.equal(
    await page.getByRole('link', { name: /Login untuk melihat materi promosi:/ }).count(),
    0,
  )
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
    for (const title of ['Flyer', 'PPT Produk']) {
      await page.getByRole('button', { name: `Lihat: ${title}`, exact: true }).click()
      const dialog = page.getByRole('dialog', { name: `Penampil ${title}`, exact: true })
      const pages = dialog.getByRole('region', { name: 'Halaman PDF' })
      await pages.locator('canvas').nth(2).waitFor()
      await dialog.getByText('Memuat PDF...', { exact: true }).waitFor({ state: 'hidden' })
      assert.equal(await pages.locator('canvas').count(), 3)
      assert.equal(await dialog.locator('.dummy-toolbar').count(), 1)
      assert.match(await dialog.locator('.dummy-filename').innerText(), /\.pdf$/)
      assert.equal(await dialog.locator('.flipbook-stage').count(), 0)
      assert.equal(
        await pages.evaluate((element) => element.scrollHeight > element.clientHeight),
        true,
      )
      await pages.evaluate((element) => {
        element.scrollTop = element.scrollHeight
      })
      assert.ok(await pages.evaluate((element) => element.scrollTop > 0))
      assert.equal(
        await pages.evaluate((element) => element.scrollWidth <= element.clientWidth),
        true,
      )
      const initialWidth = await pages
        .locator('canvas')
        .first()
        .evaluate((canvas) => canvas.getBoundingClientRect().width)
      await dialog.getByRole('button', { name: 'Perbesar', exact: true }).click()
      assert.equal(
        await dialog.getByRole('combobox', { name: 'Persentase perbesaran' }).inputValue(),
        '125',
      )
      assert.ok(
        await pages
          .locator('canvas')
          .first()
          .evaluate(
            (canvas, initialWidth) => canvas.getBoundingClientRect().width > initialWidth,
            initialWidth,
          ),
      )
      await dialog.getByRole('combobox', { name: 'Persentase perbesaran' }).selectOption('50')
      assert.equal(
        await dialog.getByRole('button', { name: 'Perkecil', exact: true }).isDisabled(),
        true,
      )
      await dialog.getByRole('combobox', { name: 'Persentase perbesaran' }).selectOption('200')
      assert.equal(
        await dialog.getByRole('button', { name: 'Perbesar', exact: true }).isDisabled(),
        true,
      )
      await dialog.getByRole('combobox', { name: 'Persentase perbesaran' }).selectOption('100')
      assert.ok(
        (
          await dialog.getByRole('link', { name: 'Unduh', exact: true }).getAttribute('href')
        ).endsWith('?download=1'),
      )
      if (title === 'Flyer')
        await page.screenshot({ path: join(tmpdir(), `kpp-material-scroll-${width}.png`) })
      if (title === 'Flyer')
        await dialog.getByRole('button', { name: `Tutup pratinjau ${title}`, exact: true }).click()
      else await page.keyboard.press('Escape')
      await dialog.waitFor({ state: 'hidden' })
    }
  }
  assert.equal(await page.getByRole('link', { name: 'Login untuk membuka Dummy Buku' }).count(), 0)
  await page.getByRole('button', { name: 'Lihat: File Dummy Buku', exact: true }).click()
  const dummy = page.getByRole('dialog', { name: 'Penampil File Dummy Buku', exact: true })
  await dummy.locator('.dummy-pagination').waitFor()
  assert.equal(await dummy.locator('.dummy-toolbar').count(), 1)
  assert.equal(await dummy.locator('.flipbook-stage').count(), 1)
  await dummy.getByRole('button', { name: 'Perbesar', exact: true }).click()
  assert.equal(
    await dummy.getByRole('combobox', { name: 'Persentase perbesaran' }).inputValue(),
    '125',
  )
  await dummy.getByRole('button', { name: 'Berikutnya', exact: true }).click()
  await page.waitForFunction(() =>
    document.querySelector('.dummy-pagination p')?.textContent?.includes('2'),
  )
  await dummy.getByRole('button', { name: 'Tutup pratinjau File Dummy Buku', exact: true }).click()
  await dummy.waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: 'Keluar', exact: true }).click()
  await page.waitForURL(base + '/')
  await page.evaluate(
    (identifier) =>
      document
        .querySelector('#__nuxt')
        .__vue_app__.config.globalProperties.$router.push(`/products/${identifier}`),
    book.bookCode || book.slug,
  )
  await page
    .getByRole('link', { name: /Login untuk melihat materi promosi:/ })
    .first()
    .waitFor()
  assert.equal(
    await page.getByRole('link', { name: /Login untuk melihat materi promosi:/ }).count(),
    3,
  )
  assert.equal(await page.getByRole('button', { name: /^Lihat:/ }).count(), 0)
  assert.deepEqual(errors, [])
  console.log(
    'PASS: shared header, filename, zoom 50â€“200%, download/close/Escape, Flyer/PPT scroll on desktop/mobile, authenticated Dummy flipbook/zoom/page turn; three anonymous login buttons and preserved material destination. Fixture PDFs; no live catalog writes.',
  )
} finally {
  await browser.close()
}
