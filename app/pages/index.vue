<script setup lang="ts">
import { educationLevelSchema } from '#shared/schemas/auth'
import { bookDivisions } from '#shared/utils/book-divisions'
import { getSubjectsForLevel, subjectsByLevel, type BookSubject } from '#shared/utils/book-subjects'

const config = useRuntimeConfig()
useHead({
  link: [
    {
      rel: 'preload',
      href: '/fonts/plus-jakarta-sans-latin.woff2',
      as: 'font',
      type: 'font/woff2',
      crossorigin: 'anonymous',
    },
  ],
})
useSeoMeta({
  title: `Katalog Buku Erlangga | ${config.public.siteName}`,
  description: 'Temukan buku pelajaran Erlangga untuk setiap langkah belajar.',
})
const search = ref('')
const level = ref('')
const subject = ref<BookSubject | ''>('')
const subjectSearch = ref('')
const subjectOpen = ref(false)
const [{ data, error, status, refresh }, { data: levelCounts }] = await Promise.all([
  useFetch('/api/products'),
  useFetch('/api/catalog/level-counts'),
])
const latestBooks = computed(() => data.value?.products.slice(0, 4) ?? [])
const schoolLevels = educationLevelSchema.options
const divisions = bookDivisions
const subjectOptions = computed(() =>
  level.value
    ? getSubjectsForLevel(level.value)
    : [...new Set(Object.values(subjectsByLevel).flat())],
)
watch(level, () => {
  if (!subjectOptions.value.some((item) => item === subject.value)) subject.value = ''
})
async function searchCatalog() {
  const q = search.value.trim()
  await navigateTo({
    path: '/products',
    query: {
      ...(q ? { q } : {}),
      ...(level.value ? { level: level.value } : {}),
      ...(subject.value ? { subject: subject.value } : {}),
    },
  })
}
</script>

