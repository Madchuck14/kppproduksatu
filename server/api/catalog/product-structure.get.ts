import { structureQuerySchema } from '#shared/schemas/product-structure'
import { listProductStructure } from '../../repositories/product-structure'

export default defineEventHandler((event) => {
  const parsed = structureQuerySchema.safeParse(getQuery(event))
  if (!parsed.success)
    throw createError({ statusCode: 400, statusMessage: 'Pilih jenjang SD, SMP, SMA, atau SMK.' })
  return listProductStructure(event, parsed.data.level)
})
