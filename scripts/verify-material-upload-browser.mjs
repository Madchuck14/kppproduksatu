import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

if (!process.env.PLAYWRIGHT_MODULE_PATH) throw new Error('PLAYWRIGHT_MODULE_PATH belum ditentukan.')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href)
const base = process.env.MATERIAL_TEST_BASE_URL ?? 'http://localhost:3000'
const id = '11111111-1111-4111-8111-111111111111'
const objectPath = `books/${id}/product-knowledge/22222222-2222-4222-8222-222222222222.ppt`
const previewPath = `books/${id}/product-knowledge-preview/33333333-3333-4333-8333-333333333333.pdf`
const account = {
  id,
  email: 'editor@example.test',
  role: 'editor',
  isSuper: true,
  educationLevels: ['SD'],
}
const size = Math.round(10.6 * 1024 * 1024)
const bytes = Buffer.alloc(size)
Buffer.from([208, 207, 17, 224, 161, 177, 26, 225]).copy(bytes)
Buffer.from('PowerPoint Document', 'utf16le').copy(bytes, 8)
const previewBytes = Buffer.from('%PDF-1.7\nmanual preview')
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
})
try {
  const page = await browser.newPage()
  let uploadCount = 0
  let prepareCount = 0
  let completeCount = 0
  let failUpload = true
  const apiSizes = []
  const mutations = []
  await page.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.startsWith('/storage/v1/object/upload/sign/')) {
      assert.notEqual(url.origin, new URL(base).origin)
      const isPreview = url.pathname.endsWith(previewPath)
      assert.ok(isPreview || url.pathname.endsWith(objectPath))
      assert.ok(
        isPreview
          ? request.postDataBuffer().length >= previewBytes.length
          : request.postDataBuffer().length >= size,
      )
      uploadCount += 1
      return route.fulfill(
        failUpload && !isPreview
          ? {
              status: 500,
              json: { statusCode: '500', error: 'StorageError', message: 'test failure' },
            }
          : { json: { Key: `book-materials/${isPreview ? previewPath : objectPath}` } },
      )
    }
    if (url.origin !== new URL(base).origin) return route.abort()
    if (url.pathname === '/api/admin/editor-session') return route.fulfill({ json: account })
    if (url.pathname === '/api/admin/book-options') return route.fulfill({ json: { account } })
    if (url.pathname.startsWith('/api/admin/')) {
      if (request.method() !== 'GET') {
        apiSizes.push(request.postDataBuffer()?.length ?? 0)
        mutations.push(url.pathname)
      }
      if (url.pathname.endsWith('/upload-url')) {
        const payload = request.postDataJSON()
        const isPreview = payload.type === 'application/pdf'
        assert.equal(payload.size, isPreview ? previewBytes.length : size)
        if (!isPreview) assert.equal(payload.type, 'application/vnd.ms-powerpoint')
        prepareCount += 1
        return route.fulfill({
          json: { path: isPreview ? previewPath : objectPath, token: 'test-token' },
        })
      }
      if (url.pathname.endsWith('/complete')) {
        assert.ok([objectPath, previewPath].includes(request.postDataJSON().path))
        completeCount += 1
        return route.fulfill({
          json: { id },
        })
      }
      if (request.method() === 'POST' || request.method() === 'PUT')
        return route.fulfill({ json: { ...request.postDataJSON(), id } })
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
    }
    return route.continue()
  })
  await page.goto(`${base}/login`)
  await page.waitForFunction(() => document.querySelector('#__nuxt')?.__vue_app__)
  await page.evaluate(() =>
    document
      .querySelector('#__nuxt')
      .__vue_app__.config.globalProperties.$router.push('/admin/books/new'),
  )
  await page.locator('#new-book-title').fill('Uji transport PowerPoint')
  await page.locator('#new-book-author').fill('Penulis Uji')
  await page.locator('#new-book-code').fill('123456789')
  await page.locator('#new-book-year').fill('2026')
  await page.locator('#new-book-level').selectOption('SD')
  await page.locator('#new-book-grade').selectOption('1')
  await page.locator('#new-book-subject').selectOption('Matematika')
  await page
    .locator('#new-book-product-knowledge')
    .setInputFiles({ name: 'produk.ppt', mimeType: 'application/octet-stream', buffer: bytes })
  await page.locator('#new-book-product-knowledge-preview').setInputFiles({
    name: 'produk-preview.pdf',
    mimeType: 'application/pdf',
    buffer: previewBytes,
  })
  await page.getByRole('button', { name: 'Simpan buku', exact: true }).click()
  await page
    .getByRole('alert')
    .filter({ hasText: 'Unggahan PPT Produk ke penyimpanan gagal' })
    .waitFor()
  assert.equal(completeCount, 0)
  assert.ok(page.url().endsWith('/admin/books/new'))
  assert.ok(await page.locator('.file-name').filter({ hasText: 'produk.ppt' }).count())
  failUpload = false
  await page.getByRole('button', { name: 'Simpan buku', exact: true }).click()
  await page.waitForURL('**/admin?notice=saved')
  assert.equal(uploadCount, 3)
  assert.equal(prepareCount, 3)
  assert.equal(completeCount, 2)
  assert.ok(apiSizes.every((length) => length < 4096))
  assert.ok(!mutations.some((pathname) => pathname.endsWith('/materials/product-knowledge')))
  console.log(
    'PASS: port 3000 browser uploads PPT and PDF preview directly to mocked Supabase; app requests stay small; failure retains files and retry completes. No live mutations.',
  )
} finally {
  await browser.close()
}
