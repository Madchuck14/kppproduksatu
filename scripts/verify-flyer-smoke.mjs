import assert from 'node:assert/strict'

const base = process.env.FLYER_TEST_BASE_URL ?? 'http://localhost:3100'
async function get(route, expected = 200) {
  const response = await fetch(`${base}${route}`, { redirect: 'manual' })
  assert.equal(response.status, expected, `${route}: expected ${expected}, got ${response.status}`)
  return response
}
const catalog = await (await get('/api/products')).json()
const book = catalog.products[0]
assert.ok(book, 'Smoke test requires at least one published/demo book')
const slug = encodeURIComponent(book.slug)
for (const route of [
  '/',
  '/products',
  `/products/${slug}`,
  `/api/products/${slug}`,
  '/healthz',
  '/login',
])
  await get(route)
await get('/api/products?q=matematika')
await get('/products/definitely-missing-flyer-smoke', 404)
await get('/api/products/definitely-missing-flyer-smoke', 404)
for (const kind of ['flyer', 'dummy', 'product-knowledge']) {
  await get(`/api/products/${slug}/resources/${kind}?preview=1`, 401)
  await get(`/api/products/${slug}/resources/${kind}?download=1`, 401)
}
await get(`/api/products/${slug}/resources/invalid?preview=1`, 400)
await get('/api/auth/session', 401)
await get('/api/admin/books', 401)
const page = await (await get(`/products/${slug}`)).text()
assert.ok(page.includes('Login untuk membuka materi promosi'))
assert.ok(page.includes('returnTo='), 'Login retains the destination')
assert.equal(
  page.includes('/storage/v1/object/sign/book-materials'),
  false,
  'Anonymous SSR contains no material signed URLs',
)
console.log(
  'PASS: landing, catalog/search, detail API/SSR, missing-book 404, healthz, login, anonymous admin/session denial, all material preview/download 401, destination link, and no private signed URLs in anonymous SSR.',
)
console.log(
  'Anonymous smoke only; authenticated upload, Storage/RLS, and browser interactions need a migrated Supabase test project.',
)
