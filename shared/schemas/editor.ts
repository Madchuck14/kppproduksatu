import { z } from 'zod'
import { educationLevelSchema } from './auth'
import { isSubjectForLevel, subjectsByLevel, type BookSubject } from '../utils/book-subjects'

const subjectNames = [...new Set(Object.values(subjectsByLevel).flat())] as [
  BookSubject,
  ...BookSubject[],
]
export const bookSubjectSchema = z.enum(subjectNames)

export const editorQuerySchema = z.object({
  q: z.string().trim().max(100).default(''),
  level: educationLevelSchema.optional(),
  subject: bookSubjectSchema.optional(),
  status: z.enum(['all', 'published', 'draft']).default('all'),
  page: z.coerce.number().int().min(1).max(100000).default(1),
})

export const bookInputSchema = z
  .object({
    bookCode: z
      .string()
      .trim()
      .regex(/^\d{1,50}$/, 'Kode buku wajib diisi dengan angka, maksimal 50 digit.'),
    educationLevel: educationLevelSchema,
    subject: bookSubjectSchema.nullable().default(null),
    title: z.string().trim().min(1, 'Judul wajib diisi.').max(200),
    author: z.string().trim().max(200),
    description: z.string().trim().max(20000),
    price: z.number().int().min(0, 'Harga tidak boleh negatif.').max(2147483647),
    publicationYear: z.number().int().min(1000).max(9999).nullable(),
    featured: z.boolean(),
    published: z.boolean(),
  })
  .strict()
  .superRefine((book, context) => {
    if (book.subject && !isSubjectForLevel(book.educationLevel, book.subject)) {
      context.addIssue({
        code: 'custom',
        path: ['subject'],
        message: 'Mata pelajaran tidak sesuai dengan jenjang pendidikan.',
      })
    }
  })

export const bookIdSchema = z.string().uuid()
export type BookInput = z.infer<typeof bookInputSchema>
export type EditorQuery = z.infer<typeof editorQuerySchema>
