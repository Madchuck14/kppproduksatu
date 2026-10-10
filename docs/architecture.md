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

Beranda mengikuti desain Figma dengan hero Grow with English, logo Erlangga dan Phibeta,
pencarian, maksimal empat buku terbaru dari API publik, dan empat kartu jenjang sekolah.
Layout desktop mengacu node Figma `39:21` pada ukuran 1440 px: hero 1344×420 px, rak buku
1280 px, dan grid jenjang empat kolom (dua kolom pada mobile). Variable font Lora dan Inter berformat WOFF2 Latin
disimpan lokal di `public/fonts` dengan lisensi OFL; font landing tidak mengubah tipografi
halaman lainnya. Aset hero, logo, dan ikon berasal dari Figma dan disimpan lokal. Layout
beradaptasi untuk tablet dan mobile.
Sampul, judul, penulis, serta jenjang berasal dari katalog; jumlah kartu mengikuti data yang tersedia.
Judul panjang dipotong satu baris pada rak landing; judul lengkap tersedia pada tautan dan detail.
Harga tetap tersedia di katalog dan detail. Tombol favorit landing berbentuk ikon 28 px di sudut
sampul; navigasi menyediakan ikon favorit beserta jumlah buku milik akun aktif.
Daftar Supabase sudah diurutkan berdasarkan `created_at` terbaru. Mode demo memakai urutan fixture.
Belum ada statistik popularitas. Favorit pribadi dijelaskan di bagian Favorit buku.
Aset desain disimpan lokal di `public/images/landing`,
logo di `public/images/erlangga.png` dan `public/images/phibeta.png`.

Pencarian beranda membawa `q` dan filter jenjang SD/SMP/SMA/SMK ke URL `/products`.
Pilihan mata pelajaran memakai filter `subject` yang terpisah dari teks pencarian `q`;
judul dan mapel dapat difilter bersamaan. Kartu kategori dan tautan footer memakai filter
`level` SD/SMP/SMA/SMK yang cocok persis dengan `products.education_level`.
Halaman katalog membaca parameter pada SSR dan menyinkronkannya dengan URL, termasuk navigasi
kembali/maju. API mencari judul, kode buku, penulis, atau mata pelajaran. Mode demo ditandai pada bagian buku terbaru.
`GET /api/catalog/level-counts` mengembalikan jumlah buku published per jenjang sekolah untuk
landing. Query count tidak dibatasi 60 row sehingga jumlah tetap sesuai dengan filter jenjang
pada katalog. Angka contoh desain tidak dipakai sebagai data produksi. Bila count gagal, caption
menampilkan “Jelajahi buku”; error katalog tetap ditampilkan dan tidak diganti fixture.
Footer landing mengarahkan tautan informasi penerbit ke situs eksternal; tidak menambahkan halaman
Blog atau Tentang pada aplikasi ini. Bagian kategori berjudul “Jenjang Sekolah”.
Endpoint `GET /api/catalog/subject-counts` lama tetap tersedia untuk kompatibilitas konsumen API.
Migration Editor menambahkan kode buku serta jenjang tanpa mengubah UUID atau referensi lama;
kode buku menjadi business key unik, UUID tetap primary key.

## Detail buku dan tujuan login

