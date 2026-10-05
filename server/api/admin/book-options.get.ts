import { requireEditor } from '../../utils/require-editor'
import { editorCategories } from '../../repositories/editor-books'

export default defineEventHandler(async (event) => {
  const account = await requireEditor(event)
  return { account, categories: await editorCategories(event) }
})
