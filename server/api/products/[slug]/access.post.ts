import { z } from 'zod'
import { productIdentifierSchema } from '#shared/schemas/catalog'
import { recordProductAccess } from '../../../repositories/catalog-browse'
import { getProduct } from '../../../repositories/products'

export default defineEventHandler(async (event) => {
  const identifier = productIdentifierSchema.safeParse(getRouterParam(event, 'slug'))
  const body = z
    .object({ visitor: z.string().uuid() })
    .strict()
    .safeParse(await readBody(event))
  if (!identifier.success || !body.success)
    throw createError({ statusCode: 400, statusMessage: 'Data akses buku tidak valid' })
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const product = await getProduct(event, identifier.data)
  return recordProductAccess(event, product.slug, body.data.visitor)
})
