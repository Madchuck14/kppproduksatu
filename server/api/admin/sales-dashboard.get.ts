import { salesDashboardQuerySchema } from '#shared/schemas/sales-dashboard'
import { getSalesDashboard } from '../../repositories/sales-dashboard'
import { requireSuperEditor } from '../../utils/require-editor'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  await requireSuperEditor(event, 'Catatan login hanya dapat diperiksa oleh Editor super.')
  const parsed = salesDashboardQuerySchema.strict().safeParse(getQuery(event))
  if (!parsed.success)
    throw createError({ statusCode: 400, statusMessage: 'Halaman catatan login tidak valid.' })
  return getSalesDashboard(event, parsed.data.page)
})
