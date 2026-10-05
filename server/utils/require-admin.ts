import { serverSupabaseClient } from '#supabase/server'
import type { H3Event } from 'h3'

export async function requireAdmin(event: H3Event) {
  const config = useRuntimeConfig(event)
  if (config.public.supabase.url === 'https://example.supabase.co') {
    throw createError({ statusCode: 503, statusMessage: 'Login admin belum dikonfigurasi' })
  }
  const client = await serverSupabaseClient(event)
  // Verify with the Auth server instead of trusting browser/session metadata.
  const { data: { user }, error } = await client.auth.getUser()
  if (error || !user) throw createError({ statusCode: 401, statusMessage: 'Silakan login' })
  const { data: membership, error: roleError } = await client.from('admin_memberships')
    .select('user_id').eq('user_id', user.id).maybeSingle()
  if (roleError) throw createError({ statusCode: 503, statusMessage: 'Hak akses belum dapat diperiksa' })
  if (!membership) throw createError({ statusCode: 403, statusMessage: 'Akses admin diperlukan' })
  return user
}
