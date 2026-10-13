import { productSlugSchema } from '#shared/schemas/catalog'
import { bookResourceKindSchema } from '../../../../utils/book-resource'
import { getBookResource } from '../../../../repositories/book-resources'

export default defineEventHandler(async (event) => {
  const slug = productSlugSchema.safeParse(getRouterParam(event, 'slug'))
  const kind = bookResourceKindSchema.safeParse(getRouterParam(event, 'kind'))
  if (!slug.success || !kind.success)
    throw createError({ statusCode: 400, statusMessage: 'Buku atau jenis materi tidak valid' })
  const { client, path, extension, slides } = await getBookResource(event, slug.data, kind.data)
  const query = getQuery(event)
  const isPresentationPowerPoint =
    kind.data === 'product-knowledge' && (extension === 'ppt' || extension === 'pptx')
  if (query.preview === '1' && extension !== 'pdf' && !isPresentationPowerPoint)
    throw createError({
      statusCode: 415,
      statusMessage: 'Format materi ini tidak mendukung pratinjau',
    })
  const signed = await client.storage
    .from('book-materials')
    .createSignedUrl(
      path,
      60,
      query.download === '1' ? { download: `${slug.data}-${kind.data}.${extension}` } : undefined,
    )
  if (signed.error || !signed.data?.signedUrl)
    throw createError({ statusCode: 503, statusMessage: 'Materi belum dapat dibuka' })
  if (query.preview === '1') {
    if (kind.data === 'product-knowledge' && extension !== 'pdf') {
      const signedSlides = slides.length
        ? await client.storage.from('book-materials').createSignedUrls(slides, 60)
        : { data: [], error: null }
      if (
        signedSlides.error ||
        !signedSlides.data ||
        signedSlides.data.some((slide) => slide.error || !slide.signedUrl)
      )
        throw createError({ statusCode: 503, statusMessage: 'Slide belum dapat dibuka' })
      return {
        url: signed.data.signedUrl,
        format: extension,
        slides: signedSlides.data.map((slide) => slide.signedUrl),
      }
    }
    return { url: signed.data.signedUrl, format: extension }
  }
  return sendRedirect(event, signed.data.signedUrl, 302)
})
