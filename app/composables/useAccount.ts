import type { AccountSession } from '#shared/types/account'

export function useAccount() {
  const user = useSupabaseUser()
  const { data } = useNuxtData<AccountSession | null>('navigation-account')
  return computed(() =>
    user.value?.sub &&
    data.value?.id === user.value.sub &&
    (data.value.role === 'sales' || data.value.role === 'editor')
      ? data.value
      : null,
  )
}
