export default defineNuxtRouteMiddleware(async (to) => {
  const requestFetch = useRequestFetch()
  try {
    await requestFetch('/api/admin/editor-session')
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (status === 401)
      return navigateTo({
        path: '/login',
        query: { returnTo: to.path === '/favorites' ? '/favorites' : '/admin' },
      })
    throw createError({
      statusCode: status ?? 503,
      statusMessage:
        status === 403
          ? 'Halaman ini hanya dapat diakses oleh Editor'
          : 'Akses Editor belum tersedia',
    })
  }
})
