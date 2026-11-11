<script setup lang="ts">
import { educationLevelSchema } from '#shared/schemas/auth'

definePageMeta({ middleware: ['admin', 'editor-super'] })
useSeoMeta({ title: 'Edit Klasifikasi Buku | Editor', robots: 'noindex, nofollow' })
</script>

<template>
  <ClassificationManager :levels="educationLevelSchema.options" />
</template>
