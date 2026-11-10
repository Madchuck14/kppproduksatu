import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { structureIds } from './fixtures/product-structure.mjs'

// All Auth/API requests are local browser fixtures; never writes to Supabase.
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href)
const base = process.env.STRUCTURE_TEST_BASE_URL || 'http://localhost:3000'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const account = {
  id: '77777777-7777-4777-8777-777777777777',
  nip: '000000000',
  role: 'editor',
  isSuper: true,
  educationLevels: ['SD', 'SMP', 'SMA', 'SMK'],
  salesAreas: [],
}
const user = {
  id: account.id,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'fixture@nip.invalid',
  app_metadata: { provider: 'email' },
  user_metadata: {},
  identities: [],
  created_at: new Date().toISOString(),
}
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: account.id, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) })}.fixture`
let loggedIn = false
let failSave = true
let savedBook
let sequence = 0
const nodes = []
const books = []
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (/hydration.*mismatch/i.test(message.text())) errors.push(message.text())
})
function pathFor(id) {
  const result = []
  const seen = new Set()
  let node = nodes.find((node) => node.id === id)
  while (node && !seen.has(node.id)) {
    seen.add(node.id)
    result.unshift(node)
    node = nodes.find((item) => item.id === node.parentId)
  }
  return result
}
const respond = (route, status, body) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
await page.route('**/auth/v1/**', (route) => respond(route, 200, user))
await page.route('**/api/**', async (route) => {
  const request = route.request()
  const url = new URL(request.url())
  const method = request.method()
  const path = url.pathname
  if (path === '/api/auth/login') {
    loggedIn = true
    return respond(route, 200, { access_token: token, refresh_token: 'fixture-refresh' })
  }
  if (path === '/api/auth/session')
    return respond(route, loggedIn ? 200 : 401, loggedIn ? account : { statusCode: 401 })
  if (path.startsWith('/api/favorites'))
    return respond(route, 200, {
      ownerId: account.id,
      ids: [],
      products: [],
      total: 0,
      page: 1,
      pageSize: 24,
    })
  if (path === '/api/catalog/classifications')
    return respond(
      route,
      200,
      ['SD', 'SMP', 'SMA', 'SMK'].map((level) => ({
        kind: 'subject',
        code: 'Matematika',
        name: 'Matematika',
        education_level: level,
      })),
    )
  if (path === '/api/catalog/product-structure')
    return respond(
      route,
      200,
      nodes.filter(
        (node) => !node.archived && node.educationLevel === url.searchParams.get('level'),
      ),
    )
  if (path === '/api/admin/editor-session') return respond(route, 200, account)
  if (path === '/api/admin/book-options') return respond(route, 200, { account })
  if (path.startsWith('/api/admin/product-structure')) {
    if (!account.isSuper || account.role !== 'editor')
      return respond(route, 403, { statusMessage: 'Hanya Editor super.' })
    if (method === 'GET')
      return respond(
        route,
        200,
        nodes.filter(
          (node) => !node.archived && node.educationLevel === url.searchParams.get('level'),
        ),
      )
    if (path.endsWith('/archive')) {
      const id = path.split('/').at(-2)
      const descendants = nodes.filter((node) => pathFor(node.id).some((part) => part.id === id))
      if (books.some((book) => descendants.some((node) => node.id === book.structureNodeId)))
        return respond(route, 409, {
          statusMessage:
            'Cabang atau turunannya masih dipakai buku, termasuk draf. Pindahkan atau lepas struktur pada buku terkait terlebih dahulu.',
        })
      for (const node of descendants) node.archived = true
      return respond(route, 200, { archivedCount: descendants.length })
    }
    const body = request.postDataJSON()
    if (failSave) {
      failSave = false
      return respond(route, 503, { statusMessage: 'Fixture: simpan gagal. Coba lagi.' })
    }
    if (method === 'POST') {
      const id =
        [structureIds.root, structureIds.child, structureIds.leaf, structureIds.other][
          sequence++
        ] || `a${String(sequence).padStart(7, '0')}-5555-4555-8555-555555555555`
      const node = { id, ...body, archived: false }
      nodes.push(node)
      return respond(route, 200, node)
    }
    const node = nodes.find((node) => node.id === path.split('/').at(-1))
    Object.assign(node, body)
    return respond(route, 200, node)
  }
  if (path === '/api/admin/books' && method === 'GET')
    return respond(route, 200, {
      account,
      books,
      total: books.length,
      page: 1,
      pageSize: 12,
      stats: {
        total: books.length,
        published: books.filter((book) => book.published).length,
        draft: 0,
        incomplete: 0,
      },
    })
  if (path === '/api/admin/books' && method === 'POST') {
    const body = request.postDataJSON()
    savedBook = body
    const book = {
      ...body,
      id: 'b1111111-1111-4111-8111-111111111111',
      slug: 'structure-fixture',
      description: body.synopsis ?? '',
      imageUrl: '/images/erlangga.png',
      featured: false,
      resources: {
        flyer: false,
        dummy: false,
        productKnowledge: false,
        productKnowledgePreview: false,
      },
      updatedAt: new Date().toISOString(),
    }
    books.push(book)
    return respond(route, 200, book)
  }
  if (path.startsWith('/api/admin/books/') && method === 'GET')
    return respond(route, 200, { account, book: books[0] })
  if (path === '/api/products')
    return respond(route, 200, { source: 'demo', products: books.filter((book) => book.published) })
  if (path.startsWith('/api/products/')) {
    if (path.endsWith('/resources'))
      return respond(route, 200, {
        flyer: false,
        flyerFormat: null,
        dummy: false,
        productKnowledge: false,
        productKnowledgePreview: false,
        productKnowledgeFormat: null,
      })
    if (path.endsWith('/access')) return respond(route, 200, { recorded: false })
    return respond(route, 200, { ...books[0], structurePath: pathFor(books[0]?.structureNodeId) })
  }
  return respond(route, 503, { statusMessage: 'Unexpected fixture API path' })
})
async function dashboard() {
  await page
    .getByRole('link', { name: /Dashboard Editor/ })
    .first()
    .click()
  await page.getByRole('heading', { name: 'Dashboard Editor', exact: true }).waitFor()
  if (account.isSuper)
    await page.getByRole('link', { name: 'Kelola Struktur Produk', exact: true }).waitFor()
}
async function manager() {
  await page.getByRole('link', { name: 'Kelola Struktur Produk', exact: true }).click()
  await page.getByLabel('Nama cabang', { exact: true }).waitFor()
}
async function saveBranch(name) {
  await page.getByLabel('Nama cabang', { exact: true }).fill(name)
  await page.getByRole('button', { name: 'Simpan cabang', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Cabang berhasil disimpan.' }).waitFor()
}
try {
  await page.goto(base + '/login')
  await page.waitForFunction(
    () =>
      document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$nuxt?.isHydrating ===
      false,
  )
  await page.getByLabel('Nomor Induk Pegawai (NIP)', { exact: true }).fill('000000000')
  await page.locator('#password').fill('FixturePassword123!')
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  await page.waitForURL(base + '/admin')
  await manager()
  await page.getByText('Belum ada struktur', { exact: true }).waitFor()
  await page.getByLabel('Nama cabang', { exact: true }).fill('Buku Soal')
  await page.getByRole('button', { name: 'Simpan cabang', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Fixture: simpan gagal.' }).waitFor()
  assert.equal(await page.getByLabel('Nama cabang', { exact: true }).inputValue(), 'Buku Soal')
  await saveBranch('Buku Soal')
  await page.getByRole('button', { name: '+ Tambah subcabang', exact: true }).click()
  await saveBranch('Asesmen Formatif')
  await page.getByRole('button', { name: '+ Tambah subcabang', exact: true }).click()
  await page.getByLabel('Status produk (opsional)').fill('Eksisting')
  await saveBranch('Bupena Merdeka')
  await page.getByRole('button', { name: 'Buku Soal', exact: true }).click()
  assert.equal(
    await page.locator(`#structure-parent option[value="${structureIds.leaf}"]`).count(),
    0,
    'Descendants cannot become parent',
  )
  await page.getByRole('button', { name: 'Tutup cabang Buku Soal', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: 'Asesmen Formatif', exact: true }).count(), 0)
  await page.getByRole('button', { name: 'Buka cabang Buku Soal', exact: true }).click()
  await mkdir('.data/product-structure-qa', { recursive: true })
  await page.screenshot({ path: '.data/product-structure-qa/admin-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  const tree = await page.locator('.tree-panel').boundingBox()
  const edit = await page.locator('.edit-panel').boundingBox()
  assert(tree.y + tree.height <= edit.y)
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.screenshot({ path: '.data/product-structure-qa/admin-mobile.png', fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('tab', { name: 'SMP', exact: true }).click()
  await page.getByText('Belum ada struktur', { exact: true }).waitFor()
  await saveBranch('Buku Teks')
  await page.getByRole('tab', { name: 'SD', exact: true }).click()
  await page.getByRole('button', { name: 'Buku Soal', exact: true }).waitFor()
  await dashboard()
  await page.getByRole('link', { name: 'Tambah buku', exact: true }).click()
  await page.locator('#new-book-title').fill('Buku struktur fixture')
  await page.locator('#new-book-author').fill('Penulis fixture')
  await page.locator('#new-book-code').fill('910001')
  await page.locator('#new-book-year').fill('2026')
  await page.locator('#new-book-price').fill('100000')
  await page.locator('#new-book-level').selectOption('SD')
  await page.locator('#new-book-structure').click()
  await page.getByPlaceholder('Cari nama atau jalur cabang...').fill('Bupena')
  await page
    .getByRole('option', { name: 'Buku Soal → Asesmen Formatif → Bupena Merdeka', exact: true })
    .click()
  await page.locator('#new-book-level').selectOption('SMP')
  await page
    .getByRole('button', { name: 'Lepas pilihan', exact: true })
    .waitFor({ state: 'hidden' })
  await page.locator('#new-book-structure').click()
  assert.equal(await page.getByRole('option', { name: /Bupena/ }).count(), 0)
  await page.keyboard.press('Escape')
  await page.locator('#new-book-level').selectOption('SD')
  await page.locator('#new-book-structure').click()
  await page
    .getByRole('option', { name: 'Buku Soal → Asesmen Formatif → Bupena Merdeka', exact: true })
    .click()
  await page.locator('#new-book-grade').selectOption('1')
  await page.locator('#new-book-subject').selectOption('Matematika')
  await page.getByRole('checkbox', { name: /Publikasikan buku/ }).check()
  await page.getByRole('button', { name: 'Simpan buku', exact: true }).click()
  await page.waitForURL(base + '/admin?notice=saved')
  assert.equal(savedBook.structureNodeId, structureIds.leaf)
  await page.getByRole('link', { name: 'Edit', exact: true }).click()
  await page
    .getByText('Buku Soal → Asesmen Formatif → Bupena Merdeka', { exact: false })
    .first()
    .waitFor()
  await page.getByRole('link', { name: 'Batal', exact: true }).click()
  await page.getByRole('link', { name: 'Lihat', exact: true }).click()
  await page.locator('.detail-structure').waitFor()
  assert.match(
    await page.locator('.detail-structure').innerText(),
    /Buku Soal → Asesmen Formatif → Bupena Merdeka/,
  )
  await page.getByRole('link', { name: 'Lihat struktur SD', exact: true }).click()
  await page.locator('.tree-row.selected').waitFor()
  assert.match(await page.locator('.tree-row.selected').innerText(), /Bupena Merdeka/)
  await page.screenshot({ path: '.data/product-structure-qa/public-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.screenshot({ path: '.data/product-structure-qa/public-mobile.png', fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await dashboard()
  await manager()
  await page
    .getByRole('button', { name: 'Buka cabang Asesmen Formatif', exact: true })
    .click()
    .catch(() => {})
  await page.getByRole('button', { name: 'Asesmen Formatif', exact: true }).click()
  await saveBranch('Asesmen Sekolah')
  await page.getByRole('button', { name: '+ Tambah kategori', exact: true }).click()
  await saveBranch('Kategori baru')
  const newParent = nodes.find((node) => node.name === 'Kategori baru').id
  await page.getByRole('button', { name: 'Asesmen Sekolah', exact: true }).click()
  await page.getByLabel('Induk', { exact: true }).selectOption(newParent)
  await saveBranch('Asesmen Sekolah')
  await page.getByRole('button', { name: 'Kategori baru', exact: true }).click()
  await page.getByRole('button', { name: 'Arsipkan cabang', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Arsipkan cabang', exact: true }).click()
  await dialog.getByRole('alert').filter({ hasText: 'masih dipakai buku' }).waitFor()
  await dialog.getByRole('button', { name: 'Batal', exact: true }).click()
  await page.getByRole('tab', { name: 'SMP', exact: true }).click()
  await page.getByRole('button', { name: 'Buku Teks', exact: true }).click()
  await page.getByRole('button', { name: 'Arsipkan cabang', exact: true }).click()
  await dialog.getByRole('button', { name: 'Arsipkan cabang', exact: true }).click()
  await page.getByText('Belum ada struktur', { exact: true }).waitFor()
  await dashboard()
  await page.getByRole('link', { name: 'Lihat', exact: true }).click()
  assert.match(
    await page.locator('.detail-structure').innerText(),
    /Kategori baru → Asesmen Sekolah → Bupena Merdeka/,
  )
  account.isSuper = false
  await dashboard()
  assert.equal(
    await page.getByRole('link', { name: 'Kelola Struktur Produk', exact: true }).count(),
    0,
  )
  assert.deepEqual(errors, [])
  console.log(
    'PASS: fixture category/subbranch/leaf creation with failure retention; tabs/collapse/invalid-parent options; searchable book selection, level reset/cross-level filtering, saved edit choice; published detail and highlighted public tree; rename/reparent update paths; in-use archive confirmation and denial; ordinary Editor menu hidden; desktop/mobile. All Auth/API calls mocked, no live writes.',
  )
} catch (error) {
  await mkdir('.data/product-structure-qa', { recursive: true })
  await page.screenshot({ path: '.data/product-structure-qa/failure.png', fullPage: true })
  console.error(
    JSON.stringify({
      url: page.url(),
      alerts: await page.getByRole('alert').allTextContents(),
      errors,
    }),
  )
  throw error
} finally {
  await browser.close()
}
