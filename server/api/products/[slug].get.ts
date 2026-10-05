import { productSlugSchema } from '#shared/schemas/catalog'
import { getProduct } from '../../repositories/products'

export default defineEventHandler(async (event) => {
  const parsed = productSlugSchema.safeParse(getRouterParam(event, 'slug'))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Slug produk tidak valid' })
  return getProduct(event, parsed.data)
})
