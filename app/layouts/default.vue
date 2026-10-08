<script setup lang="ts">
import type { FavoriteIds } from '#shared/types/favorite'
const config = useRuntimeConfig()
const route = useRoute()
const isLanding = computed(() => route.path === '/')
const user = useSupabaseUser()
const client = useSupabaseClient()
const requestFetch = useRequestFetch()
const favorites = useFavorites()
await useAsyncData<FavoriteIds>(
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
  { watch: [() => user.value?.sub], default: () => ({ ownerId: null, ids: [] }) },
)
const { data: navigationAccount } = await useAsyncData(
  'navigation-account',
  async () => {
    if (!user.value) return null
    try {
      return await requestFetch('/api/auth/session')
    } catch {
      return null
    }
  },
  { watch: [user] },
)
const loggingOut = ref(false)
const logoutMessage = ref('')

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
  <div :class="['min-h-screen', { 'landing-shell': isLanding }]">
    <a href="#main-content" class="sr-only focus:not-sr-only focus:p-4">Lewati ke konten</a>
    <header class="site-header">
      <div
        class="header-inner"
        :class="{ 'editor-navigation': user && navigationAccount?.role === 'editor' }"
      >
        <NuxtLink to="/" :aria-label="config.public.siteName"><PublisherLogos /></NuxtLink>
        <nav aria-label="Navigasi utama" class="main-nav">
          <NuxtLink to="/" exact-active-class="nav-active">Beranda</NuxtLink>
          <NuxtLink to="/products" active-class="nav-active">Katalog</NuxtLink>
          <NuxtLink v-if="!isLanding" to="/favorites" active-class="nav-active">Favorit</NuxtLink>
          <NuxtLink to="/#kategori">Kategori</NuxtLink>
          <NuxtLink to="/#kontak">Kontak</NuxtLink>
        </nav>
        <div class="account-nav">
          <NuxtLink to="/#pencarian" aria-label="Cari buku"
            ><img src="/images/landing/search.svg" alt="" width="20" height="20"
          /></NuxtLink>
          <NuxtLink
            v-if="user && navigationAccount?.role === 'editor'"
            to="/admin"
            class="editor-dashboard-link"
            >Dashboard Editor</NuxtLink
          >
          <button
            v-if="user"
            type="button"
            class="inline-flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-50"
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
          <NuxtLink v-else to="/login" class="login-link"
            ><img src="/images/landing/user.svg" alt="" width="20" height="20" /><span
              class="sr-only"
              >Login</span
            ></NuxtLink
          >
          <NuxtLink
            v-if="isLanding"
            to="/favorites"
            class="favorites-link"
            :aria-label="`Favorit: ${favorites.ids.value.length} buku`"
          >
            <img src="/images/landing/favorite.svg" alt="" width="20" height="20" />
            <span>({{ favorites.ids.value.length }})</span>
          </NuxtLink>
        </div>
        <div v-if="isLanding" class="header-rule" aria-hidden="true">
          <img src="/images/landing/header-line.svg" alt="" width="1440" height="1" />
        </div>
      </div>
      <p v-if="logoutMessage" role="alert" class="mx-auto max-w-6xl px-6 pb-4 text-sm text-red-700">
        {{ logoutMessage }}
      </p>
    </header>
    <main id="main-content" :class="isLanding ? 'landing-main' : 'mx-auto max-w-6xl px-6 py-12'">
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
              <h2>{{ isLanding ? 'Kategori' : 'Jenjang' }}</h2>
              <template v-if="isLanding">
                <NuxtLink
                  v-for="item in ['Matematika', 'Bahasa Indonesia', 'Informatika', 'IPA']"
                  :key="item"
                  :to="{ path: '/products', query: { q: item } }"
                  >{{ item }}</NuxtLink
                >
              </template>
              <template v-else>
                <NuxtLink
                  v-for="item in ['SD', 'SMP', 'SMA', 'SMK']"
                  :key="item"
                  :to="{ path: '/products', query: { level: item } }"
                  >{{ item }}</NuxtLink
                >
              </template>
            </div>
            <div>
              <template v-if="isLanding">
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
                <NuxtLink to="/#kontak">Kontak</NuxtLink>
              </template>
              <template v-else>
                <h2>Jelajahi</h2>
                <NuxtLink to="/products">Katalog Buku</NuxtLink>
                <NuxtLink to="/#kategori">Mata Pelajaran</NuxtLink>
                <NuxtLink to="/login">Akun</NuxtLink>
              </template>
            </div>
          </div>
        </div>
        <div v-if="isLanding" class="footer-rule" aria-hidden="true">
          <img src="/images/landing/footer-line.svg" alt="" width="1280" height="1" />
        </div>
        <div class="footer-bottom">
          <p>© {{ new Date().getFullYear() }} Penerbit Erlangga. Semua hak cipta dilindungi.</p>
          <div v-if="isLanding" class="social-links">
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
  left: calc(50% - 225px);
  gap: 67px;
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
  display: flex;
  align-items: center;
  gap: 8px;
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
  font:
    16px Georgia,
    'Times New Roman',
    serif;
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
  gap: 24px;
  font-size: 13px;
}
.account-nav button {
  cursor: pointer;
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
.account-nav button:disabled {
  opacity: 0.6;
  cursor: wait;
}
.account-nav a,
.account-nav button {
  border-radius: 10px;
  transition:
    background-color 180ms ease,
    border-color 180ms ease,
    color 180ms ease,
    box-shadow 180ms ease,
    transform 180ms ease;
}
.main-nav a:focus-visible,
.account-nav a:focus-visible,
.account-nav button:focus-visible {
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
  .account-nav a:hover,
  .account-nav button:not(:disabled):hover {
    background-color: #edf5ef;
    color: #2f6b4f;
    box-shadow: 0 0 0 6px #edf5ef;
    transform: translateY(-2px);
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
  .account-nav button {
    transition: none;
  }
  .main-nav a:hover,
  .landing-shell .main-nav a:hover,
  .account-nav a:hover,
  .account-nav button:not(:disabled):hover {
    transform: none;
  }
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
  }
  .main-nav {
    gap: 24px;
  }
  .landing-main {
    padding: 32px 24px 0;
  }
  .footer-inner {
    padding: 40px 24px 28px;
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
    gap: 12px;
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
    gap: 16px;
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
</style>