<template>
  <div class="landing-page">
    <section class="landing-hero" aria-labelledby="landing-title">
      <div class="hero-content">
        <h1 id="landing-title">Temukan Buku<br />Favoritmu</h1>
        <p>
          Jelajahi berbagai koleksi buku pelajaran untuk menemani rasa ingin tahu dan setiap langkah
          perjalananmu.
        </p>
        <NuxtLink to="/products" class="hero-link"
          >Jelajahi Buku <span aria-hidden="true">→</span></NuxtLink
        >
      </div>
      <div class="hero-image">
        <img
          src="/images/landing/hero-books.png"
          alt="Buku Grow with English dari Penerbit Erlangga"
          width="437"
          height="350"
          fetchpriority="high"
          class="hero-books"
        />
      </div>
    </section>
    <form id="pencarian" class="landing-search" @submit.prevent="searchCatalog">
      <div class="search-input">
        <img src="/images/landing/search-input.svg" alt="" width="18" height="18" />
        <label for="landing-search" class="sr-only">Cari judul, kode buku, atau penulis</label>
        <input
          id="landing-search"
          v-model="search"
          name="q"
          type="search"
          maxlength="100"
          placeholder="Cari nama buku..."
        />
      </div>
      <div class="search-filter level-filter">
        <label for="landing-level">Jenjang</label>
        <span class="level-filter-value" aria-hidden="true">
          {{ level || 'Semua Jenjang' }}
        </span>
        <select id="landing-level" v-model="level" name="level">
          <option value="">Semua Jenjang</option>
          <option v-for="item in educationLevelSchema.options" :key="item" :value="item">
            {{ item }}
          </option>
        </select>
        <img src="/images/landing/chevron.svg" alt="" width="14" height="14" />
      </div>
      <div class="search-filter">
        <label for="landing-subject">Mata pelajaran</label>
        <UInputMenu
          id="landing-subject"
          v-model:search-term="subjectSearch"
          :model-value="subject || undefined"
          :open="subjectOpen && !!subjectSearch.trim()"
          :items="[...subjectOptions]"
          placeholder="Ketik mata pelajaran..."
          variant="none"
          :trailing="false"
          :open-on-focus="false"
          :open-on-click="false"
          :reset-model-value-on-clear="true"
          :ui="{
            root: 'w-full',
            base: 'w-full rounded-none bg-transparent p-0 text-[13px] leading-4 text-[#344e41] placeholder:text-[#9bafa3]',
            content: 'w-80 max-w-[calc(100vw-2rem)]',
          }"
          @update:model-value="subject = $event ?? ''"
          @update:open="subjectOpen = $event"
        >
          <template #empty>Tidak ada mapel yang cocok.</template>
        </UInputMenu>
      </div>
      <UButton type="submit" class="search-submit">Cari Buku</UButton>
    </form>
    <section
      class="landing-section"
      aria-labelledby="latest-title"
      :aria-busy="status === 'pending'"
    >
      <div class="section-heading">
        <h2 id="latest-title">Buku Terbaru</h2>
        <NuxtLink to="/products" class="browse-link"
          >Lihat buku terbaru <img src="/images/landing/arrow.svg" alt="" width="17" height="17"
        /></NuxtLink>
      </div>
      <p v-if="data?.source === 'demo'" class="demo-note">Buku dan harga merupakan data contoh.</p>
      <div v-if="error" role="alert" class="catalog-message">
        <p>Katalog belum dapat dimuat. Silakan coba lagi.</p>
        <UButton class="mt-4" variant="outline" @click="refresh()">Coba lagi</UButton>
      </div>
      <p v-else-if="status === 'pending'" role="status" class="catalog-message">Memuat buku...</p>
      <div v-else-if="latestBooks.length" class="latest-books">
        <ProductCard
          v-for="product in latestBooks"
          :key="product.id"
          :product="product"
          variant="landing"
        />
      </div>
      <p v-else class="catalog-message">Belum ada buku yang tersedia.</p>
    </section>
    <section
      id="kategori"
      class="landing-section subjects-section"
      aria-labelledby="subjects-title"
    >
      <div class="section-heading">
        <h2 id="subjects-title">Jenjang</h2>
        <NuxtLink to="/jenjang" class="browse-link"
          >Lihat semua jenjang
          <img src="/images/landing/category-arrow.svg" alt="" width="17" height="17"
        /></NuxtLink>
      </div>
      <div class="subject-grid">
        <NuxtLink
          v-for="item in schoolLevels"
          :key="item"
          :to="{ path: '/jenjang', query: { level: item } }"
          :class="['subject-card', item.toLowerCase()]"
        >
          <span class="subject-decoration" aria-hidden="true" />
          <span class="subject-icon"
            ><UIcon name="i-lucide-school" class="size-6" aria-hidden="true"
          /></span>
          <h3>{{ item }}</h3>
          <span class="subject-caption">{{
            levelCounts ? `${levelCounts[item]} buku` : 'Jelajahi buku'
          }}</span>
        </NuxtLink>
      </div>
    </section>
    <section class="landing-section divisions-section" aria-labelledby="divisions-title">
      <div class="section-heading">
        <h2 id="divisions-title">Divisi</h2>
        <NuxtLink to="/divisi" class="browse-link">Lihat semua divisi</NuxtLink>
      </div>
      <div class="division-grid">
        <NuxtLink
          v-for="(division, index) in divisions"
          :key="division.name"
          :to="{ path: '/divisi', query: { division: division.code } }"
          :class="['division-card', division.style]"
        >
          <span class="division-number" aria-hidden="true">
            {{ String(index + 1).padStart(2, '0') }}
          </span>
          <span class="division-icon" aria-hidden="true">
            <UIcon :name="division.icon" class="size-6" />
          </span>
          <h3>{{ division.name }}</h3>
          <span class="division-accent" aria-hidden="true" />
        </NuxtLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.landing-page {
  color: #242b26;
}
.landing-hero {
  height: 420px;
  display: grid;
  grid-template-columns: 550px 500px;
  align-items: start;
  gap: 115px;
  padding: 35px 64px;
  overflow: hidden;
  border-radius: 24px;
  background: #f7fbf8;
}
.hero-content {
  display: grid;
  grid-template-rows: 100px 97px 28px;
  gap: 20px;
  max-width: 550px;
  height: 280px;
  margin-top: 29px;
  padding: 9px 14px 3px;
  border: 1px solid #dce8e0;
  border-radius: 20px;
  background: white;
  font-family: var(--font-landing-serif);
}
.hero-content h1 {
  font-size: 48px;
  font-weight: 700;
  line-height: 50px;
}
.hero-content p {
  margin: 0;
  font-size: 20px;
  line-height: 28px;
  color: #687169;
}
.hero-link {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  font-size: 16px;
  font-weight: 500;
  line-height: 28px;
  color: #2f6b4f;
}
.hero-link:hover,
.browse-link:hover {
  text-decoration: underline;
}
.hero-link span {
  font: 600 20px/28px var(--font-landing-sans);
}
.hero-image {
  width: 500px;
  height: 350px;
  overflow: hidden;
}
.hero-books {
  width: 437px;
  height: 350px;
  max-width: none;
  object-fit: cover;
  margin-left: 97px;
}
.landing-search {
  display: flex;
  height: 74px;
  margin-top: 30px;
  padding: 12px 20px;
  border: 1px solid #dce8e0;
  border-radius: 16px;
  background: #f0f7f3;
}
.search-input {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 10px;
  min-width: 0;
  height: 48px;
  padding: 0 16px;
  background: white;
  border: 1px solid #dce8e0;
  border-right: 0;
  border-radius: 10px 0 0 10px;
}
.search-input input {
  width: 100%;
  min-width: 0;
  font-size: 14px;
}
.search-input input::placeholder {
  color: #9bafa3;
}
.search-filter {
  position: relative;
  flex-shrink: 0;
  width: 220px;
  height: 48px;
  padding: 8px 34px 8px 16px;
  background: white;
  border-block: 1px solid #dce8e0;
  border-left: 1px solid #dce8e0;
}
.level-filter {
  width: 200px;
}
.search-filter img {
  position: absolute;
  right: 12px;
  top: 17px;
  pointer-events: none;
}
.search-filter label {
  display: block;
  font-size: 10px;
  font-weight: 600;
  line-height: 12px;
  text-transform: uppercase;
  color: #687169;
}
.search-filter select {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  padding: 20px 34px 8px 16px;
  border: 0;
  color: transparent;
  appearance: none;
  background: transparent;
  cursor: pointer;
}
.search-filter select option {
  color: #344e41;
  background: white;
}
.level-filter-value {
  display: block;
  font-size: 13px;
  font-weight: 500;
  line-height: 16px;
  color: #344e41;
  pointer-events: none;
}
.search-submit {
  color: white;
  width: 120px;
  height: 48px;
  flex-shrink: 0;
  justify-content: center;
  border-radius: 0 10px 10px 0;
  background: #2f6b4f;
  font-family: var(--font-landing-serif);
  font-size: 14px;
  font-weight: 500;
}
.landing-search,
.search-input,
.search-filter,
.search-submit {
  transition:
    background-color 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease,
    transform 180ms ease;
}
.landing-section {
  margin: 36px 32px 0;
  scroll-margin-top: 24px;
}
.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 16px;
  margin-bottom: 12px;
}
.section-heading h2 {
  font-family: var(--font-landing-serif);
  font-size: 40px;
  line-height: 1.2;
}
.browse-link {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 6px;
  font-size: 13px;
  color: #344e41;
}
.latest-books {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 28px;
  min-height: 384px;
}
.demo-note {
  margin-bottom: 12px;
  color: #687169;
  font-size: 13px;
}
.catalog-message {
  padding: 32px;
  border: 1px solid #dce8e0;
  border-radius: 12px;
}
.subjects-section {
  margin-top: 36px;
  margin-bottom: 50px;
}
.subject-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 25px;
  margin-top: 27px;
}
.subject-card {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: end;
  overflow: hidden;
  min-height: 180px;
  padding: 22px 24px;
  border-radius: 28px;
  transition: transform 180ms;
}
.subject-card:hover {
  transform: translateY(-3px);
}
.subject-card h3 {
  position: relative;
  font: 600 24px/27.6px var(--font-landing-serif);
}
.subject-caption {
  position: relative;
  margin-top: 2px;
  font-size: 13px;
  font-weight: 500;
  opacity: 0.8;
}
.subject-icon {
  position: absolute;
  top: 18px;
  right: 18px;
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: #ffffffb3;
}
.subject-decoration {
  position: absolute;
  top: -34px;
  left: -34px;
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: var(--decoration);
}
.sd {
  background: #fde3d8;
  color: #a9401f;
  --decoration: #f8c3ac;
}
.smp {
  background: #dfeafb;
  color: #285a9e;
  --decoration: #bbd1f5;
}
.sma {
  background: #b8c3d1;
  color: #39485b;
  --decoration: #96a6ba;
}
.smk {
  background: #8f9cac;
  color: #263445;
  --decoration: #718196;
}
.smp .subject-decoration {
  inset: auto -30px -44px auto;
}
.sma .subject-decoration {
  inset: auto auto -50px -40px;
}
.smk .subject-decoration {
  inset: -40px -24px auto auto;
  width: 150px;
  height: 150px;
}
.divisions-section {
  margin-top: 54px;
  margin-bottom: 64px;
}
.division-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
  margin-top: 24px;
}
.division-card {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 142px;
  overflow: hidden;
  padding: 24px;
  border: 1px solid var(--division-border);
  border-radius: 18px 36px 18px 18px;
  background: var(--division-bg);
  color: var(--division-fg);
  isolation: isolate;
}
.division-card h3 {
  position: relative;
  z-index: 1;
  max-width: calc(100% - 76px);
  font: 600 22px/1.2 var(--font-landing-serif);
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
.division-icon {
  position: absolute;
  right: 20px;
  bottom: 18px;
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border: 1px solid var(--division-border);
  border-radius: 16px;
  background: var(--division-icon-bg);
  color: var(--division-fg);
}
.division-accent {
  position: absolute;
  z-index: -1;
  right: -23px;
  top: -36px;
  width: 116px;
  height: 116px;
  border: 1px solid var(--division-border);
  border-radius: 40% 60% 55% 45%;
  background: var(--division-shape);
  transform: rotate(24deg);
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
@media (max-width: 1350px) {
  .landing-hero {
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    gap: 32px;
  }
  .hero-image {
    width: 100%;
  }
  .hero-books {
    margin-left: 0;
    max-width: 100%;
    object-fit: contain;
  }
}
@media (max-width: 1000px) {
  .landing-hero {
    padding: 32px;
    gap: 24px;
  }
  .hero-content h1 {
    font-size: 40px;
  }
  .hero-content {
    grid-template-rows: 100px 97px 28px;
    font-size: 18px;
  }
  .hero-content p {
    font-size: 17px;
    line-height: 25px;
  }
  .search-filter {
    width: 170px;
  }
  .landing-section {
    margin-inline: 0;
  }
}
@media (max-width: 700px) {
  .landing-hero {
    height: auto;
    grid-template-columns: 1fr;
    padding: 24px;
  }
  .hero-content {
    display: block;
    height: auto;
    margin-top: 0;
    padding: 16px;
  }
  .hero-content h1 {
    font-size: 36px;
  }
  .hero-content p {
    margin-top: 20px;
    font-size: 18px;
  }
  .hero-link {
    margin-top: 24px;
  }
  .hero-image {
    height: 240px;
    display: flex;
    justify-content: center;
  }
  .hero-books {
    width: 300px;
    height: 240px;
  }
  .landing-search {
    height: auto;
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px;
  }
  .search-input {
    flex-basis: 100%;
    border-radius: 6px;
  }
  .search-filter {
    width: calc(50% - 4px);
    border: 1px solid #dce8e0;
    border-radius: 6px;
  }
  .search-submit {
    width: 100%;
    min-height: 44px;
    border-radius: 6px;
  }
  .section-heading h2 {
    font-size: 30px;
  }
  .browse-link {
    font-size: 12px;
    gap: 6px;
  }
  .latest-books {
    min-height: auto;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px 16px;
  }
  .subject-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }
  .division-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .division-card {
    min-height: 132px;
    padding: 18px;
  }
  .division-card h3 {
    font-size: 19px;
  }
  .division-number {
    left: 16px;
  }
  .division-icon {
    right: 14px;
    bottom: 14px;
    width: 44px;
    height: 44px;
  }
  .subject-card {
    min-height: 160px;
    padding: 18px;
    border-radius: 22px;
  }
  .subject-card h3 {
    font-size: 20px;
  }
}
.landing-search:focus-within {
  border-color: #2f6b4f;
  box-shadow: 0 0 0 3px rgb(47 107 79 / 12%);
}
.search-input:focus-within,
.search-filter:focus-within {
  border-color: #2f6b4f;
  background-color: #f5faf7;
  box-shadow: inset 0 0 0 1px #2f6b4f;
}
.search-input input:focus-visible,
.search-filter select:focus-visible {
  outline: none;
}
.search-submit:focus-visible {
  outline: 2px solid #2f6b4f;
  outline-offset: 3px;
}
@media (hover: hover) {
  .landing-search:hover {
    border-color: #a9c5b5;
  }
  .landing-search:focus-within:hover {
    border-color: #2f6b4f;
  }
  .search-input:hover,
  .search-filter:hover {
    background-color: #f5faf7;
  }
  .search-submit:hover {
    background-color: #24543e;
    box-shadow: 0 3px 8px rgb(47 107 79 / 20%);
  }
}
.search-submit:active {
  background-color: #1d4533;
  box-shadow: none;
  transform: scale(0.98);
}
@media (prefers-reduced-motion: reduce) {
  .subject-card,
  .landing-search,
  .search-input,
  .search-filter,
  .search-submit {
    transition: none;
  }
  .search-submit:active {
    transform: none;
  }
}
</style>
