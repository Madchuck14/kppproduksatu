<script setup lang="ts">
import { bookInputSchema, bookMaterialMaxBytes } from '#shared/schemas/editor'
import type { BookSubject } from '#shared/utils/book-subjects'
import type { DivisionCode } from '#shared/utils/book-divisions'
import { educationLevelSchema } from '#shared/schemas/auth'
import { getGradesForLevel } from '#shared/utils/book-grades'
import type { EditorBook } from '#shared/types/editor'
import type { AccountSession } from '#shared/types/account'
import type { StorageUsage } from '#shared/types/storage-usage'
import { uploadFile } from '~/utils/upload-file'

const props = defineProps<{
  book?: EditorBook
  account: AccountSession
}>()
const savedId = ref(props.book?.id)
let nextAuthorId = 0
const authors = ref(
  (props.book?.author.split(';') ?? ['']).map((name) => ({
    id: nextAuthorId++,
    name: name.trim(),
  })),
)
function authorInputId(id: number) {
  return id === 0 ? 'new-book-author' : `new-book-author-${id}`
}
async function addAuthor() {
  const id = nextAuthorId++
  authors.value.push({ id, name: '' })
  await nextTick()
  document.getElementById(authorInputId(id))?.focus()
}
async function removeAuthor(index: number) {
  if (index < 1) return
  authors.value.splice(index, 1)
  await nextTick()
  const previous = authors.value[index - 1]
  if (previous) document.getElementById(authorInputId(previous.id))?.focus()
}
const materials = [
  { kind: 'dummy', label: 'Dummy Buku', help: 'Format file dalam bentuk PDF, maksimal 50 MB' },
  {
    kind: 'product-knowledge',
    label: 'PPT Produk untuk diunduh',
    help: 'Format file dalam bentuk PPT/PPTX, maksimal 50 MB. Pengunjung mengunduh file ini.',
  },
  {
    kind: 'product-knowledge-preview',
    label: 'PPT Produk untuk pratinjau',
    help: 'Format file dalam bentuk PDF, maksimal 50 MB. File ini dibuka oleh tombol "Tampilkan".',
  },
  {
    kind: 'flyer',
    label: 'Flyer',
    help: 'Format file dalam bentuk PDF, maksimal 10 MB',
  },
] as const
const form = reactive({
  bookCode: props.book?.bookCode ?? '',
  educationLevel: props.book?.educationLevel ?? '',
  divisionCode: (props.book?.divisionCode ?? '') as DivisionCode | '',
  grade: props.book?.grade ?? null,
  subject: (props.book?.subject ?? '') as BookSubject | '',
  title: props.book?.title ?? '',
  curriculum: props.book?.curriculum ?? '',
  isbn: props.book?.isbn ?? '',
  synopsis: props.book?.synopsis ?? '',
  targetMarket: props.book?.targetMarket?.length ? [...props.book.targetMarket] : [''],
  highlights: props.book?.highlights?.length ? [...props.book.highlights] : ['', ''],
  price: props.book?.price ?? 0,
  publicationYear: props.book?.publicationYear ?? null,
  published: props.book?.published ?? false,
})
const levels = computed(() =>
  props.account.isSuper ? educationLevelSchema.options : props.account.educationLevels,
)
const {
  divisions: divisionOptions,
  curricula,
  subjectsForLevel,
  error: classificationError,
  refresh: refreshClassifications,
} = await useClassifications()
const subjectOptions = computed(() =>
  form.educationLevel ? subjectsForLevel(form.educationLevel) : [],
)
const gradeOptions = computed(() => getGradesForLevel(form.educationLevel))
const curriculumOptions = computed(() =>
  [...new Set([props.book?.curriculum, ...curricula.value])].filter((item): item is string =>
    Boolean(item),
  ),
)
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
type UploadKind = 'cover' | keyof typeof bookMaterialMaxBytes
const uploadWarnings = reactive<Partial<Record<UploadKind, string>>>({})
const uploadedMaterials = reactive<Partial<Record<keyof typeof bookMaterialMaxBytes, boolean>>>({})
const uploads = reactive<
  Partial<Record<UploadKind, { percent: number; status: 'uploading' | 'complete' | 'error' }>>
