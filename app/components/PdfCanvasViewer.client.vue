<script setup lang="ts">
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

const props = withDefaults(defineProps<{ url: string; zoom?: number }>(), { zoom: 100 })
const pages = useTemplateRef<HTMLDivElement>('pages')
const loading = ref(false)
const errorMessage = ref('')
let renderVersion = 0
const pageSizes: Array<{ canvas: HTMLCanvasElement; width: number; height: number }> = []
function applyZoom() {
  for (const page of pageSizes) {
    page.canvas.style.width = `${Math.floor((page.width * props.zoom) / 100)}px`
    page.canvas.style.height = `${Math.floor((page.height * props.zoom) / 100)}px`
  }
}

async function renderPdf() {
  const container = pages.value
  if (!container || !props.url) return
  const version = ++renderVersion
  container.replaceChildren()
  pageSizes.length = 0
  loading.value = true
  errorMessage.value = ''
  try {
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
    const pdfDocument = await pdfjs.getDocument({ url: props.url }).promise
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      if (version !== renderVersion) return
      const page = await pdfDocument.getPage(pageNumber)
      const baseViewport = page.getViewport({ scale: 1 })
      const availableWidth = Math.max(280, Math.min(container.clientWidth - 24, 1100))
      const scale = availableWidth / baseViewport.width
      const viewport = page.getViewport({ scale })
      const pixelRatio = window.devicePixelRatio || 1
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width * pixelRatio)
      canvas.height = Math.floor(viewport.height * pixelRatio)
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`
      canvas.className = 'mx-auto block rounded bg-white shadow-sm'
      pageSizes.push({ canvas, width: viewport.width, height: viewport.height })
      applyZoom()
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas tidak tersedia')
      container.append(canvas)
      await page.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
      }).promise
    }
  } catch {
    if (version === renderVersion)
      errorMessage.value = 'PDF belum dapat ditampilkan. Coba muat ulang.'
  } finally {
    if (version === renderVersion) loading.value = false
  }
}

onMounted(renderPdf)
watch(() => props.url, renderPdf)
watch(() => props.zoom, applyZoom)
onBeforeUnmount(() => {
  renderVersion += 1
})
</script>

<template>
  <div
    role="region"
    aria-label="Halaman PDF"
    tabindex="0"
    class="relative h-full overflow-auto bg-stone-200 p-3 sm:p-5"
  >
    <p
      v-if="loading"
      role="status"
      class="sticky top-2 z-10 mx-auto w-fit rounded bg-white px-4 py-2 text-sm shadow"
    >
      Memuat PDF...
    </p>
    <p v-if="errorMessage" role="alert" class="m-auto rounded-lg bg-white p-5 text-sm text-red-700">
      {{ errorMessage }}
    </p>
    <div ref="pages" class="space-y-4" />
  </div>
</template>
