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
  <section
    aria-labelledby="login-title"
    class="mx-auto grid max-w-5xl overflow-hidden rounded-3xl border border-stone-200 bg-white lg:grid-cols-2"
  >
    <div class="flex flex-col justify-between gap-10 bg-[#e6ede5] p-7 sm:p-10 lg:p-12">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800">
          Katalog buku Erlangga
        </p>
        <h2 class="display-heading mt-6 text-4xl leading-tight sm:text-5xl">
          Satu tempat untuk mengenal setiap buku.
        </h2>
        <p class="mt-5 leading-relaxed text-stone-600">
          Masuk dengan akun terdaftar untuk melanjutkan aktivitas Anda di katalog.
        </p>
        <div class="mt-8 rounded-2xl border border-emerald-900/10 bg-white/60 p-5">
          <p class="text-sm font-semibold text-emerald-900">Materi pendukung produk</p>
          <p class="mt-2 text-sm leading-relaxed text-stone-600">
            Product Knowledge, flyer, dan dummy memerlukan login. Akses mengikuti hak akun dan
            ketersediaan berkas.
          </p>
        </div>
      </div>
      <NuxtLink
        to="/products"
        class="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 underline-offset-4 hover:underline"
        ><span aria-hidden="true">&larr;</span> Jelajahi katalog tanpa login</NuxtLink
      >
    </div>
    <div class="p-7 sm:p-10 lg:p-12">
      <p class="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800">
        Selamat datang kembali
      </p>
      <h1 id="login-title" class="display-heading mt-3 text-4xl">Login</h1>
      <p class="mt-3 text-sm leading-relaxed text-stone-600">
        Gunakan email dan kata sandi akun Anda.
      </p>
      <p
        v-if="returnTo !== '/' && returnTo !== '/products'"
        class="mt-5 rounded-lg bg-emerald-50 p-4 text-sm leading-relaxed text-emerald-900"
      >
        Masuk dengan akun yang sudah terdaftar. Setelah login, Anda akan kembali ke konten buku yang
        dipilih. Akses berkas mengikuti ketersediaan konten dan hak akses akun.
      </p>
      <p
        v-if="!configured"
        role="status"
        class="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
      >
        Login belum tersedia pada demo ini. Anda tetap dapat menjelajahi katalog tanpa masuk.
      </p>
      <p
        v-if="message"
        id="login-message"
        role="alert"
        class="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
      >
        {{ message }}
      </p>
      <div v-if="user" class="mt-7 space-y-4">
        <p class="text-sm text-stone-600">
          Anda sudah masuk. Lanjutkan ke tujuan Anda atau keluar untuk memakai akun lain.
        </p>
        <UButton :to="returnTo" size="lg" class="w-full justify-center" :disabled="loading"
          >Lanjutkan</UButton
        >
        <UButton
          color="neutral"
          variant="outline"
          size="lg"
          class="w-full justify-center"
          :loading="loading"
          @click="logout"
          >Keluar dari akun</UButton
        >
      </div>
      <form
        v-else
        class="mt-7 space-y-5"
        :aria-busy="loading"
        :aria-describedby="message ? 'login-message' : undefined"
        @submit.prevent="login"
      >
        <div>
          <label for="email" class="mb-2 block text-sm">Email</label>
          <input
            id="email"
            v-model="email"
            required
            type="email"
            autocomplete="username"
            maxlength="254"
            placeholder="nama@contoh.com"
            autocapitalize="none"
            :spellcheck="false"
            :disabled="!configured || loading"
            class="w-full rounded-lg border border-stone-300 p-3 outline-offset-2 focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:bg-stone-100"
          />
        </div>
        <div>
          <label for="password" class="mb-2 block text-sm">Kata sandi</label>
          <div
            class="flex overflow-hidden rounded-lg border border-stone-300 focus-within:ring-2 focus-within:ring-emerald-700"
          >
            <input
              id="password"
              v-model="password"
              required
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              :disabled="!configured || loading"
              class="min-w-0 flex-1 p-3 focus:outline-none disabled:bg-stone-100"
            />
            <button
              type="button"
              :disabled="!configured || loading"
              :aria-pressed="showPassword"
              aria-controls="password"
              class="px-3 text-xs font-semibold text-emerald-800 focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:text-stone-400"
              @click="showPassword = !showPassword"
            >
              {{ showPassword ? 'Sembunyikan' : 'Tampilkan' }}
            </button>
          </div>
        </div>
        <UButton
          type="submit"
          size="lg"
          class="w-full justify-center"
          :disabled="!configured || loading"
          :loading="loading"
          >{{ loading ? 'Memproses login...' : 'Masuk' }}</UButton
        >
      </form>
      <div class="mt-8 border-t border-stone-200 pt-6 text-sm leading-relaxed text-stone-600">
        <p class="font-semibold text-stone-800">Belum memiliki akun?</p>
        <p class="mt-2">
          Pendaftaran mandiri dinonaktifkan. Hubungi pengelola untuk mendapatkan akun katalog.
        </p>
        <UButton
          :to="registerDestination"
          class="mt-4 w-full justify-center"
          size="lg"
          variant="outline"
          >Daftar</UButton
        >
      </div>
    </div>
  </section>
</template>
