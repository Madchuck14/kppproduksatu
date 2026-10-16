import type { H3Event } from 'h3'
import type { BookResourceKind } from '../utils/book-resource'
import { bookResourceColumns, bookResourceExtensionSchema } from '../utils/book-resource'
import { getCatalogClient } from '../utils/catalog-client'
import { getProduct } from './products'

export async function getBookResource(
  event: H3Event,
  identifier: string,
  kind: BookResourceKind,
  preview = false,
) {
  const source = useRuntimeConfig(event).catalogSource
  const product = await getProduct(event, identifier)
  if (source === 'demo') {
    throw createError({ statusCode: 404, statusMessage: 'Materi belum tersedia dalam mode demo' })
  }
  if (source !== 'supabase')
    throw createError({ statusCode: 503, statusMessage: 'Sumber katalog tidak valid' })
  const client = getCatalogClient(event)
  const { data, error } = await client
    .from('products')
    .select('flyer_path,dummy_book_path,product_knowledge_path,product_knowledge_preview_path')
    .eq('id', product.id)
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
