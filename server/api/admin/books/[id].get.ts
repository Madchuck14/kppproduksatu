import { bookIdSchema } from '#shared/schemas/editor'
import { requireEditor } from '../../../utils/require-editor'
import { editorCategories, getEditorBook } from '../../../repositories/editor-books'

export default defineEventHandler(async (event) => {
  const account = await requireEditor(event)
  const id = bookIdSchema.safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createError({ statusCode: 400, statusMessage: 'ID buku tidak valid' })
  const [book, categories] = await Promise.all([
    getEditorBook(event, account, id.data),
    editorCategories(event),
  ])
  return { account, book, categories }
})
