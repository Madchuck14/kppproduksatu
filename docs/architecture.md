# Arsitektur

## Keputusan awal

Satu repo Nuxt 4 + TypeScript. Storefront memakai SSR, backend memakai Nitro bawaan, admin custom memakai Nuxt UI. Tailwind dipakai untuk desain storefront. Supabase menyediakan PostgreSQL, Auth, dan Storage. Tidak ada ORM atau backend Express terpisah.

```text
Browser → Nuxt pages → Nitro API → product repository → Supabase PostgreSQL
        → Supabase Auth (session cookie)
Gambar  → Supabase Storage public product-images bucket
```

Katalog sekarang khusus buku sesuai PRD awal, namun penamaan entitas `products` mempermudah perluasan. Harga integer rupiah. Varian dan stok ditambahkan ketika scope transaksi disepakati.

## Konfigurasi

- `NUXT_CATALOG_SOURCE`: `demo` atau `supabase`; pemilihan eksplisit, tidak ada fallback saat database gagal.
- `NUXT_PUBLIC_SITE_NAME`, `NUXT_PUBLIC_SITE_URL`: nama toko dan URL environment.
- `NUXT_PUBLIC_SUPABASE_URL`, `NUXT_PUBLIC_SUPABASE_KEY`: URL dan public publishable/anon key. Supabase module membuat runtime config `public.supabase`.
- Placeholder URL/key bawaan hanya agar starter bisa render tanpa credentials; bukan akun Supabase.

Tidak ada secret key di starter. Jika pembayaran atau operasi privileged ditambahkan, simpan key dalam runtime config server-only, tanpa prefix `PUBLIC`.

## Boundary dan akses

Query katalog berada di `server/repositories/products.ts`. Endpoint menerima input yang divalidasi Zod. Katalog memakai anonymous Supabase client dan selalu membatasi ke `published=true`; RLS juga menerapkan pembatasan ini. Hasil list saat ini dibatasi 60 produk; pagination adalah pekerjaan fase berikutnya.

Session admin diverifikasi dengan `auth.getUser()` pada server. Role diperiksa terhadap `admin_memberships`, bukan user metadata yang dapat diedit pengguna. Route middleware mengatur navigasi; setiap endpoint admin baru tetap wajib memanggil `requireAdmin(event)`. Tidak ada endpoint write pada starter.

Image disimpan sebagai object path pada database, lalu URL dibuat lewat helper storage. Bucket hanya untuk gambar produk yang boleh dibaca publik; jangan gunakan untuk dokumen pribadi. Upload dibatasi 2 MB dan MIME raster. CRUD dan validasi isi file belum dibuat.

## Portabilitas

Staging menggunakan Cloudflare Workers. Produksi membangun target Node dan menjalankannya lewat Docker. Hindari ketergantungan Cloudflare D1/KV/R2 dan API Node-only di logika aplikasi yang harus berjalan pada kedua target.

Client dapat mempertahankan managed Supabase atau menjalankan self-hosted Supabase. PostgreSQL biasa tidak menyediakan API/Auth/Storage Supabase: repository, auth, dan storage perlu adapter pengganti jika itu target mereka. Wrapper membantu perubahan tersebut, tetapi tidak menghilangkan pekerjaan migrasi.

## Referensi resmi

- https://nuxt.com/docs/4.x/getting-started/server
- https://nuxt.com/docs/4.x/getting-started/deployment
- https://supabase.nuxtjs.org/
- https://ui.nuxt.com/
- https://supabase.com/docs/guides/self-hosting/docker
