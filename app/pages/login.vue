<script setup lang="ts">
import { loginReturnToSchema } from '#shared/schemas/navigation'
import { loginSchema } from '#shared/schemas/auth'
import type { AccountSession } from '#shared/types/account'

const config = useRuntimeConfig()
useSeoMeta({ title: `Login | ${config.public.siteName}`, robots: 'noindex, nofollow' })
const route = useRoute()
const account = ref<AccountSession | null>(null)
const returnTo = computed(() => {
  const result = loginReturnToSchema.safeParse(route.query.returnTo)
  return result.success ? result.data : '/'
})
const registerDestination = computed(() => ({
  path: '/register',
  query: returnTo.value !== '/' ? { returnTo: returnTo.value } : {},
}))
const client = useSupabaseClient()
const user = useSupabaseUser()
const email = ref('')
const password = ref('')
const loading = ref(false)
const message = ref('')
const showPassword = ref(false)
const requestFetch = useRequestFetch()
async function loadAccount() {
  try {
    account.value = await requestFetch<AccountSession>('/api/auth/session')
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode !== 403) throw error
    account.value = null
  }
}
if (user.value) {
  try {
    await loadAccount()
  } catch {
    message.value = 'Hak akses belum dapat dimuat. Silakan coba lagi.'
  }
}
const configured = computed(
  () =>
    config.public.supabase.url !== 'https://example.supabase.co' &&
    config.public.supabase.key !== 'demo-only-not-a-real-key',
)

