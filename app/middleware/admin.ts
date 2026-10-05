export default defineNuxtRouteMiddleware(async () => {
  const requestFetch = useRequestFetch()
  try {
    await requestFetch('/api/admin/session')
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (status === 401) return navigateTo('/login')
    throw createError({ statusCode: status ?? 503, statusMessage: 'Akses admin tidak tersedia' })
  }
})
