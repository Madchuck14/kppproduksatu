# Arsitektur

## Keputusan awal

Satu repo Nuxt 4 + TypeScript. Storefront memakai SSR, backend memakai Nitro bawaan, admin custom memakai Nuxt UI. Tailwind dipakai untuk desain storefront. Supabase menyediakan PostgreSQL, Auth, dan Storage. Tidak ada ORM atau backend Express terpisah.

```text
Browser → Nuxt pages → Nitro API → product repository → Supabase PostgreSQL
        → Supabase Auth (session cookie)
Gambar  → Supabase Storage public product-images bucket
```

Katalog sekarang khusus buku sesuai PRD awal, namun penamaan entitas `products` mempermudah perluasan. Harga integer rupiah. Varian dan stok ditambahkan ketika scope transaksi disepakati.

## Beranda dan pencarian katalog

Beranda menampilkan pencarian judul, buku pilihan dari flag `featured`, dan pengenalan jenjang SD,
SMP, SMA, serta SMK. Buku pilihan belum memakai statistik akses. Kartu jenjang menuju filter katalog
`/products?level=SD` dan seterusnya. Migration Editor menambahkan kode buku serta jenjang tanpa
mengubah UUID atau referensi lama; kode buku menjadi business key unik, UUID tetap primary key.

Pencarian beranda menuju `/products?q=...`. Halaman katalog membaca parameter `q` pada SSR dan
menyinkronkan pencarian dan jenjang dengan URL, termasuk navigasi kembali/maju. API mencari judul,
kode buku, atau penulis. Mode demo ditandai pada bagian buku pilihan beranda.

## Detail buku dan tujuan login

Halaman detail tetap publik dan memakai API SSR yang sama. Sampul, judul, harga, penulis,
kategori, deskripsi, kode buku, dan jenjang tersedia. Buku lama dengan identitas kosong ditandai
belum tersedia sampai dilengkapi Editor super. Product Knowledge, flyer, serta dummy ditampilkan sebagai konten
yang memerlukan login, dengan keterangan bahwa berkas belum tersedia.

Pengunjung anonim dapat membuka penjelasan akses lalu menuju login dengan parameter `returnTo`.
Setelah login berhasil, tujuan dikembalikan ke halaman buku dan bagian konten yang dipilih.
Tujuan divalidasi dengan schema yang hanya menerima route detail buku lokal dan anchor konten
yang dikenal, serta `/products`. Login tanpa tujuan mengarahkan semua akun ke landing page `/`.
Login dari registrasi tanpa tujuan buku kembali ke katalog publik `/products`.
Indikator akun pada UI tidak memberikan otorisasi berkas. Belum ada endpoint unduhan atau berkas
privat; implementasinya membutuhkan storage privat dan pemeriksaan `auth.getUser()` serta hak
akses di server. Role Sales/Editor kini dibaca dari membership tepercaya, tetapi materi privat
belum tersedia. CRUD katalog per jenjang tersedia pada dashboard Editor.

Halaman `/login` memakai formulir email/kata sandi dengan validasi Zod, tombol tampil/sembunyikan
kata sandi, status pemrosesan, dan pesan kegagalan. Konfigurasi demo menonaktifkan formulir dan
menawarkan katalog publik. Akun yang sudah masuk dapat melanjutkan atau keluar dari halaman ini.
Navigasi utama menampilkan Login untuk pengunjung dan Keluar untuk pengguna yang sudah masuk.
Logout yang berhasil dari navigasi, halaman login, atau admin mengarahkan pengguna ke landing page `/`.
Tombol Daftar menuju `/register` dan mempertahankan tujuan buku yang tervalidasi melalui `returnTo`.
Tidak ada pilihan role pada formulir login dan perubahan tampilan ini tidak menambah hak akses.

Pendaftaran mandiri dinonaktifkan. `/register` tetap menampilkan formulir serta pilihan Sales/Editor
dan dropdown jenjang Editor untuk mempertahankan desain. Tombol submit dinonaktifkan, handler tidak
mengirim kredensial, dan `POST /api/auth/register` selalu mengembalikan 403 sebelum membaca body.
Supabase Auth juga harus menonaktifkan Allow new users to sign up untuk menutup signup langsung.

Migration `202610050001_account_access.sql` menambahkan `account_memberships` (role dan is_super)
serta `editor_scopes` (SD/SMP/SMA/SMK). RLS memperbolehkan akun membaca membership miliknya sendiri;
Editor hanya membaca scope sendiri. Anonymous dan akun authenticated tidak dapat menulis tabel
akses. `GET /api/auth/session` memverifikasi `auth.getUser()` dan membaca kedua tabel, tanpa
mempercayai metadata pengguna. Fungsi database `has_editor_scope(level)` memeriksa role dan scope;
fungsi ini disiapkan untuk kebijakan katalog per jenjang ketika kolom jenjang produk tersedia.

