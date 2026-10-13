import { z } from 'zod'
import { productSlugSchema } from '#shared/schemas/catalog'
import { recordProductAccess } from '../../../repositories/catalog-browse'

export default defineEventHandler(async (event) => {
  const slug = productSlugSchema.safeParse(getRouterParam(event, 'slug'))
  const body = z
    .object({ visitor: z.string().uuid() })
    .strict()
    .safeParse(await readBody(event))
  if (!slug.success || !body.success)
    throw createError({ statusCode: 400, statusMessage: 'Data akses buku tidak valid' })
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return recordProductAccess(event, slug.data, body.data.visitor)
})
