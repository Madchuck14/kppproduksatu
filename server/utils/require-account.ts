import { serverSupabaseClient } from '#supabase/server'
import type { H3Event } from 'h3'
import { z } from 'zod'
import { educationLevelSchema } from '#shared/schemas/auth'
import type { AccountSession } from '#shared/types/account'

const membershipSchema = z.object({ role: z.enum(['sales', 'editor']), is_super: z.boolean() })
const scopesSchema = z.array(z.object({ education_level: educationLevelSchema }))

export async function requireAccount(event: H3Event): Promise<AccountSession> {
  const client = await serverSupabaseClient(event)
  const {
    data: { user },
    error,
  } = await client.auth.getUser()
  if (error || !user) throw createError({ statusCode: 401, statusMessage: 'Silakan login' })
  const { data, error: membershipError } = await client
    .from('account_memberships')
    .select('role,is_super')
    .eq('user_id', user.id)
    .maybeSingle()
  if (membershipError)
    throw createError({ statusCode: 503, statusMessage: 'Hak akses belum dapat diperiksa' })
  if (!data) throw createError({ statusCode: 403, statusMessage: 'Akun belum memiliki hak akses' })
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
    email: user.email,
    role: membership.data.role,
    isSuper: membership.data.is_super,
    educationLevels,
  }
}
