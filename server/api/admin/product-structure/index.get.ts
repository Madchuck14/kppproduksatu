import { structureQuerySchema } from '#shared/schemas/product-structure'
import { requireSuperEditor } from '../../../utils/require-editor'
import { listProductStructure } from '../../../repositories/product-structure'

export default defineEventHandler(async (event) => {
  await requireSuperEditor(event, 'Hanya Editor super yang dapat mengelola Struktur Produk.')
  const parsed = structureQuerySchema.safeParse(getQuery(event))
  if (!parsed.success)
    throw createError({ statusCode: 400, statusMessage: 'Jenjang struktur tidak valid.' })
  return listProductStructure(event, parsed.data.level)
})
