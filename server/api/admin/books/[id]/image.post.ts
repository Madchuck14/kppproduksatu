import { serverSupabaseClient } from '#supabase/server'
import { bookIdSchema } from '#shared/schemas/editor'
import { requireEditor } from '../../../../utils/require-editor'
import { getEditorBook, setEditorBookImage } from '../../../../repositories/editor-books'
import { readCoverImage } from '../../../../utils/cover-image'

export default defineEventHandler(async (event) => {
  const account = await requireEditor(event)
  const id = bookIdSchema.safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createError({ statusCode: 400, statusMessage: 'ID buku tidak valid' })
  const book = await getEditorBook(event, account, id.data)
  if (!book.bookCode || !book.educationLevel)
    throw createError({
      statusCode: 400,
      statusMessage: 'Lengkapi kode dan jenjang buku sebelum mengunggah sampul',
    })
  const { bytes, type, extension } = await readCoverImage(event)
  const path = `books/${id.data}/${crypto.randomUUID()}.${extension}`
  const client = await serverSupabaseClient(event)
  const { error } = await client.storage
    .from('product-images')
    .upload(path, bytes, { contentType: type, upsert: false })
  if (error)
    throw createError({ statusCode: 503, statusMessage: 'Sampul gagal diunggah. Coba lagi.' })
  try {
    return await setEditorBookImage(event, account, id.data, path)
  } catch (error) {
    await client.storage.from('product-images').remove([path])
    throw error
  }
})
