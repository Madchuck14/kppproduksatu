import { favoriteProductIdSchema } from '#shared/schemas/favorites'
import { removeFavorite } from '../../repositories/favorites'

export default defineEventHandler(async (event) => {
  const parsed = favoriteProductIdSchema.safeParse(getRouterParam(event, 'id'))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'ID buku tidak valid' })
  return removeFavorite(event, parsed.data)
})
