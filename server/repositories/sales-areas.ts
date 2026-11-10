import { serverSupabaseClient } from '#supabase/server'
import type { H3Event } from 'h3'
import type { AccountDatabase } from '#shared/types/account-database'
import type { AccountSession } from '#shared/types/account'
import { storedSalesAreasSchema } from '#shared/schemas/sales-areas'

export async function saveSalesAreas(event: H3Event, account: AccountSession, areas: string[]) {
  if (account.role !== 'sales')
    throw createError({ statusCode: 403, statusMessage: 'Pengaturan area hanya untuk akun Sales.' })
  const client = await serverSupabaseClient<AccountDatabase>(event)
  const { data, error } = await client
    .from('account_memberships')
    .update({ sales_areas: areas })
    .eq('user_id', account.id)
    .select('sales_areas')
    .single()
  const parsed = storedSalesAreasSchema.safeParse(data?.sales_areas)
  if (error || !parsed.success)
    throw createError({
      statusCode: 503,
      statusMessage: 'Area Sales gagal disimpan. Periksa migration area Sales lalu coba lagi.',
    })
  return { areas: parsed.data }
}
