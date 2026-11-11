import { z } from 'zod'
import { requireSuperEditor } from '../../../utils/require-editor'
import { deleteStructureNode } from '../../../repositories/product-structure'

export default defineEventHandler(async (event) => {
  await requireSuperEditor(event, 'Hanya Editor super yang dapat mengelola Struktur Produk.')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createError({ statusCode: 400, statusMessage: 'ID cabang tidak valid.' })
  return deleteStructureNode(event, id.data)
})
