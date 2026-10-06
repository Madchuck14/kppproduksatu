<script setup lang="ts">
definePageMeta({ middleware: 'admin' })
useSeoMeta({ title: 'Tambah buku | Editor', robots: 'noindex, nofollow' })
const { data, error, refresh } = await useFetch('/api/admin/book-options')
</script>

<template>
  <EditorBookForm v-if="data" :account="data.account" />
  <div v-else-if="error" role="alert" class="rounded-xl border border-red-200 p-6">
    <p>Formulir belum dapat dimuat.</p>
    <UButton class="mt-4" @click="refresh()">Coba lagi</UButton>
  </div>
</template>
