<script setup lang="ts">
import { educationLevelSchema } from '#shared/schemas/auth'
import type { FavoriteList } from '#shared/types/favorite'

const config = useRuntimeConfig()
useSeoMeta({ title: `Favorit | ${config.public.siteName}`, robots: 'noindex, nofollow' })
const user = useSupabaseUser()
const route = useRoute()
const ownerId = computed(() => user.value?.sub ?? null)
const appliedSearch = computed(() =>
  typeof route.query.q === 'string' ? route.query.q.trim().slice(0, 100) : '',
)
const appliedLevel = computed(() => {
  const parsed = educationLevelSchema.safeParse(route.query.level)
  return parsed.success ? parsed.data : ''
})
const page = computed(() => {
  const raw = typeof route.query.page === 'string' ? Number(route.query.page) : 1
  return Number.isInteger(raw) && raw > 0 && raw <= 100000 ? raw : 1
})
const search = ref(appliedSearch.value)
const level = ref(appliedLevel.value)
watch(appliedSearch, (value) => {
  search.value = value
})
watch(appliedLevel, (value) => {
  level.value = value
})
const requestFetch = useRequestFetch()
const { data, error, status, refresh } = await useAsyncData(
  'favorites-list',
  async () => {
    if (!ownerId.value) return null
    return requestFetch<FavoriteList>('/api/favorites', {
      query: { q: appliedSearch.value, level: appliedLevel.value || undefined, page: page.value },
    })
  },
  { watch: [ownerId, appliedSearch, appliedLevel, page] },
)
const visible = computed(() => (data.value?.ownerId === ownerId.value ? data.value : null))
const pages = computed(() =>
  Math.ceil((visible.value?.total ?? 0) / (visible.value?.pageSize ?? 24)),
)
function destination(targetPage = 1) {
  return {
    path: '/favorites',
    query: {
      ...(appliedSearch.value ? { q: appliedSearch.value } : {}),
      ...(appliedLevel.value ? { level: appliedLevel.value } : {}),
      ...(targetPage > 1 ? { page: targetPage } : {}),
    },
  }
}
async function searchFavorites() {
  await navigateTo({
    path: '/favorites',
    query: {
      ...(search.value.trim() ? { q: search.value.trim() } : {}),
      ...(level.value ? { level: level.value } : {}),
    },
  })
}
// Removing the final item on a page returns to the last available page.
watch([visible, status], async () => {
  if (
    !error.value &&
    status.value === 'success' &&
    visible.value &&
    page.value > Math.max(1, pages.value)
  )
    await navigateTo(destination(Math.max(1, pages.value)), { replace: true })
})
</script>

<template>
  <section>
    <p class="mb-3 text-xs font-medium uppercase tracking-widest text-emerald-800">
      Koleksi pribadi
    </p>
    <h1 class="display-heading text-5xl">Buku favorit</h1>
    <p class="mt-4 mb-8 text-stone-600">
      Simpan buku yang sedang Anda tawarkan agar mudah ditemukan saat presentasi.
    </p>
    <div v-if="!user" class="rounded-xl border border-stone-200 bg-white p-6">
      <h2 class="text-xl font-semibold">Login untuk membuka favorit Anda</h2>
      <p class="mt-3 text-stone-600">
        Favorit tersimpan di akun Anda dan dapat dibuka dari perangkat lain. Tersedia untuk semua
        akun, termasuk Sales dan Editor.
      </p>
      <UButton :to="{ path: '/login', query: { returnTo: '/favorites' } }" class="mt-5"
        >Login</UButton
      >
    </div>
    <template v-else>
      <form class="mb-8 flex max-w-3xl flex-wrap gap-3" @submit.prevent="searchFavorites">
        <label for="favorites-search" class="sr-only">Cari judul, kode buku, atau penulis</label>
        <input
          id="favorites-search"
          v-model="search"
          type="search"
          maxlength="100"
          placeholder="Cari judul, kode buku, atau penulis..."
          class="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-4 py-3"
        />
        <label for="favorites-level" class="sr-only">Jenjang pendidikan</label>
        <select
          id="favorites-level"
          v-model="level"
          class="rounded-lg border border-stone-300 bg-white px-4 py-3"
        >
          <option value="">Semua jenjang</option>
          <option v-for="item in educationLevelSchema.options" :key="item" :value="item">
            {{ item }}
          </option>
        </select>
        <UButton type="submit" :loading="status === 'pending'">Cari</UButton>
      </form>
      <div v-if="error" role="alert" class="rounded-xl border border-red-200 p-6">
        <p class="text-red-700">
          Favorit belum dapat dimuat. Pastikan sesi login masih aktif, lalu coba lagi.
        </p>
        <UButton variant="outline" class="mt-4" @click="refresh()">Coba lagi</UButton>
        <NuxtLink
          :to="{ path: '/login', query: { returnTo: '/favorites' } }"
          class="ml-4 text-sm text-emerald-800 underline"
          >Login kembali</NuxtLink
        >
      </div>
      <p v-else-if="status === 'pending'" role="status" class="py-10 text-stone-600">
        Memuat favorit...
      </p>
      <template v-else-if="visible">
        <p class="mb-5 text-sm text-stone-500">
          {{ visible.total }} buku favorit{{
            appliedSearch || appliedLevel ? ' sesuai pencarian' : ''
          }}
        </p>
        <div v-if="visible.products.length" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <ProductCard v-for="product in visible.products" :key="product.id" :product="product" />
        </div>
        <div v-else class="rounded-xl border border-stone-200 p-6">
          <p>
            {{
              appliedSearch || appliedLevel
                ? 'Tidak ada favorit yang sesuai pencarian.'
                : 'Belum ada buku favorit. Tambahkan buku melalui tombol Favorit di katalog.'
            }}
          </p>
          <UButton to="/products" class="mt-5">Jelajahi katalog</UButton>
        </div>
        <nav
          v-if="pages > 1"
          aria-label="Halaman favorit"
          class="mt-8 flex items-center justify-between gap-4"
        >
          <UButton v-if="page > 1" :to="destination(page - 1)" variant="outline"
            >Sebelumnya</UButton
          >
          <span class="text-sm">Halaman {{ page }} dari {{ pages }}</span>
          <UButton v-if="page < pages" :to="destination(page + 1)" variant="outline"
            >Berikutnya</UButton
          >
        </nav>
      </template>
    </template>
  </section>
</template>
