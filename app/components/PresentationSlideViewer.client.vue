<script setup lang="ts">
const props = defineProps<{ slides: string[]; title: string; downloadUrl: string }>()
const emit = defineEmits<{ close: [] }>()
const viewer = useTemplateRef<HTMLDivElement>('viewer')
const images = ref<string[]>([])
const loading = ref(true)
const errorMessage = ref('')
const page = ref(0)
const zoom = ref(100)
const controller = new AbortController()
const objectUrls: string[] = []
let disposed = false

onMounted(async () => {
  viewer.value?.focus()
  try {
    // Fetch every slide promptly, so later navigation is independent of signed URL expiry.
    images.value = await Promise.all(
      props.slides.map(async (url) => {
        const response = await fetch(url, { signal: controller.signal })
        if (!response.ok) throw new Error('Slide tidak tersedia')
        const blob = await response.blob()
        if (disposed) throw new Error('Penampil ditutup')
        const localUrl = URL.createObjectURL(blob)
        objectUrls.push(localUrl)
        return localUrl
      }),
    )
  } catch {
    controller.abort()
    if (!disposed)
      errorMessage.value =
        'Slide belum dapat ditampilkan. Tutup lalu buka kembali untuk mencoba lagi.'
  } finally {
    if (!disposed) loading.value = false
  }
})
onBeforeUnmount(() => {
  disposed = true
  controller.abort()
  for (const url of objectUrls) URL.revokeObjectURL(url)
})
function move(direction: number) {
  page.value = Math.max(0, Math.min(images.value.length - 1, page.value + direction))
}
function onKey(event: KeyboardEvent) {
  if (event.target instanceof HTMLSelectElement) return
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    move(event.key === 'ArrowLeft' ? -1 : 1)
  }
}
async function fullscreen() {
  try {
    if (document.fullscreenElement === viewer.value) await document.exitFullscreen()
    else await viewer.value?.requestFullscreen()
  } catch {
    errorMessage.value = 'Layar penuh belum tersedia pada browser ini.'
  }
}
</script>

<template>
  <div ref="viewer" tabindex="0" class="presentation-viewer" @keydown="onKey">
    <header class="presentation-toolbar">
      <h2>{{ title }}</h2>
      <a :href="downloadUrl">Unduh PowerPoint</a>
      <button type="button" @click="fullscreen">Layar penuh</button>
      <button type="button" @click="emit('close')">Tutup</button>
    </header>
    <div class="presentation-stage">
      <p v-if="loading" role="status">Memuat slide...</p>
      <p v-else-if="errorMessage" role="alert">{{ errorMessage }}</p>
      <p v-else-if="!images.length">
        Gambar slide belum tersedia. Anda tetap dapat mengunduh PowerPoint asli.
      </p>
      <img
        v-else
        :src="images[page]"
        :alt="`Slide ${page + 1}: ${title}`"
        :style="{ width: `${zoom}%` }"
      />
    </div>
    <footer v-if="images.length && !loading" class="presentation-toolbar presentation-controls">
      <button type="button" :disabled="page === 0" aria-label="Slide sebelumnya" @click="move(-1)">
        Sebelumnya
      </button>
      <span role="status" aria-live="polite">Slide {{ page + 1 }} / {{ images.length }}</span>
      <button
        type="button"
        :disabled="page === images.length - 1"
        aria-label="Slide berikutnya"
        @click="move(1)"
      >
        Berikutnya
      </button>
      <label
        >Zoom
        <select v-model="zoom">
          <option v-for="value in [50, 75, 100, 125, 150, 200]" :key="value" :value="value">
            {{ value }}%
          </option>
        </select></label
      >
    </footer>
  </div>
</template>

<style scoped>
.presentation-viewer {
  display: flex;
  height: 100%;
  flex-direction: column;
  background: white;
  color: #222;
}
.presentation-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid #e6e8e4;
}
.presentation-toolbar h2 {
  flex: 1;
  min-width: 140px;
  font-weight: 600;
}
.presentation-toolbar :is(button, a, select) {
  border: 1px solid #1f5c3f;
  border-radius: 8px;
  padding: 6px 10px;
  color: #1f5c3f;
}
.presentation-toolbar button:disabled {
  opacity: 0.4;
}
.presentation-stage {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: #eeefeb;
  padding: 20px;
}
.presentation-stage img {
  display: block;
  max-width: none;
  height: auto;
  margin: auto;
}
.presentation-stage p {
  padding: 24px;
  text-align: center;
}
.presentation-controls {
  justify-content: center;
  border-top: 1px solid #e6e8e4;
  border-bottom: 0;
}
.presentation-viewer :is(a, button, select):focus-visible {
  outline: 2px solid #1f5c3f;
  outline-offset: 3px;
}
@media (max-width: 640px) {
  .presentation-toolbar {
    padding: 10px;
    gap: 8px;
    font-size: 13px;
  }
  .presentation-stage {
    padding: 10px;
  }
}
</style>
