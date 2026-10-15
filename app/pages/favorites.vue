<script setup lang="ts">
import { educationLevelSchema } from '#shared/schemas/auth'
import type { FavoriteList } from '#shared/types/favorite'

const config = useRuntimeConfig()
useSeoMeta({ title: `Favorit | ${config.public.siteName}`, robots: 'noindex, nofollow' })
const user = useSupabaseUser()
const route = useRoute()
const loginDestination = computed(() => ({
  path: '/login',
  query: { returnTo: route.fullPath },
}))
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
  <section class="favorites-page">
    <nav class="favorites-breadcrumb" aria-label="Breadcrumb">
      <NuxtLink to="/">Beranda</NuxtLink><span aria-hidden="true">/</span>
      <span aria-current="page">Favorit</span>
    </nav>
    <h1>Buku Favorit</h1>
    <div v-if="!user" class="favorites-login-banner">
      <p>Masuk untuk menyimpan favorit di semua perangkat.</p>
      <NuxtLink :to="loginDestination">
        Masuk <UIcon name="i-lucide-arrow-right" aria-hidden="true" />
      </NuxtLink>
    </div>
    <template v-if="user">
      <form
        v-if="visible?.total || appliedSearch || appliedLevel"
        class="favorites-filters"
        role="search"
        aria-label="Cari buku favorit"
        @submit.prevent="searchFavorites"
      >
        <label for="favorites-search" class="sr-only">Cari judul, kode buku, atau penulis</label>
        <input
          id="favorites-search"
          v-model="search"
          type="search"
          maxlength="100"
          placeholder="Cari judul, kode buku, atau penulis..."
        />
        <label for="favorites-level" class="sr-only">Jenjang pendidikan</label>
        <select id="favorites-level" v-model="level">
          <option value="">Semua jenjang</option>
          <option v-for="item in educationLevelSchema.options" :key="item" :value="item">
            {{ item }}
          </option>
        </select>
        <UButton type="submit" class="favorites-primary" :loading="status === 'pending'"
          >Cari</UButton
        >
      </form>
      <div v-if="error" role="alert" class="favorites-error">
        <p class="text-red-700">
          Favorit belum dapat dimuat. Pastikan sesi login masih aktif, lalu coba lagi.
        </p>
        <UButton variant="outline" class="mt-4" @click="refresh()">Coba lagi</UButton>
        <NuxtLink :to="loginDestination" class="ml-4 text-sm text-emerald-800 underline"
          >Login kembali</NuxtLink
        >
      </div>
      <p v-else-if="status === 'pending'" role="status" class="py-10 text-stone-600">
        Memuat favorit...
      </p>
      <template v-else-if="visible">
        <p v-if="visible.total" class="favorites-count" role="status">
          {{ visible.total }} buku favorit{{
            appliedSearch || appliedLevel ? ' sesuai pencarian' : ''
          }}
        </p>
        <div v-if="visible.products.length" class="favorites-grid">
          <ProductCard
            v-for="product in visible.products"
            :key="product.id"
            :product="product"
            variant="catalog"
          />
        </div>
        <div v-else-if="appliedSearch || appliedLevel" class="favorites-empty">
          <h2>Tidak ada favorit yang sesuai pencarian</h2>
          <p>Coba kata pencarian atau jenjang lain untuk menemukan buku favorit Anda.</p>
          <NuxtLink to="/favorites" class="favorites-primary">Hapus semua filter</NuxtLink>
        </div>
        <nav v-if="pages > 1" aria-label="Halaman favorit" class="favorites-pagination">
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
    <div
      v-if="
        !user ||
        (!error && status === 'success' && visible?.total === 0 && !appliedSearch && !appliedLevel)
      "
      class="favorites-empty"
    >
      <h2>Belum ada buku favorit</h2>
      <p>Tekan ikon hati pada sampul buku untuk menyimpannya di sini.</p>
      <NuxtLink to="/products" class="favorites-primary">Jelajahi Katalog</NuxtLink>
    </div>
  </section>
</template>

<style scoped>
.favorites-page {
  min-height: 550px;
  padding-top: 24px;
  color: #222;
}
.favorites-breadcrumb {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  color: #6b6f6b;
  font-size: 13px;
  line-height: 21px;
}
h1 {
  margin: 48px 0 22px;
  font: 500 38px/1.2 var(--font-landing-serif);
}
.favorites-login-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  padding: 14px 18px;
  border-radius: 14px;
  background: #f4f8f5;
  font-size: 15px;
  line-height: 24px;
}
.favorites-login-banner a {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #1f5c3f;
  font-weight: 500;
}
.favorites-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 32px 26px;
}
.favorites-grid :deep(.book-details h2) {
  font-size: 20px;
  line-height: 24px;
}
.favorites-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 18px;
}
.favorites-filters input,
.favorites-filters select {
  min-height: 44px;
  min-width: 0;
  padding: 10px 14px;
  border: 1px solid #d6dcd7;
  border-radius: 12px;
  background: white;
  font-size: 14px;
}
.favorites-filters input {
  flex: 1 1 280px;
}
.favorites-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 9px 22px;
  border: 1px solid #1f5c3f;
  border-radius: 12px;
  color: white;
  background: #1f5c3f;
  font-size: 15px;
  font-weight: 500;
  line-height: 24px;
}
.favorites-primary:hover {
  background: #17462f;
}
.favorites-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 15px;
  padding: 72px 0;
  text-align: center;
}
.favorites-empty h2 {
  font: 500 26px/1.2 var(--font-landing-serif);
}
.favorites-empty p {
  margin-bottom: 18px;
  color: #6b6f6b;
  font-size: 15px;
  line-height: 24px;
}
.favorites-count {
  margin-bottom: 18px;
  color: #6b6f6b;
  font-size: 13px;
}
.favorites-error {
  padding: 24px;
  border: 1px solid #efcccc;
  border-radius: 14px;
}
.favorites-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 32px;
}
.favorites-page a:focus-visible,
.favorites-page input:focus-visible,
.favorites-page select:focus-visible,
.favorites-page button:focus-visible {
  outline: 2px solid #1f5c3f;
  outline-offset: 3px;
}
@media (max-width: 1000px) {
  .favorites-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 600px) {
  h1 {
    margin-top: 32px;
    font-size: 32px;
  }
  .favorites-grid {
    gap: 28px 16px;
  }
  .favorites-grid :deep(.book-details h2) {
    font-size: 17px;
    line-height: 22px;
  }
  .favorites-empty {
    padding: 56px 0;
  }
  .favorites-filters select {
    flex: 1;
    min-width: 160px;
  }
  .favorites-filters input {
    flex-basis: 100%;
  }
}
</style>
