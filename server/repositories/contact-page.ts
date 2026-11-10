import { serverSupabaseClient } from '#supabase/server'
import type { H3Event } from 'h3'
import type { EditorDatabase } from '#shared/types/editor-database'
import {
  contactPageSchema,
  defaultContactPage,
  type ContactPage,
} from '#shared/schemas/contact-page'
import { getCatalogClient } from '../utils/catalog-client'

export async function getContactPage(event: H3Event): Promise<ContactPage> {
  const source = useRuntimeConfig(event).catalogSource
  if (source === 'demo') return structuredClone(defaultContactPage)
  if (source !== 'supabase')
    throw createError({ statusCode: 503, statusMessage: 'Sumber katalog tidak valid' })
  const { data, error } = await getCatalogClient(event)
    .from('contact_page')
    .select('content,phones')
    .eq('id', true)
    .single()
  const parsed = contactPageSchema.safeParse({
    ...data?.content,
    ...(data?.phones != null ? { phones: data.phones } : {}),
  })
  if (error || !parsed.success)
    throw createError({
      statusCode: 503,
      statusMessage:
        'Informasi kontak belum dapat dimuat. Pastikan migration halaman Kontak sudah diterapkan.',
    })
  return parsed.data
}

export async function saveContactPage(event: H3Event, content: ContactPage): Promise<ContactPage> {
  const client = await serverSupabaseClient<EditorDatabase>(event)
  const { phones, ...legacyContent } = content
  const { data, error } = await client
    .from('contact_page')
    .update({ content: legacyContent, phones })
    .eq('id', true)
    .select('content,phones')
    .single()
  const parsed = contactPageSchema.safeParse({
    ...data?.content,
    ...(data?.phones != null ? { phones: data.phones } : {}),
  })
  if (error || !parsed.success)
    throw createError({
      statusCode: 503,
      statusMessage: 'Informasi kontak gagal disimpan. Periksa akses dan migration halaman Kontak.',
    })
  return parsed.data
}
