import { loadEnvFile } from 'node:process'
import { mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

// Administrative data mapping only. Never changes Auth identities, passwords or access.
export function planSuperNips(accounts, registry, primaryEditorId) {
  const sorted = [...accounts].sort(
    (a, b) =>
      Number(b.user_id === primaryEditorId) - Number(a.user_id === primaryEditorId) ||
      Number(b.role === 'editor') - Number(a.role === 'editor') ||
      a.created_at.localeCompare(b.created_at) ||
      a.user_id.localeCompare(b.user_id),
  )
  if (!sorted.length || sorted[0].role !== 'editor')
    throw new Error('Akun Editor super tidak ditemukan.')
  const primary = sorted[0]
  const primaryLink = registry.find((row) => row.user_id === primary.user_id)
  const zero = registry.find((row) => row.nip === '000000000')
  if (
    (primaryLink && primaryLink.nip !== '000000000') ||
    (zero && zero.user_id !== primary.user_id)
  )
    throw new Error(
      'NIP 000000000 atau Editor utama sudah memiliki pemetaan berbeda. Tidak ada data diubah.',
    )
  const linked = registry.filter((row) => sorted.some((account) => account.user_id === row.user_id))
  if (linked.some((row) => !/^\d{9}$/.test(row.nip)))
    throw new Error(
      'Akun super sudah memiliki NIP di luar format 9 digit. Periksa pemetaan existing.',
    )
  let next = Math.max(0, ...linked.map((row) => Number(row.nip))) + 1
  const additions = []
  const mappings = sorted.map((account) => {
    const existing = registry.find((row) => row.user_id === account.user_id)
    if (existing) {
      if (existing.role !== account.role)
        throw new Error('Role registry tidak cocok dengan akun super. Tidak ada data diubah.')
      return { ...existing, created: false }
    }
    const nip = account.user_id === primary.user_id ? '000000000' : String(next++).padStart(9, '0')
    if (nip.length !== 9 || registry.some((row) => row.nip === nip))
      throw new Error(
        'Nomor NIP tujuan sudah dipakai atau melebihi 9 digit. Tidak ada data diubah.',
      )
    const row = {
      nip,
      user_id: account.user_id,
      role: account.role,
      // Super access remains in the existing membership; this is just registry metadata.
      education_level: account.role === 'editor' ? 'SD' : null,
    }
    additions.push(row)
    return { ...row, created: true }
  })
  return { additions, mappings }
}

async function main() {
  loadEnvFile('.env')
  const key =
    process.env.NUXT_SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NUXT_PUBLIC_SUPABASE_URL
  if (!key || !url) throw new Error('URL atau key admin Supabase belum tersedia.')
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }),
    },
  })
  const [{ data: accounts, error: accountError }, { data: registry, error: registryError }] =
    await Promise.all([
      client.from('account_memberships').select('user_id,role,created_at').eq('is_super', true),
      client.from('employee_registry').select('nip,user_id,role,education_level'),
    ])
  if (accountError || registryError)
    throw new Error('Tabel akun/NIP belum dapat dibaca. Pastikan migration NIP terpasang.')
  let primaryEditorId
  const configuredEmail = process.env.SUPER_ACCOUNT_EDITOR_EMAIL?.toLowerCase()
  if (configuredEmail) {
    for (const account of accounts.filter((account) => account.role === 'editor')) {
      const { data, error } = await client.auth.admin.getUserById(account.user_id)
      if (error) throw new Error('Identitas akun Editor super belum dapat diperiksa.')
      if (data.user.email?.toLowerCase() === configuredEmail) primaryEditorId = account.user_id
    }
  }
  const plan = planSuperNips(accounts, registry, primaryEditorId)
  const apply = process.argv.includes('--apply')
  if (apply && plan.additions.length) {
    await mkdir('.data', { recursive: true })
    const manifest = `.data/super-nip-conversion-${Date.now()}.json`
    // Record exactly which links were planned, so rollback never targets earlier links.
    await writeFile(
      manifest,
      JSON.stringify({ status: 'prepared', additions: plan.additions }, null, 2) + '\n',
    )
    const { error } = await client.from('employee_registry').insert(plan.additions)
    if (error)
      throw new Error(
        'Pengaitan NIP gagal; satu transaksi insert dibatalkan. Periksa konflik lalu ulangi.',
      )
    await writeFile(
      manifest,
      JSON.stringify({ status: 'applied', additions: plan.additions }, null, 2) + '\n',
    )
  }
  if (apply) {
    const { data, error } = await client
      .from('employee_registry')
      .select('nip,user_id,role')
      .in(
        'user_id',
        accounts.map((account) => account.user_id),
      )
    if (
      error ||
      plan.mappings.some(
        (row) =>
          !data?.some(
            (saved) =>
              saved.nip === row.nip && saved.user_id === row.user_id && saved.role === row.role,
          ),
      )
    )
      throw new Error(
        'Hasil pemetaan belum dapat diverifikasi. Periksa registry sebelum mengulang.',
      )
  }
  for (const row of plan.mappings)
    console.log(`${apply ? 'TERVERIFIKASI' : 'RENCANA'}: ${row.role} super = ${row.nip}`)
  console.log(
    apply
      ? 'Pemetaan siap. Password dan hak akses tetap.'
      : 'Belum ada data diubah. Gunakan --apply untuk menerapkan.',
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    // Never print raw Supabase errors: they can contain identity or request data.
    console.error(error instanceof TypeError ? 'Koneksi Supabase gagal.' : error.message)
    process.exitCode = 1
  })
