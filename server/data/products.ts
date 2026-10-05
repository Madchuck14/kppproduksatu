import type { Product } from '#shared/types/product'

// Sample titles and prices, not the client's real inventory.
export const demoProducts: Product[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'ruang-untuk-bertumbuh',
    title: 'Ruang untuk Bertumbuh',
    author: 'Penulis Contoh',
    description: 'Buku contoh tentang kebiasaan kecil, refleksi, dan perjalanan pengembangan diri.',
    category: 'Pengembangan Diri',
    price: 89000,
    imageUrl: '/images/book-placeholder.svg',
    featured: true,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    slug: 'cerita-dari-seberang',
    title: 'Cerita dari Seberang',
    author: 'Penulis Contoh',
    description: 'Novel contoh tentang pertemuan, perjalanan, dan cara menemukan jalan pulang.',
    category: 'Fiksi',
    price: 95000,
    imageUrl: '/images/book-placeholder.svg',
    featured: true,
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    slug: 'belajar-melihat-dunia',
    title: 'Belajar Melihat Dunia',
    author: 'Penulis Contoh',
    description: 'Buku contoh untuk menjelajahi gagasan baru dan memahami dunia di sekitar kita.',
    category: 'Pendidikan',
    price: 120000,
    imageUrl: '/images/book-placeholder.svg',
    featured: true,
  },
]
