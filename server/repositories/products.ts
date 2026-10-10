import type { H3Event } from 'h3'
import { z } from 'zod'
import { bookSubjectSchema, bookHighlightsSchema } from '#shared/schemas/editor'
import { educationLevelSchema } from '#shared/schemas/auth'
import { landingSubjects } from '#shared/utils/landing-subjects'
import type { Product, ProductList } from '#shared/types/product'
import { demoProducts } from '../data/products'
import { getCatalogClient } from '../utils/catalog-client'
import { getProductImageUrl } from '../utils/storage'

const rowSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  author: z.string(),
  description: z.string(),
  highlights: bookHighlightsSchema.default([]),
  price: z.number().nonnegative(),
  image_path: z.string().nullable(),
  featured: z.boolean(),
  book_code: z.string().nullable(),
  education_level: educationLevelSchema.nullable(),
  subject: bookSubjectSchema.nullable(),
  grade: z.number().int().min(1).max(12).nullable(),
  publication_year: z.number().int().nullable(),
})
export const productColumns =
  'id,slug,title,author,description,highlights,price,image_path,featured,book_code,education_level,grade,subject,publication_year'

function sourceFor(event: H3Event): ProductList['source'] {
  const source = useRuntimeConfig(event).catalogSource
  if (source !== 'demo' && source !== 'supabase') {
    throw createError({ statusCode: 503, statusMessage: 'Sumber katalog tidak valid' })
  }
  return source
}

export function mapProductRow(event: H3Event, value: unknown): Product {
  const row = rowSchema.parse(value)
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    author: row.author,
    description: row.description,
    highlights: row.highlights,
    price: row.price,
    featured: row.featured,
    bookCode: row.book_code,
    educationLevel: row.education_level,
    subject: row.subject,
    grade: row.grade,
    publicationYear: row.publication_year,
    imageUrl: getProductImageUrl(useRuntimeConfig(event).public.supabase.url, row.image_path),
  }
}

export async function listProducts(
  event: H3Event,
  options: {
    q: string
    featured?: string
    level?: string
    grade?: number
    subject?: string | string[]
    page?: number
    pageSize?: number
    sort?: 'newest' | 'title-asc' | 'title-desc'
  },
): Promise<ProductList> {
  const source = sourceFor(event)
  // Strip PostgREST filter punctuation; never interpolate raw query input.
  const search = options.q.replace(/[^\p{L}\p{N}\s._-]/gu, '').trim()
  const featured = options.featured === undefined ? undefined : options.featured === 'true'
  const subjects = options.subject ? [options.subject].flat() : []
  const pageSize = options.pageSize ?? 15
  const searchFilter = `title.ilike.%${search}%,author.ilike.%${search}%,book_code.ilike.%${search}%,subject.ilike.%${search}%`
  if (source === 'demo') {
    const matchingProducts = demoProducts.filter(
      (product) =>
        (featured === undefined || product.featured === featured) &&
        (!options.level || product.educationLevel === options.level) &&
        (options.grade === undefined || product.grade === options.grade) &&
        `${product.title} ${product.author} ${product.bookCode ?? ''} ${product.subject ?? ''}`
          .toLocaleLowerCase('id-ID')
          .includes(search.toLocaleLowerCase('id-ID')),
    )
    let products = matchingProducts.filter(
      (product) => !subjects.length || subjects.includes(product.subject ?? ''),
    )
    if (options.sort && options.sort !== 'newest') {
      products = [...products].sort(
        (a, b) => a.title.localeCompare(b.title, 'id') * (options.sort === 'title-desc' ? -1 : 1),
      )
    }
    if (!options.page) return { source, products }
    const total = products.length
    const page = Math.min(options.page, Math.max(1, Math.ceil(total / pageSize)))
    const subjectCounts: Record<string, number> = {}
    for (const product of matchingProducts) {
      if (product.subject)
        subjectCounts[product.subject] = (subjectCounts[product.subject] ?? 0) + 1
    }
    return {
      source,
      products: products.slice((page - 1) * pageSize, page * pageSize),
      total,
      page,
      pageSize,
      subjectCounts,
    }
  }
  let query = getCatalogClient(event)
    .from('products')
    .select(productColumns, options.page ? { count: 'exact' } : {})
    .eq('published', true)
    .order(options.sort && options.sort !== 'newest' ? 'title' : 'created_at', {
      ascending: options.sort === 'title-asc',
    })
    .order('id', { ascending: true })
  if (featured !== undefined) query = query.eq('featured', featured)
  if (options.level) query = query.eq('education_level', options.level)
  if (options.grade !== undefined) query = query.eq('grade', options.grade)
  if (subjects.length) query = query.in('subject', subjects)
  if (search) query = query.or(searchFilter)
  const start = options.page ? (options.page - 1) * pageSize : 0
  const { data, error, count } = await (options.page
    ? query.range(start, start + pageSize - 1)
    : query.limit(60))
  if (error) throw createError({ statusCode: 503, statusMessage: 'Katalog tidak tersedia' })
  const products = (data ?? []).map((row) => mapProductRow(event, row))
  if (!options.page) return { source, products }
  const total = count ?? 0
  const page = Math.min(options.page, Math.max(1, Math.ceil(total / pageSize)))
  if (page !== options.page) return listProducts(event, { ...options, page })
  // Read only subject metadata in batches, without the product list's row cap.
  const subjectCounts: Record<string, number> = {}
  for (let offset = 0; ; offset += 1000) {
    let facets = getCatalogClient(event)
      .from('products')
      .select('subject')
      .eq('published', true)
      .order('id')
      .range(offset, offset + 999)
    if (options.level) facets = facets.eq('education_level', options.level)
    if (options.grade !== undefined) facets = facets.eq('grade', options.grade)
    if (featured !== undefined) facets = facets.eq('featured', featured)
    if (search) facets = facets.or(searchFilter)
    const { data: rows, error: facetError } = await facets
    if (facetError)
      throw createError({ statusCode: 503, statusMessage: 'Jumlah buku belum tersedia' })
    for (const row of rows ?? []) {
      if (row.subject) subjectCounts[row.subject] = (subjectCounts[row.subject] ?? 0) + 1
    }
    if (!rows || rows.length < 1000) break
  }
  return { source, products, total, page, pageSize, subjectCounts }
}

