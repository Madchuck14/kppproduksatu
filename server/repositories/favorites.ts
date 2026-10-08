import { serverSupabaseClient } from '#supabase/server'
import type { H3Event } from 'h3'
import { z } from 'zod'
import type { FavoriteQuery } from '#shared/schemas/favorites'
import type { FavoriteIds, FavoriteList } from '#shared/types/favorite'
import type { FavoriteDatabase } from '#shared/types/favorite-database'
import { mapProductRow, productColumns } from './products'

// Favorites are available to every authenticated user, independent of Editor privileges.
async function favoriteSession(event: H3Event) {
  const client = await serverSupabaseClient<FavoriteDatabase>(event)
  const {
    data: { user },
    error,
  } = await client.auth.getUser()
  if (error || !user) throw createError({ statusCode: 401, statusMessage: 'Silakan login' })
  if (useRuntimeConfig(event).catalogSource !== 'supabase') {
    throw createError({ statusCode: 503, statusMessage: 'Favorit memerlukan katalog Supabase' })
  }
  return { client, user }
}

function fail(error: { code?: string } | null) {
  if (!error) return
  if (error.code === '42501')
    throw createError({ statusCode: 403, statusMessage: 'Buku tidak dapat ditambahkan ke favorit' })
  if (error.code === '23503')
    throw createError({ statusCode: 404, statusMessage: 'Buku tidak ditemukan' })
  throw createError({ statusCode: 503, statusMessage: 'Favorit belum dapat diproses' })
}

export async function listFavoriteIds(event: H3Event): Promise<FavoriteIds> {
  const { client, user } = await favoriteSession(event)
  const ids: string[] = []
  // Supabase can cap each response; page through IDs so older favorites keep their state.
  const batchSize = 500
  for (let offset = 0; ; offset += batchSize) {
    const { data, error } = await client
      .from('product_favorites')
      .select('product_id,product:products!inner(id)')
      .eq('user_id', user.id)
      .eq('product.published', true)
      .order('product_id')
      .range(offset, offset + batchSize - 1)
    if (error?.code === 'PGRST103' && offset > 0) break
    fail(error)
    const rows = z.array(z.object({ product_id: z.string().uuid() })).parse(data ?? [])
    ids.push(...rows.map((row) => row.product_id))
    if (rows.length < batchSize) break
  }
  return { ownerId: user.id, ids }
}

export async function listFavorites(event: H3Event, options: FavoriteQuery): Promise<FavoriteList> {
  const { client, user } = await favoriteSession(event)
  const pageSize = 24
  function filtered() {
    let query = client
      .from('product_favorites')
      .select(`product:products!inner(${productColumns})`, { count: 'exact' })
      .eq('user_id', user.id)
      .eq('product.published', true)
    const search = options.q.replace(/[^\p{L}\p{N}\s._-]/gu, '').trim()
    if (search)
      query = query.or(
        `title.ilike.%${search}%,author.ilike.%${search}%,book_code.ilike.%${search}%`,
        { referencedTable: 'product' },
      )
    if (options.level) query = query.eq('product.education_level', options.level)
    return query
  }
  const { data, error, count } = await filtered()
    .order('created_at', { ascending: false })
    .order('product_id')
    .range((options.page - 1) * pageSize, options.page * pageSize - 1)
  // PostgREST can reject an offset beyond the last row when exact count is requested.
  if (error?.code === 'PGRST103') {
    const firstPage = await filtered().limit(1)
    fail(firstPage.error)
    return {
      ownerId: user.id,
      products: [],
      total: firstPage.count ?? 0,
      page: options.page,
      pageSize,
    }
  }
  fail(error)
  const rows = z.array(z.object({ product: z.unknown() })).parse(data ?? [])
  return {
    ownerId: user.id,
    products: rows.map((row) => mapProductRow(event, row.product)),
    total: count ?? 0,
    page: options.page,
    pageSize,
  }
}

export async function saveFavorite(event: H3Event, productId: string) {
  const { client, user } = await favoriteSession(event)
  const book = await client
    .from('products')
    .select('id')
    .eq('id', productId)
    .eq('published', true)
    .maybeSingle()
  fail(book.error)
  if (!book.data) throw createError({ statusCode: 404, statusMessage: 'Buku tidak ditemukan' })
  // Duplicate requests succeed without changing the saved timestamp or requiring UPDATE permission.
  const { error } = await client
    .from('product_favorites')
    .insert({ user_id: user.id, product_id: productId })
  if (error?.code !== '23505') fail(error)
  return { productId, favorite: true }
}

export async function removeFavorite(event: H3Event, productId: string) {
  const { client, user } = await favoriteSession(event)
  const { error } = await client
    .from('product_favorites')
    .delete()
    .eq('user_id', user.id)
    .eq('product_id', productId)
  fail(error)
  return { productId, favorite: false }
}
