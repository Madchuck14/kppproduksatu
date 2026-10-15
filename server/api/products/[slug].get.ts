import { productIdentifierSchema } from '#shared/schemas/catalog'
import { getProduct } from '../../repositories/products'

export default defineEventHandler(async (event) => {
  const parsed = productIdentifierSchema.safeParse(getRouterParam(event, 'slug'))
  if (!parsed.success)
    throw createError({ statusCode: 400, statusMessage: 'Kode atau alamat buku tidak valid' })
  return getProduct(event, parsed.data)
})
