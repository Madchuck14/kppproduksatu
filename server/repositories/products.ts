import type { H3Event } from 'h3'
import { z } from 'zod'
import { bookSubjectSchema } from '#shared/schemas/editor'
import { educationLevelSchema } from '#shared/schemas/auth'
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
  price: z.number().nonnegative(),
  image_path: z.string().nullable(),
  featured: z.boolean(),
  book_code: z.string().nullable(),
  education_level: educationLevelSchema.nullable(),
  subject: bookSubjectSchema.nullable(),
  publication_year: z.number().int().nullable(),
})
const columns =
  'id,slug,title,author,description,price,image_path,featured,book_code,education_level,subject,publication_year'

function sourceFor(event: H3Event): ProductList['source'] {
  const source = useRuntimeConfig(event).catalogSource
  if (source !== 'demo' && source !== 'supabase') {
    throw createError({ statusCode: 503, statusMessage: 'Sumber katalog tidak valid' })
  }
  return source
}

function mapRow(event: H3Event, value: unknown): Product {
  const row = rowSchema.parse(value)
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    author: row.author,
    description: row.description,
    price: row.price,
    featured: row.featured,
    bookCode: row.book_code,
    educationLevel: row.education_level,
    subject: row.subject,
    publicationYear: row.publication_year,
    imageUrl: getProductImageUrl(useRuntimeConfig(event).public.supabase.url, row.image_path),
  }
}

export async function listProducts(
  event: H3Event,
  options: { q: string; featured?: string; level?: string },
): Promise<ProductList> {
  const source = sourceFor(event)
  // Strip PostgREST filter punctuation; never interpolate raw query input.
  const search = options.q.replace(/[^\p{L}\p{N}\s._-]/gu, '').trim()
  const featured = options.featured === undefined ? undefined : options.featured === 'true'
  if (source === 'demo') {
    return {
      source,
      products: demoProducts.filter(
        (product) =>
          (featured === undefined || product.featured === featured) &&
          (!options.level || product.educationLevel === options.level) &&
          `${product.title} ${product.author} ${product.bookCode ?? ''}`
            .toLocaleLowerCase('id-ID')
            .includes(search.toLocaleLowerCase('id-ID')),
      ),
    }
  }
  let query = getCatalogClient(event)
    .from('products')
    .select(columns)
    .eq('published', true)
    .order('created_at', { ascending: false })
    .limit(60)
  if (featured !== undefined) query = query.eq('featured', featured)
  if (options.level) query = query.eq('education_level', options.level)
  if (search)
    query = query.or(`title.ilike.%${search}%,author.ilike.%${search}%,book_code.ilike.%${search}%`)
  const { data, error } = await query
  if (error) throw createError({ statusCode: 503, statusMessage: 'Katalog tidak tersedia' })
  return { source, products: (data ?? []).map((row) => mapRow(event, row)) }
}

export async function getProduct(event: H3Event, slug: string): Promise<Product> {
  if (sourceFor(event) === 'demo') {
    const product = demoProducts.find((item) => item.slug === slug)
    if (!product) throw createError({ statusCode: 404, statusMessage: 'Produk tidak ditemukan' })
    return product
  }
  const { data, error } = await getCatalogClient(event)
    .from('products')
    .select(columns)
    .eq('published', true)
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw createError({ statusCode: 503, statusMessage: 'Katalog tidak tersedia' })
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Produk tidak ditemukan' })
  return mapRow(event, data)
}