>({})
function beginUpload(kind: UploadKind) {
  uploads[kind] = { percent: 0, status: 'uploading' }
}
function finishUpload(kind: UploadKind) {
  uploads[kind] = { percent: 100, status: 'complete' }
  if (kind !== 'cover') uploadedMaterials[kind] = true
}
const materialFiles = reactive<
  Record<'flyer' | 'dummy' | 'product-knowledge' | 'product-knowledge-preview', File | null>
>({
  flyer: null,
  dummy: null,
  'product-knowledge': null,
  'product-knowledge-preview': null,
})
const materialsDialog = useTemplateRef<HTMLDialogElement>('materialsDialog')
const {
  data: storageUsage,
  status: storageUsageStatus,
  error: storageUsageError,
  refresh: refreshStorageUsage,
} = await useFetch<StorageUsage>('/api/admin/storage-usage', { server: false, immediate: false })
function openMaterials() {
  materialsDialog.value?.showModal()
  void refreshStorageUsage()
}
function formatStorageBytes(bytes: number) {
  const unit = bytes >= 1024 ** 3 ? 'GB' : 'MB'
  const value = bytes / (unit === 'GB' ? 1024 ** 3 : 1024 ** 2)
  return `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(value)} ${unit}`
}
function materialAvailable(kind: keyof typeof materialFiles) {
  const key =
    kind === 'product-knowledge'
      ? 'productKnowledge'
      : kind === 'product-knowledge-preview'
        ? 'productKnowledgePreview'
        : kind
  return !!uploadedMaterials[kind] || !!props.book?.resources[key]
}
const availableMaterialCount = computed(
  () => materials.filter((item) => materialAvailable(item.kind)).length,
)
function materialStatus(kind: keyof typeof materialFiles) {
  const status = uploads[kind]?.status
  if (status === 'uploading') return 'Sedang diunggah'
  if (status === 'error') return 'Unggahan gagal'
  return materialAvailable(kind) ? 'Tersedia' : 'Belum diunggah'
}
function materialType(kind: keyof typeof materialFiles, selected: File) {
  if (kind !== 'product-knowledge') return selected.type
  return /\.pptx$/i.test(selected.name)
    ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    : 'application/vnd.ms-powerpoint'
}
const imageUrl = ref(props.book?.imageUrl ?? '/images/book-placeholder.svg')
let localPreview: string | undefined
function releasePreview() {
  if (localPreview) URL.revokeObjectURL(localPreview)
}
onBeforeUnmount(releasePreview)
function selectImage(event: Event) {
  uploadWarnings.cover = ''
  delete uploads.cover
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
    uploadWarnings.cover = 'Pilih sampul JPG, PNG, WebP, atau AVIF dengan ukuran maksimal 2 MB.'
    input.value = ''
    return
  }
  file.value = selected
  localPreview = URL.createObjectURL(selected)
  imageUrl.value = localPreview
  void uploadSelected('cover')
}
function selectMaterial(kind: keyof typeof materialFiles, event: Event) {
  uploadWarnings[kind] = ''
  uploads[kind] = undefined
  const input = event.target as HTMLInputElement
  const selected = input.files?.[0] ?? null
  message.value = ''
  materialFiles[kind] = null
  if (!selected) return
  const validFormat =
    kind === 'product-knowledge'
      ? /\.(ppt|pptx)$/i.test(selected.name)
      : selected.type === 'application/pdf'
  const maxSize = bookMaterialMaxBytes[kind]
  if (selected.size > maxSize) {
    const label = materials.find((material) => material.kind === kind)!.label
    uploadWarnings[kind] =
      `File ${label} ditolak karena terlalu besar. Ukuran maksimal ${maxSize / 1024 / 1024} MB.`
    input.value = ''
    return
  }
  if (!validFormat || !selected.size) {
    uploadWarnings[kind] =
      kind === 'product-knowledge'
        ? `Pilih PPT Produk PPT/PPTX maksimal ${maxSize / 1024 / 1024} MB.`
        : `Pilih berkas PDF maksimal ${maxSize / 1024 / 1024} MB.`
    input.value = ''
    return
  }
  materialFiles[kind] = selected
  void uploadSelected(kind)
}
function parseBookForm() {
  return bookInputSchema.safeParse({
    ...form,
    author: authors.value
      .map((author) => author.name.trim())
      .filter(Boolean)
      .join('; '),
    curriculum: form.curriculum.trim() || null,
    isbn: form.isbn.trim() || null,
    highlights: form.highlights.map((item) => item.trim()).filter(Boolean),
    synopsis: form.synopsis.trim() || null,
    targetMarket: form.targetMarket.map((item) => item.trim()).filter(Boolean),
    divisionCode: form.divisionCode || null,
    publicationYear: form.publicationYear || null,
    subject: form.subject || null,
  })
}
function checkBookForm() {
  const parsed = parseBookForm()
  errors.value = {}
  if (!authors.value[0]?.name.trim()) {
    errors.value.author = 'Penulis pertama wajib diisi.'
    message.value = 'Lengkapi kolom wajib yang ditandai sebelum mengunggah atau menyimpan buku.'
    return null
  }
  if (!parsed.success) {
    for (const issue of parsed.error.issues) errors.value[String(issue.path[0])] ??= issue.message
    message.value = 'Lengkapi kolom wajib yang ditandai sebelum mengunggah atau menyimpan buku.'
    return null
  }
  return parsed.data
}
async function uploadSelected(kind: UploadKind) {
  if (busy.value) return
  const selected = kind === 'cover' ? file.value : materialFiles[kind]
  if (!selected) return
  message.value = ''
  uploadWarnings[kind] = ''
  busy.value = true
  beginUpload(kind)
  try {
    if (!savedId.value) {
      const data = checkBookForm()
      if (!data) {
        const detail = message.value
        message.value = ''
        throw new Error(detail)
      }
      progress.value = 'Menyiapkan draf buku...'
      const draft = await $fetch<EditorBook>('/api/admin/books', {
        method: 'POST',
        body: { ...data, published: false },
      })
      savedId.value = draft.id
    }
    progress.value = `Mengunggah ${selected.name}...`
    if (kind === 'cover') {
      await uploadFile(`/api/admin/books/${savedId.value}/image`, selected, {
        method: 'POST',
        headers: { 'Content-Type': selected.type },
        onProgress: (percent) => (uploads.cover!.percent = percent),
      })
    } else {
      const type = materialType(kind, selected)
      const endpoint = `/api/admin/books/${savedId.value}/materials/${kind}`
      const upload = await $fetch<{ path: string; signedUrl: string }>(`${endpoint}/upload-url`, {
        method: 'POST',
        body: { type, size: selected.size },
      })
      const body = new FormData()
      body.append('cacheControl', '3600')
      body.append('', new Blob([selected], { type }), selected.name)
      try {
        await uploadFile(upload.signedUrl, body, {
          method: 'PUT',
          headers: { 'x-upsert': 'false' },
          onProgress: (percent) => (uploads[kind]!.percent = percent),
        })
      } catch {
        const label = materials.find((material) => material.kind === kind)!.label
        throw new Error(`Unggahan ${label} ke penyimpanan gagal. Periksa koneksi dan coba lagi.`)
      }
      progress.value = `Memeriksa ${selected.name}...`
      await $fetch<EditorBook>(`${endpoint}/complete`, {
        method: 'POST',
        body: { path: upload.path, type, size: selected.size },
      })
    }
    finishUpload(kind)
  } catch (error) {
    uploads[kind]!.status = 'error'
    const detail =
      (error as { data?: { statusMessage?: string } }).data?.statusMessage ??
      (error instanceof Error ? error.message : 'Berkas gagal diunggah.')
    uploadWarnings[kind] = `${detail} Tekan Coba lagi untuk mengulang unggahan.`
  } finally {
    busy.value = false
    progress.value = ''
    void refreshStorageUsage()
  }
}
async function save() {
  if (busy.value) return
  message.value = ''
  if (Object.values(uploads).some((upload) => upload?.status === 'error')) {
    if (materials.some((item) => uploads[item.kind]?.status === 'error')) {
      openMaterials()
    }
    return
  }
  const data = checkBookForm()
  if (!data) return
  busy.value = true
  try {
    progress.value = 'Menyimpan informasi buku...'
    const book = savedId.value
      ? await $fetch<EditorBook>(`/api/admin/books/${savedId.value}`, { method: 'PUT', body: data })
      : await $fetch<EditorBook>('/api/admin/books', { method: 'POST', body: data })
    savedId.value = book.id
    await navigateTo('/admin?notice=saved')
  } catch (error) {
    message.value =
      (error as { data?: { statusMessage?: string } }).data?.statusMessage ??
      'Buku gagal disimpan. Silakan coba lagi.'
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
            <label for="new-book-author">Penulis <span class="required">*</span></label>
            <div v-for="(author, index) in authors" :key="author.id" class="highlight-row">
              <label v-if="index > 0" :for="authorInputId(author.id)" class="sr-only">
                Penulis {{ index + 1 }}
              </label>
              <input
                :id="authorInputId(author.id)"
                v-model="author.name"
                :required="index === 0"
                maxlength="200"
                :aria-invalid="!!errors.author"
                aria-describedby="new-book-author-help new-book-author-error"
              />
              <button
                v-if="index > 0"
                type="button"
                class="remove-highlight"
                :aria-label="`Hapus penulis ${index + 1}`"
                @click="removeAuthor(index)"
              >
                <UIcon name="i-lucide-x" aria-hidden="true" />
              </button>
            </div>
            <button type="button" class="add-highlight" @click="addAuthor">+ Tambah penulis</button>
            <p id="new-book-author-help" class="field-help">
              Satu penulis per kolom. Total maksimal 200 karakter, termasuk pemisah antarpenulis.
            </p>
            <p v-if="errors.author" id="new-book-author-error" class="field-error">
              {{ errors.author }}
            </p>
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
                v-model="form.isbn"
                maxlength="32"
                placeholder="Contoh: 978-623-0000-00-0"
                :aria-invalid="!!errors.isbn"
                aria-describedby="new-book-isbn-help"
              />
              <p id="new-book-isbn-help" class="field-help">
                ISBN-10 atau ISBN-13; spasi dan tanda hubung boleh digunakan.
              </p>
              <p v-if="errors.isbn" class="field-error">{{ errors.isbn }}</p>
            </div>
          </div>
          <div class="field-row">
            <div class="form-field">
              <label for="new-book-price">Harga (Rp) <span class="required">*</span></label>
              <input
                id="new-book-price"
                v-model.number="form.price"
                type="number"
                inputmode="numeric"
                required
                min="0"
                max="2147483647"
                step="1"
                :aria-invalid="!!errors.price"
              />
              <p v-if="errors.price" class="field-error">{{ errors.price }}</p>
            </div>
            <div class="form-field">
              <label for="new-book-year">Tahun terbit <span class="required">*</span></label>
              <input
                id="new-book-year"
                v-model.number="form.publicationYear"
                type="number"
                inputmode="numeric"
                required
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
              <label for="new-book-grade">Kelas <span class="required">*</span></label>
              <select
                id="new-book-grade"
                v-model="form.grade"
                required
                :disabled="!gradeOptions.length"
                :aria-invalid="!!errors.grade"
                aria-describedby="new-book-grade-help"
              >
                <option :value="null" disabled>
                  {{ form.educationLevel ? 'Pilih kelas' : 'Pilih jenjang dulu' }}
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
              <label for="new-book-subject">Mata pelajaran <span class="required">*</span></label>
              <select
                id="new-book-subject"
                v-model="form.subject"
                required
                :disabled="!subjectOptions.length"
                :aria-invalid="!!errors.subject"
                aria-describedby="new-book-subject-help"
              >
                <option value="" disabled>
                  {{ form.educationLevel ? 'Pilih mata pelajaran' : 'Pilih jenjang dulu' }}
                </option>
                <option v-for="item in subjectOptions" :key="item" :value="item">{{ item }}</option>
              </select>
              <p id="new-book-subject-help" class="field-help">
                Pilih jenjang untuk menampilkan mata pelajaran.
              </p>
              <p v-if="errors.subject" class="field-error">{{ errors.subject }}</p>
            </div>
            <div class="form-field">
              <label for="new-book-curriculum">Kurikulum</label>
              <select
                id="new-book-curriculum"
                v-model="form.curriculum"
                :aria-invalid="!!errors.curriculum"
              >
                <option value="">Pilih kurikulum</option>
                <option v-for="item in curriculumOptions" :key="item" :value="item">
                  {{ item }}
                </option>
              </select>
              <p v-if="errors.curriculum" class="field-error">{{ errors.curriculum }}</p>
              <p v-if="classificationError" role="alert" class="field-error">
                Klasifikasi gagal dimuat.
                <button type="button" @click="refreshClassifications()">Coba lagi</button>
              </p>
            </div>
          </div>
          <div class="field-row">
            <div class="form-field">
              <label for="new-book-division">Divisi</label>
              <select
                id="new-book-division"
                v-model="form.divisionCode"
                :aria-invalid="!!errors.divisionCode"
              >
                <option value="">Pilih divisi</option>
                <option v-for="item in divisionOptions" :key="item.code" :value="item.code">
                  {{ item.name }}
                </option>
              </select>
              <p v-if="errors.divisionCode" class="field-error">{{ errors.divisionCode }}</p>
            </div>
          </div>
        </section>
        <section class="form-card description-card" aria-labelledby="details-heading">
          <h2 id="details-heading">Deskripsi Buku</h2>
          <div class="form-field">
            <label for="new-book-synopsis">Sinopsis buku</label>
            <textarea
              id="new-book-synopsis"
              v-model="form.synopsis"
              maxlength="20000"
              placeholder="Tuliskan ringkasan isi dan gambaran buku."
            />
            <p class="character-count">
              {{ form.synopsis.length.toLocaleString('id-ID') }} / 20.000
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
          <div class="form-field target-market-field">
            <span class="field-label">Target pasar</span>
            <p v-if="errors.targetMarket" class="field-error">{{ errors.targetMarket }}</p>
            <div v-for="(_, index) in form.targetMarket" :key="index" class="highlight-row">
              <input
                v-model="form.targetMarket[index]"
                :aria-label="`Target pasar ${index + 1}`"
                maxlength="200"
                placeholder="Contoh: Siswa kelas 4"
              />
              <button
                type="button"
                class="remove-highlight"
                :aria-label="`Hapus target pasar ${index + 1}`"
                @click="form.targetMarket.splice(index, 1)"
              >
                ×
              </button>
            </div>
            <button
              type="button"
              class="add-highlight"
              :disabled="form.targetMarket.length >= 10"
              @click="form.targetMarket.push('')"
            >
              + Tambah target pasar
            </button>
            <p class="field-help">Maksimal 10 target pasar, masing-masing 200 karakter.</p>
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
                aria-describedby="cover-upload-warning"
                accept="image/jpeg,image/png,image/webp,image/avif"
                @change="selectImage"
            /></label>
            <span class="file-name">{{
              file?.name ?? (book?.imageUrl ? 'Sampul saat ini' : 'Belum ada file')
            }}</span>
          </div>
          <p
            v-if="uploadWarnings.cover"
            id="cover-upload-warning"
            class="material-failure"
            role="alert"
          >
            {{ uploadWarnings.cover }}
          </p>
          <p class="field-help">
            JPG, PNG, WebP, atau AVIF. Maksimal 2 MB. Sampul dapat dilihat publik, termasuk untuk
            buku draf. File langsung diunggah setelah dipilih.
          </p>
          <progress
            v-if="uploads.cover"
            class="upload-progress"
            :class="{ 'upload-error': uploads.cover.status === 'error' }"
            :value="uploads.cover.percent"
            max="100"
            aria-label="Progres unggahan sampul"
            :aria-valuetext="
              uploads.cover.status === 'error' ? 'Unggahan gagal' : `${uploads.cover.percent}%`
            "
          />
          <button
            v-if="uploads.cover?.status === 'error'"
            type="button"
            class="add-highlight"
            @click="uploadSelected('cover')"
          >
            Coba lagi
          </button>
        </section>
        <section class="form-card materials-card" aria-labelledby="materials-heading">
          <div class="materials-summary-heading">
            <h2 id="materials-heading">Kelengkapan Produk</h2>
            <span class="materials-count"
              >{{ availableMaterialCount }} / {{ materials.length }}</span
            >
          </div>
          <p class="field-help">Kelola Dummy Buku, PPT Produk, dan Flyer dalam satu tempat.</p>
          <ul class="materials-summary">
            <li v-for="item in materials" :key="item.kind">
              <span>{{ item.label }}</span>
              <span :class="{ 'is-ready': materialAvailable(item.kind) }">{{
                materialStatus(item.kind)
              }}</span>
            </li>
          </ul>
          <button type="button" class="manage-materials" @click="openMaterials">
            <UIcon name="i-lucide-folder-open" aria-hidden="true" />
            Kelola kelengkapan produk
          </button>
        </section>
        <section class="form-card publication-card" aria-labelledby="publication-heading">
          <h2 id="publication-heading">Publikasi</h2>
          <label class="publication-option"
            ><input v-model="form.published" type="checkbox" /><span
              ><strong>Publikasikan buku</strong
              ><span>Tampil di katalog dan dapat dibuka oleh semua pengunjung.</span></span
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
        </div>
      </aside>
    </fieldset>
    <dialog
      ref="materialsDialog"
      class="materials-dialog"
      aria-labelledby="materials-dialog-title"
      aria-describedby="materials-dialog-description"
      @cancel.prevent
    >
      <header class="materials-dialog-header">
        <div>
          <p class="materials-eyebrow">Materi Buku</p>
          <h2 id="materials-dialog-title">Kelengkapan Produk</h2>
          <p id="materials-dialog-description">
            Unggah Dummy Buku, PPT Produk, dan Flyer untuk melengkapi katalog Anda.
          </p>
        </div>
        <button
          type="button"
          class="materials-close"
          aria-label="Tutup kelengkapan produk"
          @click="materialsDialog?.close()"
        >
          <UIcon name="i-lucide-x" aria-hidden="true" />
        </button>
      </header>
      <div class="materials-dialog-content">
        <div class="materials-book-info">
          <span class="materials-book-icon" aria-hidden="true"
            ><UIcon name="i-lucide-book-open"
          /></span>
          <div>
            <span>Buku yang sedang dikelola</span>
            <h3>{{ form.title || 'Buku baru' }}</h3>
          </div>
          <span class="materials-count"
            >{{ availableMaterialCount }} / {{ materials.length }} tersedia</span
          >
        </div>
        <p class="materials-upload-note">
          File langsung diunggah setelah dipilih. Untuk buku baru, lengkapi data wajib pada form
          terlebih dahulu.
        </p>
        <div class="materials-grid">
          <div v-for="item in materials" :key="item.kind" class="material-upload">
            <div class="material-card-top">
              <span class="material-format" aria-hidden="true">{{
                item.kind === 'product-knowledge' ? 'PPT' : 'PDF'
              }}</span>
              <span
                class="material-status"
                :class="{
                  'is-ready': materialAvailable(item.kind),
                  'is-error': uploads[item.kind]?.status === 'error',
                }"
                >{{ materialStatus(item.kind) }}</span
              >
            </div>
            <label :for="`new-book-${item.kind}`" class="file-heading">{{ item.label }}</label>
            <div class="file-picker">
              <label class="file-button" :for="`new-book-${item.kind}`"
                ><img src="/images/editor/upload.svg" alt="" width="16" height="16" />Pilih
                file<input
                  :id="`new-book-${item.kind}`"
                  type="file"
                  :aria-describedby="`upload-warning-${item.kind} upload-help-${item.kind}`"
                  :disabled="busy"
                  :accept="item.kind === 'product-knowledge' ? '.ppt,.pptx' : 'application/pdf'"
                  @change="selectMaterial(item.kind, $event)"
              /></label>
              <span class="file-name">{{
                materialFiles[item.kind]?.name ??
                (materialAvailable(item.kind) ? 'Berkas sudah tersedia' : 'Belum ada file')
              }}</span>
            </div>
            <p
              v-if="uploadWarnings[item.kind]"
              :id="`upload-warning-${item.kind}`"
              class="material-failure"
              role="alert"
            >
              {{ uploadWarnings[item.kind] }}
            </p>
            <p :id="`upload-help-${item.kind}`" class="field-help">{{ item.help }}</p>
            <p
              v-if="uploads[item.kind]?.status === 'complete'"
              class="material-success"
              role="status"
            >
              File berhasil diunggah.
            </p>
            <progress
              v-if="uploads[item.kind]"
              class="upload-progress"
              :class="{ 'upload-error': uploads[item.kind]!.status === 'error' }"
              :value="uploads[item.kind]!.percent"
              max="100"
              :aria-label="`Progres unggahan ${item.label}`"
              :aria-valuetext="
                uploads[item.kind]!.status === 'error'
                  ? 'Unggahan gagal'
                  : `${uploads[item.kind]!.percent}%`
              "
            />
            <button
              v-if="uploads[item.kind]?.status === 'error'"
              type="button"
              class="material-retry"
              :disabled="busy"
              @click="uploadSelected(item.kind)"
            >
              Coba lagi
            </button>
          </div>
        </div>
        <p v-if="busy && progress" class="materials-active-progress" role="status">
          {{ progress }}
        </p>
      </div>
      <footer class="materials-dialog-footer">
        <div class="materials-footer-info">
          <p>
            <UIcon name="i-lucide-info" aria-hidden="true" />Materi dapat dibuka publik setelah buku
            dipublikasikan.
          </p>
          <p class="storage-usage" role="status" aria-live="polite">
            <template v-if="storageUsageStatus === 'pending'">
              Memuat penggunaan penyimpanan...
            </template>
            <template v-else-if="storageUsageError">
              Penggunaan penyimpanan belum dapat dimuat.
              <button type="button" class="storage-retry" @click="refreshStorageUsage()">
                Coba lagi
              </button>
            </template>
            <template v-else-if="storageUsage">
              {{ formatStorageBytes(storageUsage.usedBytes) }} dari
              {{ formatStorageBytes(storageUsage.quotaBytes) }} penyimpanan telah dipakai.
            </template>
          </p>
        </div>
        <button
          type="button"
          class="manage-materials materials-done"
          @click="materialsDialog?.close()"
        >
          Selesai
        </button>
      </footer>
    </dialog>
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
.cover-card {
  min-height: 556px;
}
.materials-card {
  min-height: auto;
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
.form-field input[type='number'] {
  appearance: textfield;
  -moz-appearance: textfield;
}
.form-field input[type='number']::-webkit-inner-spin-button,
.form-field input[type='number']::-webkit-outer-spin-button {
  appearance: none;
  margin: 0;
}
.form-field select {
  text-overflow: ellipsis;
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
.upload-progress {
  display: block;
  width: 100%;
  height: 4px;
  margin-top: 12px;
  overflow: hidden;
  border: 0;
  border-radius: 999px;
  appearance: none;
  background: #e6e8e4;
  color: #1f5c3f;
  accent-color: #1f5c3f;
}
.upload-progress::-webkit-progress-bar {
  background: #e6e8e4;
}
.upload-progress::-webkit-progress-value {
  background: #1f5c3f;
}
.upload-progress::-moz-progress-bar {
  background: #1f5c3f;
}
.upload-error::-webkit-progress-value {
  background: #b3261e;
}
.upload-error::-moz-progress-bar {
  background: #b3261e;
}
.materials-card {
  display: grid;
  gap: 12px;
}
.materials-summary-heading,
.material-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.materials-count {
  flex-shrink: 0;
  padding: 5px 10px;
  border-radius: 999px;
  background: #edf5ef;
  color: #1f5c3f;
  font: 600 12px/20px var(--font-landing-sans);
}
.materials-summary {
  display: grid;
  gap: 10px;
  margin-block: 4px;
}
.materials-summary li {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 12px;
  font-size: 12px;
}
.materials-summary li > span:last-child {
  flex-shrink: 0;
  color: #757575;
}
.materials-summary li > .is-ready {
  color: #1f5c3f !important;
}
.manage-materials {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  padding: 10px 18px;
  border: 1px solid #1f5c3f;
  border-radius: 12px;
  background: #1f5c3f;
  color: white;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.manage-materials:hover {
  background: #17452f;
}
.materials-dialog {
  width: min(1120px, calc(100vw - 48px));
  max-width: none;
  height: min(860px, calc(100dvh - 48px));
  max-height: none;
  margin: auto;
  padding: 0;
  overflow: hidden;
  border: 1px solid #dce8e0;
  border-radius: 24px;
  background: #f7faf8;
  color: #222;
  box-shadow: 0 24px 80px rgb(18 43 28 / 22%);
  font: 400 14px/1.6 var(--font-landing-sans);
}
.materials-dialog[open] {
  display: flex;
  flex-direction: column;
}
.materials-dialog::backdrop {
  background: rgb(17 34 25 / 62%);
  backdrop-filter: blur(4px);
}
:global(body:has(.materials-dialog[open])) {
  overflow: hidden;
}
.materials-dialog-header {
  display: flex;
  flex-shrink: 0;
  align-items: start;
  justify-content: space-between;
  gap: 24px;
  padding: 28px 36px;
  border-bottom: 1px solid #e1e9e3;
  background: white;
}
.materials-eyebrow {
  margin-bottom: 4px;
  color: #2f6b4f;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.materials-dialog-header h2 {
  font: 500 32px/1.2 var(--font-landing-serif);
}
.materials-dialog-header p:last-child {
  margin-top: 8px;
  color: #6b6f6b;
  font-size: 13px;
}
.materials-close {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 40px;
  height: 40px;
  border: 1px solid #dce8e0;
  border-radius: 12px;
  background: white;
  color: #344e41;
  font-size: 20px;
  cursor: pointer;
}
.materials-close:hover {
  background: #edf5ef;
}
.materials-dialog-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 24px 36px;
}
.materials-book-info {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
  border: 1px solid #dce8e0;
  border-radius: 16px;
  background: #edf5ef;
}
.materials-book-icon {
  display: grid;
  flex: 0 0 42px;
  height: 42px;
  place-items: center;
  border-radius: 12px;
  background: white;
  color: #1f5c3f;
  font-size: 22px;
}
.materials-book-info > div {
  flex: 1;
  min-width: 0;
}
.materials-book-info > div > span {
  color: #687169;
  font-size: 11px;
}
.materials-book-info h3 {
  overflow-wrap: anywhere;
  font-weight: 600;
}
.materials-upload-note {
  margin-block: 16px;
  color: #6b6f6b;
  font-size: 12px;
}
.materials-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.materials-grid .material-upload {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  padding: 20px;
  border: 1px solid #e1e9e3;
  border-radius: 18px;
  background: white;
}
.material-card-top {
  margin-bottom: 6px;
}
.material-format {
  display: grid;
  width: 42px;
  height: 48px;
  place-items: center;
  border: 1px solid #dce8e0;
  border-radius: 10px 10px 10px 3px;
  background: #f4f8f5;
  color: #1f5c3f;
  font-size: 10px;
  font-weight: 700;
}
.material-status {
  padding: 3px 9px;
  border-radius: 999px;
  background: #f3f4f2;
  color: #6b6f6b;
  font-size: 11px;
}
.material-status.is-ready {
  background: #edf5ef;
  color: #1f5c3f;
}
.material-status.is-error {
  background: #fff1f0;
  color: #b3261e;
}
.materials-grid .file-picker {
  margin-top: auto;
  padding-top: 10px;
}
.material-success {
  color: #1f5c3f;
  font-size: 12px;
}
.material-failure,
.material-retry {
  color: #b3261e;
  font-size: 12px;
}
.material-retry {
  align-self: start;
  font-weight: 600;
  text-decoration: underline;
}
.materials-active-progress {
  margin-top: 14px;
  color: #1f5c3f;
  font-size: 12px;
}
.materials-dialog-footer {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 20px 36px;
  border-top: 1px solid #e1e9e3;
  background: white;
}
.materials-dialog-footer p {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #6b6f6b;
  font-size: 12px;
}
.materials-footer-info {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.materials-dialog-footer .storage-usage {
  display: block;
  overflow-wrap: anywhere;
}
.storage-retry {
  color: #1f5c3f;
  text-decoration: underline;
}
.materials-done {
  min-width: 132px;
}
@media (max-width: 700px) {
  .materials-dialog {
    width: calc(100vw - 16px);
    height: calc(100dvh - 16px);
    border-radius: 20px;
  }
  .materials-dialog-header,
  .materials-dialog-content,
  .materials-dialog-footer {
    padding: 20px;
  }
  .materials-dialog-header h2 {
    font-size: 26px;
  }
  .materials-grid {
    grid-template-columns: 1fr;
  }
  .materials-book-info {
    flex-wrap: wrap;
    padding: 14px;
  }
  .materials-book-info > .materials-count {
    margin-left: 56px;
  }
  .materials-book-info > div {
    flex: 1 1 calc(100% - 56px);
  }
  .materials-dialog-footer {
    flex-wrap: wrap;
    gap: 12px;
  }
  .materials-done {
    width: 100%;
  }
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
