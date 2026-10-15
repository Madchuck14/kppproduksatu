import { z } from 'zod'
import { educationLevelSchema } from './auth'
import { bookDivisions } from '../utils/book-divisions'
import { subjectsByLevel } from '../utils/book-subjects'

export const classificationInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('curriculum'), name: z.string().trim().min(1).max(200) }).strict(),
  z.object({ kind: z.literal('division'), name: z.string().trim().min(1).max(100) }).strict(),
  z
    .object({
      kind: z.literal('subject'),
      name: z.string().trim().min(1).max(200),
      educationLevel: educationLevelSchema,
    })
    .strict(),
])
export type ClassificationInput = z.infer<typeof classificationInputSchema>
export const classificationSchema = z.object({
  kind: z.enum(['curriculum', 'division', 'subject']),
  code: z.string(),
  name: z.string(),
  education_level: z.union([educationLevelSchema, z.literal('')]),
})
export type Classification = z.infer<typeof classificationSchema>
export const classificationDeleteSchema = z
  .object({
    kind: z.enum(['curriculum', 'division', 'subject']),
    code: z.string().min(1).max(200),
    educationLevel: z.union([educationLevelSchema, z.literal('')]),
  })
  .strict()
  .refine(
    (value) =>
      value.kind === 'subject' ? value.educationLevel !== '' : value.educationLevel === '',
    'Jenjang klasifikasi tidak valid.',
  )
export type ClassificationDelete = z.infer<typeof classificationDeleteSchema>
export const defaultClassifications: Classification[] = [
  ...bookDivisions.map(({ code, name }) => ({
    kind: 'division' as const,
    code,
    name,
    education_level: '' as const,
  })),
  ...Object.entries(subjectsByLevel).flatMap(([level, subjects]) =>
    subjects.map((name) => ({
      kind: 'subject' as const,
      code: name,
      name,
      education_level: educationLevelSchema.parse(level),
    })),
  ),
]
