import { z } from 'zod'
import { educationLevelSchema } from './auth'
import { bookSubjectSchema } from './editor'
import { getGradesForLevel } from '../utils/book-grades'
import { divisionCodeSchema } from '../utils/book-divisions'

export const catalogQuerySchema = z
  .object({
    q: z.string().trim().max(100).default(''),
    featured: z.enum(['true', 'false']).optional(),
    level: educationLevelSchema.optional(),
    structure: z.string().uuid().optional(),
    division: divisionCodeSchema.optional(),
    grade: z.coerce.number().int().min(1).max(12).optional(),
    subject: z.union([bookSubjectSchema, z.array(bookSubjectSchema).max(50)]).optional(),
    page: z.coerce.number().int().min(1).max(100000).optional(),
    pageSize: z.coerce
      .number()
      .pipe(z.union([z.literal(15), z.literal(30), z.literal(60)]))
      .default(15),
    sort: z.enum(['newest', 'title-asc', 'title-desc']).default('newest'),
  })
  .superRefine((query, context) => {
    if (query.structure && !query.level) {
      context.addIssue({
        code: 'custom',
        path: ['structure'],
        message: 'Pilih jenjang untuk filter struktur produk.',
      })
    }
    if (
      query.grade !== undefined &&
      (!query.level || !getGradesForLevel(query.level).includes(query.grade))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['grade'],
        message: 'Kelas tidak sesuai dengan jenjang pendidikan.',
      })
    }
  })

export const productIdentifierSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^(?:[a-z0-9]+(?:-[a-z0-9]+)*|[A-Z0-9][A-Z0-9._-]{0,49})$/)
