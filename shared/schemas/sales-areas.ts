import { z } from 'zod'

export const maxSalesAreas = 10
export const salesAreaSchema = z
  .string()
  .trim()
  .min(1, 'Nama area wajib diisi.')
  .max(100, 'Nama area maksimal 100 karakter.')
export const storedSalesAreasSchema = z
  .array(salesAreaSchema)
  .max(maxSalesAreas, `Maksimal ${maxSalesAreas} area.`)
  .superRefine((areas, context) => {
    const seen = new Set<string>()
    areas.forEach((area, index) => {
      const key = area.toLowerCase()
      if (seen.has(key))
        context.addIssue({ code: 'custom', path: [index], message: 'Area tidak boleh duplikat.' })
      seen.add(key)
    })
  })
export const saveSalesAreasSchema = z
  .object({
    areas: storedSalesAreasSchema.refine(
      (areas) => areas.length > 0,
      'Isi minimal satu area Sales.',
    ),
  })
  .strict()
