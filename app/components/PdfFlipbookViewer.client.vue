<script setup lang="ts">
import type { PDFDocumentLoadingTask } from 'pdfjs-dist'
import type { PageFlip } from 'page-flip'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

const props = withDefaults(
  defineProps<{ url: string; filename: string; downloadUrl: string; title?: string }>(),
  { title: 'dummy' },
)
const emit = defineEmits<{ close: [] }>()
const stage = useTemplateRef<HTMLDivElement>('stage')
const viewport = useTemplateRef<HTMLDivElement>('viewport')
const zoom = ref(100)
const stageWidth = ref(925)
const stageHeight = ref(617)
const stageStyle = computed(() => ({
  width: `${(stageWidth.value * zoom.value) / 100}px`,
  height: `${(stageHeight.value * zoom.value) / 100}px`,
}))
function resizeStage() {
  if (!viewport.value) return
  stageWidth.value = Math.max(240, Math.min(925, viewport.value.clientWidth - 32))
  stageHeight.value = Math.max(180, Math.min(617, viewport.value.clientHeight - 110))
  void nextTick(() => flipbook?.update())
}
function changeZoom(amount: number) {
  zoom.value = Math.max(50, Math.min(200, zoom.value + amount))
}
const loading = ref(true)
const errorMessage = ref('')
const progress = ref(0)
const pageCount = ref(0)
const currentPage = ref(0)
const landscape = ref(false)
let version = 0
let flipbook: PageFlip | undefined
let pdfTask: PDFDocumentLoadingTask | undefined
let resizeObserver: ResizeObserver | undefined
let controller: AbortController | undefined
let stopAnimation: (() => void) | undefined
const imageUrls: string[] = []

// StPageFlip 2.0.7 does not cancel its animation loop in destroy(). Track only
// frames scheduled synchronously by this instance, restoring the browser API immediately.
function startAnimationTracking(initialize: () => void) {
  const nativeRequest = window.requestAnimationFrame
  const frames = new Set<number>()
  let active = true
  function capture(action: () => void) {
    const previousRequest = window.requestAnimationFrame
    window.requestAnimationFrame = schedule
    try {
      action()
    } finally {
      window.requestAnimationFrame = previousRequest
    }
  }
  function schedule(callback: FrameRequestCallback): number {
    const frame = nativeRequest.call(window, (time) => {
      frames.delete(frame)
      if (active) capture(() => callback(time))
    })
    frames.add(frame)
    return frame
  }
  stopAnimation = () => {
    active = false
    for (const frame of frames) window.cancelAnimationFrame(frame)
    frames.clear()
  }
  capture(initialize)
}

const lastVisiblePage = computed(() =>
  Math.min(pageCount.value, currentPage.value + (landscape.value && currentPage.value > 0 ? 2 : 1)),
)
const pageLabel = computed(() => {
  const first = currentPage.value + 1
  return lastVisiblePage.value > first
    ? `Halaman ${first}–${lastVisiblePage.value} dari ${pageCount.value}`
    : `Halaman ${first} dari ${pageCount.value}`
})

function dispose() {
  version += 1
  controller?.abort()
  resizeObserver?.disconnect()
  stopAnimation?.()
  stopAnimation = undefined
  flipbook?.destroy()
  flipbook = undefined
  void pdfTask?.destroy()
  pdfTask = undefined
  for (const url of imageUrls) URL.revokeObjectURL(url)
  imageUrls.length = 0
  stage.value?.replaceChildren()
}

function syncPage() {
  if (!flipbook) return
  currentPage.value = flipbook.getCurrentPageIndex()
  landscape.value = flipbook.getOrientation() === 'landscape'
}

