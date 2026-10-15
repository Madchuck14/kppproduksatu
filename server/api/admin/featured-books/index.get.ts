import { featuredBooksQuerySchema } from '#shared/schemas/editor'
import { requireEditor } from '../../../utils/require-editor'
import { listFeaturedBooks } from '../../../repositories/editor-books'

export default defineEventHandler(async (event) => {
  const account = await requireEditor(event)
  const parsed = featuredBooksQuerySchema.safeParse(getQuery(event))
  if (!parsed.success)
    throw createError({ statusCode: 400, statusMessage: 'Filter buku pilihan tidak valid' })
  return listFeaturedBooks(event, account, parsed.data)
})
