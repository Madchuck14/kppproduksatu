<script setup lang="ts">
const config = useRuntimeConfig()
useSeoMeta({
  title: `Beranda | ${config.public.siteName}`,
  description: 'Jelajahi koleksi buku dan temukan inspirasi untuk bacaan berikutnya.',
})
const { data, error } = await useFetch('/api/products', { query: { featured: 'true' } })
</script>

<template>
  <div>
    <section class="mb-14 grid gap-8 rounded-2xl bg-[#e6ede5] p-8 md:grid-cols-[1.5fr_1fr] md:p-14">
      <div>
        <p class="mb-5 text-xs font-semibold uppercase tracking-[0.25em] text-emerald-800">Koleksi pilihan</p>
        <h1 class="display-heading max-w-xl text-5xl leading-tight md:text-6xl">Buka halaman.<br>Temukan inspirasi.</h1>
        <p class="mt-6 max-w-md leading-relaxed text-stone-600">Jelajahi buku pilihan untuk menemani rasa ingin tahu dan setiap langkah perjalananmu.</p>
        <UButton to="/products" size="lg" class="mt-8">Jelajahi katalog</UButton>
      </div>
      <div class="flex items-center justify-center" aria-hidden="true">
        <img src="/images/book-placeholder.svg" alt="" width="220" height="280" class="w-48 -rotate-6 drop-shadow-xl md:w-56">
      </div>
    </section>
    <section aria-labelledby="featured-title">
      <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h2 id="featured-title" class="display-heading text-3xl">Pilihan untukmu</h2>
        <NuxtLink to="/products" class="text-sm font-medium text-emerald-800">Lihat semua produk →</NuxtLink>
      </div>
      <p v-if="error" role="alert" class="text-red-700">Katalog belum dapat dimuat. Coba lagi nanti.</p>
      <div v-else class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <ProductCard v-for="product in data?.products" :key="product.id" :product="product" />
      </div>
      <p v-if="data && !data.products.length" class="text-stone-500">Belum ada produk unggulan.</p>
    </section>
  </div>
</template>
