import { bookInputSchema } from '#shared/schemas/editor'
import { requireEditor } from '../../../utils/require-editor'
import { saveEditorBook } from '../../../repositories/editor-books'

export default defineEventHandler(async (event) => {
  const account = await requireEditor(event)
  const parsed = bookInputSchema.safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? 'Data buku tidak valid',
    })
  const book = await saveEditorBook(event, account, parsed.data)
  setResponseStatus(event, 201)
  return book
})
