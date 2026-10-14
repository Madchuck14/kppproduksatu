<script setup lang="ts">
import type { FavoriteIds } from '#shared/types/favorite'
import { educationLevelSchema } from '#shared/schemas/auth'
const config = useRuntimeConfig()
const route = useRoute()
const isLanding = computed(() => route.path === '/')
const isCatalog = computed(() => route.path === '/products')
const isBrowse = computed(() => route.path === '/jenjang' || route.path === '/divisi')
const isBookDetail = computed(() => /^\/products\/[^/]+$/.test(route.path))
const isBookForm = computed(() => /^\/admin\/books\/[^/]+$/.test(route.path))
const isAuthPage = computed(() => route.path === '/login' || route.path === '/register')
const isContact = computed(() => route.path === '/contact')
const isDashboard = computed(() => route.path === '/admin')
const isSearchOpen = ref(false)
const headerSearch = ref(typeof route.query.q === 'string' ? route.query.q : '')
const headerSearchInput = useTemplateRef<HTMLInputElement>('headerSearchInput')
const headerSearchToggle = useTemplateRef<HTMLButtonElement>('headerSearchToggle')
const headerSearchForm = useTemplateRef<HTMLFormElement>('headerSearchForm')
const isShowcase = computed(
  () =>
    isLanding.value ||
    isCatalog.value ||
    isBrowse.value ||
    isBookDetail.value ||
    isBookForm.value ||
    isDashboard.value ||
    isContact.value ||
    isAuthPage.value,
)
const user = useSupabaseUser()
const client = useSupabaseClient()
const requestFetch = useRequestFetch()
const favorites = useFavorites()
const favoritesRequest = useAsyncData<FavoriteIds>(
  'favorite-ids',
  async () => {
    const ownerId = user.value?.sub ?? null
    if (!ownerId) return { ownerId: null, ids: [] }
    try {
      return await requestFetch<FavoriteIds>('/api/favorites/ids')
    } catch {
      return { ownerId, ids: [], unavailable: true }
    }
  },
  { server: false, watch: [() => user.value?.sub], default: () => ({ ownerId: null, ids: [] }) },
)
const accountRequest = useAsyncData(
  'navigation-account',
  async () => {
    if (!user.value) return null
    try {
      return await requestFetch('/api/auth/session')
    } catch {
      return null
    }
  },
  { server: false, watch: [() => user.value?.sub] },
)
const [, { data: navigationAccount }] = await Promise.all([favoritesRequest, accountRequest])
const loggingOut = ref(false)
const logoutMessage = ref('')

watch(
  () => route.query.q,
  (value) => {
    headerSearch.value = typeof value === 'string' ? value : ''
  },
)
watch(
  () => route.fullPath,
  () => {
    isSearchOpen.value = false
  },
)
function closeSearchOnOutsideClick(event: PointerEvent) {
  const target = event.target
  if (
    isSearchOpen.value &&
    target instanceof Node &&
    !headerSearchToggle.value?.contains(target) &&
    !headerSearchForm.value?.contains(target)
  ) {
    isSearchOpen.value = false
  }
}
onMounted(() => document.addEventListener('pointerdown', closeSearchOnOutsideClick))
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeSearchOnOutsideClick))

async function toggleHeaderSearch() {
  isSearchOpen.value = !isSearchOpen.value
  if (isSearchOpen.value) {
    await nextTick()
    headerSearchInput.value?.focus()
  }
}

async function searchCatalog() {
  const query = headerSearch.value.trim()
  isSearchOpen.value = false
  await navigateTo({ path: '/products', query: query ? { q: query } : {} })
}

async function logout() {
  if (loggingOut.value) return
  loggingOut.value = true
  logoutMessage.value = ''
  try {
    const { error } = await client.auth.signOut()
    if (error) {
      logoutMessage.value = 'Logout gagal. Silakan coba lagi.'
      return
    }
    await navigateTo('/')
  } catch {
    logoutMessage.value = 'Logout belum dapat diproses. Silakan coba lagi.'
  } finally {
    loggingOut.value = false
  }
}
</script>

