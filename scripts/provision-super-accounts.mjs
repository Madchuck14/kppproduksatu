import { loadEnvFile } from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

// Administrative setup only. This file is never imported by the Nuxt application.
const levels = ['SD', 'SMP', 'SMA', 'SMK']
class ProvisioningError extends Error {}
const accountSchema = z.object({
  nip: z
    .string()
    .trim()
    .regex(/^\d{1,32}$/),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  role: z.literal('editor'),
})

function fail(stage, error) {
  // Supabase messages may contain account data; only emit this controlled diagnostic.
  throw new ProvisioningError(`${stage} gagal${error?.status ? ` (status ${error.status})` : ''}.`)
}

async function main() {
  loadEnvFile('.env')
  const url = process.env.NUXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key || !process.env.NUXT_PUBLIC_SUPABASE_KEY)
    throw new ProvisioningError('URL, public key, atau key admin Supabase belum diisi di .env.')
  const accounts = [
    {
      role: 'editor',
      nip: process.env.SUPER_ACCOUNT_EDITOR_NIP || '000000000',
      email: process.env.SUPER_ACCOUNT_EDITOR_EMAIL,
      password: process.env.SUPER_ACCOUNT_EDITOR_PASSWORD,
    },
  ].map((value) => {
    const parsed = accountSchema.safeParse(value)
    if (!parsed.success) throw new ProvisioningError(`Kredensial akun ${value.role} tidak valid.`)
    return parsed.data
  })
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }),
    },
  })
  for (const table of ['account_memberships', 'editor_scopes', 'employee_registry']) {
    const { error } = await client.from(table).select('user_id').limit(0)
    if (error)
      throw new ProvisioningError(
        'Tabel akses belum siap. Jalankan migration sampai 202611060001_employee_nip_auth.sql.',
      )
  }
  const existingUsers = []
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 })
    if (error) fail('Pemeriksaan akses admin Auth', error)
    existingUsers.push(
      ...data.users.filter((user) =>
        accounts.some((account) => account.email.toLowerCase() === user.email?.toLowerCase()),
      ),
    )
    if (data.users.length < 100 || existingUsers.length === accounts.length) break
  }
  for (const account of accounts) {
    const existing = existingUsers.find(
      (user) => user.email?.toLowerCase() === account.email.toLowerCase(),
    )
    const { data: registry, error } = await client
      .from('employee_registry')
      .select('user_id')
      .eq('nip', account.nip)
      .maybeSingle()
    if (error) fail('Pemeriksaan NIP', error)
    if (registry?.user_id && registry.user_id !== existing?.id)
      throw new ProvisioningError('NIP sudah terhubung dengan akun lain. Tidak ada akun diubah.')
    if (existing) {
      const { data: linked, error: linkedError } = await client
        .from('employee_registry')
        .select('nip')
        .eq('user_id', existing.id)
        .maybeSingle()
      if (linkedError) fail('Pemeriksaan hubungan NIP', linkedError)
      if (linked && linked.nip !== account.nip)
        throw new ProvisioningError('Akun sudah terhubung dengan NIP lain. Tidak ada akun diubah.')
    }
  }
  if (process.argv.includes('--check')) {
    console.log('Konfigurasi, akses admin, kredensial, dan tabel siap. Belum ada akun diubah.')
    return
  }
  for (const account of accounts) {
    const existing = existingUsers.find(
      (user) => user.email?.toLowerCase() === account.email.toLowerCase(),
    )
    const attributes = {
      email: account.email,
      password: account.password,
      email_confirm: true,
      app_metadata: { employee_provisioning: true },
    }
    const result = existing
      ? await client.auth.admin.updateUserById(existing.id, attributes)
      : await client.auth.admin.createUser(attributes)
    if (result.error || !result.data.user) fail(`Pembuatan akun ${account.role}`, result.error)
    const userId = result.data.user.id
    // Ignore duplicate NIP rows rather than overwriting a concurrent operator's link.
    const { error: registryError } = await client
      .from('employee_registry')
      .upsert(
        { nip: account.nip, user_id: userId, role: 'editor', education_level: 'SD' },
        { onConflict: 'nip', ignoreDuplicates: true },
      )
    if (registryError) fail('Pengaitan NIP', registryError)
    const { error: linkError } = await client
      .from('employee_registry')
      .update({ user_id: userId })
      .eq('nip', account.nip)
      .is('user_id', null)
    if (linkError) fail('Pengaitan NIP kosong', linkError)
    const { data: registry, error: registryReadError } = await client
      .from('employee_registry')
      .select('user_id')
      .eq('nip', account.nip)
      .single()
    if (registryReadError || registry?.user_id !== userId)
      fail('Pengaitan NIP (data berubah; periksa hubungan akun lalu ulangi)', registryReadError)
    const { error: membershipError } = await client
      .from('account_memberships')
      .upsert({ user_id: userId, role: account.role, is_super: true }, { onConflict: 'user_id' })
    if (membershipError) fail(`Penetapan role ${account.role}`, membershipError)
    if (account.role === 'editor') {
      const { error: scopeError } = await client.from('editor_scopes').upsert(
        levels.map((level) => ({ user_id: userId, education_level: level })),
        { onConflict: 'user_id,education_level' },
      )
      if (scopeError) fail('Penetapan empat jenjang Editor', scopeError)
    }
    const verification = createClient(url, process.env.NUXT_PUBLIC_SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    const { error: loginError } = await verification.auth.signInWithPassword({
      email: account.email,
      password: account.password,
    })
    if (loginError) fail(`Verifikasi login ${account.role}`, loginError)
    const { data: membership, error: readError } = await verification
      .from('account_memberships')
      .select('role,is_super')
      .eq('user_id', userId)
      .single()
    if (readError || membership.role !== account.role || !membership.is_super)
      fail(`Verifikasi role ${account.role}`, readError)
    const { data: scopes, error: scopesError } = await verification
      .from('editor_scopes')
      .select('education_level')
      .eq('user_id', userId)
    if (
      scopesError ||
      (account.role === 'editor' &&
        levels.some((level) => !scopes.some((scope) => scope.education_level === level)))
    )
      fail(`Verifikasi scope ${account.role}`, scopesError)
    const { data: employee, error: employeeError } = await verification
      .from('employee_registry')
      .select('nip')
      .eq('user_id', userId)
      .single()
    if (employeeError || employee?.nip !== account.nip) fail('Verifikasi NIP', employeeError)
    console.log(`Akun super ${account.role} siap; login, role super, scope, dan NIP terverifikasi.`)
  }
}

main().catch((error) => {
  console.error(
    error instanceof ProvisioningError
      ? error.message
      : 'Provisioning gagal. Periksa koneksi dan konfigurasi Supabase.',
  )
  process.exitCode = 1
})
