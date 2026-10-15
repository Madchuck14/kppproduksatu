<script setup lang="ts">
defineProps<{ filename: string; title: string; downloadUrl?: string; disabled?: boolean }>()
const zoom = defineModel<number>('zoom', { default: 100 })
function changeZoom(amount: number) {
  zoom.value = Math.max(50, Math.min(200, zoom.value + amount))
}
const emit = defineEmits<{ close: [] }>()
</script>

<template>
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
      <button
        type="button"
        aria-label="Perkecil"
        :disabled="disabled || zoom <= 50"
        @click="changeZoom(-25)"
      >
        &minus;
      </button>
      <div class="zoom-select">
        <select v-model.number="zoom" aria-label="Persentase perbesaran" :disabled="disabled">
          <option v-for="value in [50, 75, 100, 125, 150, 175, 200]" :key="value" :value="value">
            {{ value }}%
          </option>
        </select>
        <img src="/images/dummy-preview/chevron.svg" alt="" width="6" height="6" />
      </div>
      <button
        type="button"
        aria-label="Perbesar"
        :disabled="disabled || zoom >= 200"
        @click="changeZoom(25)"
      >
        +
      </button>
    </div>
    <div class="dummy-download-wrap">
      <a v-if="downloadUrl" :href="downloadUrl" class="dummy-download">
        <img src="/images/dummy-preview/download.svg" alt="" width="16" height="16" />Unduh
      </a>
    </div>
  </header>
</template>

<style scoped>
.dummy-toolbar {
  display: grid;
  flex-shrink: 0;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 16px;
  min-height: 60px;
  padding: 0 16px;
  color: #222;
  font-family: var(--font-landing-sans);
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
button:disabled,
select:disabled {
  opacity: 0.4;
  cursor: default;
}
button:focus-visible,
a:focus-visible,
select:focus-visible {
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
}
</style>
