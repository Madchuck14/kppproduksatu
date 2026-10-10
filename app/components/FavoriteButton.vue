<script setup lang="ts">
import type { Product } from '#shared/types/product'

const props = defineProps<{
  product: Product
  iconOnly?: boolean
  catalog?: boolean
  detail?: boolean
}>()
const favorites = useFavorites()
const saved = computed(() => favorites.ids.value.includes(props.product.id))
const busy = computed(() => favorites.isPending(props.product.id))
const message = ref('')
const user = useSupabaseUser()
watch(
  () => [props.product.id, user.value?.sub],
  () => {
    message.value = ''
  },
)

async function toggle() {
  message.value = ''
  if (!user.value) {
    message.value = 'Login untuk menyimpan buku ke favorit.'
    return
  }
  try {
    const isSaved = await favorites.toggle(props.product.id)
    if (isSaved !== undefined)
      message.value = isSaved ? 'Buku disimpan ke favorit.' : 'Buku dihapus dari favorit.'
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    message.value =
      status === 401
        ? 'Sesi berakhir. Login kembali.'
        : 'Favorit belum dapat diperbarui. Coba lagi.'
  }
}
</script>

<template>
  <div
    :class="{
      'favorite-control--icon': iconOnly,
      'favorite-control--catalog': catalog,
      'favorite-control--detail': detail,
    }"
  >
    <button
      type="button"
      :aria-pressed="saved"
      :aria-label="`${saved ? 'Hapus dari' : 'Tambahkan ke'} favorit: ${product.title}`"
      :aria-busy="busy"
      :disabled="busy"
      :class="
        iconOnly
          ? ['favorite-icon-button', { 'is-saved': saved }]
          : 'inline-flex items-center gap-2 rounded-lg border border-emerald-800 bg-white px-4 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:opacity-60'
      "
      @click="toggle"
    >
      <svg
        v-if="!iconOnly && !detail"
        viewBox="0 0 24 24"
        width="18"
        height="18"
        aria-hidden="true"
        :fill="saved ? 'currentColor' : 'none'"
        stroke="currentColor"
        stroke-width="1.7"
      >
        <path d="M12 21s-9-5.4-9-12a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6.6-9 12-9 12Z" />
      </svg>
      <img
        v-else-if="iconOnly && catalog"
        src="/images/catalog/heart.svg"
        alt=""
        width="16"
        height="16"
      />
      <img v-else-if="iconOnly" src="/images/landing/heart.svg" alt="" width="14" height="14" />
      <span v-if="!iconOnly">{{
        busy ? 'Menyimpan...' : saved ? 'Tersimpan' : detail ? 'Simpan ke favorit' : 'Favorit'
      }}</span>
    </button>
    <div v-if="message" :class="{ 'favorite-feedback': iconOnly }">
      <p role="status" class="mt-2 text-sm text-stone-600">{{ message }}</p>
      <NuxtLink
        v-if="message && !user"
        :to="{ path: '/login', query: { returnTo: `/products/${product.slug}` } }"
        class="mt-2 inline-block text-sm font-semibold text-emerald-800 underline"
      >
        Login dan kembali ke buku
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.favorite-control--detail > button {
  min-height: 44px;
  padding: 8px 22px;
  border: 1px solid #1f5c3f;
  border-radius: 12px;
  background: #1f5c3f;
  color: white;
  font-size: 15px;
  line-height: 24px;
}
.favorite-control--detail > button:hover {
  background: #17462f;
}
.favorite-icon-button {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: white;
  cursor: pointer;
}
.favorite-icon-button:hover,
.favorite-icon-button.is-saved {
  background: #dcefe5;
}
.favorite-icon-button.is-saved {
  box-shadow: inset 0 0 0 1px #2f6b4f;
}
.favorite-icon-button:focus-visible {
  outline: 2px solid #2f6b4f;
  outline-offset: 3px;
}
.favorite-icon-button:disabled {
  opacity: 0.6;
  cursor: wait;
}
.favorite-control--icon {
  position: absolute;
  top: 13px;
  right: 13px;
}
.favorite-feedback {
  position: absolute;
  z-index: 2;
  top: 35px;
  right: 0;
  width: 220px;
  padding: 12px;
  border: 1px solid #dce8e0;
  border-radius: 10px;
  background: white;
  box-shadow: 0 4px 16px #242b261c;
}
.favorite-control--catalog {
  top: 12px;
  right: 12px;
}
.favorite-control--catalog .favorite-icon-button {
  width: 32px;
  height: 32px;
}
</style>
