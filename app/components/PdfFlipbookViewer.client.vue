<script setup lang="ts">
import type { PDFDocumentLoadingTask } from 'pdfjs-dist'
import type { PageFlip } from 'page-flip'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

const props = defineProps<{ url: string }>()
const stage = useTemplateRef<HTMLDivElement>('stage')
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

  try {
    const [pdfjs, { PageFlip }] = await Promise.all([import('pdfjs-dist'), import('page-flip')])
    if (run !== version) return
    // Fetch once so later page turns do not depend on the signed URL's expiry.
    const response = await fetch(props.url, { signal: controller.signal })
    if (!response.ok) throw new Error('PDF tidak tersedia')
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
      minWidth: 320,
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
    resizeObserver = new ResizeObserver(() => flipbook?.update())
    resizeObserver.observe(container)
  } catch {
    if (run === version) {
      dispose()
      errorMessage.value = 'Dummy buku belum dapat ditampilkan. Tutup popup lalu coba lagi.'
      loading.value = false
    }
  } finally {
    if (run === version) loading.value = false
  }
}

function handleKey(event: KeyboardEvent) {
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
onBeforeUnmount(dispose)
</script>

<template>
  <div class="flex h-full flex-col bg-stone-200" @keydown="handleKey">
    <div class="relative min-h-0 flex-1 overflow-hidden p-3 sm:p-6">
      <div
        ref="stage"
        class="flipbook-stage h-full w-full touch-none"
        aria-label="Halaman dummy buku"
      />
      <div
        v-if="loading || errorMessage"
        class="absolute inset-0 flex items-center justify-center bg-stone-200 p-6 text-center text-sm"
      >
        <p v-if="errorMessage" role="alert" class="text-red-700">{{ errorMessage }}</p>
        <p v-else role="status" class="text-stone-600">
          Menyiapkan buku{{ pageCount ? `: ${progress} dari ${pageCount} halaman` : '...' }}
        </p>
      </div>
    </div>
    <div
      v-if="!loading && !errorMessage"
      class="border-t border-stone-300 bg-white px-3 py-3 sm:px-6"
    >
      <div class="flex items-center justify-center gap-3 sm:gap-6">
        <button
          type="button"
          :disabled="currentPage === 0"
          class="rounded-lg border border-stone-300 px-3 py-2 text-sm disabled:opacity-40"
          @click="flipbook?.flipPrev()"
        >
          Sebelumnya
        </button>
        <p role="status" class="text-center text-xs text-stone-600 sm:text-sm">{{ pageLabel }}</p>
        <button
          type="button"
          :disabled="lastVisiblePage >= pageCount"
          class="rounded-lg border border-stone-300 px-3 py-2 text-sm disabled:opacity-40"
          @click="flipbook?.flipNext()"
        >
          Berikutnya
        </button>
      </div>
      <p class="mt-2 text-center text-xs text-stone-500">
        Geser halaman atau tarik sudut buku. Gunakan tombol navigasi atau panah keyboard.
      </p>
    </div>
  </div>
</template>

<style scoped>
.flipbook-stage :deep(.stf__wrapper) {
  position: relative;
  height: 100%;
  width: 100%;
}

.flipbook-stage :deep(.stf__parent) {
  touch-action: none;
}
</style>
