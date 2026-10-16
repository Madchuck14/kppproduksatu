<script setup lang="ts">
import { editorQuerySchema, maxFeaturedBooks } from '#shared/schemas/editor'
import type { BookSubject } from '#shared/utils/book-subjects'
import { getProductPath } from '#shared/utils/product-path'
import { educationLevelSchema } from '#shared/schemas/auth'
import type { EditorBook, FeaturedBookOption, FeaturedBooksPage } from '#shared/types/editor'
import { defaultLandingHero, landingHeroSchema } from '#shared/schemas/landing-hero'

definePageMeta({ middleware: 'admin' })
useSeoMeta({ title: 'Dashboard Editor', robots: 'noindex, nofollow' })
const route = useRoute()
const { divisions: bookDivisions, subjectsForLevel } = await useClassifications()
const filters = computed(() => {
  const parsed = editorQuerySchema.safeParse(route.query)
  return parsed.success ? parsed.data : editorQuerySchema.parse({})
})
const search = ref(filters.value.q)
const level = ref(filters.value.level ?? '')
const subject = ref<BookSubject | ''>(filters.value.subject ?? '')
const publication = ref(filters.value.status)
watch(filters, (value) => {
  search.value = value.q
  level.value = value.level ?? ''
  publication.value = value.status
  subject.value = value.subject ?? ''
})
const { data, error, status, refresh } = await useFetch('/api/admin/books', { query: filters })
const levels = computed(() =>
  data.value?.account.isSuper
    ? educationLevelSchema.options
    : (data.value?.account.educationLevels ?? []),
)
const subjectOptions = computed(() => {
  const selectedLevels = level.value ? [level.value] : levels.value
  return [...new Set(selectedLevels.flatMap((item) => subjectsForLevel(item)))]
})
watch(level, () => {
  if (!subjectOptions.value.some((item) => item === subject.value)) subject.value = ''
})
const totalPages = computed(() =>
  Math.max(1, Math.ceil((data.value?.total ?? 0) / (data.value?.pageSize ?? 12))),
)
async function applyFilters(page = 1) {
  await navigateTo({
    path: '/admin',
    query: {
      ...(search.value.trim() ? { q: search.value.trim() } : {}),
      ...(level.value ? { level: level.value } : {}),
      ...(subject.value ? { subject: subject.value } : {}),
      ...(publication.value !== 'all' ? { status: publication.value } : {}),
      ...(page > 1 ? { page } : {}),
    },
  })
}
const deleting = ref(false)
const deleteTarget = ref<EditorBook | null>(null)
const confirmation = ref('')
const message = ref('')
const deleteDialog = useTemplateRef('deleteDialog')
const featuredDialog = useTemplateRef<HTMLDialogElement>('featuredDialog')
const featuredSearch = ref('')
const featuredBooks = ref<FeaturedBookOption[]>([])
const featuredBookIds = ref<string[]>([])
const originalFeaturedBookIds = ref<string[]>([])
const featuredTotal = ref(0)
const featuredCount = ref(0)
const featuredPage = ref(1)
const featuredLoading = ref(false)
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
function openFeaturedBooksDialog() {
  if (!data.value?.account.isSuper) return
  featuredReady.value = false
  featuredSearch.value = ''
  featuredBookIds.value = []
  originalFeaturedBookIds.value = []
  featuredCount.value = 0
  featuredTotal.value = 0
  featuredPage.value = 1
  featuredError.value = ''
  featuredDialog.value?.showModal()
  void loadFeaturedBooks(1, true)
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
  if (!data.value?.account.isSuper) return
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
  featuredDialog.value?.close()
  message.value = 'Buku pilihan dan teks hero berhasil diperbarui.'
  featuredSaving.value = false
  try {
    await refresh()
    if (error.value)
      message.value = 'Buku pilihan tersimpan, tetapi daftar dashboard belum dapat dimuat ulang.'
  } catch {
    message.value = 'Buku pilihan tersimpan, tetapi daftar dashboard belum dapat dimuat ulang.'
  }
}
function confirmDelete(book: EditorBook) {
  deleteTarget.value = book
  confirmation.value = ''
  message.value = ''
  deleteDialog.value?.showModal()
}
async function removeBook() {
  if (!deleteTarget.value || confirmation.value !== deleteTarget.value.title || deleting.value)
    return
  deleting.value = true
  try {
    await $fetch(`/api/admin/books/${deleteTarget.value.id}`, { method: 'DELETE' })
    deleteDialog.value?.close()
    deleteTarget.value = null
    message.value = 'Buku berhasil dihapus.'
    await refresh()
    if (!data.value?.books.length && filters.value.page > 1)
      await applyFilters(filters.value.page - 1)
  } catch {
    message.value = 'Buku gagal dihapus. Periksa akses Anda lalu coba lagi.'
  } finally {
    deleting.value = false
  }
}
const fieldClass =
  'w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 caret-emerald-800 placeholder:text-stone-500 focus:outline-2 focus:outline-emerald-700'
