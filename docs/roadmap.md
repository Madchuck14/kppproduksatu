# Roadmap

Model akses saat ini: katalog/materi published publik tanpa akun; hanya Editor yang login
dan menggunakan Favorit/dashboard. Akun umum dan registrasi mandiri tidak tersedia.

1. **Fondasi (folder ini):** Nuxt, UI, API katalog, fixture, schema Supabase, login/guard admin, konfigurasi dua target deploy. Instalasi dari cache dan halaman katalog pada development server sudah diverifikasi; build produksi dan integrasi Supabase masih perlu diuji.
2. **Showcase:** branding asli, layout mengacu theme referensi, produk/gambar klien, filter jenjang/pagination, kontak, banner, dan staging online.
3. **Editor:** Dashboard, CRUD buku, filter/pagination, upload sampul, form Zod, konfirmasi delete,
   serta guard server dan RLS per jenjang sudah tersedia. Upload Editor dan akses materi buku
   published setelah login tersedia. PPT Produk PPT/PPTX memakai preview gambar hasil ekspor manual;
   Flyer dan Dummy Buku tetap PDF.
   Berikutnya: audit perubahan. Banner hanya ditambahkan jika dibutuhkan.
4. **Konten/SEO:** About/Contact/blog bila diperlukan, canonical URLs, sitemap, Product/Book structured data, a11y, dan responsive review.
5. **Transaksi (jika disepakati):** varian/stok, customer auth, cart, alamat, ongkir, Midtrans sandbox, order snapshot, transactional stock reservation, webhook idempotent, dan email. Uji pembayaran dan otorisasi secara khusus.
6. **Handover:** validasi target infra, migrasi data/storage/Auth, build Docker, pengujian staging/produksi, backup/restore, dokumentasi, dan pelatihan admin.

Scope transaksi pada PRD lama tetap menjadi referensi; belum diimplementasikan pada starter ini. Fondasi katalog tidak dianggap selesai sebagai toko online lengkap.
