import { z } from 'zod'
import { structureInputSchema } from '#shared/schemas/product-structure'
import { requireSuperEditor } from '../../../utils/require-editor'
import { saveStructureNode } from '../../../repositories/product-structure'

export default defineEventHandler(async (event) => {
  await requireSuperEditor(event, 'Hanya Editor super yang dapat mengelola Struktur Produk.')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const parsed = structureInputSchema.safeParse(await readBody(event))
  if (!id.success || !parsed.success)
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error?.issues[0]?.message ?? 'Periksa data cabang.',
    })
  return saveStructureNode(event, parsed.data, id.data)
})
