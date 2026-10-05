# PRD — Literex Book Store (Web Toko Buku)

## 1. Context

Klien (kantor) butuh web toko buku online mirip referensi Shopify "Literex" (theme736-book-store.myshopify.com). Kita sebagai vendor mengembangkan memakai layanan gratis (Supabase, Cloudflare/Vercel), lalu hasil akhir dideploy ke **server kantor** milik klien. Proyek sebelumnya memakai Next.js dan dinilai sulit dikembangkan, jadi stack harus ringan, boilerplate sedikit, dan mudah dipindah environment.

Prinsip utama: **portable**. Semua konfigurasi lewat environment variable; tidak ada fitur yang mengunci ke satu vendor hosting.

## 2. Tujuan & Non-Tujuan

Tujuan
- Etalase katalog buku + cart + checkout + pembayaran online + admin panel.
- Dev & staging berjalan penuh di tier gratis.
- Deploy produksi ke server kantor via satu perintah Docker, tanpa ubah kode.

Non-tujuan (v1)
- Marketplace multi-seller, aplikasi mobile native, ebook/DRM, integrasi ERP/akuntansi, multi-bahasa penuh (siapkan i18n, isi 1 bahasa dulu).

## 3. Pengguna

| Peran | Kebutuhan |
|---|---|
| Pengunjung | Cari/jelajah buku, baca blog, kontak |
| Pelanggan (login) | Cart, wishlist, checkout, alamat, riwayat order |
| Admin/staf toko | Kelola buku, stok, kategori, order, banner, blog |

## 4. Fitur (dari analisis situs referensi)

**Storefront**
- Header: bar info (telepon), search, akun, wishlist, pilihan mata uang, mega-menu katalog, mini-cart.
- Beranda: hero slider (banner buku unggulan + tombol Shop Now), 2 banner promo, ikon kategori (Sci-Fi, Travel, Education, Romance, Detective, Cooking), grid "Sale", "Popular Products", banner promo (50% off, New Arrivals, Special Offer), strip info (express delivery, free return 28 hari), berita terbaru, testimoni, teks tentang toko, footer (kategori, informasi, akun).
- Katalog/koleksi: filter (kategori, harga, penulis), sort, pagination, badge diskon.
- Detail produk: gambar, penulis, harga coret/diskon, varian (mis. hardcover/paperback/box set, harga rentang), stok, deskripsi, produk terkait.
- Cart & checkout: alamat, ongkir, kode voucher, pembayaran.
- Akun: register/login (email + Google), alamat, riwayat order, wishlist.
- Blog: daftar + detail artikel.
- Halaman statis: About, Contact (form), Privacy Policy.
- Mata uang: default IDR; USD/EUR/GBP opsional via tabel kurs (konfigurasi admin).

**Admin panel** (`/admin`, role-based)
- CRUD buku (judul, penulis, ISBN, kategori, varian, harga, harga coret, stok, gambar, deskripsi, flag sale/popular/new).
- CRUD kategori & koleksi, banner beranda, artikel blog, voucher.
- Manajemen order: status (pending, paid, packed, shipped, done, cancelled), resi, cetak invoice.
- Dashboard ringkas: penjualan, order baru, stok menipis.
- Kelola konten statis & pengaturan toko (kontak, kurs, ongkir).

## 5. Tech Stack (dipilih untuk mudah dikembangkan)

| Lapisan | Pilihan | Alasan |
|---|---|---|
| Framework | **SvelteKit** (TypeScript) | Boilerplate sedikit, routing file-based, form actions, SSR untuk SEO. Adapter berganti tanpa ubah kode. |
| Styling | **Tailwind CSS** + komponen sendiri (opsional `bits-ui`/shadcn-svelte untuk admin) | Cepat, konsisten |
| Database + Auth + Storage | **Supabase** (Postgres, Auth, Storage) via `@supabase/supabase-js` + `@supabase/ssr` | Free tier; Postgres standar → mudah pindah |
| Validasi | **Zod** (+ `sveltekit-superforms`) | Form & server action tervalidasi |
| Pembayaran | **Midtrans Snap** (sandbox saat dev) | Standar lokal ID; webhook sederhana |
| Ongkir | **RajaOngkir / Biteship** API (atau tabel tarif manual v1) | Opsional bertahap |
| Email | **Resend** (free) atau SMTP kantor | Notifikasi order |
| Test | Vitest (unit), Playwright (e2e alur checkout) | |
| Kualitas | ESLint, Prettier, `svelte-check`, GitHub Actions | |

Struktur satu repo, tanpa monorepo, tanpa ORM berat. Skema dikelola sebagai file SQL di `supabase/migrations/` (Supabase CLI), dengan Row Level Security (RLS) untuk data pelanggan.

## 6. Arsitektur & Strategi Deploy

```
Browser → SvelteKit (SSR + API routes) → Supabase (Postgres/Auth/Storage)
                                       ↘ Midtrans (webhook /api/payment/notify)
```

Lingkungan
- **Dev/staging (gratis):** SvelteKit di Cloudflare Pages (`adapter-cloudflare`) atau Vercel (`adapter-vercel`) + project Supabase free + Midtrans sandbox.
- **Produksi (server kantor):** `adapter-node` dibungkus **Dockerfile**; `docker-compose.yml` menjalankan app + reverse proxy (Caddy/Nginx). Database: pilih salah satu
  1. Self-host Supabase (docker compose resmi) — paling mirip dev, atau
  2. Postgres biasa + Auth/Storage dialihkan (lihat abstraksi di bawah).
