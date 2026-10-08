import { z } from 'zod'
import { educationLevelSchema } from './auth'

export const favoriteProductIdSchema = z.string().uuid()
export const favoriteQuerySchema = z.object({
  q: z.string().trim().max(100).default(''),
  level: educationLevelSchema.optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
})
export type FavoriteQuery = z.infer<typeof favoriteQuerySchema>
