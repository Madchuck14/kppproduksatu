import { loadEnvFile } from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import assert from 'node:assert/strict'

// Run explicitly against a test project with the favorites migration applied.
// Only uniquely named temporary users/books are created, then removed in finally.
loadEnvFile('.env')
const base = process.env.FAVORITES_TEST_BASE_URL || 'http://localhost:3000'
const url = process.env.NUXT_PUBLIC_SUPABASE_URL
const key = process.env.NUXT_PUBLIC_SUPABASE_KEY
const secret = process.env.SUPABASE_SECRET_KEY
const users = []
const books = []
const sessions = []
let admin
function check(value, label) {
  assert.ok(value, label)
}
async function api(session, path, method = 'GET', expected = 200) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: session ? { Cookie: session.cookie() } : {},
    signal: AbortSignal.timeout(20000),
    redirect: 'manual',
  })
  check(
    response.status === expected,
    `${method} ${path}: ${response.status}, diharapkan ${expected}`,
  )
  return response.headers.get('content-type')?.includes('application/json')
    ? response.json()
    : response.text()
}
async function account(role) {
  const password = `${crypto.randomUUID()}Aa1!`
  const email = `favorite-${crypto.randomUUID()}@example.com`
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  check(!created.error && created.data.user, 'Akun uji gagal dibuat')
  const id = created.data.user.id
  users.push(id)
  if (role) {
    const membership = await admin
      .from('account_memberships')
      .insert({ user_id: id, role, is_super: role === 'editor' })
    check(!membership.error, 'Membership uji gagal dibuat')
  }
  const jar = new Map()
  const client = createServerClient(url, key, {
    cookieOptions: { name: 'sb-kppproduksatu' },
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (entries) => entries.forEach(({ name, value }) => jar.set(name, value)),
    },
  })
  check(!(await client.auth.signInWithPassword({ email, password })).error, 'Login uji gagal')
  const session = {
    id,
    client,
    cookie: () => [...jar].map(([name, value]) => `${name}=${value}`).join('; '),
  }
  sessions.push(session)
  return session
}
async function main() {
  check(url && key && secret, 'Konfigurasi pengujian belum lengkap')
  admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
  check(
    !(await admin.from('product_favorites').select('product_id').limit(1)).error,
    'Migration favorit belum tersedia; tidak ada data uji dibuat',
  )
  const catalog = await api(null, '/api/products')
  check(catalog.source === 'supabase', 'Server uji harus memakai katalog Supabase')
  const sales = await account('sales')
  const editor = await account('editor')
  const ordinary = await account()
  check((await api(sales, '/api/auth/session')).role === 'sales', 'Session Sales gagal')
  check((await api(editor, '/api/auth/session')).role === 'editor', 'Session Editor gagal')
  await api(ordinary, '/api/auth/session', 'GET', 403)
  await api(sales, '/api/admin/books', 'GET', 403)
  await api(editor, '/api/admin/books')
  await api(null, '/api/admin/books', 'GET', 401)
  const suffix = crypto.randomUUID().slice(0, 8)
  for (const [published, level] of [
    [true, 'SD'],
    [true, 'SMA'],
    [false, 'SD'],
  ]) {
    const result = await admin
      .from('products')
      .insert({
        title: `Favorit uji ${suffix} ${books.length}`,
        slug: `favorit-uji-${suffix}-${books.length}`,
        book_code: `${Date.now()}${books.length}`,
        education_level: level,
        author: 'Pengujian favorit',
        description: 'Buku sementara untuk verifikasi.',
        price: 12000,
        published,
        featured: false,
      })
      .select('id,slug,book_code')
      .single()
    check(!result.error && result.data, 'Buku uji gagal dibuat')
    books.push(result.data)
  }
  const [sd, sma, draft] = books
  for (const path of [
    '/',
    '/products',
    '/login',
    `/products/${sd.slug}`,
    `/api/products/${sd.slug}`,
    '/healthz',
  ])
    await api(null, path)
  await api(null, '/products/favorit-buku-tidak-ada', 'GET', 404)
  for (const method of ['GET', 'PUT', 'DELETE'])
    await api(null, method === 'GET' ? '/api/favorites' : `/api/favorites/${sd.id}`, method, 401)
  await api(null, '/api/favorites/ids', 'GET', 401)
  await api(sales, '/api/favorites/not-a-uuid', 'PUT', 400)
  await api(sales, '/api/favorites?page=0', 'GET', 400)
  for (const session of [sales, editor, ordinary]) {
    await api(session, `/api/favorites/${sd.id}`, 'PUT')
    await api(session, `/api/favorites/${sd.id}`, 'PUT')
    check((await api(session, '/api/favorites')).total === 1, 'Favorit duplikat atau role ditolak')
    await api(session, `/api/favorites/${draft.id}`, 'PUT', 404)
  }
  await api(sales, `/api/favorites/${sma.id}`, 'PUT')
  check(
    (await api(sales, `/api/favorites?q=${sma.book_code}&level=SMA`)).products[0]?.id === sma.id,
    'Pencarian kode/filter gagal',
  )
  check((await api(sales, '/api/favorites?level=SD')).total === 1, 'Filter jenjang gagal')
  check((await api(sales, '/api/favorites?page=2')).products.length === 0, 'Pagination gagal')
  check((await api(editor, '/api/favorites')).total === 1, 'Favorit akun lain bocor')
  const foreign = await editor.client
    .from('product_favorites')
    .select('product_id')
    .eq('user_id', sales.id)
  check(!foreign.error && foreign.data.length === 0, 'RLS baca lintas akun bocor')
  const forged = await editor.client
    .from('product_favorites')
    .insert({ user_id: sales.id, product_id: draft.id })
  check(forged.error?.code === '42501', 'RLS pemalsuan pemilik tidak ditolak')
  const rawDraft = await editor.client
    .from('product_favorites')
    .insert({ user_id: editor.id, product_id: draft.id })
  check(rawDraft.error?.code === '42501', 'RLS favorit draft tidak ditolak')
  check(
    !(await editor.client.from('product_favorites').delete().eq('user_id', sales.id)).error,
    'RLS delete gagal',
  )
  check((await api(sales, '/api/favorites')).total === 2, 'RLS mengizinkan hapus favorit akun lain')
  check(
    !(await admin.from('products').update({ published: false }).eq('id', sd.id)).error,
    'Unpublish uji gagal',
  )
  check((await api(editor, '/api/favorites')).total === 0, 'Draft bocor ke favorit Editor')
  check(!(await api(editor, '/api/favorites/ids')).ids.includes(sd.id), 'ID draft masih terlihat')
  await api(editor, `/api/favorites/${sd.id}`, 'DELETE')
  await api(editor, `/api/favorites/${sd.id}`, 'DELETE')
  check(
    !(await admin.from('products').update({ published: true }).eq('id', sd.id)).error,
    'Republish uji gagal',
  )
  const favoritePage = await api(sales, '/favorites')
  check(favoritePage.includes(sd.slug), 'SSR favorit gagal')
  check(favoritePage.includes('aria-pressed="true"'), 'Status tombol favorit pada SSR gagal')
  check(
    (await api(null, '/favorites')).includes('Login untuk membuka favorit'),
    'State anonim gagal',
  )
  check(!(await admin.from('products').delete().eq('id', sma.id)).error, 'Hapus buku uji gagal')
  const remaining = await admin
    .from('product_favorites')
    .select('product_id')
    .eq('product_id', sma.id)
  check(!remaining.error && remaining.data.length === 0, 'Cascade hapus buku gagal')
  console.log(
    'PASS favorit Sales/Editor/akun biasa, idempotensi, pencarian/filter/pagination, SSR, published-only, RLS lintas akun, cascade',
  )
}
try {
  await main()
} catch (error) {
  console.error(
    error instanceof assert.AssertionError
      ? error.message
      : 'Pengujian gagal tanpa menampilkan kredensial.',
  )
  process.exitCode = 1
} finally {
  let cleaned = true
  for (const session of sessions)
    await session.client.auth.signOut({ scope: 'local' }).catch(() => {})
  if (admin) {
    if (books.length)
      cleaned =
        !(
          await admin
            .from('products')
            .delete()
            .in(
              'id',
              books.map((book) => book.id),
            )
        ).error && cleaned
    for (const id of users) cleaned = !(await admin.auth.admin.deleteUser(id)).error && cleaned
  }
  if (!cleaned) {
    console.error('Pembersihan data uji belum lengkap.')
    process.exitCode = 1
  } else if (users.length || books.length) console.log('CLEANUP data uji selesai')
}
