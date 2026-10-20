import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

if (!process.env.PLAYWRIGHT_MODULE_PATH) throw new Error('PLAYWRIGHT_MODULE_PATH belum ditentukan.')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href)
const base = process.env.MATERIAL_TEST_BASE_URL ?? 'http://localhost:3000'
const id = '11111111-1111-4111-8111-111111111111'
const account = { id, role: 'editor', isSuper: true, educationLevels: ['SD'] }
const book = {
  id,
  title: 'Buku Uji Storage',
  author: 'Penulis',
  bookCode: '123456',
  educationLevel: 'SD',
  price: 0,
  published: false,
  resources: {},
}
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage()
  let calls = 0
  let usedMB = 140
  let fail = false
  let release
  await page.route('**/api/admin/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/admin/storage-usage') {
      calls++
      if (calls === 1)
        await new Promise((resolve) => {
          release = resolve
        })
      return route.fulfill(
        fail
          ? { status: 503, json: { statusMessage: 'Fixture unavailable' } }
          : { json: { usedBytes: usedMB * 1024 ** 2, quotaBytes: 1024 ** 3 } },
      )
    }
    if (path === '/api/admin/editor-session') return route.fulfill({ json: account })
    if (path === '/api/admin/book-options') return route.fulfill({ json: { account } })
    if (path === `/api/admin/books/${id}`) return route.fulfill({ json: { account, book } })
    if (path.endsWith('/image')) {
      assert.equal(route.request().method(), 'POST')
      usedMB++
      return route.fulfill({ json: { id } })
    }
    throw new Error('Unexpected admin request: ' + path)
  })
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction(() => document.querySelector('#__nuxt')?.__vue_app__)
  const navigate = (path) =>
    page.evaluate(
      (destination) =>
        document
          .querySelector('#__nuxt')
          .__vue_app__.config.globalProperties.$router.push(destination),
      path,
    )
  await navigate('/admin/books/new')
  const open = () =>
    page.getByRole('button', { name: 'Kelola kelengkapan produk', exact: true }).click()
  const footer = page.locator('.materials-dialog-footer')
  const status = footer.getByRole('status')
  await open()
  await status.getByText('Memuat penggunaan penyimpanan...', { exact: true }).waitFor()
  assert.equal(calls, 1)
  release()
  await status.getByText('140 MB dari 1 GB penyimpanan telah dipakai.', { exact: true }).waitFor()
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    assert.equal(
      await status.evaluate((node) => {
        const text = node.getBoundingClientRect()
        const footer = node.closest('footer').getBoundingClientRect()
        return text.left >= footer.left && text.right <= footer.right + 1
      }),
      true,
    )
  }
  await footer.getByRole('button', { name: 'Selesai', exact: true }).click()
  fail = true
  await open()
  await status.getByText('Penggunaan penyimpanan belum dapat dimuat.', { exact: false }).waitFor()
  assert.doesNotMatch(await status.innerText(), /140 MB|0 MB/)
  fail = false
  usedMB = 0
  await status.getByRole('button', { name: 'Coba lagi', exact: true }).click()
  await status.getByText('0 MB dari 1 GB penyimpanan telah dipakai.', { exact: true }).waitFor()
  await footer.getByRole('button', { name: 'Selesai', exact: true }).click()
  await navigate(`/admin/books/${id}`)
  await page.locator('#new-book-title').waitFor()
  await open()
  await status.getByText('0 MB dari 1 GB penyimpanan telah dipakai.', { exact: true }).waitFor()
  await footer.getByRole('button', { name: 'Selesai', exact: true }).click()
  const beforeUpload = calls
  await page.locator('#new-book-cover').setInputFiles({
    name: 'cover.png',
    mimeType: 'image/png',
    buffer: Buffer.from('fixture image'),
  })
  await page.waitForFunction(() =>
    document.querySelector('.storage-usage')?.textContent.includes('1 MB dari'),
  )
  assert.ok(calls > beforeUpload, 'Cover upload refreshes project usage')
  await open()
  await status.getByText('1 MB dari 1 GB penyimpanan telah dipakai.', { exact: true }).waitFor()
  console.log(
    'PASS Storage footer: create/edit, loading, actual/zero values, retry, reopen, upload refresh, desktop/mobile (mocked admin API; no live writes)',
  )
} finally {
  await browser.close()
}
