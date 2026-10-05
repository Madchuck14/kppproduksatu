# KPP Produk Satu

Fondasi katalog produk dengan Nuxt 4, Vue 3, TypeScript, Tailwind CSS, Nuxt UI, dan Supabase. Staging direncanakan di Cloudflare Workers; produksi memakai Node.js/Docker di infrastruktur klien.

## Mulai di Windows

Gunakan Node.js 22.12+ (Node 22 LTS disarankan). Jalankan dari folder project:

```powershell
Copy-Item .env.example .env
npm.cmd install
npm.cmd run dev
```

Buka http://localhost:3000. `npm.cmd` menghindari pembatasan execution policy PowerShell terhadap `npm.ps1`. Pada macOS/Linux gunakan `npm` biasa.

Mode awal `NUXT_CATALOG_SOURCE=demo` membaca tiga produk contoh dari fixture lokal. Ini tetap aplikasi SSR dengan API, bukan koneksi database online. Untuk demo dengan database online ikuti [setup Supabase](docs/supabase.md), lalu gunakan `NUXT_CATALOG_SOURCE=supabase`.

Lockfile sudah tersedia. Commit `package-lock.json` dan gunakan `npm ci` untuk instalasi berikutnya.
Dashboard Editor telah diuji melalui server lokal dengan Supabase: CRUD, upload, publikasi,
filter/pencarian, SSR, akses Sales/Editor, dan RLS lintas jenjang. Data uji dibersihkan setelah selesai.
Build Vercel dan typecheck lulus; lint memiliki warning gaya HTML, tanpa error. Deployment cloud,
Docker, dan pemeriksaan interaksi browser belum diverifikasi untuk dashboard ini.

## Yang tersedia

- Halaman beranda, katalog dengan pencarian, dan detail produk.
- API `GET /api/products` dan `GET /api/products/:slug`, dengan validasi Zod.
- Pilihan data fixture atau Supabase; kegagalan Supabase tidak diam-diam diganti fixture.
- Login email/password dan dashboard Editor `/admin`: ringkasan, pencarian, filter jenjang/status,
  tambah/edit/hapus buku, publikasi, dan unggah sampul. Akses dibatasi di server dan RLS.
- Tampilan registrasi Sales/Editor tetap tersedia; pengiriman registrasi mandiri dinonaktifkan.
- Provisioning akun Sales/Editor super melalui script lokal dan membership RLS; Editor super
  memiliki SD/SMP/SMA/SMK serta akses admin, Sales tidak memiliki akses admin.
- Migration kategori/produk/admin membership, RLS, bucket gambar, dan seed demo.
- Endpoint `/healthz` untuk liveness aplikasi (bukan pemeriksaan database).
- Konfigurasi Cloudflare Workers, Dockerfile, dan Compose untuk aplikasi Node.

Pagination tersedia pada dashboard Editor. Cart, checkout, Midtrans, wishlist, blog, banner CMS,
pengelolaan kategori, pagination katalog publik, sitemap, dan structured data belum diimplementasikan.
Materi privat Product Knowledge, flyer, dan dummy belum memiliki unggahan atau endpoint unduhan.

## Perintah

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
npm.cmd run build
npm.cmd run build:vercel
npm.cmd run preview
npm.cmd run build:cloudflare
```

`npm run build` menghasilkan server Node. `build:vercel` menghasilkan deployment SSR/API di `.vercel/output`. `build:cloudflare` menghasilkan Worker; build Node dan Cloudflare mengganti `.output`, sehingga build Node kembali sebelum menjalankan `preview`/`start` untuk Node. Gunakan Prettier pada file yang diubah; `format:check` memeriksa format seluruh repository.

## Struktur

```text
app/                     Vue pages, layouts, components, middleware, styling
shared/                  Tipe dan schema yang dipakai app/server
server/api/              Endpoint publik dan admin
server/repositories/     Akses katalog; jangan taruh query DB di komponen
server/utils/            Client Supabase, storage URL, pemeriksaan admin
server/data/             Fixture demo
supabase/migrations/     Schema dan RLS yang versioned
supabase/seed.sql         Data contoh
docs/                    Setup, arsitektur, staging, handover
```

## Dokumentasi

- [Arsitektur dan keputusan stack](docs/architecture.md)
- [Setup database, storage, dan admin](docs/supabase.md)
- [Staging dan deployment klien](docs/deploy.md)
- [Roadmap development](docs/roadmap.md)

Dokumen konsep SvelteKit lama tetap disimpan sebagai referensi fitur. Keputusan stack terbaru ada di `docs/architecture.md`.
