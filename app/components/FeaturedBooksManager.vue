<script setup lang="ts">
import { maxFeaturedBooks } from '#shared/schemas/editor'
import type { FeaturedBookOption, FeaturedBooksPage } from '#shared/types/editor'
import { defaultLandingHero, landingHeroSchema } from '#shared/schemas/landing-hero'
const message = ref('')
const featuredSearch = ref('')
const featuredBooks = ref<FeaturedBookOption[]>([])
const featuredBookIds = ref<string[]>([])
const originalFeaturedBookIds = ref<string[]>([])
const featuredTotal = ref(0)
const featuredCount = ref(0)
const featuredPage = ref(1)
const featuredLoading = ref(true)
const featuredSaving = ref(false)
const featuredError = ref('')
const featuredReady = ref(false)
const hero = reactive({ ...defaultLandingHero })
const originalHero = ref({ ...defaultLandingHero })
const featuredPageCount = computed(() => Math.max(1, Math.ceil(featuredTotal.value / 12)))
const featuredCountOutsideScope = computed(() =>
  Math.max(0, featuredCount.value - originalFeaturedBookIds.value.length),
)
const hasFeaturedChanges = computed(
  () =>
    hero.heading !== originalHero.value.heading ||
    hero.body !== originalHero.value.body ||
    featuredBookIds.value.length !== originalFeaturedBookIds.value.length ||
    featuredBookIds.value.some((id) => !originalFeaturedBookIds.value.includes(id)),
)
function featuredRequestError(error: unknown, fallback: string) {
  const response = error as { data?: { statusMessage?: string }; statusMessage?: string }
  return response.data?.statusMessage ?? response.statusMessage ?? fallback
}
async function loadFeaturedBooks(page = 1, initialize = !featuredReady.value) {
  featuredLoading.value = true
  featuredError.value = ''
  try {
    const result = await $fetch<FeaturedBooksPage>('/api/admin/featured-books', {
      query: { q: featuredSearch.value.trim(), page },
    })
    featuredBooks.value = result.books
    featuredTotal.value = result.total
    featuredPage.value = result.page
    if (initialize) {
      Object.assign(hero, result.hero)
      originalHero.value = { ...result.hero }
      featuredReady.value = true
      featuredBookIds.value = [...result.selectedIds]
      originalFeaturedBookIds.value = [...result.selectedIds]
      featuredCount.value = result.selectedCount
    }
  } catch (error) {
    featuredError.value = featuredRequestError(
      error,
      'Daftar buku pilihan gagal dimuat. Silakan coba lagi.',
    )
  } finally {
    featuredLoading.value = false
  }
}
function toggleFeaturedBook(book: FeaturedBookOption, event: Event) {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  const selected = featuredBookIds.value.includes(book.id)
  if (input.checked && !selected) {
    if (featuredBookIds.value.length + featuredCountOutsideScope.value >= maxFeaturedBooks) {
      input.checked = false
      return
    }
    featuredBookIds.value = [...featuredBookIds.value, book.id]
  } else if (!input.checked && selected) {
    featuredBookIds.value = featuredBookIds.value.filter((id) => id !== book.id)
  }
}
async function saveFeaturedSelection() {
  if (featuredSaving.value || !featuredReady.value || !hasFeaturedChanges.value) return
  const parsedHero = landingHeroSchema.safeParse(hero)
  if (!parsedHero.success) {
    featuredError.value = parsedHero.error.issues[0]?.message ?? 'Teks hero tidak valid.'
    return
  }
  featuredSaving.value = true
  featuredError.value = ''
  try {
    await $fetch('/api/admin/featured-books', {
      method: 'PUT',
      body: { bookIds: featuredBookIds.value, hero: parsedHero.data },
    })
  } catch (error) {
    featuredError.value = featuredRequestError(
      error,
      'Buku pilihan gagal diperbarui. Silakan coba lagi.',
    )
    featuredSaving.value = false
    return
  }
  message.value = 'Buku pilihan dan teks hero berhasil diperbarui.'
  featuredSaving.value = false
  await loadFeaturedBooks(featuredPage.value, true)
}

