import { productIdentifierSchema } from '#shared/schemas/catalog'
import { bookResourceKindSchema } from '../../../../utils/book-resource'
import { getBookResource } from '../../../../repositories/book-resources'

export default defineEventHandler(async (event) => {
  const identifier = productIdentifierSchema.safeParse(getRouterParam(event, 'slug'))
  const kind = bookResourceKindSchema.safeParse(getRouterParam(event, 'kind'))
  if (!identifier.success || !kind.success)
    throw createError({ statusCode: 400, statusMessage: 'Buku atau jenis materi tidak valid' })
  const query = getQuery(event)
  const preview = query.preview === '1'
  const { client, path, extension } = await getBookResource(
    event,
    identifier.data,
    kind.data,
    preview,
  )
  if (preview && extension !== 'pdf')
    throw createError({ statusCode: 415, statusMessage: 'Format materi tidak mendukung tampilan' })
  const signed = await client.storage
    .from('book-materials')
    .createSignedUrl(
      path,
      60,
      query.download === '1'
        ? { download: `${identifier.data}-${kind.data}.${extension}` }
        : undefined,
    )
  if (signed.error || !signed.data?.signedUrl)
    throw createError({ statusCode: 503, statusMessage: 'Materi belum dapat dibuka' })
  if (query.preview === '1') {
    return { url: signed.data.signedUrl, format: extension }
  }
  return sendRedirect(event, signed.data.signedUrl, 302)
})
