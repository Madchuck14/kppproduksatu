import { serverSupabaseClient } from '#supabase/server'
import type { H3Event } from 'h3'
import { z } from 'zod'
import type { EditorDatabase } from '#shared/types/editor-database'
import type { StorageUsage } from '#shared/types/storage-usage'

export async function getStorageUsage(event: H3Event): Promise<StorageUsage> {
  const client = await serverSupabaseClient<EditorDatabase>(event)
  const { data, error } = await client.rpc('editor_storage_usage_bytes')
  const parsed = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).safeParse(data)
  if (error || !parsed.success)
    throw createError({
      statusCode: 503,
      statusMessage: 'Penggunaan penyimpanan belum dapat dimuat.',
    })
  return { usedBytes: parsed.data, quotaBytes: 1024 ** 3 }
}
