<script setup lang="ts">
import { educationLevelSchema } from '#shared/schemas/auth'

const config = useRuntimeConfig()
useSeoMeta({
  title: `Katalog Buku Erlangga | ${config.public.siteName}`,
  description: 'Temukan buku pelajaran Erlangga untuk setiap langkah belajar.',
})
const search = ref('')
const level = ref('')
const subject = ref('')
const { data, error, status, refresh } = await useFetch('/api/products')
const latestBooks = computed(() => data.value?.products.slice(0, 4) ?? [])
const subjects = [
  { name: 'Matematika', icon: 'math' },
  { name: 'Bahasa Indonesia', icon: 'language' },
  { name: 'Bahasa Inggris', icon: 'english' },
  { name: 'Informatika', icon: 'code' },
  { name: 'IPA', icon: 'science' },
  { name: 'IPS', icon: 'social' },
]
async function searchCatalog() {
  const q = [search.value.trim(), subject.value].filter(Boolean).join(' ')
  await navigateTo({
    path: '/products',
    query: { ...(q ? { q } : {}), ...(level.value ? { level: level.value } : {}) },
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
      <img
        src="/images/landing/hero-books.png"
        alt="Buku Grow with English dari Penerbit Erlangga"
        width="437"
        height="350"
        fetchpriority="high"
        class="hero-books"
      />
    </section>
    <form id="pencarian" class="landing-search" @submit.prevent="searchCatalog">
      <div class="search-input">
        <img src="/images/landing/search.svg" alt="" width="20" height="20" />
        <label for="landing-search" class="sr-only">Cari judul, kode buku, atau penulis</label>
        <input
          id="landing-search"
          v-model="search"
          name="q"
          type="search"
          maxlength="100"
          placeholder="Cari judul atau kode buku..."
        />
      </div>
      <div class="search-filter">
        <label for="landing-level">Jenjang</label>
        <select id="landing-level" v-model="level" name="level">
          <option value="">Semua Jenjang</option>
          <option v-for="item in educationLevelSchema.options" :key="item" :value="item">
            {{ item }}
          </option>
        </select>
      </div>
      <div class="search-filter">
        <label for="landing-subject">Mata pelajaran</label>
        <select id="landing-subject" v-model="subject">
          <option value="">Semua Pelajaran</option>
          <option v-for="item in subjects" :key="item.name" :value="item.name">
            {{ item.name }}
          </option>
        </select>
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
        <h2 id="subjects-title">Jelajahi Pelajaran</h2>
        <NuxtLink to="/products" class="browse-link"
          >Lihat semua buku <img src="/images/landing/arrow.svg" alt="" width="17" height="17"
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
          <span class="subject-caption">Jelajahi buku</span>
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
  min-height: 420px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
  gap: 40px;
  padding: 35px 64px;
  border-radius: 24px;
  background: #f7fbf8;
}
.hero-content {
  max-width: 550px;
  min-height: 280px;
  padding: 14px;
  border: 1px solid #dce8e0;
  border-radius: 20px;
  background: white;
  font-family: Georgia, 'Times New Roman', serif;
}
.hero-content h1 {
  font-size: 48px;
  font-weight: 700;
  line-height: 1.04;
  letter-spacing: -0.025em;
}
.hero-content p {
  margin-top: 22px;
  font-size: 20px;
  line-height: 28px;
  color: #687169;
}
.hero-link {
  display: inline-flex;
  gap: 12px;
  align-items: center;
  margin-top: 50px;
  color: #2f6b4f;
}
.hero-link:hover,
.browse-link:hover {
  text-decoration: underline;
}
.hero-books {
  width: 437px;
  height: 350px;
  max-width: 100%;
  object-fit: contain;
  justify-self: end;
  margin-right: 24px;
}
.landing-search {
  display: flex;
  margin-top: 28px;
  padding: 12px 20px;
  border: 1px solid #dce8e0;
  border-radius: 16px;
  background: #f0f7f2;
}
.search-input {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 12px 16px;
  background: white;
  border: 1px solid #dce8e0;
  border-radius: 6px 0 0 6px;
}
.search-input input {
  width: 100%;
  min-width: 0;
  font-size: 14px;
}
.search-input input::placeholder {
  color: #82958a;
}
.search-filter {
  width: 220px;
  padding: 7px 16px;
  background: white;
  border-block: 1px solid #dce8e0;
  border-right: 1px solid #dce8e0;
}
.search-filter label {
  display: block;
  font-size: 10px;
  text-transform: uppercase;
  color: #687169;
}
.search-filter select {
  width: 100%;
  font-size: 13px;
  background: white;
}
.search-submit {
  width: 120px;
  justify-content: center;
  border-radius: 0 6px 6px 0;
  background: #2f6b4f;
  font-family: Georgia, 'Times New Roman', serif;
}
.landing-section {
  margin: 38px 32px 0;
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
  font-family: Georgia, 'Times New Roman', serif;
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
  margin-top: 38px;
  margin-bottom: 54px;
}
.subject-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px;
  margin-top: 24px;
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
  font:
    600 24px/1.2 Georgia,
    'Times New Roman',
    serif;
}
.subject-caption {
  position: relative;
  margin-top: 3px;
  font-size: 13px;
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
.english .subject-decoration {
  inset: auto auto -50px -40px;
}
.code .subject-decoration {
  inset: -40px -24px auto auto;
  width: 150px;
  height: 150px;
}
@media (max-width: 1000px) {
  .landing-hero {
    padding: 32px;
    gap: 24px;
  }
  .hero-content h1 {
    font-size: 40px;
  }
  .hero-books {
    margin-right: 0;
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
    grid-template-columns: 1fr;
    padding: 24px;
  }
  .hero-content {
    min-height: auto;
  }
  .hero-content h1 {
    font-size: 36px;
  }
  .hero-content p {
    font-size: 18px;
  }
  .hero-link {
    margin-top: 24px;
  }
  .hero-books {
    width: 300px;
    height: 240px;
    justify-self: center;
  }
  .landing-search {
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
@media (prefers-reduced-motion: reduce) {
  .subject-card {
    transition: none;
  }
}
</style>
