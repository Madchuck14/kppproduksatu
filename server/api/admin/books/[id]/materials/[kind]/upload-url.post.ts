import { serverSupabaseClient } from '#supabase/server'
import { bookMaterialFormat } from '../../../../../../utils/book-material'
import {
  materialUploadSchema,
  requireMaterialUpload,
  validateMaterialSize,
} from '../../../../../../utils/material-upload'

export default defineEventHandler(async (event) => {
  const { id, kind } = await requireMaterialUpload(event)
  const parsed = materialUploadSchema.safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({ statusCode: 400, statusMessage: 'Informasi berkas tidak valid' })
  const { extension, maxSize } = bookMaterialFormat(kind, parsed.data.type)
  validateMaterialSize(parsed.data.size, maxSize)
  const path = `books/${id}/${kind}/${crypto.randomUUID()}.${extension}`
  const client = await serverSupabaseClient(event)
  const { data, error } = await client.storage.from('book-materials').createSignedUploadUrl(path)
  if (error || !data)
    throw createError({
      statusCode: 503,
      statusMessage: 'Unggahan belum dapat dimulai. Coba lagi.',
    })
  return { path, token: data.token }
})
