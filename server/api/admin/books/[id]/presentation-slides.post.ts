import { serverSupabaseClient } from '#supabase/server'
import { bookIdSchema } from '#shared/schemas/editor'
import { requireEditor } from '../../../../utils/require-editor'
import {
  getEditorPresentationPath,
  setEditorPresentationSlides,
} from '../../../../repositories/editor-books'
import { readUploadBytes } from '../../../../utils/book-material'
import { validatePresentationSlide } from '../../../../utils/presentation-slide'

export default defineEventHandler(async (event) => {
  const account = await requireEditor(event)
  const id = bookIdSchema.safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createError({ statusCode: 400, statusMessage: 'Buku tidak valid' })
  const presentationPath = await getEditorPresentationPath(event, account, id.data)
  const contentType = getHeader(event, 'content-type') ?? ''
  if (!contentType.startsWith('multipart/form-data;'))
    throw createError({ statusCode: 400, statusMessage: 'Pilih gambar slide' })
  const bytes = await readUploadBytes(event, 41 * 1024 * 1024)
  let form: FormData
  try {
    form = await new Response(bytes as BodyInit, {
      headers: { 'Content-Type': contentType },
    }).formData()
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Unggahan slide tidak valid' })
  }
  const slides = form.getAll('slides')
  if (!slides.length || slides.length > 20 || slides.some((slide) => typeof slide === 'string'))
    throw createError({ statusCode: 400, statusMessage: 'Pilih 1–20 gambar slide' })
  const validated = await Promise.all(
    slides.map(async (slide) => {
      const file = slide as File
      const data = new Uint8Array(await file.arrayBuffer())
      const extension = validatePresentationSlide(data, file.type)
      return { data, type: file.type, extension }
    }),
  )
  const client = await serverSupabaseClient(event)
  const paths: string[] = []
  try {
    for (const slide of validated) {
      const path = `books/${id.data}/presentation-slides/${crypto.randomUUID()}.${slide.extension}`
      const { error } = await client.storage
        .from('book-materials')
        .upload(path, slide.data, { contentType: slide.type, upsert: false })
      if (error)
        throw createError({ statusCode: 503, statusMessage: 'Slide gagal diunggah. Coba lagi.' })
      paths.push(path)
    }
    return await setEditorPresentationSlides(event, account, id.data, presentationPath, paths)
  } catch (error) {
    if (paths.length) await client.storage.from('book-materials').remove(paths)
    throw error
  }
})
