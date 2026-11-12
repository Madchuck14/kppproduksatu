import { z } from 'zod'

export const nipSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{1,32}$/, 'NIK harus berisi 1–32 karakter huruf atau angka.')
  .toUpperCase()

export const loginSchema = z.object({
  nip: nipSchema,
  password: z.string().min(1, 'Masukkan kata sandi Anda.'),
})

export const educationLevelSchema = z.enum(['SD', 'SMP', 'SMA', 'SMK'], {
  error: 'Pilih jenjang pendidikan yang valid.',
})

export const registrationCredentialsSchema = loginSchema
  .extend({
    password: z
      .string()
      .min(8, 'Kata sandi minimal 8 karakter.')
      .max(128, 'Kata sandi maksimal 128 karakter.'),
    role: z.enum(['sales', 'editor']).default('sales'),
    educationLevel: educationLevelSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.role === 'editor' && !value.educationLevel)
      context.addIssue({
        code: 'custom',
        path: ['educationLevel'],
        message: 'Pilih jenjang pendidikan untuk Editor.',
      })
    if (value.role === 'sales' && value.educationLevel !== undefined)
      context.addIssue({
        code: 'custom',
        path: ['educationLevel'],
        message: 'Jenjang pendidikan hanya untuk pendaftaran Editor.',
      })
  })

export const registrationSchema = registrationCredentialsSchema
  .safeExtend({ confirmPassword: z.string() })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Konfirmasi kata sandi tidak cocok.',
    path: ['confirmPassword'],
  })
