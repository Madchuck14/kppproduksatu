import { serverSupabaseClient } from '#supabase/server'
import { bookIdSchema } from '#shared/schemas/editor'
import { requireEditor } from '../../../../../utils/require-editor'
import { getEditorBook, setEditorBookMaterial } from '../../../../../repositories/editor-books'
import { materialKinds, readBookMaterial } from '../../../../../utils/book-material'

export default defineEventHandler(async (event) => {
  const account = await requireEditor(event)
  const id = bookIdSchema.safeParse(getRouterParam(event, 'id'))
  const kindValue = getRouterParam(event, 'kind')
  const kind = materialKinds.find((value) => value === kindValue)
  if (!id.success || !kind)
    throw createError({ statusCode: 400, statusMessage: 'Buku atau jenis materi tidak valid' })
  const book = await getEditorBook(event, account, id.data)
  if (!book.bookCode || !book.educationLevel)
    throw createError({
      statusCode: 400,
      statusMessage: 'Lengkapi kode dan jenjang buku terlebih dahulu',
    })
  const { bytes, type, extension } = await readBookMaterial(event, kind)
  const path = `books/${id.data}/${kind}/${crypto.randomUUID()}.${extension}`
  const client = await serverSupabaseClient(event)
  const { error } = await client.storage
    .from('book-materials')
    .upload(path, bytes, { contentType: type, upsert: false })
  if (error)
    throw createError({ statusCode: 503, statusMessage: 'Materi gagal diunggah. Coba lagi.' })
  try {
    return await setEditorBookMaterial(event, account, id.data, kind, path)
  } catch (error) {
    await client.storage.from('book-materials').remove([path])
    throw error
  }
})