Detail buku mengikuti Figma `37:7908`: breadcrumb, sampul 480×504 px, ringkasan,
tabel identitas, tiga kolom informasi, dan maksimal empat buku terkait. Header/footer,
font lokal Lora/Inter, kartu katalog, serta kontrol favorit memakai komponen yang ada.
Layout menjadi satu kolom pada mobile. Sampul dan informasi memakai data API SSR;
kurikulum belum ditampilkan karena belum tersimpan, sementara ISBN, manfaat, dan
keunggulan ditandai belum tersedia. Isi buku menggunakan deskripsi yang tersedia.
Bagian Materi Promosi mengikuti ekspor lokal Figma `37:8192` dan hanya ditampilkan
kepada pengguna yang sudah login. Panel hijau berisi kartu Flyer Promosi, Presentasi Buku,
dan Buku Dummy, dengan pratinjau, status berkas, serta tombol Unduh PDF dan Lihat.
Aset flyer dan ikon unduh disimpan di `public/images/book-detail`; pratinjau dummy memakai
sampul katalog. Semua materi tersimpan sebagai PDF, sehingga label PPT/PPTX contoh desain
disesuaikan dengan berkas nyata. Jumlah halaman dan ukuran contoh tidak ditampilkan karena
metadata tersebut belum tersedia. Endpoint materi tetap publik dengan penampil PDF yang sudah ada.
Pratinjau dummy mengikuti ekspor `figmatocode/previewdummy`: dialog putih beradius 20 px,
toolbar nama PDF, tombol tutup/unduh, zoom 50–200%, area baca abu-abu, dan navigasi halaman
mengambang. Isi serta jumlah halaman berasal dari PDF nyata; pembalikan halaman memakai
StPageFlip yang sudah tersedia. Zoom dapat diganti lewat tombol atau pilihan persentase;
halaman dapat digeser saat diperbesar. Tombol panah keyboard, Escape, dan fokus dialog
tetap berfungsi. Aset toolbar disimpan lokal di `public/images/dummy-preview`.
Flyer dan Presentasi Buku memakai dialog dan viewer yang sama, termasuk toolbar,
zoom, unduhan, serta navigasi halaman. Nama berkas dan tujuan unduhan mengikuti jenis
materi yang dipilih. Presentasi PPT/PPTX lama menampilkan penjelasan format dan tetap
menyediakan unduhan; pratinjau memerlukan berkas PDF.
Favorit anonim menawarkan login
dengan tujuan kembali ke buku. Tombol pemesanan menuju kontak pada footer beranda.

Halaman detail tetap publik dan memakai API SSR yang sama. Sampul, judul, harga, penulis,
deskripsi, kode buku, dan jenjang tersedia. Buku lama dengan identitas kosong ditandai
belum tersedia sampai dilengkapi Editor super. Product Knowledge, flyer, serta dummy untuk buku
published dapat dibuka publik tanpa login.

Pengunjung anonim dapat membuka penjelasan akses lalu menuju login dengan parameter `returnTo`.
Setelah login berhasil, tujuan dikembalikan ke halaman buku dan bagian konten yang dipilih.
Tujuan divalidasi dengan schema yang hanya menerima route detail buku lokal dan anchor konten
yang dikenal, serta `/products` dan `/favorites`. Login tanpa tujuan mengarahkan semua akun ke landing page `/`.
Login dari registrasi tanpa tujuan buku kembali ke katalog publik `/products`.
Endpoint status dan unduhan materi bersifat publik untuk buku published. Endpoint membuat signed URL
berumur 60 detik tanpa membuka bucket secara langsung. Dashboard Editor mengunggah flyer, Dummy
Buku, dan Product Knowledge berformat PDF ke bucket privat `book-materials`. Endpoint upload tetap
memeriksa session, scope jenjang, MIME, signature, dan ukuran.
CRUD katalog per jenjang tersedia pada dashboard Editor.

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

Query katalog berada di `server/repositories/products.ts`. Endpoint menerima input yang divalidasi Zod. Katalog memakai anonymous Supabase client dan selalu membatasi ke `published=true`; RLS juga menerapkan pembatasan ini. Request tanpa `page` mempertahankan batas 60 produk Supabase. Request berpaginasi dapat menjangkau seluruh hasil.

Katalog hanya menjual buku pendidikan. UI, API, dan form Editor tidak memakai kategori produk.
Tabel `categories` serta `products.category_id` lama dipertahankan sementara untuk kompatibilitas
schema dan rollback, tetapi tidak dibaca atau ditulis aplikasi.

