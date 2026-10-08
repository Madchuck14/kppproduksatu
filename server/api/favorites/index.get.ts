import { favoriteQuerySchema } from '#shared/schemas/favorites'
import { listFavorites } from '../../repositories/favorites'

export default defineEventHandler(async (event) => {
  const parsed = favoriteQuerySchema.safeParse(getQuery(event))
  if (!parsed.success)
    throw createError({ statusCode: 400, statusMessage: 'Filter favorit tidak valid' })
  return listFavorites(event, parsed.data)
})
