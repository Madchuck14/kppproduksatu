import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { defaultContactPage } from '../shared/schemas/contact-page.ts'
import { defaultLandingHero } from '../shared/schemas/landing-hero.ts'

// Browser-only fixtures: no credentials, live admin reads, or database mutations.
if (!process.env.PLAYWRIGHT_MODULE_PATH) throw new Error('PLAYWRIGHT_MODULE_PATH belum ditentukan.')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href)
const base = process.env.DASHBOARD_TEST_BASE_URL ?? 'http://localhost:3000'
const account = {
  id: '22222222-2222-4222-8222-222222222222',
  role: 'editor',
  isSuper: true,
  educationLevels: ['SD', 'SMP', 'SMA', 'SMK'],
}
const books = [
  ['Matematika Berpikir Logis', 'SMP', 'Matematika'],
  ['Berpikir Komputasional', 'SMP', 'Informatika'],
  ['Informatika untuk SMA', 'SMA', 'Informatika'],
  ['Pathway to English', 'SMA', 'Bahasa Inggris'],
  ['Gemar Berhitung', 'SD', 'Matematika'],
  ['Grow with English 2', 'SD', 'Bahasa Inggris'],
].map(([title, educationLevel, subject], index) => ({
  id: `22222222-2222-4222-8222-22222222222${index}`,
  title,
  educationLevel,
  subject,
  bookCode: `1234000${index}`,
  imageUrl: '/images/erlangga.png',
  price: 80000,
  published: index !== 4,
  featured: index < 2,
  resources: { flyer: true, dummy: index % 2 === 0, productKnowledge: true },
}))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
  page.setDefaultTimeout(20000)
  const errors = []
  const mutations = []
  let contact = structuredClone(defaultContactPage)
  let selectedIds = [books[0].id]
  let hero = { ...defaultLandingHero }
  const classifications = []
  let failContact = true
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/api/admin/**', (route) => {
    const path = new URL(route.request().url()).pathname
    const method = route.request().method()
    if (method !== 'GET') mutations.push({ path, method, body: route.request().postDataJSON() })
    if (path.endsWith('/editor-session')) return route.fulfill({ json: account })
    if (path.endsWith('/classifications')) {
      const body = route.request().postDataJSON()
      classifications.push({ ...body, code: body.name, education_level: '' })
      return route.fulfill({ json: classifications.at(-1) })
    }
    if (path.endsWith('/contact')) {
      if (method === 'PUT') {
        if (failContact) {
          failContact = false
          return route.fulfill({ status: 503, json: { statusMessage: 'Fixture: coba lagi.' } })
        }
        contact = route.request().postDataJSON()
      }
      return route.fulfill({ json: contact })
    }
    if (path.endsWith('/featured-books')) {
      if (method === 'PUT') {
        const body = route.request().postDataJSON()
        selectedIds = body.bookIds
        hero = body.hero
        return route.fulfill({ json: { saved: true } })
      }
      return route.fulfill({
        json: {
          books,
          hero,
          selectedIds,
          selectedCount: selectedIds.length,
          total: 6,
          page: 1,
          pageSize: 12,
        },
      })
    }
    if (path.endsWith('/product-structure')) return route.fulfill({ json: [] })
    if (path.endsWith('/books'))
      return route.fulfill({
        json: {
          account,
          books,
          total: 14,
          pageSize: 6,
          stats: { total: 14, published: 12, draft: 2, incomplete: 0 },
        },
      })
    return route.fulfill({ status: 503, json: { statusMessage: 'Fixture unavailable' } })
  })
  await page.route('**/api/catalog/classifications', (route) =>
    route.fulfill({ json: classifications }),
  )
  await page.goto(base + '/login')
  await page.waitForFunction(() => !!document.querySelector('#__nuxt')?.__vue_app__)
  await page.evaluate(() =>
    document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$router.push('/admin'),
  )
  await page.getByRole('heading', { name: 'Dashboard Editor', exact: true }).waitFor()
  await page.locator('.dashboard-table tbody tr').first().waitFor()
  assert.equal(await page.locator('.dashboard-table tbody tr').count(), 6)
  const sidebar = await page.locator('.dashboard-sidebar').boundingBox()
  const content = await page.locator('.dashboard-content').boundingBox()
  assert.equal(sidebar.width, 248)
  assert.equal(content.x - sidebar.x - sidebar.width, 24)
  await mkdir('output/dashboard', { recursive: true })
  await page.screenshot({ path: 'output/dashboard/desktop.png', fullPage: true })
  const sidebarHandle = await page.locator('.dashboard-sidebar').elementHandle()
  const menu = page.getByRole('navigation', { name: 'Menu pengelolaan' })
  const pages = [
    ['Edit Klasifikasi Buku', '/admin/klasifikasi', '.classification-page'],
    ['Atur Halaman Kontak', '/admin/kontak', '.contact-page'],
    ['Kelola Struktur Produk', '/admin/struktur-produk', '.structure-manager'],
    ['Atur Buku Pilihan', '/admin/buku-pilihan', '.featured-page'],
  ]
  for (const [label, path, selector] of pages) {
    await menu.getByRole('link', { name: label, exact: true }).click()
    await page.waitForURL(base + path)
    await page.locator(selector).waitFor()
    assert.equal(await menu.locator('[aria-current="page"]').innerText(), label)
    assert.equal(await page.locator('dialog[open]').count(), 0)
    assert.ok(
      await sidebarHandle.evaluate((node) => node.isConnected),
      'Sidebar persists between pages',
    )
    if (path.endsWith('/klasifikasi')) {
      await page.locator('#classification-name').fill('Fixture Kurikulum')
      await page.getByRole('button', { name: 'Tambah kurikulum', exact: true }).click()
      await page.getByText('Kurikulum berhasil ditambahkan.', { exact: true }).waitFor()
    }
    if (path.endsWith('/kontak')) {
      await page.locator('#contact-heading').fill('Fixture judul kontak')
      await page.getByRole('button', { name: 'Simpan perubahan', exact: true }).click()
      await page.getByText('Fixture: coba lagi.', { exact: true }).waitFor()
      assert.equal(await page.locator('#contact-heading').inputValue(), 'Fixture judul kontak')
      await page.getByRole('button', { name: 'Simpan perubahan', exact: true }).click()
      await page.getByText('Halaman Kontak berhasil diperbarui.', { exact: true }).waitFor()
    }
    if (path.endsWith('/buku-pilihan')) {
      await page.locator('#hero-heading').fill('Fixture hero baru')
      await page.locator('.featured-book-option input').nth(1).check()
      await page.getByRole('button', { name: 'Simpan pilihan', exact: true }).click()
      await page
        .getByText('Buku pilihan dan teks hero berhasil diperbarui.', { exact: true })
        .waitFor()
      assert.deepEqual(selectedIds, [books[0].id, books[1].id])
      assert.equal(hero.heading, 'Fixture hero baru')
    }
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${path} has no overflow at ${width}px`,
      )
      await page.screenshot({
        path: `output/dashboard/${path.split('/').at(-1)}-${width}.png`,
        fullPage: true,
      })
    }
    await page.setViewportSize({ width: 1440, height: 1100 })
  }
  await page.goBack()
  await page.locator('.structure-manager').waitFor()
  await menu.getByRole('link', { name: 'Kelola Buku', exact: true }).click()
  await page.locator('#editor-search').waitFor()
  await page.locator('#editor-search').fill('Matematika')
  await page.getByRole('button', { name: 'Terapkan', exact: true }).click()
  await page.waitForURL('**/admin?q=Matematika')
  await page.getByRole('button', { name: 'Berikutnya', exact: true }).click()
  await page.waitForURL('**/admin?q=Matematika&page=2')
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `No horizontal page overflow at ${width}px`,
    )
    await page.screenshot({ path: `output/dashboard/${width}.png`, fullPage: true })
  }
  account.isSuper = false
  account.educationLevels = ['SD']
  await page.evaluate(() =>
    document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$router.push('/login'),
  )
  await page.waitForURL(base + '/login')
  await page.evaluate(() =>
    document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$router.push('/admin'),
  )
  await page.locator('.dashboard-sidebar').waitFor()
  assert.equal(await page.locator('.dashboard-management > a').count(), 1)
  assert.deepEqual(errors, [])
  assert.equal(mutations.length, 4)
  await assert.rejects(
    page.evaluate(() =>
      document
        .querySelector('#__nuxt')
        .__vue_app__.config.globalProperties.$router.push('/admin/kontak'),
    ),
    /Halaman ini hanya dapat diakses oleh Editor super/,
  )
  console.log(
    'PASS: persistent sidebar, four management pages, active links, Back, fixture saves/retry, desktop/mobile, search/pagination, scoped Editor denial',
  )
} finally {
  await browser.close()
}