Session diverifikasi dengan `auth.getUser()` pada server. Endpoint lama `/api/admin/session`
tetap memakai `requireAdmin`. Dashboard dan endpoint buku memakai `requireEditor` serta membership
tepercaya dan scope, bukan metadata pengguna. RLS memeriksa jenjang asal dan tujuan perubahan.
Daftar Editor tidak mencakup buku di luar scope meskipun buku published dapat dibaca publik.

Dashboard `/admin` menyediakan ringkasan, daftar berpaginasi 12 buku, pencarian judul/kode/penulis,
filter jenjang/status, tambah/edit buku, publikasi, dan konfirmasi hapus dengan mengetik judul.
Tampilan dashboard mengikuti ekspor `figmatocode/dashboard`, memakai header/footer dan font
Lora/Inter yang sama dengan katalog. Panel akses hijau muda, empat kartu statistik, serta
form filter memakai data dan scope akun nyata. Tabel HTML dengan tujuh kolom tetap menyelaraskan
header dan baris yang salah diterjemahkan Codia; kolom Materi menunjukkan ketersediaan Flyer,
Presentasi, dan Dummy dengan indikator serta teks aksesibel. Pada layar sempit hanya tabel
yang bergeser horizontal; panel dan filter mengikuti lebar layar. Konfirmasi hapus tetap
memerlukan judul yang cocok persis dan tidak berubah menjadi tindakan langsung.
Endpoint `/api/admin/books` memakai GET/POST; `/api/admin/books/:id` memakai GET/PUT/DELETE.
`POST /api/admin/books/:id/image` menerima bytes gambar dengan Content-Type yang sesuai.
Semua input metadata divalidasi Zod; duplicate kode atau slug mengembalikan 409.
Kode buku baru hanya menerima 1–50 digit. Buku lama tetap memiliki kode/jenjang NULL sampai
dilengkapi Editor super. Form menyimpan metadata, termasuk tahun publikasi opsional, sebelum sampul
dan materi privat. Alamat halaman dibuat server-side dari judul dan tidak dapat diubah langsung.
Judul diperiksa ke database tanpa membedakan kapital; unique index mengamankan request bersamaan.
Jika unggahan gagal, UI dapat mengulang unggahan tanpa membuat buku duplikat.

Image disimpan sebagai object path pada database, lalu URL dibuat lewat helper storage. Bucket hanya
untuk gambar publik, termasuk sampul draf; jangan gunakan untuk dokumen pribadi. Upload dibatasi
2 MB saat membaca stream, dengan allowlist MIME serta pemeriksaan signature JPG/PNG/WebP/AVIF.
Object baru memakai `books/{product UUID}/{random UUID}.{extension}`; RLS Storage memeriksa akses
ke buku tersebut. Tidak ada overwrite object. File lama tidak otomatis dihapus saat sampul diganti
atau buku dihapus; pembersihan aset tak terpakai dilakukan terpisah oleh pengelola.

Flyer dan Dummy Buku dibatasi PDF 20 MB. Product Knowledge dibatasi PDF 50 MB. Flyer dan Product
Knowledge dirender oleh PDF.js ke canvas dalam dialog aplikasi. Dummy Buku memakai PDF.js dan
StPageFlip (`page-flip`) dalam popup flipbook: dua halaman pada layar lebar, satu halaman pada layar
sempit, dengan sampul, swipe/drag, tombol navigasi, dan panah keyboard. PDF diambil sekali sebelum
halaman disiapkan agar navigasi tidak bergantung pada masa berlaku signed URL. Penampil hanya
dijalankan di browser dan tidak mengubah schema database. Object path disimpan pada produk dan
tidak dikirim melalui API katalog publik. Penggantian materi memakai path unik baru; file lama tidak
otomatis dihapus.

## Portabilitas

Staging menggunakan Cloudflare Workers. Produksi membangun target Node dan menjalankannya lewat Docker. Hindari ketergantungan Cloudflare D1/KV/R2 dan API Node-only di logika aplikasi yang harus berjalan pada kedua target.

