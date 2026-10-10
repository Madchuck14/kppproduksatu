<script setup lang="ts">
import { educationLevelSchema } from '#shared/schemas/auth'
import { bookSubjectSchema } from '#shared/schemas/editor'
import { getSubjectsForLevel, subjectsByLevel } from '#shared/utils/book-subjects'
import { getGradesForLevel } from '#shared/utils/book-grades'

const config = useRuntimeConfig()
const route = useRoute()
const appliedSearch = computed(() =>
  typeof route.query.q === 'string' ? route.query.q.trim().slice(0, 100) : '',
)
useSeoMeta({
  title: () =>
    `${appliedSearch.value ? `Hasil untuk “${appliedSearch.value}”` : 'Katalog Buku'} | ${config.public.siteName}`,
  description: 'Telusuri buku berdasarkan jenjang, kelas, dan mata pelajaran.',
})
const searchInput = useTemplateRef<HTMLInputElement>('searchInput')
const search = ref(appliedSearch.value)
watch(appliedSearch, (value) => {
  search.value = value
})
const level = computed(() => {
  const parsed = educationLevelSchema.safeParse(route.query.level)
  return parsed.success ? parsed.data : ''
})
const gradeOptions = computed(() => getGradesForLevel(level.value))
const grade = computed(() => {
  const value = Number(route.query.grade)
  return gradeOptions.value.includes(value) ? value : undefined
})
const subjects = computed(() =>
  [route.query.subject ?? []].flat().flatMap((value) => {
    const parsed = bookSubjectSchema.safeParse(value)
    return parsed.success ? [parsed.data] : []
  }),
)
const sort = computed(() =>
  route.query.sort === 'title-asc' || route.query.sort === 'title-desc'
    ? route.query.sort
    : 'newest',
)
const pageSize = computed(() =>
  [15, 30, 60].includes(Number(route.query.pageSize)) ? Number(route.query.pageSize) : 15,
)
const requestedPage = computed(() => {
  const value = Number(route.query.page)
  return Number.isInteger(value) && value > 0 && value <= 100000 ? value : 1
})
const { data, error, status, refresh } = await useFetch('/api/products', {
  query: computed(() => ({
    q: appliedSearch.value,
    level: level.value || undefined,
    grade: grade.value,
    subject: subjects.value.length ? subjects.value : undefined,
    sort: sort.value,
    page: requestedPage.value,
    pageSize: pageSize.value,
  })),
})
const page = computed(() => data.value?.page ?? requestedPage.value)
const isEmpty = computed(
  () => status.value === 'success' && !error.value && data.value?.products.length === 0,
)
const totalPages = computed(() => Math.max(1, Math.ceil((data.value?.total ?? 0) / pageSize.value)))
const pageItems = computed(() => {
  const pages = new Set([1, totalPages.value, page.value - 1, page.value, page.value + 1])
  if (page.value < 3) {
    pages.add(2)
    pages.add(3)
  }
  const items: (number | string)[] = []
  let previous = 0
  for (const value of [...pages]
    .filter((value) => value > 0 && value <= totalPages.value)
    .sort((a, b) => a - b)) {
    if (previous && value - previous > 1) items.push(`gap-${value}`)
    items.push(value)
    previous = value
  }
  return items
})
const allSubjects = computed(() =>
  level.value
    ? [...getSubjectsForLevel(level.value)]
    : [...new Set(Object.values(subjectsByLevel).flat())],
)
const preferredSubjects = [
  'Matematika',
  'Bahasa Indonesia',
  'Bahasa Inggris',
  'Informatika',
  'Ilmu Pengetahuan Alam (IPA)',
  'Ilmu Pengetahuan Sosial (IPS)',
]
const showAllSubjects = ref(false)
const orderedSubjects = computed(() =>
  [...allSubjects.value].sort((a, b) => {
    const rank = (value: string) =>
      preferredSubjects.includes(value) ? preferredSubjects.indexOf(value) : 100
    return rank(a) - rank(b)
  }),
)
const visibleSubjects = computed(() =>
  showAllSubjects.value
    ? orderedSubjects.value
    : orderedSubjects.value.filter((item, index) => index < 6 || subjects.value.includes(item)),
)
function subjectLabel(value: string) {
  return value === 'Ilmu Pengetahuan Alam (IPA)'
    ? 'IPA'
    : value === 'Ilmu Pengetahuan Sosial (IPS)'
      ? 'IPS'
      : value
}
async function updateQuery(changes: Record<string, string | string[] | number | undefined>) {
  await navigateTo({ path: '/products', query: { ...route.query, page: undefined, ...changes } })
}
function selectLevel(value: string) {
  return updateQuery({
    level: value || undefined,
    grade: undefined,
    subject: subjects.value.filter(
      (subject) => !value || getSubjectsForLevel(value).includes(subject),
    ),
  })
}
function toggleSubject(value: (typeof subjects.value)[number]) {
  return updateQuery({
    subject: subjects.value.includes(value)
      ? subjects.value.filter((item) => item !== value)
      : [...subjects.value, value],
  })
}
function searchCatalog() {
  return updateQuery({ q: search.value.trim() || undefined })
}
async function clearSearch() {
  await updateQuery({ q: undefined })
  search.value = ''
  searchInput.value?.focus()
}
function clearFilters() {
  return updateQuery({ level: undefined, grade: undefined, subject: undefined })
}
</script>

