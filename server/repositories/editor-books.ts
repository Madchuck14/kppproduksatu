import { serverSupabaseClient } from '#supabase/server'
import type { H3Event } from 'h3'
import type { EditorDatabase } from '#shared/types/editor-database'
import { z } from 'zod'
import type { AccountSession } from '#shared/types/account'
import type { EditorBook, EditorDashboard } from '#shared/types/editor'
import type { BookInput, EditorQuery } from '#shared/schemas/editor'
import { educationLevelSchema } from '#shared/schemas/auth'
import { assertBookScope } from '../utils/require-editor'
import { getProductImageUrl } from '../utils/storage'

const columns =
  'id,book_code,education_level,title,slug,author,description,price,category_id,featured,published,image_path,updated_at'
const rowSchema = z.object({
  id: z.string().uuid(),
  book_code: z.string().nullable(),
  education_level: educationLevelSchema.nullable(),
  title: z.string(),
  slug: z.string(),
  author: z.string(),
  description: z.string(),
  price: z.number(),
  category_id: z.string().uuid().nullable(),
  featured: z.boolean(),
  published: z.boolean(),
  image_path: z.string().nullable(),
  updated_at: z.string(),
})

function fail(error: { code?: string } | null) {
  if (!error) return
  if (error.code === '23505')
    throw createError({
      statusCode: 409,
      statusMessage: 'Kode buku atau alamat halaman sudah digunakan',
    })
  if (error.code === '42501')
    throw createError({
      statusCode: 403,
      statusMessage: 'Anda tidak memiliki izin untuk perubahan ini',
    })
  if (error.code === '23503')
    throw createError({
      statusCode: 400,
      statusMessage: 'Kategori tidak ditemukan. Muat ulang formulir.',
    })
  throw createError({
    statusCode: 503,
    statusMessage: 'Data buku belum dapat diproses. Pastikan migration Editor sudah diterapkan.',
  })
}

function mapBook(event: H3Event, value: unknown): EditorBook {
  const row = rowSchema.parse(value)
  return {
    id: row.id,
    bookCode: row.book_code,
    educationLevel: row.education_level,
    title: row.title,
    slug: row.slug,
    author: row.author,
    description: row.description,
    price: row.price,
    categoryId: row.category_id,
    featured: row.featured,
    published: row.published,
    imageUrl: getProductImageUrl(useRuntimeConfig(event).public.supabase.url, row.image_path),
    updatedAt: row.updated_at,
  }
}

function toRow(input: BookInput) {
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

export async function editorCategories(event: H3Event) {
  const client = await serverSupabaseClient<EditorDatabase>(event)
  const { data, error } = await client.from('categories').select('id,name').order('name')
  fail(error)
  return z.array(z.object({ id: z.string().uuid(), name: z.string() })).parse(data)
}

export async function listEditorBooks(
  event: H3Event,
  account: AccountSession,
  options: EditorQuery,
): Promise<EditorDashboard> {
  const client = await serverSupabaseClient<EditorDatabase>(event)
  const pageSize = 12
  if (options.level) assertBookScope(account, options.level)
  const scoped = () => {
    let query = client.from('products').select(columns, { count: 'exact' })
    if (!account.isSuper) query = query.in('education_level', account.educationLevels)
    return query
  }
  const count = () => {
    let query = client.from('products').select('id', { count: 'exact', head: true })
    if (!account.isSuper) query = query.in('education_level', account.educationLevels)
    return query
  }
  let query = scoped()
    .order('updated_at', { ascending: false })
    .order('id')
    .range((options.page - 1) * pageSize, options.page * pageSize - 1)
  const search = options.q.replace(/[^\p{L}\p{N}\s._-]/gu, '').trim()
  if (search)
    query = query.or(`title.ilike.%${search}%,book_code.ilike.%${search}%,author.ilike.%${search}%`)
  if (options.level) query = query.eq('education_level', options.level)
  if (options.status !== 'all') query = query.eq('published', options.status === 'published')
  const [list, all, published, incomplete, categories] = await Promise.all([
    query,
    count(),
    count().eq('published', true),
    count().or('book_code.is.null,education_level.is.null'),
    editorCategories(event),
  ])
  for (const result of [list, all, published, incomplete]) fail(result.error)
  return {
    account,
    books: (list.data ?? []).map((row) => mapBook(event, row)),
    categories,
    total: list.count ?? 0,
    page: options.page,
    pageSize,
    stats: {
      total: all.count ?? 0,
      published: published.count ?? 0,
      draft: (all.count ?? 0) - (published.count ?? 0),
      incomplete: incomplete.count ?? 0,
    },
  }
}

export async function getEditorBook(event: H3Event, account: AccountSession, id: string) {
  const client = await serverSupabaseClient<EditorDatabase>(event)
  let query = client.from('products').select(columns).eq('id', id)
  if (!account.isSuper) query = query.in('education_level', account.educationLevels)
  const { data, error } = await query.maybeSingle()
  fail(error)
  if (!data)
    throw createError({
      statusCode: 404,
      statusMessage: 'Buku tidak ditemukan atau di luar akses Anda',
    })
  const book = mapBook(event, data)
  assertBookScope(account, book.educationLevel)
  return book
}

export async function saveEditorBook(
  event: H3Event,
  account: AccountSession,
  input: BookInput,
  id?: string,
) {
  if (id) await getEditorBook(event, account, id)
  assertBookScope(account, input.educationLevel)
  const client = await serverSupabaseClient<EditorDatabase>(event)
  const query = id
    ? client.from('products').update(toRow(input)).eq('id', id)
    : client.from('products').insert(toRow(input))
  const { data, error } = await query.select(columns).maybeSingle()
  fail(error)
  if (!data)
    throw createError({
      statusCode: 409,
      statusMessage: 'Buku telah berubah atau akses Anda dicabut. Muat ulang halaman.',
    })
  return mapBook(event, data)
}

export async function deleteEditorBook(event: H3Event, account: AccountSession, id: string) {
  await getEditorBook(event, account, id)
  const client = await serverSupabaseClient<EditorDatabase>(event)
  const { data, error } = await client
    .from('products')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle()
  fail(error)
  if (!data)
    throw createError({
      statusCode: 409,
      statusMessage: 'Buku sudah dihapus atau akses Anda berubah',
    })
}

export async function setEditorBookImage(
  event: H3Event,
  account: AccountSession,
  id: string,
  path: string,
) {
  await getEditorBook(event, account, id)
  const client = await serverSupabaseClient<EditorDatabase>(event)
  const { data, error } = await client
    .from('products')
    .update({ image_path: path })
    .eq('id', id)
    .select(columns)
    .maybeSingle()
  fail(error)
  if (!data)
    throw createError({
      statusCode: 409,
      statusMessage: 'Buku sudah dihapus atau akses Anda berubah',
    })
  return mapBook(event, data)
}
