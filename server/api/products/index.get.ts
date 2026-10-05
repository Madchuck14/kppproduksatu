import { catalogQuerySchema } from '#shared/schemas/catalog'
import { listProducts } from '../../repositories/products'

export default defineEventHandler(async (event) => {
  const parsed = catalogQuerySchema.safeParse(getQuery(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Filter katalog tidak valid' })
  return listProducts(event, parsed.data)
})
