# Setup Supabase untuk demo online

## Database

1. Buat project Supabase milik vendor untuk staging. Jangan gunakan database produksi klien.
2. Di SQL Editor, jalankan `supabase/migrations/202610040001_catalog.sql` satu kali.
3. Jalankan `supabase/seed.sql` untuk tiga produk contoh. Ini opsional dan jangan dipakai sebagai inventory produksi.
4. Dari project settings, ambil Project URL dan public publishable/anon key.
5. Isi `.env`:

```dotenv
NUXT_CATALOG_SOURCE=supabase
NUXT_PUBLIC_SUPABASE_URL=https://PROJECT.supabase.co
NUXT_PUBLIC_SUPABASE_KEY=PUBLIC_KEY
```

Restart development server. `GET /api/products` akan mengembalikan `source: "supabase"`. Hanya produk published yang dibaca publik. Tidak ada service-role key yang dibutuhkan starter.

Schema SQL ini membutuhkan schema Supabase `auth` dan `storage`; tidak dapat langsung dijalankan di PostgreSQL kosong.

## Gambar

Migration membuat public bucket `product-images`. Upload JPG/PNG/WebP/AVIF maksimal 2 MB dari dashboard Supabase, lalu isi `products.image_path` dengan object path, misalnya `books/judul.webp`. Jangan simpan full URL. Jika kosong, UI menampilkan ilustrasi placeholder lokal.

Public bucket membuat file dapat dibaca siapa pun yang memiliki URL, termasuk gambar produk draft. Hanya upload aset yang memang boleh dipublikasikan.

## Akun admin

1. Di Authentication dashboard, buat user email/password dan konfirmasi emailnya.
2. Ambil UUID user tersebut.
3. Jalankan sebagai database owner melalui SQL Editor:

```sql
insert into public.admin_memberships (user_id)
values ('UUID-USER-ADMIN')
on conflict do nothing;
```

4. Buka `/login`, masuk, lalu akses `/admin`.
5. Untuk pencabutan akses, hapus membership lewat SQL Editor. API memeriksa ulang role pada setiap request.

Tidak ada signup publik dalam starter. Untuk demo admin tertutup, nonaktifkan public signup di Auth settings. Saat pindah domain, atur Site URL dan redirect allowlist Auth ke domain staging/produksi yang benar. Email/password langsung tidak membutuhkan OAuth callback; buat callback terpisah jika OAuth/magic-link ditambahkan.

## Pemeriksaan sebelum showcase

- Anonymous dapat membaca kategori dan produk published.
- Anonymous tidak dapat membaca produk draft atau menulis data.
- User biasa tidak dapat menaikkan dirinya menjadi admin atau menulis produk.
- User admin dapat mengakses `/api/admin/session`; user biasa mendapat 403, anonymous 401.
- Secret/service-role key tidak pernah dimasukkan ke `NUXT_PUBLIC_*`.
- Supabase Free dapat pause setelah satu minggu tidak aktif. Periksa dan resume project sebelum demo.

Sebelum transaksi produksi, tambahkan validasi write, rate limits, audit perubahan admin, dan pengujian otorisasi. Migration/RLS belum diuji pada instance Supabase di lingkungan penyiapan awal.

Referensi: https://supabase.com/pricing dan https://supabase.com/docs/guides/database/postgres/row-level-security
