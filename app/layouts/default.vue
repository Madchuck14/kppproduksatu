<script setup lang="ts">
const config = useRuntimeConfig()
const route = useRoute()
const isLanding = computed(() => route.path === '/')
const user = useSupabaseUser()
const client = useSupabaseClient()
const requestFetch = useRequestFetch()
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
      <div class="header-inner">
        <NuxtLink to="/" :aria-label="config.public.siteName"><PublisherLogos /></NuxtLink>
        <nav aria-label="Navigasi utama" class="main-nav">
          <NuxtLink to="/" exact-active-class="nav-active">Beranda</NuxtLink>
          <NuxtLink to="/products" active-class="nav-active">Katalog</NuxtLink>
          <NuxtLink to="/#kategori">Kategori</NuxtLink>
          <NuxtLink to="/#kontak">Kontak</NuxtLink>
        </nav>
        <div class="account-nav">
          <NuxtLink to="/#pencarian" aria-label="Cari buku"
            ><img src="/images/landing/search.svg" alt="" width="20" height="20"
          /></NuxtLink>
          <NuxtLink v-if="user && navigationAccount?.role === 'editor'" to="/admin" class="text-sm"
            >Dashboard Editor</NuxtLink
          >
          <button
            v-if="user"
            type="button"
            :disabled="loggingOut"
            :aria-busy="loggingOut"
            @click="logout"
          >
            {{ loggingOut ? 'Keluar...' : 'Keluar' }}
          </button>
          <NuxtLink v-else to="/login" class="login-link"
            ><img src="/images/landing/user.svg" alt="" width="20" height="20" /><span
              class="sr-only"
              >Login</span
            ></NuxtLink
          >
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
              <h2>Jenjang</h2>
              <NuxtLink
                v-for="item in ['SD', 'SMP', 'SMA', 'SMK']"
                :key="item"
                :to="{ path: '/products', query: { level: item } }"
                >{{ item }}</NuxtLink
              >
            </div>
            <div>
              <h2>Jelajahi</h2>
              <NuxtLink to="/products">Katalog Buku</NuxtLink>
              <NuxtLink to="/#kategori">Mata Pelajaran</NuxtLink>
              <NuxtLink to="/login">Akun</NuxtLink>
            </div>
          </div>
        </div>
        <div class="footer-bottom">
          <p>© {{ new Date().getFullYear() }} Penerbit Erlangga. Semua hak cipta dilindungi.</p>
          <span>{{ config.public.siteName }}</span>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.landing-shell {
  background: white;
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
.main-nav a:hover,
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
.account-nav button:disabled {
  opacity: 0.6;
  cursor: wait;
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
