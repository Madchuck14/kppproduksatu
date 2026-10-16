import { classificationInputSchema } from '#shared/schemas/classifications'
import { requireSuperEditor } from '../../utils/require-editor'
import { addClassification } from '../../repositories/classifications'

export default defineEventHandler(async (event) => {
  const account = await requireSuperEditor(event)
  const input = classificationInputSchema.safeParse(await readBody(event))
  if (!input.success)
    throw createError({
      statusCode: 400,
      statusMessage: 'Nama atau jenjang klasifikasi tidak valid.',
    })
  await addClassification(event, account, input.data)
  setResponseStatus(event, 201)
  return { saved: true }
})
