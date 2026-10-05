<script setup lang="ts">
import { editorQuerySchema } from '#shared/schemas/editor'
import { educationLevelSchema } from '#shared/schemas/auth'
import type { EditorBook } from '#shared/types/editor'

definePageMeta({ middleware: 'admin' })
useSeoMeta({ title: 'Dashboard Editor', robots: 'noindex, nofollow' })
const route = useRoute()
const filters = computed(() => {
  const parsed = editorQuerySchema.safeParse(route.query)
  return parsed.success ? parsed.data : editorQuerySchema.parse({})
})
const search = ref(filters.value.q)
const level = ref(filters.value.level ?? '')
const publication = ref(filters.value.status)
watch(filters, (value) => {
  search.value = value.q
  level.value = value.level ?? ''
  publication.value = value.status
})
const { data, error, status, refresh } = await useFetch('/api/admin/books', { query: filters })
const levels = computed(() =>
  data.value?.account.isSuper
    ? educationLevelSchema.options
    : (data.value?.account.educationLevels ?? []),
)
const totalPages = computed(() =>
  Math.max(1, Math.ceil((data.value?.total ?? 0) / (data.value?.pageSize ?? 12))),
)
async function applyFilters(page = 1) {
  await navigateTo({
    path: '/admin',
    query: {
      ...(search.value.trim() ? { q: search.value.trim() } : {}),
      ...(level.value ? { level: level.value } : {}),
      ...(publication.value !== 'all' ? { status: publication.value } : {}),
      ...(page > 1 ? { page } : {}),
    },
  })
}
const deleting = ref(false)
const deleteTarget = ref<EditorBook | null>(null)
const confirmation = ref('')
const message = ref('')
const deleteDialog = useTemplateRef('deleteDialog')
function confirmDelete(book: EditorBook) {
  deleteTarget.value = book
  confirmation.value = ''
  message.value = ''
  deleteDialog.value?.showModal()
}
async function removeBook() {
  if (!deleteTarget.value || confirmation.value !== deleteTarget.value.title || deleting.value)
    return
  deleting.value = true
  try {
    await $fetch(`/api/admin/books/${deleteTarget.value.id}`, { method: 'DELETE' })
    deleteDialog.value?.close()
    deleteTarget.value = null
    message.value = 'Buku berhasil dihapus.'
    await refresh()
    if (!data.value?.books.length && filters.value.page > 1)
      await applyFilters(filters.value.page - 1)
  } catch {
    message.value = 'Buku gagal dihapus. Periksa akses Anda lalu coba lagi.'
  } finally {
    deleting.value = false
  }
}
const fieldClass =
  'w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm focus:outline-2 focus:outline-emerald-700'
</script>

