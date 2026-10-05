# Roadmap

1. **Fondasi (folder ini):** Nuxt, UI, API katalog, fixture, schema Supabase, login/guard admin, konfigurasi dua target deploy. Instalasi dari cache dan halaman katalog pada development server sudah diverifikasi; build produksi dan integrasi Supabase masih perlu diuji.
2. **Showcase:** branding asli, layout mengacu theme referensi, produk/gambar klien, kategori/filter/pagination, kontak, banner, dan staging online.
3. **Editor:** Dashboard, CRUD buku, filter/pagination, upload sampul, form Zod, konfirmasi delete,
   serta guard server dan RLS per jenjang sudah tersedia. Berikutnya: materi privat, pengelolaan
   kategori, dan audit perubahan. Banner hanya ditambahkan jika dibutuhkan.
4. **Konten/SEO:** About/Contact/blog bila diperlukan, canonical URLs, sitemap, Product/Book structured data, a11y, dan responsive review.
5. **Transaksi (jika disepakati):** varian/stok, customer auth, cart, alamat, ongkir, Midtrans sandbox, order snapshot, transactional stock reservation, webhook idempotent, dan email. Uji pembayaran dan otorisasi secara khusus.
6. **Handover:** validasi target infra, migrasi data/storage/Auth, build Docker, pengujian staging/produksi, backup/restore, dokumentasi, dan pelatihan admin.

Scope transaksi pada PRD lama tetap menjadi referensi; belum diimplementasikan pada starter ini. Fondasi katalog tidak dianggap selesai sebagai toko online lengkap.
