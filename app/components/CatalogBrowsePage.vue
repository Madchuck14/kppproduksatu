<script setup lang="ts">
import { bookDivisions } from '#shared/utils/book-divisions'

const props = defineProps<{ kind: 'level' | 'division' }>()
const route = useRoute()
const config = useRuntimeConfig()
const title = props.kind === 'level' ? 'Jenjang' : 'Divisi'
const path = props.kind === 'level' ? '/jenjang' : '/divisi'
const parameter = props.kind === 'level' ? 'level' : 'division'
const levels = [
  { code: 'SD', name: 'Buku SD', icon: 'i-lucide-pi' },
  { code: 'SMP', name: 'Buku SMP', icon: 'i-lucide-pencil' },
  { code: 'SMA', name: 'Buku SMA', icon: 'i-lucide-globe-2' },
  { code: 'SMK', name: 'Buku SMK', icon: 'i-lucide-code-xml' },
]
const items = props.kind === 'level' ? levels : bookDivisions
const selection = computed(() => {
  const value = route.query[parameter]
  return items.some((item) => item.code === value) ? String(value) : ''
})
const { data, error, status, refresh } = await useFetch('/api/catalog/browse', {
  query: { kind: props.kind },
})
const shelves = computed(() =>
  items.filter((item) => !selection.value || item.code === selection.value),
)
function group(code: string) {
  return data.value?.groups.find((item) => item.code === code)
}
useSeoMeta({
  title: `${title} Buku | ${config.public.siteName}`,
  description: `Jelajahi koleksi dan buku yang paling sering diakses berdasarkan ${title.toLowerCase()}.`,
})
</script>

