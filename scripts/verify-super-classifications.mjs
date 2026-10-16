import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { pathToFileURL } from 'node:url'
import { createServerClient } from '@supabase/ssr'

// Read-only live verification. Invalid mutation bodies prove the guard without writing data.
const env = { ...parseEnv(readFileSync('.env', 'utf8')), ...process.env }
const scoped = parseEnv(readFileSync('.env.editor-accounts', 'utf8'))
const base = env.EDITOR_TEST_BASE_URL || 'http://localhost:3000'
const { chromium } = await import(pathToFileURL(env.PLAYWRIGHT_MODULE_PATH).href)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
async function api(cookie, method, expected) {
  const response = await fetch(`${base}/api/admin/classifications`, {
    method,
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(20000),
  })
  assert.equal(response.status, expected, `${method}: expected ${expected}, got ${response.status}`)
}
try {
  for (const method of ['POST', 'DELETE']) await api('', method, 401)
  assert.equal((await fetch(`${base}/api/catalog/classifications`)).status, 200)
  const accounts = [
    ...['SD', 'SMP', 'SMA', 'SMK'].map((level) => ({
      label: `Editor ${level}`,
      email: scoped[`EDITOR_${level}_EMAIL`],
      password: scoped[`EDITOR_${level}_PASSWORD`],
      role: 'editor',
      super: false,
    })),
    {
      label: 'Editor super',
      email: env.SUPER_ACCOUNT_EDITOR_EMAIL,
      password: env.SUPER_ACCOUNT_EDITOR_PASSWORD,
      role: 'editor',
      super: true,
    },
    {
      label: 'Sales super',
      email: env.SUPER_ACCOUNT_SALES_EMAIL,
      password: env.SUPER_ACCOUNT_SALES_PASSWORD,
      role: 'sales',
      super: true,
    },
  ]
  for (const account of accounts) {
    const jar = new Map()
    const client = createServerClient(env.NUXT_PUBLIC_SUPABASE_URL, env.NUXT_PUBLIC_SUPABASE_KEY, {
      cookieOptions: { name: 'sb-kppproduksatu' },
      cookies: {
        getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
        setAll: (entries) => entries.forEach(({ name, value }) => jar.set(name, value)),
      },
    })
    try {
      const login = await client.auth.signInWithPassword({
        email: account.email,
        password: account.password,
      })
      assert.equal(login.error, null, `${account.label}: login failed`)
      const cookie = Array.from(jar, ([name, value]) => `${name}=${value}`).join('; ')
      const sessionResponse = await fetch(`${base}/api/auth/session`, {
        headers: { Cookie: cookie },
      })
      if (account.role !== 'editor') {
        assert.equal(sessionResponse.status, 403)
        for (const method of ['POST', 'DELETE']) await api(cookie, method, 403)
        console.log('PASS: legacy non-Editor session and classification access denied.')
        continue
      }
      assert.equal(sessionResponse.status, 200)
      const session = await sessionResponse.json()
      assert.equal(session.role, account.role)
      assert.equal(session.isSuper, account.super)
      const canManage = account.role === 'editor' && account.super
      for (const method of ['POST', 'DELETE']) await api(cookie, method, canManage ? 400 : 403)
      if (account.role === 'editor') {
        const context = await browser.newContext()
        try {
          await context.addCookies(
            Array.from(jar, ([name, value]) => ({ name, value, url: base, sameSite: 'Lax' })),
          )
          const page = await context.newPage()
          const response = await page.goto(`${base}/admin`, { waitUntil: 'domcontentloaded' })
          assert.equal(response.status(), 200)
          await page.waitForFunction(() => Boolean(document.querySelector('#__nuxt')?.__vue_app__))
          const button = page.getByRole('button', { name: 'Edit Klasifikasi Buku', exact: true })
          assert.equal(await button.count(), canManage ? 1 : 0)
          if (canManage) {
            await button.click()
            await page.getByRole('dialog', { name: 'Edit Klasifikasi Buku', exact: true }).waitFor()
          }
        } finally {
          await context.close()
        }
      }
      console.log(`PASS: ${account.label}; API and dashboard access match role.`)
    } finally {
      await client.auth.signOut({ scope: 'local' })
    }
  }
  console.log(
    'PASS: port 3000 super-only classification controls; public options preserved; no classification or book writes.',
  )
} finally {
  await browser.close()
}
