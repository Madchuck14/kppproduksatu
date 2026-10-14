import { z } from 'zod'
import { createError, getRouterParam } from 'h3'
import type { H3Event } from 'h3'
import { bookIdSchema } from '#shared/schemas/editor'
import { requireEditor } from './require-editor'
import { getEditorBook } from '../repositories/editor-books'
import { materialKinds } from './book-material'

export const materialUploadSchema = z
  .object({
    type: z.string().max(100),
    size: z.number().int().positive(),
  })
  .strict()

export const materialCompleteSchema = materialUploadSchema.extend({ path: z.string().max(200) })

export async function requireMaterialUpload(event: H3Event) {
  const account = await requireEditor(event)
  const id = bookIdSchema.safeParse(getRouterParam(event, 'id'))
  const kind = materialKinds.find((value) => value === getRouterParam(event, 'kind'))
  if (!id.success || !kind)
    throw createError({ statusCode: 400, statusMessage: 'Buku atau jenis materi tidak valid' })
  const book = await getEditorBook(event, account, id.data)
  if (!book.bookCode || !book.educationLevel)
    throw createError({
      statusCode: 400,
      statusMessage: 'Lengkapi kode dan jenjang buku terlebih dahulu',
    })
  return { account, id: id.data, kind }
}

export function validateMaterialSize(size: number, maxSize: number) {
  if (!Number.isSafeInteger(size) || size <= 0 || size > maxSize)
    throw createError({
      statusCode: 413,
      statusMessage: `Ukuran berkas maksimal ${maxSize / 1024 / 1024} MB`,
    })
}
