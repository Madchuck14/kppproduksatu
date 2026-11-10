import { loadEnvFile } from 'node:process'
import { mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

export const editorNips = Object.freeze({
  SD: '000000002',
  SMP: '000000003',
  SMA: '000000004',
  SMK: '000000005',
})

// Shared with provisioning. Planning never changes Auth identities or permissions.
export function planEditorNips(accounts, registry) {
  const additions = []
  const mappings = []
  const seenLevels = new Set()
  const seenUsers = new Set()
  for (const account of accounts) {
    if (!editorNips[account.level] || seenLevels.has(account.level))
      throw new Error('Jenjang Editor tidak valid atau duplikat. Tidak ada data diubah.')
    seenLevels.add(account.level)
    if (account.user_id && seenUsers.has(account.user_id))
      throw new Error('Satu akun tidak boleh dipakai dua Editor jenjang. Tidak ada data diubah.')
    if (account.user_id) seenUsers.add(account.user_id)
    const linked = account.user_id
      ? registry.find((row) => row.user_id === account.user_id)
      : undefined
    if (
      linked &&
      (!/^\d{9}$/.test(linked.nip) ||
        linked.role !== 'editor' ||
        linked.education_level !== account.level)
    )
      throw new Error(
        `Pemetaan Editor ${account.level} existing tidak sesuai. Tidak ada data diubah.`,
      )
    const nip = linked?.nip ?? editorNips[account.level]
    const occupied = registry.find((row) => row.nip === nip)
    if (occupied && (!account.user_id || occupied.user_id !== account.user_id))
      throw new Error(
        `NIP Editor ${account.level} sudah dipakai/disiapkan untuk pegawai lain. Tidak ada data diubah.`,
      )
    if (mappings.some((row) => row.nip === nip))
      throw new Error('NIP antarjenjang bertabrakan. Tidak ada data diubah.')
    const row = {
      nip,
      user_id: account.user_id ?? null,
      role: 'editor',
      education_level: account.level,
    }
    if (account.user_id && !linked) additions.push(row)
    mappings.push({ ...row, created: !linked })
  }
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
  const accounts = []
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw new Error('Akun Auth belum dapat dibaca.')
    for (const user of data.users) {
      const level = Object.keys(editorNips).find(
        (level) => user.email?.toLowerCase() === `editor${level.toLowerCase()}@erlangga.com`,
      )
      if (level) accounts.push({ level, user_id: user.id })
    }
    if (data.users.length < 100) break
  }
  if (accounts.length !== 4)
    throw new Error(
      'Empat akun Editor per jenjang belum lengkap. Jalankan provisioning Editor terlebih dahulu.',
    )
  const { data: registry, error } = await client
    .from('employee_registry')
    .select('nip,user_id,role,education_level')
  if (error) throw new Error('Registry NIP belum dapat dibaca. Pastikan migration NIP terpasang.')
  for (const account of accounts) {
    const { data: membership, error: membershipError } = await client
      .from('account_memberships')
      .select('role,is_super')
      .eq('user_id', account.user_id)
      .maybeSingle()
    const { data: scopes, error: scopeError } = await client
      .from('editor_scopes')
      .select('education_level')
      .eq('user_id', account.user_id)
    if (membershipError || scopeError) throw new Error('Izin Editor belum dapat diperiksa.')
    if (
      membership?.role !== 'editor' ||
      membership.is_super ||
      scopes.length !== 1 ||
      scopes[0].education_level !== account.level
    )
      throw new Error(`Role/scope Editor ${account.level} tidak sesuai. Tidak ada data diubah.`)
  }
  accounts.sort(
    (a, b) => Object.keys(editorNips).indexOf(a.level) - Object.keys(editorNips).indexOf(b.level),
  )
  const plan = planEditorNips(accounts, registry)
  const apply = process.argv.includes('--apply')
  if (apply && plan.additions.length) {
    await mkdir('.data', { recursive: true })
    const manifest = `.data/editor-nip-conversion-${Date.now()}.json`
    await writeFile(
      manifest,
      JSON.stringify({ status: 'prepared', additions: plan.additions }, null, 2) + '\n',
    )
    const { error } = await client.from('employee_registry').insert(plan.additions)
    if (error)
      throw new Error(
        'Pengaitan Editor gagal; seluruh insert dibatalkan. Periksa konflik sebelum mengulang.',
      )
    await writeFile(
      manifest,
      JSON.stringify({ status: 'applied', additions: plan.additions }, null, 2) + '\n',
    )
  }
  if (apply) {
    const { data, error } = await client
      .from('employee_registry')
      .select('nip,user_id,role,education_level')
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
              saved.nip === row.nip &&
              saved.user_id === row.user_id &&
              saved.role === row.role &&
              saved.education_level === row.education_level,
          ),
      )
    )
      throw new Error(
        'Hasil pemetaan belum dapat diverifikasi. Periksa registry sebelum mengulang.',
      )
  }
  for (const row of plan.mappings)
    console.log(
      `${apply ? 'TERVERIFIKASI' : 'RENCANA'}: Editor ${row.education_level} = ${row.nip}`,
    )
  console.log(
    apply
      ? 'Pemetaan siap. Email, password, izin, dan Favorit tetap.'
      : 'Belum ada data diubah. Gunakan --apply untuk menerapkan.',
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error instanceof TypeError ? 'Koneksi Supabase gagal.' : error.message)
    process.exitCode = 1
  })
