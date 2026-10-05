import { z } from 'zod'
import { educationLevelSchema } from './auth'
import { productSlugSchema } from './catalog'

export const editorQuerySchema = z.object({
  q: z.string().trim().max(100).default(''),
  level: educationLevelSchema.optional(),
  status: z.enum(['all', 'published', 'draft']).default('all'),
  page: z.coerce.number().int().min(1).max(100000).default(1),
})

export const bookInputSchema = z
  .object({
    bookCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(
        /^[A-Z0-9][A-Z0-9._-]{0,49}$/,
        'Kode buku wajib diisi, maksimal 50 karakter: huruf, angka, titik, garis bawah, atau tanda hubung.',
      ),
    educationLevel: educationLevelSchema,
    title: z.string().trim().min(1, 'Judul wajib diisi.').max(200),
    slug: productSlugSchema,
    author: z.string().trim().max(200),
    description: z.string().trim().max(20000),
    price: z.number().int().min(0, 'Harga tidak boleh negatif.').max(2147483647),
    categoryId: z.string().uuid().nullable(),
    featured: z.boolean(),
    published: z.boolean(),
  })
  .strict()

export const bookIdSchema = z.string().uuid()
export type BookInput = z.infer<typeof bookInputSchema>
export type EditorQuery = z.infer<typeof editorQuerySchema>
