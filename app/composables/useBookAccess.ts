export function useBookAccess(slug: () => string | undefined) {
  function record() {
    const currentSlug = slug()
    if (!currentSlug) return
    try {
      const key = 'kpp-catalog-visitor'
      let visitor = localStorage.getItem(key)
      if (!visitor || !/^[0-9a-f-]{36}$/i.test(visitor)) {
        visitor = crypto.randomUUID()
        localStorage.setItem(key, visitor)
      }
      // Failure must not block the book page. The database deduplicates retries.
      void $fetch(`/api/products/${encodeURIComponent(currentSlug)}/access`, {
        method: 'POST',
        body: { visitor },
      }).catch(() => {})
    } catch {
      // Disabled browser storage means this browser does not participate in counts.
    }
  }
  onMounted(record)
  watch(slug, () => {
    if (import.meta.client) record()
  })
}
