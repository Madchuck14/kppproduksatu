export function getProductIdentifier(product: { bookCode?: string | null; slug: string }) {
  return product.bookCode || product.slug
}

export function getProductPath(product: { bookCode?: string | null; slug: string }) {
  return `/products/${encodeURIComponent(getProductIdentifier(product))}`
}
