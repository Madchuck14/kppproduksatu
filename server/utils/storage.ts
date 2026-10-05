export function getProductImageUrl(supabaseUrl: string, path: string | null) {
  if (!path) return '/images/book-placeholder.svg'
  const parts = path.split('/')
  if (parts.some(part => !part || part === '.' || part === '..')) {
    return '/images/book-placeholder.svg'
  }
  const encodedPath = parts.map(encodeURIComponent).join('/')
  return `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/product-images/${encodedPath}`
}
