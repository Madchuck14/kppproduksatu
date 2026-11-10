<script setup lang="ts">
import ProductStructureTree from '~/components/ProductStructureTree.vue'
import { educationLevelSchema } from '#shared/schemas/auth'
import {
  structureInputSchema,
  structureOptions,
  structurePath,
  type StructureNode,
} from '#shared/schemas/product-structure'

definePageMeta({ middleware: 'admin' })
useSeoMeta({ title: 'Kelola Struktur Produk | Editor', robots: 'noindex, nofollow' })
const route = useRoute()
const level = computed(() => educationLevelSchema.safeParse(route.query.level).data ?? 'SD')
const { data, error, status, refresh } = await useFetch('/api/admin/product-structure', {
  query: { level },
})
if (error.value?.statusCode === 403)
  throw createError({
    statusCode: 403,
    statusMessage: 'Hanya Editor super yang dapat mengelola Struktur Produk.',
  })
const nodes = computed(() =>
  (data.value ?? []).filter((node) => node.educationLevel === level.value && !node.archived),
)
const selectedId = ref<string | null>(null)
const editingId = ref<string | null>(null)
const form = reactive({
  name: '',
  parentId: null as string | null,
  sortOrder: 0,
  productStatus: '',
})
const saving = ref(false)
const message = ref('')
const failure = ref('')
const archiveFailure = ref('')
const archiveDialog = useTemplateRef<HTMLDialogElement>('archiveDialog')
const selected = computed(() => nodes.value.find((node) => node.id === editingId.value))
const parents = computed(() =>
  structureOptions(
    nodes.value.filter(
      (node) =>
        !editingId.value ||
        !structurePath(nodes.value, node.id).some((part) => part.id === editingId.value),
    ),
  ),
)
const ready = computed(() => status.value !== 'pending' && !error.value)
function create(parentId: string | null = null) {
  selectedId.value = parentId
  editingId.value = null
  Object.assign(form, { name: '', parentId, sortOrder: 0, productStatus: '' })
  failure.value = ''
  message.value = ''
}
function select(id: string) {
  const node = nodes.value.find((item) => item.id === id)
  if (!node) return
  selectedId.value = id
  editingId.value = id
  Object.assign(form, {
    name: node.name,
    parentId: node.parentId,
    sortOrder: node.sortOrder,
    productStatus: node.productStatus ?? '',
  })
  failure.value = ''
  message.value = ''
}
watch(level, () => create())
function requestError(error: unknown) {
  return (
    (error as { data?: { statusMessage?: string } }).data?.statusMessage ??
    'Perubahan gagal disimpan. Isian Anda tetap tersedia. Coba lagi.'
  )
}
async function save() {
  if (saving.value || !ready.value) return
  failure.value = ''
  message.value = ''
  const parsed = structureInputSchema.safeParse({
    ...form,
    educationLevel: level.value,
    productStatus: form.productStatus.trim() || null,
  })
  if (!parsed.success) {
    failure.value = parsed.error.issues[0]?.message ?? 'Periksa data cabang.'
    return
  }
  saving.value = true
  try {
    const node: StructureNode = editingId.value
      ? await $fetch(`/api/admin/product-structure/${editingId.value}`, {
          method: 'PUT',
          body: parsed.data,
        })
      : await $fetch('/api/admin/product-structure', { method: 'POST', body: parsed.data })
    editingId.value = node.id
    selectedId.value = node.id
    await refresh()
    if (!error.value) select(node.id)
    message.value = 'Cabang berhasil disimpan.'
  } catch (error) {
    failure.value = requestError(error)
  } finally {
    saving.value = false
  }
}
function confirmArchive() {
  archiveFailure.value = ''
  archiveDialog.value?.showModal()
}
async function archive() {
  if (!editingId.value || saving.value) return
  saving.value = true
  archiveFailure.value = ''
  try {
    await $fetch(`/api/admin/product-structure/${editingId.value}/archive`, { method: 'POST' })
    archiveDialog.value?.close()
    create()
    await refresh()
    message.value = 'Cabang dan turunannya berhasil diarsipkan.'
  } catch (error) {
    archiveFailure.value = requestError(error)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="structure-manager">
    <header class="manager-heading">
      <div>
        <NuxtLink to="/admin">← Dashboard Editor</NuxtLink>
        <h1>Kelola Struktur Produk</h1>
        <p>Susun kategori dan posisi produk untuk setiap jenjang.</p>
      </div>
      <UButton :disabled="!ready || saving" @click="create()">+ Tambah kategori</UButton>
    </header>
    <div role="tablist" aria-label="Jenjang struktur" class="level-tabs">
      <button
        v-for="item in educationLevelSchema.options"
        :key="item"
        type="button"
        role="tab"
        :aria-selected="level === item"
        :disabled="saving"
        @click="navigateTo({ path: '/admin/struktur-produk', query: { level: item } })"
      >
        {{ item }}
      </button>
    </div>
    <p v-if="status === 'pending'" role="status" class="state-panel">Memuat struktur produk...</p>
    <div v-else-if="error" role="alert" class="state-panel failure">
      <p>Struktur belum dapat dimuat. Periksa akses dan migration struktur.</p>
      <UButton variant="outline" @click="refresh()">Coba lagi</UButton>
    </div>
    <div v-else class="manager-panels">
      <section class="tree-panel" aria-labelledby="structure-list-title">
        <h2 id="structure-list-title">Struktur {{ level }}</h2>
        <ProductStructureTree
          v-if="nodes.length"
          :nodes="nodes"
          :selected-id="selectedId"
          @select="saving ? undefined : select($event)"
        />
        <div v-else class="empty-state">
          <h3>Belum ada struktur</h3>
          <p>Tambahkan kategori utama untuk mulai menyusun cabang {{ level }}.</p>
        </div>
      </section>
      <section class="edit-panel" aria-labelledby="structure-edit-title">
        <div class="panel-heading">
          <h2 id="structure-edit-title">
            {{ editingId ? 'Edit cabang' : form.parentId ? 'Tambah subcabang' : 'Tambah kategori' }}
          </h2>
          <UButton v-if="editingId" variant="outline" :disabled="saving" @click="create(editingId)"
            >+ Tambah subcabang</UButton
          >
        </div>
        <form @submit.prevent="save">
          <fieldset :disabled="saving">
            <label for="structure-name">Nama cabang</label
            ><input
              id="structure-name"
              v-model="form.name"
              maxlength="200"
              required
              placeholder="Contoh: Buku Soal"
            />
            <label for="structure-parent">Induk</label
            ><select id="structure-parent" v-model="form.parentId">
              <option :value="null">Tanpa induk (kategori utama)</option>
              <option v-for="item in parents" :key="item.id" :value="item.id">
                {{ item.label }}
              </option>
            </select>
            <label for="structure-order">Urutan</label
            ><input
              id="structure-order"
              v-model.number="form.sortOrder"
              type="number"
              min="0"
              max="2147483647"
              step="1"
              required
            />
            <p class="help">Angka lebih kecil ditampilkan lebih dahulu pada induk yang sama.</p>
            <label for="structure-status">Status produk (opsional)</label
            ><input
              id="structure-status"
              v-model="form.productStatus"
              maxlength="80"
              placeholder="Contoh: Eksisting atau Produk 2026"
            />
            <p class="help">
              Status ini tampil di bagan. Pengarsipan cabang dikelola melalui aksi terpisah.
            </p>
          </fieldset>
          <p v-if="failure" role="alert" class="failure">{{ failure }}</p>
          <p v-if="message" role="status" class="success">{{ message }}</p>
          <div class="panel-actions">
            <UButton type="submit" :loading="saving" :disabled="saving || !form.name.trim()"
              >Simpan cabang</UButton
            ><UButton
              v-if="editingId"
              type="button"
              color="error"
              variant="outline"
              :disabled="saving"
              @click="confirmArchive"
              >Arsipkan cabang</UButton
            >
          </div>
        </form>
      </section>
    </div>
    <dialog
      ref="archiveDialog"
      aria-labelledby="structure-archive-title"
      class="archive-dialog"
      @cancel="saving ? $event.preventDefault() : null"
    >
      <h2 id="structure-archive-title">Arsipkan cabang {{ selected?.name }}?</h2>
      <p>
        Cabang beserta turunannya akan disembunyikan. Jika masih dipakai buku, termasuk draf,
        pindahkan atau lepas buku dari cabang terlebih dahulu.
      </p>
      <p v-if="archiveFailure" role="alert" class="failure">{{ archiveFailure }}</p>
      <div class="panel-actions">
        <UButton variant="outline" :disabled="saving" @click="archiveDialog?.close()">Batal</UButton
        ><UButton color="error" :loading="saving" :disabled="saving" @click="archive"
          >Arsipkan cabang</UButton
        >
      </div>
    </dialog>
  </section>
</template>

<style scoped>
.structure-manager {
  color: #222;
  padding-top: 24px;
}
.manager-heading,
.panel-heading,
.panel-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}
.manager-heading a {
  color: #1f5c3f;
  font-size: 13px;
}
h1 {
  margin-top: 10px;
  font-size: 32px;
  font-weight: 600;
}
h2 {
  font-size: 20px;
  font-weight: 600;
}
.manager-heading p,
.help,
.empty-state p {
  color: #6b6f6b;
  font-size: 13px;
  line-height: 1.6;
}
.level-tabs {
  display: flex;
  gap: 8px;
  margin: 24px 0;
  border-bottom: 1px solid #e6e8e4;
}
.level-tabs button {
  flex: 1;
  max-width: 130px;
  padding: 12px 18px;
  border-bottom: 3px solid transparent;
  color: #6b6f6b;
}
.level-tabs button[aria-selected='true'] {
  color: #1f5c3f;
  border-color: #1f5c3f;
  font-weight: 600;
}
.manager-panels {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}
.tree-panel,
.edit-panel,
.state-panel {
  min-width: 0;
  padding: 24px;
  border: 1px solid #e6e8e4;
  border-radius: 16px;
  background: white;
}
.tree-panel > h2 {
  margin-bottom: 16px;
}
.empty-state {
  padding: 30px 0;
  text-align: center;
}
fieldset {
  display: grid;
  gap: 7px;
  border: 0;
  padding: 0;
  margin-top: 20px;
}
label {
  margin-top: 8px;
  font-size: 13px;
  font-weight: 600;
}
input,
select {
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid #d6d3d1;
  border-radius: 10px;
  background: white;
  color: #222;
  font-size: 14px;
}
.panel-actions {
  justify-content: flex-start;
  margin-top: 24px;
}
.failure {
  color: #b91c1c;
  margin-top: 16px;
  font-size: 14px;
}
.success {
  color: #1f5c3f;
  margin-top: 16px;
  font-size: 14px;
}
.archive-dialog {
  margin: auto;
  width: min(520px, calc(100% - 32px));
  padding: 24px;
  border: 1px solid #e6e8e4;
  border-radius: 16px;
  color: #222;
  background: white;
}
.archive-dialog::backdrop {
  background: rgb(0 0 0 / 40%);
}
.archive-dialog p {
  margin-top: 14px;
  line-height: 1.6;
  font-size: 14px;
}
input:focus-visible,
select:focus-visible,
button:focus-visible,
a:focus-visible {
  outline: 2px solid #1f5c3f;
  outline-offset: 3px;
}
@media (max-width: 760px) {
  .manager-panels {
    grid-template-columns: minmax(0, 1fr);
  }
  .tree-panel,
  .edit-panel {
    padding: 18px;
  }
  h1 {
    font-size: 27px;
  }
}
</style>
