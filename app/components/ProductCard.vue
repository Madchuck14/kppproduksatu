<script setup lang="ts">
import type { Product } from '#shared/types/product'

withDefaults(defineProps<{ product: Product; variant?: 'default' | 'landing' | 'catalog' }>(), {
  variant: 'default',
})
</script>

<template>
  <article
    v-if="variant === 'landing' || variant === 'catalog'"
    :class="['landing-book', { 'catalog-book': variant === 'catalog' }]"
  >
    <div class="cover-display">
      <NuxtLink :to="`/products/${product.slug}`" class="cover-link" :aria-label="product.title">
        <img :src="product.imageUrl" :alt="product.title" width="166" height="244" loading="lazy" />
      </NuxtLink>
      <FavoriteButton :product="product" icon-only :catalog="variant === 'catalog'" />
    </div>
    <div class="book-details">
      <p class="book-level">
        {{
          variant === 'catalog'
            ? product.subject || product.educationLevel || 'Buku Erlangga'
            : product.educationLevel || 'Buku Erlangga'
        }}
      </p>
      <NuxtLink :to="`/products/${product.slug}`" :title="product.title"
        ><h2>{{ product.title }}</h2></NuxtLink
      >
      <p class="book-author">
        {{ product.author
        }}<template v-if="variant === 'catalog' && product.educationLevel">
          · {{ product.educationLevel
          }}<template v-if="product.grade"> Kelas {{ product.grade }}</template></template
        >
      </p>
    </div>
  </article>
  <article v-else>
    <NuxtLink
      :to="`/products/${product.slug}`"
      class="group block rounded-xl border border-stone-200 bg-white p-5 transition hover:border-emerald-700 focus-visible:outline-2 focus-visible:outline-emerald-700"
    >
      <div class="mb-5 flex aspect-[4/3] items-center justify-center rounded-lg bg-stone-100">
        <img
          :src="product.imageUrl"
          :alt="product.title"
          width="200"
          height="240"
          loading="lazy"
          class="h-48 max-w-full object-contain transition group-hover:-translate-y-1"
        />
      </div>
      <h2 class="text-lg font-semibold">{{ product.title }}</h2>
      <p class="mt-1 text-sm text-stone-500">{{ product.author }}</p>
      <p class="mt-4 font-semibold">{{ formatPrice(product.price) }}</p>
    </NuxtLink>
    <FavoriteButton :product="product" class="mt-3" />
  </article>
</template>

<style scoped>
.landing-book {
  min-width: 0;
  color: #242b26;
  font-family: var(--font-landing-sans);
}
.cover-display {
  position: relative;
  display: flex;
  height: 302px;
  align-items: center;
  justify-content: center;
  background: #f6f5f0;
}
.cover-link {
  display: flex;
  align-items: center;
  justify-content: center;
}
.cover-link img {
  width: 166px;
  height: 244px;
  max-width: 100%;
  object-fit: contain;
  filter: drop-shadow(5px 8px 7px #242b261c);
}
.cover-link:focus-visible,
.book-details a:focus-visible {
  outline: 2px solid #2f6b4f;
  outline-offset: 4px;
}
.book-details {
  display: grid;
  gap: 7px;
  margin-top: 16px;
}
.book-level {
  font-size: 9px;
  line-height: 11px;
  text-transform: uppercase;
  color: #687169;
}
.book-details h2 {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 400 21px/27px var(--font-landing-serif);
}
.book-author {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 14px;
  color: #687169;
}
@media (max-width: 700px) {
  .cover-display {
    height: 220px;
  }
  .cover-link img {
    width: 123px;
    height: 180px;
  }
  .book-details h2 {
    font-size: 18px;
  }
}
.catalog-book {
  color: #222;
}
.catalog-book .cover-display {
  height: auto;
  aspect-ratio: 1;
  background: #f6f3ee;
}
.catalog-book .cover-link {
  width: 100%;
  height: 100%;
  padding: 24px;
}
.catalog-book .cover-link img {
  width: auto;
  height: 100%;
  max-height: 242px;
  max-width: 100%;
  object-fit: contain;
}
.catalog-book .book-details {
  margin-top: 14px;
  gap: 2px;
}
.catalog-book .book-level {
  font-size: 10px;
  line-height: 16px;
  letter-spacing: 0.6px;
  color: #6b6f6b;
}
.catalog-book .book-details h2 {
  white-space: normal;
  overflow: visible;
  font: 500 19px/22.8px var(--font-landing-serif);
}
.catalog-book .book-author {
  white-space: normal;
  font-size: 13px;
  line-height: 20.8px;
  color: #6b6f6b;
}
@media (max-width: 700px) {
  .catalog-book .cover-link {
    padding: 16px;
  }
  .catalog-book .book-details h2 {
    font-size: 17px;
  }
}
</style>
