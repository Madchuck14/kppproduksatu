import { serverSupabaseClient } from '#supabase/server'
import type { H3Event } from 'h3'
import { z } from 'zod'
import { educationLevelSchema, nipSchema } from '#shared/schemas/auth'
import type { AccountSession } from '#shared/types/account'
import { storedSalesAreasSchema } from '#shared/schemas/sales-areas'

const membershipSchema = z.object({
  role: z.enum(['sales', 'editor']),
  is_super: z.boolean(),
  sales_areas: storedSalesAreasSchema,
})
const scopesSchema = z.array(z.object({ education_level: educationLevelSchema }))

export async function requireAccount(event: H3Event): Promise<AccountSession> {
  const client = await serverSupabaseClient(event)
  const {
    data: { user },
    error,
  } = await client.auth.getUser()
  if (error || !user) throw createError({ statusCode: 401, statusMessage: 'Silakan login' })
  const { data: employee, error: employeeError } = await client
    .from('employee_registry')
    .select('nip')
    .eq('user_id', user.id)
    .maybeSingle()
  if (employeeError)
    throw createError({ statusCode: 503, statusMessage: 'NIK belum dapat diperiksa' })
  if (!employee) throw createError({ statusCode: 403, statusMessage: 'NIK akun belum terdaftar.' })
  const identity = z.object({ nip: nipSchema }).safeParse(employee)
  if (!identity.success)
    throw createError({ statusCode: 503, statusMessage: 'Data NIK tidak valid' })
  const { data, error: membershipError } = await client
    .from('account_memberships')
    .select('role,is_super,sales_areas')
    .eq('user_id', user.id)
    .maybeSingle()
  if (membershipError)
    throw createError({ statusCode: 503, statusMessage: 'Hak akses belum dapat diperiksa' })
  const role = z.object({ role: z.string() }).safeParse(data)
  if (!role.success || !['sales', 'editor'].includes(role.data.role))
    throw createError({
      statusCode: 403,
      statusMessage: 'Akun belum memiliki akses Sales atau Editor.',
    })
  const membership = membershipSchema.safeParse(data)
  if (!membership.success)
    throw createError({ statusCode: 503, statusMessage: 'Data hak akses tidak valid' })
  let educationLevels: AccountSession['educationLevels'] = []
  if (membership.data.role === 'editor') {
    const { data: rows, error: scopeError } = await client
      .from('editor_scopes')
      .select('education_level')
      .eq('user_id', user.id)
    const scopes = scopesSchema.safeParse(rows)
    if (scopeError || !scopes.success)
      throw createError({ statusCode: 503, statusMessage: 'Jenjang Editor belum dapat diperiksa' })
    educationLevels = educationLevelSchema.options.filter((level) =>
      scopes.data.some((scope) => scope.education_level === level),
    )
  }
  return {
    id: user.id,
    nip: identity.data.nip,
    role: membership.data.role,
    isSuper: membership.data.is_super,
    educationLevels,
    salesAreas: membership.data.role === 'sales' ? membership.data.sales_areas : [],
  }
}
