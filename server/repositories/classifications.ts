import { serverSupabaseClient } from '#supabase/server'
import type { H3Event } from 'h3'
import { z } from 'zod'
import {
  classificationSchema,
  defaultClassifications,
  type ClassificationInput,
  type ClassificationDelete,
} from '#shared/schemas/classifications'
import type { AccountSession } from '#shared/types/account'
import type { BookInput } from '#shared/schemas/editor'
import type { EditorDatabase } from '#shared/types/editor-database'
import { getCatalogClient } from '../utils/catalog-client'
import { assertBookScope } from '../utils/require-editor'

export async function listClassifications(event: H3Event) {
  const source = useRuntimeConfig(event).catalogSource
  if (source === 'demo') return defaultClassifications
  if (source !== 'supabase')
    throw createError({ statusCode: 503, statusMessage: 'Sumber katalog tidak valid' })
  const client = getCatalogClient(event)
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client
      .from('book_classifications')
      .select('kind,code,name,education_level')
      .order('position')
      .order('kind')
      .order('code')
      .order('education_level')
      .range(from, from + 999)
    if (error)
      throw createError({
        statusCode: 503,
        statusMessage:
          'Klasifikasi belum dapat dimuat. Pastikan migration klasifikasi buku sudah diterapkan.',
      })
    rows.push(...z.array(classificationSchema).parse(data))
    if (data.length < 1000) break
  }
  return rows
}

export async function addClassification(
  event: H3Event,
  account: AccountSession,
  input: ClassificationInput,
) {
  if (input.kind === 'subject') assertBookScope(account, input.educationLevel)
  if (!account.isSuper && !account.educationLevels.length)
    throw createError({ statusCode: 403, statusMessage: 'Anda belum memiliki jenjang akses.' })
  const code =
    input.kind === 'division'
      ? input.name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
      : input.name
  if (!code)
    throw createError({
      statusCode: 400,
      statusMessage: 'Nama divisi harus mengandung huruf atau angka.',
    })
  const client = await serverSupabaseClient<EditorDatabase>(event)
  const { error } = await client.from('book_classifications').insert({
    kind: input.kind,
    code,
    name: input.name,
    education_level: input.kind === 'subject' ? input.educationLevel : '',
  })
  if (error)
    throw createError({
      statusCode: error.code === '23505' ? 409 : error.code === '42501' ? 403 : 503,
      statusMessage:
        error.code === '23505'
          ? 'Klasifikasi sudah tersedia.'
          : 'Klasifikasi gagal ditambahkan. Periksa akses dan migration database.',
    })
  return { saved: true }
}

export async function validateBookClassifications(event: H3Event, book: BookInput) {
  const options = await listClassifications(event)
  if (
    book.divisionCode &&
    !options.some((item) => item.kind === 'division' && item.code === book.divisionCode)
  )
    throw createError({ statusCode: 400, statusMessage: 'Divisi belum terdaftar.' })
  if (
    book.subject &&
    !options.some(
      (item) =>
        item.kind === 'subject' &&
        item.name === book.subject &&
        item.education_level === book.educationLevel,
    )
  )
    throw createError({
      statusCode: 400,
      statusMessage: 'Mata pelajaran tidak sesuai dengan jenjang pendidikan.',
    })
}

export async function deleteClassification(
  event: H3Event,
  account: AccountSession,
  input: ClassificationDelete,
) {
  if (input.kind === 'subject') assertBookScope(account, input.educationLevel)
  if (!account.isSuper && !account.educationLevels.length)
    throw createError({ statusCode: 403, statusMessage: 'Anda belum memiliki jenjang akses.' })
  const client = await serverSupabaseClient<EditorDatabase>(event)
  const { data, error } = await client.rpc('delete_book_classification', {
    option_kind: input.kind,
    option_code: input.code,
    option_level: input.educationLevel,
  })
  if (error) {
    if (error.message === 'classification_in_use')
      throw createError({
        statusCode: 409,
        statusMessage:
          'Klasifikasi masih dipakai buku. Ubah klasifikasi pada buku tersebut terlebih dahulu.',
      })
    throw createError({
      statusCode: error.code === '42501' ? 403 : 503,
      statusMessage:
        'Klasifikasi gagal dihapus. Periksa akses dan migration penghapusan klasifikasi.',
    })
  }
  if (!data)
    throw createError({
      statusCode: 404,
      statusMessage: 'Klasifikasi sudah dihapus atau tidak ditemukan.',
    })
  return { deleted: true }
}
