import { z } from 'zod'
import { educationLevelSchema } from './auth'
import { bookSubjectSchema } from './editor'

export const catalogQuerySchema = z.object({
  q: z.string().trim().max(100).default(''),
  featured: z.enum(['true', 'false']).optional(),
  level: educationLevelSchema.optional(),
  subject: bookSubjectSchema.optional(),
})

export const productSlugSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
