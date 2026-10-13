import type { H3Event } from 'h3'
import { z } from 'zod'
import { educationLevelSchema } from '#shared/schemas/auth'
import { bookDivisions } from '#shared/utils/book-divisions'
import type { CatalogBrowse } from '#shared/types/catalog-browse'
import { demoProducts } from '../data/products'
import { getCatalogClient } from '../utils/catalog-client'
import { mapProductRow } from './products'

export async function getCatalogBrowse(
  event: H3Event,
  kind: 'level' | 'division',
): Promise<CatalogBrowse> {
  const source = useRuntimeConfig(event).catalogSource
  const codes =
    kind === 'level' ? educationLevelSchema.options : bookDivisions.map((item) => item.code)
  if (source === 'demo') {
    return {
      source,
      groups: codes.map((code) => ({
        code,
        total: demoProducts.filter((book) =>
          kind === 'level' ? book.educationLevel === code : book.divisionCode === code,
        ).length,
        products: [],
      })),
    }
  }
  if (source !== 'supabase')
    throw createError({ statusCode: 503, statusMessage: 'Sumber katalog tidak valid' })
  const { data, error } = await getCatalogClient(event).rpc('catalog_browse_groups', {
    group_kind: kind,
  })
  if (error)
    throw createError({
      statusCode: 503,
      statusMessage:
        'Koleksi buku belum tersedia. Pastikan migration divisi dan popularitas sudah diterapkan.',
    })
  const rows = z
    .array(
      z.object({
        group_code: z.string(),
        book_count: z.number().int().nonnegative(),
        books: z.array(z.unknown()),
      }),
    )
    .parse(data)
  return {
    source,
    groups: rows.map((row) => ({
      code: row.group_code,
      total: row.book_count,
      products: row.books.map((book) => mapProductRow(event, book)),
    })),
  }
}

export async function recordProductAccess(event: H3Event, slug: string, visitor: string) {
  const source = useRuntimeConfig(event).catalogSource
  if (source === 'demo') return { recorded: false }
  if (source !== 'supabase')
    throw createError({ statusCode: 503, statusMessage: 'Sumber katalog tidak valid' })
  const { data, error } = await getCatalogClient(event).rpc('record_product_access', {
    book_slug: slug,
    visitor,
  })
  if (error) throw createError({ statusCode: 503, statusMessage: 'Akses buku belum dapat dicatat' })
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Buku tidak ditemukan' })
  return { recorded: true }
}
