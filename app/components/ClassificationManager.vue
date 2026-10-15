<script setup lang="ts">
import type { Classification, ClassificationInput } from '#shared/schemas/classifications'

const props = defineProps<{ levels: readonly string[] }>()
const { data, error, refresh, status } = await useClassifications()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const kind = ref<ClassificationInput['kind']>('curriculum')
const name = ref('')
const level = ref('')
const saving = ref(false)
const message = ref('')
const failure = ref('')
const deleteTarget = ref<Classification | null>(null)
const labels = { curriculum: 'Kurikulum', division: 'Divisi', subject: 'Mata pelajaran' }
const options = computed(() =>
  (data.value ?? []).filter(
    (item) =>
      item.kind === kind.value && (item.kind !== 'subject' || item.education_level === level.value),
  ),
)
watch([kind, level], () => {
  deleteTarget.value = null
  name.value = ''
  failure.value = ''
  message.value = ''
})
function open() {
  deleteTarget.value = null
  level.value = props.levels[0] ?? ''
  failure.value = ''
  message.value = ''
  name.value = ''
  dialog.value?.showModal()
  void refresh()
}
function confirmDelete(item: Classification) {
  deleteTarget.value = item
  failure.value = ''
  message.value = ''
}
async function remove() {
  const target = deleteTarget.value
  if (!target || saving.value) return
  saving.value = true
  failure.value = ''
  message.value = ''
  try {
    await $fetch('/api/admin/classifications', {
      method: 'DELETE',
      body: {
        kind: target.kind,
        code: target.code,
        educationLevel: target.education_level,
      },
    })
    deleteTarget.value = null
    message.value = `${labels[target.kind]} berhasil dihapus.`
    await refresh()
  } catch (error) {
    const response = error as { data?: { statusMessage?: string } }
    failure.value = response.data?.statusMessage ?? 'Klasifikasi gagal dihapus. Silakan coba lagi.'
  } finally {
    saving.value = false
  }
}
async function save() {
  if (saving.value || !name.value.trim()) return
  saving.value = true
  failure.value = ''
  message.value = ''
  try {
    await $fetch('/api/admin/classifications', {
      method: 'POST',
      body: {
        kind: kind.value,
        name: name.value.trim(),
        ...(kind.value === 'subject' ? { educationLevel: level.value } : {}),
      },
    })
    name.value = ''
    message.value = `${labels[kind.value]} berhasil ditambahkan.`
    await refresh()
  } catch (error) {
    const response = error as { data?: { statusMessage?: string } }
    failure.value =
      response.data?.statusMessage ?? 'Klasifikasi gagal ditambahkan. Silakan coba lagi.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UButton
    type="button"
    class="classification-manager-button"
    :disabled="!levels.length"
    @click="open"
  >
    Edit Klasifikasi Buku
  </UButton>
  <dialog
    ref="dialog"
    aria-labelledby="classification-title"
    class="classification-dialog"
    @cancel="saving ? $event.preventDefault() : null"
  >
    <div class="dialog-heading">
      <h2 id="classification-title">Edit Klasifikasi Buku</h2>
      <button
        type="button"
        aria-label="Tutup klasifikasi buku"
        :disabled="saving"
        @click="dialog?.close()"
      >
        ×
      </button>
    </div>
    <p>
      Tambahkan pilihan untuk klasifikasi buku. Mata pelajaran mengikuti jenjang yang Anda kelola.
    </p>
    <form @submit.prevent="save">
      <label for="classification-kind">Jenis klasifikasi</label>
      <select id="classification-kind" v-model="kind" :disabled="saving">
        <option v-for="(label, value) in labels" :key="value" :value="value">{{ label }}</option>
      </select>
      <template v-if="kind === 'subject'">
        <label for="classification-level">Jenjang</label>
        <select id="classification-level" v-model="level" required :disabled="saving">
          <option v-for="item in levels" :key="item" :value="item">{{ item }}</option>
        </select>
      </template>
      <label for="classification-name">Nama {{ labels[kind].toLowerCase() }} baru</label>
      <input
        id="classification-name"
        v-model="name"
        required
        :maxlength="kind === 'division' ? 100 : 200"
        :disabled="saving"
        placeholder="Masukkan nama baru"
      />
      <p v-if="kind === 'division'" class="help">
        Divisi baru muncul di halaman Divisi. Beranda hanya menampilkan divisi awal yang belum
        dihapus.
      </p>
      <p v-if="failure" role="alert" class="failure">{{ failure }}</p>
      <p v-if="message" role="status" class="success">{{ message }}</p>
      <UButton type="submit" :loading="saving" :disabled="saving || !name.trim() || !!error"
        >Tambah {{ labels[kind].toLowerCase() }}</UButton
      >
    </form>
    <section class="existing" aria-label="Klasifikasi tersedia">
      <h3>
        {{ labels[kind] }} tersedia <span v-if="kind === 'subject'">({{ level }})</span>
      </h3>
      <div v-if="error" role="alert">
        <p>Klasifikasi belum dapat dimuat.</p>
        <UButton variant="outline" @click="refresh()">Coba lagi</UButton>
      </div>
      <p v-else-if="status === 'pending'">Memuat klasifikasi...</p>
      <ul v-else-if="options.length">
        <li v-for="item in options" :key="item.code">
          <span class="option-name">{{ item.name }}</span>
          <button
            type="button"
            class="delete-option"
            :aria-label="`Hapus ${item.name}`"
            :title="`Hapus ${item.name}`"
            :disabled="saving || !!error"
            @click="confirmDelete(item)"
          >
            <UIcon name="i-lucide-x" class="size-4" aria-hidden="true" />
          </button>
        </li>
      </ul>
      <p v-else>Belum ada pilihan.</p>
    </section>
    <section
      v-if="deleteTarget"
      class="delete-confirmation"
      aria-labelledby="classification-delete-title"
    >
      <h3 id="classification-delete-title">Hapus {{ deleteTarget.name }}?</h3>
      <p>
        Opsi ini akan dihapus dari daftar pilihan. Klasifikasi yang masih dipakai buku tidak dapat
        dihapus.
      </p>
      <div class="dialog-actions">
        <UButton variant="outline" :disabled="saving" @click="deleteTarget = null">Batal</UButton>
        <UButton color="error" :loading="saving" :disabled="saving" @click="remove"
          >Ya, hapus</UButton
        >
      </div>
    </section>
    <div class="dialog-actions">
      <UButton variant="outline" :disabled="saving" @click="dialog?.close()">Selesai</UButton>
    </div>
  </dialog>
</template>

<style scoped>
.classification-dialog {
  margin: auto;
  width: calc(100% - 2rem);
  max-width: 680px;
  max-height: 90dvh;
  overflow-y: auto;
  padding: 28px;
  border: 1px solid #e6e8e4;
  border-radius: 20px;
  color: #242b26;
  background: white;
  box-shadow: 0 20px 60px #0003;
}
.classification-dialog::backdrop {
  background: #0c0a0980;
}
.dialog-heading,
.dialog-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
h2 {
  font-size: 24px;
  font-weight: 600;
}
.dialog-heading button {
  padding: 4px 10px;
  font-size: 28px;
  cursor: pointer;
}
p {
  margin-top: 12px;
  color: #687169;
  font-size: 14px;
}
form {
  display: grid;
  gap: 10px;
  margin-top: 24px;
}
label,
h3 {
  font-size: 14px;
  font-weight: 600;
}
label:not(:first-child) {
  margin-top: 8px;
}
input,
select {
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid #d6dcd7;
  border-radius: 10px;
  background: white;
}
input:focus-visible,
select:focus-visible {
  outline: 2px solid #1f5c3f;
  outline-offset: 2px;
}
form > button {
  justify-self: start;
  margin-top: 8px;
}
.help {
  margin-top: 0;
}
.failure {
  color: #b3261e;
}
.success {
  color: #1f5c3f;
}
.existing {
  margin-top: 24px;
  border-top: 1px solid #e6e8e4;
  padding-top: 20px;
}
ul {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: stretch;
  gap: 8px;
  max-height: 260px;
  overflow-y: auto;
  margin-top: 12px;
  padding: 4px;
}
li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-width: 0;
  min-height: 48px;
  padding: 10px 12px;
  border: 1px solid #dce8df;
  border-radius: 8px;
  background: #eef5ef;
  font-size: 13px;
  line-height: 20px;
}
.option-name {
  min-width: 0;
  overflow-wrap: anywhere;
}
.delete-option {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  color: #b3261e;
  cursor: pointer;
  border-radius: 4px;
}
.delete-option:hover:not(:disabled) {
  background: #fbe4e2;
}
.delete-option:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}
.delete-option:disabled {
  opacity: 0.5;
  cursor: default;
}
.delete-confirmation {
  margin-top: 20px;
  padding: 16px;
  border: 1px solid #f1c6c6;
  border-radius: 12px;
}
.dialog-actions {
  justify-content: end;
  margin-top: 24px;
}
@media (max-width: 600px) {
  ul {
    grid-template-columns: minmax(0, 1fr);
  }
  .classification-dialog {
    padding: 20px 16px;
  }
  h2 {
    font-size: 20px;
  }
}
</style>
