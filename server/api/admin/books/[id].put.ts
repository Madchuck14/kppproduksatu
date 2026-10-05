import { bookIdSchema, bookInputSchema } from '#shared/schemas/editor'
import { requireEditor } from '../../../utils/require-editor'
import { saveEditorBook } from '../../../repositories/editor-books'

export default defineEventHandler(async (event) => {
  const account = await requireEditor(event)
  const id = bookIdSchema.safeParse(getRouterParam(event, 'id'))
  const input = bookInputSchema.safeParse(await readBody(event))
  if (!id.success || !input.success)
    throw createError({
      statusCode: 400,
      statusMessage: !input.success ? input.error.issues[0]?.message : 'ID buku tidak valid',
    })
  return saveEditorBook(event, account, input.data, id.data)
})
