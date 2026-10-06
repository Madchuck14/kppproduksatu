import { createError, getHeader, getRequestWebStream } from 'h3'
import type { H3Event } from 'h3'

export const materialKinds = ['flyer', 'dummy', 'product-knowledge'] as const
export type MaterialKind = (typeof materialKinds)[number]

export async function readBookMaterial(event: H3Event, kind: MaterialKind) {
  const type = (getHeader(event, 'content-type') ?? '').split(';')[0] ?? ''
  const extension = type === 'application/pdf' ? 'pdf' : undefined
  if (!extension)
    throw createError({
      statusCode: 400,
      statusMessage: 'Gunakan berkas PDF',
    })
  const maxSize = kind === 'product-knowledge' ? 50 * 1024 * 1024 : 20 * 1024 * 1024
  const stream = getRequestWebStream(event)
  if (!stream) throw createError({ statusCode: 400, statusMessage: 'Pilih berkas untuk diunggah' })
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
        throw createError({
          statusCode: 413,
          statusMessage: `Ukuran berkas maksimal ${maxSize / 1024 / 1024} MB`,
        })
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
  const pdf = [37, 80, 68, 70, 45]
  if (size === 0 || !pdf.every((value, index) => bytes[index] === value))
    throw createError({
      statusCode: 400,
      statusMessage: 'Isi berkas tidak sesuai dengan formatnya',
    })
  return { bytes, type, extension }
}