async function login() {
  if (!configured.value || loading.value) return
  message.value = ''
  const result = loginSchema.safeParse({ email: email.value, password: password.value })
  if (!result.success) {
    message.value = result.error.issues[0]?.message ?? 'Periksa email dan kata sandi Anda.'
    return
  }
  loading.value = true
  message.value = ''
  try {
    const { error } = await client.auth.signInWithPassword(result.data)
    if (error) {
      message.value = 'Login gagal. Periksa email dan kata sandi Anda.'
      return
    }
    await loadAccount()
    await navigateTo(returnTo.value)
  } catch {
    message.value = 'Login belum dapat diproses. Coba lagi nanti.'
  } finally {
    loading.value = false
  }
}
async function logout() {
  if (loading.value) return
  loading.value = true
  message.value = ''
  try {
    const { error } = await client.auth.signOut()
    if (error) {
      message.value = 'Logout gagal. Silakan coba lagi.'
      return
    }
    password.value = ''
    account.value = null
    showPassword.value = false
    await navigateTo('/')
  } catch {
    message.value = 'Logout belum dapat diproses. Silakan coba lagi.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section aria-labelledby="login-title" class="login-card">
    <div class="login-welcome">
      <div class="auth-brand"><PublisherLogos /></div>
      <div>
        <h2>Selamat datang kembali</h2>
        <p>Masuk dengan akun terdaftar untuk melanjutkan aktivitas Anda di katalog.</p>
      </div>
    </div>
    <div class="login-panel">
      <h1 id="login-title">Masuk</h1>
      <p class="login-intro">Gunakan email dan kata sandi akunmu.</p>
      <p v-if="returnTo !== '/' && returnTo !== '/products'" class="login-notice">
        Setelah login, Anda akan kembali ke konten yang dipilih. Akses mengikuti hak akun dan
        ketersediaan berkas.
      </p>
      <p v-if="!configured" role="status" class="login-notice">
        Login belum tersedia pada demo ini. Anda tetap dapat
        <NuxtLink to="/products">menjelajahi katalog</NuxtLink> tanpa masuk.
      </p>
      <p v-if="message" id="login-message" role="alert" class="login-alert">{{ message }}</p>
      <div v-if="user" class="login-account">
        <p>Anda sudah masuk. Lanjutkan ke tujuan Anda atau keluar untuk memakai akun lain.</p>
        <UButton :to="returnTo" class="login-primary" :disabled="loading">Lanjutkan</UButton>
        <UButton variant="outline" class="login-secondary" :loading="loading" @click="logout"
          >Keluar dari akun</UButton
        >
      </div>
      <form
        v-else
        class="login-form"
        :aria-busy="loading"
        :aria-describedby="message ? 'login-message' : undefined"
        @submit.prevent="login"
      >
        <div class="login-field">
          <label for="email">Email</label>
          <input
            id="email"
            v-model="email"
            required
            type="email"
            autocomplete="username"
            maxlength="254"
            placeholder="nama@email.com"
            autocapitalize="none"
            :spellcheck="false"
            :disabled="!configured || loading"
          />
        </div>
        <div class="login-field">
          <label for="password">Kata sandi</label>
          <div class="password-field">
            <input
              id="password"
              v-model="password"
              required
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              :disabled="!configured || loading"
            />
            <button
              type="button"
              :disabled="!configured || loading"
              :aria-pressed="showPassword"
              aria-controls="password"
              @click="showPassword = !showPassword"
            >
              {{ showPassword ? 'Sembunyikan' : 'Tampilkan' }}
            </button>
          </div>
        </div>
        <div class="login-help"><NuxtLink to="/contact">Lupa kata sandi?</NuxtLink></div>
        <UButton
          type="submit"
          class="login-primary"
          :disabled="!configured || loading"
          :loading="loading"
          >{{ loading ? 'Memproses login...' : 'Masuk' }}</UButton
        >
      </form>
      <div class="login-register">
        <p>Belum memiliki akun?</p>
        <UButton :to="registerDestination" variant="outline" class="login-secondary"
          >Daftar</UButton
        >
        <p class="registration-note">
          Pendaftaran mandiri dinonaktifkan. Hubungi pengelola untuk mendapatkan akun.
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.login-card {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  max-width: 960px;
  margin: 0 auto;
  border: 1px solid #e6e8e4;
  border-radius: 24px;
  overflow: hidden;
  color: #222;
  font-family: var(--font-landing-sans);
}
.login-welcome {
  display: flex;
  flex-direction: column;
  gap: 40px;
  padding: 48px 40px;
  background: #f4f8f5;
}
.auth-brand {
  display: flex;
  flex: 1;
  min-height: 180px;
  align-items: center;
  justify-content: center;
}
.auth-brand :deep(.erlangga-logo) {
  width: min(373px, 100%);
  height: 100px;
}
.auth-brand :deep(.publisher-logos) {
  width: 100%;
  justify-content: center;
}
.login-welcome h2 {
  font: 600 30px/36px var(--font-landing-serif);
}
.login-welcome p {
  margin-top: 16px;
  color: #6b6f6b;
  font: 400 17px/27.2px var(--font-landing-serif);
}
.login-panel {
  min-width: 0;
  padding: 48px 44px;
}
.login-panel h1 {
  font: 500 30px/36px var(--font-landing-serif);
}
.login-intro {
  margin-top: 6px;
  color: #6b6f6b;
  font-size: 15px;
  line-height: 24px;
}
.login-form {
  display: grid;
  gap: 16px;
  margin-top: 24px;
}
.login-field {
  display: grid;
  gap: 6px;
}
.login-field label {
  font-size: 13px;
  font-weight: 500;
  line-height: 21px;
}
.login-field > input,
.password-field {
  width: 100%;
  min-height: 46px;
  border: 1px solid #e6e8e4;
  border-radius: 12px;
  background: #fff;
}
.login-field input {
  min-width: 0;
  padding: 12px 14px;
  font-size: 15px;
  line-height: 20px;
}
.login-field input:disabled {
  background: #f5f5f4;
}
.password-field {
  display: flex;
  overflow: hidden;
}
.password-field input {
  flex: 1;
  width: 0;
  outline: none;
}
.password-field:focus-within {
  outline: 2px solid #1f5c3f;
  outline-offset: 2px;
}
.password-field button {
  padding: 4px 12px;
  color: #1f5c3f;
  font-size: 13px;
}
.password-field button:disabled {
  opacity: 0.5;
}
.login-help {
  display: flex;
  justify-content: flex-end;
  color: #1f5c3f;
  font-size: 13px;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.login-primary,
.login-secondary {
  display: flex;
  width: 100%;
  min-height: 44px;
  justify-content: center;
  padding: 8px 22px;
  border: 1px solid #1f5c3f;
  border-radius: 12px;
  font-family: var(--font-landing-sans);
  font-size: 15px;
  font-weight: 500;
  line-height: 24px;
}
.login-primary {
  background: #1f5c3f;
  color: #fff;
}
.login-primary:hover {
  background: #184a32;
}
.login-secondary {
  color: #1f5c3f;
  background: #fff;
}
.login-secondary:hover {
  background: #f4f8f5;
}
.login-register {
  display: grid;
  gap: 10px;
  margin-top: 22px;
  color: #6b6f6b;
  font-size: 13px;
}
.registration-note {
  font-size: 12px;
  line-height: 19px;
}
.login-account {
  display: grid;
  gap: 16px;
  margin-top: 24px;
  font-size: 14px;
  line-height: 22px;
  color: #6b6f6b;
}
.login-notice,
.login-alert {
  margin-top: 18px;
  padding: 12px 14px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 21px;
}
.login-notice {
  background: #f4f8f5;
  color: #1f5c3f;
}
.login-notice a {
  text-decoration: underline;
}
.login-alert {
  border: 1px solid #fecaca;
  background: #fef2f2;
  color: #991b1b;
}
button,
input,
a {
  outline-offset: 3px;
}
button:focus-visible,
input:focus-visible,
a:focus-visible {
  outline: 2px solid #1f5c3f;
}
@media (max-width: 800px) {
  .login-card {
    grid-template-columns: 1fr;
  }
  .login-welcome {
    gap: 32px;
    padding: 32px;
  }
  .auth-brand {
    min-height: 140px;
  }
  .auth-brand :deep(.erlangga-logo) {
    max-width: 300px;
    height: 80px;
  }
  .login-panel {
    padding: 32px;
  }
}
@media (max-width: 450px) {
  .login-welcome,
  .login-panel {
    padding: 28px 24px;
  }
  .login-welcome h2 {
    font-size: 26px;
    line-height: 32px;
  }
}
</style>
