import { contactPageSchema } from '#shared/schemas/contact-page'
import { saveContactPage } from '../../repositories/contact-page'
import { requireSuperEditor } from '../../utils/require-editor'

export default defineEventHandler(async (event) => {
  await requireSuperEditor(event, 'Hanya Editor super yang dapat mengatur halaman Kontak.')
  const parsed = contactPageSchema.safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? 'Informasi kontak tidak valid.',
    })
  return saveContactPage(event, parsed.data)
})
