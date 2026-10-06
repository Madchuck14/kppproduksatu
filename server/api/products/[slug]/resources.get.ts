import { productSlugSchema } from '#shared/schemas/catalog'
import { getCatalogClient } from '../../../utils/catalog-client'

export default defineEventHandler(async (event) => {
  const slug = productSlugSchema.safeParse(getRouterParam(event, 'slug'))
  if (!slug.success)
    throw createError({ statusCode: 400, statusMessage: 'Alamat buku tidak valid' })
  const client = getCatalogClient(event)
  const { data, error } = await client
    .from('products')
    .select('flyer_path,dummy_book_path,product_knowledge_path')
    .eq('slug', slug.data)
    .eq('published', true)
    .maybeSingle()
  if (error)
    throw createError({ statusCode: 503, statusMessage: 'Status materi belum dapat diperiksa' })
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Buku tidak ditemukan' })
  return {
    flyer: Boolean(data.flyer_path),
    dummy: Boolean(data.dummy_book_path),
    productKnowledge: Boolean(data.product_knowledge_path),
  }
})