onMounted(() => loadFeaturedBooks(1, true))
</script>
<template>
  <div>
    <p v-if="message" role="status" class="featured-success">{{ message }}</p>
    <section class="featured-page" aria-labelledby="featured-dialog-title">
      <div class="featured-dialog-heading">
        <div>
          <h1 id="featured-dialog-title">Atur Buku Pilihan</h1>
          <p id="featured-dialog-description">
            Pilih maksimal {{ maxFeaturedBooks }} buku. Buku draf baru tampil di beranda setelah
            dipublikasikan.
          </p>
        </div>
        <p class="featured-count" aria-live="polite">
          {{ featuredBookIds.length + featuredCountOutsideScope }} / {{ maxFeaturedBooks }}
        </p>
      </div>
      <p v-if="featuredCountOutsideScope" class="featured-scope-note" role="status">
        {{ featuredCountOutsideScope }} buku pilihan berada di jenjang di luar akses Anda.
      </p>
      <fieldset
        class="hero-settings"
        :disabled="!featuredReady || featuredLoading || featuredSaving"
      >
        <legend>Teks hero landing</legend>
        <label for="hero-heading">Heading</label>
        <input id="hero-heading" v-model="hero.heading" type="text" maxlength="100" required />
        <p class="field-help">Maksimal 100 karakter.</p>
        <label for="hero-body">Isi</label>
        <textarea id="hero-body" v-model="hero.body" rows="3" maxlength="400" required />
        <p class="field-help">Maksimal 400 karakter. Perubahan tampil untuk semua pengunjung.</p>
      </fieldset>
      <form class="featured-search" @submit.prevent="loadFeaturedBooks(1)">
        <label for="featured-search">Cari buku</label>
        <input
          id="featured-search"
          v-model="featuredSearch"
          type="search"
          maxlength="100"
          placeholder="Judul, kode buku, atau penulis"
          :disabled="featuredLoading || featuredSaving"
        />
        <UButton
          type="submit"
          variant="outline"
          :loading="featuredLoading"
          :disabled="featuredLoading || featuredSaving"
          >Cari</UButton
        >
      </form>
      <p v-if="featuredError" role="alert" class="featured-error">{{ featuredError }}</p>
      <div
        class="featured-books-list"
        :aria-busy="featuredLoading"
        aria-label="Pilih buku untuk ditampilkan di beranda"
      >
        <p v-if="featuredLoading" role="status" class="featured-empty">Memuat buku...</p>
        <label
          v-for="book in featuredBooks"
          v-else
          :key="book.id"
          class="featured-book-option"
          :class="{ selected: featuredBookIds.includes(book.id) }"
        >
          <input
            type="checkbox"
            :checked="featuredBookIds.includes(book.id)"
            :disabled="
              featuredSaving ||
              (!featuredBookIds.includes(book.id) &&
                featuredBookIds.length + featuredCountOutsideScope >= maxFeaturedBooks)
            "
            @change="toggleFeaturedBook(book, $event)"
          />
          <img :src="book.imageUrl" :alt="`Sampul ${book.title}`" width="44" height="64" />
          <span class="featured-book-details">
            <span class="featured-book-title">{{ book.title }}</span>
            <span>
              {{ book.bookCode || 'Kode buku belum diisi' }} ·
              {{ book.educationLevel || 'Jenjang belum diisi' }}
            </span>
            <span :class="book.published ? 'featured-published' : 'featured-draft'">{{
              book.published ? 'Dipublikasikan' : 'Draf'
            }}</span>
          </span>
        </label>
        <p
          v-if="!featuredLoading && !featuredError && !featuredBooks.length"
          class="featured-empty"
        >
          Tidak ada buku yang cocok. Coba kata pencarian lain.
        </p>
      </div>
      <div class="featured-dialog-footer">
        <p>{{ featuredTotal }} buku · Halaman {{ featuredPage }} dari {{ featuredPageCount }}</p>
        <div class="featured-page-actions">
          <UButton
            variant="outline"
            :disabled="featuredPage <= 1 || featuredLoading || featuredSaving"
            @click="loadFeaturedBooks(featuredPage - 1)"
            >Sebelumnya</UButton
          >
          <UButton
            variant="outline"
            :disabled="featuredPage >= featuredPageCount || featuredLoading || featuredSaving"
            @click="loadFeaturedBooks(featuredPage + 1)"
            >Berikutnya</UButton
          >
        </div>
      </div>
      <div class="featured-dialog-actions">
        <UButton
          color="neutral"
          variant="outline"
          :disabled="featuredSaving || featuredLoading"
          @click="loadFeaturedBooks(featuredPage, true)"
          >Batalkan perubahan</UButton
        >
        <UButton
          class="dashboard-primary"
          :loading="featuredSaving"
          :disabled="!featuredReady || !hasFeaturedChanges || featuredLoading"
          @click="saveFeaturedSelection"
          >Simpan pilihan</UButton
        >
      </div>
    </section>
  </div>
