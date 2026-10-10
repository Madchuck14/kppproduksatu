<script setup lang="ts">
const route = useRoute()
const config = useRuntimeConfig()
const user = useSupabaseUser()
type ResourceStatus = { flyer: boolean; dummy: boolean; productKnowledge: boolean }
const { data: product, error } = await useFetch(
  () => `/api/products/${encodeURIComponent(String(route.params.slug))}`,
)
if (error.value || !product.value) {
  throw createError({
    statusCode: error.value?.statusCode || 404,
    statusMessage:
      error.value?.statusCode === 404 ? 'Buku tidak ditemukan' : 'Buku tidak dapat dimuat',
  })
}

const { data: catalog, error: relatedError } = await useFetch('/api/products')
const { data: resourceStatus, error: resourceError } = await useFetch<ResourceStatus>(
  () => `/api/products/${encodeURIComponent(String(route.params.slug))}/resources`,
)
const relatedProducts = computed(() =>
  (catalog.value?.products ?? []).filter((item) => item.id !== product.value?.id).slice(0, 4),
)
const coverDialog = useTemplateRef<HTMLDialogElement>('cover-dialog')
const pdfDialog = useTemplateRef<HTMLDialogElement>('pdf-dialog')
const pdfViewerUrl = ref('')
const pdfViewerTitle = ref('')
const pdfViewerKind = ref<'product-knowledge' | 'flyer' | 'dummy'>('flyer')
let pdfRequest = 0
const pdfViewerBusy = ref(false)
const pdfViewerError = ref('')
const resources: Array<{
  id: 'product-knowledge' | 'flyer' | 'dummy'
  statusKey: keyof ResourceStatus
  title: string
  description: string
}> = [
  {
    id: 'flyer',
    statusKey: 'flyer',
    title: 'Flyer Promosi',
    description: 'Ringkasan keunggulan dan isi buku untuk dibagikan ke sekolah.',
  },
  {
    id: 'product-knowledge',
    statusKey: 'productKnowledge',
    title: 'Presentasi Buku',
    description: 'Materi siap pakai untuk memperkenalkan buku kepada guru dan pihak sekolah.',
  },
  {
    id: 'dummy',
    statusKey: 'dummy',
    title: 'Buku Dummy',
    description: 'Tampilan seperti buku sungguhan dengan animasi membalik halaman.',
  },
]
async function openPdfResource(resource: (typeof resources)[number]) {
  const request = ++pdfRequest
  pdfViewerKind.value = resource.id
  pdfViewerTitle.value = resource.title
  pdfViewerUrl.value = ''
  pdfViewerError.value = ''
  pdfViewerBusy.value = true
  pdfDialog.value?.showModal()
  try {
    const result = await $fetch<{ url: string }>(
      `/api/products/${encodeURIComponent(product.value!.slug)}/resources/${resource.id}?preview=1`,
    )
    if (request === pdfRequest) pdfViewerUrl.value = result.url
  } catch {
    if (request === pdfRequest) pdfViewerError.value = 'Materi belum dapat ditampilkan. Coba lagi.'
  } finally {
    if (request === pdfRequest) pdfViewerBusy.value = false
  }
}
function closePdfDialog() {
  pdfDialog.value?.close()
  resetPdfDialog()
}
function resetPdfDialog() {
  pdfRequest += 1
  pdfViewerUrl.value = ''
  pdfViewerError.value = ''
  pdfViewerBusy.value = false
}
const bookDetails = computed(() => [
  { label: 'Kode buku', value: product.value?.bookCode || 'Belum tersedia' },
  { label: 'Penulis', value: product.value?.author },
  { label: 'Jenjang', value: product.value?.educationLevel || 'Belum tersedia' },
  { label: 'Kelas', value: product.value?.grade || 'Belum tersedia' },
  { label: 'Mata pelajaran', value: product.value?.subject || 'Belum ditentukan' },
  { label: 'Tahun terbit', value: product.value?.publicationYear || 'Belum tersedia' },
  { label: 'ISBN', value: 'Belum tersedia' },
])

watch(
  () => route.params.slug,
  () => {
    coverDialog.value?.close()
    closePdfDialog()
  },
)

useSeoMeta({
  title: () => `${product.value?.title} | ${config.public.siteName}`,
  description: () => product.value?.description,
  ogTitle: () => product.value?.title,
  ogDescription: () => product.value?.description,
  ogImage: () => product.value?.imageUrl,
})
</script>

