import type { z } from 'zod'
import type { educationLevelSchema } from '../schemas/auth'

// Canonical subject names from daftarmapel.md. SMK has no supplied list yet.
export const subjectsByLevel = {
  SD: [
    'Pendidikan Agama dan Budi Pekerti',
    'Pendidikan Pancasila',
    'Bahasa Indonesia',
    'Matematika',
    'Ilmu Pengetahuan Alam dan Sosial (IPAS)',
    'Seni dan Budaya',
    'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)',
    'Bahasa Inggris',
    'Muatan Lokal (Bahasa Daerah)',
  ],
  SMP: [
    'Pendidikan Agama dan Budi Pekerti',
    'Pendidikan Pancasila',
    'Bahasa Indonesia',
    'Matematika',
    'Ilmu Pengetahuan Alam (IPA)',
    'Ilmu Pengetahuan Sosial (IPS)',
    'Bahasa Inggris',
    'Informatika',
    'Seni dan Prakarya',
    'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)',
    'Muatan Lokal (Bahasa Daerah)',
  ],
  SMA: [
    'Pendidikan Agama dan Budi Pekerti',
    'Pendidikan Pancasila',
    'Bahasa Indonesia',
    'Matematika',
    'Bahasa Inggris',
    'Sejarah',
    'Seni dan Budaya',
    'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)',
    'Informatika',
    'Biologi',
    'Fisika',
    'Kimia',
    'Matematika Lanjutan',
    'Ekonomi',
    'Sosiologi',
    'Geografi',
    'Antropologi',
    'Bahasa dan Sastra Indonesia',
    'Bahasa dan Sastra Inggris',
  ],
  SMK: [],
} as const

export type EducationLevel = z.infer<typeof educationLevelSchema>
export type BookSubject = (typeof subjectsByLevel)[EducationLevel][number]

export function getSubjectsForLevel(level: string | null | undefined): readonly BookSubject[] {
  if (!level || !Object.hasOwn(subjectsByLevel, level)) return []
  return subjectsByLevel[level as EducationLevel]
}

export function isSubjectForLevel(level: string | null | undefined, subject: string): boolean {
  return getSubjectsForLevel(level).some((item) => item === subject)
}