</script>

<template>
  <section class="editor-dashboard">
    <div class="dashboard-heading">
      <div>
        <p class="dashboard-eyebrow">Ruang Kerja Editorial</p>
        <h1>Dashboard Editor</h1>
        <p class="dashboard-description">
          Kelola informasi buku agar pengunjung mendapatkan katalog yang tepat.
        </p>
      </div>
      <div class="dashboard-header-actions">
        <ClassificationManager v-if="data?.account.isSuper" :levels="levels" />
        <UButton
          v-if="data?.account.isSuper"
          type="button"
          class="featured-manager-button"
          @click="openFeaturedBooksDialog"
          >Atur Buku Pilihan</UButton
        >
        <UButton to="/admin/books/new" class="dashboard-primary" :disabled="!levels.length"
          >Tambah buku</UButton
        >
      </div>
    </div>
    <div v-if="error" role="alert" class="dashboard-error">
      <p class="font-semibold">Dashboard belum dapat dimuat.</p>
      <p>
        Coba muat ulang. Jika tetap gagal, hubungi pengelola untuk memeriksa akses dan kesiapan
        katalog.
      </p>
      <UButton variant="outline" @click="refresh()">Coba lagi</UButton>
    </div>
    <template v-else-if="data">
      <div class="dashboard-access">
        <div>
          <p class="access-title">{{ data.account.isSuper ? 'Editor super' : 'Editor' }}</p>
          <p>
            {{
              data.account.isSuper
                ? 'Akses seluruh jenjang pendidikan'
                : 'Jenjang yang dapat Anda kelola'
            }}
          </p>
        </div>
        <div class="access-levels">
          <span v-for="item in levels" :key="item">{{ item }}</span>
          <p v-if="!levels.length">Belum ada jenjang. Hubungi pengelola.</p>
        </div>
      </div>
      <dl class="dashboard-stats">
        <div
          v-for="stat in [
            { label: 'Total buku', value: data.stats.total },
            { label: 'Dipublikasikan', value: data.stats.published },
            { label: 'Draf', value: data.stats.draft },
            { label: 'Perlu dilengkapi', value: data.stats.incomplete },
          ]"
          :key="stat.label"
        >
          <dt>{{ stat.label }}</dt>
          <dd>{{ stat.value }}</dd>
        </div>
      </dl>
      <p v-if="data.stats.incomplete" class="dashboard-warning">
        {{ data.stats.incomplete }} buku belum memiliki kode atau jenjang. Buka Edit untuk
        melengkapi sebelum menyimpan perubahan.
      </p>
      <p v-if="message && !deleteTarget" role="status" class="dashboard-notice">{{ message }}</p>
      <p v-else-if="route.query.notice === 'saved'" role="status" class="dashboard-notice">
        Buku berhasil disimpan.
      </p>
      <section class="dashboard-collection" aria-labelledby="collection-title">
        <h2 id="collection-title">Koleksi buku</h2>
        <form class="dashboard-filters" @submit.prevent="applyFilters()">
          <div class="search-field">
            <label for="editor-search">Cari buku</label>
            <input
              id="editor-search"
              v-model="search"
              type="search"
              maxlength="100"
              placeholder="Judul, kode buku, atau penulis"
            />
          </div>
          <div>
            <label for="editor-level">Jenjang</label>
            <select id="editor-level" v-model="level">
              <option value="">Semua jenjang</option>
              <option v-for="item in levels" :key="item" :value="item">{{ item }}</option>
            </select>
          </div>
          <div>
            <label for="editor-subject">Mata pelajaran</label>
            <select id="editor-subject" v-model="subject">
              <option value="">Semua mata pelajaran</option>
              <option v-for="item in subjectOptions" :key="item" :value="item">{{ item }}</option>
            </select>
          </div>
          <div>
            <label for="editor-status">Status</label>
            <select id="editor-status" v-model="publication">
              <option value="all">Semua status</option>
              <option value="published">Dipublikasikan</option>
              <option value="draft">Draf</option>
            </select>
          </div>
          <UButton
            type="submit"
            class="dashboard-primary filter-submit"
            :loading="status === 'pending'"
            >Terapkan</UButton
          >
        </form>
        <div
          class="dashboard-table-scroll"
          :aria-busy="status === 'pending'"
          aria-label="Daftar buku"
        >
          <table v-if="data.books.length" class="dashboard-table">
            <colgroup>
              <col class="column-book" />
              <col class="column-level" />
              <col class="column-subject" />
              <col class="column-price" />
              <col class="column-division" />
              <col class="column-materials" />
              <col class="column-status" />
              <col class="column-actions" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Buku</th>
                <th scope="col">Jenjang</th>
                <th scope="col">Mata pelajaran</th>
                <th scope="col">Harga</th>
                <th scope="col">Divisi</th>
                <th scope="col">Materi</th>
                <th scope="col">Status</th>
                <th scope="col">Tindakan</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="book in data.books" :key="book.id">
                <td data-label="Buku">
                  <div class="dashboard-book">
                    <img
                      :src="book.imageUrl"
                      :alt="`Sampul ${book.title}`"
                      width="40"
                      height="60"
                      loading="lazy"
                    />
                    <div>
                      <NuxtLink :to="`/admin/books/${book.id}`">{{ book.title }}</NuxtLink>
                      <p>{{ book.bookCode || 'Kode belum diisi' }}</p>
                      <p v-if="book.featured" class="book-featured">Buku pilihan</p>
                    </div>
                  </div>
                </td>
                <td data-label="Jenjang">{{ book.educationLevel || 'Belum diisi' }}</td>
                <td data-label="Mata pelajaran">{{ book.subject || 'Belum ditentukan' }}</td>
                <td data-label="Harga" class="book-price">{{ formatPrice(book.price) }}</td>
                <td data-label="Divisi">
                  {{
                    bookDivisions.find((division) => division.code === book.divisionCode)?.name ??
                    'Belum diisi'
                  }}
                </td>
                <td data-label="Materi">
                  <div class="material-dots">
                    <span
                      v-for="material in [
                        { label: 'Flyer', available: book.resources.flyer },
                        { label: 'Presentasi', available: book.resources.productKnowledge },
                        { label: 'Dummy', available: book.resources.dummy },
                      ]"
                      :key="material.label"
                      :class="{ available: material.available }"
                      :title="`${material.label}: ${material.available ? 'tersedia' : 'belum tersedia'}`"
                    >
                      <span class="sr-only"
                        >{{ material.label }}:
                        {{ material.available ? 'tersedia' : 'belum tersedia' }}.</span
                      >
                    </span>
                  </div>
                </td>
                <td data-label="Status">
                  <span class="book-status" :class="{ published: book.published }">{{
                    book.published ? 'Dipublikasikan' : 'Draf'
                  }}</span>
                </td>
                <td data-label="Tindakan">
                  <div class="book-actions">
                    <NuxtLink :to="`/admin/books/${book.id}`">Edit</NuxtLink>
                    <NuxtLink v-if="book.published" :to="getProductPath(book)">Lihat</NuxtLink>
                    <button
                      type="button"
                      :aria-label="`Hapus ${book.title}`"
                      @click="confirmDelete(book)"
                    >
                      Hapus
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else class="dashboard-empty">
            <h3>Belum ada buku yang cocok</h3>
            <p>Ubah pencarian atau tambahkan buku untuk jenjang Anda.</p>
          </div>
        </div>
        <div class="dashboard-pagination">
          <p>{{ data.total }} buku &middot; Halaman {{ filters.page }} dari {{ totalPages }}</p>
          <div>
            <UButton
              variant="outline"
              :disabled="filters.page <= 1 || status === 'pending'"
              @click="applyFilters(filters.page - 1)"
              >Sebelumnya</UButton
            >
            <UButton
              variant="outline"
              :disabled="filters.page >= totalPages || status === 'pending'"
              @click="applyFilters(filters.page + 1)"
              >Berikutnya</UButton
            >
          </div>
        </div>
      </section>
    </template>
    <dialog
      ref="featuredDialog"
      aria-labelledby="featured-dialog-title"
      aria-describedby="featured-dialog-description"
      class="featured-dialog m-auto w-[calc(100%-2rem)] max-w-2xl rounded-2xl border border-stone-200 bg-white p-6 text-stone-900 shadow-xl backdrop:bg-stone-950/50"
      @cancel="featuredSaving ? $event.preventDefault() : null"
    >
      <div class="featured-dialog-heading">
        <div>
          <h2 id="featured-dialog-title">Atur Buku Pilihan</h2>
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
          :disabled="featuredSaving"
          @click="featuredDialog?.close()"
          >Batal</UButton
        >
        <UButton
          class="dashboard-primary"
          :loading="featuredSaving"
          :disabled="!featuredReady || !hasFeaturedChanges || featuredLoading"
          @click="saveFeaturedSelection"
          >Simpan pilihan</UButton
        >
      </div>
    </dialog>
    <dialog
      ref="deleteDialog"
      aria-labelledby="delete-title"
      aria-describedby="delete-instructions"
      class="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-stone-200 bg-white p-6 text-stone-900 shadow-xl [color-scheme:light] backdrop:bg-stone-950/40"
      @cancel="deleting ? $event.preventDefault() : null"
      @close="deleteTarget = null"
    >
      <form @submit.prevent="removeBook">
        <h2 id="delete-title" class="text-xl font-semibold">Hapus buku?</h2>
        <p class="mt-3 text-sm leading-relaxed text-stone-600">
          Buku <strong>{{ deleteTarget?.title }}</strong> akan dihapus dari katalog. Tindakan ini
          tidak dapat dibatalkan.
        </p>
        <p id="delete-instructions" class="mt-5 text-sm leading-relaxed text-stone-700">
          Untuk menghapus buku, ketik judul berikut dengan tepat. Huruf besar, huruf kecil, tanda
          baca, dan spasi harus sama. Tombol Hapus buku aktif setelah judul cocok.
        </p>
        <p
          class="mt-3 select-text break-words rounded-lg bg-stone-100 px-3 py-2 text-sm font-semibold text-stone-900"
        >
          {{ deleteTarget?.title }}
        </p>
        <label for="delete-confirm" class="mb-2 mt-4 block text-sm font-medium"
          >Ketik judul buku di atas</label
        ><input
          id="delete-confirm"
          v-model="confirmation"
          placeholder="Ketik judul buku dengan tepat"
          aria-describedby="delete-instructions delete-match"
          autocomplete="off"
          :disabled="deleting"
          :class="fieldClass"
        />
        <p
          id="delete-match"
          role="status"
          class="mt-2 text-sm"
          :class="confirmation === deleteTarget?.title ? 'text-emerald-800' : 'text-stone-600'"
        >
          {{
            confirmation
              ? confirmation === deleteTarget?.title
                ? 'Judul cocok. Buku siap dihapus setelah Anda menekan Hapus buku.'
                : 'Judul belum cocok. Periksa kembali penulisan judul.'
              : 'Masukkan judul untuk mengaktifkan tombol Hapus buku.'
          }}
        </p>
        <p v-if="message" role="alert" class="mt-3 text-sm text-red-700">{{ message }}</p>
        <div class="mt-6 flex justify-end gap-3">
          <UButton
            color="neutral"
            variant="outline"
            :disabled="deleting"
            @click="deleteDialog?.close()"
            >Batal</UButton
          ><UButton
            type="submit"
            color="error"
            :loading="deleting"
            :disabled="confirmation !== deleteTarget?.title"
            >Hapus buku</UButton
          >
        </div>
      </form>
    </dialog>
  </section>
