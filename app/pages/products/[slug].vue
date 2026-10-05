<script setup lang="ts">
const route = useRoute()
const config = useRuntimeConfig()
const user = useSupabaseUser()
const { data: product, error } = await useFetch(
  () => `/api/products/${encodeURIComponent(String(route.params.slug))}`,
)
if (error.value || !product.value) {
  throw createError({
    statusCode: error.value?.statusCode || 404,
    statusMessage:
      error.value?.statusCode === 404 ? 'Buku tidak ditemukan' : 'Buku tidak dapat dimuat',
  })
}

const { data: catalog, error: relatedError } = await useFetch('/api/products')
const relatedProducts = computed(() =>
  (catalog.value?.products ?? [])
    .filter((item) => item.id !== product.value?.id)
    .sort(
      (a, b) =>
        Number(b.category === product.value?.category) -
        Number(a.category === product.value?.category),
    )
    .slice(0, 3),
)
const activeSection = ref<'description' | 'details'>('description')
const coverDialog = useTemplateRef<HTMLDialogElement>('cover-dialog')
const loginDialog = useTemplateRef<HTMLDialogElement>('login-dialog')
const selectedResource = ref('product-knowledge')
const resources = [
  {
    id: 'product-knowledge',
    title: 'Product Knowledge',
    description: 'Materi untuk memahami isi dan keunggulan buku.',
  },
  { id: 'flyer', title: 'Flyer', description: 'Materi ringkas untuk membantu presentasi produk.' },
  {
    id: 'dummy',
    title: 'Dummy buku',
    description: 'Pratinjau isi buku untuk mengenal materi lebih dekat.',
  },
]
const selectedResourceTitle = computed(
  () => resources.find((resource) => resource.id === selectedResource.value)?.title,
)
const loginDestination = computed(() => ({
  path: '/login',
  query: { returnTo: `/products/${product.value?.slug}#${selectedResource.value}` },
}))

function requestResource(id: string) {
  selectedResource.value = id
  loginDialog.value?.showModal()
}
const shareMessage = ref('')
const sections = [
  { id: 'description', label: 'Deskripsi' },
  { id: 'details', label: 'Informasi buku' },
] as const
const bookDetails = computed(() => [
  { label: 'Judul', value: product.value?.title },
  { label: 'Penulis', value: product.value?.author },
  { label: 'Kategori', value: product.value?.category },
  { label: 'Kode buku', value: product.value?.bookCode || 'Belum tersedia' },
  { label: 'Jenjang pendidikan', value: product.value?.educationLevel || 'Belum tersedia' },
  { label: 'Harga', value: formatPrice(product.value?.price ?? 0) },
])

watch(
  () => route.params.slug,
  () => {
    activeSection.value = 'description'
    shareMessage.value = ''
    coverDialog.value?.close()
    loginDialog.value?.close()
  },
)

async function copyLink() {
  try {
    await navigator.clipboard.writeText(window.location.href)
    shareMessage.value = 'Tautan buku berhasil disalin.'
  } catch {
    shareMessage.value = 'Tautan belum dapat disalin. Salin alamat halaman dari browser.'
  }
}

useSeoMeta({
  title: () => `${product.value?.title} | ${config.public.siteName}`,
  description: () => product.value?.description,
  ogTitle: () => product.value?.title,
  ogDescription: () => product.value?.description,
  ogImage: () => product.value?.imageUrl,
})
</script>

