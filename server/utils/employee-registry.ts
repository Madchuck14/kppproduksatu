import { serverSupabaseServiceRole } from '#supabase/server'
import type { H3Event } from 'h3'
import { z } from 'zod'
import { educationLevelSchema, nipSchema } from '#shared/schemas/auth'

const employeeSchema = z.object({
  nip: nipSchema,
  user_id: z.string().uuid().nullable(),
  role: z.enum(['sales', 'editor']),
  education_level: educationLevelSchema.nullable(),
})

export function getEmployeeAdmin(event: H3Event) {
  const config = useRuntimeConfig(event)
  if (!config.supabase.secretKey && !config.supabase.serviceKey)
    throw createError({ statusCode: 503, statusMessage: 'Layanan akun belum dikonfigurasi.' })
  return serverSupabaseServiceRole(event)
}

export async function findEmployee(event: H3Event, nip: string) {
  const { data, error } = await getEmployeeAdmin(event)
    .from('employee_registry')
    .select('nip,user_id,role,education_level')
    .eq('nip', nip)
    .maybeSingle()
  if (error)
    throw createError({ statusCode: 503, statusMessage: 'Data pegawai belum dapat diperiksa.' })
  if (!data) return null
  const parsed = employeeSchema.safeParse(data)
  if (!parsed.success)
    throw createError({ statusCode: 503, statusMessage: 'Data pegawai tidak valid.' })
  return parsed.data
}
