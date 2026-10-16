import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

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
  let drafts = 0
  let metadataUpdates = 0
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
          json: {
            path: isPreview ? previewPath : objectPath,
            token: 'test-token',
            signedUrl: `https://storage.example.test/storage/v1/object/upload/sign/book-materials/${isPreview ? previewPath : objectPath}?token=test-token`,
          },
        })
      }
      if (url.pathname.endsWith('/complete')) {
        assert.ok([objectPath, previewPath].includes(request.postDataJSON().path))
        const isPreview = request.postDataJSON().path === previewPath
        const bar = page.getByRole('progressbar', {
          name: isPreview
            ? 'Progres unggahan PPT Produk untuk pratinjau'
            : 'Progres unggahan PPT Produk untuk diunduh',
          exact: true,
        })
        await bar.waitFor()
        assert.ok(Number(await bar.getAttribute('value')) < 100)
        if (isPreview && page.url().endsWith('/admin/books/new')) {
          await page.getByText('produk.ppt', { exact: true }).last().waitFor()
          assert.equal(
            await page
              .getByRole('progressbar', {
                name: 'Progres unggahan PPT Produk untuk diunduh',
                exact: true,
              })
              .getAttribute('value'),
            '100',
          )
        }
        completeCount += 1
        return route.fulfill({
          json: { id },
        })
      }
      if (url.pathname === '/api/admin/books' && request.method() === 'POST') {
        drafts += 1
        assert.equal(request.postDataJSON().published, false)
      }
      if (url.pathname === `/api/admin/books/${id}` && request.method() === 'PUT') {
        metadataUpdates += 1
      }
      if (request.method() === 'POST' || request.method() === 'PUT')
        return route.fulfill({ json: { ...request.postDataJSON(), id } })
      if (url.pathname === `/api/admin/books/${id}`) {
        return route.fulfill({
          json: {
            account,
            book: {
              id,
              title: 'Buku tersimpan',
              author: 'Penulis Uji',
              bookCode: '123456789',
              educationLevel: 'SD',
              grade: 1,
              subject: 'Matematika',
              publicationYear: 2026,
              price: 0,
              published: true,
              resources: {},
            },
          },
        })
      }
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
  await page.getByRole('button', { name: 'Kelola kelengkapan produk', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Kelengkapan Produk', exact: true })
  await dialog.waitFor()
  assert.equal(await dialog.locator('.material-upload').count(), 4)
  await page.keyboard.press('Escape')
  assert.equal(await dialog.isVisible(), true)
  for (const kind of ['dummy', 'product-knowledge', 'product-knowledge-preview', 'flyer']) {
    await page.locator(`#new-book-${kind}`).setInputFiles({
      name: 'bukan-materi.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('invalid'),
    })
    const warning = page.locator(`#upload-warning-${kind}`)
    await warning.waitFor()
    assert.equal(
      await warning.evaluate((element) =>
        element.previousElementSibling?.classList.contains('file-picker'),
      ),
      true,
    )
  }
  assert.equal(await dialog.locator('.material-failure').count(), 4)
  assert.equal(await page.locator('.create-book-form > .form-alert').count(), 0)
  await page.mouse.click(2, 2)
  assert.equal(await dialog.isVisible(), true)
  await page
    .locator('#new-book-product-knowledge')
    .setInputFiles({ name: 'produk.ppt', mimeType: 'application/octet-stream', buffer: bytes })
  await dialog.getByRole('alert').filter({ hasText: 'ke penyimpanan gagal' }).waitFor()
  assert.ok(
    (await page.locator('#upload-warning-product-knowledge').textContent()).includes(
      'ke penyimpanan gagal',
    ),
  )
  assert.equal(
    await dialog.locator(':scope > .form-alert, .materials-dialog-content > .form-alert').count(),
    0,
  )
  assert.equal(completeCount, 0)
  assert.ok(await page.locator('.upload-progress.upload-error').count())
  assert.equal(await page.getByText('File berhasil diunggah', { exact: true }).count(), 0)
  assert.ok(page.url().endsWith('/admin/books/new'))
  assert.ok(await page.locator('.file-name').filter({ hasText: 'produk.ppt' }).count())
  assert.equal(drafts, 1)
  assert.equal(metadataUpdates, 0)
  failUpload = false
  await page.getByRole('button', { name: 'Coba lagi', exact: true }).click()
  await dialog.locator('.material-success').first().waitFor()
  assert.equal(await page.getByText('File berhasil diunggah', { exact: true }).count(), 0)
  await page.locator('#new-book-product-knowledge-preview').setInputFiles({
    name: 'produk-preview.pdf',
    mimeType: 'application/pdf',
    buffer: previewBytes,
  })
  await page.waitForFunction(
    () =>
      document
        .querySelector('#new-book-product-knowledge-preview')
        ?.closest('.material-upload')
        ?.querySelector('progress')?.value === 100,
  )
  assert.ok(page.url().endsWith('/admin/books/new'))
  assert.equal(metadataUpdates, 0)
  assert.equal(drafts, 1)
  assert.equal(await dialog.isVisible(), true)
  await page.getByRole('button', { name: 'Selesai', exact: true }).click()
  assert.equal(await dialog.isVisible(), false)
  await page.getByRole('button', { name: 'Kelola kelengkapan produk', exact: true }).click()
  assert.equal(await dialog.locator('.material-success').count(), 2)
  await page.getByRole('button', { name: 'Tutup kelengkapan produk', exact: true }).click()
  await page.getByRole('button', { name: 'Simpan buku', exact: true }).click()
  await page.waitForURL('**/admin?notice=saved')
  assert.equal(metadataUpdates, 1)
  assert.equal(uploadCount, 3)
  assert.equal(prepareCount, 3)
  assert.equal(completeCount, 2)
  assert.ok(apiSizes.every((length) => length < 4096))
  assert.ok(!mutations.some((pathname) => pathname.endsWith('/materials/product-knowledge')))
  await page.evaluate(
    (bookId) =>
      document
        .querySelector('#__nuxt')
        .__vue_app__.config.globalProperties.$router.push(`/admin/books/${bookId}`),
    id,
  )
  await page.locator('#new-book-title').fill('Perubahan judul belum disimpan')
  await page.getByRole('button', { name: 'Kelola kelengkapan produk', exact: true }).click()
  await page.locator('#new-book-product-knowledge-preview').setInputFiles({
    name: 'edit-preview.pdf',
    mimeType: 'application/pdf',
    buffer: previewBytes,
  })
  await page.waitForFunction(
    () =>
      document
        .querySelector('#new-book-product-knowledge-preview')
        ?.closest('.material-upload')
        ?.querySelector('progress')?.value === 100,
  )
  assert.ok(page.url().endsWith(`/admin/books/${id}`))
  assert.equal(drafts, 1)
  assert.equal(metadataUpdates, 1)
  assert.equal(completeCount, 3)
  assert.equal(await page.locator('#new-book-title').inputValue(), 'Perubahan judul belum disimpan')
  await page.getByText('edit-preview.pdf', { exact: true }).last().waitFor()
  assert.equal(await dialog.isVisible(), true)
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    assert.equal(
      await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth),
      true,
    )
    assert.equal(await dialog.evaluate((element) => element.contains(document.activeElement)), true)
    const path = join(tmpdir(), `kpp-materials-modal-${width}.png`)
    await page.screenshot({ path })
    console.log(`SCREENSHOT ${path}`)
  }
  await page.getByRole('button', { name: 'Tutup kelengkapan produk', exact: true }).click()
  assert.equal(await dialog.isVisible(), false)
  assert.equal(await page.locator('#new-book-title').inputValue(), 'Perubahan judul belum disimpan')
  console.log(
    'PASS: warnings stay below each file picker, independent across sections with no global upload alert; large modal/manual close, desktop/mobile, immediate upload/progress/success/retry preserved. Port 3000, no live mutations.',
  )
} finally {
  await browser.close()
}
