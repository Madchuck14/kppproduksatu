import { z } from 'zod'

// Restrict login destinations to book pages and their known content sections.
export const bookReturnToSchema = z
  .string()
  .max(200)
  .regex(/^\/products\/[a-z0-9]+(?:-[a-z0-9]+)*(?:#(?:product-knowledge|flyer|dummy))?$/)

export const loginReturnToSchema = z.union([
  bookReturnToSchema,
  z.literal('/products'),
  z.literal('/favorites'),
])
