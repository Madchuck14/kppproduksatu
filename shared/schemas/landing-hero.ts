import { z } from 'zod'

export const landingHeroSchema = z
  .object({
    heading: z
      .string()
      .trim()
      .min(1, 'Heading hero wajib diisi.')
      .max(100, 'Heading maksimal 100 karakter.'),
    body: z
      .string()
      .trim()
      .min(1, 'Isi hero wajib diisi.')
      .max(400, 'Isi hero maksimal 400 karakter.'),
  })
  .strict()

export type LandingHero = z.infer<typeof landingHeroSchema>

export const defaultLandingHero: LandingHero = {
  heading: 'Temukan Buku Pilihanmu',
  body: 'Jelajahi berbagai koleksi buku pelajaran untuk menemani rasa ingin tahu dan setiap langkah perjalananmu.',
}
