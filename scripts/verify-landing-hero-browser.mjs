import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href)
const base = process.env.HERO_TEST_BASE_URL ?? 'http://localhost:3000'
const account = {
  id: '11111111-1111-4111-8111-111111111111',
  role: 'editor',
  isSuper: false,
  educationLevels: ['SD'],
  email: 'editor@example.test',
}
let hero = { heading: 'Heading tersimpan', body: 'Isi tersimpan' }
let writes = 0
let failSave = false
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin !== new URL(base).origin) return route.abort()
    if (url.pathname === '/api/admin/editor-session') return route.fulfill({ json: account })
    if (url.pathname === '/api/catalog/classifications') return route.fulfill({ json: [] })
    if (url.pathname === '/api/catalog/hero') return route.fulfill({ json: hero })
    if (url.pathname === '/api/products')
      return route.fulfill({ json: { products: [], source: 'demo' } })
    if (url.pathname === '/api/catalog/level-counts')
      return route.fulfill({ json: { SD: 0, SMP: 0, SMA: 0, SMK: 0 } })
    if (url.pathname === '/api/admin/books')
      return route.fulfill({
        json: {
          account,
          books: [],
          total: 0,
          page: 1,
          pageSize: 12,
          stats: { total: 0, published: 0, draft: 0, incomplete: 0 },
        },
      })
    if (url.pathname === '/api/admin/featured-books') {
      if (request.method() === 'PUT') {
        writes += 1
        if (failSave)
          return route.fulfill({ status: 503, json: { statusMessage: 'Layanan sementara gagal.' } })
        assert.deepEqual(request.postDataJSON().bookIds, [])
        hero = request.postDataJSON().hero
        return route.fulfill({ json: { selectedCount: 0 } })
      }
      return route.fulfill({
        json: {
          hero,
          books: [],
          selectedIds: [],
          selectedCount: 0,
          total: 0,
          page: 1,
          pageSize: 12,
        },
      })
    }
    if (url.pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) {
      throw new Error(`Unexpected mutation: ${url.pathname}`)
    }
    return route.continue()
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
  await page.goto(`${base}/login`)
  await page.waitForFunction(() => document.querySelector('#__nuxt')?.__vue_app__)
  await navigate('/admin')
  assert.equal(
    await page.getByRole('button', { name: 'Atur Buku Pilihan', exact: true }).count(),
    0,
  )
  account.isSuper = true
  await navigate('/login')
  await navigate('/admin')
  await page.getByRole('button', { name: 'Atur Buku Pilihan', exact: true }).click()
  await page.locator('#hero-heading').waitFor()
  await page.waitForFunction(
    () => document.querySelector('#hero-heading')?.value === 'Heading tersimpan',
  )
  const save = page.getByRole('button', { name: 'Simpan pilihan', exact: true })
  assert.equal(await save.isDisabled(), true)
  await page.locator('#hero-heading').fill('   ')
  await save.click()
  await page.getByText('Heading hero wajib diisi.', { exact: true }).waitFor()
  assert.equal(writes, 0)
  await page.locator('#hero-heading').fill('Heading dibatalkan')
  await page.getByRole('button', { name: 'Batal', exact: true }).click()
  await page.getByRole('button', { name: 'Atur Buku Pilihan', exact: true }).click()
  await page.waitForFunction(
    () => document.querySelector('#hero-heading')?.value === 'Heading tersimpan',
  )
  await page.locator('#hero-heading').fill('Buku untuk Setiap Langkah Belajar')
  await page
    .locator('#hero-body')
    .fill('Temukan koleksi pilihan untuk siswa dan guru.\nBelajar bersama Erlangga.')
  failSave = true
  await save.click()
  await page.getByText('Layanan sementara gagal.', { exact: true }).waitFor()
  assert.equal(
    await page.locator('#hero-heading').inputValue(),
    'Buku untuk Setiap Langkah Belajar',
  )
  failSave = false
  await save.click()
  await page
    .getByText('Buku pilihan dan teks hero berhasil diperbarui.', { exact: true })
    .first()
    .waitFor()
  assert.equal(writes, 2)
  await navigate('/')
  await page.getByRole('heading', { name: hero.heading, exact: true }).waitFor()
  assert.equal(await page.locator('.hero-content p').textContent(), hero.body)
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    )
    const path = join(tmpdir(), `kpp-landing-hero-${width}.png`)
    await page.screenshot({ path, fullPage: true })
    console.log(`SCREENSHOT ${path}`)
  }
  assert.deepEqual(errors, [])
  console.log(
    'PASS: modal loads copy; text-only changes save; cancel and failed save preserve state; validation; landing reflects saved copy; desktop/mobile. Port 3000, all mutations intercepted.',
  )
} finally {
  await browser.close()
}
