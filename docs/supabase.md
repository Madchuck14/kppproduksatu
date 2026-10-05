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

Untuk demo admin tertutup, nonaktifkan public signup di Auth settings. Saat pindah domain, atur
Site URL dan redirect allowlist Auth ke domain staging/produksi yang benar. Email/password
langsung tidak membutuhkan OAuth callback; buat callback terpisah jika OAuth/magic-link ditambahkan.

## Pendaftaran akun katalog

Pendaftaran mandiri ditutup. Tombol Daftar tetap membuka `/register` dengan desain yang sama,
pilihan Sales/Editor dan dropdown jenjang, tetapi tombol submit dinonaktifkan dan tidak mengirim
kredensial. Endpoint `POST /api/auth/register` selalu mengembalikan 403. Pada Supabase Auth,
nonaktifkan **Allow new users to sign up** agar public key tidak dapat dipakai signup langsung.
Pertahankan **Confirm email**; provisioning administratif mengonfirmasi dua akun yang disetujui.

## Provisioning akun super

1. Jalankan `supabase/migrations/202610050001_account_access.sql` satu kali setelah migration katalog.
2. Isi `.env` lokal dengan `SUPABASE_SECRET_KEY` (Secret API key), empat variabel
   `SUPER_ACCOUNT_EDITOR_EMAIL`, `SUPER_ACCOUNT_EDITOR_PASSWORD`, `SUPER_ACCOUNT_SALES_EMAIL`, dan
   `SUPER_ACCOUNT_SALES_PASSWORD`. Tidak ada prefix `PUBLIC` untuk nilai administratif ini.
   Public URL dan public key tetap dibutuhkan. Email kedua akun harus berbeda dan password
   8–128 karakter. Jangan memasukkan kredensial nyata ke contoh env atau commit.
3. Jalankan `npm.cmd run provision:super-accounts -- --check` untuk validasi tanpa mutasi.
4. Jalankan `npm.cmd run provision:super-accounts` untuk membuat akun atau memperbarui akun
   pada dua email tersebut, termasuk password dan konfirmasi email. Tidak ada email undangan dikirim.
5. Script menetapkan `account_memberships.role` dan `is_super=true`. Editor mendapat empat row
   `editor_scopes` serta `admin_memberships` untuk katalog lama. Sales tidak mendapat scope Editor
   atau akses admin. Script menghapus membership admin/scope Editor milik email Sales yang ditentukan.
6. Script menguji login dan pembacaan role/scope memakai public key serta session setiap akun.
   Tidak ada email, password, key, atau token dicetak.

Hanya pengelola tepercaya melalui database owner atau key admin yang dapat memberikan role dan
scope. Metadata `requested_role` dari registrasi lama bukan sumber otorisasi. Untuk mencabut akun
super, cabut membership admin (Editor), membership akun, dan session Auth sesuai kebutuhan.
`GET /api/auth/session` memverifikasi session pada server. Login default Sales dan Editor menuju
landing page `/`; tujuan buku tervalidasi tetap didahulukan. Navigasi akun Editor menyediakan tautan Dashboard Editor.

## Dashboard Editor dan migration katalog

Jalankan `supabase/migrations/202610050002_editor_catalog.sql` satu kali melalui SQL Editor setelah
dua migration sebelumnya, sebelum menjalankan versi aplikasi dengan dashboard Editor.
Migration dibungkus transaksi; jika gagal, seluruh perubahan transaksi dibatalkan.

- `products.id` tetap UUID primary key. `book_code` menjadi business key unik kapital.
- Kode dan jenjang buku lama tetap NULL; Editor super melengkapinya melalui Edit.
- Buku baru wajib memiliki kode dan jenjang SD/SMP/SMA/SMK. Kode atau slug duplikat ditolak.
- Editor biasa memakai `editor_scopes`; Editor super mengakses semua jenjang.
- RLS produk dan Storage mengganti bypass `admin_memberships` lama. Admin lama tanpa role Editor
  tidak dapat menggunakan dashboard atau menulis buku. Berikan role melalui pengelola tepercaya.
- API dan Storage memakai sesi pengguna serta public key; key admin tidak diperlukan oleh runtime.

Rollback aplikasi: kembalikan aplikasi ke versi sebelum dashboard, lalu pertahankan kolom baru dan
kebijakan Editor. Versi lama dapat membaca kolom katalog lama; CRUD baru tidak lagi tersedia.
Jangan menghapus kolom, data buku, atau mengembalikan bypass admin untuk sekadar rollback tampilan.
Jika aplikasi lama memerlukan operasi tulis administratif, tinjau kebijakan aksesnya secara terpisah.

Verifikasi integrasi lokal: `node scripts/verify-editor-catalog.mjs`. Script memerlukan konfigurasi
lokal akun super dan key admin, membuat buku/akun Editor SD sementara, lalu membersihkannya.
Script menguji CRUD, SSR, pencarian, publikasi, unggah sampul, penolakan input/ukuran berkas,
batas scope melalui API dan RLS, penolakan Sales, serta identitas buku lama yang tetap utuh.
Jangan jadikan script ini bagian dari build/deploy Vercel. Gunakan project pengujian bila tersedia.

Script provisioning hanya alat lokal. Runtime Node/Cloudflare tidak memerlukan key admin atau
password akun dari `.env`. Hapus konfigurasi administratif dari environment deployment aplikasi.

## Pemeriksaan sebelum showcase

- Anonymous dapat membaca kategori dan produk published.
- Anonymous tidak dapat membaca produk draft atau menulis data.
- User biasa tidak dapat menaikkan dirinya menjadi admin atau menulis produk.
- User admin dapat mengakses `/api/admin/session`; user biasa mendapat 403, anonymous 401.
- Secret/service-role key tidak pernah dimasukkan ke `NUXT_PUBLIC_*`.
- Supabase Free dapat pause setelah satu minggu tidak aktif. Periksa dan resume project sebelum demo.

CRUD buku sudah memiliki validasi write dan pengujian otorisasi langsung pada Supabase untuk
Editor super, Editor SD, Sales, dan pengunjung anonim. Sebelum memperluas ke transaksi produksi,
tambahkan rate limits dan audit perubahan sesuai kebutuhan operasional.

Referensi: https://supabase.com/pricing dan https://supabase.com/docs/guides/database/postgres/row-level-security
