<script setup lang="ts">
const {
  divisions,
  error: classificationError,
  refresh: refreshClassifications,
} = await useClassifications()

const props = defineProps<{ kind: 'level' | 'division' }>()
const route = useRoute()
const config = useRuntimeConfig()
const title = props.kind === 'level' ? 'Jenjang' : 'Divisi'
const path = props.kind === 'level' ? '/jenjang' : '/divisi'
const parameter = props.kind === 'level' ? 'level' : 'division'
const levels = [
  { code: 'SD', name: 'Buku SD', icon: 'i-lucide-school' },
  { code: 'SMP', name: 'Buku SMP', icon: 'i-lucide-school' },
  { code: 'SMA', name: 'Buku SMA', icon: 'i-lucide-school' },
  { code: 'SMK', name: 'Buku SMK', icon: 'i-lucide-school' },
]
const items = computed(() => (props.kind === 'level' ? levels : divisions.value))
const selection = computed(() => {
  const value = route.query[parameter]
  return items.value.some((item) => item.code === value) ? String(value) : ''
})
const { data, error, status, refresh } = await useFetch('/api/catalog/browse', {
  query: { kind: props.kind },
})
const shelves = computed(() =>
  items.value.filter((item) => !selection.value || item.code === selection.value),
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
    <div v-if="kind === 'division' && classificationError" class="message" role="alert">
      <p>Daftar divisi belum dapat dimuat.</p>
      <UButton variant="outline" @click="refreshClassifications()">Coba lagi</UButton>
    </div>
    <div :class="['group-grid', { 'division-grid': kind === 'division' }]">
      <NuxtLink
        v-for="(item, index) in items"
        :key="item.code"
        :to="{ path, query: { [parameter]: item.code } }"
        :class="[
          'group-card',
          'style' in item ? [item.style, 'division-card'] : `level-${item.code.toLowerCase()}`,
          { selected: selection === item.code },
        ]"
        :aria-current="selection === item.code ? 'true' : undefined"
      >
        <span v-if="kind === 'level'" class="decoration" aria-hidden="true" />
        <span v-else class="division-number" aria-hidden="true">
          {{ String(index + 1).padStart(2, '0') }}
        </span>
        <span class="group-icon"><UIcon :name="item.icon" aria-hidden="true" /></span>
        <h2>{{ item.name }}</h2>
        <span class="group-caption">{{
          group(item.code) ? `${group(item.code)!.total} buku` : 'Jelajahi buku'
        }}</span>
        <span v-if="kind === 'division'" class="division-accent" aria-hidden="true" />
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
  gap: 18px;
}
.group-card {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: end;
  min-height: 180px;
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
.group-caption {
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
  color: inherit;
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
.level-sd {
  --card-bg: #fde3d8;
  --card-fg: #a9401f;
  --shape: #f8c3ac;
}
.level-smp {
  --card-bg: #dfeafb;
  --card-fg: #285a9e;
  --shape: #bbd1f5;
}
.level-sma {
  --card-bg: #b8c3d1;
  --card-fg: #39485b;
  --shape: #96a6ba;
}
.level-smk {
  --card-bg: #8f9cac;
  --card-fg: #263445;
  --shape: #718196;
}
.level-smp .decoration {
  inset: auto -30px -44px auto;
}
.level-sma .decoration {
  inset: auto auto -50px -40px;
}
.level-smk .decoration {
  inset: -40px -24px auto auto;
  width: 150px;
  height: 150px;
}
.division-card {
  flex-direction: row;
  align-items: center;
  justify-content: initial;
  min-height: 142px;
  padding: 24px;
  border: 1px solid var(--division-border);
  border-radius: 18px 36px 18px 18px;
  background: var(--division-bg);
  color: var(--division-fg);
  isolation: isolate;
}
.division-card h2 {
  position: relative;
  z-index: 1;
  max-width: calc(100% - 76px);
  font: 600 22px/1.2 var(--font-landing-serif);
}
.division-card .group-caption {
  position: absolute;
  bottom: 15px;
  left: 24px;
  z-index: 1;
  margin: 0;
  font-size: 12px;
}
.division-number {
  position: absolute;
  top: 16px;
  left: 20px;
  color: var(--division-fg);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  opacity: 0.66;
}
.division-card .group-icon {
  top: auto;
  right: 20px;
  bottom: 18px;
  width: 52px;
  height: 52px;
  border: 1px solid var(--division-border);
  border-radius: 16px;
  background: var(--division-icon-bg);
}
.division-accent {
  position: absolute;
  z-index: -1;
  top: -36px;
  right: -23px;
  width: 116px;
  height: 116px;
  transform: rotate(24deg);
  border: 1px solid var(--division-border);
  border-radius: 40% 60% 55% 45%;
  background: var(--division-shape);
}
.division-mipa {
  --division-bg: #fff4e9;
  --division-fg: #89461f;
  --division-border: #f1d6bd;
  --division-icon-bg: #ffe8d3;
  --division-shape: #f9e4d0;
}
.division-ips {
  --division-bg: #edf5ff;
  --division-fg: #315d91;
  --division-border: #d3e2f5;
  --division-icon-bg: #e1edfc;
  --division-shape: #dceafd;
}
.division-secondary {
  --division-bg: #f3efff;
  --division-fg: #5b478d;
  --division-border: #dfd5f4;
  --division-icon-bg: #eae3fb;
  --division-shape: #e5dcf9;
}
.division-vocational {
  --division-bg: #eaf5f2;
  --division-fg: #286657;
  --division-border: #cfe5de;
  --division-icon-bg: #dcefe9;
  --division-shape: #d7ebe4;
}
.division-phibeta {
  --division-bg: #fff0f2;
  --division-fg: #994456;
  --division-border: #f1d4da;
  --division-icon-bg: #ffe3e8;
  --division-shape: #f9dfe4;
}
.division-intelecto {
  --division-bg: #f5f2e7;
  --division-fg: #756022;
  --division-border: #e7dfc4;
  --division-icon-bg: #eee8d3;
  --division-shape: #eee7cf;
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
