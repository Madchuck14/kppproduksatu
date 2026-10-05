<script setup lang="ts">
import type { Product } from '#shared/types/product'

defineProps<{ product: Product }>()
</script>

<template>
  <NuxtLink :to="`/products/${product.slug}`" class="group block rounded-xl border border-stone-200 bg-white p-5 transition hover:border-emerald-700 focus-visible:outline-2 focus-visible:outline-emerald-700">
    <div class="mb-5 flex aspect-[4/3] items-center justify-center rounded-lg bg-stone-100">
      <img :src="product.imageUrl" :alt="product.title" width="200" height="240" loading="lazy" class="h-48 max-w-full object-contain transition group-hover:-translate-y-1">
    </div>
    <p class="mb-2 text-xs font-medium uppercase tracking-widest text-emerald-700">{{ product.category }}</p>
    <h2 class="text-lg font-semibold">{{ product.title }}</h2>
    <p class="mt-1 text-sm text-stone-500">{{ product.author }}</p>
    <p class="mt-4 font-semibold">{{ formatPrice(product.price) }}</p>
  </NuxtLink>
</template>
