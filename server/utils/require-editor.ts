import type { H3Event } from 'h3'
import type { AccountSession } from '#shared/types/account'
import { requireAccount } from './require-account'

export async function requireEditor(event: H3Event) {
  const account = await requireAccount(event)
  if (account.role !== 'editor') {
    throw createError({ statusCode: 403, statusMessage: 'Halaman ini hanya untuk Editor' })
  }
  if (useRuntimeConfig(event).catalogSource !== 'supabase') {
    throw createError({
      statusCode: 503,
      statusMessage: 'Pengelolaan buku memerlukan katalog Supabase',
    })
  }
  return account
}

export function assertBookScope(account: AccountSession, level: string | null) {
  if (!account.isSuper && !account.educationLevels.some((item) => item === level)) {
    throw createError({ statusCode: 403, statusMessage: 'Buku berada di luar jenjang akses Anda' })
  }
}