<template>
  <section
    :class="[
      'catalog-page',
      { 'catalog-page--search': appliedSearch, 'catalog-page--empty': isEmpty },
    ]"
  >
    <nav class="catalog-breadcrumb" aria-label="Breadcrumb">
      <NuxtLink to="/">Beranda</NuxtLink><span aria-hidden="true">/</span
      ><template v-if="appliedSearch"
        ><NuxtLink to="/products">Katalog</NuxtLink><span aria-hidden="true">/</span
        ><span aria-current="page">Pencarian</span></template
      ><span v-else aria-current="page">Katalog</span>
    </nav>
    <div class="catalog-heading">
      <h1>{{ appliedSearch ? `Hasil untuk “${appliedSearch}”` : 'Katalog Buku' }}</h1>
      <p v-if="appliedSearch" aria-live="polite">
        {{
          status === 'pending'
            ? 'Mencari buku...'
            : error
              ? 'Hasil pencarian belum dapat dimuat.'
              : isEmpty
                ? 'Tidak ada buku yang cocok dengan pencarian dan filter Anda.'
                : `${data?.total ?? 0} buku ditemukan. Persempit hasil dengan filter di samping.`
        }}
      </p>
      <p v-else>Telusuri buku berdasarkan jenjang, kelas, dan mata pelajaran.</p>
    </div>
    <form class="catalog-search" @submit.prevent="searchCatalog">
      <div class="catalog-search-input">
        <img src="/images/catalog/search-input.svg" alt="" width="18" height="18" />
        <label for="catalog-search" class="sr-only">Cari judul, kode buku, atau penulis</label>
        <input
          id="catalog-search"
          ref="searchInput"
          v-model="search"
          type="search"
          maxlength="100"
          placeholder="Cari nama buku..."
        />
      </div>
      <button type="submit">Cari Buku</button>
    </form>
    <div class="catalog-layout">
      <aside class="catalog-filters" aria-label="Filter buku">
        <fieldset class="filter-section">
          <legend>Jenjang</legend>
          <div class="level-segments">
            <button
              v-for="item in ['', ...educationLevelSchema.options]"
              :key="item"
              type="button"
              :aria-pressed="level === item"
              @click="selectLevel(item)"
            >
              {{ item || 'Semua' }}
            </button>
          </div>
        </fieldset>
        <fieldset class="filter-section">
          <legend>Kelas</legend>
          <p v-if="!level" class="filter-hint">Pilih jenjang untuk memilih kelas.</p>
          <div v-else class="grade-options">
            <button
              type="button"
              :aria-pressed="grade === undefined"
              @click="updateQuery({ grade: undefined })"
            >
              Semua
            </button>
            <button
              v-for="item in gradeOptions"
              :key="item"
              type="button"
              :aria-pressed="grade === item"
              @click="updateQuery({ grade: item })"
            >
              {{ item }}
            </button>
          </div>
        </fieldset>
        <fieldset class="subject-filter">
          <legend>Mata pelajaran</legend>
          <label v-for="item in visibleSubjects" :key="item" class="subject-option">
            <input
              type="checkbox"
              :checked="subjects.includes(item)"
              @change="toggleSubject(item)"
            />
            <span>{{ subjectLabel(item) }}</span
            ><span class="subject-count">{{
              error ? '—' : (data?.subjectCounts?.[item] ?? 0)
            }}</span>
          </label>
          <button
            v-if="allSubjects.length > 6"
            class="more-subjects"
            type="button"
            :aria-expanded="showAllSubjects"
            @click="showAllSubjects = !showAllSubjects"
          >
            {{ showAllSubjects ? 'Tampilkan lebih sedikit' : 'Lihat semua mata pelajaran' }}
          </button>
        </fieldset>
      </aside>
      <div class="catalog-results" :aria-busy="status === 'pending'">
        <div class="results-bar">
          <p role="status">
            {{
              status === 'pending'
                ? 'Memuat buku...'
                : error
                  ? 'Katalog belum tersedia'
                  : `${data?.total ?? 0} buku`
            }}
          </p>
          <label class="sort-control"
            ><span class="sr-only">Urutkan buku</span
            ><select
              :value="sort"
              @change="updateQuery({ sort: ($event.target as HTMLSelectElement).value })"
            >
              <option value="newest">Terbaru</option>
              <option value="title-asc">Judul A–Z</option>
              <option value="title-desc">Judul Z–A</option></select
            ><span aria-hidden="true">▾</span></label
          >
        </div>
        <div v-if="appliedSearch" class="search-chip">
          <span>“{{ appliedSearch }}”</span>
          <button
            type="button"
            :aria-label="`Hapus pencarian ${appliedSearch}`"
            @click="clearSearch"
          >
            <span aria-hidden="true">x</span>
          </button>
        </div>
        <div v-if="error" role="alert" class="catalog-message">
          <p>Katalog belum dapat dimuat. Silakan coba lagi.</p>
          <button type="button" @click="refresh()">Coba lagi</button>
        </div>
        <div v-else-if="data?.products.length" class="catalog-grid">
          <ProductCard
            v-for="product in data.products"
            :key="product.id"
            :product="product"
            variant="catalog"
          />
        </div>
        <section v-else-if="isEmpty" class="empty-search" aria-labelledby="empty-search-title">
          <img src="/images/catalog/search-empty.svg" alt="" width="120" height="100" />
          <h2 id="empty-search-title">
            {{
              appliedSearch
                ? `Tidak ada buku untuk “${appliedSearch}”`
                : 'Tidak ada buku yang cocok'
            }}
          </h2>
          <p>Coba periksa ejaan atau gunakan kata kunci yang lebih umum.</p>
          <ul class="empty-search-tips">
            <li>Periksa kembali ejaan kata kunci</li>
            <li>Kurangi filter jenjang, kelas, atau mata pelajaran</li>
            <li>Cari dengan nama penulis atau kode buku</li>
          </ul>
          <div class="empty-search-actions">
            <button type="button" @click="clearFilters">Hapus semua filter</button>
            <NuxtLink to="/products">Lihat semua buku</NuxtLink>
          </div>
        </section>
      </div>
    </div>
    <div v-if="!error && !isEmpty" class="catalog-pagination">
      <nav aria-label="Halaman katalog" class="pagination-controls">
        <button
          type="button"
          :disabled="page <= 1 || status === 'pending'"
          @click="updateQuery({ page: page - 1 })"
        >
          <img src="/images/catalog/previous.svg" alt="" width="16" height="16" /><span
            >Sebelumnya</span
          >
        </button>
        <template v-for="item in pageItems" :key="item"
          ><button
            v-if="typeof item === 'number'"
            type="button"
            :aria-current="item === page ? 'page' : undefined"
            :disabled="status === 'pending'"
            @click="updateQuery({ page: item })"
          >
            {{ item }}</button
          ><span v-else class="pagination-gap"
            ><img src="/images/catalog/ellipsis.svg" alt="…" width="16" height="16" /></span
        ></template>
        <button
          type="button"
          :disabled="page >= totalPages || status === 'pending'"
          @click="updateQuery({ page: page + 1 })"
        >
          <span>Berikutnya</span
          ><img src="/images/catalog/next.svg" alt="" width="16" height="16" />
        </button>
      </nav>
      <label class="page-size"
        >Buku per halaman<span
          ><select
            :value="pageSize"
            @change="updateQuery({ pageSize: Number(($event.target as HTMLSelectElement).value) })"
          >
            <option :value="15">15</option>
            <option :value="30">30</option>
            <option :value="60">60</option></select
          ><img src="/images/catalog/chevron.svg" alt="" width="16" height="16" /></span
      ></label>
    </div>
  </section>
