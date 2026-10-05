import { getRequestWebStream, getHeader, createError } from 'h3'
import type { H3Event } from 'h3'

const maxSize = 2 * 1024 * 1024
const types: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
}

export async function readCoverImage(event: H3Event) {
  const type = (getHeader(event, 'content-type') ?? '').split(';')[0] ?? ''
  const extension = types[type]
  if (!extension)
    throw createError({
      statusCode: 400,
      statusMessage: 'Gunakan gambar JPG, PNG, WebP, atau AVIF',
    })
  const stream = getRequestWebStream(event)
  if (!stream) throw createError({ statusCode: 400, statusMessage: 'Pilih berkas sampul' })
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxSize) {
        await reader.cancel()
        throw createError({ statusCode: 413, statusMessage: 'Ukuran sampul maksimal 2 MB' })
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  const ascii = (start: number, end: number) => new TextDecoder().decode(bytes.slice(start, end))
  const valid =
    size >= 16 &&
    ((type === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
      (type === 'image/png' &&
        [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) ||
      (type === 'image/webp' && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') ||
      (type === 'image/avif' && ascii(4, 8) === 'ftyp' && ['avif', 'avis'].includes(ascii(8, 12))))
  if (!valid)
    throw createError({
      statusCode: 400,
      statusMessage: 'Isi berkas tidak sesuai dengan format gambar',
    })
  return { bytes, type, extension }
}
