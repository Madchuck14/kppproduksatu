export default defineNuxtConfig({
  compatibilityDate: '2026-10-04',
  devtools: { enabled: false },
  modules: ['@nuxt/ui', '@nuxtjs/supabase', '@nuxt/eslint'],
  css: ['~/assets/css/main.css'],
  supabase: {
    // Valid placeholders let the starter render without contacting Supabase.
    // Override with NUXT_PUBLIC_SUPABASE_URL / NUXT_PUBLIC_SUPABASE_KEY.
    url: 'https://example.supabase.co',
    key: 'demo-only-not-a-real-key',
    cookiePrefix: 'sb-kppproduksatu',
    // Generate database types from the live project when its schema is finalized.
    types: false,
    redirect: false,
  },
  runtimeConfig: {
    catalogSource: 'demo',
    public: {
      siteName: 'KPP Produk Satu',
      siteUrl: 'http://localhost:3000',
    },
  },
  app: {
    head: {
      htmlAttrs: { lang: 'id' },
      title: 'KPP Produk Satu',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },
  routeRules: {
    '/': { headers: { 'Cache-Control': 'no-store' } },
    '/products': { headers: { 'Cache-Control': 'no-store' } },
    '/products/**': { headers: { 'Cache-Control': 'no-store' } },
    '/favorites': { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } },
    '/admin/**': { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } },
    '/login': { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } },
    '/register': { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } },
    '/api/**': { headers: { 'Cache-Control': 'no-store' } },
    '/**': {
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'X-Frame-Options': 'SAMEORIGIN',
      },
    },
  },
})