<template>
  <article v-if="product" class="book-detail">
    <nav aria-label="Breadcrumb" class="detail-breadcrumb">
      <ol class="flex flex-wrap items-center gap-1">
        <li><NuxtLink to="/">Beranda</NuxtLink></li>
        <li aria-hidden="true">/</li>
        <li><NuxtLink to="/products">Katalog</NuxtLink></li>
        <li aria-hidden="true">/</li>
        <li aria-current="page">{{ product.subject || product.title }}</li>
      </ol>
    </nav>
    <div class="detail-columns">
      <div class="detail-cover">
        <span v-if="product.featured" class="detail-badge">Buku Pilihan</span>
        <FavoriteButton :product="product" icon-only catalog />
        <button
          type="button"
          class="detail-cover-button"
          :aria-label="`Perbesar sampul ${product.title}`"
          @click="coverDialog?.showModal()"
        >
          <img
            :src="product.imageUrl"
            :alt="`Sampul buku ${product.title}`"
            width="230"
            height="346"
          />
        </button>
      </div>
      <div class="detail-summary">
        <p class="detail-subject">{{ product.subject || 'Buku Erlangga' }}</p>
        <h1>{{ product.title }}</h1>
        <p class="detail-author">{{ product.author }}</p>
        <p class="detail-price">{{ formatPrice(product.price) }}</p>
        <div v-if="product.educationLevel || product.grade" class="detail-tags">
          <span v-if="product.educationLevel">{{ product.educationLevel }}</span>
          <span v-if="product.grade">Kelas {{ product.grade }}</span>
        </div>
        <p class="detail-description">{{ product.description }}</p>
        <div class="detail-actions">
          <FavoriteButton :product="product" detail />
          <NuxtLink to="/#kontak" class="detail-contact">Hubungi kami untuk pemesanan</NuxtLink>
        </div>
        <dl class="detail-metadata">
          <div v-for="detail in bookDetails" :key="detail.label">
            <dt>{{ detail.label }}</dt>
            <dd>{{ detail.value }}</dd>
          </div>
        </dl>
      </div>
    </div>
    <section aria-label="Informasi lengkap buku" class="detail-content">
      <div>
        <h2>Isi buku</h2>
        <p>{{ product.description }}</p>
      </div>
      <div>
        <h2>Manfaat</h2>
        <p>Informasi manfaat buku belum tersedia.</p>
      </div>
      <div>
        <h2>Keunggulan</h2>
        <p>Informasi keunggulan buku belum tersedia.</p>
      </div>
    </section>

    <section v-if="user" class="detail-resources" aria-labelledby="resources-title">
      <h2 id="resources-title">Materi Promosi</h2>
      <p class="resources-intro">Tersedia untuk pengguna yang sudah masuk.</p>
      <p v-if="resourceError" role="alert" class="resources-error">
        Status materi belum dapat dimuat. Muat ulang halaman.
      </p>
      <div class="resource-grid">
        <article
          v-for="resource in resources"
          :id="resource.id"
          :key="resource.id"
          tabindex="-1"
          class="resource-card"
        >
          <div class="resource-preview" aria-hidden="true">
            <span class="resource-format">PDF</span>
            <div v-if="resource.id === 'flyer'" class="flyer-preview">
              <img src="/images/book-detail/flyer-front.png" alt="" width="140" height="187" />
              <img src="/images/book-detail/flyer-back.png" alt="" width="137" height="186" />
            </div>
            <div v-else-if="resource.id === 'product-knowledge'" class="presentation-preview">
              <div class="presentation-slide">
                <div class="slide-cover" />
                <div class="slide-lines"><span /><span /><span /></div>
              </div>
            </div>
            <img
              v-else
              :src="product.imageUrl"
              alt=""
              width="133"
              height="199"
              class="dummy-preview"
            />
          </div>
          <div class="resource-body">
            <h3>{{ resource.title }}</h3>
            <p class="resource-metadata">
              {{ resource.id === 'dummy' ? 'Pratinjau buku \u00b7 PDF' : 'PDF' }}
            </p>
            <p class="resource-description">{{ resource.description }}</p>
            <p v-if="resourceError" class="resource-state">Status berkas belum tersedia</p>
            <p v-else-if="!resourceStatus" class="resource-state" role="status">
              Memeriksa berkas...
            </p>
            <p v-else-if="!resourceStatus[resource.statusKey]" class="resource-state">
              Berkas belum tersedia
            </p>
            <div v-else class="resource-actions">
              <a
                :href="`/api/products/${encodeURIComponent(product.slug)}/resources/${resource.id}?download=1`"
                class="resource-download"
                :aria-label="`Unduh PDF: ${resource.title}`"
              >
                <img src="/images/book-detail/download.svg" alt="" width="16" height="16" />
                Unduh PDF
              </a>
              <button
                type="button"
                class="resource-view"
                :aria-label="`Lihat: ${resource.title}`"
                @click="openPdfResource(resource)"
              >
                Lihat
              </button>
            </div>
          </div>
        </article>
      </div>
    </section>

    <dialog
      ref="pdf-dialog"
      :aria-label="`Penampil ${pdfViewerTitle}`"
      class="dummy-preview-dialog fixed inset-0 m-auto h-[92dvh] w-[calc(100%_-_1.5rem)] max-w-6xl rounded-2xl border border-stone-200 bg-white p-0 backdrop:bg-stone-950/75"
      @close="resetPdfDialog"
    >
      <div class="flex h-full flex-col">
        <div
          v-if="!pdfViewerUrl"
          class="flex items-center justify-between gap-4 border-b border-stone-200 px-5 py-4"
        >
          <h2 class="text-lg font-semibold">{{ pdfViewerTitle }}</h2>
          <button
            type="button"
            class="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium"
            @click="closePdfDialog"
          >
            Tutup
          </button>
        </div>
        <div class="min-h-0 flex-1">
          <div
            v-if="pdfViewerBusy"
            role="status"
            class="flex h-full items-center justify-center bg-stone-100 text-sm text-stone-600"
          >
            Menyiapkan materi...
          </div>
          <div
            v-else-if="pdfViewerError"
            role="alert"
            class="flex h-full items-center justify-center bg-stone-100 p-6 text-sm text-red-700"
          >
            {{ pdfViewerError }}
          </div>
          <PdfFlipbookViewer
            v-else-if="pdfViewerUrl"
            :key="pdfViewerUrl"
            :url="pdfViewerUrl"
            :filename="`${pdfViewerKind}-${product.slug}.pdf`"
            :title="pdfViewerTitle"
            :download-url="`/api/products/${encodeURIComponent(product.slug)}/resources/${pdfViewerKind}?download=1`"
            @close="closePdfDialog"
          />
        </div>
      </div>
    </dialog>

    <section class="detail-related" aria-labelledby="related-title">
      <h2 id="related-title">Buku Terkait</h2>
      <p v-if="relatedError" role="alert">Rekomendasi buku belum dapat dimuat. Coba lagi nanti.</p>
      <div v-else-if="relatedProducts.length" class="detail-related-grid">
        <ProductCard
          v-for="item in relatedProducts"
          :key="item.id"
          :product="item"
          variant="catalog"
        />
      </div>
      <p v-else>Belum ada buku lainnya dalam katalog.</p>
    </section>

    <dialog
      ref="cover-dialog"
      aria-label="Pratinjau sampul buku"
      class="fixed inset-0 m-auto max-h-[90dvh] max-w-[90vw] rounded-2xl border border-stone-200 bg-[#f5f5ef] p-6 backdrop:bg-stone-950/60"
    >
      <form method="dialog" class="flex justify-end">
        <button
          type="submit"
          autofocus
          class="mb-4 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm"
        >
          Tutup <span aria-hidden="true">×</span>
        </button>
      </form>
      <img
        :src="product.imageUrl"
        :alt="`Sampul buku ${product.title}`"
        width="500"
        height="650"
        class="mx-auto max-h-[65dvh] w-auto max-w-full object-contain"
      />
      <p class="mt-5 text-center text-sm font-medium">{{ product.title }}</p>
    </dialog>
  </article>
