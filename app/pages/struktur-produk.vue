<script setup lang="ts">
import ProductStructureTree from '~/components/ProductStructureTree.vue'
import { educationLevelSchema } from '#shared/schemas/auth'
import { structurePath } from '#shared/schemas/product-structure'
import { z } from 'zod'
const route = useRoute()
const level = computed(() => educationLevelSchema.safeParse(route.query.level).data ?? 'SD')
const selectedId = computed(() => z.string().uuid().safeParse(route.query.node).data ?? null)
const { data, error, status, refresh } = await useFetch('/api/catalog/product-structure', {
  query: { level },
})
const nodes = computed(() =>
  (data.value ?? []).filter((node) => node.educationLevel === level.value && !node.archived),
)
const path = computed(() => (selectedId.value ? structurePath(nodes.value, selectedId.value) : []))
useSeoMeta({ title: () => `Struktur Produk ${level.value} | KPP Produk Satu` })
function select(id: string) {
  return navigateTo({ path: '/struktur-produk', query: { level: level.value, node: id } })
}
</script>

<template>
  <section class="public-structure">
    <NuxtLink to="/products">← Katalog buku</NuxtLink>
    <h1>Struktur Produk {{ level }}</h1>
    <p>Jelajahi kategori dan cabang produk per jenjang pendidikan.</p>
    <nav aria-label="Jenjang struktur" class="structure-levels">
      <NuxtLink
        v-for="item in educationLevelSchema.options"
        :key="item"
        :to="{ path: '/struktur-produk', query: { level: item } }"
        :aria-current="level === item ? 'page' : undefined"
        >{{ item }}</NuxtLink
      >
    </nav>
    <p v-if="status === 'pending'" role="status">Memuat struktur produk...</p>
    <div v-else-if="error" role="alert">
      <p>Struktur Produk belum dapat dimuat.</p>
      <UButton variant="outline" @click="refresh()">Coba lagi</UButton>
    </div>
    <template v-else
      ><p v-if="path.length" class="selected-path">
        Cabang dipilih: {{ path.map((node) => node.name).join(' → ') }}
      </p>
      <p v-else-if="selectedId">
        Cabang yang dituju tidak tersedia pada struktur aktif jenjang ini.
      </p>
      <ProductStructureTree
        v-if="nodes.length"
        :nodes="nodes"
        :selected-id="selectedId"
        @select="select"
      />
      <p v-else>Struktur Produk {{ level }} belum tersedia.</p></template
    >
  </section>
</template>

<style scoped>
.public-structure {
  max-width: 900px;
  margin: auto;
  padding-top: 24px;
  color: #222;
}
h1 {
  margin: 12px 0;
  font-size: 32px;
  font-weight: 600;
}
.public-structure > a {
  color: #1f5c3f;
  font-size: 13px;
}
.public-structure > p {
  color: #6b6f6b;
  font-size: 14px;
}
.structure-levels {
  display: flex;
  gap: 12px;
  margin: 24px 0;
}
.structure-levels a {
  flex: 1;
  padding: 10px;
  border: 1px solid #e6e8e4;
  border-radius: 10px;
  color: #1f5c3f;
  text-align: center;
}
.structure-levels a[aria-current='page'] {
  background: #1f5c3f;
  color: white;
}
.selected-path {
  margin-bottom: 20px;
  padding: 16px;
  border-radius: 12px;
  background: #f4f8f5;
  overflow-wrap: anywhere;
}
</style>
