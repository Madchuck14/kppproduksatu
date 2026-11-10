export default defineNuxtRouteMiddleware(async () => {
  try {
    await useRequestFetch()('/api/auth/session')
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (status === 401) return navigateTo({ path: '/login', query: { returnTo: '/favorites' } })
    throw createError({ statusCode: status ?? 503, statusMessage: 'Akses akun belum tersedia' })
  }
})
