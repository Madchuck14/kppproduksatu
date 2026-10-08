<script setup lang="ts">
import { bookInputSchema } from '#shared/schemas/editor'
import { getSubjectsForLevel } from '#shared/utils/book-subjects'
import type { BookSubject } from '#shared/utils/book-subjects'
import { educationLevelSchema } from '#shared/schemas/auth'
import type { EditorBook } from '#shared/types/editor'
import type { AccountSession } from '#shared/types/account'

const props = defineProps<{
  book?: EditorBook
  account: AccountSession
}>()
const savedId = ref(props.book?.id)
const form = reactive({
  bookCode: props.book?.bookCode ?? '',
  educationLevel: props.book?.educationLevel ?? '',
  subject: (props.book?.subject ?? '') as BookSubject | '',
  title: props.book?.title ?? '',
  author: props.book?.author ?? '',
  description: props.book?.description ?? '',
  price: props.book?.price ?? 0,
  publicationYear: props.book?.publicationYear ?? null,
  featured: props.book?.featured ?? false,
  published: props.book?.published ?? false,
})
const levels = computed(() =>
  props.account.isSuper ? educationLevelSchema.options : props.account.educationLevels,
)
const subjectOptions = computed(() => getSubjectsForLevel(form.educationLevel))
watch(
  () => form.educationLevel,
  () => {
    if (!subjectOptions.value.some((item) => item === form.subject)) form.subject = ''
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
  const parsed = bookInputSchema.safeParse({
    ...form,
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
const fieldClass =
  'mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:bg-stone-100'
</script>

<template>
  <form :aria-busy="busy" @submit.prevent="save">
    <div class="mb-7 flex flex-wrap items-center justify-between gap-4">
      <NuxtLink to="/admin" class="text-sm font-medium text-emerald-800 hover:underline"
        >← Kembali ke dashboard</NuxtLink
      ><span class="text-xs text-stone-500">Kolom bertanda * wajib diisi</span>
    </div>
    <h1 class="display-heading text-4xl">{{ book ? 'Edit buku' : 'Tambah buku' }}</h1>
    <p class="mb-8 mt-3 text-stone-600">
      Lengkapi informasi dan tentukan kapan buku tampil di katalog publik.
    </p>
    <p
      v-if="message"
      role="alert"
      class="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
    >
      {{ message }}
    </p>
    <fieldset :disabled="busy" class="grid min-w-0 gap-6 lg:grid-cols-[1fr_300px]">
      <legend class="sr-only">Informasi buku</legend>
      <div class="space-y-6 rounded-2xl border border-stone-200 bg-white p-6 sm:p-8">
        <h2 class="text-lg font-semibold">Identitas buku</h2>
        <div>
          <label for="book-title" class="text-sm font-medium">Judul buku *</label
          ><input
            id="book-title"
            v-model="form.title"
            required
            maxlength="200"
            :class="fieldClass"
            :aria-invalid="!!errors.title"
          />
          <p class="mt-1.5 text-xs text-stone-500">
            Tambahkan tahun publikasi di akhir seri buku dengan nama yang sama.
          </p>
          <p v-if="errors.title" class="mt-1 text-sm text-red-700">{{ errors.title }}</p>
        </div>
        <div class="grid gap-5 sm:grid-cols-2">
          <div>
            <label for="book-code" class="text-sm font-medium">Kode buku *</label
            ><input
              id="book-code"
              v-model="form.bookCode"
              required
              maxlength="50"
              inputmode="numeric"
              pattern="[0-9]+"
              placeholder="Contoh: 123456"
              :class="fieldClass"
              :aria-invalid="!!errors.bookCode"
            />
            <p class="mt-1.5 text-xs text-stone-500">Kode unik; hanya angka.</p>
            <p v-if="errors.bookCode" class="mt-1 text-sm text-red-700">{{ errors.bookCode }}</p>
          </div>
          <div>
            <label for="book-level" class="text-sm font-medium">Jenjang pendidikan *</label
            ><select
              id="book-level"
              v-model="form.educationLevel"
              required
              :class="fieldClass"
              :aria-invalid="!!errors.educationLevel"
            >
              <option value="" disabled>Pilih jenjang</option>
              <option v-for="item in levels" :key="item" :value="item">{{ item }}</option>
            </select>
            <p v-if="errors.educationLevel" class="mt-1 text-sm text-red-700">
              {{ errors.educationLevel }}
            </p>
          </div>
        </div>
        <div>
          <label for="book-subject" class="text-sm font-medium">Mata pelajaran</label>
          <select
            id="book-subject"
            v-model="form.subject"
            :class="fieldClass"
            :disabled="!subjectOptions.length"
            :aria-invalid="!!errors.subject"
            aria-describedby="book-subject-help"
          >
            <option value="">Belum ditentukan</option>
            <option v-for="item in subjectOptions" :key="item" :value="item">{{ item }}</option>
          </select>
          <p id="book-subject-help" class="mt-1.5 text-xs text-stone-500">
            {{
              !form.educationLevel
                ? 'Pilih jenjang untuk menampilkan mata pelajaran.'
                : 'Kategori mengikuti daftar mata pelajaran untuk jenjang yang dipilih.'
            }}
          </p>
          <p v-if="errors.subject" class="mt-1 text-sm text-red-700">{{ errors.subject }}</p>
        </div>
        <div class="grid gap-5 sm:grid-cols-2">
          <div>
            <label for="book-author" class="text-sm font-medium">Penulis</label
            ><input id="book-author" v-model="form.author" maxlength="200" :class="fieldClass" />
          </div>
        </div>
        <div class="grid gap-5 sm:grid-cols-2">
          <div>
            <label for="book-price" class="text-sm font-medium">Harga (Rp) *</label
            ><input
              id="book-price"
              v-model.number="form.price"
              type="number"
              required
              min="0"
              max="2147483647"
              step="1"
              :class="fieldClass"
              :aria-invalid="!!errors.price"
            />
            <p v-if="errors.price" class="mt-1 text-sm text-red-700">{{ errors.price }}</p>
          </div>
          <div>
            <label for="book-publication-year" class="text-sm font-medium">Tahun Publikasi</label>
            <input
              id="book-publication-year"
              v-model.number="form.publicationYear"
              type="number"
              min="1000"
              max="9999"
              step="1"
              placeholder="Contoh: 2026"
              :class="fieldClass"
              :aria-invalid="!!errors.publicationYear"
            />
            <p v-if="errors.publicationYear" class="mt-1 text-sm text-red-700">
              {{ errors.publicationYear }}
            </p>
          </div>
        </div>
        <div>
          <label for="book-description" class="text-sm font-medium">Deskripsi</label
          ><textarea
            id="book-description"
            v-model="form.description"
            rows="7"
            maxlength="20000"
            :class="fieldClass"
            placeholder="Jelaskan isi, manfaat, dan keunggulan buku."
          />
          <p class="mt-1 text-right text-xs text-stone-400">
            {{ form.description.length }} / 20.000
          </p>
        </div>
      </div>
      <aside class="space-y-6">
        <div class="rounded-2xl border border-stone-200 bg-white p-6">
          <h2 class="font-semibold">Sampul buku</h2>
          <div
            class="my-5 flex aspect-[3/4] items-center justify-center rounded-xl bg-stone-100 p-5"
          >
            <img
              :src="imageUrl"
              alt="Pratinjau sampul buku"
              width="200"
              height="280"
              class="max-h-64 max-w-full object-contain"
            />
          </div>
          <label for="book-cover" class="text-sm font-medium">{{
            book ? 'Ganti sampul' : 'Pilih sampul'
          }}</label
          ><input
            id="book-cover"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            class="mt-2 block w-full text-xs text-stone-600 file:mr-2 file:rounded file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:text-emerald-800"
            @change="selectImage"
          />
          <p class="mt-3 text-xs leading-relaxed text-stone-500">
            JPG, PNG, WebP, atau AVIF. Maksimal 2 MB. Sampul dapat dilihat publik, termasuk untuk
            buku draf.
          </p>
          <p v-if="file" class="mt-2 break-all text-xs text-emerald-800">
            {{ file.name }} · Siap diunggah saat disimpan
          </p>
        </div>
        <div class="space-y-4 rounded-2xl border border-stone-200 bg-white p-6">
          <h2 class="font-semibold">Materi privat</h2>
          <div
            v-for="item in [
              {
                kind: 'flyer',
                label: 'Flyer',
                accept: 'application/pdf',
                help: 'PDF, maksimal 20 MB',
              },
              {
                kind: 'dummy',
                label: 'Dummy Buku',
                accept: 'application/pdf',
                help: 'PDF, maksimal 20 MB',
              },
              {
                kind: 'product-knowledge',
                label: 'Product Knowledge',
                accept: 'application/pdf',
                help: 'PDF, maksimal 50 MB',
              },
            ] as const"
            :key="item.kind"
          >
            <label :for="`book-${item.kind}`" class="text-sm font-medium">{{ item.label }}</label>
            <input
              :id="`book-${item.kind}`"
              type="file"
              :accept="item.accept"
              class="mt-2 block w-full text-xs text-stone-600 file:mr-2 file:rounded file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:text-emerald-800"
              @change="selectMaterial(item.kind, $event)"
            />
            <p class="mt-1 text-xs text-stone-500">{{ item.help }}</p>
            <p v-if="materialFiles[item.kind]" class="mt-1 break-all text-xs text-emerald-800">
              {{ materialFiles[item.kind]?.name }} · Siap diunggah
            </p>
            <p
              v-else-if="
                book?.resources[item.kind === 'product-knowledge' ? 'productKnowledge' : item.kind]
              "
              class="mt-1 text-xs text-emerald-800"
            >
              Berkas sudah tersedia. Pilih berkas baru untuk mengganti.
            </p>
          </div>
          <p class="text-xs leading-relaxed text-stone-500">
            Materi disimpan privat dan tidak masuk bucket sampul publik.
          </p>
        </div>
        <div class="space-y-4 rounded-2xl border border-stone-200 bg-white p-6">
          <h2 class="font-semibold">Publikasi</h2>
          <label class="flex items-start gap-3 text-sm"
            ><input v-model="form.published" type="checkbox" class="mt-1 accent-emerald-700" /><span
              >Publikasikan buku<span class="mt-1 block text-xs text-stone-500"
                >Tampil di katalog dan dapat dibuka oleh Sales.</span
              ></span
            ></label
          ><label class="flex items-start gap-3 text-sm"
            ><input v-model="form.featured" type="checkbox" class="mt-1 accent-emerald-700" /><span
              >Jadikan buku pilihan<span class="mt-1 block text-xs text-stone-500"
                >Ditampilkan pada beranda jika sudah dipublikasikan.</span
              ></span
            ></label
          >
        </div>
        <div class="space-y-3">
          <UButton
            type="submit"
            size="lg"
            class="w-full justify-center"
            :loading="busy"
            :disabled="!levels.length"
            >Simpan buku</UButton
          ><UButton
            to="/admin"
            color="neutral"
            variant="outline"
            class="w-full justify-center"
            :disabled="busy"
            >Batal</UButton
          >
          <p v-if="progress" role="status" class="text-center text-sm text-emerald-800">
            {{ progress }}
          </p>
        </div>
      </aside>
    </fieldset>
  </form>
</template>
