<script setup lang="ts">
import type { EditorBook } from '#shared/types/editor'

const props = defineProps<{ hasDescription: boolean; currentId?: string }>()
const emit = defineEmits<{
  fill: [book: Pick<EditorBook, 'synopsis' | 'highlights' | 'targetMarket'>]
}>()
const query = ref('')
const results = ref<{ id: string; title: string; bookCode: string | null }[]>([])
const selected = ref('')
const busy = ref(false)
const message = ref('')
const searched = ref(false)
watch(query, () => {
  results.value = []
  selected.value = ''
  searched.value = false
  message.value = ''
})
async function search() {
  if (busy.value || query.value.trim().length < 2) return
  busy.value = true
  selected.value = ''
  results.value = []
  message.value = ''
  const term = query.value.trim()
  try {
    const data = await $fetch('/api/admin/book-description-suggestions', { query: { q: term } })
    if (query.value.trim() !== term) return
    results.value = data.filter((book) => book.id !== props.currentId)
    searched.value = true
  } catch {
    message.value = 'Pencarian gagal. Silakan coba lagi.'
  } finally {
    busy.value = false
  }
}
async function autofill() {
  if (!selected.value || busy.value) return
  busy.value = true
  message.value = ''
  try {
    const { book } = await $fetch<{ book: EditorBook }>(`/api/admin/books/${selected.value}`)
    if (!book.synopsis && !book.highlights.length && !book.targetMarket.length) {
      message.value = 'Buku sumber belum memiliki deskripsi. Pilih buku lain.'
      return
    }
    if (
      props.hasDescription &&
      !window.confirm('Ganti sinopsis, keunggulan, dan target pasar dengan deskripsi buku sumber?')
    )
      return
    emit('fill', book)
    message.value = 'Deskripsi disalin. Periksa dan edit sebelum menyimpan buku.'
  } catch {
    message.value = 'Deskripsi gagal dimuat. Silakan cari atau pilih ulang buku sumber.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="autofill">
    <label for="description-search">Salin deskripsi dari buku lain</label>
    <p>Cari judul paling mirip dalam buku yang dapat Anda akses, termasuk draf.</p>
    <p>Ketiga kolom deskripsi mengikuti sumber. Kolom sumber yang kosong ikut dikosongkan.</p>
    <div class="autofill-actions">
      <input
        id="description-search"
        v-model="query"
        type="search"
        maxlength="200"
        placeholder="Cari judul buku, minimal 2 karakter"
        :disabled="busy"
        @keydown.enter.prevent="search"
      />
      <button type="button" :disabled="busy || query.trim().length < 2" @click="search">
        {{ busy ? 'Memuat…' : 'Cari' }}
      </button>
    </div>
    <template v-if="results.length">
      <label for="description-source">Buku sumber (urutan paling mirip)</label>
      <select id="description-source" v-model="selected" :disabled="busy">
        <option value="" disabled>Pilih buku sumber</option>
        <option v-for="book in results" :key="book.id" :value="book.id">
          {{ book.title }} — {{ book.bookCode || 'Tanpa kode' }}
        </option>
      </select>
      <button type="button" :disabled="busy || !selected" @click="autofill">
        Autofill deskripsi
      </button>
    </template>
    <p v-else-if="searched && !busy">Tidak ada judul serupa. Coba kata kunci lain.</p>
    <p role="status" aria-live="polite">{{ message }}</p>
  </div>
</template>

<style scoped>
.autofill {
  display: grid;
  gap: 10px;
  padding: 16px;
  border: 1px solid #dce8e0;
  border-radius: 12px;
  background: #f7faf8;
}
.autofill p {
  font-size: 13px;
  color: #526459;
}
.autofill-actions {
  display: flex;
  gap: 8px;
}
input,
select {
  min-width: 0;
  width: 100%;
  padding: 10px;
  border: 1px solid #dce8e0;
  border-radius: 8px;
  background: white;
  color: #222;
}
button {
  padding: 10px 16px;
  border-radius: 8px;
  background: #1f5c3f;
  color: white;
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
