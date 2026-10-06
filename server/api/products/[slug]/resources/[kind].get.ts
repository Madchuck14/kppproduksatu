import { productSlugSchema } from '#shared/schemas/catalog'
import { bookResourceColumns, bookResourceKindSchema } from '../../../../utils/book-resource'
import { getCatalogClient } from '../../../../utils/catalog-client'

export default defineEventHandler(async (event) => {
  const slug = productSlugSchema.safeParse(getRouterParam(event, 'slug'))
  const kind = bookResourceKindSchema.safeParse(getRouterParam(event, 'kind'))
  if (!slug.success || !kind.success)
    throw createError({ statusCode: 400, statusMessage: 'Buku atau jenis materi tidak valid' })
  const client = getCatalogClient(event)
  const column = bookResourceColumns[kind.data]
  const { data, error } = await client
    .from('products')
    .select('flyer_path,dummy_book_path,product_knowledge_path')
    .eq('slug', slug.data)
    .eq('published', true)
    .maybeSingle()
  if (error) throw createError({ statusCode: 503, statusMessage: 'Materi belum dapat dibuka' })
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Buku tidak ditemukan' })
  const path = data[column]
  if (!path) throw createError({ statusCode: 404, statusMessage: 'Materi belum tersedia' })
  const query = getQuery(event)
  const signed = await client.storage
    .from('book-materials')
    .createSignedUrl(
      path,
      60,
      query.download === '1' ? { download: `${slug.data}-${kind.data}.pdf` } : undefined,
    )
  if (signed.error || !signed.data?.signedUrl)
    throw createError({ statusCode: 503, statusMessage: 'Materi belum dapat dibuka' })
  if (query.preview === '1') return { url: signed.data.signedUrl }
  return sendRedirect(event, signed.data.signedUrl, 302)
})
