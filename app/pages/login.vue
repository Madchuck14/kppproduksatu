<script setup lang="ts">
useSeoMeta({ title: 'Login admin', robots: 'noindex, nofollow' })
const client = useSupabaseClient()
const config = useRuntimeConfig()
const email = ref('')
const password = ref('')
const loading = ref(false)
const message = ref('')
const configured = computed(() => config.public.supabase.url !== 'https://example.supabase.co'
  && config.public.supabase.key !== 'demo-only-not-a-real-key')

async function login() {
  if (!configured.value || loading.value) return
  loading.value = true
  message.value = ''
  try {
    const { error } = await client.auth.signInWithPassword({ email: email.value, password: password.value })
    if (error) {
      message.value = 'Login gagal. Periksa email dan password.'
      return
    }
    await navigateTo('/admin')
  } catch {
    message.value = 'Login belum dapat diproses. Coba lagi nanti.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="mx-auto max-w-md rounded-xl border border-stone-200 bg-white p-8">
    <h1 class="display-heading mb-6 text-3xl">Login admin</h1>
    <p v-if="!configured" class="mb-6 text-sm text-stone-600">Login belum tersedia pada demo ini.</p>
    <form class="space-y-5" @submit.prevent="login">
      <div>
        <label for="email" class="mb-2 block text-sm">Email</label>
        <input id="email" v-model="email" required type="email" autocomplete="username" :disabled="!configured" class="w-full rounded-lg border border-stone-300 p-3">
      </div>
      <div>
        <label for="password" class="mb-2 block text-sm">Password</label>
        <input id="password" v-model="password" required type="password" autocomplete="current-password" :disabled="!configured" class="w-full rounded-lg border border-stone-300 p-3">
      </div>
      <p v-if="message" role="alert" class="text-sm text-red-700">{{ message }}</p>
      <UButton type="submit" :disabled="!configured" :loading="loading">Masuk</UButton>
    </form>
  </section>
</template>
