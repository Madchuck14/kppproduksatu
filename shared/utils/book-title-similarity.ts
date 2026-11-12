export function bookTitleSimilarity(title: string, search: string) {
  const normalize = (value: string) =>
    value
      .toLocaleLowerCase('id-ID')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
  const a = normalize(title)
  const b = normalize(search)
  if (!a || !b) return 0
  if (a === b) return 1
  const pairs = (value: string) =>
    new Set(Array.from({ length: Math.max(0, value.length - 1) }, (_, i) => value.slice(i, i + 2)))
  const left = pairs(a)
  const right = pairs(b)
  const overlap = [...left].filter((pair) => right.has(pair)).length
  return Math.max(
    a.includes(b) ? 0.8 + (0.19 * b.length) / a.length : 0,
    left.size + right.size ? (2 * overlap) / (left.size + right.size) : 0,
  )
}