Client dapat mempertahankan managed Supabase atau menjalankan self-hosted Supabase. PostgreSQL biasa tidak menyediakan API/Auth/Storage Supabase: repository, auth, dan storage perlu adapter pengganti jika itu target mereka. Wrapper membantu perubahan tersebut, tetapi tidak menghilangkan pekerjaan migrasi.

## Referensi resmi

- https://nuxt.com/docs/4.x/getting-started/server
- https://nuxt.com/docs/4.x/getting-started/deployment
- https://supabase.nuxtjs.org/
- https://ui.nuxt.com/
- https://supabase.com/docs/guides/self-hosting/docker

## Kategori mata pelajaran

Daftar kategori berasal dari `daftarmapel.md`, disalin secara eksplisit ke
`shared/utils/book-subjects.ts`: SD 9, SMP 11, SMA 19 mata pelajaran. SMK memakai 19 mata pelajaran yang sama dengan SMA.
Setiap buku menyimpan satu mata pelajaran opsional pada `products.subject`; buku lama tetap NULL.
Form Editor menampilkan pilihan berdasarkan jenjang dan mengosongkan pilihan yang tidak cocok
ketika jenjang berubah. Validasi server Zod dan CHECK database menolak mapel di luar jenjang.
RLS published-only dan scope jenjang Editor tetap berlaku tanpa perubahan.
Dashboard menampilkan kategori dan memfilter berdasarkan parameter URL `subject`.
Detail publik menampilkan mata pelajaran atau “Belum ditentukan”.

Migration `202610060005_book_subjects.sql` **belum dijalankan**. Terapkan pada sesi berikutnya
sebelum menjalankan versi aplikasi ini dengan Supabase. Query katalog dan Editor membutuhkan
kolom baru; database sebelum migration akan mengembalikan error, tanpa fallback ke demo.
Urutan rollout: backup database, jalankan migration, verifikasi buku lama tetap ada dan subject NULL,
lalu deploy aplikasi. Deploy aplikasi lama untuk rollback; biarkan kolom tambahan agar kategori yang
sudah disimpan tetap utuh. Jangan drop kolom subject saat rollback aplikasi.
Input autocomplete mata pelajaran pada pencarian landing dan katalog memakai daftar lengkap
sesuai jenjang. Tidak ada tombol dropdown; saran hanya muncul setelah mengetik, bukan saat input
diklik atau mendapat fokus. Mengetik menyaring saran dan pemilihan memakai nama mapel terdaftar.
Mengosongkan input mengembalikan pencarian ke semua mapel. Pilihan dapat dipilih dengan keyboard.
Tanpa jenjang,
semua nama unik ditampilkan. Pilihan yang tidak cocok dihapus ketika jenjang berubah. Filter mapel
dikirim sebagai parameter `subject` dan dicocokkan persis dengan `products.subject`, terpisah dari `q`.
Empat kartu kategori landing memakai filter jenjang sekolah, terpisah dari filter mata pelajaran.

Terapkan migration `202610070002_smk_subjects.sql` setelah migration mapel awal dan sebelum
memakai mapel SMK. Migration memperluas CHECK agar SMK menerima daftar SMA, tanpa mengubah
data atau RLS. Migration ini belum dijalankan pada database live dalam tugas ini.
Rollback aplikasi dapat memakai versi sebelumnya; biarkan CHECK yang diperluas dan kolom subject
agar mapel SMK yang sudah disimpan tidak hilang. Jangan mengembalikan CHECK lama sebelum
memastikan tidak ada buku SMK dengan subject terisi.

## Favorit buku

Semua user terautentikasi dapat menyimpan favorit, termasuk Sales, Editor, dan akun tanpa
membership. Favorit tidak memberikan hak Editor. Pengunjung anonim mendapat penjelasan login
dan tautan kembali ke detail buku atau `/favorites`; penyimpanan dilakukan setelah pengguna
memilih Favorit saat sudah login. Mode demo tidak menyimpan favorit.

