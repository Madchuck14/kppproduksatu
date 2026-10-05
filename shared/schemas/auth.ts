import { z } from 'zod'

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .max(254, 'Email terlalu panjang.')
    .email('Masukkan alamat email yang valid.'),
  password: z.string().min(1, 'Masukkan kata sandi Anda.'),
})

export const educationLevelSchema = z.enum(['SD', 'SMP', 'SMA', 'SMK'], {
  error: 'Pilih jenjang pendidikan yang valid.',
})

const registrationFieldsSchema = loginSchema
  .extend({
    password: z
      .string()
      .min(8, 'Kata sandi minimal 8 karakter.')
      .max(128, 'Kata sandi maksimal 128 karakter.'),
    role: z.enum(['sales', 'editor'], { error: 'Pilih jenis akun Sales atau Editor.' }),
    educationLevel: educationLevelSchema.optional(),
  })
  .strict()

function validateEnrollment(
  value: { role: 'sales' | 'editor'; educationLevel?: z.infer<typeof educationLevelSchema> },
  context: z.RefinementCtx,
) {
  if (value.role === 'editor' && !value.educationLevel) {
    context.addIssue({
      code: 'custom',
      message: 'Pilih jenjang pendidikan untuk Editor.',
      path: ['educationLevel'],
    })
  }
  if (value.role === 'sales' && value.educationLevel !== undefined) {
    context.addIssue({
      code: 'custom',
      message: 'Jenjang pendidikan hanya untuk pendaftaran Editor.',
      path: ['educationLevel'],
    })
  }
}

export const registrationCredentialsSchema =
  registrationFieldsSchema.superRefine(validateEnrollment)

export const registrationSchema = registrationFieldsSchema
  .extend({ confirmPassword: z.string() })
  .superRefine(validateEnrollment)
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Konfirmasi kata sandi tidak cocok.',
    path: ['confirmPassword'],
  })
