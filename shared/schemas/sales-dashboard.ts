import { z } from 'zod'
import { nipSchema } from './auth'

export const salesDashboardQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
})

const loginPeriodSchema = z.object({
  loginEvents: z.number().int().nonnegative(),
  topAreas: z.array(z.object({ area: z.string(), loginEvents: z.number().int().positive() })),
})

export const salesDashboardSchema = z.object({
  sales: z.array(
    z.object({
      id: z.string().uuid(),
      nip: nipSchema.nullable(),
      name: z.string().nullable(),
      placement: z.string().nullable(),
      lastLoginAt: z.string().datetime({ offset: true }).nullable(),
      loginCount: z.number().int().nonnegative(),
    }),
  ),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  employeeDirectoryConnected: z.boolean(),
  periods: z.object({
    asOf: z.string().datetime({ offset: true }),
    todayStart: z.string().datetime({ offset: true }),
    weekStart: z.string().datetime({ offset: true }),
    today: loginPeriodSchema,
    week: loginPeriodSchema,
  }),
  usage: z.object({
    uniqueSales: z.number().int().nonnegative(),
    loginEvents: z.number().int().nonnegative(),
    areas: z.array(
      z.object({
        area: z.string().nullable(),
        registered: z.number().int().nonnegative(),
        users: z.number().int().nonnegative(),
      }),
    ),
  }),
})

export type SalesDashboard = z.infer<typeof salesDashboardSchema>
