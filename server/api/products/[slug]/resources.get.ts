import { productSlugSchema } from '#shared/schemas/catalog'
import { getCatalogClient } from '../../../utils/catalog-client'
import { bookResourceExtensionSchema } from '../../../utils/book-resource'
import { getProduct } from '../../../repositories/products'

export default defineEventHandler(async (event) => {
  const slug = productSlugSchema.safeParse(getRouterParam(event, 'slug'))
  if (!slug.success)
    throw createError({ statusCode: 400, statusMessage: 'Alamat buku tidak valid' })
  if (useRuntimeConfig(event).catalogSource === 'demo') {
    await getProduct(event, slug.data)
    return {
      flyer: false,
      flyerFormat: null,
      dummy: false,
      productKnowledge: false,
      presentationFormat: null,
      productKnowledgeFormat: null,
    }
  }
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
  const flyerExtension = data.flyer_path
    ? bookResourceExtensionSchema.safeParse(data.flyer_path.split('.').pop()?.toLowerCase())
    : null
  if (flyerExtension && !flyerExtension.success)
    throw createError({ statusCode: 503, statusMessage: 'Format materi tidak valid' })
  const extension = data.product_knowledge_path?.split('.').pop()?.toLowerCase() ?? null
  const productKnowledgeFormat =
    extension === 'pdf' ? 'PDF' : extension === 'ppt' ? 'PPT' : extension === 'pptx' ? 'PPTX' : null
  if (data.product_knowledge_path && !productKnowledgeFormat)
    throw createError({ statusCode: 503, statusMessage: 'Format materi tidak valid' })
  return {
    flyer: Boolean(data.flyer_path),
    flyerFormat: flyerExtension?.success ? flyerExtension.data : null,
    presentationFormat: data.product_knowledge_path
      ? data.product_knowledge_path.split('.').pop()
      : null,
    dummy: Boolean(data.dummy_book_path),
    productKnowledge: Boolean(data.product_knowledge_path),
    productKnowledgeFormat,
  }
})