- Rekomendasi: **self-host Supabase** di server kantor agar kode identik dengan dev.

Aturan agar portable
- Semua secret & URL lewat `.env` (`PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MIDTRANS_*`, `PUBLIC_CURRENCY_DEFAULT`, dll).
- Akses Supabase dibungkus di satu folder `src/lib/server/` (repository layer), bukan tersebar di komponen.
- Upload gambar lewat wrapper storage (`putImage`, `getPublicUrl`) sehingga bisa diganti ke disk lokal/S3-compatible.
- Server code hindari API Node-only yang tidak jalan di Cloudflare Workers, kecuali ditandai; produksi tetap Node penuh.
- Skrip migrasi data: `pg_dump` dari Supabase free → restore ke server kantor; dokumentasikan di `docs/deploy.md`.

Catatan batas tier gratis
- Supabase free: project auto-pause setelah ±1 minggu tidak aktif, DB 500 MB, storage 1 GB → cukup untuk dev, bukan produksi.
- Vercel Hobby: non-komersial; pakai hanya untuk demo/staging klien.
- Cloudflare Pages: batas ukuran bundle/CPU Workers; hindari library besar di server.
- Kompres gambar (WebP, ukuran maksimal) sebelum upload agar storage awet.

## 7. Model Data (ringkas)

`profiles`(id→auth.users, nama, telepon, role) · `addresses` · `categories`(parent_id) · `authors` · `books`(judul, slug, isbn, author_id, deskripsi, flag) · `book_variants`(book_id, format, sku, harga, harga_coret, stok) · `book_images` · `book_categories` · `wishlists` · `carts`/`cart_items` · `orders`(status, total, ongkir, currency, payment_ref, alamat snapshot) · `order_items`(harga snapshot) · `vouchers` · `banners` · `posts` · `pages` · `settings`(kurs, kontak).

RLS: pelanggan hanya baca/tulis miliknya (cart, alamat, wishlist, order); katalog publik read-only; admin via `profiles.role = 'admin'`; operasi sensitif (buat order, webhook) lewat service role di server.

## 8. Alur Kritis

1. **Checkout:** validasi stok & harga di server → buat `orders` (pending) + potong stok transaksional (fungsi SQL) → minta Snap token Midtrans → redirect bayar.
2. **Webhook Midtrans:** verifikasi signature → update status idempoten → kirim email → kembalikan stok jika expire/cancel.
3. **Admin ubah harga/stok:** tidak mempengaruhi order lama (snapshot).

## 9. Kebutuhan Non-Fungsional

- Performa: LCP < 2,5 dtk pada 4G; gambar lazy + responsif.
- SEO: SSR, meta/OG per produk, `sitemap.xml`, JSON-LD `Book`/`Product`.
- Keamanan: RLS aktif, validasi Zod semua input, rate-limit login/kontak, CSRF bawaan SvelteKit, header keamanan via reverse proxy, service-role key hanya di server.
- Aksesibilitas: WCAG AA dasar, responsif mobile-first.
- Observabilitas: log terstruktur, health endpoint `/healthz`, backup DB harian (cron `pg_dump`) di produksi.
- Maintainability: TypeScript ketat, tipe DB digenerate (`supabase gen types`), README + `docs/` untuk serah-terima.

## 10. Milestone

| Fase | Isi | Durasi perkiraan |
|---|---|---|
| 0 Setup | Repo, SvelteKit+Tailwind, Supabase project, skema+seed buku contoh, CI | 3–4 hari |
| 1 Katalog | Layout, beranda, katalog/filter/search, detail produk | 1,5–2 minggu |
| 2 Akun & cart | Auth, wishlist, cart, alamat | 1 minggu |
| 3 Checkout | Order, Midtrans, webhook, email, voucher | 1,5 minggu |
| 4 Admin | CRUD buku/kategori/banner/blog, order, dashboard | 2 minggu |
| 5 Konten & polish | Blog, halaman statis, SEO, a11y, e2e test | 1 minggu |
| 6 Serah-terima | Dockerfile/compose, migrasi ke server kantor, dokumentasi, pelatihan admin | 1 minggu |

## 11. Risiko

- Server kantor tidak mendukung Docker → sediakan jalur PM2 + Nginx dengan `adapter-node` sebagai alternatif.
- Self-host Supabase butuh RAM ≥ 4 GB → konfirmasi spesifikasi server sejak awal; fallback Postgres + Auth sederhana.
- Supabase free pause saat demo → job ping berkala atau upgrade sementara.
- Perbedaan runtime Cloudflare vs Node → uji build `adapter-node` di CI setiap PR.

## 12. Pertanyaan Terbuka untuk Klien

1. Spesifikasi & OS server kantor (Docker? RAM? akses internet keluar untuk Midtrans/email?).
2. Mata uang & metode pembayaran wajib; perlu ongkir otomatis?
3. Jumlah buku awal & sumber data (Excel/CSV) untuk impor massal.
4. Bahasa antarmuka (ID/EN) dan branding (logo, warna).
5. Siapa mengelola server & backup setelah serah-terima.

## 13. Verifikasi (Definition of Done)

- `npm run build` sukses untuk `adapter-cloudflare` dan `adapter-node`.
- Playwright e2e lulus: browse → cart → checkout sandbox Midtrans → status paid via webhook.
- `docker compose up` di mesin bersih menjalankan seluruh stack; halaman beranda & admin dapat diakses.
- Restore dump DB dari Supabase free ke instance kantor berhasil dan data tampil benar.
- Audit Lighthouse: Performance/SEO/Accessibility ≥ 90 di beranda & detail produk.
