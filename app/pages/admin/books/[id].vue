<script setup lang="ts">
definePageMeta({ middleware: 'admin' })
useSeoMeta({ title: 'Edit buku | Editor', robots: 'noindex, nofollow' })
const route = useRoute()
const { data, error, refresh } = await useFetch(() => `/api/admin/books/${String(route.params.id)}`)
if (error.value?.statusCode === 404)
  throw createError({
    statusCode: 404,
    statusMessage: 'Buku tidak ditemukan atau di luar akses Anda',
  })
</script>

<template>
  <EditorBookForm
    v-if="data"
    :key="data.book.id"
    :book="data.book"
    :account="data.account"
    :categories="data.categories"
  />
  <div v-else-if="error" role="alert" class="rounded-xl border border-red-200 p-6">
    <p>Buku belum dapat dimuat.</p>
    <UButton class="mt-4" @click="refresh()">Coba lagi</UButton>
  </div>
</template>