</template>

<style scoped>
.editor-dashboard {
  color: #222;
  font-family: var(--font-landing-sans);
}
.dashboard-heading {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: end;
  gap: 20px;
  padding: 20px 0;
  margin-bottom: 16px;
}
.dashboard-header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.featured-manager-button,
:deep(.classification-manager-button) {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  padding: 10px 18px;
  border: 1px solid #1f5c3f;
  border-radius: 12px;
  background: white;
  color: #1f5c3f;
  font-size: 15px;
  font-weight: 500;
  line-height: 24px;
  white-space: nowrap;
}
.featured-manager-button:hover,
:deep(.classification-manager-button:hover) {
  background: #f4f8f5;
}
.featured-dialog {
  max-height: 90dvh;
  overflow-y: auto;
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
.featured-dialog-heading h2 {
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
  max-height: min(48dvh, 430px);
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
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
.dashboard-eyebrow {
  color: #1f5c3f;
  font-size: 11px;
  font-weight: 600;
  line-height: 13px;
  letter-spacing: 0.88px;
  text-transform: uppercase;
}
.dashboard-heading h1 {
  margin-top: 4px;
  font: 500 42px/50.4px var(--font-landing-serif);
}
.dashboard-description {
  margin-top: 4px;
  color: #6b6f6b;
  font-size: 15px;
  line-height: 24px;
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
.dashboard-access {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 22px;
  border: 1px solid #e6e8e4;
  border-radius: 16px;
  background: #f4f8f5;
}
.dashboard-access p {
  color: #6b6f6b;
  font-size: 13px;
  line-height: 20.8px;
}
.dashboard-access .access-title {
  color: #222;
  font-size: 15px;
  font-weight: 700;
  line-height: 24px;
}
.access-levels {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.access-levels span {
  padding: 3px 14px;
  border: 1px solid #e6e8e4;
  border-radius: 99px;
  background: white;
  font-size: 13px;
  line-height: 21px;
}
.dashboard-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin: 16px 0;
}
.dashboard-stats > div {
  padding: 18px 20px;
  border: 1px solid #e6e8e4;
  border-radius: 16px;
  background: white;
}
.dashboard-stats dt {
  color: #6b6f6b;
  font-size: 12.5px;
  line-height: 20px;
}
.dashboard-stats dd {
  font: 600 32px/41px var(--font-landing-serif);
}
.dashboard-warning {
  margin-bottom: 16px;
  padding: 14px 18px;
  border: 1px solid #fde68a;
  border-radius: 12px;
  background: #fffbeb;
  color: #92400e;
  font-size: 13px;
  line-height: 21px;
}
.dashboard-notice {
  margin-bottom: 16px;
  color: #1f5c3f;
  font-size: 14px;
}
.dashboard-error {
  padding: 24px;
  border: 1px solid #fecaca;
  border-radius: 16px;
  background: #fef2f2;
  color: #991b1b;
}
.dashboard-error p + p,
.dashboard-error button {
  margin-top: 12px;
}
.dashboard-collection {
  padding: 23px 24px 24px;
  border: 1px solid #e6e8e4;
  border-radius: 20px;
  background: white;
}
.dashboard-collection > h2 {
  font: 500 24px/29px var(--font-landing-serif);
}
.dashboard-filters {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 170px 200px 170px 113px;
  align-items: end;
  gap: 12px;
  padding: 16px 0 20px;
}
.dashboard-filters > div {
  min-width: 0;
}
.dashboard-filters label {
  display: block;
  margin-bottom: 4px;
  color: #6b6f6b;
  font-size: 12px;
  line-height: 20px;
}
.dashboard-filters input,
.dashboard-filters select {
  width: 100%;
  min-width: 0;
  height: 42px;
  padding: 10px 12px;
  border: 1px solid #e6e8e4;
  border-radius: 10px;
  background: white;
  color: #222;
  font-size: 15px;
}
.dashboard-filters input::placeholder {
  color: #757575;
}
.filter-submit {
  min-height: 42px;
  padding-block: 8px;
}
.dashboard-table-scroll {
  position: relative;
  max-width: 100%;
  overflow-x: auto;
  border-radius: 10px;
}
.dashboard-table {
  width: 100%;
  min-width: 0;
  table-layout: fixed;
  border-collapse: collapse;
  text-align: left;
}
.column-book {
  width: 25%;
}
.column-level {
  width: 7%;
}
.column-subject {
  width: 15%;
}
.column-price {
  width: 11%;
}
.column-division {
  width: 11%;
}
.column-materials {
  width: 6%;
}
.column-status {
  width: 11%;
}
.column-actions {
  width: 14%;
}
.dashboard-table th {
  padding: 10px;
  background: #f4f8f5;
  color: #6b6f6b;
  font-size: 11.5px;
  font-weight: 400;
  line-height: 18.4px;
  letter-spacing: 0.57px;
  text-transform: uppercase;
}
.dashboard-table td {
  padding: 18px 10px 14px;
  border-bottom: 1px solid #e6e8e4;
  font-size: 15px;
  line-height: 24px;
  vertical-align: middle;
  overflow-wrap: anywhere;
}
.dashboard-table th:last-child {
  text-align: right;
}
.dashboard-table tbody tr:hover {
  background: #fafcf9;
}
.dashboard-book {
  display: flex;
  align-items: center;
  gap: 12px;
}
.dashboard-book img {
  width: 40px;
  height: 60px;
  flex-shrink: 0;
  object-fit: contain;
  border-radius: 3px;
}
.dashboard-book a {
  font-size: 14px;
  font-weight: 600;
  line-height: 22.4px;
}
.dashboard-book p {
  color: #6b6f6b;
  font-size: 12px;
  line-height: 19.2px;
}
.dashboard-book .book-featured {
  color: #1f5c3f;
}
.book-price {
  white-space: nowrap;
}
.material-dots {
  display: flex;
  gap: 4px;
}
.material-dots > span {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #e6e8e4;
}
.material-dots > span.available {
  background: #1f5c3f;
}
.book-status {
  display: inline-block;
  padding: 2px 12px;
  border-radius: 99px;
  background: #f1f1ed;
  color: #6b6f6b;
  font-size: 12px;
  font-weight: 500;
  line-height: 20px;
  white-space: nowrap;
}
.book-status.published {
  background: #e3f1e8;
  color: #1f5c3f;
}
.book-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: end;
  gap: 14px;
  color: #1f5c3f;
  font-size: 14px;
  line-height: 22.4px;
}
.book-actions button {
  color: #b3261e;
  cursor: pointer;
}
.book-actions a:hover,
.book-actions button:hover,
.dashboard-book a:hover {
  text-decoration: underline;
}
.dashboard-empty {
  padding: 64px 24px;
  text-align: center;
}
.dashboard-empty h3 {
  font-weight: 600;
}
.dashboard-empty p {
  margin-top: 8px;
  color: #6b6f6b;
  font-size: 14px;
}
.dashboard-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-top: 20px;
}
.dashboard-pagination p {
  color: #6b6f6b;
  font-size: 13px;
  line-height: 21px;
}
.dashboard-pagination > div {
  display: flex;
  gap: 8px;
}
.dashboard-pagination button {
  min-height: 38px;
  padding: 6px 16px;
  border: 1px solid #e6e8e4;
  border-radius: 10px;
  color: #1f5c3f;
  background: white;
  box-shadow: none;
  font-size: 14px;
}
.editor-dashboard input:focus-visible,
.editor-dashboard select:focus-visible,
.editor-dashboard button:focus-visible,
.editor-dashboard a:focus-visible,
.dashboard-table-scroll:focus-visible {
  outline: 2px solid #1f5c3f;
  outline-offset: 3px;
}
@media (max-width: 1100px) {
  .dashboard-filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .search-field {
    grid-column: 1/-1;
  }
  .filter-submit {
    align-self: end;
  }
  .dashboard-table,
  .dashboard-table tbody {
    display: block;
  }
  .dashboard-table colgroup,
  .dashboard-table thead {
    display: none;
  }
  .dashboard-table tbody tr {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 16px;
    margin-bottom: 12px;
    padding: 8px 14px;
    border: 1px solid #e6e8e4;
    border-radius: 12px;
  }
  .dashboard-table td {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid #e6e8e4;
    text-align: right;
  }
  .dashboard-table td::before {
    flex: 0 0 auto;
    color: #6b6f6b;
    content: attr(data-label);
    font-size: 11px;
    font-weight: 600;
    text-align: left;
  }
  .dashboard-table td:first-child,
  .dashboard-table td:last-child {
    grid-column: 1 / -1;
  }
  .dashboard-table td:first-child::before {
    content: none;
  }
  .dashboard-table td:last-child {
    border-bottom: 0;
  }
  .dashboard-table td:last-child::before {
    align-self: flex-start;
  }
  .dashboard-table .dashboard-book {
    text-align: left;
  }
  .dashboard-table .book-price {
    white-space: normal;
  }
  .dashboard-table .material-dots,
  .dashboard-table .book-status,
  .dashboard-table .book-actions {
    margin-left: auto;
  }
  .dashboard-table .book-actions {
    justify-content: end;
  }
}
@media (max-width: 700px) {
  .dashboard-heading h1 {
    font-size: 32px;
    line-height: 40px;
  }
  .dashboard-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .dashboard-stats > div {
    padding: 16px;
  }
  .dashboard-collection {
    padding: 20px 16px;
  }
  .dashboard-filters {
    grid-template-columns: minmax(0, 1fr);
  }
  .search-field {
    grid-column: auto;
  }
  .dashboard-access {
    padding: 18px;
  }
  .dashboard-description {
    max-width: 100%;
  }
  .dashboard-heading {
    align-items: start;
  }
  .dashboard-header-actions {
    width: 100%;
  }
  .dashboard-table tbody tr {
    grid-template-columns: minmax(0, 1fr);
  }
  .dashboard-table td:first-child,
  .dashboard-table td:last-child {
    grid-column: auto;
  }
  .dashboard-table td:first-child {
    justify-content: flex-start;
  }
  .dashboard-table td:last-child {
    align-items: flex-start;
  }
  .dashboard-table .book-actions {
    flex-wrap: wrap;
  }
  .featured-dialog {
    padding: 20px 16px;
  }
  .featured-dialog-heading,
  .featured-search {
    align-items: stretch;
    flex-direction: column;
  }
  .featured-count {
    align-self: flex-start;
  }
  .featured-search input {
    width: 100%;
  }
}
</style>
