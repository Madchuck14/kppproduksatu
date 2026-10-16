<script setup lang="ts">
import { loginReturnToSchema } from '#shared/schemas/navigation'

const route = useRoute()
const destination = loginReturnToSchema.safeParse(route.query.returnTo)
await navigateTo(
  { path: '/login', query: destination.success ? { returnTo: destination.data } : {} },
  { redirectCode: 302, replace: true },
)
</script>

<template>
  <p>Mengalihkan ke login Editor...</p>
</template>
