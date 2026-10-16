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
