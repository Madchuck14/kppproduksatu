import { z } from 'zod'

const text = (max: number) =>
  z.string().trim().min(1, 'Kolom wajib diisi.').max(max, `Maksimal ${max} karakter.`)
const phone = text(40)
  .regex(/^[+\d().\s-]+$/, 'Nomor kontak tidak valid.')
  .refine((value) => /\d/.test(value), 'Nomor kontak wajib berisi angka.')

export const maxContactPhones = 10
export const contactPhonesSchema = z
  .array(z.object({ label: text(60), number: phone }).strict())
  .min(1, 'Isi minimal satu nomor telepon.')
  .max(maxContactPhones, `Maksimal ${maxContactPhones} nomor telepon.`)

export const contactPageSchema = z
  .object({
    heading: text(120),
    headingHighlight: text(120),
    description: text(600),
    officeName: text(120),
    address: text(400),
    email: text(254).pipe(z.email('Alamat email tidak valid.')),
    phone,
    phones: contactPhonesSchema.optional(),
    fax: phone,
    hotline: phone,
    whatsapp: phone.refine(
      (value) => /^\d{8,16}$/.test(value.replace(/\D/g, '')),
      'Nomor WhatsApp harus berisi 8–16 digit.',
    ),
    mapEmbedUrl: text(3000).refine((value) => {
      try {
        const url = new URL(value)
        return (
          value.startsWith('https://www.google.com/maps/embed') &&
          !/\s/.test(value) &&
          url.protocol === 'https:' &&
          url.hostname === 'www.google.com' &&
          !url.port &&
          !url.username &&
          !url.password &&
          url.pathname === '/maps/embed'
        )
      } catch {
        return false
      }
    }, 'Gunakan URL sematan https://www.google.com/maps/embed, bukan kode iframe.'),
    hoursHeading: text(120),
    hoursHighlight: text(120),
    hoursDescription: text(600),
    hours: z
      .array(z.object({ day: text(60), time: text(100), note: text(100) }).strict())
      .length(2, 'Isi dua kelompok jam operasional.'),
  })
  .strict()
  .transform((content) => {
    const phones = content.phones ?? [{ label: 'Telepon', number: content.phone }]
    return { ...content, phone: phones[0]!.number, phones }
  })

export type ContactPage = z.infer<typeof contactPageSchema>

export function contactPhoneHref(value: string) {
  return `tel:${value.replace(/[^+\d]/g, '')}`
}

export function contactWhatsappHref(value: string) {
  const digits = value.replace(/\D/g, '')
  return `https://wa.me/${digits.startsWith('0') ? `62${digits.slice(1)}` : digits}`
}

export const defaultContactPage: ContactPage = {
  heading: 'Berbagai cara untuk',
  headingHighlight: 'terhubung dengan kami',
  description:
    'Pilih saluran komunikasi yang paling nyaman untuk Anda. Tim kami siap membantu pertanyaan seputar buku dan pemesanan.',
  officeName: 'Kantor Pusat Erlangga',
  address: 'Jl. H. Baping Raya No. 100, Ciracas, Jakarta Timur 13740',
  email: 'info@erlangga.co.id',
  phone: '(021) 871 7006',
  phones: [{ label: 'Telepon', number: '(021) 871 7006' }],
  fax: '(021) 877 946 09',
  hotline: '1500-885',
  whatsapp: '08191-1500-885',
  mapEmbedUrl:
    'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3965.564382405313!2d106.86915197481105!3d-6.3208058618512855!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x2e69ed0c8e2945cf%3A0x532ab84fc45f49c6!2sPenerbit%20Erlangga!5e0!3m2!1sen!2sid!4v1791865021196!5m2!1sen!2sid',
  hoursHeading: 'Kami siap melayani',
  hoursHighlight: 'setiap hari kerja',
  hoursDescription:
    'Tim dukungan kami aktif menerima pertanyaan dan keluhan melalui berbagai saluran komunikasi yang tersedia.',
  hours: [
    { day: 'Senin – Jumat', time: '08.00 – 17.00 WIB', note: 'Siap melayani Anda' },
    { day: 'Sabtu', time: '08.00 – 13.00 WIB', note: 'Siap melayani Anda' },
  ],
}
