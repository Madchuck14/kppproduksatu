<script setup lang="ts">
const config = useRuntimeConfig()
useSeoMeta({
  title: `Katalog Buku Erlangga | ${config.public.siteName}`,
  description: 'Jelajahi katalog buku Erlangga untuk mendukung presentasi produk kepada pelanggan.',
})
const search = ref('')
const { data, error, status, refresh } = await useFetch('/api/products', {
  query: { featured: 'true' },
})
const educationLevels = [
  {
    code: 'SD',
    name: 'Sekolah Dasar',
    description: 'Awal perjalanan belajar.',
    color: 'bg-red-50 text-red-800',
  },
  {
    code: 'SMP',
    name: 'Sekolah Menengah Pertama',
    description: 'Mengembangkan pengetahuan.',
    color: 'bg-blue-50 text-blue-800',
  },
  {
    code: 'SMA',
    name: 'Sekolah Menengah Atas',
    description: 'Memperdalam pemahaman.',
    color: 'bg-amber-50 text-amber-800',
  },
  {
    code: 'SMK',
    name: 'Sekolah Menengah Kejuruan',
    description: 'Mempersiapkan keterampilan.',
    color: 'bg-emerald-50 text-emerald-800',
  },
]

async function searchCatalog() {
  const q = search.value.trim()
  await navigateTo({ path: '/products', query: q ? { q } : {} })
}
</script>

<template>
  <div class="space-y-14 md:space-y-20">
    <section
      aria-labelledby="landing-title"
      class="grid items-center gap-10 rounded-3xl bg-[#e6ede5] px-6 py-10 sm:px-10 md:grid-cols-[1.5fr_1fr] md:p-14"
    >
      <div>
        <p class="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800">
          Katalog buku Erlangga
        </p>
        <h1
          id="landing-title"
          class="display-heading max-w-xl text-4xl leading-tight sm:text-5xl md:text-6xl"
        >
          Temukan buku.<br />Dukung setiap langkah belajar.
        </h1>
        <p class="mt-5 max-w-lg leading-relaxed text-stone-600">
          Jelajahi informasi buku dalam satu tempat untuk membantu Anda memperkenalkan produk kepada
          pelanggan.
        </p>
        <form class="mt-8" @submit.prevent="searchCatalog">
          <label for="landing-search" class="mb-2 block text-sm font-semibold"
            >Buku apa yang Anda cari?</label
          >
          <div class="flex max-w-xl flex-col gap-2 rounded-xl bg-white p-2 shadow-sm sm:flex-row">
            <input
              id="landing-search"
              v-model="search"
              name="q"
              type="search"
              maxlength="100"
              placeholder="Masukkan judul atau kode buku"
              class="min-w-0 flex-1 rounded-lg px-3 py-3 text-base outline-offset-2 focus-visible:outline-2 focus-visible:outline-emerald-700"
            />
            <UButton type="submit" size="lg" class="justify-center">Cari buku</UButton>
          </div>
        </form>
        <NuxtLink
          to="/products"
          class="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 underline-offset-4 hover:underline"
          >Jelajahi semua buku <span aria-hidden="true">&rarr;</span></NuxtLink
        >
      </div>
      <div class="hidden items-center justify-center md:flex" aria-hidden="true">
        <div class="relative flex h-80 w-72 items-center justify-center rounded-full bg-white/45">
          <img
            src="/images/book-placeholder.svg"
            alt=""
            width="220"
            height="280"
            class="w-52 -rotate-6 drop-shadow-xl"
          />
          <span
            class="absolute -bottom-2 right-0 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-emerald-800 shadow-sm"
            >Informasi buku dalam satu tempat</span
          >
        </div>
      </div>
    </section>
    <section aria-labelledby="education-title" aria-describedby="education-description">
      <p class="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800">
        Jenjang pendidikan
      </p>
      <h2 id="education-title" class="display-heading text-3xl sm:text-4xl">
        Untuk setiap tahap belajar
      </h2>
      <p id="education-description" class="mt-3 max-w-2xl text-sm leading-relaxed text-stone-600">
        Pilih jenjang untuk menemukan buku yang sesuai dengan kebutuhan belajar.
      </p>
      <ul class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <li
          v-for="level in educationLevels"
          :key="level.code"
          class="rounded-2xl border border-stone-200 bg-white p-6"
        >
          <span :class="['inline-flex rounded-lg px-3 py-2 text-lg font-bold', level.color]">{{
            level.code
          }}</span>
          <h3 class="mt-5 font-semibold">{{ level.name }}</h3>
          <p class="mt-2 text-sm text-stone-600">{{ level.description }}</p>
          <NuxtLink
            :to="{ path: '/products', query: { level: level.code } }"
            class="mt-5 inline-block text-sm font-semibold text-emerald-800 hover:underline"
            >Lihat buku {{ level.code }} →</NuxtLink
          >
        </li>
      </ul>
    </section>
    <section aria-labelledby="featured-title" :aria-busy="status === 'pending'">
      <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800">
            Jelajahi koleksi
          </p>
          <h2 id="featured-title" class="display-heading text-3xl sm:text-4xl">Buku pilihan</h2>
          <p class="mt-3 text-sm text-stone-600">
            Lihat sampul, informasi buku, dan harga melalui halaman detail.
          </p>
        </div>
        <NuxtLink
          to="/products"
          class="text-sm font-semibold text-emerald-800 underline-offset-4 hover:underline"
          >Lihat semua buku <span aria-hidden="true">&rarr;</span></NuxtLink
        >
      </div>
      <p
        v-if="data?.source === 'demo'"
        class="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      >
        Buku dan harga yang ditampilkan adalah data contoh.
      </p>
      <div v-if="error" role="alert" class="rounded-xl border border-red-200 bg-red-50 p-6">
        <p class="text-red-800">Katalog belum dapat dimuat. Silakan coba lagi.</p>
        <UButton class="mt-4" color="neutral" variant="outline" @click="refresh()"
          >Coba lagi</UButton
        >
      </div>
      <p v-else-if="status === 'pending'" role="status" class="py-10 text-stone-600">
        Memuat buku pilihan...
      </p>
      <div v-else-if="data?.products.length" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <ProductCard v-for="product in data.products" :key="product.id" :product="product" />
      </div>
      <div v-else class="rounded-xl border border-dashed border-stone-300 p-8 text-center">
        <p class="text-stone-600">Belum ada buku pilihan yang tersedia.</p>
        <UButton to="/products" class="mt-4" variant="outline">Buka katalog umum</UButton>
      </div>
    </section>
    <section
      aria-labelledby="browse-title"
      class="flex flex-wrap items-center justify-between gap-6 rounded-2xl bg-emerald-900 p-7 text-white sm:p-10"
    >
      <div>
        <h2 id="browse-title" class="display-heading text-3xl">Siapkan presentasi produk Anda.</h2>
        <p class="mt-3 max-w-xl text-sm leading-relaxed text-emerald-100">
          Katalog dapat diakses tanpa login. Temukan buku dan buka detailnya untuk melihat informasi
          produk.
        </p>
      </div>
      <UButton to="/products" color="neutral" size="lg">Buka katalog</UButton>
    </section>
  </div>
</template>
