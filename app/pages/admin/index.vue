<script setup lang="ts">
definePageMeta({ middleware: 'admin' })
useSeoMeta({ title: 'Admin', robots: 'noindex, nofollow' })
const client = useSupabaseClient()
const message = ref('')
async function logout() {
  const { error } = await client.auth.signOut()
  if (error) {
    message.value = 'Logout gagal. Coba lagi.'
    return
  }
  await navigateTo('/login')
}
</script>

<template>
  <section>
    <div class="mb-6 flex items-center justify-between gap-4">
      <h1 class="display-heading text-4xl">Admin</h1>
      <UButton variant="outline" @click="logout">Keluar</UButton>
    </div>
    <p v-if="message" role="alert" class="mb-4 text-red-700">{{ message }}</p>
    <div class="rounded-xl border border-stone-200 bg-white p-8">
      <h2 class="mb-3 text-lg font-semibold">Fondasi admin siap dikembangkan</h2>
      <p class="text-stone-600">Login dan pemeriksaan hak akses tersedia. Pengelolaan produk, kategori, banner, dan artikel akan ditambahkan pada tahap berikutnya.</p>
    </div>
  </section>
</template>
