import { z } from 'zod'
import { educationLevelSchema } from './auth'

export const structureInputSchema = z
  .object({
    educationLevel: educationLevelSchema,
    parentId: z.string().uuid().nullable().default(null),
    name: z
      .string()
      .trim()
      .min(1, 'Nama cabang wajib diisi.')
      .max(200, 'Nama maksimal 200 karakter.'),
    sortOrder: z
      .number({ error: 'Urutan harus berupa angka.' })
      .int('Urutan harus bilangan bulat.')
      .min(0, 'Urutan tidak boleh negatif.')
      .max(2147483647, 'Urutan terlalu besar.')
      .default(0),
    productStatus: z
      .string()
      .trim()
      .min(1, 'Isi status produk atau kosongkan menjadi null.')
      .max(80, 'Status produk maksimal 80 karakter.')
      .nullable()
      .default(null),
  })
  .strict()
export const structureQuerySchema = z.object({ level: educationLevelSchema })
export const structureRowSchema = z.object({
  id: z.string().uuid(),
  education_level: educationLevelSchema,
  parent_id: z.string().uuid().nullable(),
  name: z.string(),
  sort_order: z.number().int(),
  product_status: z.string().nullable(),
  archived: z.boolean(),
})
export type StructureInput = z.infer<typeof structureInputSchema>
export type StructureRow = z.infer<typeof structureRowSchema>
export interface StructureNode {
  id: string
  educationLevel: StructureInput['educationLevel']
  parentId: string | null
  name: string
  sortOrder: number
  productStatus: string | null
  archived: boolean
}

export function mapStructureRow(row: StructureRow): StructureNode {
  return {
    id: row.id,
    educationLevel: row.education_level,
    parentId: row.parent_id,
    name: row.name,
    sortOrder: row.sort_order,
    productStatus: row.product_status,
    archived: row.archived,
  }
}

export function structurePath(nodes: StructureNode[], id: string): StructureNode[] {
  const index = new Map(nodes.map((node) => [node.id, node]))
  const path: StructureNode[] = []
  const seen = new Set<string>()
  let current: string | null = id
  while (current) {
    const node = index.get(current)
    if (!node || node.archived || seen.has(current)) return []
    if (path.length && node.educationLevel !== path[0]!.educationLevel) return []
    seen.add(current)
    path.unshift(node)
    current = node.parentId
  }
  return path
}

export function structureOptions(nodes: StructureNode[]) {
  return nodes
    .filter((node) => !node.archived)
    .map((node) => ({
      id: node.id,
      label: structurePath(nodes, node.id)
        .map((item) => item.name)
        .join(' → '),
    }))
    .filter((option) => option.label)
    .sort((a, b) => a.label.localeCompare(b.label, 'id'))
}
