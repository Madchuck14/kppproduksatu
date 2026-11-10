import { structureInputSchema } from '#shared/schemas/product-structure'
import { requireSuperEditor } from '../../../utils/require-editor'
import { saveStructureNode } from '../../../repositories/product-structure'

export default defineEventHandler(async (event) => {
  await requireSuperEditor(event, 'Hanya Editor super yang dapat mengelola Struktur Produk.')
  const parsed = structureInputSchema.safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? 'Periksa data cabang.',
    })
  return saveStructureNode(event, parsed.data)
})