`product_favorites` menyimpan pasangan UUID user/produk unik beserta waktu penyimpanan. UUID
produk tetap primary key; kode buku tetap business key unik dan dapat dicari. FK menghapus favorit
ketika user atau buku dihapus. RLS hanya mengizinkan membaca, menambah, dan menghapus favorit
sendiri; insert memerlukan buku published. Tidak ada izin UPDATE untuk authenticated.

`GET /api/favorites` menerima `q`, `level`, dan `page`, mengembalikan `ownerId`, `products`,
`total`, `page`, dan `pageSize` (24). Hasil diurutkan dari favorit terbaru. Pencarian mencakup judul,
kode buku, dan penulis. `GET /api/favorites/ids` memuat UUID favorit published untuk status tombol,
dengan pembacaan bertahap agar batas response Supabase tidak memotong status buku lama.
`PUT /api/favorites/:id` dan `DELETE /api/favorites/:id` bersifat idempotent. Server memperoleh
identitas pemilik melalui `auth.getUser()`, tanpa menerima user ID dari klien. Query berada di
`server/repositories/favorites.ts` dan memakai sesi user/public key; key admin tidak dipakai runtime.

Daftar dan status tombol selalu membatasi produk ke published, termasuk untuk Editor yang dapat
membaca draft melalui RLS produk. Favorit buku yang di-unpublish disembunyikan dan muncul kembali
saat republish; favoritnya tetap tersimpan. State browser diikat ke UUID akun, sehingga logout atau
pergantian akun tidak menampilkan koleksi akun sebelumnya. Halaman katalog dan favorit memakai
`Cache-Control: no-store` karena SSR/payload berisi status favorit pribadi.

Deployment memerlukan migration `202610070001_product_favorites.sql`; lihat panduan Supabase.

## Tampilan tambah buku

Halaman `/admin/books/new` mengikuti Figma `97:5388`, dengan kartu Identitas buku,
Klasifikasi, Deskripsi buku, Sampul buku, Materi privat, dan Publikasi. Desktop memakai
kontainer 1280 px dengan padding 32 px, kolom kanan 380 px, dan jarak antarkolom 24 px.
Font Lora/Inter, logo, header/footer, dan aset ikon lokal dipakai kembali. Halaman edit memakai layout dan kartu yang sama, dengan metadata, sampul, serta status materi
yang sudah tersimpan. Penulis, tahun, kelas, dan mapel tetap opsional saat edit; deskripsi lama
tetap menerima 20.000 karakter. Guard Editor dan scope jenjang tidak berubah.

ISBN, kurikulum, isi buku, manfaat, dan maksimal enam keunggulan merupakan state UI sementara.
Kolom tersebut belum dikirim ke API atau disimpan ke database. Jika salah satunya diisi,
Simpan buku menampilkan pemberitahuan dan tidak mengirim request agar data tidak dibuang
diam-diam. Isian hilang ketika meninggalkan halaman. Kolom lama masih memakai kontrak API
yang ada. Form tambah menandai penulis, tahun terbit, kelas, dan mata pelajaran wajib sesuai
desain; kurikulum masih pratinjau dan belum divalidasi sebagai kolom wajib saat menyimpan.
Deskripsi singkat memakai `description` yang sudah tersedia, dibatasi 300 karakter pada UI
tambah. Edit mempertahankan batas 20.000 karakter. Isi buku dan manfaat memiliki penghitung 2.000 dan 1.000 karakter.

Migrasi dan integrasi penyimpanan kolom baru ditunda ke sesi berikutnya. Sesi ini tidak
mengubah schema, repository, API, RLS, atau kebijakan akses materi. Teks materi privat pada
desain belum membuktikan pembatasan akses login pada backend; kebijakan akses yang berjalan
tetap dijelaskan pada bagian Detail buku dan tujuan login.

## Katalog publik dan kelas buku

