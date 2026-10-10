import { loadEnvFile } from 'node:process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createServerClient } from '@supabase/ssr'

// Local, non-mutating browser proof. Supply an existing Playwright installation;
// this script does not add a browser dependency to the application.
loadEnvFile('.env')
const nativeFetch = globalThis.fetch
globalThis.fetch = (input, init) =>
  nativeFetch(input, { ...init, signal: AbortSignal.timeout(20000) })
const base = 'http://localhost:3000'
const playwrightPath = process.env.PLAYWRIGHT_MODULE_PATH
if (!playwrightPath) throw new Error('PLAYWRIGHT_MODULE_PATH belum ditentukan.')
const { chromium } = await import(pathToFileURL(playwrightPath).href)
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
function check(value, label) {
  if (!value) throw new Error(label)
}
let browser
try {
  const login = await client.auth.signInWithPassword({
    email: process.env.SUPER_ACCOUNT_EDITOR_EMAIL,
    password: process.env.SUPER_ACCOUNT_EDITOR_PASSWORD,
  })
  check(!login.error, 'Login Editor untuk verifikasi gagal.')
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addCookies(
    Array.from(jar, ([name, value]) => ({ name, value, url: base, sameSite: 'Lax' })),
  )
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  let writeAttempts = 0
  await page.route('**/api/admin/books**', async (route) => {
    if (!['GET', 'HEAD'].includes(route.request().method())) {
      writeAttempts++
      await route.abort()
    } else await route.continue()
  })
  const response = await page.goto(`${base}/admin/books/new`, { waitUntil: 'networkidle' })
  check(response.status() === 200, 'Halaman tambah buku gagal dimuat.')
  await page.getByRole('heading', { name: 'Tambah buku', exact: true }).waitFor()
  await page.evaluate(() => document.fonts.ready)
  const desktop = join(tmpdir(), 'kpp-book-create-desktop.png')
  await page.screenshot({ path: desktop, fullPage: true })
  console.log(`SCREENSHOT ${desktop}`)
  console.log(
    'DESKTOP',
    JSON.stringify(
      await page.evaluate(() => {
        const box = (selector) => {
          const rect = document.querySelector(selector).getBoundingClientRect()
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        }
        return {
          main: box('main'),
          columns: box('.form-columns'),
          identity: box('.identity-card'),
          cover: box('.cover-card'),
          coverPreview: box('.cover-preview'),
          footer: box('footer'),
          overflow: document.documentElement.scrollWidth > innerWidth,
          brokenImages: [...document.images].filter((img) => !img.complete || !img.naturalWidth)
            .length,
          icons: [...document.querySelectorAll('img[src*="/images/editor/"]')].map((img) => ({
            src: img.getAttribute('src'),
            width: img.getBoundingClientRect().width,
            height: img.getBoundingClientRect().height,
          })),
        }
      }),
    ),
  )
  check(await page.locator('#new-book-grade').isDisabled(), 'Kelas harus terkunci sebelum jenjang.')
  check(
    await page.locator('#new-book-subject').isDisabled(),
    'Mapel harus terkunci sebelum jenjang.',
  )
  await page.locator('#new-book-level').selectOption('SD')
  await page.locator('#new-book-grade').selectOption('6')
  await page.locator('#new-book-subject').selectOption('Matematika')
  await page.locator('#new-book-level').selectOption('SMP')
  check(
    await page
      .locator('#new-book-grade')
      .evaluate((select) => select.selectedOptions[0]?.disabled === true),
    'Kelas lama tidak direset.',
  )
  check(
    (await page.locator('#new-book-grade option').allTextContents()).some(
      (item) => item.trim() === 'Kelas 7',
    ),
    'Kelas SMP tidak tersedia.',
  )
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: '+ Tambah poin' }).click()
  check(
    await page.getByRole('button', { name: '+ Tambah poin' }).isDisabled(),
    'Batas enam poin gagal.',
  )
  await page.getByRole('button', { name: 'Hapus keunggulan 6', exact: true }).click()
  check((await page.locator('.highlight-row').count()) === 5, 'Hapus poin gagal.')
  await page.locator('#new-book-title').fill('Buku pratinjau UI')
  await page.locator('#new-book-author').fill('Penulis uji')
  await page.locator('#new-book-code').fill('987654321')
  await page.locator('#new-book-year').fill('2026')
  await page.locator('#new-book-grade').selectOption('7')
  await page.locator('#new-book-subject').selectOption('Matematika')
  await page.locator('#new-book-contents').fill('Cakupan materi')
  check(
    (await page.locator('.character-count').nth(1).textContent()).includes('14 / 2.000'),
    'Penghitung isi buku gagal.',
  )
  await page.getByRole('button', { name: 'Simpan buku', exact: true }).click()
  check(
    (await page.locator('.form-alert').textContent()).includes('belum dapat disimpan'),
    'Peringatan kolom pratinjau tidak muncul.',
  )
  check(writeAttempts === 0, 'Pratinjau mencoba menulis ke API buku.')
  await page.locator('#new-book-cover').setInputFiles({
    name: 'bukan-gambar.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('bukan gambar'),
  })
  check(
    (await page.locator('.form-alert').textContent()).includes('maksimal 2 MB'),
    'Validasi sampul gagal.',
  )
  await page.locator('#new-book-cover').setInputFiles({
    name: 'sampul-uji.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=',
      'base64',
    ),
  })
  check(
    (await page.locator('.cover-card .file-name').textContent()) === 'sampul-uji.png',
    'Nama sampul gagal diperbarui.',
  )
  check(await page.locator('.selected-cover').isVisible(), 'Pratinjau sampul tidak tampil.')
  await page.locator('#new-book-flyer').setInputFiles({
    name: 'flyer-uji.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n%%EOF'),
  })
  check(
    (await page.locator('.material-upload .file-name').first().textContent()) === 'flyer-uji.pdf',
    'Nama materi gagal diperbarui.',
  )
  await page.locator('#new-book-contents').fill('')
  await page.setViewportSize({ width: 390, height: 844 })
  const mobile = join(tmpdir(), 'kpp-book-create-mobile.png')
  await page.screenshot({ path: mobile, fullPage: true })
  console.log(`SCREENSHOT ${mobile}`)
  check(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'Overflow horizontal pada mobile.',
  )
  check(errors.length === 0, 'Browser mengalami error JavaScript.')
  const anonymous = await browser.newContext()
  const anonPage = await anonymous.newPage()
  await anonPage.goto(`${base}/admin/books/new`, { waitUntil: 'networkidle' })
  check(new URL(anonPage.url()).pathname === '/login', 'Pengunjung anonim tidak diarahkan login.')
  console.log(
    'PASS Editor SSR, desktop/mobile, scope dropdown, enam poin, counter, upload preview, no database writes, anonymous login redirect',
  )
  const productsResponse = await fetch(`${base}/api/products`)
  check(productsResponse.ok, 'API katalog gagal.')
  const products = await productsResponse.json()
  const slug = products.products[0]?.slug
  check(slug, 'Produk untuk smoke test tidak tersedia.')
  for (const path of [
    '/',
    '/products',
    `/products/${slug}`,
    '/api/products?q=Matematika',
    `/api/products/${slug}`,
    '/healthz',
  ]) {
    const result = await fetch(`${base}${path}`)
    check(result.ok, `Smoke ${path}: ${result.status}`)
  }
  check(
    (await fetch(`${base}/products/buku-tidak-ada-ui-check`)).status === 404,
    'Missing-product bukan 404.',
  )
  console.log('PASS katalog, detail, pencarian API, missing-product 404, healthz')
} catch (error) {
  // Do not print SDK/browser error details that may contain credentials or session values.
  console.error(error instanceof Error ? error.message.split('\n')[0] : 'Verifikasi UI gagal.')
  process.exitCode = 1
} finally {
  await browser?.close()
  await client.auth.signOut({ scope: 'local' }).catch(() => {})
}
