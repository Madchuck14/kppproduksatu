<script setup lang="ts">
import { educationLevelSchema } from '#shared/schemas/auth'
import { bookSubjectSchema } from '#shared/schemas/editor'
import { getSubjectsForLevel, subjectsByLevel, type BookSubject } from '#shared/utils/book-subjects'
const config = useRuntimeConfig()
useSeoMeta({
  title: `Katalog | ${config.public.siteName}`,
  description: 'Jelajahi seluruh koleksi produk kami.',
})
const route = useRoute()
const appliedSearch = computed(() =>
  typeof route.query.q === 'string' ? route.query.q.trim().slice(0, 100) : '',
)
const search = ref(appliedSearch.value)
const appliedLevel = computed(() => {
  const parsed = educationLevelSchema.safeParse(route.query.level)
  return parsed.success ? parsed.data : ''
})
const level = ref(appliedLevel.value)
const appliedSubject = computed<BookSubject | ''>(() => {
  const parsed = bookSubjectSchema.safeParse(route.query.subject)
  return parsed.success ? parsed.data : ''
})
const subject = ref<BookSubject | ''>(appliedSubject.value)
const subjectSearch = ref('')
const subjectOpen = ref(false)
const subjectOptions = computed(() =>
  level.value
    ? getSubjectsForLevel(level.value)
    : [...new Set(Object.values(subjectsByLevel).flat())],
)
watch(level, () => {
  if (!subjectOptions.value.some((item) => item === subject.value)) subject.value = ''
})
watch(appliedSubject, (value) => {
  subject.value = value
})
watch(appliedLevel, (value) => {
  level.value = value
})
watch(appliedSearch, (value) => {
  search.value = value
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
const { data, error, status } = await useFetch('/api/products', {
  query: computed(() => ({
    q: appliedSearch.value,
    level: appliedLevel.value || undefined,
    subject: appliedSubject.value || undefined,
  })),
})
</script>

<template>
  <section>
    <p class="mb-3 text-xs font-medium uppercase tracking-widest text-emerald-800">Koleksi kami</p>
    <h1 class="display-heading mb-8 text-5xl">Katalog produk</h1>
    <form class="mb-8 flex max-w-3xl flex-wrap gap-3" @submit.prevent="searchCatalog">
      <label for="catalog-search" class="sr-only">Cari judul, kode buku, atau penulis</label>
      <input
        id="catalog-search"
        v-model="search"
        maxlength="100"
        type="search"
        placeholder="Cari judul, kode buku, atau penulis..."
        class="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-4 py-3"
      />
      <label for="catalog-level" class="sr-only">Jenjang pendidikan</label>
      <select
        id="catalog-level"
        v-model="level"
        class="rounded-lg border border-stone-300 bg-white px-4 py-3"
      >
        <option value="">Semua jenjang</option>
        <option v-for="item in educationLevelSchema.options" :key="item" :value="item">
          {{ item }}
        </option>
      </select>
      <label for="catalog-subject" class="sr-only">Mata pelajaran</label>
      <UInputMenu
        id="catalog-subject"
        v-model:search-term="subjectSearch"
        :model-value="subject || undefined"
        :open="subjectOpen && !!subjectSearch.trim()"
        :items="[...subjectOptions]"
        placeholder="Ketik mata pelajaran..."
        :trailing="false"
        :open-on-focus="false"
        :open-on-click="false"
        :reset-model-value-on-clear="true"
        size="xl"
        class="w-full min-w-0 sm:w-72"
        :ui="{ base: 'min-h-12', content: 'w-80 max-w-[calc(100vw-2rem)]' }"
        @update:model-value="subject = $event ?? ''"
        @update:open="subjectOpen = $event"
      >
        <template #empty>Tidak ada mapel yang cocok.</template>
      </UInputMenu>
      <UButton type="submit" :loading="status === 'pending'">Cari</UButton>
    </form>
    <p v-if="error" role="alert" class="text-red-700">
      Katalog belum dapat dimuat. Coba lagi nanti.
    </p>
    <div v-else class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <ProductCard v-for="product in data?.products" :key="product.id" :product="product" />
    </div>
    <p v-if="data && !data.products.length" class="py-10 text-stone-500">
      Tidak ada produk yang sesuai dengan pencarianmu.
    </p>
  </section>
</template>
