import type { H3Event } from 'h3'
import { defaultLandingHero, landingHeroSchema } from '#shared/schemas/landing-hero'
import { getCatalogClient } from '../utils/catalog-client'

export async function getLandingHero(event: H3Event) {
  const source = useRuntimeConfig(event).catalogSource
  if (source === 'demo') return { ...defaultLandingHero }
  if (source !== 'supabase')
    throw createError({ statusCode: 503, statusMessage: 'Sumber katalog tidak valid' })
  const { data, error } = await getCatalogClient(event)
    .from('landing_hero')
    .select('heading,body')
    .eq('id', true)
    .single()
  const parsed = landingHeroSchema.safeParse(data)
  if (error || !parsed.success)
    throw createError({
      statusCode: 503,
      statusMessage: 'Teks hero belum dapat dimuat. Pastikan migration teks hero sudah diterapkan.',
    })
  return parsed.data
}
