import { serverSupabaseClient } from '#supabase/server'
import { z } from 'zod'
import { bookMaterialFormat, validateMaterialBytes } from '../../../../../../utils/book-material'
import {
  materialCompleteSchema,
  requireMaterialUpload,
  validateMaterialSize,
} from '../../../../../../utils/material-upload'
import { setEditorBookMaterial } from '../../../../../../repositories/editor-books'

export default defineEventHandler(async (event) => {
  const { account, id, kind } = await requireMaterialUpload(event)
  const parsed = materialCompleteSchema.safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({ statusCode: 400, statusMessage: 'Informasi berkas tidak valid' })
  const { path, type, size } = parsed.data
  const { extension, maxSize } = bookMaterialFormat(kind, type)
  validateMaterialSize(size, maxSize)
  const prefix = `books/${id}/${kind}/`
  const name = path.slice(prefix.length)
  if (
    !path.startsWith(prefix) ||
    !name.endsWith(`.${extension}`) ||
    !z.uuid().safeParse(name.slice(0, -(extension.length + 1))).success
  )
    throw createError({ statusCode: 400, statusMessage: 'Lokasi berkas tidak valid' })
  const bucket = (await serverSupabaseClient(event)).storage.from('book-materials')
  const info = await bucket.info(path)
  if (info.error || !info.data)
    throw createError({
      statusCode: 503,
      statusMessage: 'Berkas belum tersedia. Coba unggah kembali.',
    })
  validateMaterialSize(info.data.size ?? 0, maxSize)
  if (info.data.size !== size || info.data.contentType !== type)
    throw createError({
      statusCode: 400,
      statusMessage: 'Informasi berkas tidak sesuai dengan unggahan',
    })
  const { data, error } = await bucket.download(path)
  if (error || !data)
    throw createError({ statusCode: 503, statusMessage: 'Berkas gagal diperiksa. Coba lagi.' })
  if (data.size !== size)
    throw createError({
      statusCode: 400,
      statusMessage: 'Ukuran berkas tidak sesuai dengan unggahan',
    })
  validateMaterialBytes(new Uint8Array(await data.arrayBuffer()), extension)
  return setEditorBookMaterial(event, account, id, kind, path)
})
