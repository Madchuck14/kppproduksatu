import type { AccountSession } from '#shared/types/account'

export function useEditorAccount() {
  const user = useSupabaseUser()
  const { data } = useNuxtData<AccountSession | null>('navigation-account')
  return computed(() =>
    user.value?.sub && data.value?.id === user.value.sub && data.value.role === 'editor'
      ? data.value
      : null,
  )
}