<template>
  <div :class="['min-h-screen', { 'landing-shell': isShowcase }]">
    <a href="#main-content" class="sr-only focus:not-sr-only focus:p-4">Lewati ke konten</a>
    <header class="site-header">
      <div
        class="header-inner"
        :class="{
          'editor-navigation':
            !isBookForm && !isDashboard && user && navigationAccount?.role === 'editor',
        }"
      >
        <NuxtLink to="/" :aria-label="config.public.siteName"><PublisherLogos /></NuxtLink>
        <nav aria-label="Navigasi utama" class="main-nav">
          <NuxtLink to="/" exact-active-class="nav-active">Beranda</NuxtLink>
          <NuxtLink to="/products" active-class="nav-active">Katalog</NuxtLink>
          <NuxtLink to="/jenjang" active-class="nav-active">Jenjang</NuxtLink>
          <NuxtLink to="/divisi" active-class="nav-active">Divisi</NuxtLink>
          <NuxtLink to="/contact">Kontak</NuxtLink>
        </nav>
        <div class="account-nav">
          <button
            ref="headerSearchToggle"
            type="button"
            class="header-icon-button"
            :aria-label="isSearchOpen ? 'Tutup pencarian' : 'Buka pencarian buku'"
            :aria-expanded="isSearchOpen"
            aria-controls="header-catalog-search"
            @click="toggleHeaderSearch"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <circle cx="10.8" cy="10.8" r="6.8" />
              <path d="m16 16 4.5 4.5" />
            </svg>
          </button>
          <NuxtLink
            v-if="!isBookForm && !isDashboard && user && navigationAccount?.role === 'editor'"
            to="/admin"
            class="editor-dashboard-link"
            >Dashboard Editor</NuxtLink
          >
          <button
            v-if="user"
            type="button"
            class="header-icon-button"
            :disabled="loggingOut"
            :aria-busy="loggingOut"
            :aria-label="loggingOut ? 'Sedang keluar' : 'Keluar'"
            :title="loggingOut ? 'Sedang keluar' : 'Keluar'"
            @click="logout"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="m16 17 5-5-5-5M21 12H9" />
            </svg>
          </button>
          <NuxtLink v-else to="/login" class="header-icon-button" aria-label="Login" title="Login">
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="8" r="3.5" />
              <path d="M5 20c.7-3.2 3.2-5 7-5s6.3 1.8 7 5" />
            </svg>
          </NuxtLink>
          <NuxtLink
            v-if="isShowcase"
            to="/favorites"
            class="header-icon-button favorites-link"
            :aria-label="
              user && !favorites.ready.value
                ? 'Memuat favorit'
                : `Favorit: ${favorites.ids.value.length} buku`
            "
            title="Favorit"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path
                d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"
              />
            </svg>
            <span class="favorite-count">{{
              user && !favorites.ready.value ? '?' : favorites.ids.value.length
            }}</span>
          </NuxtLink>
        </div>
        <form
          v-show="isSearchOpen"
          id="header-catalog-search"
          ref="headerSearchForm"
          class="header-search-popover"
          role="search"
          @submit.prevent="searchCatalog"
          @keydown.esc.stop.prevent="isSearchOpen = false"
        >
          <label for="header-search-input" class="sr-only">Cari buku di katalog</label>
          <input
            id="header-search-input"
            ref="headerSearchInput"
            v-model="headerSearch"
            type="search"
            maxlength="100"
            placeholder="Cari judul, kode, atau penulis..."
          />
          <button type="submit">Cari</button>
        </form>
        <div v-if="isShowcase" class="header-rule" aria-hidden="true">
          <img
            :src="isCatalog ? '/images/catalog/header-line.svg' : '/images/landing/header-line.svg'"
            alt=""
            width="1440"
            height="1"
          />
        </div>
      </div>
      <p v-if="logoutMessage" role="alert" class="mx-auto max-w-6xl px-6 pb-4 text-sm text-red-700">
        {{ logoutMessage }}
      </p>
    </header>
    <main
      id="main-content"
      :class="
        isLanding
          ? 'landing-main'
          : isAuthPage
            ? 'login-main'
            : isCatalog || isBrowse || isBookDetail || isBookForm || isDashboard || isContact
              ? 'catalog-main'
              : 'mx-auto max-w-6xl px-6 py-12'
      "
    >
      <slot />
    </main>
    <footer id="kontak" class="site-footer">
      <div class="footer-inner">
        <div class="footer-top">
          <div class="footer-brand">
            <PublisherLogos phibeta />
            <p>
              Temukan buku pelajaran, referensi, dan bahan bacaan yang sesuai untuk setiap langkah
              belajar.
            </p>
          </div>
          <div class="footer-links">
            <div>
              <h2>Jenjang Sekolah</h2>
              <NuxtLink
                v-for="item in educationLevelSchema.options"
                :key="item"
                :to="{ path: '/products', query: { level: item } }"
                >{{ item }}</NuxtLink
              >
            </div>
            <div>
              <template v-if="isShowcase">
                <h2>Tentang</h2>
                <a
                  href="https://erlangga.co.id/tentang-kami/lini-bisnis"
                  target="_blank"
                  rel="noopener noreferrer"
                  >Tentang Kami</a
                >
                <a
                  href="https://www2.erlangga.co.id/berita/tipe/article"
                  target="_blank"
                  rel="noopener noreferrer"
                  >Blog</a
                >
                <NuxtLink to="/contact">Kontak</NuxtLink>
              </template>
              <template v-else>
                <h2>Jelajahi</h2>
                <NuxtLink to="/products">Katalog Buku</NuxtLink>
                <NuxtLink to="/#kategori">Jenjang Sekolah</NuxtLink>
                <NuxtLink to="/login">Akun</NuxtLink>
              </template>
            </div>
          </div>
        </div>
        <div v-if="isShowcase" class="footer-rule" aria-hidden="true">
          <img
            :src="isCatalog ? '/images/catalog/footer-line.svg' : '/images/landing/footer-line.svg'"
            alt=""
            width="1280"
            height="1"
          />
        </div>
        <div class="footer-bottom">
          <p>© {{ new Date().getFullYear() }} Penerbit Erlangga. Semua hak cipta dilindungi.</p>
          <div v-if="isShowcase" class="social-links">
            <a
              href="https://www.instagram.com/bukuerlangga/"
              target="_blank"
              rel="noopener noreferrer"
              >Instagram</a
            >
            <a
              href="https://www.facebook.com/erlangga.penerbit/"
              target="_blank"
              rel="noopener noreferrer"
              >Facebook</a
            >
            <a
              href="https://www.youtube.com/@PenerbitErlanggaOfficial"
              target="_blank"
              rel="noopener noreferrer"
              >YouTube</a
            >
          </div>
          <span v-else>{{ config.public.siteName }}</span>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.login-main {
  padding: 80px 24px 82px;
}
@media (max-width: 700px) {
  .login-main {
    padding: 32px 16px 48px;
  }
}
.catalog-main {
  max-width: 1280px;
  margin: auto;
  padding: 0 32px 72px;
}
@media (max-width: 700px) {
  .catalog-main {
    padding: 0 16px 40px;
  }
}
.landing-shell {
  background: white;
  font-family: var(--font-landing-sans);
}
.landing-shell .site-header {
  border-bottom: 0;
}
.landing-shell .header-inner {
  position: relative;
  height: 72px;
  padding-block: 16px;
}
.landing-shell .main-nav {
  position: absolute;
  top: 25px;
  left: 50%;
  transform: translateX(-50%);
  gap: 32px;
  align-items: center;
  font: 400 16px/22px var(--font-landing-serif);
}
.landing-shell .main-nav a {
  white-space: nowrap;
  color: #1e1e1e;
}
.landing-shell .main-nav a:last-child {
  width: 66px;
}
.landing-shell .main-nav .nav-active {
  color: #344e41;
}
.landing-shell .account-nav {
  margin-left: auto;
  color: black;
}
.landing-shell .account-nav .text-sm {
  max-width: 120px;
  font-size: 12px;
}
.favorites-link {
  position: relative;
}
.favorite-count {
  position: absolute;
  top: -2px;
  right: -1px;
  display: grid;
  min-width: 16px;
  height: 16px;
  place-items: center;
  padding-inline: 3px;
  border-radius: 999px;
  background: #1f5c3f;
  color: white;
  font: 600 10px/1 var(--font-landing-sans);
}
.header-rule {
  position: absolute;
  top: 72px;
  left: 0;
  width: 100%;
  height: 1px;
  overflow: hidden;
}
.header-rule img,
.footer-rule img {
  display: block;
  max-width: none;
}
.footer-rule {
  height: 1px;
  overflow: hidden;
  margin-top: 32px;
}
.landing-shell .footer-bottom {
  border-top: 0;
  padding-top: 0;
  line-height: 16px;
  align-items: center;
}
.social-links {
  display: flex;
  gap: 24px;
  align-items: center;
}
.social-links a:hover {
  text-decoration: underline;
}
.landing-shell .footer-links {
  line-height: 17px;
}
.landing-shell .footer-links a {
  white-space: nowrap;
}
.landing-shell .footer-brand {
  width: 360px;
}
.landing-shell .footer-brand p {
  width: 360px;
  max-width: 100%;
}
.landing-shell .footer-inner {
  padding: 56px 80px 40px;
}
.landing-shell .footer-top :deep(.publisher-logos) {
  align-items: start;
}
.landing-shell .footer-brand :deep(.phibeta-logo) {
  object-fit: cover;
}
.landing-shell .footer-brand :deep(.erlangga-logo img) {
  top: -135.9%;
  height: 370.51%;
  transform: none;
}
.landing-shell .header-inner :deep(.erlangga-logo img) {
  top: -135.89%;
  height: 370.49%;
  transform: none;
}
.site-header {
  border-bottom: 1px solid #dce8e0;
  background: white;
}
.header-inner {
  position: relative;
  max-width: 1440px;
  min-height: 72px;
  margin: auto;
  padding: 12px 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}
