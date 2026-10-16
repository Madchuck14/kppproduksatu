import { setFeaturedBooksSchema } from '#shared/schemas/editor'
import { requireSuperEditor } from '../../../utils/require-editor'
import { saveFeaturedBooks } from '../../../repositories/editor-books'

export default defineEventHandler(async (event) => {
  await requireSuperEditor(
    event,
    'Hanya Editor super yang dapat mengatur buku pilihan dan teks hero.',
  )
  const parsed = setFeaturedBooksSchema.safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? 'Daftar buku pilihan tidak valid',
    })
  return saveFeaturedBooks(event, parsed.data.bookIds, parsed.data.hero)
})
