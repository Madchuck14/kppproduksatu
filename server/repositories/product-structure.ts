import { serverSupabaseClient } from '#supabase/server'
import type { H3Event } from 'h3'
import { z } from 'zod'
import {
  mapStructureRow,
  structurePath,
  structureRowSchema,
  type StructureInput,
} from '#shared/schemas/product-structure'
import type { EditorDatabase } from '#shared/types/editor-database'
import { getCatalogClient } from '../utils/catalog-client'

const columns = 'id,education_level,parent_id,name,sort_order,product_status,archived'
export function structureError(error: { code?: string; message?: string } | null) {
  if (!error) return
  const messages: Record<string, string> = {
    structure_in_use:
      'Cabang atau turunannya masih dipakai buku, termasuk draf. Pindahkan atau lepas struktur pada buku terkait terlebih dahulu.',
    structure_cycle: 'Induk tersebut membentuk siklus. Pilih cabang lain.',
    structure_parent_invalid: 'Induk harus cabang aktif dalam jenjang yang sama.',
    structure_level_immutable: 'Jenjang cabang tidak dapat diubah.',
    structure_archived: 'Cabang sudah diarsipkan. Muat ulang struktur.',
    structure_missing: 'Cabang aktif tidak ditemukan. Muat ulang struktur.',
    structure_archive_children_first:
      'Arsipkan cabang beserta turunannya melalui aksi Arsipkan cabang.',
    book_structure_invalid: 'Struktur Produk harus aktif dan sesuai jenjang buku.',
  }
  if (error.message && messages[error.message])
    throw createError({
      statusCode: error.message === 'structure_in_use' ? 409 : 400,
      statusMessage: messages[error.message],
    })
  if (error.code === '42501')
    throw createError({
      statusCode: 403,
      statusMessage: 'Hak akses tidak mengizinkan perubahan struktur.',
    })
  if (error.code === '40001' || error.code === '40P01')
    throw createError({
      statusCode: 409,
      statusMessage: 'Struktur sedang diubah editor lain. Muat ulang lalu coba lagi.',
    })
  throw createError({
    statusCode: 503,
    statusMessage:
      'Struktur Produk belum dapat diproses. Periksa migration struktur lalu coba lagi.',
  })
}

export async function listProductStructure(
  event: H3Event,
  level: StructureInput['educationLevel'],
) {
  const source = useRuntimeConfig(event).catalogSource
  if (source === 'demo') return []
  if (source !== 'supabase')
    throw createError({ statusCode: 503, statusMessage: 'Sumber katalog tidak valid' })
  const nodes = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await getCatalogClient(event)
      .from('product_structure_nodes')
      .select(columns)
      .eq('education_level', level)
      .eq('archived', false)
      .order('id')
      .range(offset, offset + 999)
    structureError(error)
    const rows = z.array(structureRowSchema).parse(data ?? [])
    nodes.push(...rows.map(mapStructureRow))
    if (rows.length < 1000) break
  }
  return nodes
}

export async function validateBookStructure(
  event: H3Event,
  id: string | null | undefined,
  level: StructureInput['educationLevel'],
) {
  if (!id) return
  const nodes = await listProductStructure(event, level)
  if (!structurePath(nodes, id).length)
    throw createError({
      statusCode: 400,
      statusMessage: 'Struktur Produk harus aktif dan sesuai jenjang buku.',
    })
}

export async function saveStructureNode(event: H3Event, input: StructureInput, id?: string) {
  const client = await serverSupabaseClient<EditorDatabase>(event)
  if (id) {
    const { data, error } = await client
      .from('product_structure_nodes')
      .select(columns)
      .eq('id', id)
      .maybeSingle()
    structureError(error)
    if (!data || data.archived)
      throw createError({ statusCode: 404, statusMessage: 'Cabang aktif tidak ditemukan.' })
    if (data.education_level !== input.educationLevel)
      throw createError({ statusCode: 400, statusMessage: 'Jenjang cabang tidak dapat diubah.' })
  }
  if (input.parentId) {
    const path = structurePath(
      await listProductStructure(event, input.educationLevel),
      input.parentId,
    )
    if (!path.length)
      throw createError({
        statusCode: 400,
        statusMessage: 'Induk harus cabang aktif dalam jenjang yang sama.',
      })
    if (path.some((node) => node.id === id))
      throw createError({
        statusCode: 400,
        statusMessage: 'Induk tersebut membentuk siklus. Pilih cabang lain.',
      })
  }
  const row = {
    education_level: input.educationLevel,
    parent_id: input.parentId,
    name: input.name,
    sort_order: input.sortOrder,
    product_status: input.productStatus,
  }
  const query = id
    ? client.from('product_structure_nodes').update(row).eq('id', id)
    : client.from('product_structure_nodes').insert(row)
  const { data, error } = await query.select(columns).single()
  structureError(error)
  return mapStructureRow(structureRowSchema.parse(data))
}

export async function archiveStructureNode(event: H3Event, id: string) {
  const client = await serverSupabaseClient<EditorDatabase>(event)
  const { data, error } = await client.rpc('archive_product_structure_node', { target_id: id })
  structureError(error)
  return { archivedCount: z.number().int().positive().parse(data) }
}

export async function deleteStructureNode(event: H3Event, id: string) {
  const client = await serverSupabaseClient<EditorDatabase>(event)
  const { data, error } = await client.rpc('delete_product_structure_node', { target_id: id })
  structureError(error)
  return { deletedCount: z.number().int().positive().parse(data) }
}
