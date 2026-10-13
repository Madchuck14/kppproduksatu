import { createError, getHeader, getRequestWebStream } from 'h3'
import type { H3Event } from 'h3'

export const materialKinds = ['flyer', 'dummy', 'product-knowledge'] as const
export type MaterialKind = (typeof materialKinds)[number]

export async function readUploadBytes(event: H3Event, maxSize: number) {
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
  return bytes
}

export function validateMaterialBytes(bytes: Uint8Array, extension: string) {
  const starts = (signature: number[]) => signature.every((value, index) => bytes[index] === value)
  let valid = false
  if (extension === 'pdf') valid = starts([37, 80, 68, 70, 45])
  if (extension === 'ppt') {
    // Legacy PowerPoint uses an OLE compound file with this UTF-16 directory entry.
    const marker = Array.from('PowerPoint Document', (char) => `${char}\0`).join('')
    valid =
      starts([208, 207, 17, 224, 161, 177, 26, 225]) &&
      new TextDecoder('latin1').decode(bytes).includes(marker)
  }
  if (extension === 'pptx' && starts([80, 75, 3, 4])) {
    // Read ZIP central directory names without extracting or executing Office contents.
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    let end = bytes.length - 22
    const minimum = Math.max(0, bytes.length - 65557)
    while (end >= minimum && view.getUint32(end, true) !== 0x06054b50) end -= 1
    if (end >= minimum && end + 22 + view.getUint16(end + 20, true) === bytes.length) {
      const count = view.getUint16(end + 10, true)
      let offset = view.getUint32(end + 16, true)
      const names = new Set<string>()
      for (let index = 0; index < count && offset + 46 <= end; index += 1) {
        if (view.getUint32(offset, true) !== 0x02014b50) break
        const length = view.getUint16(offset + 28, true)
        const next =
          offset +
          46 +
          length +
          view.getUint16(offset + 30, true) +
          view.getUint16(offset + 32, true)
        if (next > end) break
        names.add(new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + length)))
        offset = next
      }
      valid =
        names.has('[Content_Types].xml') &&
        names.has('ppt/presentation.xml') &&
        !Array.from(names).some((name) => /vbaProject\.bin$/i.test(name))
    }
  }
  if (!valid)
    throw createError({
      statusCode: 400,
      statusMessage: 'Isi berkas tidak sesuai dengan formatnya',
    })
}

export async function readBookMaterial(event: H3Event, kind: MaterialKind) {
  const type = (getHeader(event, 'content-type') ?? '').split(';')[0]?.trim() ?? ''
  const extension =
    kind === 'flyer'
      ? (
          {
            'application/vnd.ms-powerpoint': 'ppt',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
          } as Record<string, string>
        )[type]
      : type === 'application/pdf'
        ? 'pdf'
        : undefined
  if (!extension)
    throw createError({
      statusCode: 400,
      statusMessage: kind === 'flyer' ? 'Gunakan berkas PPT atau PPTX' : 'Gunakan berkas PDF',
    })
  const maxSize = kind === 'product-knowledge' ? 50 * 1024 * 1024 : 20 * 1024 * 1024
  const bytes = await readUploadBytes(event, maxSize)
  validateMaterialBytes(bytes, extension)
  return { bytes, type, extension }
}