.header-inner :deep(.erlangga-logo) {
  width: 148px;
  height: 40px;
}
.main-nav {
  display: flex;
  gap: 64px;
  font: 16px var(--font-sans);
}
.main-nav a {
  display: inline-block;
  transition:
    color 180ms ease,
    transform 180ms ease;
}
.main-nav a:focus-visible,
.nav-active {
  color: #344e41;
  text-decoration: underline;
  text-underline-offset: 4px;
}
.account-nav {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 12px;
  font-size: 13px;
}
.header-icon-button {
  display: inline-flex;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #1f2933;
  cursor: pointer;
}
.header-icon-button:disabled {
  opacity: 0.6;
  cursor: wait;
}
.editor-dashboard-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 8px 16px;
  border: 1px solid #2f6b4f;
  border-radius: 10px;
  background: #2f6b4f;
  color: white;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
}
.header-icon-button,
.editor-dashboard-link {
  transition:
    background-color 180ms ease,
    color 180ms ease,
    border-color 180ms ease;
}
.main-nav a:focus-visible,
.header-icon-button:focus-visible,
.editor-dashboard-link:focus-visible {
  outline: 2px solid #2f6b4f;
  outline-offset: 5px;
}
@media (hover: hover) {
  .main-nav a:hover,
  .landing-shell .main-nav a:hover {
    color: #2f6b4f;
    text-decoration: underline;
    text-underline-offset: 4px;
    transform: translateY(-2px);
  }
  .header-icon-button:not(:disabled):hover {
    background-color: #edf5ef;
    color: #2f6b4f;
  }
  .account-nav .editor-dashboard-link:hover {
    border-color: #24543e;
    background-color: #24543e;
    color: white;
    box-shadow: 0 4px 10px rgb(47 107 79 / 18%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .main-nav a,
  .account-nav a,
  .account-nav button,
  .header-icon-button,
  .editor-dashboard-link {
    transition: none;
  }
  .main-nav a:hover,
  .landing-shell .main-nav a:hover,
  .header-icon-button:not(:disabled):hover {
    transform: none;
  }
}
.header-search-popover {
  position: absolute;
  z-index: 10;
  top: calc(100% + 8px);
  right: 48px;
  display: flex;
  width: min(420px, calc(100vw - 32px));
  gap: 8px;
  padding: 8px;
  border: 1px solid #dce8e0;
  border-radius: 18px;
  background: white;
  box-shadow: 0 12px 28px rgb(31 41 51 / 14%);
}
.header-search-popover input {
  width: 100%;
  min-width: 0;
  height: 42px;
  border: 0;
  border-radius: 999px;
  padding: 0 14px;
  outline: none;
}
.header-search-popover input:focus-visible {
  box-shadow: inset 0 0 0 2px #2f6b4f;
}
.header-search-popover button {
  flex: 0 0 auto;
  min-width: 72px;
  border-radius: 999px;
  padding: 0 16px;
  background: #1f5c3f;
  color: white;
  font-size: 14px;
  font-weight: 600;
}
.header-search-popover button:hover {
  background: #17462f;
}
.landing-main {
  max-width: 1440px;
  margin: auto;
  padding: 48px 48px 0;
}
.site-footer {
  background: #f7fbf8;
  color: #687169;
  scroll-margin-top: 24px;
}
.footer-inner {
  max-width: 1440px;
  margin: auto;
  padding: 56px 80px 40px;
}
.footer-top {
  display: flex;
  justify-content: space-between;
  gap: 48px;
}
.footer-brand {
  max-width: 360px;
}
.footer-brand p {
  margin-top: 16px;
  font-size: 15px;
  line-height: 24px;
}
.footer-links {
  display: flex;
  gap: 64px;
  font-size: 14px;
}
.footer-links > div {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.footer-links h2 {
  font-weight: 600;
  color: #242b26;
}
.footer-links a:hover {
  text-decoration: underline;
}
.footer-bottom {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  margin-top: 32px;
  border-top: 1px solid #dce8e0;
  padding-top: 32px;
  font-size: 13px;
}
@media (max-width: 1000px) {
  .landing-shell .editor-navigation {
    height: auto;
    flex-wrap: wrap;
  }
  .landing-shell .editor-navigation .main-nav {
    order: 3;
    width: 100%;
    justify-content: space-between;
  }
  .landing-shell .editor-navigation .header-rule {
    top: auto;
    bottom: 0;
  }
  .landing-shell .main-nav {
    position: static;
    transform: none;
    gap: 24px;
  }
  .landing-shell .footer-inner {
    padding: 40px 24px 28px;
  }
  .landing-shell .landing-main {
    padding-top: 32px;
  }
  .header-inner {
    padding-inline: 24px;
    gap: 16px;
  }
  .main-nav {
    position: static;
    order: 3;
    width: 100%;
    justify-content: space-between;
    transform: none;
    gap: 16px;
  }
  .header-search-popover {
    right: 24px;
  }
  .landing-main {
    padding: 32px 24px 0;
  }
  .footer-inner {
    padding: 40px 24px 28px;
  }
}
@media (max-width: 1150px) {
  .header-inner {
    flex-wrap: wrap;
  }
  .landing-shell .header-inner {
    height: auto;
  }
  .landing-shell .main-nav,
  .main-nav {
    position: static;
    order: 3;
    width: 100%;
    justify-content: space-between;
    transform: none;
  }
}
@media (max-width: 700px) {
  .landing-shell .header-inner {
    height: auto;
    padding-block: 16px;
  }
  .landing-shell .header-rule {
    top: auto;
    bottom: 0;
  }
  .landing-shell .main-nav {
    font-size: 14px;
    gap: 8px;
  }
  .landing-shell .landing-main {
    padding-top: 24px;
  }
  .header-inner {
    flex-wrap: wrap;
    gap: 16px;
    padding: 16px 20px;
  }
  .main-nav {
    order: 3;
    width: 100%;
    justify-content: space-between;
    gap: 12px;
    font-size: 14px;
  }
  .account-nav {
    gap: 6px;
  }
  .header-inner > a:first-child :deep(.erlangga-logo) {
    width: 124px;
  }
  .header-search-popover {
    right: 16px;
  }
  .landing-main {
    padding: 24px 16px 0;
  }
  .footer-top {
    flex-direction: column;
    gap: 32px;
  }
  .footer-bottom {
    flex-direction: column;
    gap: 12px;
  }
}
@media (max-width: 420px) {
  .header-inner {
    padding-inline: 12px;
    gap: 8px;
  }
  .header-inner > a:first-child :deep(.erlangga-logo) {
    width: 108px;
  }
  .header-icon-button {
    width: 36px;
    height: 36px;
    flex-basis: 36px;
  }
  .account-nav {
    gap: 2px;
  }
  .editor-dashboard-link {
    min-height: 36px;
    padding-inline: 8px;
    font-size: 12px;
  }
  .editor-navigation .account-nav {
    flex-basis: 100%;
    justify-content: flex-end;
  }
  .main-nav {
    flex-wrap: wrap;
    justify-content: center;
    column-gap: 16px;
    row-gap: 8px;
  }
  .landing-shell .main-nav a:last-child {
    width: auto;
  }
  .header-search-popover {
    right: 12px;
  }
}
</style>
