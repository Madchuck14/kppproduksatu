import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { createServerClient } from '@supabase/ssr'
import { editorNips } from './convert-editor-nips.mjs'

// Live login and read-only access checks. Never provisions accounts or writes catalog data.
class VerificationError extends Error {}
function check(condition, message) {
  if (!condition) throw new VerificationError(message)
}
async function main() {
  const env = { ...parseEnv(readFileSync('.env', 'utf8')), ...process.env }
  const credentials = parseEnv(readFileSync('.env.editor-accounts', 'utf8'))
  const base = env.EDITOR_TEST_BASE_URL || 'http://localhost:3000'
  for (const [level, nip] of Object.entries(editorNips)) {
    const jar = new Map()
    const client = createServerClient(env.NUXT_PUBLIC_SUPABASE_URL, env.NUXT_PUBLIC_SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      cookieOptions: { name: 'sb-kppproduksatu' },
      cookies: {
        getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
        setAll: (entries) => entries.forEach(({ name, value }) => jar.set(name, value)),
      },
    })
    try {
      const login = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nip, password: credentials[`EDITOR_${level}_PASSWORD`] }),
        signal: AbortSignal.timeout(20000),
      })
      check(login.ok, `Login NIP Editor ${level} gagal (status ${login.status}).`)
      const tokens = await login.json()
      const { error } = await client.auth.setSession(tokens)
      check(!error, `Sesi Editor ${level} gagal dipasang.`)
      const headers = { Cookie: Array.from(jar, ([name, value]) => `${name}=${value}`).join('; ') }
      const session = await fetch(`${base}/api/auth/session`, {
        headers,
        signal: AbortSignal.timeout(20000),
      })
      check(session.ok, `Pemeriksaan sesi Editor ${level} gagal (status ${session.status}).`)
      const account = await session.json()
      check(
        account.nip === nip &&
          account.role === 'editor' &&
          account.isSuper === false &&
          account.educationLevels.length === 1 &&
          account.educationLevels[0] === level,
        `Identitas/izin Editor ${level} tidak sesuai.`,
      )
      for (const target of Object.keys(editorNips)) {
        const books = await fetch(`${base}/api/admin/books?level=${target}`, {
          headers,
          signal: AbortSignal.timeout(20000),
        })
        check(
          books.status === (target === level ? 200 : 403),
          `Batas API Editor ${level}/${target} tidak sesuai (status ${books.status}).`,
        )
        if (books.ok) {
          const result = await books.json()
          check(
            result.books.every((book) => book.educationLevel === level),
            `API Editor ${level} memuat buku di luar scope.`,
          )
        }
        const { data, error } = await client.rpc('can_manage_book_level', { target_level: target })
        check(
          !error && data === (target === level),
          `Batas RLS Editor ${level}/${target} tidak sesuai.`,
        )
      }
      console.log(
        `PASS: Editor ${level} (${nip}), login NIP/password lama, sesi non-super, API dan RLS satu jenjang.`,
      )
    } finally {
      await client.auth.signOut({ scope: 'local' })
    }
  }
}
main().catch((error) => {
  console.error(
    error instanceof VerificationError
      ? error.message
      : 'Verifikasi gagal; periksa server dan konfigurasi Supabase.',
  )
  process.exitCode = 1
})
