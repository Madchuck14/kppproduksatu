<script setup lang="ts">
import { educationLevelSchema } from '#shared/schemas/auth'
import { landingSubjects } from '#shared/utils/landing-subjects'
import { getSubjectsForLevel, subjectsByLevel, type BookSubject } from '#shared/utils/book-subjects'

const config = useRuntimeConfig()
useHead({
  link: [
    {
      rel: 'preload',
      href: '/fonts/inter-latin.woff2',
      as: 'font',
      type: 'font/woff2',
      crossorigin: 'anonymous',
    },
    {
      rel: 'preload',
      href: '/fonts/lora-latin.woff2',
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
const { data, error, status, refresh } = await useFetch('/api/products')
const latestBooks = computed(() => data.value?.products.slice(0, 4) ?? [])
const subjects = landingSubjects
const subjectOptions = computed(() =>
  level.value
    ? getSubjectsForLevel(level.value)
    : [...new Set(Object.values(subjectsByLevel).flat())],
)
watch(level, () => {
  if (!subjectOptions.value.some((item) => item === subject.value)) subject.value = ''
})
const { data: subjectCounts } = await useFetch('/api/catalog/subject-counts')
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
        <h2 id="subjects-title">Kategori Populer</h2>
        <NuxtLink to="/products" class="browse-link"
          >Lihat semua kategori
          <img src="/images/landing/category-arrow.svg" alt="" width="17" height="17"
        /></NuxtLink>
      </div>
      <div class="subject-grid">
        <NuxtLink
          v-for="item in subjects"
          :key="item.name"
          :to="{ path: '/products', query: { q: item.name } }"
          :class="['subject-card', item.icon]"
        >
          <span class="subject-decoration" aria-hidden="true" />
          <span class="subject-icon"
            ><img :src="`/images/landing/${item.icon}.svg`" alt="" width="24" height="24"
          /></span>
          <h3>{{ item.name }}</h3>
          <span class="subject-caption">{{
            subjectCounts ? `${subjectCounts[item.name]} buku` : 'Jelajahi buku'
          }}</span>
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
  width: 100%;
  font-size: 13px;
  font-weight: 500;
  line-height: 16px;
  color: #344e41;
  appearance: none;
  background: transparent;
  cursor: pointer;
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
  grid-template-columns: repeat(3, minmax(0, 1fr));
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
.math {
  background: #fde3d8;
  color: #a9401f;
  --decoration: #f8c3ac;
}
.language {
  background: #fbe0e0;
  color: #963838;
  --decoration: #f1bcbc;
}
.english {
  background: #dcefe5;
  color: #1d6647;
  --decoration: #b3dbc5;
}
.code {
  background: #e2e3f8;
  color: #383c96;
  --decoration: #c1c4f1;
}
.science {
  background: #e9f1d7;
  color: #4a6719;
  --decoration: #cfe0a4;
}
.social {
  background: #fbf0d4;
  color: #85600f;
  --decoration: #f3dca1;
}
.language .subject-decoration,
.social .subject-decoration {
  inset: auto -30px -44px auto;
}
.social .subject-decoration {
  inset: auto -36px -46px auto;
}
.science .subject-decoration {
  top: -44px;
  left: -30px;
}
.english .subject-decoration {
  inset: auto auto -50px -40px;
}
.code .subject-decoration {
  inset: -40px -24px auto auto;
  width: 150px;
  height: 150px;
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
