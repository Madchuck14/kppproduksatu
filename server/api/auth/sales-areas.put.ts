import { saveSalesAreasSchema } from '#shared/schemas/sales-areas'
import { requireAccount } from '../../utils/require-account'
import { saveSalesAreas } from '../../repositories/sales-areas'

export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  if (account.role !== 'sales')
    throw createError({ statusCode: 403, statusMessage: 'Pengaturan area hanya untuk akun Sales.' })
  const parsed = saveSalesAreasSchema.safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? 'Periksa area Sales Anda.',
    })
  return saveSalesAreas(event, account, parsed.data.areas)
})
