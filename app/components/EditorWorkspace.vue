<script setup lang="ts">
const requestFetch = useRequestFetch()
const { data: account } = await useAsyncData('editor-workspace-account', () =>
  requestFetch('/api/admin/editor-session'),
)
const route = useRoute()
const managementLinks = [
  { to: '/admin/klasifikasi', label: 'Edit Klasifikasi Buku' },
  { to: '/admin/kontak', label: 'Atur Halaman Kontak' },
  { to: '/admin/struktur-produk', label: 'Kelola Struktur Produk' },
  { to: '/admin/buku-pilihan', label: 'Atur Buku Pilihan' },
]
const bookPage = computed(() => route.path === '/admin' || route.path.startsWith('/admin/books/'))
</script>

<template>
  <div class="editor-workspace">
    <aside class="dashboard-sidebar" aria-label="Pengelolaan editorial">
      <nav class="dashboard-management" aria-label="Menu pengelolaan">
        <NuxtLink to="/admin" :aria-current="bookPage ? 'page' : undefined">Kelola Buku</NuxtLink>
        <template v-if="account?.isSuper">
          <NuxtLink
            v-for="item in managementLinks"
            :key="item.to"
            :to="item.to"
            :aria-current="route.path === item.to ? 'page' : undefined"
            >{{ item.label }}</NuxtLink
          >
        </template>
      </nav>
    </aside>
    <div class="workspace-content"><slot /></div>
  </div>
</template>

<style scoped>
.editor-workspace {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  align-items: stretch;
  gap: 24px;
  color: #222;
  font-family: var(--font-landing-sans);
}
.workspace-content {
  min-width: 0;
}
.dashboard-sidebar {
  margin-top: 20px;
  padding: 24px 16px;
  border: 1px solid #e6e8e4;
  border-radius: 16px;
  background: #f4f8f5;
}
.dashboard-management {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.dashboard-management a {
  display: flex;
  min-height: 56px;
  align-items: center;
  padding: 16px;
  border-radius: 14px;
  color: #1f5c3f;
  font: 500 15px/24px var(--font-landing-sans);
}
.dashboard-management a[aria-current='page'] {
  background: linear-gradient(90deg, #dcefe5, #f4f8f5);
  font-weight: 700;
}
.dashboard-management a:hover {
  background: #dcefe5;
}
.dashboard-management a:focus-visible {
  outline: 2px solid #1f5c3f;
  outline-offset: 3px;
}
@media (max-width: 1100px) {
  .editor-workspace {
    grid-template-columns: 210px minmax(0, 1fr);
    gap: 20px;
  }
}
@media (max-width: 700px) {
  .editor-workspace {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }
  .dashboard-sidebar {
    padding: 12px;
  }
  .dashboard-management {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 8px;
  }
  .dashboard-management a {
    min-height: 44px;
    padding: 10px 12px;
    font-size: 13px;
  }
}
</style>