Editor super memiliki akses seluruh jenjang dan dapat melengkapi buku lama tanpa jenjang.
Editor biasa hanya dapat mengelola jenjang pada `editor_scopes`; Sales tidak dapat mengakses dashboard.
Migration Editor mengganti bypass admin lama pada produk dan Storage dengan kebijakan Editor. Pemberian akses Editor
hanya melalui pengelola tepercaya; belum ada alur approval mandiri pada aplikasi.

`scripts/provision-super-accounts.mjs` adalah alat setup Node lokal yang membuat atau memperbarui
dua akun dari `.env`, mengonfirmasi email, serta menulis membership/scope melalui key admin.
Script tidak diimpor ke aplikasi dan tidak mencetak email, password, key, atau token. Aplikasi
tetap memakai public key. Menjalankan ulang script memperbarui password dua email yang ditentukan.

## Konfigurasi

- `NUXT_CATALOG_SOURCE`: `demo` atau `supabase`; pemilihan eksplisit, tidak ada fallback saat database gagal.
- `NUXT_PUBLIC_SITE_NAME`, `NUXT_PUBLIC_SITE_URL`: nama toko dan URL environment.
- `NUXT_PUBLIC_SUPABASE_URL`, `NUXT_PUBLIC_SUPABASE_KEY`: URL dan public publishable/anon key. Supabase module membuat runtime config `public.supabase`.
- Placeholder URL/key bawaan hanya agar starter bisa render tanpa credentials; bukan akun Supabase.

Key admin hanya diperlukan untuk script provisioning lokal, bukan runtime aplikasi. Simpan
`SUPABASE_SECRET_KEY` dan variabel `SUPER_ACCOUNT_*` di `.env` yang di-ignore, tanpa prefix `PUBLIC`.

## Boundary dan akses

Query katalog berada di `server/repositories/products.ts`. Endpoint menerima input yang divalidasi Zod. Katalog memakai anonymous Supabase client dan selalu membatasi ke `published=true`; RLS juga menerapkan pembatasan ini. Hasil list saat ini dibatasi 60 produk; pagination adalah pekerjaan fase berikutnya.

Session diverifikasi dengan `auth.getUser()` pada server. Endpoint lama `/api/admin/session`
tetap memakai `requireAdmin`. Dashboard dan endpoint buku memakai `requireEditor` serta membership
tepercaya dan scope, bukan metadata pengguna. RLS memeriksa jenjang asal dan tujuan perubahan.
Daftar Editor tidak mencakup buku di luar scope meskipun buku published dapat dibaca publik.

Dashboard `/admin` menyediakan ringkasan, daftar berpaginasi 12 buku, pencarian judul/kode/penulis,
filter jenjang/status, tambah/edit buku, publikasi, dan konfirmasi hapus dengan mengetik judul.
Endpoint `/api/admin/books` memakai GET/POST; `/api/admin/books/:id` memakai GET/PUT/DELETE.
`POST /api/admin/books/:id/image` menerima bytes gambar dengan Content-Type yang sesuai.
Semua input metadata divalidasi Zod; duplicate kode atau slug mengembalikan 409.
Kode disimpan kapital. Buku lama tetap memiliki kode/jenjang NULL sampai dilengkapi Editor super.
Form menyimpan metadata sebelum sampul; jika unggahan gagal, UI memberi tahu bahwa metadata telah
tersimpan dan dapat mengulang unggahan tanpa membuat buku duplikat.

Image disimpan sebagai object path pada database, lalu URL dibuat lewat helper storage. Bucket hanya
untuk gambar publik, termasuk sampul draf; jangan gunakan untuk dokumen pribadi. Upload dibatasi
2 MB saat membaca stream, dengan allowlist MIME serta pemeriksaan signature JPG/PNG/WebP/AVIF.
Object baru memakai `books/{product UUID}/{random UUID}.{extension}`; RLS Storage memeriksa akses
ke buku tersebut. Tidak ada overwrite object. File lama tidak otomatis dihapus saat sampul diganti
atau buku dihapus; pembersihan aset tak terpakai dilakukan terpisah oleh pengelola.

## Portabilitas

Staging menggunakan Cloudflare Workers. Produksi membangun target Node dan menjalankannya lewat Docker. Hindari ketergantungan Cloudflare D1/KV/R2 dan API Node-only di logika aplikasi yang harus berjalan pada kedua target.

Client dapat mempertahankan managed Supabase atau menjalankan self-hosted Supabase. PostgreSQL biasa tidak menyediakan API/Auth/Storage Supabase: repository, auth, dan storage perlu adapter pengganti jika itu target mereka. Wrapper membantu perubahan tersebut, tetapi tidak menghilangkan pekerjaan migrasi.

## Referensi resmi

- https://nuxt.com/docs/4.x/getting-started/server
- https://nuxt.com/docs/4.x/getting-started/deployment
- https://supabase.nuxtjs.org/
- https://ui.nuxt.com/
- https://supabase.com/docs/guides/self-hosting/docker
