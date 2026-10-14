<script setup lang="ts">
import type { PPTXViewer } from 'pptxviewjs'

const props = defineProps<{ url: string; title: string; downloadUrl: string }>()
const emit = defineEmits<{ close: [] }>()
const root = useTemplateRef<HTMLDivElement>('root')
const viewport = useTemplateRef<HTMLDivElement>('viewport')
const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const loading = ref(true)
const rendering = ref(false)
const errorMessage = ref('')
const count = ref(0)
const current = ref(0)
const zoom = ref(100)
const controller = new AbortController()
// The pinned library's public typings omit processor sizing/cache methods.
type Viewer = PPTXViewer & {
  processor?: {
    getSlideDimensions?: () => { cx: number; cy: number }
    clearCaches?: () => void
  }
}
let viewer: Viewer | undefined
let observer: ResizeObserver | undefined
let disposed = false
let pending = false

function releaseViewer() {
  const processor = viewer?.processor
  processor?.clearCaches?.()
  const globals = globalThis as typeof globalThis & {
    currentProcessor?: { processor?: unknown }
    currentZipData?: unknown
    currentSlideData?: unknown
  }
  if (processor && globals.currentProcessor?.processor === processor) {
    delete globals.currentProcessor
    delete globals.currentZipData
    delete globals.currentSlideData
  }
  viewer?.destroy()
  viewer = undefined
}

async function render(index = current.value) {
  if (disposed || pending || !viewer || !canvas.value || !viewport.value) return
  pending = true
  rendering.value = true
  try {
    const dimensions = viewer.processor?.getSlideDimensions?.()
    const ratio = dimensions?.cy ? dimensions.cx / dimensions.cy : 16 / 9
    const width =
      Math.max(
        200,
        Math.min(viewport.value.clientWidth - 32, (viewport.value.clientHeight - 32) * ratio),
      ) *
      (zoom.value / 100)
    canvas.value.style.width = `${width}px`
    canvas.value.style.height = `${width / ratio}px`
    canvas.value.width = Math.round(width * window.devicePixelRatio)
    canvas.value.height = Math.round((width / ratio) * window.devicePixelRatio)
    await viewer.renderSlide(index, canvas.value)
    if (!disposed) current.value = viewer.getCurrentSlideIndex()
  } catch {
    if (!disposed)
      errorMessage.value = 'Slide belum dapat ditampilkan. Unduh PowerPoint untuk membukanya.'
  } finally {
    pending = false
    rendering.value = false
    if (disposed) releaseViewer()
  }
}

function changeSlide(direction: number) {
  const index = Math.max(0, Math.min(count.value - 1, current.value + direction))
  if (index !== current.value) void render(index)
}
function changeZoom(amount: number) {
  if (pending || loading.value) return
  zoom.value = Math.max(50, Math.min(200, zoom.value + amount))
  void render()
}
function keydown(event: KeyboardEvent) {
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault()
    changeSlide(event.key === 'ArrowRight' ? 1 : -1)
  }
}

onMounted(async () => {
  pending = true
  try {
    const [{ default: JSZip }, { default: Chart }] = await Promise.all([
      import('jszip'),
      import('chart.js/auto'),
    ])
    if (disposed) return
    // Supply bundled dependencies before import; the library otherwise tries a JSZip CDN.
    Object.assign(globalThis, { JSZip, Chart })
    const { PPTXViewer } = await import('pptxviewjs')
    if (disposed || !canvas.value) return
    const response = await fetch(props.url, { signal: controller.signal, credentials: 'omit' })
    if (!response.ok || !response.body) throw new Error('PPTX download failed')
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 50 * 1024 * 1024) {
          await reader.cancel()
          throw new Error('PPTX exceeds upload limit')
        }
        chunks.push(value)
      }
    } finally {
      reader.releaseLock()
    }
    if (disposed) return
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    viewer = new PPTXViewer({
      canvas: canvas.value,
      enableThumbnails: false,
      autoChartRerenderDelayMs: 0,
    }) as Viewer
    await viewer.loadFile(bytes)
    if (disposed) return
    count.value = viewer.getSlideCount()
    if (!count.value) throw new Error('PPTX has no slides')
  } catch {
    if (!disposed)
      errorMessage.value = 'PowerPoint belum dapat ditampilkan. Unduh berkas untuk membukanya.'
  } finally {
    pending = false
    loading.value = false
    if (disposed) releaseViewer()
  }
  if (disposed || errorMessage.value) return
  await render(0)
  if (disposed) return
  observer = new ResizeObserver(() => void render())
  if (viewport.value) observer.observe(viewport.value)
  root.value?.focus()
})
onBeforeUnmount(() => {
  disposed = true
  controller.abort()
  observer?.disconnect()
  if (!pending) releaseViewer()
})
</script>

<template>
  <div ref="root" class="powerpoint-viewer" tabindex="0" @keydown="keydown">
    <div class="viewer-toolbar">
      <h2>{{ title }}</h2>
      <a :href="downloadUrl">Unduh PowerPoint</a>
      <button type="button" @click="emit('close')">Tutup</button>
    </div>
    <div ref="viewport" class="slide-viewport" :aria-busy="loading || rendering">
      <p v-if="loading" role="status">Memuat PowerPoint...</p>
      <p v-else-if="errorMessage" role="alert">{{ errorMessage }}</p>
      <canvas
        v-show="!loading && !errorMessage"
        ref="canvas"
        width="960"
        height="540"
        role="img"
        :aria-label="`${title}, slide ${current + 1} dari ${count}`"
      />
    </div>
    <div class="viewer-controls">
      <button
        type="button"
        :disabled="loading || rendering || current === 0"
        @click="changeSlide(-1)"
      >
        Sebelumnya
      </button>
      <span aria-live="polite">{{ count ? current + 1 : 0 }} / {{ count }}</span>
      <button
        type="button"
        :disabled="loading || rendering || current >= count - 1"
        @click="changeSlide(1)"
      >
        Berikutnya
      </button>
      <button
        type="button"
        aria-label="Perkecil slide"
        :disabled="loading || rendering || zoom === 50"
        @click="changeZoom(-25)"
      >
        −
      </button>
      <span>{{ zoom }}%</span>
      <button
        type="button"
        aria-label="Perbesar slide"
        :disabled="loading || rendering || zoom === 200"
        @click="changeZoom(25)"
      >
        +
      </button>
    </div>
  </div>
</template>

<style scoped>
.powerpoint-viewer {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  background: #f5f5f4;
  font-family: var(--font-sans);
}
.viewer-toolbar,
.viewer-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px 16px;
  background: white;
}
.viewer-toolbar h2 {
  flex: 1;
  font-weight: 600;
}
.viewer-toolbar a,
button {
  border: 1px solid #d6d3d1;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 14px;
}
button:disabled {
  opacity: 0.4;
}
.slide-viewport {
  display: grid;
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 16px;
  place-items: center;
}
canvas {
  max-width: none;
  flex-shrink: 0;
  background: white;
}
.viewer-controls {
  justify-content: center;
  border-top: 1px solid #e7e5e4;
}
</style>
