<script setup lang="ts">
const config = useRuntimeConfig()
const user = useSupabaseUser()
const client = useSupabaseClient()
const requestFetch = useRequestFetch()
const { data: navigationAccount } = await useAsyncData(
  'navigation-account',
  async () => {
    if (!user.value) return null
    try {
      return await requestFetch('/api/auth/session')
    } catch {
      return null
    }
  },
  { watch: [user] },
)
const loggingOut = ref(false)
const logoutMessage = ref('')

async function logout() {
  if (loggingOut.value) return
  loggingOut.value = true
  logoutMessage.value = ''
  try {
    const { error } = await client.auth.signOut()
    if (error) {
      logoutMessage.value = 'Logout gagal. Silakan coba lagi.'
      return
    }
    await navigateTo('/')
  } catch {
    logoutMessage.value = 'Logout belum dapat diproses. Silakan coba lagi.'
  } finally {
    loggingOut.value = false
  }
}
</script>

<template>
  <div class="min-h-screen">
    <a href="#main-content" class="sr-only focus:not-sr-only focus:p-4">Lewati ke konten</a>
    <header class="border-b border-stone-200 bg-white">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6">
        <NuxtLink to="/" class="text-lg font-semibold tracking-tight">
          {{ config.public.siteName }}<span class="text-emerald-700">.</span>
        </NuxtLink>
        <nav aria-label="Navigasi utama" class="flex flex-wrap items-center gap-5 text-sm">
          <NuxtLink to="/">Beranda</NuxtLink>
          <NuxtLink to="/products">Katalog</NuxtLink>
          <NuxtLink v-if="user && navigationAccount?.role === 'editor'" to="/admin"
            >Dashboard Editor</NuxtLink
          >
          <button
            v-if="user"
            type="button"
            :disabled="loggingOut"
            :aria-busy="loggingOut"
            class="cursor-pointer disabled:cursor-wait disabled:opacity-60"
            @click="logout"
          >
            {{ loggingOut ? 'Keluar...' : 'Keluar' }}
          </button>
          <NuxtLink v-else to="/login">Login</NuxtLink>
        </nav>
      </div>
      <p v-if="logoutMessage" role="alert" class="mx-auto max-w-6xl px-6 pb-4 text-sm text-red-700">
        {{ logoutMessage }}
      </p>
    </header>
    <main id="main-content" class="mx-auto max-w-6xl px-6 py-12">
      <slot />
    </main>
    <footer class="border-t border-stone-200">
      <div
        class="mx-auto flex max-w-6xl flex-wrap justify-between gap-4 px-6 py-8 text-sm text-stone-600"
      >
        <span>{{ config.public.siteName }}</span>
        <span>Katalog buku Erlangga · Mendukung presentasi produk.</span>
      </div>
    </footer>
  </div>
</template>
