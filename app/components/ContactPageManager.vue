<script setup lang="ts">
import {
  contactPageSchema,
  defaultContactPage,
  type ContactPage,
} from '#shared/schemas/contact-page'

const manager = useTemplateRef<HTMLElement>('manager')
const form = ref<ContactPage>(structuredClone(defaultContactPage))
const loading = ref(true)
const saving = ref(false)
const ready = ref(false)
const failure = ref('')
const message = ref('')
const original = ref('')
const dirty = computed(() => JSON.stringify(form.value) !== original.value)
const staff = computed(() => form.value.phones.slice(1))
function phoneParts(label: string) {
  const parts = /^(.*) \(([^()]*)\)$/.exec(label)
  return { role: parts?.[1] ?? label, name: parts?.[2] ?? '' }
}
function updatePerson(index: number, field: 'role' | 'name', event: Event) {
  const phone = form.value.phones[index]
  if (!phone || saving.value) return
  const parts = phoneParts(phone.label)
  parts[field] = (event.target as HTMLInputElement).value
  phone.label = parts.name ? `${parts.role} (${parts.name})` : parts.role
}
async function movePhone(index: number, direction: -1 | 1) {
  const next = index + direction
  if (saving.value || next < 1 || next >= form.value.phones.length) return
  const phone = form.value.phones.splice(index, 1)[0]!
  form.value.phones.splice(next, 0, phone)
  await nextTick()
  manager.value?.querySelector<HTMLInputElement>(`#contact-phone-label-${next}`)?.focus()
}
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
onMounted(load)
async function addPhone() {
  if (saving.value) return
  form.value.phones.push({ label: '', number: '' })
  await nextTick()
  manager.value
    ?.querySelector<HTMLInputElement>(`#contact-phone-label-${form.value.phones.length - 1}`)
    ?.focus()
}
async function save() {
  if (saving.value || !ready.value || !dirty.value) return
  failure.value = ''
  message.value = ''
  const parsed = contactPageSchema.safeParse(form.value)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const index = issue?.path[0] === 'phones' ? issue.path[1] : undefined
    const prefix =
      typeof index === 'number' ? (index === 0 ? 'Nomor kantor: ' : `Pengurus ${index}: `) : ''
    failure.value = prefix + (issue?.message ?? 'Periksa informasi kontak.')
    if (typeof index === 'number') {
      manager.value
        ?.querySelector<HTMLInputElement>(
          `#contact-phone-${issue?.path[2] === 'number' ? 'number' : 'label'}-${index}`,
        )
        ?.focus()
    }
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
  <section ref="manager" class="contact-page" aria-labelledby="contact-manager-title">
    <header class="dialog-heading">
      <div>
        <h1 id="contact-manager-title">Atur Halaman Kontak</h1>
        <p>Informasi yang disimpan langsung tampil pada halaman Kontak publik.</p>
      </div>
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
          <legend>Nomor kantor</legend>
          <p class="help">
            Tampil bersama email, fax, hotline, dan WhatsApp di bagian atas halaman.
          </p>
          <div class="fields-grid">
            <div>
              <label for="contact-phone-label-0">Label nomor kantor</label>
              <input
                id="contact-phone-label-0"
                v-model="form.phones[0]!.label"
                placeholder="Contoh: Nomor Kantor"
                maxlength="60"
                required
              />
            </div>
            <div>
              <label for="contact-phone-number-0">Nomor telepon kantor</label>
              <input
                id="contact-phone-number-0"
                v-model="form.phones[0]!.number"
                type="tel"
                maxlength="40"
                required
              />
            </div>
          </div>
        </fieldset>
        <fieldset
          v-if="group.title === 'Kantor dan saluran kontak'"
          :disabled="saving"
          class="phone-settings"
        >
          <legend>Direktori pengurus ({{ staff.length }})</legend>
          <p class="help">
            Urutan berikut sama dengan kartu di halaman publik. Isi nama tanpa tanda kurung. Jabatan
            dan nama disimpan sebagai Jabatan (Nama), maksimal 60 karakter gabungan.
          </p>
          <p v-if="!staff.length" class="help">Belum ada pengurus. Tambahkan kontak pertama.</p>
          <div v-for="(phone, index) in staff" :key="index" class="person-card">
            <div class="person-heading">
              <h2>Pengurus {{ index + 1 }}</h2>
              <div class="person-actions">
                <UButton
                  type="button"
                  variant="ghost"
                  :aria-label="`Naikkan pengurus ${index + 1}`"
                  :disabled="saving || index === 0"
                  @click="movePhone(index + 1, -1)"
                  >Naik</UButton
                >
                <UButton
                  type="button"
                  variant="ghost"
                  :aria-label="`Turunkan pengurus ${index + 1}`"
                  :disabled="saving || index === staff.length - 1"
                  @click="movePhone(index + 1, 1)"
                  >Turun</UButton
                >
                <UButton
                  type="button"
                  color="error"
                  variant="ghost"
                  :aria-label="`Hapus pengurus ${index + 1}`"
                  :disabled="saving"
                  @click="form.phones.splice(index + 1, 1)"
                  >Hapus</UButton
                >
              </div>
            </div>
            <div class="person-fields">
              <div>
                <label :for="`contact-phone-label-${index + 1}`"
                  >Jabatan pengurus {{ index + 1 }}</label
                >
                <input
                  :id="`contact-phone-label-${index + 1}`"
                  :value="phoneParts(phone.label).role"
                  maxlength="60"
                  placeholder="Contoh: Sekretariat 1 atau CE SD 1"
                  required
                  @input="updatePerson(index + 1, 'role', $event)"
                />
              </div>
              <div>
                <label :for="`contact-phone-name-${index + 1}`"
                  >Nama pengurus {{ index + 1 }} (opsional)</label
                >
                <input
                  :id="`contact-phone-name-${index + 1}`"
                  :value="phoneParts(phone.label).name"
                  maxlength="60"
                  placeholder="Contoh: Dera"
                  pattern="[^()]*"
                  title="Isi nama tanpa tanda kurung."
                  @input="updatePerson(index + 1, 'name', $event)"
                />
              </div>
              <div>
                <label :for="`contact-phone-number-${index + 1}`"
                  >Nomor pengurus {{ index + 1 }}</label
                >
                <input
                  :id="`contact-phone-number-${index + 1}`"
                  v-model="phone.number"
                  type="tel"
                  maxlength="40"
                  required
                />
              </div>
            </div>
            <p class="help">
              Label tersimpan: {{ phone.label || 'Belum diisi' }} ({{ phone.label.length }}/60)
            </p>
          </div>
          <UButton type="button" variant="outline" :disabled="saving" @click="addPhone"
            ><span aria-hidden="true">+</span> Tambah pengurus</UButton
          >
          <p class="help">
            Jumlah pengurus tidak dibatasi. Satu nomor kantor tetap wajib. Penghapusan dan perubahan
            urutan diterapkan setelah Simpan perubahan.
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
        <UButton type="button" color="neutral" variant="outline" :disabled="saving" @click="load"
          >Batalkan perubahan</UButton
        >
        <UButton type="submit" :loading="saving" :disabled="saving || !dirty"
          >Simpan perubahan</UButton
        >
      </footer>
    </form>
  </section>
</template>

<style scoped>
.contact-page {
  width: 100%;
  margin-top: 20px;
  padding: 28px;
  border: 1px solid #e6e8e4;
  border-radius: 20px;
  background: white;
  color: #222;
  color-scheme: light;
}
.dialog-heading {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}
.dialog-heading h1 {
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
.person-fields {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: end;
  gap: 12px;
  margin-bottom: 16px;
}
.person-fields > div {
  min-width: 0;
}
.person-card {
  margin-block: 16px;
  padding: 16px;
  border: 1px solid #e6e8e4;
  border-radius: 12px;
  background: #f7fbf8;
}
.person-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.person-heading h2 {
  font-size: 14px;
  font-weight: 600;
  color: #1f5c3f;
}
.person-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
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
  .contact-page {
    padding: 20px 16px;
  }
  .fields-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .person-fields {
    grid-template-columns: minmax(0, 1fr);
  }
  .dialog-actions {
    flex-wrap: wrap;
  }
}
</style>
