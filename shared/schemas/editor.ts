import { z } from 'zod'
import { educationLevelSchema } from './auth'
import { getGradesForLevel } from '../utils/book-grades'
import { divisionCodeSchema } from '../utils/book-divisions'

export const bookSubjectSchema = z.string().trim().min(1).max(200)

export const editorQuerySchema = z.object({
  q: z.string().trim().max(100).default(''),
  level: educationLevelSchema.optional(),
  subject: bookSubjectSchema.optional(),
  status: z.enum(['all', 'published', 'draft']).default('all'),
  page: z.coerce.number().int().min(1).max(100000).default(1),
})

export const bookMaterialMaxBytes = {
  dummy: 15 * 1024 * 1024,
  flyer: 10 * 1024 * 1024,
  'product-knowledge': 10 * 1024 * 1024,
  'product-knowledge-preview': 10 * 1024 * 1024,
} as const

export const maxFeaturedBooks = 8
export const featuredBooksQuerySchema = z.object({
  q: z.string().trim().max(100).default(''),
  page: z.coerce.number().int().min(1).max(100000).default(1),
})
export const setFeaturedBooksSchema = z.object({
  bookIds: z
    .array(z.string().uuid())
    .max(maxFeaturedBooks, `Maksimal ${maxFeaturedBooks} buku pilihan.`)
    .refine((ids) => new Set(ids).size === ids.length, 'Daftar buku pilihan tidak valid.'),
})
export type FeaturedBooksQuery = z.infer<typeof featuredBooksQuerySchema>

export const bookHighlightsSchema = z.array(z.string().trim().min(1).max(200)).max(6)
export const bookTargetMarketSchema = z.array(z.string().trim().min(1).max(200)).max(10)
export const bookCurriculumSchema = z
  .string()
  .trim()
  .min(1, 'Kurikulum tidak boleh kosong.')
  .max(200, 'Kurikulum maksimal 200 karakter.')
export const bookIsbnSchema = z
  .string()
  .trim()
  .max(32, 'ISBN maksimal 32 karakter sebelum normalisasi.')
  .transform((value) => value.replace(/[\s-]/g, '').toUpperCase())
  .pipe(
    z
      .string()
      .regex(
        /^(?:[0-9]{9}[0-9X]|[0-9]{13})$/,
        'ISBN harus terdiri dari 10 atau 13 karakter; ISBN-10 dapat diakhiri X.',
      ),
  )

export const bookInputSchema = z
  .object({
    bookCode: z
      .string()
      .trim()
      .regex(/^\d{1,50}$/, 'Kode buku wajib diisi dengan angka, maksimal 50 digit.'),
    educationLevel: educationLevelSchema,
    divisionCode: divisionCodeSchema.nullable().default(null),
    grade: z.number().int().min(1).max(12).nullable().optional(),
    subject: bookSubjectSchema.nullable().default(null),
    title: z.string().trim().min(1, 'Judul wajib diisi.').max(200),
    author: z.string().trim().max(200),
    curriculum: bookCurriculumSchema.nullable().optional(),
    isbn: bookIsbnSchema.nullable().optional(),
    synopsis: z
      .string()
      .trim()
      .min(1, 'Sinopsis tidak boleh hanya berisi spasi.')
      .max(20000)
      .nullable()
      .default(null),
    targetMarket: bookTargetMarketSchema.default([]),
    highlights: bookHighlightsSchema.optional(),
    price: z.number().int().min(0, 'Harga tidak boleh negatif.').max(2147483647),
    publicationYear: z.number().int().min(1000).max(9999).nullable(),
    published: z.boolean(),
  })
  .strict()
  .superRefine((book, context) => {
    if (book.grade != null && !getGradesForLevel(book.educationLevel).includes(book.grade)) {
      context.addIssue({
        code: 'custom',
        path: ['grade'],
        message: 'Kelas tidak sesuai dengan jenjang pendidikan.',
      })
    }
  })

export const bookIdSchema = z.string().uuid()
export type BookInput = z.infer<typeof bookInputSchema>
export type EditorQuery = z.infer<typeof editorQuerySchema>
