<script setup lang="ts">
import FeaturedBooksManager from '~/components/FeaturedBooksManager.vue'
definePageMeta({ middleware: ['admin', 'editor-super'] })
useSeoMeta({ title: 'Atur Buku Pilihan | Editor', robots: 'noindex, nofollow' })
</script>

<template>
  <FeaturedBooksManager />
</template>