<template>
  <article v-if="product">
    <nav aria-label="Breadcrumb" class="mb-8 text-sm text-stone-500">
      <ol class="flex flex-wrap items-center gap-2">
        <li><NuxtLink to="/" class="hover:text-emerald-800">Beranda</NuxtLink></li>
        <li aria-hidden="true">/</li>
        <li><NuxtLink to="/products" class="hover:text-emerald-800">Katalog buku</NuxtLink></li>
        <li aria-hidden="true">/</li>
        <li aria-current="page" class="text-stone-800">{{ product.title }}</li>
      </ol>
    </nav>

    <div class="grid gap-10 lg:grid-cols-2 lg:gap-16">
      <div>
        <div
          class="relative flex min-h-96 items-center justify-center rounded-2xl bg-[#e9ede6] px-8 py-14 sm:min-h-[520px]"
        >
          <span
            class="absolute left-5 top-5 rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-emerald-900"
            >Koleksi buku</span
          >
          <button
            type="button"
            class="group rounded-lg p-3 focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-emerald-800"
            :aria-label="`Perbesar sampul ${product.title}`"
            @click="coverDialog?.showModal()"
          >
            <img
              :src="product.imageUrl"
              :alt="`Sampul buku ${product.title}`"
              width="300"
              height="400"
              class="max-h-96 w-auto max-w-full object-contain drop-shadow-xl transition duration-300 group-hover:-translate-y-2"
            />
          </button>
          <span class="absolute bottom-5 text-xs text-stone-600"
            >Klik sampul untuk memperbesar</span
          >
        </div>
        <p class="mt-4 text-center text-xs leading-relaxed text-stone-500">
          Sampul dan informasi buku dapat dilihat tanpa login.
        </p>
      </div>

      <div class="py-2 lg:py-6">
        <p class="text-sm text-stone-500">Oleh {{ product.author }}</p>
        <h1 class="display-heading mt-4 text-4xl leading-tight sm:text-5xl">{{ product.title }}</h1>
        <p
          class="mt-5 inline-block rounded-full border border-emerald-800/15 bg-emerald-50 px-3 py-1 text-xs font-medium tracking-wide text-emerald-800"
        >
          {{ product.category }}
        </p>
        <p class="mt-7 text-3xl font-semibold tracking-tight text-emerald-900">
          {{ formatPrice(product.price) }}
        </p>
        <p class="mt-2 text-xs text-stone-500">Harga katalog dalam rupiah</p>

        <div class="my-7 border-t border-stone-200" />
        <h2 class="text-sm font-semibold">Tentang buku ini</h2>
        <p class="mt-3 whitespace-pre-line leading-7 text-stone-600">{{ product.description }}</p>

        <dl class="mt-7 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
          <dt class="text-stone-500">Penulis</dt>
          <dd class="font-medium">{{ product.author }}</dd>
          <dt class="text-stone-500">Kategori</dt>
          <dd class="font-medium">{{ product.category }}</dd>
          <dt class="text-stone-500">Kode buku</dt>
          <dd class="font-medium">Belum tersedia</dd>
          <dt class="text-stone-500">Jenjang pendidikan</dt>
          <dd class="font-medium">Belum tersedia</dd>
        </dl>
        <div class="mt-8 flex flex-wrap gap-3">
          <NuxtLink
            to="/products"
            class="inline-flex items-center justify-center rounded-lg bg-emerald-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-emerald-800"
            >Jelajahi buku lainnya <span class="ml-3" aria-hidden="true">↗</span></NuxtLink
          >
          <button
            type="button"
            class="rounded-lg border border-stone-300 bg-white px-5 py-3 text-sm font-medium transition hover:border-emerald-800 hover:text-emerald-800"
            @click="copyLink"
          >
            Salin tautan buku
          </button>
        </div>
        <p role="status" class="mt-3 text-sm text-emerald-800">{{ shareMessage }}</p>
      </div>
    </div>

    <section
      aria-label="Informasi lengkap buku"
      class="mt-14 rounded-2xl border border-stone-200 bg-white sm:mt-20"
    >
      <div class="flex gap-6 border-b border-stone-200 px-6 sm:px-8">
        <button
          v-for="section in sections"
          :key="section.id"
          type="button"
          :aria-pressed="activeSection === section.id"
          :class="
            activeSection === section.id
              ? 'border-emerald-800 text-emerald-900'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          "
          class="border-b-2 py-5 text-sm font-semibold"
          @click="activeSection = section.id"
        >
          {{ section.label }}
        </button>
      </div>
      <div class="p-6 sm:p-8">
        <div v-if="activeSection === 'description'">
          <h2 class="display-heading text-2xl">Kenali {{ product.title }}</h2>
          <p class="mt-4 max-w-3xl whitespace-pre-line leading-8 text-stone-600">
            {{ product.description }}
          </p>
        </div>
        <div v-else>
          <h2 class="display-heading mb-5 text-2xl">Detail buku</h2>
          <dl class="divide-y divide-stone-100 text-sm">
            <div
              v-for="detail in bookDetails"
              :key="detail.label"
              class="grid gap-1 py-3 sm:grid-cols-[160px_1fr]"
            >
              <dt class="text-stone-500">{{ detail.label }}</dt>
              <dd class="font-medium">{{ detail.value }}</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>

    <section class="mt-14 sm:mt-20" aria-labelledby="resources-title">
      <p class="mb-3 text-xs font-semibold uppercase tracking-widest text-emerald-800">
        Materi pendukung presentasi
      </p>
      <h2 id="resources-title" class="display-heading text-3xl">Kenali produk lebih dalam</h2>
      <p class="mt-3 max-w-2xl text-sm leading-relaxed text-stone-600">
        Product Knowledge, flyer, dan dummy memerlukan login. Berkas untuk buku ini belum tersedia.
      </p>
      <div class="mt-6 grid gap-4 md:grid-cols-3">
        <article
          v-for="resource in resources"
          :id="resource.id"
          :key="resource.id"
          tabindex="-1"
          class="scroll-mt-8 rounded-2xl border border-stone-200 bg-white p-6 target:border-emerald-700 target:ring-2 target:ring-emerald-700/20"
        >
          <p class="text-xs font-semibold text-emerald-800">
            {{ user ? 'Konten akun' : 'Login diperlukan' }}
          </p>
          <h3 class="mt-3 text-lg font-semibold">{{ resource.title }}</h3>
          <p class="mt-2 text-sm leading-relaxed text-stone-600">{{ resource.description }}</p>
          <p class="mt-4 text-xs text-stone-500">Berkas belum tersedia</p>
          <UButton
            v-if="!user"
            class="mt-5"
            variant="outline"
            :aria-label="`Informasi akses ${resource.title}`"
            @click="requestResource(resource.id)"
            >Informasi akses</UButton
          >
          <p v-else class="mt-5 text-sm text-stone-600">
            Materi dapat diakses setelah berkas tersedia dan hak akses Anda diverifikasi.
          </p>
        </article>
      </div>
    </section>

    <section class="mt-16" aria-labelledby="related-title">
      <div class="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="mb-2 text-xs font-medium uppercase tracking-widest text-emerald-800">
            Jelajahi katalog Erlangga
          </p>
          <h2 id="related-title" class="display-heading text-3xl">Buku lainnya dalam katalog</h2>
        </div>
        <NuxtLink to="/products" class="text-sm font-medium text-emerald-800"
          >Lihat semua buku <span aria-hidden="true">→</span></NuxtLink
        >
      </div>
      <p v-if="relatedError" role="alert" class="text-sm text-stone-600">
        Rekomendasi buku belum dapat dimuat. Coba lagi nanti.
      </p>
      <div v-else-if="relatedProducts.length" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <ProductCard v-for="item in relatedProducts" :key="item.id" :product="item" />
      </div>
      <p v-else class="text-sm text-stone-500">Belum ada buku lainnya dalam katalog.</p>
    </section>

    <dialog
      ref="login-dialog"
      aria-labelledby="resource-login-title"
      aria-describedby="resource-login-description"
      class="fixed inset-0 m-auto w-[calc(100%_-_3rem)] max-w-md rounded-2xl border border-stone-200 bg-white p-6 backdrop:bg-stone-950/60 sm:p-8"
    >
      <h2 id="resource-login-title" class="display-heading text-2xl">
        Login untuk {{ selectedResourceTitle }}
      </h2>
      <p id="resource-login-description" class="mt-4 text-sm leading-relaxed text-stone-600">
        Konten ini memerlukan login. Berkas belum tersedia untuk buku ini. Jika Anda masuk, Anda
        akan kembali ke bagian {{ selectedResourceTitle }} pada halaman buku ini.
      </p>
      <div class="mt-6 flex flex-wrap items-center gap-3">
        <UButton :to="loginDestination" @click="loginDialog?.close()">Ke halaman login</UButton>
        <form method="dialog">
          <UButton type="submit" color="neutral" variant="outline" autofocus>Tutup</UButton>
        </form>
      </div>
    </dialog>

    <dialog
      ref="cover-dialog"
      aria-label="Pratinjau sampul buku"
      class="fixed inset-0 m-auto max-h-[90dvh] max-w-[90vw] rounded-2xl border border-stone-200 bg-[#f5f5ef] p-6 backdrop:bg-stone-950/60"
    >
      <form method="dialog" class="flex justify-end">
        <button
          type="submit"
          autofocus
          class="mb-4 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm"
        >
          Tutup <span aria-hidden="true">×</span>
        </button>
      </form>
      <img
        :src="product.imageUrl"
        :alt="`Sampul buku ${product.title}`"
        width="500"
        height="650"
        class="mx-auto max-h-[65dvh] w-auto max-w-full object-contain"
      />
      <p class="mt-5 text-center text-sm font-medium">{{ product.title }}</p>
    </dialog>
  </article>
</template>
