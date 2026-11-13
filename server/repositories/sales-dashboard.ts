import { serverSupabaseClient } from '#supabase/server'
import type { H3Event } from 'h3'
import type { AccountDatabase } from '#shared/types/account-database'
import { salesDashboardSchema, type SalesDashboard } from '#shared/schemas/sales-dashboard'

export async function getSalesDashboard(event: H3Event, page: number): Promise<SalesDashboard> {
  const client = await serverSupabaseClient<AccountDatabase>(event)
  const { data, error } = await client.rpc('get_sales_dashboard', { p_page: page })
  const parsed = salesDashboardSchema.safeParse(data)
  if (error || !parsed.success)
    throw createError({
      statusCode: 503,
      statusMessage:
        'Catatan login belum dapat dimuat. Pastikan migration login Sales sudah diterapkan.',
    })
  return parsed.data
}