Halaman `/products` mengikuti Figma `19:89`: header/footer bersama landing, breadcrumb,
pencarian, sidebar jenjang/kelas/mata pelajaran, grid tiga kolom, urutan, dan pagination.
Desktop memakai kontainer 1280 px, padding 32 px, sidebar 250 px, gap 44 px, dan sampul
persegi 290 px pada viewport 1440 px. Font Lora/Inter serta komponen logo dan favorit
menggunakan aset lokal. Ikon katalog berasal dari Figma di `public/images/catalog`.
Sampul, judul, penulis, kelas, dan jumlah hasil memakai data katalog, bukan contoh Figma.
Label tetap berbahasa Indonesia; jenjang SMK dan footer sekolah mengikuti kebutuhan produk.

Pencarian dengan `q` mengikuti Figma `46:9061`: breadcrumb Pencarian, judul
`Hasil untuk “kata kunci”`, jumlah hasil aktual, dan chip kata kunci di atas grid.
Tombol hapus pada chip menghapus `q`, kembali ke halaman pertama, mempertahankan filter
jenjang/kelas/mapel/urutan, serta mengembalikan fokus ke input pencarian. Browser back/forward
memulihkan kata kunci, judul, chip, dan hasil. Loading/error tidak menampilkan jumlah keberhasilan palsu.

`GET /api/products` menerima `q`, `level`, `grade`, `subject` (satu atau berulang), `sort`
(`newest`, `title-asc`, `title-desc`), `page`, dan `pageSize` (15/30/60). `grade` memerlukan
jenjang yang sesuai. Beberapa mata pelajaran digabung dengan OR, sedangkan jenjang, kelas,
dan pencarian digabung dengan AND. Semua state tersimpan di URL dan mengikuti back/forward.
Filter dan urutan mengembalikan halaman pertama. Halaman di luar hasil dijepit ke halaman terakhir.

Dengan `page`, respons menambah `total`, `page`, `pageSize`, dan `subjectCounts`. Jumlah mapel
mengikuti pencarian/jenjang/kelas sebelum filter mapel, membaca metadata subject bertahap
1000 row tanpa batas 60 produk. Urutan hasil memiliki UUID sebagai penentu urutan kedua.
Request lama tanpa `page` mempertahankan kontrak `products`/`source`.

Migration `202610090001_book_grades.sql` menambah `products.grade` nullable; SD 1–6, SMP 7–9,
SMA/SMK 10–12. Editor mengisi kelas opsional; pergantian jenjang mengosongkan kelas yang
sudah tidak cocok. Zod dan CHECK database memvalidasi pasangan jenjang/kelas. Tidak ada
perubahan UUID, kode buku, membership, atau RLS. Terapkan migration sebelum deploy aplikasi.

`node scripts/verify-catalog.mjs` memeriksa validasi kelas, kompatibilitas input lama,
pagination melewati 60 buku, filter gabungan, urutan, facet, dan pembatasan published pada
query. Pengujian repository menggunakan fixture serta query stub; bukan bukti live RLS.

## Halaman kontak

Route publik `/contact` mengikuti ekspor `figmatocode/kontak`: kartu saluran komunikasi,
ilustrasi lokasi kantor pusat, tautan Google Maps, dan jam operasional. Header/footer bersama
menghubungkan Kontak dari dashboard dan halaman lainnya. Ikon serta lapisan peta desain
disimpan lokal di `public/images/contact`; ilustrasi bukan peta navigasi interaktif.
Alamat, telepon (021) 8717006, fax (021) 87794609, hotline 1500-885, dan WhatsApp
08191-1500-885 mengikuti [kontak kantor pusat resmi](https://www2.erlangga.co.id/kontak/kantor-pusat.html).
Email info@erlangga.co.id mengikuti [situs Erlangga saat ini](https://erlangga.co.id/).
Tautan email, telepon, hotline, dan WhatsApp memakai tujuan nyata. Jam operasional masih
mengikuti desain dan belum dikonfirmasi sumber resmi. Halaman tidak mengirim pesan atau menyimpan data.
