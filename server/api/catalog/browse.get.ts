import { z } from 'zod'
import { getCatalogBrowse } from '../../repositories/catalog-browse'

export default defineEventHandler(async (event) => {
  const parsed = z.object({ kind: z.enum(['level', 'division']) }).safeParse(getQuery(event))
  if (!parsed.success)
    throw createError({ statusCode: 400, statusMessage: 'Kelompok katalog tidak valid' })
  return getCatalogBrowse(event, parsed.data.kind)
})