</template>

<style scoped>
.catalog-page {
  color: #222;
  font-family: var(--font-landing-sans);
}
.catalog-breadcrumb {
  display: flex;
  gap: 5px;
  padding-top: 24px;
  color: #6b6f6b;
  font-size: 13px;
  line-height: 20.8px;
}
.catalog-breadcrumb a:hover {
  text-decoration: underline;
}
.catalog-heading {
  padding: 12px 0 24px;
}
.catalog-heading h1 {
  overflow-wrap: anywhere;
  font: 500 40px/48px var(--font-landing-serif);
}
.catalog-heading p {
  margin-top: 6px;
  color: #6b6f6b;
  font-size: 15px;
  line-height: 24px;
}
.catalog-search {
  display: flex;
  padding: 12px 20px;
  background: #f0f7f3;
  border-radius: 16px;
}
.catalog-search-input {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  padding: 0 16px;
  background: white;
  border: 1px solid #dce8e0;
  border-radius: 10px 0 0 10px;
}
.catalog-search-input img {
  flex-shrink: 0;
}
.catalog-search input {
  width: 100%;
  min-width: 0;
  height: 46px;
  font-size: 14px;
  outline: none;
}
.catalog-search input::placeholder {
  color: #9bafa3;
}
.catalog-search-input:focus-within {
  box-shadow: inset 0 0 0 1px #2f6b4f;
}
.catalog-search button {
  width: 120px;
  height: 48px;
  flex-shrink: 0;
  border-radius: 0 10px 10px 0;
  background: #2f6b4f;
  color: white;
  font: 500 14px var(--font-landing-serif);
}
button,
select {
  cursor: pointer;
}
button:disabled {
  cursor: default;
}
button:focus-visible,
select:focus-visible,
a:focus-visible,
input[type='checkbox']:focus-visible {
  outline: 2px solid #2f6b4f;
  outline-offset: 3px;
}
.catalog-layout {
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr);
  gap: 44px;
  padding-top: 28px;
}
.catalog-filters {
  display: flex;
  flex-direction: column;
  gap: 22px;
}
fieldset {
  min-width: 0;
}
legend {
  padding: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 17px;
  margin-bottom: 12px;
}
.filter-section {
  padding-bottom: 22px;
  border-bottom: 1px solid #e6e8e4;
}
.level-segments {
  display: flex;
  overflow: hidden;
  border: 1px solid #e6e8e4;
  border-radius: 10px;
}
.level-segments button {
  flex: 1;
  min-width: 0;
  height: 38px;
  font-size: 13px;
  color: #6b6f6b;
}
.level-segments button[aria-pressed='true'],
.grade-options button[aria-pressed='true'] {
  color: white;
  background: #1f5c3f;
}
.filter-hint {
  color: #6b6f6b;
  font-size: 13px;
  line-height: 20.8px;
}
.grade-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.grade-options button {
  padding: 6px 9px;
  font-size: 13px;
  border: 1px solid #e6e8e4;
  border-radius: 6px;
}
.subject-filter {
  padding-bottom: 22px;
}
.subject-option {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 34px;
  padding: 5px 0;
  color: #6b6f6b;
  font-size: 15px;
  line-height: 24px;
  cursor: pointer;
}
.subject-option input {
  appearance: none;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  margin: 3px 3px 3px 4px;
  border: 1px solid #767676;
  border-radius: 2.5px;
}
.subject-option input:checked {
  appearance: auto;
  accent-color: #1f5c3f;
}
.subject-count {
  margin-left: auto;
  font-size: 12px;
}
.more-subjects {
  margin-top: 12px;
  color: #2f6b4f;
  font-size: 12px;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.catalog-results {
  min-width: 0;
}
.results-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 38px;
  margin-bottom: 40px;
  font-size: 15px;
  color: #6b6f6b;
}
.sort-control {
  position: relative;
  color: #222;
}
.sort-control select {
  appearance: none;
  height: 38px;
  width: 110px;
  border: 1px solid #e6e8e4;
  border-radius: 10px;
  padding: 0 26px 0 14px;
  background: white;
}
.sort-control > span:last-child {
  position: absolute;
  right: 10px;
  top: 6px;
  pointer-events: none;
  font: 500 20px/24px var(--font-landing-serif);
}
.catalog-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 26px;
}
.catalog-page--search .results-bar {
  margin-bottom: 8px;
}
.search-chip {
  display: flex;
  align-items: center;
  gap: 25px;
  width: fit-content;
  max-width: 100%;
  min-height: 32px;
  padding: 2px 15px;
  margin-bottom: 8px;
  border: 1px solid #e6e8e4;
  border-radius: 16px;
  background: #f4f8f5;
  font-size: 15px;
  line-height: 24px;
}
.search-chip > span {
  overflow-wrap: anywhere;
  min-width: 0;
}
.search-chip button {
  color: #6b6f6b;
  width: 8px;
  height: 24px;
  flex-shrink: 0;
  position: relative;
}
.search-chip button::after {
  content: '';
  position: absolute;
  inset: -4px -8px;
}
.catalog-message {
  padding: 40px 0;
  color: #6b6f6b;
  font-size: 15px;
}
.catalog-message button {
  margin-top: 16px;
  color: #2f6b4f;
  text-decoration: underline;
}
.catalog-page--empty .catalog-layout {
  min-height: 637px;
}
.catalog-page--empty .results-bar {
  margin-bottom: 8px;
}
.empty-search {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 15px;
  padding: 72px 0;
  text-align: center;
}
.empty-search > img {
  flex-shrink: 0;
  width: 120px;
  height: 100px;
}
.empty-search h2 {
  margin-top: 4px;
  max-width: 100%;
  overflow-wrap: anywhere;
  color: #222;
  font: 500 26px/1.2 var(--font-landing-serif);
}
.empty-search > p,
.empty-search-tips {
  color: #6b6f6b;
  font-size: 15px;
  line-height: 24px;
}
.empty-search-tips {
  display: grid;
  gap: 6px;
  margin-top: 18px;
  text-align: left;
}
.empty-search-tips li {
  position: relative;
  padding-left: 18px;
}
.empty-search-tips li::before {
  content: '–';
  position: absolute;
  left: 0;
}
.empty-search-actions {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
}
.empty-search-actions button,
.empty-search-actions a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 8px 22px;
  border: 1px solid #1f5c3f;
  border-radius: 12px;
  color: #1f5c3f;
  font-size: 15px;
  font-weight: 500;
  line-height: 24px;
}
.empty-search-actions button {
  background: #1f5c3f;
  color: white;
}
.empty-search-actions button:hover {
  background: #184a32;
}
.empty-search-actions a:hover {
  background: #f4f8f5;
}
.catalog-pagination {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 8px 30px;
  min-height: 103px;
  padding: 10px 0;
}
.pagination-controls {
  display: flex;
  gap: 6px;
}
.pagination-controls button,
.pagination-gap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 36px;
  padding: 8px 12px;
  border: 1px solid #e9e9e9;
  border-radius: 4px;
  color: #313131;
  font-size: 14px;
  line-height: 20px;
}
.pagination-controls button:disabled {
  opacity: 0.3;
}
.pagination-controls button[aria-current='page'] {
  color: white;
  background: black;
  border-color: black;
  font-weight: 600;
}
.pagination-gap {
  width: 31px;
  padding-inline: 6px;
}
.page-size {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: black;
}
.page-size > span {
  position: relative;
}
.page-size select {
  appearance: none;
  padding: 7px 36px 7px 12px;
  height: 36px;
  border: 1px solid #e9e9e9;
  border-radius: 4px;
  background: white;
}
.page-size img {
  position: absolute;
  top: 10px;
  right: 12px;
  pointer-events: none;
}
@media (max-width: 1000px) {
  .catalog-layout {
    grid-template-columns: 210px minmax(0, 1fr);
    gap: 24px;
  }
  .catalog-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 700px) {
  .catalog-page--empty .catalog-layout {
    min-height: 0;
  }
  .empty-search {
    padding: 40px 0;
  }
  .empty-search h2 {
    font-size: 24px;
  }
  .catalog-heading h1 {
    font-size: 32px;
    line-height: 40px;
  }
  .catalog-layout {
    grid-template-columns: 1fr;
    gap: 24px;
  }
  .catalog-filters {
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
  }
  .subject-filter {
    grid-column: 1 / -1;
  }
  .subject-option {
    font-size: 14px;
  }
  .catalog-search {
    padding: 12px;
  }
  .catalog-search button {
    width: 100px;
  }
  .catalog-search-input {
    padding-inline: 10px;
  }
  .catalog-grid {
    gap: 24px 16px;
  }
  .results-bar {
    margin-bottom: 24px;
  }
  .pagination-controls button {
    padding-inline: 8px;
  }
  .pagination-controls button span {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
}
</style>
