import { loadEnvFile } from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

// Administrative setup only. This file is never imported by the Nuxt application.
const levels = ['SD', 'SMP', 'SMA', 'SMK']
class ProvisioningError extends Error {}
const accountSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  role: z.enum(['sales', 'editor']),
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
      email: process.env.SUPER_ACCOUNT_EDITOR_EMAIL,
      password: process.env.SUPER_ACCOUNT_EDITOR_PASSWORD,
    },
    {
      role: 'sales',
      email: process.env.SUPER_ACCOUNT_SALES_EMAIL,
      password: process.env.SUPER_ACCOUNT_SALES_PASSWORD,
    },
  ].map((value) => {
    const parsed = accountSchema.safeParse(value)
    if (!parsed.success) throw new ProvisioningError(`Kredensial akun ${value.role} tidak valid.`)
    return parsed.data
  })
  if (accounts[0].email.toLowerCase() === accounts[1].email.toLowerCase()) {
    throw new ProvisioningError('Email Sales dan Editor harus berbeda.')
  }
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }),
    },
  })
  for (const table of ['account_memberships', 'editor_scopes', 'admin_memberships']) {
    const { error } = await client.from(table).select('user_id').limit(0)
    if (error)
      throw new ProvisioningError(
        'Tabel akses belum siap. Jalankan migration 202610050001_account_access.sql.',
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
    if (data.users.length < 100 || existingUsers.length === 2) break
  }
  if (process.argv.includes('--check')) {
    console.log('Konfigurasi, akses admin, kredensial, dan tabel siap. Belum ada akun diubah.')
    return
  }
  for (const account of accounts) {
    const existing = existingUsers.find(
      (user) => user.email?.toLowerCase() === account.email.toLowerCase(),
    )
    const attributes = { email: account.email, password: account.password, email_confirm: true }
    const result = existing
      ? await client.auth.admin.updateUserById(existing.id, attributes)
      : await client.auth.admin.createUser(attributes)
    if (result.error || !result.data.user) fail(`Pembuatan akun ${account.role}`, result.error)
    const userId = result.data.user.id
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
      const { error: adminError } = await client
        .from('admin_memberships')
        .upsert({ user_id: userId }, { onConflict: 'user_id' })
      if (adminError) fail('Penetapan admin Editor super', adminError)
    } else {
      const { error: adminError } = await client
        .from('admin_memberships')
        .delete()
        .eq('user_id', userId)
      if (adminError) fail('Pemisahan akses Sales dari admin', adminError)
      const { error: scopeError } = await client
        .from('editor_scopes')
        .delete()
        .eq('user_id', userId)
      if (scopeError) fail('Pemisahan scope Editor dari Sales', scopeError)
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
        levels.some((level) => !scopes.some((scope) => scope.education_level === level))) ||
      (account.role === 'sales' && scopes.length)
    )
      fail(`Verifikasi scope ${account.role}`, scopesError)
    const { data: admin, error: adminReadError } = await verification
      .from('admin_memberships')
      .select('user_id')
      .eq('user_id', userId)
    if (adminReadError || (account.role === 'editor' ? admin.length !== 1 : admin.length !== 0))
      fail(`Verifikasi batas admin ${account.role}`, adminReadError)
    console.log(
      `Akun super ${account.role} siap; login, role, scope, dan batas admin terverifikasi.`,
    )
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
