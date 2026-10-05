<script setup lang="ts">
const config = useRuntimeConfig()
useSeoMeta({ title: `Katalog | ${config.public.siteName}`, description: 'Jelajahi seluruh koleksi produk kami.' })
const search = ref('')
const appliedSearch = ref('')
const { data, error, status } = await useFetch('/api/products', {
  query: computed(() => ({ q: appliedSearch.value })),
})
</script>

<template>
  <section>
    <p class="mb-3 text-xs font-medium uppercase tracking-widest text-emerald-800">Koleksi kami</p>
    <h1 class="display-heading mb-8 text-5xl">Katalog produk</h1>
    <form class="mb-8 flex max-w-lg gap-3" @submit.prevent="appliedSearch = search.trim()">
      <label for="catalog-search" class="sr-only">Cari judul atau penulis</label>
      <input id="catalog-search" v-model="search" maxlength="100" type="search" placeholder="Cari judul atau penulis..." class="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-4 py-3">
      <UButton type="submit" :loading="status === 'pending'">Cari</UButton>
    </form>
    <p v-if="error" role="alert" class="text-red-700">Katalog belum dapat dimuat. Coba lagi nanti.</p>
    <div v-else class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <ProductCard v-for="product in data?.products" :key="product.id" :product="product" />
    </div>
    <p v-if="data && !data.products.length" class="py-10 text-stone-500">Tidak ada produk yang sesuai dengan pencarianmu.</p>
  </section>
</template>
