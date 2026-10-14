import { serverSupabaseClient } from '#supabase/server'
import type { H3Event } from 'h3'
import type { EditorDatabase } from '#shared/types/editor-database'
import type { BookResourceKind } from '../utils/book-resource'
import { bookResourceColumns, bookResourceExtensionSchema } from '../utils/book-resource'
import { getCatalogClient } from '../utils/catalog-client'
import { getProduct } from './products'

export async function getBookResource(
  event: H3Event,
  slug: string,
  kind: BookResourceKind,
  preview = false,
) {
  const protectedClient =
    kind === 'dummy' ? await serverSupabaseClient<EditorDatabase>(event) : null
  if (protectedClient) {
    const {
      data: { user },
      error: authError,
    } = await protectedClient.auth.getUser()
    if (authError || !user)
      throw createError({
        statusCode: 401,
        statusMessage: 'Silakan login untuk membuka Dummy Buku',
      })
  }
  const source = useRuntimeConfig(event).catalogSource
  if (source === 'demo') {
    await getProduct(event, slug)
    throw createError({ statusCode: 404, statusMessage: 'Materi belum tersedia dalam mode demo' })
  }
  if (source !== 'supabase')
    throw createError({ statusCode: 503, statusMessage: 'Sumber katalog tidak valid' })
  const client = protectedClient ?? getCatalogClient(event)
  const { data, error } = await client
    .from('products')
    .select('flyer_path,dummy_book_path,product_knowledge_path,product_knowledge_preview_path')
    .eq('slug', slug)
    .eq('published', true)
    .maybeSingle()
  if (error) throw createError({ statusCode: 503, statusMessage: 'Materi belum dapat dibuka' })
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Buku tidak ditemukan' })
  const path =
    kind === 'product-knowledge' && preview
      ? data.product_knowledge_preview_path
      : data[bookResourceColumns[kind]]
  if (!path) throw createError({ statusCode: 404, statusMessage: 'Materi belum tersedia' })
  const extension = bookResourceExtensionSchema.safeParse(path.split('.').pop()?.toLowerCase())
  if (
    !extension.success ||
    ((kind === 'dummy' || (kind === 'product-knowledge' && preview)) && extension.data !== 'pdf')
  )
    throw createError({ statusCode: 503, statusMessage: 'Format materi tidak valid' })
  return {
    client,
    path,
    extension: extension.data,
  }
}