<template>
  <section>
    <div class="mb-8 flex flex-wrap items-end justify-between gap-5">
      <div>
        <p class="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800">
          Ruang kerja editorial
        </p>
        <h1 class="display-heading text-4xl sm:text-5xl">Dashboard Editor</h1>
        <p class="mt-3 max-w-xl text-stone-600">
          Rawat informasi buku agar tim Sales selalu membawa katalog yang tepat.
        </p>
      </div>
      <UButton to="/admin/books/new" size="lg" :disabled="!levels.length">+ Tambah buku</UButton>
    </div>

    <div v-if="error" role="alert" class="rounded-xl border border-red-200 bg-red-50 p-6">
      <p class="font-semibold text-red-800">Dashboard belum dapat dimuat.</p>
      <p class="mt-2 text-sm text-red-700">
        Coba muat ulang. Jika tetap gagal, hubungi pengelola untuk memeriksa akses dan kesiapan
        katalog.
      </p>
      <UButton class="mt-4" variant="outline" @click="refresh()">Coba lagi</UButton>
    </div>
    <template v-else-if="data">
      <div
        class="mb-8 rounded-2xl bg-emerald-950 p-6 text-white sm:flex sm:items-center sm:justify-between sm:gap-6"
      >
        <div>
          <p class="font-semibold">{{ data.account.isSuper ? 'Editor super' : 'Editor' }}</p>
          <p class="mt-1 text-sm text-emerald-100">
            {{
              data.account.isSuper
                ? 'Akses seluruh jenjang pendidikan'
                : 'Jenjang yang dapat Anda kelola'
            }}
          </p>
        </div>
        <div class="mt-4 flex flex-wrap gap-2 sm:mt-0">
          <span
            v-for="item in levels"
            :key="item"
            class="rounded-full border border-emerald-700 bg-emerald-900 px-4 py-1.5 text-sm"
            >{{ item }}</span
          ><span v-if="!levels.length" class="text-sm">Belum ada jenjang. Hubungi pengelola.</span>
        </div>
      </div>
      <dl class="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div
          v-for="stat in [
            { label: 'Total buku', value: data.stats.total },
            { label: 'Dipublikasikan', value: data.stats.published },
            { label: 'Draf', value: data.stats.draft },
            { label: 'Perlu dilengkapi', value: data.stats.incomplete },
          ]"
          :key="stat.label"
          class="rounded-xl border border-stone-200 bg-white p-5"
        >
          <dt class="text-sm text-stone-500">{{ stat.label }}</dt>
          <dd class="mt-3 text-3xl font-semibold tracking-tight">{{ stat.value }}</dd>
        </div>
      </dl>
      <p
        v-if="data.stats.incomplete"
        class="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
      >
        {{ data.stats.incomplete }} buku belum memiliki kode atau jenjang. Buka Edit untuk
        melengkapi sebelum menyimpan perubahan.
      </p>
      <p v-if="message && !deleteTarget" role="status" class="mb-5 text-sm text-emerald-800">
        {{ message }}
      </p>
      <p
        v-else-if="route.query.notice === 'saved'"
        role="status"
        class="mb-5 text-sm text-emerald-800"
      >
        Buku berhasil disimpan.
      </p>
      <div class="overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <div class="border-b border-stone-200 p-5 sm:p-6">
          <h2 class="text-xl font-semibold">Koleksi buku</h2>
          <form
            class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_150px_170px_auto]"
            @submit.prevent="applyFilters()"
          >
            <div>
              <label for="editor-search" class="mb-1.5 block text-xs font-medium text-stone-600"
                >Cari buku</label
              ><input
                id="editor-search"
                v-model="search"
                type="search"
                maxlength="100"
                placeholder="Judul, kode buku, atau penulis"
                :class="fieldClass"
              />
            </div>
            <div>
              <label for="editor-level" class="mb-1.5 block text-xs font-medium text-stone-600"
                >Jenjang</label
              ><select id="editor-level" v-model="level" :class="fieldClass">
                <option value="">Semua jenjang</option>
                <option v-for="item in levels" :key="item" :value="item">{{ item }}</option>
              </select>
            </div>
            <div>
              <label for="editor-status" class="mb-1.5 block text-xs font-medium text-stone-600"
                >Status</label
              ><select id="editor-status" v-model="publication" :class="fieldClass">
                <option value="all">Semua status</option>
                <option value="published">Dipublikasikan</option>
                <option value="draft">Draf</option>
              </select>
            </div>
            <UButton
              type="submit"
              class="justify-center self-end"
              size="lg"
              :loading="status === 'pending'"
              >Terapkan</UButton
            >
          </form>
        </div>
        <div :aria-busy="status === 'pending'" class="overflow-x-auto">
          <table v-if="data.books.length" class="w-full min-w-[720px] text-left text-sm">
            <thead class="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th scope="col" class="px-6 py-4">Buku</th>
                <th scope="col" class="px-4 py-4">Jenjang</th>
                <th scope="col" class="px-4 py-4">Harga</th>
                <th scope="col" class="px-4 py-4">Status</th>
                <th scope="col" class="px-6 py-4 text-right">Tindakan</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-stone-100">
              <tr v-for="book in data.books" :key="book.id" class="hover:bg-stone-50/60">
                <td class="px-6 py-5">
                  <div class="flex items-center gap-4">
                    <img
                      :src="book.imageUrl"
                      :alt="`Sampul ${book.title}`"
                      width="44"
                      height="60"
                      loading="lazy"
                      class="h-15 w-11 rounded bg-stone-100 object-contain"
                    />
                    <div class="max-w-64">
                      <NuxtLink
                        :to="`/admin/books/${book.id}`"
                        class="font-semibold text-stone-900 hover:text-emerald-800"
                        >{{ book.title }}</NuxtLink
                      >
                      <p class="mt-1 text-xs text-stone-500">
                        {{ book.bookCode || 'Kode belum diisi' }}
                      </p>
                      <p v-if="book.featured" class="mt-1 text-xs text-emerald-700">Buku pilihan</p>
                    </div>
                  </div>
                </td>
                <td class="px-4 py-5">{{ book.educationLevel || 'Belum diisi' }}</td>
                <td class="whitespace-nowrap px-4 py-5">{{ formatPrice(book.price) }}</td>
                <td class="px-4 py-5">
                  <span
                    class="whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium"
                    :class="
                      book.published
                        ? 'bg-emerald-50 text-emerald-800'
                        : 'bg-stone-100 text-stone-600'
                    "
                    >{{ book.published ? 'Dipublikasikan' : 'Draf' }}</span
                  >
                </td>
                <td class="px-6 py-5">
                  <div class="flex justify-end gap-3">
                    <NuxtLink
                      :to="`/admin/books/${book.id}`"
                      class="font-medium text-emerald-800 hover:underline"
                      >Edit</NuxtLink
                    ><NuxtLink
                      v-if="book.published"
                      :to="`/products/${book.slug}`"
                      class="text-stone-600 hover:underline"
                      >Lihat</NuxtLink
                    ><button
                      type="button"
                      :aria-label="`Hapus ${book.title}`"
                      class="cursor-pointer text-red-700 hover:underline"
                      @click="confirmDelete(book)"
                    >
                      Hapus
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else class="px-6 py-16 text-center">
            <h3 class="font-semibold">Belum ada buku yang cocok</h3>
            <p class="mt-2 text-sm text-stone-500">
              Ubah pencarian atau tambahkan buku untuk jenjang Anda.
            </p>
          </div>
        </div>
        <div
          class="flex flex-wrap items-center justify-between gap-4 border-t border-stone-200 px-6 py-4 text-sm"
        >
          <p class="text-stone-500">
            {{ data.total }} buku · Halaman {{ filters.page }} dari {{ totalPages }}
          </p>
          <div class="flex gap-2">
            <UButton
              variant="outline"
              :disabled="filters.page <= 1 || status === 'pending'"
              @click="applyFilters(filters.page - 1)"
              >Sebelumnya</UButton
            ><UButton
              variant="outline"
              :disabled="filters.page >= totalPages || status === 'pending'"
              @click="applyFilters(filters.page + 1)"
              >Berikutnya</UButton
            >
          </div>
        </div>
      </div>
    </template>
    <dialog
      ref="deleteDialog"
      aria-labelledby="delete-title"
      class="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-xl backdrop:bg-stone-950/40"
      @cancel="deleting ? $event.preventDefault() : null"
      @close="deleteTarget = null"
    >
      <form @submit.prevent="removeBook">
        <h2 id="delete-title" class="text-xl font-semibold">Hapus buku?</h2>
        <p class="mt-3 text-sm leading-relaxed text-stone-600">
          Buku <strong>{{ deleteTarget?.title }}</strong> akan dihapus dari katalog. Tindakan ini
          tidak dapat dibatalkan.
        </p>
        <label for="delete-confirm" class="mb-2 mt-5 block text-sm"
          >Ketik judul buku untuk mengonfirmasi</label
        ><input
          id="delete-confirm"
          v-model="confirmation"
          autocomplete="off"
          :disabled="deleting"
          :class="fieldClass"
        />
        <p v-if="message" role="alert" class="mt-3 text-sm text-red-700">{{ message }}</p>
        <div class="mt-6 flex justify-end gap-3">
          <UButton
            color="neutral"
            variant="outline"
            :disabled="deleting"
            @click="deleteDialog?.close()"
            >Batal</UButton
          ><UButton
            type="submit"
            color="error"
            :loading="deleting"
            :disabled="confirmation !== deleteTarget?.title"
            >Hapus buku</UButton
          >
        </div>
      </form>
    </dialog>
  </section>
</template>