<template>
  <div class="browse-page">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <NuxtLink to="/">Beranda</NuxtLink><span aria-hidden="true">/</span>
      <span aria-current="page">{{ title }}</span>
    </nav>
    <h1>{{ title }}</h1>
    <div :class="['group-grid', { 'division-grid': kind === 'division' }]">
      <NuxtLink
        v-for="(item, index) in items"
        :key="item.code"
        :to="{ path, query: { [parameter]: item.code } }"
        :class="['group-card', `color-${index}`, { selected: selection === item.code }]"
        :aria-current="selection === item.code ? 'true' : undefined"
      >
        <span class="decoration" aria-hidden="true" />
        <span class="group-icon"><UIcon :name="item.icon" aria-hidden="true" /></span>
        <h2>{{ item.name }}</h2>
        <span>{{ group(item.code) ? `${group(item.code)!.total} buku` : 'Jelajahi buku' }}</span>
      </NuxtLink>
    </div>
    <div class="collection-heading">
      <h2>Buku Paling Sering Diakses</h2>
      <NuxtLink v-if="selection" :to="path">Lihat semua {{ title.toLowerCase() }}</NuxtLink>
    </div>
    <p v-if="data?.source === 'demo'" class="note">Mode contoh. Statistik akses tidak dicatat.</p>
    <div v-if="error" class="message" role="alert">
      <p>Koleksi buku belum dapat dimuat. Silakan coba lagi.</p>
      <UButton class="mt-4" variant="outline" @click="refresh()">Coba lagi</UButton>
    </div>
    <p v-else-if="status === 'pending'" class="message" role="status">Memuat koleksi buku...</p>
    <template v-else>
      <section
        v-for="item in shelves"
        :key="item.code"
        class="book-shelf"
        :aria-labelledby="`shelf-${item.code}`"
      >
        <div class="shelf-heading">
          <h3 :id="`shelf-${item.code}`">{{ item.name }}</h3>
          <NuxtLink :to="{ path: '/products', query: { [parameter]: item.code } }"
            >Lihat semua buku <span aria-hidden="true">→</span></NuxtLink
          >
        </div>
        <div v-if="group(item.code)?.products.length" class="book-grid">
          <ProductCard
            v-for="book in group(item.code)!.products"
            :key="book.id"
            :product="book"
            variant="landing"
          />
        </div>
        <p v-else class="message">
          {{
            group(item.code)?.total
              ? 'Belum ada akses buku yang tercatat untuk koleksi ini.'
              : 'Belum ada buku yang tersedia untuk koleksi ini.'
          }}
        </p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.browse-page {
  padding-top: 32px;
  color: #242b26;
}
.breadcrumb {
  display: flex;
  gap: 8px;
  color: #797e79;
  font-size: 14px;
}
h1 {
  margin: 54px 0 28px;
  font: 500 44px/1.2 var(--font-landing-serif);
}
.group-grid,
.book-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 24px;
}
.division-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.group-card {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: end;
  min-height: 220px;
  overflow: hidden;
  padding: 26px;
  border-radius: 28px;
  background: var(--card-bg);
  color: var(--card-fg);
  transition: transform 180ms ease;
}
.group-card:hover {
  transform: translateY(-3px);
}
.group-card:focus-visible,
.group-card.selected {
  outline: 2px solid currentColor;
  outline-offset: 4px;
}
.group-card h2 {
  position: relative;
  font-size: 24px;
  font-weight: 600;
  line-height: 1.3;
}
.group-card > span:last-child {
  position: relative;
  margin-top: 3px;
  font-size: 14px;
}
.group-icon {
  position: absolute;
  top: 20px;
  right: 20px;
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: #ffffffb3;
  font-size: 24px;
}
.decoration {
  position: absolute;
  top: -36px;
  left: -30px;
  width: 115px;
  height: 115px;
  border-radius: 50%;
  background: var(--shape);
}
.color-0 {
  --card-bg: #fde3d8;
  --card-fg: #a9401f;
  --shape: #f8c3ac;
}
.color-1 {
  --card-bg: #fbe0e2;
  --card-fg: #96383c;
  --shape: #f1bdc1;
}
.color-2 {
  --card-bg: #dcefe5;
  --card-fg: #25694d;
  --shape: #b4dac6;
}
.color-3 {
  --card-bg: #e4e2fa;
  --card-fg: #493d9a;
  --shape: #c3bef2;
}
.color-4 {
  --card-bg: #fff0f2;
  --card-fg: #994456;
  --shape: #f9dfe4;
}
.color-5 {
  --card-bg: #f5f2e7;
  --card-fg: #756022;
  --shape: #eee7cf;
}
.color-1 .decoration {
  inset: auto -30px -40px auto;
}
.color-2 .decoration {
  inset: auto auto -45px -35px;
}
.color-3 .decoration {
  inset: -40px -24px auto auto;
  width: 145px;
  height: 145px;
}
.collection-heading,
.shelf-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}
.collection-heading {
  margin: 64px 0 32px;
}
.collection-heading h2 {
  font: 500 30px/1.3 var(--font-landing-serif);
}
.collection-heading a,
.shelf-heading a {
  font-size: 14px;
  color: #2f6b4f;
}
a:hover {
  text-decoration: underline;
  text-underline-offset: 4px;
}
.book-shelf {
  margin-top: 32px;
}
.shelf-heading {
  margin-bottom: 20px;
}
.shelf-heading h3 {
  font: 500 24px/1.3 var(--font-landing-serif);
}
.message {
  padding: 24px;
  border: 1px solid #dce8e0;
  border-radius: 16px;
  color: #687169;
}
.note {
  color: #687169;
  font-size: 14px;
}
@media (max-width: 1000px) {
  .group-grid,
  .book-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 600px) {
  h1 {
    margin-top: 32px;
    font-size: 36px;
  }
  .group-grid {
    gap: 14px;
  }
  .group-card {
    min-height: 180px;
    padding: 18px;
    border-radius: 22px;
  }
  .group-card h2 {
    font-size: 20px;
  }
  .collection-heading,
  .shelf-heading {
    align-items: start;
    flex-direction: column;
    gap: 10px;
  }
  .collection-heading h2 {
    font-size: 26px;
  }
  .book-grid {
    gap: 16px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .group-card {
    transition: none;
  }
  .group-card:hover {
    transform: none;
  }
}
</style>