</template>
<style scoped>
.featured-page {
  margin-top: 20px;
  padding: 28px;
  border: 1px solid #e6e8e4;
  border-radius: 20px;
  background: white;
  color: #222;
}
.featured-success {
  margin-top: 20px;
  color: #1f5c3f;
}
.hero-settings {
  display: grid;
  gap: 6px;
  margin-top: 20px;
  padding: 16px;
  border: 1px solid #dce8e0;
  border-radius: 12px;
}
.hero-settings legend,
.hero-settings label {
  font-size: 13px;
  font-weight: 600;
}
.hero-settings input,
.hero-settings textarea {
  width: 100%;
  min-width: 0;
  padding: 8px 12px;
  border: 1px solid #d6d3d1;
  border-radius: 10px;
  background: white;
  font-size: 14px;
}
.hero-settings textarea {
  resize: vertical;
}
.hero-settings .field-help {
  color: #6b6f6b;
  font-size: 12px;
}
.featured-dialog-heading,
.featured-dialog-footer,
.featured-dialog-actions,
.featured-search {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.featured-dialog-heading h1 {
  font: 500 24px/1.3 var(--font-landing-serif);
}
.featured-dialog-heading p,
.featured-dialog-footer > p {
  color: #6b6f6b;
  font-size: 13px;
  line-height: 20px;
}
.featured-count {
  flex: 0 0 auto;
  color: #1f5c3f !important;
  font-weight: 700;
}
.featured-scope-note,
.featured-error {
  margin-top: 14px;
  font-size: 13px;
  line-height: 20px;
}
.featured-scope-note {
  color: #92400e;
}
.featured-error {
  color: #b91c1c;
}
.featured-search {
  margin-top: 20px;
}
.featured-search label {
  flex: 0 0 auto;
  font-size: 13px;
  font-weight: 600;
}
.featured-search input {
  flex: 1;
  min-width: 0;
  height: 42px;
  padding: 8px 12px;
  border: 1px solid #d6d3d1;
  border-radius: 10px;
  font-size: 14px;
}
.featured-books-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}
.featured-book-option {
  display: flex;
  min-height: 82px;
  align-items: center;
  gap: 14px;
  padding: 9px 12px;
  border: 1px solid #e6e8e4;
  border-radius: 12px;
  cursor: pointer;
}
.featured-book-option.selected {
  border-color: #8eb49d;
  background: #f4f8f5;
}
.featured-book-option input {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  accent-color: #1f5c3f;
}
.featured-book-option img {
  width: 44px;
  height: 64px;
  flex: 0 0 auto;
  border-radius: 3px;
  object-fit: contain;
}
.featured-book-details {
  display: grid;
  min-width: 0;
  gap: 2px;
  color: #6b6f6b;
  font-size: 12px;
  line-height: 18px;
}
.featured-book-details > span {
  overflow-wrap: anywhere;
}
.featured-book-title {
  color: #242b26;
  font-size: 14px;
  font-weight: 600;
}
.featured-published {
  color: #1f5c3f;
}
.featured-draft {
  color: #92400e;
}
.featured-empty {
  padding: 28px 12px;
  color: #6b6f6b;
  font-size: 14px;
  text-align: center;
}
.featured-dialog-footer {
  flex-wrap: wrap;
  margin-top: 16px;
}
.featured-page-actions,
.featured-dialog-actions {
  display: flex;
  gap: 8px;
}
.featured-dialog-actions {
  justify-content: flex-end;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #e6e8e4;
}
.dashboard-primary {
  display: inline-flex;
  justify-content: center;
  min-height: 44px;
  padding: 10px 22px;
  border: 1px solid #1f5c3f;
  border-radius: 12px;
  background: #1f5c3f;
  color: white;
  font-size: 15px;
  font-weight: 500;
  line-height: 24px;
  white-space: nowrap;
}
.dashboard-primary:hover {
  background: #17462f;
}

@media (max-width: 700px) {
  .featured-page {
    padding: 20px 16px;
  }
  .featured-dialog-heading,
  .featured-search {
    align-items: stretch;
    flex-direction: column;
  }
  .featured-search input {
    width: 100%;
  }
}
</style>
