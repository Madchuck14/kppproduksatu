import { z } from 'zod'

export const bookResourceKindSchema = z.enum(['flyer', 'dummy', 'product-knowledge'])
export type BookResourceKind = z.infer<typeof bookResourceKindSchema>

export const bookResourceColumns = {
  flyer: 'flyer_path',
  dummy: 'dummy_book_path',
  'product-knowledge': 'product_knowledge_path',
} as const