</template>

<style scoped>
.dummy-preview-dialog {
  inset: 40px 56px auto;
  margin: 0 auto;
  width: calc(100% - 112px);
  max-width: 1600px;
  height: min(775px, calc(100dvh - 80px));
  border: 0;
  border-radius: 20px;
  box-shadow: 0 24px 80px rgb(0 0 0 / 35%);
}
.dummy-preview-dialog::backdrop {
  background: rgb(20 24 21 / 55%);
}
@media (max-width: 700px) {
  .dummy-preview-dialog {
    inset: 12px 8px auto;
    width: calc(100% - 16px);
    height: calc(100dvh - 24px);
    border-radius: 16px;
  }
}
.book-detail {
  color: #222;
  font-family: var(--font-landing-sans);
}
.detail-breadcrumb {
  padding-top: 24px;
  color: #6b6f6b;
  font-size: 13px;
  line-height: 20.8px;
}
.detail-breadcrumb a:hover {
  color: #1f5c3f;
  text-decoration: underline;
}
.detail-columns {
  display: grid;
  grid-template-columns: 480px minmax(0, 1fr);
  gap: 56px;
  padding: 24px 0 48px;
}
.detail-cover {
  position: relative;
  display: grid;
  place-items: center;
  height: 504px;
  border-radius: 16px;
  background: #f6f3ee;
}
.detail-badge {
  position: absolute;
  left: 14px;
  top: 14px;
  padding: 2px 12px;
  border-radius: 99px;
  background: #1f5c3f;
  color: white;
  font-size: 12px;
  line-height: 19.2px;
}
.detail-cover-button {
  cursor: zoom-in;
  max-width: 100%;
}
.detail-cover-button img {
  width: 230px;
  height: 346px;
  object-fit: contain;
  filter: drop-shadow(6px 10px 10px rgb(0 0 0 / 18%));
}
.detail-summary {
  min-width: 0;
  padding-top: 4px;
}
.detail-subject {
  color: #6b6f6b;
  font-size: 11px;
  line-height: 17.6px;
  letter-spacing: 0.66px;
  text-transform: uppercase;
}
.detail-summary h1 {
  margin-top: 10px;
  font: 500 42px/1.2 var(--font-landing-serif);
  overflow-wrap: anywhere;
}
.detail-author {
  margin-top: 6px;
  color: #6b6f6b;
  font: 400 18px/1.4 var(--font-landing-serif);
}
.detail-price {
  margin-top: 4px;
  font: 600 32px/1.3 var(--font-landing-serif);
}
.detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.detail-tags span {
  padding: 2px 12px;
  border: 1px solid #e6e8e4;
  border-radius: 99px;
  background: #f4f8f5;
  font-size: 13px;
  line-height: 20.8px;
}
.detail-description {
  max-width: 568px;
  margin-top: 16px;
  color: #6b6f6b;
  font-size: 15px;
  line-height: 24px;
  white-space: pre-line;
}
.detail-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: start;
  gap: 10px;
  padding: 14px 0 10px;
}
.detail-contact {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 8px 22px;
  border: 1px solid #1f5c3f;
  border-radius: 12px;
  color: #1f5c3f;
  font-size: 15px;
  line-height: 24px;
}
.detail-contact:hover {
  background: #f4f8f5;
}
.detail-metadata {
  border-top: 1px solid #e6e8e4;
  padding-top: 20px;
  font-size: 15px;
  line-height: 24px;
}
.detail-metadata > div {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr);
  padding: 11px 0;
  border-bottom: 1px solid #e6e8e4;
}
.detail-metadata dt {
  color: #6b6f6b;
}
.detail-metadata dd {
  overflow-wrap: anywhere;
}
.detail-content {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 36px;
  border-top: 1px solid #e6e8e4;
  padding-top: 32px;
}
.detail-content h2 {
  font: 500 22px/1.3 var(--font-landing-serif);
}
.detail-content p {
  margin-top: 8px;
  color: #6b6f6b;
  font-size: 15px;
  line-height: 24px;
  white-space: pre-line;
}
.detail-resources {
  margin-top: 32px;
  padding: 71px 32px 80px;
  border-radius: 24px;
  background: #f4f8f5;
}
.detail-resources > h2 {
  font: 500 28px/33.6px var(--font-landing-serif);
}
.resources-intro {
  margin-top: 4px;
  color: #6b6f6b;
  font-size: 15px;
  line-height: 24px;
}
.resources-error {
  margin-top: 16px;
  color: #b91c1c;
  font-size: 14px;
}
.resource-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
  margin-top: 22px;
}
.resource-card {
  min-width: 0;
  overflow: hidden;
  border: 1px solid #e6e8e4;
  border-radius: 20px;
  background: white;
  scroll-margin-top: 24px;
}
.resource-card:target {
  outline: 2px solid #1f5c3f;
  outline-offset: 3px;
}
.resource-preview {
  position: relative;
  display: grid;
  place-items: center;
  height: 276px;
  background: #f6f3ee;
}
.resource-format {
  position: absolute;
  top: 12px;
  left: 12px;
  padding: 2px 8px;
  border: 1px solid #e6e8e4;
  border-radius: 6px;
  background: white;
  font-size: 11px;
  font-weight: 600;
  line-height: 13px;
  letter-spacing: 0.44px;
}
.flyer-preview {
  display: flex;
  align-items: center;
  justify-content: center;
}
.flyer-preview img {
  object-fit: contain;
}
.flyer-preview img + img {
  margin-left: -38px;
}
.presentation-preview {
  position: relative;
  width: 229px;
  height: 129px;
}
.presentation-preview::before {
  content: '';
  position: absolute;
  inset: 12px -12px -12px 12px;
  border: 1px solid #e6e8e4;
  border-radius: 4px;
  background: #f0eee8;
  box-shadow: 0 6px 16px rgb(0 0 0 / 12%);
}
.presentation-slide {
  position: relative;
  display: flex;
  gap: 12px;
  height: 100%;
  padding: 14px;
  border: 1px solid #e6e8e4;
  border-radius: 4px;
  background: white;
  box-shadow: 0 6px 16px rgb(0 0 0 / 12%);
}
.slide-cover {
  width: 76px;
  flex-shrink: 0;
  border-radius: 4px;
  background: #35607f;
}
.slide-lines {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
}
.slide-lines span {
  height: 4px;
  border-radius: 2px;
  background: #d9d9d4;
}
.slide-lines span:nth-child(2) {
  width: 60%;
}
.dummy-preview {
  width: 133px;
  height: 199px;
  object-fit: contain;
  filter: drop-shadow(8px 12px 11px rgb(0 0 0 / 22%));
}
.resource-body {
  padding: 18px 20px 20px;
}
.resource-body h3 {
  font: 500 21px/25.2px var(--font-landing-serif);
}
.resource-metadata {
  margin-top: 4px;
  color: #6b6f6b;
  font-size: 12.5px;
  line-height: 20px;
}
.resource-description {
  min-height: 45px;
  margin-top: 7px;
  color: #6b6f6b;
  font-size: 14px;
  line-height: 22.4px;
}
.resource-state {
  margin-top: 16px;
  color: #6b6f6b;
  font-size: 14px;
  line-height: 22.4px;
}
.resource-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}
.resource-actions a,
.resource-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 38px;
  padding: 6px 16px;
  border: 1px solid #1f5c3f;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
  line-height: 22.4px;
  cursor: pointer;
}
.resource-download {
  background: #1f5c3f;
  color: white;
}
.resource-download:hover {
  background: #17462f;
}
.resource-view {
  color: #1f5c3f;
}
.resource-view:hover {
  background: #f4f8f5;
}
.resource-actions a:focus-visible,
.resource-actions button:focus-visible {
  outline: 2px solid #1f5c3f;
  outline-offset: 3px;
}
@media (max-width: 1000px) {
  .resource-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 700px) {
  .detail-resources {
    padding: 32px 16px;
  }
}
.detail-related {
  margin-top: 56px;
}
.detail-related > h2 {
  margin-bottom: 24px;
  font: 500 36px/1.2 var(--font-landing-serif);
}
.detail-related-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 26px;
}
.detail-related-grid :deep(.cover-link img) {
  max-height: 230px;
  max-width: 154px;
}
.detail-related-grid :deep(.book-details h2) {
  font-size: 20px;
  line-height: 24px;
}
.detail-cover-button:focus-visible,
.detail-contact:focus-visible {
  outline: 2px solid #1f5c3f;
  outline-offset: 4px;
}
@media (max-width: 1100px) {
  .detail-columns {
    grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
    gap: 32px;
  }
  .detail-summary h1 {
    font-size: 34px;
  }
  .detail-cover {
    height: 460px;
  }
}
@media (max-width: 700px) {
  .detail-columns {
    grid-template-columns: minmax(0, 1fr);
    gap: 24px;
    padding-bottom: 32px;
  }
  .detail-cover {
    height: 420px;
  }
  .detail-cover-button img {
    width: 200px;
    height: 300px;
  }
  .detail-summary h1 {
    font-size: 32px;
  }
  .detail-content {
    grid-template-columns: minmax(0, 1fr);
    gap: 24px;
  }
  .detail-related {
    margin-top: 40px;
  }
  .detail-related > h2 {
    font-size: 30px;
  }
  .detail-related-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 24px 16px;
  }
  .detail-related-grid :deep(.cover-link img) {
    max-width: 100%;
  }
  .detail-metadata > div {
    grid-template-columns: 125px minmax(0, 1fr);
  }
}
</style>
