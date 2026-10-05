import { loadEnvFile } from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

// Explicit integration check against the configured project. Only uniquely named
// test books, images, and one temporary scoped Editor are created and cleaned up.
loadEnvFile('.env')
const base = process.env.EDITOR_TEST_BASE_URL || 'http://localhost:3000'
const nativeFetch = globalThis.fetch
globalThis.fetch = (input, init) =>
  nativeFetch(input, { ...init, signal: AbortSignal.timeout(20000) })
const url = process.env.NUXT_PUBLIC_SUPABASE_URL
const key = process.env.NUXT_PUBLIC_SUPABASE_KEY
const secret = process.env.SUPABASE_SECRET_KEY
class CheckError extends Error {}
function check(value, label) {
  if (!value) throw new CheckError(label)
}
const clients = []
const ids = new Set()
const images = new Set()
let temporaryUser
let admin

async function login(email, password) {
  const jar = new Map()
  const client = createServerClient(url, key, {
    cookieOptions: { name: 'sb-kppproduksatu' },
    cookies: {
      getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
      setAll: (entries) => entries.forEach(({ name, value }) => jar.set(name, value)),
    },
  })
  const { error } = await client.auth.signInWithPassword({ email, password })
  check(!error, 'Login untuk pengujian gagal')
  clients.push(client)
  return { client, cookie: () => Array.from(jar, ([name, value]) => `${name}=${value}`).join('; ') }
}
async function api(session, path, method = 'GET', body, expected = 200, type = 'application/json') {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(session ? { Cookie: session.cookie() } : {}),
      ...(body === undefined ? {} : { 'Content-Type': type }),
    },
    ...(body === undefined
      ? {}
      : { body: type === 'application/json' ? JSON.stringify(body) : body }),
    redirect: 'manual',
  })
  check(
    response.status === expected,
    `${method} ${path.split('?')[0]}: status ${response.status}, diharapkan ${expected}`,
  )
  if (response.headers.get('content-type')?.includes('application/json')) return response.json()
  return response.text()
}
function dbRow(input) {
  return {
    book_code: input.bookCode,
    education_level: input.educationLevel,
    title: input.title,
    slug: input.slug,
    author: input.author,
    description: input.description,
    price: input.price,
    category_id: input.categoryId,
    featured: input.featured,
    published: input.published,
  }
}

