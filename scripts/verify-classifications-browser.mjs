import assert from 'node:assert/strict'
import { loadEnvFile } from 'node:process'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServerClient } from '@supabase/ssr'

// Real session/read-only routes; every classification mutation uses labelled fixtures.
loadEnvFile('.env')
if (!process.env.PLAYWRIGHT_MODULE_PATH) throw new Error('PLAYWRIGHT_MODULE_PATH belum ditentukan.')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href)
const base = 'http://localhost:3000'
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
assert.equal(login.error, null, 'Existing Editor login required for local browser proof')
const options = [
  {
    kind: 'subject',
    code: 'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)',
    name: 'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)',
    education_level: 'SD',
  },
  ...[
    ['sd-1-mipa', 'SD 1 MIPA'],
    ['sd-2-ips-bhs', 'SD 2 IPS BHS'],
    ['smp-sma-mipa', 'SMP/SMA MIPA'],
    ['smk', 'SMK'],
    ['phibeta', 'PHIBETA'],
    ['intelecto', 'INTELECTO'],
  ].map(([code, name]) => ({ kind: 'division', code, name, education_level: '' })),
  ...['SD', 'SMP', 'SMA', 'SMK'].map((level) => ({
    kind: 'subject',
    code: 'Matematika',
    name: 'Matematika',
    education_level: level,
  })),
]
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addCookies(
    Array.from(jar, ([name, value]) => ({ name, value, url: base, sameSite: 'Lax' })),
  )
  const page = await context.newPage()
  page.setDefaultTimeout(30000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/api/catalog/classifications', (route) => route.fulfill({ json: options }))
  let blockCurriculumDelete = true
  await page.route('**/api/admin/classifications', async (route) => {
    if (route.request().method() === 'DELETE') {
      const body = route.request().postDataJSON()
      if (body.kind === 'curriculum' && blockCurriculumDelete) {
        blockCurriculumDelete = false
        await route.fulfill({
          status: 409,
          json: { statusMessage: 'Klasifikasi masih dipakai buku.' },
        })
        return
      }
      const index = options.findIndex(
        (item) =>
          item.kind === body.kind &&
          item.code === body.code &&
          item.education_level === body.educationLevel,
      )
      assert.ok(index >= 0)
      options.splice(index, 1)
      await route.fulfill({ json: { deleted: true } })
      return
    }
    assert.equal(route.request().method(), 'POST')
    const body = route.request().postDataJSON()
    if (
      options.some(
        (item) =>
          item.kind === body.kind &&
          item.name.toLowerCase() === body.name.toLowerCase() &&
          item.education_level === (body.educationLevel ?? ''),
      )
    ) {
      await route.fulfill({ status: 409, json: { statusMessage: 'Klasifikasi sudah tersedia.' } })
      return
    }
    options.push({
      kind: body.kind,
      code: body.kind === 'division' ? 'divisi-uji-browser' : body.name,
      name: body.name,
      education_level: body.educationLevel ?? '',
    })
    await route.fulfill({ status: 201, json: { saved: true } })
  })
  await page.route('**/api/admin/books**', (route) =>
    ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort(),
  )
  await page.route('**/api/catalog/browse?*', (route) =>
    route.fulfill({
      json: {
        source: 'supabase',
        groups: options
          .filter((item) => item.kind === 'division')
          .map((item) => ({ code: item.code, total: 0, products: [] })),
      },
    }),
  )
  const response = await page.goto(`${base}/admin`, { waitUntil: 'networkidle' })
  assert.equal(response.status(), 200)
  await page.getByRole('button', { name: 'Edit Klasifikasi Buku', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit Klasifikasi Buku' })
  await dialog.waitFor()
  await page
    .getByRole('button', { name: 'Tambah kurikulum', exact: true })
    .waitFor({ state: 'visible' })
  await page.locator('#classification-name').fill('Kurikulum Uji Browser')
  await page.getByRole('button', { name: 'Tambah kurikulum', exact: true }).click()
  await dialog.getByRole('status').filter({ hasText: 'Kurikulum berhasil ditambahkan.' }).waitFor()
  await page.locator('#classification-kind').selectOption('division')
  await page.locator('#classification-name').fill('Divisi Uji Browser')
  await page.getByRole('button', { name: 'Tambah divisi', exact: true }).click()
  await dialog.getByRole('status').filter({ hasText: 'Divisi berhasil ditambahkan.' }).waitFor()
  await page.locator('#classification-name').fill('Divisi Uji Browser')
  await page.getByRole('button', { name: 'Tambah divisi', exact: true }).click()
  await dialog.getByRole('alert').filter({ hasText: 'Klasifikasi sudah tersedia.' }).waitFor()
  await page.locator('#classification-kind').selectOption('subject')
  await page.locator('#classification-level').selectOption('SD')
  await page.locator('#classification-name').fill('Mapel Uji Browser')
  await page.getByRole('button', { name: 'Tambah mata pelajaran', exact: true }).click()
  await dialog
    .getByRole('status')
    .filter({ hasText: 'Mata pelajaran berhasil ditambahkan.' })
    .waitFor()
  await page.screenshot({ path: join(tmpdir(), 'kpp-classifications-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth), true)
  await page.screenshot({ path: join(tmpdir(), 'kpp-classifications-mobile.png') })
  await page.keyboard.press('Escape')
  assert.equal(await dialog.isVisible(), false)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('button', { name: 'Edit Klasifikasi Buku', exact: true }).click()
  await dialog.locator('li').filter({ hasText: 'Mapel Uji Browser' }).waitFor()
  await page.getByRole('button', { name: 'Selesai', exact: true }).click()
  await page.getByRole('link', { name: 'Tambah buku', exact: true }).click()
  await page.locator('#new-book-level').selectOption('SD')
  await page.locator('#new-book-subject').selectOption('Mapel Uji Browser')
  await page.locator('#new-book-division').selectOption('divisi-uji-browser')
  assert.equal(
    await page.locator('#book-curricula option[value="Kurikulum Uji Browser"]').count(),
    1,
  )
  await page.locator('#new-book-level').selectOption('SMP')
  assert.equal(await page.locator('#new-book-subject').inputValue(), '')
  await page
    .getByRole('navigation', { name: 'Navigasi utama' })
    .getByRole('link', { name: 'Divisi', exact: true })
    .click()
  await page.getByRole('heading', { name: 'Divisi Uji Browser', exact: true, level: 2 }).waitFor()
  assert.equal(await page.locator('.group-card').count(), 7)
  await page.locator('.group-card').filter({ hasText: 'Divisi Uji Browser' }).click()
  await page.waitForURL('**/divisi?division=divisi-uji-browser')
  assert.match(page.url(), /division=divisi-uji-browser/)
  assert.equal(await page.locator('.book-shelf').count(), 1)
  await page.screenshot({
    path: join(tmpdir(), 'kpp-classifications-divisions.png'),
    fullPage: true,
  })
  await page.getByRole('link', { name: 'Dashboard Editor', exact: true }).click()
  await page.getByRole('button', { name: 'Edit Klasifikasi Buku', exact: true }).click()
  for (const [kind, name] of [
    ['curriculum', 'Kurikulum Uji Browser'],
    ['division', 'Divisi Uji Browser'],
    ['subject', 'Mapel Uji Browser'],
    ['division', 'SD 1 MIPA'],
    ['subject', 'Matematika'],
  ]) {
    await page.locator('#classification-kind').selectOption(kind)
    if (kind === 'subject') await page.locator('#classification-level').selectOption('SD')
    const remove = dialog.getByRole('button', { name: `Hapus ${name}`, exact: true })
    await remove.click()
    await dialog.getByRole('button', { name: 'Batal', exact: true }).click()
    assert.equal(await remove.count(), 1)
    await remove.click()
    await dialog.getByRole('button', { name: 'Ya, hapus', exact: true }).click()
    if (kind === 'curriculum') {
      await dialog
        .getByRole('alert')
        .filter({ hasText: 'Klasifikasi masih dipakai buku.' })
        .waitFor()
      assert.equal(await remove.count(), 1)
      await dialog.getByRole('button', { name: 'Ya, hapus', exact: true }).click()
    }
    await remove.waitFor({ state: 'detached' })
    await dialog.getByRole('status').filter({ hasText: 'berhasil dihapus.' }).waitFor()
    assert.equal(await dialog.locator('.default-label').count(), 0)
  }
  await dialog.getByRole('button', { name: 'Selesai', exact: true }).click()
  await page
    .getByRole('navigation', { name: 'Navigasi utama' })
    .getByRole('link', { name: 'Divisi', exact: true })
    .click()
  await page.getByRole('heading', { name: 'Divisi', exact: true, level: 1 }).waitFor()
  assert.equal(await page.locator('.group-card').count(), 5)
  await page
    .getByRole('navigation', { name: 'Navigasi utama' })
    .getByRole('link', { name: 'Beranda', exact: true })
    .click()
  await page.waitForURL(base + '/')
  assert.equal(await page.locator('.division-card').count(), 5)
  assert.equal(await page.locator('.division-card').filter({ hasText: 'SD 1 MIPA' }).count(), 0)
  assert.deepEqual(errors, [])
  console.log(
    'PASS: port 3000 additions/deletions including initial division/subject, cancellation, in-use retry, form options, mobile layout, and removed division absent from browse/landing. All classification writes intercepted; no live persistence proof.',
  )
} finally {
  await browser.close()
  await client.auth.signOut({ scope: 'local' })
}
