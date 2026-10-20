import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

if (!process.env.PLAYWRIGHT_MODULE_PATH) throw new Error('PLAYWRIGHT_MODULE_PATH belum ditentukan.')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href)
const base = process.env.MATERIAL_TEST_BASE_URL ?? 'http://localhost:3000'
const id = '11111111-1111-4111-8111-111111111111'
const account = {
  id,
  email: 'editor@example.test',
  role: 'editor',
  isSuper: true,
  educationLevels: ['SD'],
}
const book = {
  id,
  title: 'Buku beberapa penulis',
  author: 'Dr. Sari, M.Pd.; Budi Santoso; Citra',
  bookCode: '123456789',
  educationLevel: 'SD',
  grade: 1,
  subject: 'Matematika',
  publicationYear: 2026,
  price: 0,
  published: false,
  resources: {},
}
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage()
  const mutations = []
  await page.route('**/api/admin/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() !== 'GET') {
      mutations.push({ method: request.method(), body: request.postDataJSON() })
      // Keep the form open to inspect the submitted payload without changing live data.
      return route.fulfill({
        status: 400,
        json: { statusMessage: 'Respons uji, data tidak disimpan.' },
      })
    }
    if (path === '/api/admin/editor-session') return route.fulfill({ json: account })
    if (path === '/api/admin/book-options') return route.fulfill({ json: { account } })
    if (path === `/api/admin/books/${id}`) return route.fulfill({ json: { account, book } })
    return route.fulfill({ json: { account, books: [], total: 0 } })
  })
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction(() => document.querySelector('#__nuxt')?.__vue_app__)
  const navigate = (path) =>
    page.evaluate((destination) => {
      return document
        .querySelector('#__nuxt')
        .__vue_app__.config.globalProperties.$router.push(destination)
    }, path)
  await navigate('/admin/books/new')
  const inputs = page.locator('input[id^="new-book-author"]')
  const add = page.getByRole('button', { name: 'Tambah penulis' })
  const submit = () => page.locator('.create-book-form').evaluate((form) => form.requestSubmit())
  await inputs.first().waitFor()
  assert.equal(await inputs.count(), 1)
  assert.equal(await page.getByRole('button', { name: /Hapus penulis/ }).count(), 0)
  await page.locator('#new-book-title').fill(book.title)
  await page.locator('#new-book-code').fill(book.bookCode)
  await page.locator('#new-book-year').fill('2026')
  await page.locator('#new-book-level').selectOption('SD')
  await page.locator('#new-book-grade').selectOption('1')
  await page.locator('#new-book-subject').selectOption('Matematika')
  await inputs.first().fill('  Dr. Sari, M.Pd.  ')
  await add.click()
  assert.equal(await inputs.nth(1).evaluate((input) => input === document.activeElement), true)
  await inputs.nth(1).fill('Budi Santoso')
  await add.click()
  await inputs.nth(2).fill('Salah pencet')
  await add.click()
  await inputs.nth(3).fill('Citra')
  await page.getByRole('button', { name: 'Hapus penulis 3', exact: true }).click()
  assert.deepEqual(await inputs.evaluateAll((nodes) => nodes.map((node) => node.value)), [
    '  Dr. Sari, M.Pd.  ',
    'Budi Santoso',
    'Citra',
  ])
  await add.click()
  await submit()
  await page.getByRole('alert').filter({ hasText: 'Respons uji' }).waitFor()
  assert.equal(mutations.length, 1)
  assert.equal(mutations[0].method, 'POST')
  assert.equal(mutations[0].body.author, book.author)
  await inputs.nth(1).fill('B'.repeat(200))
  await submit()
  await page.locator('#new-book-author-error').waitFor()
  assert.match(await page.locator('#new-book-author-error').innerText(), /200/)
  assert.equal(mutations.length, 1)
  await inputs.first().fill('   ')
  await submit()
  await page.getByText('Penulis pertama wajib diisi.', { exact: true }).waitFor()
  assert.equal(mutations.length, 1)
  console.log(
    'PASS create: add/remove, focus, stable values, blank rows, payload, length and required validation',
  )

  await navigate(`/admin/books/${id}`)
  await page.waitForFunction(
    () => document.querySelector('#new-book-author')?.value === 'Dr. Sari, M.Pd.',
  )
  assert.deepEqual(
    await inputs.evaluateAll((nodes) => nodes.map((node) => node.value)),
    book.author.split('; '),
  )
  await page.getByRole('button', { name: 'Hapus penulis 2', exact: true }).click()
  await submit()
  await page.getByRole('alert').filter({ hasText: 'Respons uji' }).waitFor()
  assert.equal(mutations.length, 2)
  assert.equal(mutations[1].method, 'PUT')
  assert.equal(mutations[1].body.author, 'Dr. Sari, M.Pd.; Citra')
  book.author = 'Penulis Lama, M.Pd.'
  await navigate('/admin/books/new')
  await inputs.first().waitFor()
  await navigate(`/admin/books/${id}`)
  await page.waitForFunction(
    () => document.querySelector('#new-book-author')?.value === 'Penulis Lama, M.Pd.',
  )
  assert.equal(await inputs.count(), 1)
  console.log(
    'PASS edit: multiple authors restored, removal saved, legacy name and commas preserved',
  )
} finally {
  await browser.close()
}
