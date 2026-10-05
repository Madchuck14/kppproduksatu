export default defineEventHandler(() => {
  throw createError({
    statusCode: 403,
    statusMessage: 'Pendaftaran mandiri dinonaktifkan',
  })
})
