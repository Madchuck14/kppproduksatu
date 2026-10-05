<script setup lang="ts">
import { educationLevelSchema } from '#shared/schemas/auth'
import { loginReturnToSchema } from '#shared/schemas/navigation'

const config = useRuntimeConfig()
useSeoMeta({ title: `Daftar | ${config.public.siteName}`, robots: 'noindex, nofollow' })
const route = useRoute()
const user = useSupabaseUser()
const loginDestination = computed(() => {
  const result = loginReturnToSchema.safeParse(route.query.returnTo)
  return { path: '/login', query: { returnTo: result.success ? result.data : '/products' } }
})
const configured = computed(
  () =>
    config.public.supabase.url !== 'https://example.supabase.co' &&
    config.public.supabase.key !== 'demo-only-not-a-real-key',
)
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const loading = ref(false)
const message = ref('')
const submitted = ref(false)
const role = ref<'sales' | 'editor'>('sales')
const educationLevel = ref('')
const educationLevels = educationLevelSchema.options
watch(role, (value) => {
  if (value === 'sales') educationLevel.value = ''
  message.value = ''
})

function register() {
  message.value = 'Pendaftaran mandiri dinonaktifkan. Hubungi pengelola untuk mendapatkan akun.'
}
</script>

<template>
  <section
    aria-labelledby="register-title"
    class="mx-auto grid max-w-5xl overflow-hidden rounded-3xl border border-stone-200 bg-white lg:grid-cols-2"
  >
    <div class="flex flex-col justify-between gap-10 bg-[#e6ede5] p-7 sm:p-10 lg:p-12">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800">
          Katalog buku Erlangga
        </p>
        <h2 class="display-heading mt-6 text-4xl leading-tight sm:text-5xl">
          Mulai mengenal buku lebih dekat.
        </h2>
        <p class="mt-5 leading-relaxed text-stone-600">
          Buat akun untuk melanjutkan aktivitas Anda di katalog.
        </p>
        <div class="mt-8 rounded-2xl border border-emerald-900/10 bg-white/60 p-5">
          <p class="text-sm font-semibold text-emerald-900">Tentang akses akun</p>
          <p class="mt-2 text-sm leading-relaxed text-stone-600">
            Pilih akun Sales untuk aktivitas presentasi produk, atau Editor untuk mengajukan akses
            pengelolaan katalog sesuai jenjang. Permintaan akses perlu diverifikasi pengelola.
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
        Selamat bergabung
      </p>
      <h1 id="register-title" class="display-heading mt-3 text-4xl">Daftar akun</h1>
      <p class="mt-3 text-sm leading-relaxed text-stone-600">
        Gunakan email aktif dan buat kata sandi untuk akun Anda.
      </p>
      <p
        v-if="loginDestination.query.returnTo !== '/products'"
        class="mt-5 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900"
      >
        Tujuan buku Anda tetap tersimpan saat melanjutkan ke login.
      </p>
      <p
        role="status"
        class="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
      >
        Pendaftaran mandiri dinonaktifkan. Hubungi pengelola untuk mendapatkan akun.
      </p>
      <p
        v-if="message"
        id="register-message"
        role="alert"
        class="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
      >
        {{ message }}
      </p>
      <div v-if="user" class="mt-7 space-y-4">
        <p class="text-sm text-stone-600">
          Anda sudah masuk. Buka halaman login untuk melanjutkan atau keluar dari akun saat ini.
        </p>
        <UButton :to="loginDestination" size="lg" class="w-full justify-center"
          >Ke halaman login</UButton
        >
      </div>
      <div
        v-else-if="submitted"
        class="mt-7 rounded-xl border border-emerald-200 bg-emerald-50 p-5"
        role="status"
      >
        <h2 class="font-semibold text-emerald-900">Permintaan pendaftaran diproses</h2>
        <p class="mt-3 text-sm leading-relaxed text-emerald-900">
          Jika diperlukan konfirmasi, periksa email Anda dan ikuti tautan yang dikirim, lalu login.
          Jika email sudah terdaftar, gunakan akun yang sudah ada.
        </p>
        <p class="mt-3 text-sm leading-relaxed text-emerald-900">
          Hak akses yang dipilih masih memerlukan verifikasi pengelola. Pendaftaran belum memberikan
          akses pengelolaan katalog.
        </p>
        <UButton :to="loginDestination" class="mt-5" size="lg">Lanjutkan ke login</UButton>
      </div>
      <form
        v-else
        class="mt-7 space-y-5"
        :aria-busy="loading"
        :aria-describedby="message ? 'register-message' : undefined"
        @submit.prevent="register"
      >
        <fieldset :disabled="!configured || loading">
          <legend class="mb-3 text-sm font-medium">Daftar sebagai</legend>
          <div class="grid grid-cols-2 gap-3">
            <label
              :class="[
                'flex cursor-pointer items-start gap-3 rounded-xl border p-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-700',
                role === 'sales' ? 'border-emerald-700 bg-emerald-50' : 'border-stone-300',
              ]"
            >
              <input
                v-model="role"
                name="role"
                type="radio"
                value="sales"
                required
                class="mt-1 accent-emerald-700"
              />
              <span
                ><span class="block text-sm font-semibold">Sales</span
                ><span class="mt-1 block text-xs leading-relaxed text-stone-600"
                  >Presentasi produk</span
                ></span
              >
            </label>
            <label
              :class="[
                'flex cursor-pointer items-start gap-3 rounded-xl border p-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-700',
                role === 'editor' ? 'border-emerald-700 bg-emerald-50' : 'border-stone-300',
              ]"
            >
              <input
                v-model="role"
                name="role"
                type="radio"
                value="editor"
                required
                class="mt-1 accent-emerald-700"
              />
              <span
                ><span class="block text-sm font-semibold">Editor</span
                ><span class="mt-1 block text-xs leading-relaxed text-stone-600"
                  >Pengelolaan katalog</span
                ></span
              >
            </label>
          </div>
        </fieldset>
        <div v-if="role === 'editor'">
          <label for="editor-education-level" class="mb-2 block text-sm">Jenjang pendidikan</label>
          <select
            id="editor-education-level"
            v-model="educationLevel"
            name="educationLevel"
            required
            :disabled="!configured || loading"
            aria-describedby="editor-access-help"
            class="w-full rounded-lg border border-stone-300 bg-white p-3 outline-offset-2 focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:bg-stone-100"
          >
            <option value="" disabled>Pilih jenjang pendidikan</option>
            <option v-for="level in educationLevels" :key="level" :value="level">
              {{ level }}
            </option>
          </select>
          <p id="editor-access-help" class="mt-2 text-xs leading-relaxed text-stone-600">
            Permintaan akses Editor untuk jenjang ini akan ditinjau pengelola sebelum dapat
            digunakan.
          </p>
        </div>
        <div>
          <label for="register-email" class="mb-2 block text-sm">Email</label>
          <input
            id="register-email"
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
          <label for="register-password" class="mb-2 block text-sm">Kata sandi</label>
          <input
            id="register-password"
            v-model="password"
            required
            :type="showPassword ? 'text' : 'password'"
            autocomplete="new-password"
            minlength="8"
            maxlength="128"
            aria-describedby="password-help"
            :disabled="!configured || loading"
            class="w-full rounded-lg border border-stone-300 p-3 outline-offset-2 focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:bg-stone-100"
          />
          <p id="password-help" class="mt-2 text-xs text-stone-500">Gunakan 8–128 karakter.</p>
        </div>
        <div>
          <label for="confirm-password" class="mb-2 block text-sm">Konfirmasi kata sandi</label>
          <input
            id="confirm-password"
            v-model="confirmPassword"
            required
            :type="showPassword ? 'text' : 'password'"
            autocomplete="new-password"
            minlength="8"
            maxlength="128"
            :disabled="!configured || loading"
            class="w-full rounded-lg border border-stone-300 p-3 outline-offset-2 focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:bg-stone-100"
          />
        </div>
        <button
          type="button"
          :disabled="!configured || loading"
          :aria-pressed="showPassword"
          aria-controls="register-password confirm-password"
          class="text-sm font-semibold text-emerald-800 disabled:text-stone-400"
          @click="showPassword = !showPassword"
        >
          {{ showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi' }}
        </button>
        <UButton
          type="submit"
          size="lg"
          class="w-full justify-center"
          :disabled="true"
          :loading="loading"
          >{{ loading ? 'Memproses pendaftaran...' : 'Daftar akun' }}</UButton
        >
      </form>
      <div class="mt-8 border-t border-stone-200 pt-6 text-sm text-stone-600">
        Sudah memiliki akun?
        <NuxtLink
          :to="loginDestination"
          class="ml-1 font-semibold text-emerald-800 underline-offset-4 hover:underline"
          >Login</NuxtLink
        >
      </div>
    </div>
  </section>
</template>
