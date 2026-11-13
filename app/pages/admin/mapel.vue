<script setup lang="ts">
import { educationLevelSchema } from '#shared/schemas/auth'

definePageMeta({ middleware: 'admin' })
useSeoMeta({ title: 'Tambah Mapel | Editor', robots: 'noindex, nofollow' })
const { data: account, error, refresh } = await useFetch('/api/admin/editor-session')
const levels = computed(() =>
  account.value?.isSuper ? educationLevelSchema.options : (account.value?.educationLevels ?? []),
)
</script>

<template>
  <ClassificationManager v-if="account" :levels="levels" subjects-only />
  <div v-else-if="error" role="alert">
    <p>Formulir belum dapat dimuat.</p>
    <UButton @click="refresh()">Coba lagi</UButton>
  </div>
</template>
