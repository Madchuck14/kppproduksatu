import { z } from 'zod'
import { requireEditor } from '../../utils/require-editor'
import { searchBookDescriptions } from '../../repositories/editor-books'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const account = await requireEditor(event)
  const parsed = z.object({ q: z.string().trim().min(2).max(200) }).safeParse(getQuery(event))
  if (!parsed.success)
    throw createError({
      statusCode: 400,
      statusMessage: 'Masukkan judul sepanjang 2–200 karakter.',
    })
  return searchBookDescriptions(event, account, parsed.data.q)
})
