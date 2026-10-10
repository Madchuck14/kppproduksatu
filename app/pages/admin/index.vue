<script setup lang="ts">
import { editorQuerySchema } from '#shared/schemas/editor'
import { getSubjectsForLevel, type BookSubject } from '#shared/utils/book-subjects'
import { educationLevelSchema } from '#shared/schemas/auth'
import type { EditorBook } from '#shared/types/editor'

definePageMeta({ middleware: 'admin' })
useSeoMeta({ title: 'Dashboard Editor', robots: 'noindex, nofollow' })
const route = useRoute()
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
  return [...new Set(selectedLevels.flatMap((item) => getSubjectsForLevel(item)))]
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
          Rawat informasi buku agar tim Sales selalu membawa katalog yang tepat.
        </p>
      </div>
      <UButton to="/admin/books/new" class="dashboard-primary" :disabled="!levels.length"
        >+ Tambah buku</UButton
      >
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
          tabindex="0"
          aria-label="Daftar buku, geser untuk melihat semua kolom"
        >
          <table v-if="data.books.length" class="dashboard-table">
            <colgroup>
              <col class="column-book" />
              <col class="column-level" />
              <col class="column-subject" />
              <col class="column-price" />
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
                <th scope="col">Materi</th>
                <th scope="col">Status</th>
                <th scope="col">Tindakan</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="book in data.books" :key="book.id">
                <td>
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
                <td>{{ book.educationLevel || 'Belum diisi' }}</td>
                <td>{{ book.subject || 'Belum ditentukan' }}</td>
                <td class="book-price">{{ formatPrice(book.price) }}</td>
                <td>
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
                <td>
                  <span class="book-status" :class="{ published: book.published }">{{
                    book.published ? 'Dipublikasikan' : 'Draf'
                  }}</span>
                </td>
                <td>
                  <div class="book-actions">
                    <NuxtLink :to="`/admin/books/${book.id}`">Edit</NuxtLink>
                    <NuxtLink v-if="book.published" :to="`/products/${book.slug}`">Lihat</NuxtLink>
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
  min-width: 1080px;
  table-layout: fixed;
  border-collapse: collapse;
  text-align: left;
}
.column-book {
  width: 28%;
}
.column-level {
  width: 7%;
}
.column-subject {
  width: 17%;
}
.column-price {
  width: 12%;
}
.column-materials {
  width: 6%;
}
.column-status {
  width: 13%;
}
.column-actions {
  width: 17%;
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
}
</style>
