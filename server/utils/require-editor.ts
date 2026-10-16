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

export function assertSuperEditor(
  account: AccountSession,
  statusMessage = 'Hanya Editor super yang dapat mengelola klasifikasi buku.',
) {
  if (account.role !== 'editor' || !account.isSuper) {
    throw createError({
      statusCode: 403,
      statusMessage,
    })
  }
}

export async function requireSuperEditor(event: H3Event, statusMessage?: string) {
  const account = await requireEditor(event)
  assertSuperEditor(account, statusMessage)
  return account
}
