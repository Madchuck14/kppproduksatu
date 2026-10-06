<script setup lang="ts">
import type { Product } from '#shared/types/product'

withDefaults(defineProps<{ product: Product; variant?: 'default' | 'landing' }>(), {
  variant: 'default',
})
</script>

<template>
  <NuxtLink
    :to="`/products/${product.slug}`"
    :class="{ 'landing-book': variant === 'landing' }"
    class="group block rounded-xl border border-stone-200 bg-white p-5 transition hover:border-emerald-700 focus-visible:outline-2 focus-visible:outline-emerald-700"
  >
    <div class="mb-5 flex aspect-[4/3] items-center justify-center rounded-lg bg-stone-100">
      <img
        :src="product.imageUrl"
        :alt="product.title"
        width="200"
        height="240"
        loading="lazy"
        class="h-48 max-w-full object-contain transition group-hover:-translate-y-1"
      />
    </div>
    <p v-if="variant === 'landing'" class="book-level">
      {{ product.educationLevel || 'Buku Erlangga' }}
    </p>
    <h2 class="text-lg font-semibold">{{ product.title }}</h2>
    <p class="mt-1 text-sm text-stone-500">{{ product.author }}</p>
    <p class="mt-4 font-semibold">{{ formatPrice(product.price) }}</p>
  </NuxtLink>
</template>

<style scoped>
.landing-book {
  border: 0;
  border-radius: 0;
  padding: 0;
  background: transparent;
}
.landing-book > div {
  height: 302px;
  aspect-ratio: auto;
  border-radius: 0;
  background: #f6f5f0;
  margin-bottom: 16px;
  padding: 28px;
}
.landing-book img {
  height: 244px;
  width: auto;
  max-width: 100%;
  object-fit: contain;
  filter: drop-shadow(5px 8px 7px #242b261c);
}
.landing-book h2 {
  font:
    21px/1.3 Georgia,
    'Times New Roman',
    serif;
  color: #242b26;
}
.landing-book .book-level {
  font-size: 9px;
  text-transform: uppercase;
  color: #687169;
  margin-bottom: 7px;
}
.landing-book h2 + p {
  font-size: 12px;
  color: #687169;
  margin-top: 7px;
}
.landing-book > p:last-child {
  font-size: 13px;
  margin-top: 8px;
  color: #344e41;
}
@media (max-width: 700px) {
  .landing-book > div {
    height: 220px;
    padding: 20px;
  }
  .landing-book img {
    height: 180px;
  }
  .landing-book h2 {
    font-size: 18px;
  }
}
</style>