export async function getProduct(event: H3Event, slug: string): Promise<Product> {
  if (sourceFor(event) === 'demo') {
    const product = demoProducts.find((item) => item.slug === slug)
    if (!product) throw createError({ statusCode: 404, statusMessage: 'Produk tidak ditemukan' })
    return product
  }
  const { data, error } = await getCatalogClient(event)
    .from('products')
    .select(productColumns)
    .eq('published', true)
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw createError({ statusCode: 503, statusMessage: 'Katalog tidak tersedia' })
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Produk tidak ditemukan' })
  return mapProductRow(event, data)
}

// Count the same search results used by category links, without the list's 60-row cap.
export async function getLandingLevelCounts(event: H3Event) {
  const source = sourceFor(event)
  const entries = await Promise.all(
    educationLevelSchema.options.map(async (level) => {
      if (source === 'demo') {
        const result = await listProducts(event, { q: '', level })
        return [level, result.products.length] as const
      }
      const { count, error } = await getCatalogClient(event)
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('published', true)
        .eq('education_level', level)
      if (error) throw createError({ statusCode: 503, statusMessage: 'Jumlah buku belum tersedia' })
      return [level, count ?? 0] as const
    }),
  )
  return Object.fromEntries(entries)
}

// Retain the subject-count endpoint for existing API consumers.
export async function getLandingSubjectCounts(event: H3Event) {
  const source = sourceFor(event)
  const entries = await Promise.all(
    landingSubjects.map(async ({ name }) => {
      if (source === 'demo') {
        const result = await listProducts(event, { q: name })
        return [name, result.products.length] as const
      }
      const { count, error } = await getCatalogClient(event)
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('published', true)
        .or(
          `title.ilike.%${name}%,author.ilike.%${name}%,book_code.ilike.%${name}%,subject.ilike.%${name}%`,
        )
      if (error) throw createError({ statusCode: 503, statusMessage: 'Jumlah buku belum tersedia' })
      return [name, count ?? 0] as const
    }),
  )
  return Object.fromEntries(entries)
}
