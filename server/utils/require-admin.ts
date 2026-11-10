import type { H3Event } from 'h3'
import { requireAccount } from './require-account'

export async function requireAdmin(event: H3Event) {
  const account = await requireAccount(event)
  const config = useRuntimeConfig(event)
  if (config.public.supabase.url === 'https://example.supabase.co') {
    throw createError({ statusCode: 503, statusMessage: 'Login admin belum dikonfigurasi' })
  }
  if (account.role !== 'editor' || !account.isSuper)
    throw createError({ statusCode: 403, statusMessage: 'Akses Editor super diperlukan' })
  return account
}
