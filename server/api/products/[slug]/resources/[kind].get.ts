import { productSlugSchema } from '#shared/schemas/catalog'
import { bookResourceKindSchema } from '../../../../utils/book-resource'
import { getBookResource } from '../../../../repositories/book-resources'

export default defineEventHandler(async (event) => {
  const slug = productSlugSchema.safeParse(getRouterParam(event, 'slug'))
  const kind = bookResourceKindSchema.safeParse(getRouterParam(event, 'kind'))
  if (!slug.success || !kind.success)
    throw createError({ statusCode: 400, statusMessage: 'Buku atau jenis materi tidak valid' })
  const { client, path, extension } = await getBookResource(event, slug.data, kind.data)
  const query = getQuery(event)
  const isPresentationPowerPoint = kind.data === 'product-knowledge' && extension === 'pptx'
  if (query.preview === '1' && extension !== 'pdf' && !isPresentationPowerPoint)
    throw createError({
      statusCode: 415,
      statusMessage:
        extension === 'ppt'
          ? 'Simpan PowerPoint sebagai PPTX untuk membuka pratinjau. Berkas PPT tetap dapat diunduh.'
          : 'Format materi ini tidak mendukung pratinjau',
    })
  const signed = await client.storage
    .from('book-materials')
    .createSignedUrl(
      path,
      query.preview === '1' && isPresentationPowerPoint ? 600 : 60,
      query.download === '1' ? { download: `${slug.data}-${kind.data}.${extension}` } : undefined,
    )
  if (signed.error || !signed.data?.signedUrl)
    throw createError({ statusCode: 503, statusMessage: 'Materi belum dapat dibuka' })
  if (query.preview === '1') {
    return { url: signed.data.signedUrl, format: extension }
  }
  return sendRedirect(event, signed.data.signedUrl, 302)
})
