import { registrationCredentialsSchema } from '#shared/schemas/auth'
import { findEmployee, getEmployeeAdmin } from '../../utils/employee-registry'

export default defineEventHandler(async (event) => {
  const parsed = registrationCredentialsSchema.safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({ statusCode: 400, statusMessage: 'Periksa NIK dan data pendaftaran Anda.' })
  const { nip, password, role, educationLevel } = parsed.data
  const unavailable = () =>
    createError({
      statusCode: 400,
      statusMessage:
        'Pendaftaran tidak tersedia. Periksa NIK dan jenis akun, atau hubungi pengelola.',
    })
  const employee = await findEmployee(event, nip)
  if (!employee)
    throw createError({
      statusCode: 400,
      statusMessage: 'NIK tidak cocok dengan data karyawan perusahaan.',
      data: { code: 'NIP_NOT_FOUND' },
    })
  if (
    employee.user_id ||
    employee.role !== role ||
    employee.education_level !== (educationLevel ?? null)
  )
    throw unavailable()
  // Internal non-deliverable identity for Supabase password authentication.
  // The trigger claims the registry row atomically; no session or email is issued.
  const { error } = await getEmployeeAdmin(event).auth.admin.createUser({
    email: `${nip.toLowerCase()}@nip.invalid`,
    password,
    email_confirm: true,
    app_metadata: { employee_registration: true },
    user_metadata: {
      nip,
      registration_role: employee.role,
      ...(employee.education_level ? { requested_education_level: employee.education_level } : {}),
    },
  })
  if (error) {
    if (error.status === 429)
      throw createError({
        statusCode: 429,
        statusMessage: 'Terlalu banyak percobaan. Coba lagi nanti.',
      })
    if (error.status && error.status >= 500)
      throw createError({
        statusCode: 503,
        statusMessage: 'Pendaftaran belum dapat diproses. Coba lagi nanti.',
      })
    throw unavailable()
  }
  return { message: 'Pendaftaran berhasil. Silakan masuk dengan NIK dan kata sandi Anda.' }
})
