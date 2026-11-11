export default defineNuxtRouteMiddleware(async () => {
  const account = await useRequestFetch()('/api/admin/editor-session')
  if (!account.isSuper)
    throw createError({
      statusCode: 403,
      statusMessage: 'Halaman ini hanya dapat diakses oleh Editor super.',
    })
})
