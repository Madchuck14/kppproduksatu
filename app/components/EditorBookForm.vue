<script setup lang="ts">
import { bookInputSchema } from '#shared/schemas/editor'
import { getSubjectsForLevel } from '#shared/utils/book-subjects'
import type { BookSubject } from '#shared/utils/book-subjects'
import { educationLevelSchema } from '#shared/schemas/auth'
import { getGradesForLevel } from '#shared/utils/book-grades'
import type { EditorBook } from '#shared/types/editor'
import type { AccountSession } from '#shared/types/account'

const props = defineProps<{
  book?: EditorBook
  account: AccountSession
}>()
const savedId = ref(props.book?.id)
// UI-only fields: connect these to the API after the database migration.
const draftDetails = reactive({
  isbn: '',
  curriculum: '',
  contents: '',
  benefits: '',
})
const materials = [
  { kind: 'flyer', label: 'Flyer', help: 'PDF, maksimal 20 MB' },
  { kind: 'dummy', label: 'Dummy Buku', help: 'PDF, maksimal 20 MB' },
  { kind: 'product-knowledge', label: 'Product Knowledge', help: 'PDF, maksimal 50 MB' },
] as const
const form = reactive({
  bookCode: props.book?.bookCode ?? '',
  educationLevel: props.book?.educationLevel ?? '',
  grade: props.book?.grade ?? null,
  subject: (props.book?.subject ?? '') as BookSubject | '',
  title: props.book?.title ?? '',
  author: props.book?.author ?? '',
  description: props.book?.description ?? '',
  highlights: props.book?.highlights?.length ? [...props.book.highlights] : ['', ''],
  price: props.book?.price ?? 0,
  publicationYear: props.book?.publicationYear ?? null,
  featured: props.book?.featured ?? false,
  published: props.book?.published ?? false,
})
const levels = computed(() =>
  props.account.isSuper ? educationLevelSchema.options : props.account.educationLevels,
)
const subjectOptions = computed(() => getSubjectsForLevel(form.educationLevel))
const gradeOptions = computed(() => getGradesForLevel(form.educationLevel))
watch(
  () => form.educationLevel,
  () => {
    if (!subjectOptions.value.some((item) => item === form.subject)) form.subject = ''
    if (form.grade !== null && !gradeOptions.value.includes(form.grade)) form.grade = null
  },
)
const busy = ref(false)
const progress = ref('')
const message = ref('')
const errors = ref<Record<string, string>>({})
const file = shallowRef<File | null>(null)
const materialFiles = reactive<Record<'flyer' | 'dummy' | 'product-knowledge', File | null>>({
  flyer: null,
  dummy: null,
  'product-knowledge': null,
})
const imageUrl = ref(props.book?.imageUrl ?? '/images/book-placeholder.svg')
let localPreview: string | undefined
function releasePreview() {
  if (localPreview) URL.revokeObjectURL(localPreview)
}
onBeforeUnmount(releasePreview)
function selectImage(event: Event) {
  const input = event.target as HTMLInputElement
  const selected = input.files?.[0]
  message.value = ''
  file.value = null
  releasePreview()
  imageUrl.value = props.book?.imageUrl ?? '/images/book-placeholder.svg'
  if (!selected) return
  if (
    !['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(selected.type) ||
    selected.size > 2 * 1024 * 1024
  ) {
    message.value = 'Pilih sampul JPG, PNG, WebP, atau AVIF dengan ukuran maksimal 2 MB.'
    input.value = ''
    return
  }
  file.value = selected
  localPreview = URL.createObjectURL(selected)
  imageUrl.value = localPreview
}
function selectMaterial(kind: keyof typeof materialFiles, event: Event) {
  const input = event.target as HTMLInputElement
  const selected = input.files?.[0] ?? null
  message.value = ''
  materialFiles[kind] = null
  if (!selected) return
  const isPdf = selected.type === 'application/pdf'
  const maxSize = kind === 'product-knowledge' ? 50 * 1024 * 1024 : 20 * 1024 * 1024
  if (!isPdf || selected.size > maxSize) {
    message.value =
      kind === 'product-knowledge'
        ? 'Pilih Product Knowledge PDF maksimal 50 MB.'
        : 'Pilih berkas PDF maksimal 20 MB.'
    input.value = ''
    return
  }
  materialFiles[kind] = selected
}
async function save() {
  if (busy.value) return
  message.value = ''
  errors.value = {}
  if (
    draftDetails.isbn.trim() ||
    draftDetails.curriculum.trim() ||
    draftDetails.contents.trim() ||
    draftDetails.benefits.trim()
  ) {
    message.value =
      'ISBN, kurikulum, isi buku, dan manfaat belum dapat disimpan. Penyimpanan kolom baru menunggu pembaruan database. Isian tetap tersedia selama halaman ini terbuka.'
    return
  }
  const parsed = bookInputSchema.safeParse({
    ...form,
    highlights: form.highlights.map((item) => item.trim()).filter(Boolean),
    publicationYear: form.publicationYear || null,
    subject: form.subject || null,
  })
  if (!parsed.success) {
    for (const issue of parsed.error.issues) errors.value[String(issue.path[0])] ??= issue.message
    message.value = 'Periksa kembali kolom yang ditandai.'
    return
  }
  busy.value = true
  let metadataSaved = false
  try {
    progress.value = 'Menyimpan informasi buku...'
    const book = savedId.value
      ? await $fetch<EditorBook>(`/api/admin/books/${savedId.value}`, {
          method: 'PUT',
          body: parsed.data,
        })
      : await $fetch<EditorBook>('/api/admin/books', { method: 'POST', body: parsed.data })
    savedId.value = book.id
    metadataSaved = true
    if (file.value) {
      progress.value = 'Mengunggah sampul...'
      await $fetch(`/api/admin/books/${book.id}/image`, {
        method: 'POST',
        body: file.value,
        headers: { 'Content-Type': file.value.type },
      })
      file.value = null
    }
    for (const kind of ['flyer', 'dummy', 'product-knowledge'] as const) {
      const material = materialFiles[kind]
      if (!material) continue
      const label =
        kind === 'dummy' ? 'Dummy Buku' : kind === 'flyer' ? 'flyer' : 'Product Knowledge'
      progress.value = `Mengunggah ${label}...`
      await $fetch(`/api/admin/books/${book.id}/materials/${kind}`, {
        method: 'POST',
        body: material,
        headers: { 'Content-Type': material.type },
      })
      materialFiles[kind] = null
    }
    await navigateTo('/admin?notice=saved')
  } catch (error) {
    const detail = (error as { data?: { statusMessage?: string } }).data?.statusMessage
    if (!metadataSaved && detail === 'Nama buku telah terpakai')
      window.alert('Nama buku telah terpakai.')
    message.value = metadataSaved
      ? 'Informasi buku sudah tersimpan, tetapi satu atau lebih berkas gagal diunggah. Coba simpan kembali untuk mengulang unggahan.'
      : (detail ?? 'Buku gagal disimpan. Silakan coba lagi.')
  } finally {
    busy.value = false
    progress.value = ''
  }
}
</script>

<template>
  <form class="create-book-form" :aria-busy="busy" @submit.prevent="save">
    <div class="form-toolbar">
      <NuxtLink to="/admin">← Kembali ke dashboard</NuxtLink>
      <span>Kolom bertanda <span aria-hidden="true">*</span> wajib diisi</span>
    </div>
    <h1>{{ book ? 'Edit buku' : 'Tambah buku' }}</h1>
    <p class="form-intro">Lengkapi informasi dan tentukan kapan buku tampil di katalog publik.</p>
    <p v-if="message" role="alert" class="form-alert">{{ message }}</p>
    <fieldset :disabled="busy" class="form-columns">
      <legend class="sr-only">Informasi buku</legend>
      <div class="form-primary">
        <section class="form-card identity-card" aria-labelledby="identity-heading">
          <h2 id="identity-heading">Identitas buku</h2>
          <div class="form-field">
            <label for="new-book-title">Judul buku <span class="required">*</span></label>
            <input
              id="new-book-title"
              v-model="form.title"
              required
              maxlength="200"
              :aria-invalid="!!errors.title"
            />
            <p class="field-help">
              Tambahkan tahun publikasi di akhir seri buku dengan nama yang sama.
            </p>
            <p v-if="errors.title" class="field-error">{{ errors.title }}</p>
          </div>
          <div class="form-field">
            <label for="new-book-author"
              >Penulis <span v-if="!book" class="required">*</span></label
            >
            <input id="new-book-author" v-model="form.author" :required="!book" maxlength="200" />
          </div>
          <div class="field-row">
            <div class="form-field">
              <label for="new-book-code">Kode buku <span class="required">*</span></label>
              <input
                id="new-book-code"
                v-model="form.bookCode"
                required
                maxlength="50"
                inputmode="numeric"
                pattern="[0-9]+"
                placeholder="Contoh: 123456"
                :aria-invalid="!!errors.bookCode"
              />
              <p class="field-help">Kode unik; hanya angka.</p>
              <p v-if="errors.bookCode" class="field-error">{{ errors.bookCode }}</p>
            </div>
            <div class="form-field">
              <label for="new-book-isbn">ISBN</label>
              <input
                id="new-book-isbn"
                v-model="draftDetails.isbn"
                maxlength="32"
                placeholder="Contoh: 978-623-0000-00-0"
                aria-describedby="new-fields-note"
              />
            </div>
          </div>
          <div class="field-row">
            <div class="form-field">
              <label for="new-book-price">Harga (Rp) <span class="required">*</span></label>
              <input
                id="new-book-price"
                v-model.number="form.price"
                type="number"
                required
                min="0"
                max="2147483647"
                step="1"
                :aria-invalid="!!errors.price"
              />
              <p v-if="errors.price" class="field-error">{{ errors.price }}</p>
            </div>
            <div class="form-field">
              <label for="new-book-year"
                >Tahun terbit <span v-if="!book" class="required">*</span></label
              >
              <input
                id="new-book-year"
                v-model.number="form.publicationYear"
                type="number"
                :required="!book"
                min="1000"
                max="9999"
                step="1"
                placeholder="Contoh: 2026"
                :aria-invalid="!!errors.publicationYear"
              />
              <p v-if="errors.publicationYear" class="field-error">{{ errors.publicationYear }}</p>
            </div>
          </div>
        </section>
        <section class="form-card classification-card" aria-labelledby="classification-heading">
          <h2 id="classification-heading">Klasifikasi</h2>
          <div class="field-row">
            <div class="form-field">
              <label for="new-book-level">Jenjang pendidikan <span class="required">*</span></label>
              <select
                id="new-book-level"
                v-model="form.educationLevel"
                required
                :aria-invalid="!!errors.educationLevel"
              >
                <option value="" disabled>Pilih jenjang</option>
                <option v-for="item in levels" :key="item" :value="item">{{ item }}</option>
              </select>
              <p v-if="errors.educationLevel" class="field-error">{{ errors.educationLevel }}</p>
            </div>
            <div class="form-field">
              <label for="new-book-grade">Kelas <span v-if="!book" class="required">*</span></label>
              <select
                id="new-book-grade"
                v-model="form.grade"
                :required="!book"
                :disabled="!gradeOptions.length"
                :aria-invalid="!!errors.grade"
                aria-describedby="new-book-grade-help"
              >
                <option :value="null" :disabled="!book">
                  {{
                    book
                      ? 'Belum ditentukan'
                      : form.educationLevel
                        ? 'Pilih kelas'
                        : 'Pilih jenjang dulu'
                  }}
                </option>
                <option v-for="item in gradeOptions" :key="item" :value="item">
                  Kelas {{ item }}
                </option>
              </select>
              <p id="new-book-grade-help" class="field-help">
                Pilih jenjang untuk menampilkan kelas.
              </p>
              <p v-if="errors.grade" class="field-error">{{ errors.grade }}</p>
            </div>
          </div>
          <div class="field-row">
            <div class="form-field">
              <label for="new-book-subject"
                >Mata pelajaran <span v-if="!book" class="required">*</span></label
              >
              <select
                id="new-book-subject"
                v-model="form.subject"
                :required="!book"
                :disabled="!subjectOptions.length"
                :aria-invalid="!!errors.subject"
                aria-describedby="new-book-subject-help"
              >
                <option value="" :disabled="!book">
                  {{
                    book
                      ? 'Belum ditentukan'
                      : form.educationLevel
                        ? 'Pilih mata pelajaran'
                        : 'Pilih jenjang dulu'
                  }}
                </option>
                <option v-for="item in subjectOptions" :key="item" :value="item">{{ item }}</option>
              </select>
              <p id="new-book-subject-help" class="field-help">
                Pilih jenjang untuk menampilkan mata pelajaran.
              </p>
              <p v-if="errors.subject" class="field-error">{{ errors.subject }}</p>
            </div>
            <div class="form-field">
              <label for="new-book-curriculum">Kurikulum <span class="required">*</span></label>
              <select
                id="new-book-curriculum"
                v-model="draftDetails.curriculum"
                class="curriculum-select"
                aria-describedby="new-fields-note"
              >
                <option value=""></option>
                <option value="Kurikulum Merdeka">Kurikulum Merdeka</option>
                <option value="Kurikulum 2013">Kurikulum 2013</option>
              </select>
            </div>
          </div>
        </section>
        <section class="form-card description-card" aria-labelledby="description-heading">
          <h2 id="description-heading">Deskripsi buku</h2>
          <div class="form-field">
            <label for="new-book-description">Deskripsi singkat</label>
            <textarea
              id="new-book-description"
              v-model="form.description"
              :maxlength="book ? 20000 : 300"
              class="short-description"
              placeholder="Satu atau dua kalimat yang tampil di bawah judul."
            />
            <p class="field-help description-help">Tampil di bawah judul pada halaman detail.</p>
            <p class="character-count">
              {{ form.description.length.toLocaleString('id-ID') }} / {{ book ? '20.000' : '300' }}
            </p>
          </div>
          <div class="form-field">
            <label for="new-book-contents">Isi buku</label>
            <textarea
              id="new-book-contents"
              v-model="draftDetails.contents"
              maxlength="2000"
              placeholder="Jelaskan cakupan materi yang dibahas."
              aria-describedby="new-fields-note"
            />
            <p class="character-count">
              {{ draftDetails.contents.length.toLocaleString('id-ID') }} / 2.000
            </p>
          </div>
          <div class="form-field">
            <label for="new-book-benefits">Manfaat</label>
            <textarea
              id="new-book-benefits"
              v-model="draftDetails.benefits"
              maxlength="1000"
              placeholder="Jelaskan manfaat yang didapat siswa dan guru."
              aria-describedby="new-fields-note"
            />
            <p class="character-count">
              {{ draftDetails.benefits.length.toLocaleString('id-ID') }} / 1.000
            </p>
          </div>
          <div class="form-field highlights-field">
            <span class="field-label">Keunggulan</span>
            <p v-if="errors.highlights" class="field-error">{{ errors.highlights }}</p>
            <div v-for="(_, index) in form.highlights" :key="index" class="highlight-row">
              <input
                v-model="form.highlights[index]"
                :aria-label="`Keunggulan ${index + 1}`"
                maxlength="200"
                placeholder="Contoh: Latihan bertingkat di setiap bab"
              />
              <button
                type="button"
                class="remove-highlight"
                :aria-label="`Hapus keunggulan ${index + 1}`"
                @click="form.highlights.splice(index, 1)"
              >
                ×
              </button>
            </div>
            <button
              type="button"
              class="add-highlight"
              :disabled="form.highlights.length >= 6"
              @click="form.highlights.push('')"
            >
              + Tambah poin
            </button>
            <p class="field-help">Maksimal 6 poin. Tampil sebagai daftar poin di halaman detail.</p>
          </div>
        </section>
      </div>
      <aside class="form-sidebar">
        <section class="form-card cover-card" aria-labelledby="cover-heading">
          <h2 id="cover-heading">Sampul buku</h2>
          <div class="cover-preview">
            <img
              v-if="file || book?.imageUrl"
              :src="imageUrl"
              alt="Pratinjau sampul buku"
              class="selected-cover"
            />
            <div v-else class="empty-cover" aria-label="Pratinjau sampul kosong">
              <span>Koleksi Buku</span>
            </div>
          </div>
          <label for="new-book-cover" class="file-heading">{{
            book ? 'Ganti sampul' : 'Pilih sampul'
          }}</label>
          <div class="file-picker">
            <label class="file-button" for="new-book-cover"
              >Pilih file<input
                id="new-book-cover"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                @change="selectImage"
            /></label>
            <span class="file-name">{{
              file?.name ?? (book?.imageUrl ? 'Sampul saat ini' : 'Belum ada file')
            }}</span>
          </div>
          <p class="field-help">
            JPG, PNG, WebP, atau AVIF. Maksimal 2 MB. Sampul dapat dilihat publik, termasuk untuk
            buku draf.
          </p>
        </section>
        <section class="form-card materials-card" aria-labelledby="materials-heading">
          <h2 id="materials-heading">Materi privat</h2>
          <div v-for="item in materials" :key="item.kind" class="material-upload">
            <label :for="`new-book-${item.kind}`" class="file-heading">{{ item.label }}</label>
            <p class="field-help">{{ item.help }}</p>
            <div class="file-picker">
              <label class="file-button" :for="`new-book-${item.kind}`"
                ><img src="/images/editor/upload.svg" alt="" width="16" height="16" />Pilih
                file<input
                  :id="`new-book-${item.kind}`"
                  type="file"
                  accept="application/pdf"
                  @change="selectMaterial(item.kind, $event)"
              /></label>
              <span class="file-name">{{
                materialFiles[item.kind]?.name ??
                (book?.resources[item.kind === 'product-knowledge' ? 'productKnowledge' : item.kind]
                  ? 'Berkas sudah tersedia'
                  : 'Belum ada file')
              }}</span>
            </div>
          </div>
          <p class="privacy-note">Materi disimpan privat dan tidak masuk bucket sampul publik.</p>
        </section>
        <section class="form-card publication-card" aria-labelledby="publication-heading">
          <h2 id="publication-heading">Publikasi</h2>
          <label class="publication-option"
            ><input v-model="form.published" type="checkbox" /><span
              ><strong>Publikasikan buku</strong
              ><span>Tampil di katalog dan dapat dibuka oleh Sales.</span></span
            ></label
          >
          <label class="publication-option"
            ><input v-model="form.featured" type="checkbox" /><span
              ><strong>Jadikan buku pilihan</strong
              ><span
                >Ditampilkan pada beranda dan diberi label Buku Pilihan jika sudah
                dipublikasikan.</span
              ></span
            ></label
          >
        </section>
        <div class="form-actions">
          <UButton type="submit" :loading="busy" :disabled="!levels.length" class="save-book">{{
            book ? 'Simpan perubahan' : 'Simpan buku'
          }}</UButton>
          <UButton to="/admin" variant="outline" :disabled="busy" class="cancel-book"
            >Batal</UButton
          >
          <p v-if="progress" role="status">{{ progress }}</p>
          <p id="new-fields-note" class="field-help">
            ISBN, kurikulum, isi buku, dan manfaat masih pratinjau. Isian belum tersimpan dan akan
            hilang saat meninggalkan halaman; penyimpanan tersedia setelah pembaruan database.
          </p>
        </div>
      </aside>
    </fieldset>
  </form>
</template>

<style scoped>
.create-book-form {
  color: #222;
  font: 400 15px/1.6 var(--font-landing-sans);
}
.form-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding-top: 24px;
  color: #6b6f6b;
  font-size: 13px;
}
.form-toolbar a,
.add-highlight {
  color: #1f5c3f;
}
.form-toolbar a:hover {
  text-decoration: underline;
}
.create-book-form h1 {
  margin-top: 12px;
  font: 500 40px/48px var(--font-landing-serif);
}
.form-intro {
  margin-top: 6px;
  color: #6b6f6b;
}
.form-columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  align-items: start;
  gap: 24px;
  margin-top: 20px;
  min-width: 0;
}
.form-primary,
.form-sidebar {
  display: grid;
  gap: 20px;
  min-width: 0;
}
.form-primary {
  padding-bottom: 20px;
}
.form-card {
  min-width: 0;
  border: 1px solid #e6e8e4;
  border-radius: 20px;
  padding: 26px 28px;
  background: white;
}
.form-card h2 {
  font: 500 22px/27px var(--font-landing-serif);
}
.identity-card {
  min-height: 503px;
}
.classification-card {
  min-height: 325px;
}
.description-card {
  min-height: 843px;
}
.cover-card {
  min-height: 556px;
}
.materials-card {
  min-height: 572px;
}
.publication-card {
  min-height: 244px;
}
.form-field {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 4px;
}
.identity-card > .form-field,
.identity-card > .field-row,
.classification-card > .field-row {
  margin-top: 16px;
}
.identity-card > .form-field:first-of-type,
.classification-card > .field-row:first-of-type {
  margin-top: 18px;
}
.field-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.form-field label,
.field-label {
  font-size: 13px;
  font-weight: 500;
}
.required {
  color: #b3261e;
}
.form-field input,
.form-field select,
.form-field textarea {
  display: block;
  width: 100%;
  min-width: 0;
  height: 46px;
  padding: 12px 14px;
  border: 1px solid #e6e8e4;
  border-radius: 12px;
  background: white;
  font: inherit;
  line-height: 20px;
}
.form-field input::placeholder,
.form-field textarea::placeholder {
  color: #757575;
}
.form-field select {
  appearance: none;
  padding-right: 38px;
  background-image: url('/images/editor/chevron.svg');
  background-repeat: no-repeat;
  background-position: right 16px center;
}
.form-field select:disabled {
  background-color: #f4f8f5;
  background-image: none;
  color: #6b6f6b;
  opacity: 0.7;
}
.form-field .curriculum-select {
  background-image: none;
}
.form-field textarea {
  height: 104px;
  resize: vertical;
  line-height: 24px;
}
.form-field .short-description {
  height: 86px;
}
.field-help,
.character-count {
  color: #6b6f6b;
  font-size: 12px;
  line-height: 19.2px;
}
.character-count {
  margin-top: 5px;
  text-align: right;
}
.description-card {
  display: grid;
  align-content: start;
  gap: 16px;
  padding-bottom: 42px;
}
.description-help {
  margin-top: 9px;
}
.highlight-row {
  display: flex;
  gap: 8px;
}
.remove-highlight {
  flex: 0 0 46px;
  height: 46px;
  border: 1px solid #e6e8e4;
  border-radius: 12px;
  color: #6b6f6b;
  font-size: 18px;
}
.add-highlight {
  align-self: start;
  font-size: 14px;
}
.add-highlight:disabled {
  opacity: 0.5;
}
.cover-card {
  display: grid;
  gap: 9px;
}
.cover-preview {
  display: flex;
  aspect-ratio: 322 / 338;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: #f6f3ee;
}
.empty-cover {
  position: relative;
  display: flex;
  width: 42%;
  aspect-ratio: 2 / 3;
  align-items: center;
  justify-content: center;
  border-radius: 3px 8px 8px 3px;
  background: linear-gradient(160deg, #1f5c3f, #143d2a);
  color: white;
  font: 600 8.5px/9.78px var(--font-landing-serif);
}
.empty-cover::before {
  position: absolute;
  inset: 0 95% 0 0;
  content: '';
  background: rgb(0 0 0 / 18%);
}
.selected-cover {
  max-width: 80%;
  max-height: 280px;
  object-fit: contain;
}
.file-heading {
  font-size: 14px;
  font-weight: 700;
}
.file-picker {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.file-button {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  height: 38px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 16px;
  border: 1px solid #1f5c3f;
  border-radius: 12px;
  color: #1f5c3f;
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
}
.file-button input {
  position: absolute;
  inset: 0;
  width: 100%;
  opacity: 0;
  cursor: pointer;
}
.file-name {
  overflow-wrap: anywhere;
  color: #6b6f6b;
  font-size: 13px;
}
.materials-card {
  display: grid;
  gap: 12px;
}
.material-upload {
  min-width: 0;
  border: 1px dashed #e6e8e4;
  border-radius: 14px;
  padding: 14px 16px;
}
.material-upload:first-of-type {
  padding-top: 20px;
}
.material-upload .file-picker {
  margin-top: 12px;
}
.material-upload .field-help {
  margin-top: 2.5px;
}
.privacy-note {
  color: #6b6f6b;
  font-size: 12.5px;
  line-height: 20px;
}
.publication-card {
  display: grid;
  gap: 14px;
  padding-bottom: 40px;
}
.publication-option {
  display: flex;
  gap: 12px;
  align-items: start;
  font-size: 14px;
}
.publication-option input {
  width: 18px;
  height: 18px;
  margin: 3px 3px 3px 4px;
  flex-shrink: 0;
  accent-color: #1f5c3f;
}
.publication-option strong {
  display: block;
  font-weight: 700;
}
.publication-option span span {
  display: block;
  color: #6b6f6b;
  font-size: 12.5px;
  line-height: 20px;
}
.form-actions {
  display: grid;
  gap: 10px;
}
.save-book,
.cancel-book {
  height: 44px;
  justify-content: center;
  border: 1px solid #1f5c3f;
  border-radius: 12px;
  font: 500 15px/24px var(--font-landing-sans);
}
.save-book {
  background: #1f5c3f;
  color: white;
}
.cancel-book {
  background: white;
  color: #1f5c3f;
}
.form-alert,
.field-error {
  color: #b3261e;
  font-size: 13px;
}
.form-alert {
  margin-top: 16px;
  padding: 12px 16px;
  border: 1px solid #f3c7c4;
  border-radius: 12px;
  background: #fff6f5;
}
.create-book-form :is(input, select, textarea, button, a):focus-visible,
.file-button:focus-within {
  outline: 2px solid #1f5c3f;
  outline-offset: 3px;
}
@media (max-width: 1000px) {
  .form-columns {
    grid-template-columns: minmax(0, 1fr) 320px;
  }
  .form-card {
    padding-inline: 20px;
  }
  .field-row {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 760px) {
  .form-card {
    min-height: auto;
  }
  .form-columns {
    grid-template-columns: 1fr;
  }
  .field-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .form-toolbar {
    flex-wrap: wrap;
  }
  .create-book-form h1 {
    font-size: 32px;
    line-height: 40px;
  }
  .cover-preview {
    aspect-ratio: auto;
    min-height: 300px;
  }
  .empty-cover {
    width: 135px;
  }
}
@media (max-width: 480px) {
  .field-row {
    grid-template-columns: 1fr;
  }
}
</style>
