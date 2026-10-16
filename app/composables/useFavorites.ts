import type { FavoriteIds } from '#shared/types/favorite'

export function useFavorites() {
  const editorAccount = useEditorAccount()
  const { data } = useNuxtData<FavoriteIds>('favorite-ids')
  const pending = useState<string[]>('favorite-pending', () => [])
  const ownerId = computed(() => editorAccount.value?.id ?? null)
  const ready = computed(() =>
    Boolean(ownerId.value && data.value?.ownerId === ownerId.value && !data.value.unavailable),
  )
  const ids = computed(() => (ready.value ? (data.value?.ids ?? []) : []))

  async function toggle(productId: string) {
    const owner = ownerId.value
    if (!owner) throw new Error('Favorit hanya tersedia untuk Editor.')
    const key = `${owner}:${productId}`
    if (pending.value.includes(key)) return
    pending.value = [...pending.value, key]
    try {
      if (!ready.value) await refreshNuxtData('favorite-ids')
      if (!ready.value || ownerId.value !== owner)
        throw new Error('Favorit belum dapat dimuat. Silakan coba lagi.')
      const saved = ids.value.includes(productId)
      await $fetch(`/api/favorites/${encodeURIComponent(productId)}`, {
        method: saved ? 'DELETE' : 'PUT',
      })
      // Ignore responses from a session that has logged out or switched accounts.
      if (ownerId.value === owner && data.value?.ownerId === owner) {
        data.value = {
          ownerId: owner,
          ids: saved
            ? data.value.ids.filter((id) => id !== productId)
            : [...new Set([...data.value.ids, productId])],
        }
        await refreshNuxtData('favorites-list')
        return !saved
      }
    } finally {
      pending.value = pending.value.filter((item) => item !== key)
    }
  }
  return {
    canUse: computed(() => Boolean(editorAccount.value)),
    ids,
    ready,
    ownerId,
    toggle,
    isPending: (id: string) => pending.value.includes(`${ownerId.value}:${id}`),
  }
}
