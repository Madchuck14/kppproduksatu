import { editorQuerySchema } from '#shared/schemas/editor'
import { requireEditor } from '../../../utils/require-editor'
import { listEditorBooks } from '../../../repositories/editor-books'

export default defineEventHandler(async (event) => {
  const account = await requireEditor(event)
  const parsed = editorQuerySchema.safeParse(getQuery(event))
  if (!parsed.success)
    throw createError({ statusCode: 400, statusMessage: 'Filter buku tidak valid' })
  return listEditorBooks(event, account, parsed.data)
})
