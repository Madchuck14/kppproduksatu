import { serverSupabaseClient } from '#supabase/server'
import type { H3Event } from 'h3'
import type { EditorDatabase } from '#shared/types/editor-database'
import type { BookResourceKind } from '../utils/book-resource'
import { bookResourceColumns, bookResourceExtensionSchema } from '../utils/book-resource'

export async function getBookResource(event: H3Event, slug: string, kind: BookResourceKind) {
  const client = await serverSupabaseClient<EditorDatabase>(event)
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser()
  if (authError || !user)
    throw createError({ statusCode: 401, statusMessage: 'Silakan login untuk membuka materi' })
  const { data, error } = await client
    .from('products')
    .select('flyer_path,flyer_slide_paths,dummy_book_path,product_knowledge_path')
    .eq('slug', slug)
    .eq('published', true)
    .maybeSingle()
  if (error) throw createError({ statusCode: 503, statusMessage: 'Materi belum dapat dibuka' })
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Buku tidak ditemukan' })
  const path = data[bookResourceColumns[kind]]
  if (!path) throw createError({ statusCode: 404, statusMessage: 'Materi belum tersedia' })
  const extension = bookResourceExtensionSchema.safeParse(path.split('.').pop()?.toLowerCase())
  if (!extension.success || (kind === 'dummy' && extension.data !== 'pdf'))
    throw createError({ statusCode: 503, statusMessage: 'Format materi tidak valid' })
  return {
    client,
    path,
    extension: extension.data,
    slides: kind === 'flyer' ? data.flyer_slide_paths : [],
  }
}
