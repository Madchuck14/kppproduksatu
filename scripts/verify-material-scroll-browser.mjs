import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadEnvFile } from 'node:process'
import { createServerClient } from '@supabase/ssr'

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
let authClient
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
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' })
  await page.evaluate(
    (identifier) =>
      document
        .querySelector('#__nuxt')
        .__vue_app__.config.globalProperties.$router.push(`/products/${identifier}`),
    book.bookCode || book.slug,
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
  await page.getByRole('link', { name: 'Login untuk membuka Dummy Buku', exact: true }).click()
  await page.waitForURL(/\/login\?returnTo=/)
  // Verify the shared header also preserves the authenticated Dummy flipbook.
  loadEnvFile('.env')
  const jar = new Map()
  authClient = createServerClient(
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
  const login = await authClient.auth.signInWithPassword({
    email: process.env.SUPER_ACCOUNT_EDITOR_EMAIL,
    password: process.env.SUPER_ACCOUNT_EDITOR_PASSWORD,
  })
  assert.equal(login.error, null, 'Existing Editor login required for Dummy regression check')
  await page
    .context()
    .addCookies(Array.from(jar, ([name, value]) => ({ name, value, url: base, sameSite: 'Lax' })))
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' })
  await page.evaluate(
    (identifier) =>
      document
        .querySelector('#__nuxt')
        .__vue_app__.config.globalProperties.$router.push(`/products/${identifier}`),
    book.bookCode || book.slug,
  )
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
  assert.deepEqual(errors, [])
  console.log(
    'PASS: shared header, filename, zoom 50–200%, download/close/Escape, Flyer/PPT scroll on desktop/mobile, anonymous Dummy login, authenticated Dummy flipbook/zoom/page turn. Fixture PDFs; no live catalog writes.',
  )
} finally {
  await browser.close()
  await authClient?.auth.signOut({ scope: 'local' })
}
