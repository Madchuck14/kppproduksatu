import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { pathToFileURL } from 'node:url'
import { createServerClient } from '@supabase/ssr'
import { defaultContactPage } from '../shared/schemas/contact-page.ts'

// Real login/read-only role checks. Every contact write is intercepted in the browser.
const env = { ...parseEnv(readFileSync('.env', 'utf8')), ...process.env }
const scoped = parseEnv(readFileSync('.env.editor-accounts', 'utf8'))
const base = env.EDITOR_TEST_BASE_URL || 'http://localhost:3000'
const { chromium } = await import(pathToFileURL(env.PLAYWRIGHT_MODULE_PATH).href)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const errors = []
let content = structuredClone(defaultContactPage)
const respond = (route, status, body) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
try {
  const anonymous = await fetch(`${base}/api/admin/contact`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
  assert.equal(anonymous.status, 401)
  for (const account of [
    { email: scoped.EDITOR_SD_EMAIL, password: scoped.EDITOR_SD_PASSWORD, super: false },
    {
      email: env.SUPER_ACCOUNT_EDITOR_EMAIL,
      password: env.SUPER_ACCOUNT_EDITOR_PASSWORD,
      super: true,
    },
  ]) {
    const jar = new Map()
    const client = createServerClient(env.NUXT_PUBLIC_SUPABASE_URL, env.NUXT_PUBLIC_SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      cookieOptions: { name: 'sb-kppproduksatu' },
      cookies: {
        getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
        setAll: (entries) => entries.forEach(({ name, value }) => jar.set(name, value)),
      },
    })
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } })
    try {
      const { error } = await client.auth.signInWithPassword({
        email: account.email,
        password: account.password,
      })
      assert(!error, 'Fixture login failed')
      const cookie = Array.from(jar, ([name, value]) => `${name}=${value}`).join('; ')
      const invalid = await fetch(`${base}/api/admin/contact`, {
        method: 'PUT',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: '{}',
      })
      assert.equal(
        invalid.status,
        account.super ? 400 : 403,
        'Server guard before any database write',
      )
      await context.addCookies(
        Array.from(jar, ([name, value]) => ({ name, value, url: base, sameSite: 'Lax' })),
      )
      let failLoad = true
      let failSave = true
      let writes = 0
      await context.route('**/api/admin/contact', async (route) => {
        if (route.request().method() === 'GET') {
          if (failLoad)
            return respond(route, 503, { statusMessage: 'Fixture: kontak belum dapat dimuat.' })
          return respond(route, 200, content)
        }
        assert.equal(route.request().method(), 'PUT')
        writes++
        if (failSave) return respond(route, 503, { statusMessage: 'Fixture: simpan gagal.' })
        content = route.request().postDataJSON()
        return respond(route, 200, content)
      })
      await context.route('**/api/catalog/contact', (route) => respond(route, 200, content))
      await context.route('https://www.google.com/maps/**', (route) => route.abort())
      const page = await context.newPage()
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (/hydration.*mismatch/i.test(message.text())) errors.push(message.text())
      })
      await page.goto(`${base}/admin`, { waitUntil: 'networkidle' })
      const button = page.getByRole('link', { name: 'Atur Halaman Kontak', exact: true })
      assert.equal(await button.count(), account.super ? 1 : 0)
      if (!account.super) continue
      await button.click()
      const dialog = page.getByRole('region', { name: 'Atur Halaman Kontak', exact: true })
      await dialog.getByRole('alert').waitFor()
      assert.equal(await dialog.getByRole('button', { name: 'Simpan perubahan' }).count(), 0)
      failLoad = false
      await dialog.getByRole('button', { name: 'Coba lagi' }).click()
      await dialog.getByLabel('Judul', { exact: true }).waitFor()
      await dialog.getByLabel('Judul', { exact: true }).fill('Hubungi tim Erlangga')
      assert.equal(
        await dialog.getByLabel('Nomor telepon 1', { exact: true }).inputValue(),
        content.phone,
      )
      await dialog.getByLabel('Tanda pengenal telepon 1', { exact: true }).fill('Kantor pusat')
      assert.equal(
        await dialog
          .getByRole('button', { name: 'Hapus nomor telepon 1', exact: true })
          .isDisabled(),
        true,
      )
      await dialog.getByRole('button', { name: 'Tambah nomor telepon' }).click()
      await dialog.getByLabel('Tanda pengenal telepon 2', { exact: true }).fill('Customer service')
      await dialog.getByLabel('Nomor telepon 2', { exact: true }).fill('(021) 123 4567')
      await dialog.getByRole('button', { name: 'Tambah nomor telepon' }).click()
      await dialog.getByRole('button', { name: 'Hapus nomor telepon 3', exact: true }).click()
      assert.equal(await dialog.getByLabel('Nomor telepon 3', { exact: true }).count(), 0)
      await dialog.getByLabel('URL sematan Google Maps').fill('https://evil.example/maps/embed')
      await dialog.getByRole('button', { name: 'Simpan perubahan' }).click()
      await dialog.getByRole('alert').filter({ hasText: 'Gunakan URL sematan' }).waitFor()
      assert.equal(writes, 0, 'Invalid map URL rejected before save')
      await dialog.getByLabel('URL sematan Google Maps').fill(content.mapEmbedUrl)
      await dialog.getByRole('button', { name: 'Simpan perubahan' }).click()
      await dialog.getByRole('alert').filter({ hasText: 'Fixture: simpan gagal.' }).waitFor()
      assert.equal(
        await dialog.getByLabel('Judul', { exact: true }).inputValue(),
        'Hubungi tim Erlangga',
      )
      failSave = false
      await dialog.getByRole('button', { name: 'Simpan perubahan' }).click()
      await dialog.getByRole('status').filter({ hasText: 'berhasil diperbarui' }).waitFor()
      assert.equal(writes, 2)
      assert.deepEqual(content.phones, [
        { label: 'Kantor pusat', number: defaultContactPage.phone },
        { label: 'Customer service', number: '(021) 123 4567' },
      ])
      assert.equal(
        await dialog.getByRole('button', { name: 'Simpan perubahan' }).isDisabled(),
        true,
      )
      await mkdir('.data/contact-page-qa', { recursive: true })
      await page.screenshot({ path: '.data/contact-page-qa/modal-desktop.png', fullPage: true })
      await page.getByRole('link', { name: 'Kelola Buku', exact: true }).click()
      await button.click()
      await dialog.getByLabel('Judul', { exact: true }).waitFor()
      assert.equal(await dialog.getByLabel('Judul', { exact: true }).inputValue(), content.heading)
      assert.equal(
        await dialog.getByLabel('Tanda pengenal telepon 2', { exact: true }).inputValue(),
        'Customer service',
      )
      await dialog.locator('.phone-settings').scrollIntoViewIfNeeded()
      await page.screenshot({ path: '.data/contact-page-qa/phones-desktop.png' })
      await page.setViewportSize({ width: 390, height: 844 })
      await dialog.locator('.phone-settings').scrollIntoViewIfNeeded()
      await page.screenshot({ path: '.data/contact-page-qa/phones-mobile.png' })
      assert(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth))
      await page.screenshot({ path: '.data/contact-page-qa/modal-mobile.png', fullPage: true })
      await page.getByRole('link', { name: 'Kelola Buku', exact: true }).click()
      await page.setViewportSize({ width: 1440, height: 1050 })
      await page.getByRole('link', { name: 'Kontak', exact: true }).first().click()
      await page.getByRole('heading', { level: 1 }).filter({ hasText: content.heading }).waitFor()
      const extraPhone = page.locator('a[href="tel:0211234567"]')
      assert.equal(await extraPhone.count(), 1)
      assert.match(await extraPhone.innerText(), /Customer service/i)
      assert.equal((await page.locator('a[href="mailto:info@erlangga.co.id"]').count()) > 0, true)
      await page.screenshot({ path: '.data/contact-page-qa/public-desktop.png', fullPage: true })
      await page.setViewportSize({ width: 390, height: 844 })
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      await page.screenshot({ path: '.data/contact-page-qa/public-mobile.png', fullPage: true })
    } finally {
      await context.close()
      await client.auth.signOut({ scope: 'local' })
    }
  }
  assert.deepEqual(errors, [])
  console.log(
    'PASS: real anonymous/ordinary Editor/super Editor API guard and button visibility; mocked load/retry/validation/save error retention/success/reopen; public contact reflects saved fixture; desktop/mobile without overflow or hydration errors. No live contact or catalog writes.',
  )
} finally {
  await browser.close()
}