async function loadBook() {
  dispose()
  const run = version
  const container = stage.value
  if (!container || !props.url) return
  loading.value = true
  errorMessage.value = ''
  progress.value = 0
  pageCount.value = 0
  currentPage.value = 0
  controller = new AbortController()
  let unsupportedPresentation = false

  try {
    const [pdfjs, { PageFlip }] = await Promise.all([import('pdfjs-dist'), import('page-flip')])
    if (run !== version) return
    // Fetch once so later page turns do not depend on the signed URL's expiry.
    const response = await fetch(props.url, { signal: controller.signal })
    if (!response.ok) throw new Error('PDF tidak tersedia')
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('presentation') || contentType.includes('powerpoint')) {
      unsupportedPresentation = true
      throw new Error('Pratinjau membutuhkan PDF')
    }
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (run !== version) return
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
    const task = pdfjs.getDocument({ data: bytes })
    pdfTask = task
    const documentPdf = await task.promise
    if (run !== version) return
    pageCount.value = documentPdf.numPages
    const firstPage = await documentPdf.getPage(1)
    const firstViewport = firstPage.getViewport({ scale: 1 })
    const ratio = firstViewport.width / firstViewport.height
    const elements: HTMLElement[] = []

    for (let number = 1; number <= documentPdf.numPages; number += 1) {
      if (run !== version) return
      const page = await documentPdf.getPage(number)
      const original = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({
        scale: Math.min(1200 / original.width, 1600 / original.height),
      })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas tidak tersedia')
      await page.render({ canvas, canvasContext: context, viewport }).promise
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.9),
      )
      canvas.width = 0
      canvas.height = 0
      page.cleanup()
      if (run !== version) return
      if (!blob) throw new Error('Halaman tidak dapat disiapkan')
      const url = URL.createObjectURL(blob)
      imageUrls.push(url)
      const image = new Image()
      image.src = url
      image.alt = `Halaman ${number}`
      image.className = 'h-full w-full object-contain'
      await image.decode()
      if (run !== version) return
      const element = document.createElement('div')
      element.className = 'bg-white shadow-lg'
      element.append(image)
      elements.push(element)
      progress.value = number
    }

    await task.destroy()
    if (run !== version) return
    pdfTask = undefined
    const book = document.createElement('div')
    book.style.height = '100%'
    book.style.width = '100%'
    book.append(...elements)
    container.append(book)
    flipbook = new PageFlip(book, {
      width: Math.round(600 * ratio),
      height: 600,
      size: 'stretch',
      minWidth: 200,
      maxWidth: 900,
      minHeight: 200,
      maxHeight: 1400,
      autoSize: false,
      showCover: true,
      usePortrait: true,
      mobileScrollSupport: false,
      maxShadowOpacity: 0.3,
      flippingTime: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 650,
    })
    flipbook.on('flip', syncPage)
    flipbook.on('changeOrientation', syncPage)
    flipbook.on('init', syncPage)
    startAnimationTracking(() => flipbook!.loadFromHTML(elements))
    book.style.minWidth = '0'
    flipbook.update()
    syncPage()
    resizeObserver = new ResizeObserver(resizeStage)
    if (viewport.value) resizeObserver.observe(viewport.value)
    resizeStage()
  } catch {
    if (run === version) {
      dispose()
      errorMessage.value = unsupportedPresentation
        ? 'Berkas presentasi ini berformat PPT/PPTX. Unduh untuk membukanya. Pratinjau memerlukan PDF.'
        : 'PDF belum dapat ditampilkan. Tutup popup lalu coba lagi.'
      loading.value = false
    }
  } finally {
    if (run === version) loading.value = false
  }
}

function handleKey(event: KeyboardEvent) {
  if (event.target instanceof HTMLSelectElement) return
  if (!flipbook) return
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    flipbook.flipNext()
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    flipbook.flipPrev()
  }
}

onMounted(loadBook)
watch(() => props.url, loadBook)
watch(zoom, () => void nextTick(() => flipbook?.update()))
onBeforeUnmount(dispose)
</script>

<template>
  <div class="dummy-viewer" @keydown="handleKey">
    <header class="dummy-toolbar">
      <div class="dummy-file">
        <button
          type="button"
          class="dummy-close"
          :aria-label="`Tutup pratinjau ${title}`"
          @click="emit('close')"
        >
          <img src="/images/dummy-preview/close.svg" alt="" width="22" height="22" />
        </button>
        <span class="dummy-format">PDF</span>
        <span class="dummy-filename" :title="filename">{{ filename }}</span>
      </div>
      <div class="dummy-zoom" aria-label="Perbesaran buku">
        <button type="button" aria-label="Perkecil" :disabled="zoom <= 50" @click="changeZoom(-25)">
          &minus;
        </button>
        <div class="zoom-select">
          <select v-model.number="zoom" aria-label="Persentase perbesaran">
            <option v-for="value in [50, 75, 100, 125, 150, 175, 200]" :key="value" :value="value">
              {{ value }}%
            </option>
          </select>
          <img src="/images/dummy-preview/chevron.svg" alt="" width="6" height="6" />
        </div>
        <button type="button" aria-label="Perbesar" :disabled="zoom >= 200" @click="changeZoom(25)">
          +
        </button>
      </div>
      <div class="dummy-download-wrap">
        <a :href="downloadUrl" class="dummy-download">
          <img src="/images/dummy-preview/download.svg" alt="" width="16" height="16" />Unduh
        </a>
      </div>
    </header>
    <div class="dummy-reading-area">
      <div ref="viewport" class="dummy-viewport">
        <div class="dummy-book-space">
          <div
            ref="stage"
            class="flipbook-stage"
            :style="stageStyle"
            :aria-label="`Halaman ${title}`"
          />
        </div>
      </div>
      <div v-if="loading || errorMessage" class="dummy-loading">
        <p v-if="errorMessage" role="alert" class="text-red-700">{{ errorMessage }}</p>
        <p v-else role="status">
          Menyiapkan buku{{ pageCount ? `: ${progress} dari ${pageCount} halaman` : '...' }}
        </p>
      </div>
      <nav
        v-if="!loading && !errorMessage"
        class="dummy-pagination"
        :aria-label="`Navigasi halaman ${title}`"
      >
        <button
          type="button"
          aria-label="Sebelumnya"
          :disabled="currentPage === 0"
          @click="flipbook?.flipPrev()"
        >
          &lsaquo;
        </button>
        <p role="status">{{ pageLabel }}</p>
        <button
          type="button"
          aria-label="Berikutnya"
          :disabled="lastVisiblePage >= pageCount"
          @click="flipbook?.flipNext()"
        >
          &rsaquo;
        </button>
      </nav>
    </div>
  </div>
