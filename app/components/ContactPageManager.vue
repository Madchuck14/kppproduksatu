<script setup lang="ts">
import {
  contactPageSchema,
  defaultContactPage,
  maxContactPhones,
  type ContactPage,
} from '#shared/schemas/contact-page'

const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const form = ref<ContactPage>(structuredClone(defaultContactPage))
const loading = ref(false)
const saving = ref(false)
const ready = ref(false)
const failure = ref('')
const message = ref('')
const original = ref('')
const dirty = computed(() => JSON.stringify(form.value) !== original.value)
type Field = {
  key: Exclude<keyof ContactPage, 'hours' | 'phones' | 'phone'>
  label: string
  max: number
  multiline?: boolean
  type?: string
}
const groups: { title: string; fields: Field[] }[] = [
  {
    title: 'Pengantar halaman',
    fields: [
      { key: 'heading', label: 'Judul', max: 120 },
      { key: 'headingHighlight', label: 'Lanjutan judul (hijau)', max: 120 },
      { key: 'description', label: 'Deskripsi', max: 600, multiline: true },
    ],
  },
  {
    title: 'Kantor dan saluran kontak',
    fields: [
      { key: 'officeName', label: 'Nama kantor', max: 120 },
      { key: 'address', label: 'Alamat kantor', max: 400, multiline: true },
      { key: 'email', label: 'Email', max: 254, type: 'email' },
      { key: 'fax', label: 'Fax', max: 40, type: 'tel' },
      { key: 'hotline', label: 'Hotline', max: 40, type: 'tel' },
      { key: 'whatsapp', label: 'WhatsApp (awalan 0 atau kode negara)', max: 40, type: 'tel' },
      { key: 'mapEmbedUrl', label: 'URL sematan Google Maps', max: 3000, type: 'url' },
    ],
  },
  {
    title: 'Jam operasional',
    fields: [
      { key: 'hoursHeading', label: 'Judul bagian jam operasional', max: 120 },
      { key: 'hoursHighlight', label: 'Lanjutan judul (hijau)', max: 120 },
      { key: 'hoursDescription', label: 'Deskripsi jam operasional', max: 600, multiline: true },
    ],
  },
]
function requestError(error: unknown, fallback: string) {
  return (error as { data?: { statusMessage?: string } }).data?.statusMessage ?? fallback
}
async function load() {
  loading.value = true
  ready.value = false
  failure.value = ''
  message.value = ''
  try {
    const content = await $fetch('/api/admin/contact')
    form.value = contactPageSchema.parse(content)
    original.value = JSON.stringify(form.value)
    ready.value = true
  } catch (error) {
    failure.value = requestError(error, 'Informasi kontak belum dapat dimuat. Silakan coba lagi.')
  } finally {
    loading.value = false
  }
}
function open() {
  dialog.value?.showModal()
  void load()
}
async function addPhone() {
  if (saving.value || form.value.phones.length >= maxContactPhones) return
  form.value.phones.push({ label: '', number: '' })
  await nextTick()
  dialog.value
    ?.querySelector<HTMLInputElement>(`#contact-phone-label-${form.value.phones.length - 1}`)
    ?.focus()
}
async function save() {
  if (saving.value || !ready.value || !dirty.value) return
  failure.value = ''
  message.value = ''
  const parsed = contactPageSchema.safeParse(form.value)
  if (!parsed.success) {
    failure.value = parsed.error.issues[0]?.message ?? 'Periksa informasi kontak.'
    return
  }
  saving.value = true
  try {
    form.value = await $fetch('/api/admin/contact', { method: 'PUT', body: parsed.data })
    original.value = JSON.stringify(form.value)
    message.value = 'Halaman Kontak berhasil diperbarui.'
    await refreshNuxtData('contact-page')
  } catch (error) {
    failure.value = requestError(
      error,
      'Informasi kontak gagal disimpan. Perubahan Anda tetap tersedia untuk dicoba lagi.',
    )
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UButton type="button" class="contact-manager-button" @click="open">Atur Halaman Kontak</UButton>
  <dialog
    ref="dialog"
    class="contact-dialog"
    aria-labelledby="contact-manager-title"
    @cancel="saving ? $event.preventDefault() : null"
  >
    <header class="dialog-heading">
      <div>
        <h2 id="contact-manager-title">Atur Halaman Kontak</h2>
        <p>Informasi yang disimpan langsung tampil pada halaman Kontak publik.</p>
      </div>
      <button
        type="button"
        aria-label="Tutup pengaturan kontak"
        :disabled="saving"
        @click="dialog?.close()"
      >
        ×
      </button>
    </header>
    <p v-if="loading" role="status">Memuat informasi kontak...</p>
    <div v-else-if="!ready">
      <p role="alert" class="failure">{{ failure }}</p>
      <UButton variant="outline" @click="load">Coba lagi</UButton>
    </div>
    <form v-else @submit.prevent="save">
      <template v-for="group in groups" :key="group.title">
        <fieldset :disabled="saving">
          <legend>{{ group.title }}</legend>
          <div class="fields-grid">
            <div
              v-for="field in group.fields"
              :key="field.key"
              :class="{ 'full-width': field.multiline || field.key === 'mapEmbedUrl' }"
            >
              <label :for="`contact-${field.key}`">{{ field.label }}</label>
              <textarea
                v-if="field.multiline"
                :id="`contact-${field.key}`"
                v-model="form[field.key]"
                :maxlength="field.max"
                rows="3"
                required
              />
              <input
                v-else
                :id="`contact-${field.key}`"
                v-model="form[field.key]"
                :type="field.type ?? 'text'"
                :maxlength="field.max"
                required
              />
              <p v-if="field.key === 'mapEmbedUrl'" class="help">
                Google Maps → Bagikan → Sematkan peta. Salin URL pada atribut src, bukan seluruh
                kode iframe.
              </p>
            </div>
          </div>
        </fieldset>
        <fieldset
          v-if="group.title === 'Kantor dan saluran kontak'"
          :disabled="saving"
          class="phone-settings"
        >
          <legend>Nomor telepon</legend>
          <div v-for="(phone, index) in form.phones" :key="index" class="phone-row">
            <div>
              <label :for="`contact-phone-label-${index}`"
                >Tanda pengenal telepon {{ index + 1 }}</label
              >
              <input
                :id="`contact-phone-label-${index}`"
                v-model="phone.label"
                placeholder="Contoh: Kantor pusat atau Customer service"
                maxlength="60"
                required
              />
            </div>
            <div>
              <label :for="`contact-phone-number-${index}`">Nomor telepon {{ index + 1 }}</label>
              <input
                :id="`contact-phone-number-${index}`"
                v-model="phone.number"
                type="tel"
                maxlength="40"
                required
              />
            </div>
            <UButton
              type="button"
              color="error"
              variant="ghost"
              :aria-label="`Hapus nomor telepon ${index + 1}`"
              :disabled="saving || form.phones.length === 1"
              @click="form.phones.splice(index, 1)"
              >Hapus</UButton
            >
          </div>
          <UButton
            type="button"
            variant="outline"
            :disabled="saving || form.phones.length >= maxContactPhones"
            @click="addPhone"
            ><span aria-hidden="true">+</span> Tambah nomor telepon</UButton
          >
          <p class="help">
            Setiap nomor ditampilkan dengan tanda pengenalnya di halaman Kontak. Maksimal
            {{ maxContactPhones }} nomor.
          </p>
        </fieldset>
      </template>
      <fieldset v-for="(hours, index) in form.hours" :key="index" :disabled="saving">
        <legend>Jadwal {{ index + 1 }}</legend>
        <div class="fields-grid">
          <div>
            <label :for="`contact-day-${index}`">Hari</label
            ><input :id="`contact-day-${index}`" v-model="hours.day" maxlength="60" required />
          </div>
          <div>
            <label :for="`contact-time-${index}`">Jam layanan</label
            ><input :id="`contact-time-${index}`" v-model="hours.time" maxlength="100" required />
          </div>
          <div class="full-width">
            <label :for="`contact-note-${index}`">Keterangan</label
            ><input :id="`contact-note-${index}`" v-model="hours.note" maxlength="100" required />
          </div>
        </div>
      </fieldset>
      <p v-if="failure" role="alert" class="failure">{{ failure }}</p>
      <p v-if="message" role="status" class="success">{{ message }}</p>
      <footer class="dialog-actions">
        <UButton color="neutral" variant="outline" :disabled="saving" @click="dialog?.close()">{{
          message && !dirty ? 'Selesai' : 'Batal'
        }}</UButton>
        <UButton type="submit" :loading="saving" :disabled="saving || !dirty"
          >Simpan perubahan</UButton
        >
      </footer>
    </form>
  </dialog>
</template>

<style scoped>
.contact-manager-button {
  min-height: 44px;
  padding: 10px 18px;
  border: 1px solid #1f5c3f;
  border-radius: 12px;
  background: white;
  color: #1f5c3f;
  font-size: 15px;
  font-weight: 500;
}
.contact-manager-button:hover {
  background: #f4f8f5;
}
.contact-dialog {
  width: min(860px, calc(100% - 32px));
  max-height: 90dvh;
  margin: auto;
  padding: 28px;
  overflow-y: auto;
  border: 1px solid #e6e8e4;
  border-radius: 20px;
  background: white;
  color: #222;
  color-scheme: light;
}
.contact-dialog::backdrop {
  background: rgb(0 0 0 / 40%);
}
.dialog-heading {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}
.dialog-heading h2 {
  font-size: 24px;
  font-weight: 600;
}
.dialog-heading p,
.help {
  margin-top: 6px;
  color: #6b6f6b;
  font-size: 13px;
  line-height: 1.6;
}
.dialog-heading button {
  flex: 0 0 40px;
  min-height: 40px;
  font-size: 28px;
}
fieldset {
  margin-top: 20px;
  padding: 16px;
  border: 1px solid #e6e8e4;
  border-radius: 12px;
}
legend {
  padding: 0 6px;
  font-weight: 600;
}
.fields-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.fields-grid > div {
  min-width: 0;
}
.phone-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  align-items: end;
  gap: 12px;
  margin-bottom: 16px;
}
.phone-row > div {
  min-width: 0;
}
.full-width {
  grid-column: 1 / -1;
}
label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
}
input,
textarea {
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid #d6d3d1;
  border-radius: 10px;
  background: white;
  font-size: 14px;
}
textarea {
  resize: vertical;
}
input:focus-visible,
textarea:focus-visible,
button:focus-visible {
  outline: 2px solid #1f5c3f;
  outline-offset: 2px;
}
.failure {
  margin-block: 16px;
  color: #b91c1c;
  font-size: 14px;
}
.success {
  margin-top: 16px;
  color: #1f5c3f;
  font-size: 14px;
}
.dialog-actions {
  display: flex;
  justify-content: end;
  gap: 12px;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid #e6e8e4;
}
@media (max-width: 600px) {
  .contact-dialog {
    padding: 20px 16px;
  }
  .fields-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .phone-row {
    grid-template-columns: minmax(0, 1fr);
  }
  .phone-row > button {
    justify-self: end;
  }
}
</style>
