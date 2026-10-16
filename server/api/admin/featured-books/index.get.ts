import { featuredBooksQuerySchema } from '#shared/schemas/editor'
import { requireSuperEditor } from '../../../utils/require-editor'
import { listFeaturedBooks } from '../../../repositories/editor-books'
import { getLandingHero } from '../../../repositories/landing-hero'

export default defineEventHandler(async (event) => {
  const account = await requireSuperEditor(
    event,
    'Hanya Editor super yang dapat mengatur buku pilihan dan teks hero.',
  )
  const parsed = featuredBooksQuerySchema.safeParse(getQuery(event))
  if (!parsed.success)
    throw createError({ statusCode: 400, statusMessage: 'Filter buku pilihan tidak valid' })
  const [books, hero] = await Promise.all([
    listFeaturedBooks(event, account, parsed.data),
    getLandingHero(event),
  ])
  return { ...books, hero }
})