async function main() {
  check(url && key && secret, 'Konfigurasi Supabase untuk pengujian belum lengkap')
  admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
  const snapshot = await admin
    .from('products')
    .select('id,slug,book_code,education_level')
    .order('id')
  check(!snapshot.error, 'Migration Editor belum tersedia')
  console.log('CHECK akun super, API, dan SSR')
  const editor = await login(
    process.env.SUPER_ACCOUNT_EDITOR_EMAIL,
    process.env.SUPER_ACCOUNT_EDITOR_PASSWORD,
  )
  const sales = await login(
    process.env.SUPER_ACCOUNT_SALES_EMAIL,
    process.env.SUPER_ACCOUNT_SALES_PASSWORD,
  )
  await api(null, '/api/admin/books', 'GET', undefined, 401)
  await api(sales, '/api/admin/books', 'GET', undefined, 403)
  await api(sales, '/admin', 'GET', undefined, 403)
  const dashboard = await api(editor, '/api/admin/books')
  check(
    dashboard.account.role === 'editor' && dashboard.account.isSuper,
    'Akun super Editor tidak terverifikasi',
  )
  check((await api(editor, '/admin')).includes('Dashboard Editor'), 'SSR dashboard gagal')
  check((await api(editor, '/admin/books/new')).includes('Kode buku'), 'SSR formulir tambah gagal')
  check(
    (await api(editor, '/')).includes('Dashboard Editor'),
    'Tautan dashboard Editor tidak tersedia',
  )
  check(!(await api(sales, '/')).includes('Dashboard Editor'), 'Tautan Editor terlihat oleh Sales')
  const suffix = crypto.randomUUID().slice(0, 8)
  const input = {
    bookCode: `TEST-${suffix}`.toUpperCase(),
    educationLevel: 'SD',
    title: `Buku uji ${suffix}`,
    slug: `buku-uji-${suffix}`,
    author: 'Pengujian',
    description: 'Data sementara untuk verifikasi.',
    price: 12345,
    categoryId: null,
    featured: false,
    published: false,
  }
  await api(sales, '/api/admin/books', 'POST', input, 403)
  await api(editor, '/api/admin/books', 'POST', { ...input, price: -1 }, 400)
  const created = await api(editor, '/api/admin/books', 'POST', input, 201)
  ids.add(created.id)
  await api(editor, '/api/admin/books', 'POST', input, 409)
  await api(null, `/api/products/${input.slug}`, 'GET', undefined, 404)
  const list = await api(editor, `/api/admin/books?q=${input.bookCode}&level=SD&status=draft`)
  check(list.total === 1 && list.books[0].id === created.id, 'Pencarian/filter Editor gagal')
  const edited = await api(editor, `/api/admin/books/${created.id}`, 'PUT', {
    ...input,
    published: true,
    price: 54321,
  })
  check(edited.price === 54321 && edited.published, 'Edit/publikasi buku gagal')
  const published = await api(null, `/api/products/${input.slug}`)
  check(
    published.bookCode === input.bookCode && published.educationLevel === 'SD',
    'Identitas buku publik tidak sesuai',
  )
  check(
    (await api(null, `/api/products?q=${input.bookCode}&level=SD`)).products.some(
      (book) => book.id === created.id,
    ),
    'Pencarian kode publik gagal',
  )
  check(
    !(await api(null, `/api/products?q=${input.bookCode}&level=SMA`)).products.length,
    'Filter jenjang publik gagal',
  )
  check(
    (await api(editor, `/admin/books/${created.id}`)).includes(input.bookCode),
    'SSR edit buku gagal',
  )
  console.log('PASS tambah, validasi, duplikasi, edit, publikasi, pencarian, filter, dan SSR')

  console.log('CHECK unggahan sampul')
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=',
    'base64',
  )
  await api(
    editor,
    `/api/admin/books/${created.id}/image`,
    'POST',
    new TextEncoder().encode('bukan berkas PNG yang valid'),
    400,
    'image/png',
  )
  await api(
    editor,
    `/api/admin/books/${created.id}/image`,
    'POST',
    new Uint8Array(2 * 1024 * 1024 + 1),
    413,
    'image/png',
  )
  const cover = await api(
    editor,
    `/api/admin/books/${created.id}/image`,
    'POST',
    png,
    200,
    'image/png',
  )
  const imagePath = decodeURIComponent(
    new URL(cover.imageUrl).pathname.split('/product-images/')[1],
  )
  images.add(imagePath)
  check(
    imagePath.startsWith(`books/${created.id}/`) && (await fetch(cover.imageUrl)).ok,
    'Sampul tidak tersedia',
  )
  console.log('PASS sampul valid, MIME palsu ditolak, batas ukuran 2 MB')

  console.log('CHECK Editor terbatas dan RLS langsung')
  const email = `editor-test-${suffix}@example.com`
  const password = `${crypto.randomUUID()}Aa1!`
  const userResult = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  check(!userResult.error && userResult.data.user, 'Akun Editor sementara gagal dibuat')
  temporaryUser = userResult.data.user.id
  check(
    !(
      await admin
        .from('account_memberships')
        .insert({ user_id: temporaryUser, role: 'editor', is_super: false })
    ).error,
    'Membership Editor uji gagal',
  )
  check(
    !(await admin.from('editor_scopes').insert({ user_id: temporaryUser, education_level: 'SD' }))
      .error,
    'Scope Editor uji gagal',
  )
  const scoped = await login(email, password)
  const outsideInput = {
    ...input,
    bookCode: `${input.bookCode}-SMA`,
    slug: `${input.slug}-sma`,
    educationLevel: 'SMA',
  }
  const outside = await api(editor, '/api/admin/books', 'POST', outsideInput, 201)
  ids.add(outside.id)
  check(
    (await api(scoped, '/admin')).includes('Dashboard Editor'),
    'Editor biasa tidak dapat membuka dashboard',
  )
  const scopedList = await api(scoped, '/api/admin/books')
  check(
    scopedList.books.every((book) => book.educationLevel === 'SD') &&
      scopedList.books.some((book) => book.id === created.id),
    'Daftar Editor tidak terbatas jenjang',
  )
  await api(scoped, '/api/admin/books?level=SMA', 'GET', undefined, 403)
  await api(scoped, `/api/admin/books/${outside.id}`, 'GET', undefined, 404)
  await api(scoped, `/api/admin/books/${outside.id}`, 'PUT', outsideInput, 404)
  await api(scoped, `/api/admin/books/${outside.id}`, 'DELETE', undefined, 404)
  await api(scoped, `/api/admin/books/${outside.id}/image`, 'POST', png, 404, 'image/png')
  await api(
    scoped,
    `/api/admin/books/${created.id}`,
    'PUT',
    { ...input, educationLevel: 'SMA' },
    403,
  )
  const scopedInput = { ...input, bookCode: `${input.bookCode}-SD`, slug: `${input.slug}-sd` }
  const scopedBook = await api(scoped, '/api/admin/books', 'POST', scopedInput, 201)
  ids.add(scopedBook.id)
  await api(scoped, `/api/admin/books/${scopedBook.id}`, 'PUT', { ...scopedInput, price: 20000 })
  const rawOutside = await scoped.client.from('products').select('id').eq('id', outside.id)
  check(!rawOutside.error && rawOutside.data.length === 0, 'RLS draft luar jenjang bocor')
  const rawMove = await scoped.client
    .from('products')
    .update({ education_level: 'SMA' })
    .eq('id', scopedBook.id)
  check(rawMove.error?.code === '42501', 'RLS pemindahan jenjang tidak ditolak')
  const rawInsert = await scoped.client.from('products').insert({
    ...dbRow(outsideInput),
    book_code: `${input.bookCode}-DENY`,
    slug: `${input.slug}-deny`,
  })
  check(rawInsert.error?.code === '42501', 'RLS insert luar jenjang tidak ditolak')
  const rawSales = await sales.client
    .from('products')
    .insert({ ...dbRow(input), book_code: `${input.bookCode}-SALES`, slug: `${input.slug}-sales` })
  check(rawSales.error?.code === '42501', 'RLS write Sales tidak ditolak')
  const deniedImagePath = `books/${outside.id}/${crypto.randomUUID()}.png`
  const deniedImage = await scoped.client.storage
    .from('product-images')
    .upload(deniedImagePath, png, { contentType: 'image/png' })
  if (!deniedImage.error) images.add(deniedImagePath)
  check(deniedImage.error, 'RLS upload luar jenjang tidak ditolak')
  await api(scoped, `/api/admin/books/${scopedBook.id}`, 'DELETE')
  ids.delete(scopedBook.id)
  await api(editor, `/api/admin/books/${created.id}`, 'DELETE')
  ids.delete(created.id)
  await api(null, `/api/products/${input.slug}`, 'GET', undefined, 404)
  console.log('PASS CRUD Editor SD, pembatasan API/RLS lintas jenjang, Sales ditolak, hapus buku')
  for (const path of [
    '/',
    '/products',
    '/products/ruang-untuk-bertumbuh',
    '/api/products',
    '/api/products?q=Ruang',
    '/api/products/ruang-untuk-bertumbuh',
    '/healthz',
  ])
    await api(null, path)
  await api(null, '/products/buku-tidak-ada', 'GET', undefined, 404)
  const after = await admin
    .from('products')
    .select('id,slug,book_code,education_level')
    .in(
      'id',
      snapshot.data.map((book) => book.id),
    )
    .order('id')
  check(
    !after.error && JSON.stringify(after.data) === JSON.stringify(snapshot.data),
    'Identitas/referensi buku lama berubah',
  )
  console.log('PASS katalog publik, 404, health, serta identitas buku lama tetap utuh')
}

try {
  await main()
} catch (error) {
  console.error(
    error instanceof CheckError ? error.message : 'Pengujian gagal tanpa menampilkan kredensial.',
  )
  process.exitCode = 1
} finally {
  let cleaned = true
  if (admin) {
    if (images.size)
      cleaned = !(await admin.storage.from('product-images').remove([...images])).error && cleaned
    if (ids.size)
      cleaned =
        !(
          await admin
            .from('products')
            .delete()
            .in('id', [...ids])
        ).error && cleaned
    if (temporaryUser)
      cleaned = !(await admin.auth.admin.deleteUser(temporaryUser)).error && cleaned
  }
  for (const client of clients) await client.auth.signOut({ scope: 'local' }).catch(() => {})
  if (cleaned) console.log('CLEANUP data uji selesai')
  else {
    console.error('Pembersihan data uji belum lengkap.')
    process.exitCode = 1
  }
}