</template>

<style scoped>
.dummy-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: #222;
  font-family: var(--font-landing-sans);
}
.dummy-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 16px;
  min-height: 60px;
  padding: 0 16px;
  background: white;
}
.dummy-file {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.dummy-close {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 50%;
  cursor: pointer;
}
.dummy-close:hover {
  background: #f4f8f5;
}
.dummy-format {
  padding: 2px 8px;
  border: 1px solid #e6e8e4;
  border-radius: 6px;
  background: #f4f8f5;
  font-size: 10.5px;
  font-weight: 600;
  line-height: 13px;
  letter-spacing: 0.52px;
}
.dummy-filename {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
  font-weight: 500;
  line-height: 24px;
}
.dummy-zoom {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #6b6f6b;
}
.dummy-zoom > button {
  width: 28px;
  height: 36px;
  font-size: 20px;
  cursor: pointer;
}
.zoom-select {
  position: relative;
}
.zoom-select select {
  appearance: none;
  padding: 6px 18px 6px 4px;
  background: transparent;
  font-size: 14px;
  cursor: pointer;
}
.zoom-select img {
  position: absolute;
  right: 4px;
  top: calc(50% - 3px);
  pointer-events: none;
}
.dummy-download-wrap {
  display: flex;
  justify-content: end;
}
.dummy-download {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 6px 18px;
  border: 1px solid #1f5c3f;
  border-radius: 12px;
  background: #1f5c3f;
  color: white;
  font-size: 14px;
  font-weight: 500;
  line-height: 23px;
}
.dummy-download:hover {
  background: #17462f;
}
.dummy-reading-area {
  position: relative;
  flex: 1;
  min-height: 0;
  background: #eceeea;
}
.dummy-viewport {
  width: 100%;
  height: 100%;
  overflow: auto;
}
.dummy-book-space {
  display: grid;
  place-items: center;
  min-width: 100%;
  min-height: 100%;
  width: max-content;
  padding: 20px 16px 90px;
}
.flipbook-stage {
  flex-shrink: 0;
  touch-action: none;
}
.flipbook-stage :deep(.stf__wrapper) {
  position: relative;
  height: 100%;
  width: 100%;
}
.flipbook-stage :deep(.stf__parent) {
  touch-action: none;
}
.flipbook-stage :deep(.stf__item) {
  box-shadow: 0 14px 40px rgb(0 0 0 / 18%);
}
.dummy-loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: #eceeea;
  color: #6b6f6b;
  text-align: center;
  font-size: 14px;
}
.dummy-pagination {
  position: absolute;
  bottom: 15px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px;
  border: 1px solid #e6e8e4;
  border-radius: 99px;
  background: white;
  box-shadow: 0 6px 20px rgb(0 0 0 / 12%);
}
.dummy-pagination button {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: #f4f8f5;
  font-size: 20px;
  line-height: 20px;
  cursor: pointer;
}
.dummy-pagination p {
  width: 170px;
  text-align: center;
  white-space: nowrap;
  font-size: 14px;
  line-height: 22.4px;
}
.dummy-viewer button:disabled {
  opacity: 0.4;
  cursor: default;
}
.dummy-viewer button:focus-visible,
.dummy-viewer a:focus-visible,
.dummy-viewer select:focus-visible {
  outline: 2px solid #1f5c3f;
  outline-offset: 3px;
}
@media (max-width: 700px) {
  .dummy-toolbar {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    padding: 8px;
  }
  .dummy-file {
    grid-column: 1 / -1;
    gap: 8px;
  }
  .dummy-zoom {
    padding-left: 8px;
  }
  .dummy-download {
    padding: 6px 12px;
  }
  .dummy-pagination p {
    width: 150px;
    font-size: 13px;
  }
}
</style>
