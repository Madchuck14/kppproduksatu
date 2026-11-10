import { createHash } from 'node:crypto'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { loadEnvFile } from 'node:process'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const sourcePath = 'docs/referensicabangproduk/granddesignproduct.txt'
const levels = ['SD', 'SMP', 'SMA', 'SMK']
const canonical = (name) => name.trim().normalize('NFC').toLowerCase()
const keyFor = (level, path) => JSON.stringify([level, ...path.map(canonical)])
function nodeId(key) {
  const bytes = createHash('sha1')
    .update(Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex'))
    .update(`kppproduksatu/product-structure/${key}`)
    .digest()
    .subarray(0, 16)
  bytes[6] = (bytes[6] & 15) | 80
  bytes[8] = (bytes[8] & 63) | 128
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function parseStructureSource(source) {
  const nodes = [],
    deferred = [],
    annotations = [],
    seen = new Set(),
    seenLevels = new Set()
  let level,
    stack = [],
    previousDepth = -1
  for (const [index, raw] of source
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .entries()) {
    if (!raw.trim()) continue
    const header = /^(SD|SMP|SMA|SMK)(?:\s+—\s+.*)?$/.exec(raw.trim())
    if (header) {
      level = header[1]
      if (seenLevels.has(level)) throw new Error(`Jenjang duplikat pada baris ${index + 1}.`)
      seenLevels.add(level)
      stack = []
      previousDepth = -1
      continue
    }
    const match = /^( *)- (.+)$/.exec(raw)
    if (!level || !match || match[1].length % 2)
      throw new Error(`Format struktur tidak valid pada baris ${index + 1}.`)
    const depth = match[1].length / 2
    if (depth > previousDepth + 1)
      throw new Error(`Induk cabang tidak ditemukan pada baris ${index + 1}.`)
    previousDepth = depth
    stack.length = depth
    const text = match[2].trim()
    const [name, ...notes] = text.split(/\s+—\s+/)
    const note = notes.join(' — ')
    if (!name || name.length > 200)
      throw new Error(`Nama cabang tidak valid pada baris ${index + 1}.`)
    const parent = depth ? stack[depth - 1] : null
    if (depth && !parent) throw new Error(`Induk cabang tidak ditemukan pada baris ${index + 1}.`)
    // Only this explicit note confirms the category itself; it has no product children.
    const verifiedCategoryNote = /^label kategori terbaca, daftar produknya belum lengkap\.$/i.test(
      note,
    )
    const inlineUncertainty = /belum terverifikasi|perlu dicocokkan|perlu dicek/i.test(text)
    const deferredReason =
      parent?.deferredReason ||
      (inlineUncertainty ? note || text : note && !verifiedCategoryNote ? note : null)
    const path = [...(parent?.path ?? []), name]
    const entry = { educationLevel: level, name, path, line: index + 1, deferredReason }
    stack.push(entry)
    if (deferredReason) {
      deferred.push({ ...entry, note: note || (inlineUncertainty ? text : null) })
      continue
    }
    const key = keyFor(level, path)
    if (seen.has(key)) throw new Error(`Jalur duplikat pada baris ${index + 1}.`)
    seen.add(key)
    const parentKey = parent ? keyFor(level, parent.path) : null
    const sortOrder =
      nodes.filter((node) => node.educationLevel === level && node.parentKey === parentKey).length *
      10
    nodes.push({ ...entry, key, parentKey, sortOrder })
    if (note) annotations.push({ level, path, note, line: index + 1 })
  }
  if (levels.some((level) => !seenLevels.has(level)))
    throw new Error('Berkas harus memuat SD, SMP, SMA, dan SMK.')
  return { nodes, deferred, annotations }
}

export function planStructureImport(parsed, existing) {
  const additions = [],
    mappings = new Map()
  for (const node of parsed.nodes) {
    const parentId = node.parentKey ? mappings.get(node.parentKey) : null
    if (node.parentKey && !parentId) throw new Error('Urutan sumber bukan induk sebelum anak.')
    const matches = existing.filter(
      (row) =>
        row.education_level === node.educationLevel &&
        row.parent_id === parentId &&
        canonical(row.name) === canonical(node.name),
    )
    if (matches.length > 1 || matches.some((row) => row.archived))
      throw new Error(
        `Jalur existing duplikat/arsip: ${node.educationLevel} / ${node.path.join(' → ')}. Tidak ada data diubah.`,
      )
    const id = matches[0]?.id ?? nodeId(node.key)
    if (!matches.length) {
      if (existing.some((row) => row.id === id))
        throw new Error(
          'ID impor sudah dipakai cabang yang telah dipindahkan/diubah. Periksa manifest sebelum mengulang.',
        )
      additions.push({
        id,
        education_level: node.educationLevel,
        parent_id: parentId,
        name: node.name,
        sort_order: node.sortOrder,
        product_status: null,
        archived: false,
      })
    }
    mappings.set(node.key, id)
  }
  return { additions, reused: parsed.nodes.length - additions.length }
}

async function readNodes(client) {
  const rows = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client
      .from('product_structure_nodes')
      .select('id,education_level,parent_id,name,sort_order,product_status,archived')
      .order('id')
      .range(offset, offset + 999)
    if (error)
      throw new Error(
        `Struktur belum dapat dibaca (kode ${error.code ?? 'unknown'}). Pastikan migration struktur sudah diterapkan.`,
      )
    rows.push(...data)
    if (data.length < 1000) return rows
  }
}
async function main() {
  const { values } = parseArgs({
    options: { apply: { type: 'boolean', default: false } },
    strict: true,
  })
  const source = await readFile(sourcePath, 'utf8')
  const parsed = parseStructureSource(source)
  loadEnvFile('.env')
  const key =
    process.env.NUXT_SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key || !process.env.NUXT_PUBLIC_SUPABASE_URL)
    throw new Error('URL/key admin Supabase belum tersedia.')
  const client = createClient(process.env.NUXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }),
    },
  })
  const existing = await readNodes(client)
  const plan = planStructureImport(parsed, existing)
  console.log(
    JSON.stringify({
      mode: values.apply ? 'apply' : 'preview',
      approved: parsed.nodes.length,
      newNodes: plan.additions.length,
      existingReused: plan.reused,
      deferred: parsed.deferred.length,
      levels: Object.fromEntries(
        levels.map((level) => [
          level,
          parsed.nodes.filter((node) => node.educationLevel === level).length,
        ]),
      ),
    }),
  )
  for (const entry of parsed.deferred.filter((entry) => entry.note))
    console.log(`DITUNDA baris ${entry.line}: ${entry.educationLevel} / ${entry.path.join(' → ')}`)
  if (!values.apply) {
    console.log(
      'Belum ada data diubah. --apply hanya memasukkan cabang jelas, tanpa menimpa cabang existing.',
    )
    return
  }
  if (plan.additions.length) {
    const current = await readNodes(client)
    if (JSON.stringify(current) !== JSON.stringify(existing))
      throw new Error('Struktur berubah sejak pemeriksaan. Ulangi preview sebelum impor.')
    await mkdir('.data/product-structure-import', { recursive: true })
    const manifest = `.data/product-structure-import/${Date.now()}.json`
    const record = {
      status: 'prepared',
      source: sourcePath,
      sourceHash: createHash('sha256').update(source).digest('hex'),
      additions: plan.additions,
      deferred: parsed.deferred,
      annotations: parsed.annotations,
    }
    await writeFile(manifest, JSON.stringify(record, null, 2) + '\n')
    // One INSERT, parents first: failure rolls back all new rows, including guard writes.
    const { data, error } = await client
      .from('product_structure_nodes')
      .insert(plan.additions)
      .select('id')
    if (error)
      throw new Error(
        `Impor dibatalkan dalam satu transaksi (kode ${error.code ?? 'unknown'}). Periksa struktur dan manifest sebelum mengulang.`,
      )
    if (data.length !== plan.additions.length)
      throw new Error('Jumlah hasil impor tidak sesuai; periksa manifest dan database.')
    record.status = 'applied'
    await writeFile(manifest, JSON.stringify(record, null, 2) + '\n')
  }
  const final = await readNodes(client)
  if (planStructureImport(parsed, final).additions.length)
    throw new Error('Verifikasi jalur belum lengkap; periksa hasil impor.')
  console.log(
    'TERVERIFIKASI: seluruh cabang yang disetujui tersedia. Cabang existing, buku, dan status produk tidak ditimpa.',
  )
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error instanceof TypeError ? 'Koneksi Supabase gagal.' : error.message)
    process.exitCode = 1
  })
