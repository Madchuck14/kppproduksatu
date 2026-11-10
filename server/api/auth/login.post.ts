import { loginSchema } from '#shared/schemas/auth'
import { getCatalogClient } from '../../utils/catalog-client'
import { findEmployee, getEmployeeAdmin } from '../../utils/employee-registry'

export default defineEventHandler(async (event) => {
  const parsed = loginSchema.strict().safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({ statusCode: 400, statusMessage: 'Periksa NIP dan kata sandi Anda.' })
  const invalid = () =>
    createError({ statusCode: 401, statusMessage: 'Login gagal. Periksa NIP dan kata sandi Anda.' })
  const employee = await findEmployee(event, parsed.data.nip)
  let email = `${parsed.data.nip}@nip.invalid`
  if (employee?.user_id) {
    const { data, error } = await getEmployeeAdmin(event).auth.admin.getUserById(employee.user_id)
    if (error || !data.user?.email)
      throw createError({ statusCode: 503, statusMessage: 'Akun belum dapat diperiksa.' })
    email = data.user.email
  }
  // Unknown NIPs also pass through Auth's password throttling.
  const { data, error } = await getCatalogClient(event).auth.signInWithPassword({
    email,
    password: parsed.data.password,
  })
  if (error?.status === 429)
    throw createError({
      statusCode: 429,
      statusMessage: 'Terlalu banyak percobaan. Coba lagi nanti.',
    })
  if (error || !data.session || !employee?.user_id || data.user?.id !== employee.user_id)
    throw invalid()
  return { access_token: data.session.access_token, refresh_token: data.session.refresh_token }
})
