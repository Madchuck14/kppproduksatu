import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { z } from 'zod'

// Local administrative provisioning only. Never import this file into the application.
const levels = ['SD', 'SMP', 'SMA', 'SMK']
class ProvisioningError extends Error {}
function check(condition, message) {
  if (!condition) throw new ProvisioningError(message)
}
function checked(result, stage) {
  check(!result.error, `${stage} gagal.`)
  return result.data
}
const options = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }) },
}
async function main() {
  const env = { ...parseEnv(readFileSync('.env', 'utf8')), ...process.env }
  const credentials = parseEnv(readFileSync('.env.editor-accounts', 'utf8'))
  const url = env.NUXT_PUBLIC_SUPABASE_URL
  const publicKey = env.NUXT_PUBLIC_SUPABASE_KEY
  const adminKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY
  check(url && publicKey && adminKey, 'Konfigurasi Supabase belum lengkap.')
  const accounts = levels.map((level) => {
    const parsed = z.object({ email: z.email(), password: z.string().min(8).max(128) }).safeParse({
      email: credentials[`EDITOR_${level}_EMAIL`],
      password: credentials[`EDITOR_${level}_PASSWORD`],
    })
    check(parsed.success, `Kredensial Editor ${level} tidak valid.`)
    check(
      parsed.data.email === `editor${level.toLowerCase()}@erlangga.com`,
      `Email Editor ${level} tidak sesuai.`,
    )
    return { level, ...parsed.data }
  })
  const admin = createClient(url, adminKey, options)
  const existing = new Map()
  for (let page = 1; ; page++) {
    const data = checked(
      await admin.auth.admin.listUsers({ page, perPage: 100 }),
      'Pembacaan akun Auth',
    )
    for (const user of data.users) {
      const account = accounts.find((item) => item.email === user.email?.toLowerCase())
      if (account) existing.set(account.email, user)
    }
    if (data.users.length < 100) break
  }
  for (const table of ['account_memberships', 'editor_scopes', 'admin_memberships']) {
    checked(await admin.from(table).select('user_id').limit(0), 'Pemeriksaan tabel akses')
  }
  for (const user of existing.values()) {
    const membership = checked(
      await admin
        .from('account_memberships')
        .select('role,is_super')
        .eq('user_id', user.id)
        .maybeSingle(),
      'Pemeriksaan membership',
    )
    const legacy = checked(
      await admin.from('admin_memberships').select('user_id').eq('user_id', user.id),
      'Pemeriksaan admin',
    )
    check(
      !membership || (membership.role === 'editor' && !membership.is_super),
      'Email target sudah memiliki role lain atau hak super; tidak diubah.',
    )
    check(legacy.length === 0, 'Email target sudah memiliki hak admin; tidak diubah.')
  }
  if (process.argv.includes('--check')) {
    console.log(
      'PASS: konfigurasi, kredensial empat jenjang, tabel, dan akun target siap; belum ada perubahan.',
    )
    return
  }
  for (const account of accounts) {
    const previous = existing.get(account.email)
    const attributes = { email: account.email, password: account.password, email_confirm: true }
    const result = previous
      ? await admin.auth.admin.updateUserById(previous.id, attributes)
      : await admin.auth.admin.createUser(attributes)
    const { user } = checked(result, `Provisioning Editor ${account.level}`)
    check(user, 'Auth tidak mengembalikan akun.')
    checked(
      await admin
        .from('account_memberships')
        .upsert({ user_id: user.id, role: 'editor', is_super: false }, { onConflict: 'user_id' }),
      'Penetapan role',
    )
    checked(
      await admin
        .from('editor_scopes')
        .delete()
        .eq('user_id', user.id)
        .neq('education_level', account.level),
      'Pembatasan scope',
    )
    checked(
      await admin
        .from('editor_scopes')
        .upsert(
          { user_id: user.id, education_level: account.level },
          { onConflict: 'user_id,education_level' },
        ),
      'Penetapan jenjang',
    )
    const jar = new Map()
    const client = createServerClient(url, publicKey, {
      ...options,
      cookieOptions: { name: 'sb-kppproduksatu' },
      cookies: {
        getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
        setAll: (entries) => entries.forEach(({ name, value }) => jar.set(name, value)),
      },
    })
    try {
      checked(
        await client.auth.signInWithPassword({ email: account.email, password: account.password }),
        'Verifikasi login',
      )
      const membership = checked(
        await client
          .from('account_memberships')
          .select('role,is_super')
          .eq('user_id', user.id)
          .single(),
        'Verifikasi role',
      )
      check(
        membership.role === 'editor' && membership.is_super === false,
        'Role Editor biasa tidak sesuai.',
      )
      const scopes = checked(
        await client.from('editor_scopes').select('education_level').eq('user_id', user.id),
        'Verifikasi scope',
      )
      check(
        scopes.length === 1 && scopes[0].education_level === account.level,
        'Scope jenjang tidak sesuai.',
      )
      for (const level of levels) {
        const allowed = checked(
          await client.rpc('can_manage_book_level', { target_level: level }),
          'Verifikasi RLS jenjang',
        )
        check(allowed === (level === account.level), 'Batas RLS antarjenjang tidak sesuai.')
      }
      const base = env.EDITOR_TEST_BASE_URL || 'http://localhost:3000'
      const cookie = Array.from(jar, ([name, value]) => `${name}=${value}`).join('; ')
      for (const level of levels) {
        const response = await fetch(`${base}/api/admin/books?level=${level}`, {
          headers: { Cookie: cookie },
          signal: AbortSignal.timeout(20000),
        })
        check(
          response.status === (level === account.level ? 200 : 403),
          `Verifikasi API Editor ${account.level}/${level} gagal (status ${response.status}).`,
        )
        if (response.ok) {
          const result = await response.json()
          check(
            result.books.every((book) => book.educationLevel === account.level),
            'API mengembalikan buku di luar scope.',
          )
        }
      }
      console.log(
        `PASS: Editor ${account.level} siap; login, role non-super, satu scope, RLS dan API lintas jenjang terverifikasi.`,
      )
    } finally {
      await client.auth.signOut({ scope: 'local' })
    }
  }
}
main().catch((error) => {
  console.error(
    error instanceof ProvisioningError
      ? error.message
      : 'Provisioning gagal; periksa konfigurasi atau koneksi Supabase.',
  )
  process.exitCode = 1
})
