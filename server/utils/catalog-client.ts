import { createClient } from '@supabase/supabase-js'
import type { H3Event } from 'h3'

export function getCatalogClient(event: H3Event) {
  const { url, key } = useRuntimeConfig(event).public.supabase
  if (!url || !key || url === 'https://example.supabase.co' || key === 'demo-only-not-a-real-key') {
    throw createError({ statusCode: 503, statusMessage: 'Supabase belum dikonfigurasi' })
  }
  // Public-key client without a user session; catalog reads are limited to published products by RLS.
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
