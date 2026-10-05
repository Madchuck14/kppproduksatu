<script setup lang="ts">
const config = useRuntimeConfig()
</script>

<template>
  <div class="min-h-screen">
    <a href="#main-content" class="sr-only focus:not-sr-only focus:p-4">Lewati ke konten</a>
    <header class="border-b border-stone-200 bg-white">
      <div class="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-6">
        <NuxtLink to="/" class="text-lg font-semibold tracking-tight">
          {{ config.public.siteName }}<span class="text-emerald-700">.</span>
        </NuxtLink>
        <nav aria-label="Navigasi utama" class="flex gap-5 text-sm">
          <NuxtLink to="/">Beranda</NuxtLink>
          <NuxtLink to="/products">Katalog</NuxtLink>
        </nav>
      </div>
    </header>
    <main id="main-content" class="mx-auto max-w-6xl px-6 py-12">
      <slot />
    </main>
    <footer class="border-t border-stone-200">
      <div class="mx-auto flex max-w-6xl flex-wrap justify-between gap-4 px-6 py-8 text-sm text-stone-600">
        <span>{{ config.public.siteName }}</span>
        <span>Katalog produk · Dibuat untuk eksplorasi.</span>
      </div>
    </footer>
  </div>
</template>
