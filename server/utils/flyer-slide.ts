import { createError } from 'h3'

export function validateFlyerSlide(bytes: Uint8Array, type: string) {
  const valid =
    bytes.length >= 16 &&
    bytes.length <= 2 * 1024 * 1024 &&
    ((type === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
      (type === 'image/png' &&
        [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)))
  if (!valid)
    throw createError({
      statusCode: 400,
      statusMessage: 'Gunakan slide PNG/JPG yang valid, maksimal 2 MB per gambar',
    })
  return type === 'image/png' ? 'png' : 'jpg'
}
