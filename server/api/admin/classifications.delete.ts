import { classificationDeleteSchema } from '#shared/schemas/classifications'
import { requireEditor } from '../../utils/require-editor'
import { deleteClassification } from '../../repositories/classifications'

export default defineEventHandler(async (event) => {
  const account = await requireEditor(event)
  const input = classificationDeleteSchema.safeParse(await readBody(event))
  if (!input.success)
    throw createError({
      statusCode: 400,
      statusMessage: 'Klasifikasi yang akan dihapus tidak valid.',
    })
  return deleteClassification(event, account, input.data)
})
