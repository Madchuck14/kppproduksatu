import type { H3Event } from 'h3'
import { z } from 'zod'
import { educationLevelSchema } from '#shared/schemas/auth'
import { bookDivisions } from '#shared/utils/book-divisions'
import type { CatalogBrowse } from '#shared/types/catalog-browse'
import { demoProducts } from '../data/products'
import { getCatalogClient } from '../utils/catalog-client'
import { mapProductRow, productColumns } from './products'

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
  const client = getCatalogClient(event)
  const { data, error } = await client.rpc('catalog_browse_groups', {
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
        books: z.array(z.object({ id: z.string().uuid() }).passthrough()),
      }),
    )
    .parse(data)
  // Older RPC definitions omit the newer public detail columns. Read their actual
  // values in one query, preserving the RPC's ranking instead of inventing defaults.
  const missingDetailIds = [
    ...new Set(
      rows
        .flatMap((row) => row.books)
        .filter((book) =>
          ['division_code', 'synopsis', 'target_market', 'curriculum', 'isbn'].some(
            (key) => !(key in book),
          ),
        )
        .map((book) => book.id),
    ),
  ]
  const details = new Map<string, ReturnType<typeof mapProductRow>>()
  if (missingDetailIds.length) {
    const { data: products, error: detailError } = await client
      .from('products')
      .select(productColumns)
      .in('id', missingDetailIds)
      .eq('published', true)
    if (detailError)
      throw createError({
        statusCode: 503,
        statusMessage: 'Informasi buku pada ranking belum dapat dimuat',
      })
    for (const product of products ?? []) {
      const mapped = mapProductRow(event, product)
      details.set(mapped.id, mapped)
    }
  }
  const missingIds = new Set(missingDetailIds)
  return {
    source,
    groups: rows.map((row) => ({
      code: row.group_code,
      total: row.book_count,
      products: row.books.flatMap((book) => {
        if (!missingIds.has(book.id)) return [mapProductRow(event, book)]
        const product = details.get(book.id)
        // A book unpublished between the RPC and detail read must not be exposed.
        return product ? [product] : []
      }),
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
