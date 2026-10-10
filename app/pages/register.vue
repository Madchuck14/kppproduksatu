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
  <section aria-labelledby="register-title" class="login-card">
    <div class="login-welcome">
      <div class="auth-brand"><PublisherLogos /></div>
      <div>
        <h2>Mulai mengenal buku lebih dekat.</h2>
        <p>Buat akun untuk melanjutkan aktivitas Anda di katalog.</p>
      </div>
    </div>
    <div class="login-panel">
      <h1 id="register-title">Daftar akun</h1>
      <p class="login-intro">Gunakan email aktif dan buat kata sandi untuk akun Anda.</p>
      <p v-if="loginDestination.query.returnTo !== '/products'" class="login-notice">
        Tujuan buku Anda tetap tersimpan saat melanjutkan ke login.
      </p>
      <p role="status" class="login-notice">
        Pendaftaran mandiri dinonaktifkan.
        <NuxtLink to="/contact">Hubungi pengelola</NuxtLink> untuk mendapatkan akun.
      </p>
      <p v-if="message" id="register-message" role="alert" class="login-alert">{{ message }}</p>
      <div v-if="user" class="login-account">
        <p>
          Anda sudah masuk. Buka halaman login untuk melanjutkan atau keluar dari akun saat ini.
        </p>
        <UButton :to="loginDestination" class="login-primary">Ke halaman login</UButton>
      </div>
      <form
        v-else
        class="login-form"
        :aria-busy="loading"
        :aria-describedby="message ? 'register-message' : undefined"
        @submit.prevent="register"
      >
        <fieldset :disabled="!configured || loading" class="registration-roles">
          <legend>Daftar sebagai</legend>
          <div class="role-options">
            <label :class="{ selected: role === 'sales' }"
              ><input v-model="role" name="role" type="radio" value="sales" required /><span
                ><strong>Sales</strong><span>Presentasi produk</span></span
              ></label
            >
            <label :class="{ selected: role === 'editor' }"
              ><input v-model="role" name="role" type="radio" value="editor" required /><span
                ><strong>Editor</strong><span>Pengelolaan katalog</span></span
              ></label
            >
          </div>
        </fieldset>
        <div v-if="role === 'editor'" class="login-field">
          <label for="editor-education-level">Jenjang pendidikan</label>
          <select
            id="editor-education-level"
            v-model="educationLevel"
            name="educationLevel"
            required
            :disabled="!configured || loading"
            aria-describedby="editor-access-help"
          >
            <option value="" disabled>Pilih jenjang pendidikan</option>
            <option v-for="level in educationLevels" :key="level" :value="level">
              {{ level }}
            </option>
          </select>
          <p id="editor-access-help" class="field-help">
            Hak akses Editor perlu diverifikasi pengelola.
          </p>
        </div>
        <div class="login-field">
          <label for="register-email">Email</label>
          <input
            id="register-email"
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
          <label for="register-password">Kata sandi</label>
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
          />
          <p id="password-help" class="field-help">Gunakan 8&ndash;128 karakter.</p>
        </div>
        <div class="login-field">
          <label for="confirm-password">Konfirmasi kata sandi</label>
          <input
            id="confirm-password"
            v-model="confirmPassword"
            required
            :type="showPassword ? 'text' : 'password'"
            autocomplete="new-password"
            minlength="8"
            maxlength="128"
            :disabled="!configured || loading"
          />
        </div>
        <button
          type="button"
          class="show-password"
          :disabled="!configured || loading"
          :aria-pressed="showPassword"
          aria-controls="register-password confirm-password"
          @click="showPassword = !showPassword"
        >
          {{ showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi' }}
        </button>
        <UButton type="submit" class="login-primary" :disabled="true" :loading="loading"
          >Daftar akun</UButton
        >
      </form>
      <div class="login-register">
        <p>Sudah memiliki akun?</p>
        <UButton :to="loginDestination" variant="outline" class="login-secondary">Login</UButton>
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

.registration-roles {
  min-width: 0;
}
.registration-roles legend {
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
  line-height: 21px;
}
.role-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.role-options label {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 12px;
  border: 1px solid #e6e8e4;
  border-radius: 12px;
  cursor: pointer;
  min-width: 0;
}
.role-options label.selected {
  border-color: #1f5c3f;
  background: #f4f8f5;
}
.role-options input {
  margin-top: 3px;
  accent-color: #1f5c3f;
}
.role-options strong {
  display: block;
  font-size: 13px;
  font-weight: 600;
}
.role-options span span {
  display: block;
  margin-top: 4px;
  color: #6b6f6b;
  font-size: 11px;
  line-height: 17px;
}
.login-field select {
  width: 100%;
  min-height: 46px;
  padding: 12px 14px;
  border: 1px solid #e6e8e4;
  border-radius: 12px;
  background: #fff;
  font-size: 14px;
}
.field-help {
  color: #6b6f6b;
  font-size: 12px;
  line-height: 19px;
}
.show-password {
  justify-self: start;
  color: #1f5c3f;
  font-size: 13px;
}
select:focus-visible {
  outline: 2px solid #1f5c3f;
  outline-offset: 3px;
}
</style>
