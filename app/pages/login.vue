<script setup lang="ts">
import { loginReturnToSchema } from '#shared/schemas/navigation'
import { loginSchema } from '#shared/schemas/auth'
import type { AccountSession } from '#shared/types/account'
import { maxSalesAreas, saveSalesAreasSchema } from '#shared/schemas/sales-areas'

const config = useRuntimeConfig()
useSeoMeta({ title: `Login | ${config.public.siteName}`, robots: 'noindex, nofollow' })
const route = useRoute()
const account = ref<AccountSession | null>(null)
const areas = ref<string[]>([''])
const returnTo = computed(() => {
  const result = loginReturnToSchema.safeParse(route.query.returnTo)
  return result.success ? result.data : account.value?.role === 'editor' ? '/admin' : '/products'
})
const client = useSupabaseClient()
const user = useSupabaseUser()
const nip = ref('')
const password = ref('')
const loading = ref(false)
const message = ref('')
const showPassword = ref(false)
const requestFetch = useRequestFetch()
async function loadAccount() {
  account.value = await requestFetch<AccountSession>('/api/auth/session')
  areas.value = account.value.salesAreas?.length ? [...account.value.salesAreas] : ['']
}
if (user.value) {
  try {
    await loadAccount()
  } catch {
    account.value = null
    message.value = 'Akun belum memiliki akses Sales atau Editor. Hubungi pengelola.'
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
  const result = loginSchema.safeParse({ nip: nip.value, password: password.value })
  if (!result.success) {
    message.value = result.error.issues[0]?.message ?? 'Periksa NIP dan kata sandi Anda.'
    return
  }
  loading.value = true
  message.value = ''
  try {
    const session = await $fetch('/api/auth/login', { method: 'POST', body: result.data })
    const { error } = await client.auth.setSession(session)
    if (error) throw error
    await loadAccount()
    password.value = ''
    if (account.value?.role !== 'sales') await navigateTo(returnTo.value)
  } catch (error) {
    await client.auth.signOut({ scope: 'local' })
    account.value = null
    const status = (error as { statusCode?: number }).statusCode
    message.value =
      status === 401
        ? 'Login gagal. Periksa NIP dan kata sandi Anda.'
        : status === 429
          ? 'Terlalu banyak percobaan. Coba lagi nanti.'
          : status === 403
            ? 'NIP atau hak akses akun belum terdaftar. Hubungi pengelola.'
            : 'Login belum dapat diproses. Coba lagi nanti.'
  } finally {
    loading.value = false
  }
}
async function addArea() {
  if (loading.value || areas.value.length >= maxSalesAreas) return
  areas.value.push('')
  await nextTick()
  document.getElementById(`sales-area-${areas.value.length - 1}`)?.focus()
}
async function saveAreas() {
  if (loading.value || account.value?.role !== 'sales') return
  message.value = ''
  const parsed = saveSalesAreasSchema.safeParse({ areas: areas.value })
  if (!parsed.success) {
    message.value = parsed.error.issues[0]?.message ?? 'Periksa area Sales Anda.'
    return
  }
  loading.value = true
  try {
    const saved = await $fetch('/api/auth/sales-areas', { method: 'PUT', body: parsed.data })
    areas.value = saved.areas
    account.value = { ...account.value, salesAreas: saved.areas }
    await refreshNuxtData('navigation-account')
    await navigateTo(returnTo.value)
  } catch (error) {
    message.value =
      (error as { data?: { statusMessage?: string } }).data?.statusMessage ??
      'Area belum dapat disimpan. Isian Anda tetap tersedia. Silakan coba lagi.'
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
      <div class="auth-brand">
        <img src="/images/intelecto.png" alt="Intelecto" width="1536" height="1024" />
      </div>
      <div>
        <h2>Selamat datang kembali</h2>
        <p>Masuk sebagai Sales untuk menyimpan buku favorit atau Editor untuk mengelola katalog.</p>
      </div>
    </div>
    <div class="login-panel">
      <h1 id="login-title">Masuk akun</h1>
      <p class="login-intro">Gunakan NIP dan kata sandi akun Sales atau Editor Anda.</p>
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
        <form
          v-if="account?.role === 'sales'"
          class="sales-area-form"
          :aria-busy="loading"
          @submit.prevent="saveAreas"
        >
          <h2>Area Sales Anda</h2>
          <p>Masukkan satu atau beberapa area yang Anda tangani. Area ini diisi oleh Anda.</p>
          <div v-for="(_area, index) in areas" :key="index" class="sales-area-row">
            <div class="login-field">
              <label :for="`sales-area-${index}`">Area {{ index + 1 }}</label>
              <input
                :id="`sales-area-${index}`"
                v-model="areas[index]"
                type="text"
                maxlength="100"
                placeholder="Contoh: Jakarta Timur"
                required
                :disabled="loading"
              />
            </div>
            <UButton
              type="button"
              color="error"
              variant="ghost"
              :aria-label="`Hapus area ${index + 1}`"
              :disabled="loading || areas.length === 1"
              @click="areas.splice(index, 1)"
              >Hapus</UButton
            >
          </div>
          <UButton
            type="button"
            color="neutral"
            variant="outline"
            :disabled="loading || areas.length >= maxSalesAreas"
            @click="addArea"
            >+ Tambah area</UButton
          >
          <UButton type="submit" class="login-primary" :loading="loading" :disabled="loading"
            >Simpan area dan lanjutkan</UButton
          >
        </form>
        <p v-else>
          Anda sudah masuk. Lanjutkan ke tujuan Anda atau keluar untuk memakai akun lain.
        </p>
        <UButton
          v-if="account && account.role !== 'sales'"
          :to="returnTo"
          class="login-primary"
          :disabled="loading"
          >Lanjutkan</UButton
        >
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
          <label for="nip">Nomor Induk Pegawai (NIP)</label>
          <input
            id="nip"
            v-model="nip"
            required
            type="text"
            inputmode="numeric"
            pattern="[0-9]{1,32}"
            autocomplete="username"
            maxlength="32"
            placeholder="Masukkan NIP Anda"
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
        <UButton
          :to="{ path: '/register', query: route.query.returnTo ? { returnTo } : {} }"
          variant="outline"
          class="login-secondary"
          >Daftar akun</UButton
        >
      </div>
      <p class="registration-note">
        NIP harus terdaftar pada data pegawai. Akses Editor mengikuti jenjang yang ditetapkan
        pengelola.
        <NuxtLink to="/contact">Hubungi pengelola</NuxtLink> jika memerlukan bantuan.
      </p>
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
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 100%;
}
.auth-brand img {
  display: block;
  width: 100%;
  max-width: 440px;
  height: auto;
  object-fit: contain;
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
.sales-area-form {
  display: grid;
  gap: 16px;
}
.sales-area-form h2 {
  color: #222;
  font-size: 20px;
  font-weight: 600;
}
.sales-area-row {
  display: flex;
  align-items: end;
  gap: 8px;
}
.sales-area-row .login-field {
  flex: 1;
  min-width: 0;
}
.sales-area-row .login-field input {
  width: 100%;
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
  .auth-brand img {
    max-width: 480px;
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
