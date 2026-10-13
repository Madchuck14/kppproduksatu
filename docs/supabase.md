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

## Tahun publikasi dan materi privat

Jalankan `supabase/migrations/202610060001_book_publication_materials.sql` setelah migration Editor.
Migration menambah tahun publikasi, object path tiga materi privat, aturan kode buku numerik, bucket
privat `book-materials`, serta kebijakan upload Editor sesuai scope jenjang. Constraint kode baru
dibuat `NOT VALID`: data lama berkode nonnumerik tetap terbaca, tetapi harus diperbaiki saat row
tersebut diperbarui. Jangan jalankan aplikasi baru dalam mode Supabase sebelum migration diterapkan.

Flyer baru menerima PPT/PPTX maksimal 20 MB; Dummy Buku menerima PDF maksimal 20 MB.
Product Knowledge menerima PDF maksimal 50 MB. Bucket tidak memiliki URL publik permanen.
Setelah migration preview flyer terbaru, materi published hanya dapat dibuka setelah login
lewat endpoint server yang membuat signed URL berumur 60 detik. Product Knowledge PPT/PPTX lama harus
diunggah ulang sebagai PDF agar dapat dirender dalam dialog aplikasi.

Jalankan `supabase/migrations/202610060002_unique_book_title.sql` setelah migration materi privat.
Migration berhenti tanpa perubahan bila menemukan judul duplikat setelah spasi tepi dan kapital
dinormalisasi. Ubah judul duplikat lebih dahulu, lalu jalankan ulang migration. Unique index ini
mencegah dua request bersamaan membuat nama buku yang sama.

Jika migration akses akun pernah dijalankan, lanjutkan dengan
`supabase/migrations/202610060004_public_book_material_access.sql`. Migration mengganti kebijakan
baca menjadi publik hanya untuk materi milik buku published. Ini merupakan langkah historis;
migration `202610130004_flyer_slide_previews.sql` berikutnya menggantinya dengan akses authenticated.
Bucket tetap privat; object path harus sama dengan path yang tersimpan pada row produk.

## Preview flyer PowerPoint

Terapkan `supabase/migrations/202610130004_flyer_slide_previews.sql` setelah migration materi
sebelumnya, sebelum deploy aplikasi. Migration transaksional dapat diulang dan menambah
`products.flyer_slide_paths` sebagai daftar berurutan path PNG/JPG privat. UUID, flyer PDF lama,
dan materi lain tetap utuh; tidak ada konversi otomatis atau penghapusan file.

Migration memperluas kebijakan upload Editor untuk folder `flyer-slides`, memeriksa scope
jenjang yang sama, dan mengganti pembacaan materi anonim dengan authenticated untuk seluruh
materi. Hanya file yang terdaftar pada buku published dapat dibaca Sales/pengguna login;
Editor tetap dapat mengelola materi dalam scope. Signed URL yang sudah terbit tetap berlaku
sampai kedaluwarsa, maksimal 60 detik untuk URL yang dibuat aplikasi.

Editor memilih PPT/PPTX dan gambar hasil ekspor PNG/JPG: maksimal 20 slide, 2 MB per gambar.
Form menampilkan urutan numerik nama file dan tombol Naik/Turun. PPT/PPTX maksimal 20 MB;
upload baru wajib disertai gambar pada form. Endpoint `POST /api/admin/books/:id/flyer-slides`
menerima multipart dengan field `slides` berulang sesuai urutan. Total request dibatasi 41 MB;
set preview diganti hanya setelah semua file berhasil diunggah. File PPT baru mengosongkan
preview lama sehingga kegagalan upload gambar tidak menampilkan slide dari PPT sebelumnya.
File lama yang tidak terpakai tetap memerlukan pembersihan operasional terpisah.

Urutan rollout: backup dan catat UUID/jumlah buku, jalankan migration, verifikasi data lama,
lalu deploy aplikasi. Pada project pengujian periksa upload PPT/PPTX dan gambar, urutan setelah
reload, zoom/fullscreen, nama/format unduhan, penolakan gambar palsu/lebih dari batas, akses
anonim ditolak, Sales dapat membaca published, draft ditolak, serta Editor di luar scope ditolak.
Periksa RLS Storage langsung untuk original dan slide; API saja tidak membuktikan kebijakan DB.

Rollback memakai aplikasi sebelumnya dan mempertahankan kolom/data/policy privat. Versi lama
yang meminta signed URL melalui client anonim akan gagal membuka materi; jangan membuka kembali
akses anonim sebagai rollback. Sesuaikan pembacaan versi rollback agar memakai session pengguna.
Migration ini belum dijalankan oleh agent pada Supabase live.

Verifikasi tanpa database: `node scripts/verify-flyer.mjs` menguji validasi format dan alur
preview/unduhan dengan stub repository/Storage. `node scripts/verify-flyer-smoke.mjs` memakai
server lokal di port 3100 (ubah lewat `FLYER_TEST_BASE_URL`) untuk memeriksa SSR, route katalog,
login, dan penolakan akses materi/admin anonim. Keduanya tidak membuktikan Auth/RLS/upload live
atau interaksi browser.

## Pemeriksaan sebelum showcase

- Anonymous dapat membaca produk published.
- Anonymous tidak dapat membaca produk draft atau menulis data.
- User biasa tidak dapat menaikkan dirinya menjadi admin atau menulis produk.
- User admin dapat mengakses `/api/admin/session`; user biasa mendapat 403, anonymous 401.
- Secret/service-role key tidak pernah dimasukkan ke `NUXT_PUBLIC_*`.
- Supabase Free dapat pause setelah satu minggu tidak aktif. Periksa dan resume project sebelum demo.

CRUD buku sudah memiliki validasi write dan pengujian otorisasi langsung pada Supabase untuk
Editor super, Editor SD, Sales, dan pengunjung anonim. Sebelum memperluas ke transaksi produksi,
tambahkan rate limits dan audit perubahan sesuai kebutuhan operasional.

Referensi: https://supabase.com/pricing dan https://supabase.com/docs/guides/database/postgres/row-level-security

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
Empat kartu kategori landing memakai filter jenjang SD/SMP/SMA/SMK melalui `products.education_level`.
Jumlah buku per jenjang hanya menghitung buku published. Perubahan kategori ini tidak memerlukan migration baru.

Terapkan migration `202610070002_smk_subjects.sql` setelah migration mapel awal dan sebelum
memakai mapel SMK. Migration memperluas CHECK agar SMK menerima daftar SMA, tanpa mengubah
data atau RLS. Migration ini belum dijalankan pada database live dalam tugas ini.
Rollback aplikasi dapat memakai versi sebelumnya; biarkan CHECK yang diperluas dan kolom subject
agar mapel SMK yang sudah disimpan tidak hilang. Jangan mengembalikan CHECK lama sebelum
memastikan tidak ada buku SMK dengan subject terisi.

## Favorit per akun

Jalankan `supabase/migrations/202610070001_product_favorites.sql` pada project tujuan sebelum
menjalankan aplikasi yang memakai favorit. Migration dibungkus transaksi dan menambahkan tabel,
index, FK cascade, grant, serta RLS pemilik tanpa mengubah produk atau membership lama. Jalankan
migration satu kali melalui mekanisme migration yang mencatat versinya; bila transaksi gagal,
perbaiki penyebab lalu jalankan ulang. Jangan membuat tabel melalui dashboard tanpa kebijakan RLS.

Semua user Auth dapat memakai favorit, termasuk Sales dan Editor. User tidak dapat menulis
favorit akun lain, memfavoritkan draft, atau mengubah pemilik/produk pada row favorit. Runtime
menggunakan public key dengan sesi user. Tidak ada kebutuhan secret key untuk fitur favorit.

Urutan rollout: backup, terapkan migration pada project tujuan, verifikasi RLS/API, lalu deploy
aplikasi. Rollback dengan deploy aplikasi sebelumnya dan biarkan tabel favorit beserta datanya.
Jangan drop tabel untuk rollback tampilan. UUID dan referensi produk lama tetap utuh.

Jalankan `node scripts/verify-favorites.mjs` dengan server lokal di port 3000 memakai Supabase
dan `.env` lokal yang memiliki public URL/key serta `SUPABASE_SECRET_KEY` untuk pengujian.
Gunakan project pengujian: script membuat tiga user dan tiga buku sementara, lalu membersihkannya
di `finally`. Variabel `FAVORITES_TEST_BASE_URL` dapat mengganti URL server bila diperlukan.
Script menguji Sales/Editor/user tanpa membership, idempotensi, pencarian kode/filter/pagination,
SSR, akses anonim, pembatasan draft, isolasi akun melalui API dan RLS langsung, serta FK cascade.
Script berhenti sebelum membuat data bila tabel favorit belum tersedia atau katalog bukan Supabase.
Verifikasi browser tetap diperlukan untuk interaksi tombol, login, pergantian akun, dan layout mobile.

## Kelas buku dan katalog berpaginasi

Terapkan `supabase/migrations/202610090001_book_grades.sql` sebelum deploy katalog baru.
Migration ini belum dijalankan oleh agent dalam pekerjaan ini: koneksi PostgreSQL
atau akses migration Supabase tidak tersedia pada environment lokal. Pemeriksaan baca pada
9 Oktober 2026 menunjukkan kolom `grade` sudah tersedia di project terkonfigurasi, tetapi
constraint dan riwayat migration belum diverifikasi. Tinjau schema sebelum rollout.

1. Siapkan backup database dan catat jumlah/UUID buku sebelum migration.
2. Jalankan migration melalui mekanisme migration yang mencatat versinya. Migration
   transaksional dapat diulang; kolom/index memakai `IF NOT EXISTS` dan constraint dipasang ulang.
3. Verifikasi jumlah/UUID tetap sama, buku lama mempunyai `grade IS NULL`, kelas SD 1–6,
   SMP 7–9, SMA/SMK 10–12 diterima, dan pasangan lain ditolak.
4. Deploy aplikasi lalu isi kelas buku melalui dashboard Editor. Periksa filter kelas,
   pagination, draft yang tidak terbaca publik, dan scope Editor menggunakan akun pengujian.

Kolom opsional menjaga buku lama tetap terbaca tanpa menebak kelas dari judul. Input Editor
lama yang tidak mengirim `grade` mempertahankan nilai tersimpan; input baru dapat mengirim
`null` untuk mengosongkannya. Rollback dengan deploy versi sebelumnya dan pertahankan kolom,
index, serta constraint. Pada aplikasi lama, perpindahan jenjang buku yang sudah memiliki
kelas dapat ditolak constraint; kosongkan kelas melalui versi baru sebelum perpindahan.
Jangan drop kolom kelas saat rollback agar metadata yang sudah diisi tidak hilang.

## Keunggulan buku

Terapkan `supabase/migrations/202610100001_book_highlights.sql` sebelum deploy versi ini.
Migration transaksional menambah `products.highlights` bertipe `text[]` dengan default kosong
dan validasi maksimal enam poin, masing-masing 1?200 karakter nonblank, tanpa NULL atau array
multidimensi. Tidak ada perubahan RLS, UUID, atau referensi produk.

Catat jumlah/UUID sebelum migration, jalankan melalui mekanisme migration yang mencatat
versinya, lalu pastikan jumlah/UUID tetap sama dan buku lama memiliki daftar kosong.
Verifikasi simpan, muat ulang, edit, hapus poin, detail publik, scope Editor, dan penolakan
input lebih dari enam poin atau lebih dari 200 karakter. Rollback dengan aplikasi sebelumnya;
pertahankan kolom, fungsi validasi, constraint, dan data. Client lama yang menghilangkan field
tidak menghapus keunggulan tersimpan. Pengguna mengonfirmasi migration telah dijalankan pada database live. Agent belum
memverifikasi constraint atau persistensi live karena environment ini tidak menyediakan
koneksi PostgreSQL atau alat migration Supabase.

## Optimasi count katalog

Terapkan `supabase/migrations/202610100002_catalog_aggregate_counts.sql` melalui mekanisme
migration yang mencatat versinya. Migration menambahkan dua fungsi SQL `SECURITY INVOKER`
dengan search path kosong; RLS tetap berlaku dan kedua fungsi membatasi `published=true`.
Tidak ada perubahan data, tabel, indeks, atau kebijakan akses.

`catalog_level_counts()` mengelompokkan jumlah per jenjang dalam satu request, menggantikan
empat count terpisah. `catalog_subject_counts()` menghitung mapel di database tanpa mengunduh
semua row metadata. Filter pencarian, jenjang, kelas, dan featured tetap berlaku; pilihan mapel
aktif sengaja tidak membatasi facet, sesuai perilaku sebelumnya. Jenjang tanpa hasil tetap nol.

Aplikasi memakai query lama hanya jika PostgREST mengembalikan `PGRST202` (fungsi belum tersedia).
Error izin, jaringan, dan database tetap menjadi error; tidak diganti data demo. Deploy aplikasi
dan migration dapat dilakukan bertahap. Untuk rollback, deploy aplikasi sebelumnya dan biarkan
fungsi tersimpan; tidak perlu menghapus data atau objek database.

Setelah migration, bandingkan count dengan query published yang sama, termasuk hasil kosong,
pencarian, featured false, kelas, serta multi-mapel. Periksa sebagai anon dan akun Editor:
draft harus tetap tidak masuk count. Migration dan RLS live belum diverifikasi oleh agent.

Jalankan `supabase/diagnostics/catalog-performance.sql` di SQL Editor untuk melihat indeks dan
`EXPLAIN (ANALYZE, BUFFERS)` dengan role anon. Script tidak mengubah data. Gunakan data dan kata
pencarian representatif; query count seluruh tabel wajar memakai sequential scan pada tabel kecil.
Bandingkan waktu database dengan waktu API untuk membedakan query lambat dari jaringan/auth.

Indeks published/created_at, education_level/grade, subject, serta primary key membership/scope
sudah didefinisikan migration lama. Policy membership/scope sudah memakai `(select auth.uid())`.
Jangan menambah indeks duplikat atau membungkus fungsi scope yang bergantung pada jenjang row
seolah hasilnya konstan. Kandidat berikutnya hanya setelah plan membuktikan kebutuhan:
indeks partial `(created_at desc, id)` atau `(title, id)` untuk urutan katalog; indeks trigram
untuk pencarian substring yang lambat. Indeks trigram harus mencakup kolom pencarian OR yang
relevan dan tetap mempertahankan semantics ILIKE. Catat ukuran indeks dan biaya tulis sebelum rollout.

Referensi: [Database functions](https://supabase.com/docs/guides/database/functions),
[Query optimization](https://supabase.com/docs/guides/database/query-optimization), dan
[RLS performance](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv).

## Divisi buku

Migration `supabase/migrations/202610130001_book_divisions.sql` menambahkan kolom opsional
`products.division_code` bertipe `text`. Satu buku dapat memiliki satu divisi dari enam kode
tetap berikut. Constraint database menolak kode lain, termasuk string kosong.

| Kode           | Nama tampilan |
| -------------- | ------------- |
| `sd-1-mipa`    | SD 1 MIPA     |
| `sd-2-ips-bhs` | SD 2 IPS BHS  |
| `smp-sma-mipa` | SMP/SMA MIPA  |
| `smk`          | SMK           |
| `phibeta`      | PHIBETA       |
| `intelecto`    | INTELECTO     |

Migration hanya memperluas schema: tidak mengisi atau mengubah data buku lama, UUID,
referensi favorit, grant, atau RLS. Buku lama mendapat `NULL`; penentuan divisi harus memakai
data yang dikonfirmasi klien, bukan diturunkan otomatis dari jenjang atau mata pelajaran.
Divisi tidak membatasi hak akses Editor; scope tetap berdasarkan jenjang pendidikan.

Urutan rollout dan verifikasi:

1. Siapkan backup dan catat jumlah serta UUID produk sebelum migration.
2. Terapkan migration melalui mekanisme yang mencatat versinya. Transaksi dapat diulang;
   kolom memakai `IF NOT EXISTS` dan constraint dipasang ulang. Nilai tidak valid yang sudah
   ada akan menggagalkan transaksi, bukan dihapus atau dikoreksi otomatis.
3. Pastikan jumlah/UUID produk tidak berubah. Pada penerapan pertama, buku lama harus memiliki
   `division_code IS NULL`. Pada pengulangan, nilai divisi yang sudah valid tetap tersimpan.
4. Pada database pengujian, verifikasi keenam kode dan `NULL` diterima, sedangkan kode lain,
   string kosong, dan nama tampilan seperti `SD 1 MIPA` ditolak. Ulangi migration untuk
   memastikan nilai valid tidak berubah. Periksa akses publik published dan scope Editor.

Migration belum dijalankan atau diverifikasi pada database live oleh agent. Form Editor,
kontrak API, dan dashboard belum membaca atau menulis kolom ini; integrasi aplikasi merupakan
tahap berikutnya. Writer aplikasi sekarang memakai daftar kolom eksplisit sehingga penambahan
kolom nullable tetap kompatibel dengan versi sebelumnya.

Belum ditambahkan indeks divisi: tahap ini belum menambahkan query filter divisi. Menampilkan
kolom tidak memerlukan join atau indeks baru. Saat filter ditambahkan, ukur query representatif
dengan `EXPLAIN (ANALYZE, BUFFERS)` dan tentukan indeks berdasarkan filter serta urutan aktual.

Rollback aplikasi dengan versi sebelumnya dan pertahankan kolom beserta constraint agar nilai
divisi yang sudah diisi tidak hilang. Penghapusan kolom bukan bagian rollback tahap ini.

## Sinopsis dan target pasar buku

Migration `supabase/migrations/202610130002_book_synopsis_target_market.sql` menyiapkan
revisi detail buku: bagian deskripsi singkat dihapus dari desain, Isi buku menjadi Sinopsis,
dan Manfaat menjadi Target Pasar. Tahap ini hanya memperluas database, belum mengubah UI/API.

| Kolom           | Bentuk data                                                               | Kondisi buku lama |
| --------------- | ------------------------------------------------------------------------- | ----------------- |
| `synopsis`      | `text`, opsional, maksimal 20.000 karakter, nonblank jika diisi           | `NULL`            |
| `target_market` | `text[]`, maksimal 10 label nonblank, masing-masing maksimal 200 karakter | Array kosong      |
| `description`   | Kolom lama dipertahankan sementara untuk kompatibilitas                   | Nilai tetap utuh  |

Target pasar berupa daftar bebas, misalnya `ARRAY['Murid SD', 'Guru SD', 'Orang Tua']`.
Contoh bukan default seluruh buku atau daftar pilihan wajib; isi harus sesuai buku dan
konfirmasi klien. Array kosong diterima, tetapi NULL, elemen NULL/kosong/whitespace,
array multidimensi, dan nilai yang melewati batas ditolak. Target pasar merupakan informasi
publik buku, bukan aturan role pengguna atau scope Editor.

Database saat ini hanya memiliki `description` untuk deskripsi singkat sekaligus Isi buku.
Manfaat pada form masih pratinjau dan tidak tersimpan. Karena makna data lama bercampur,
migration tidak otomatis menyalin `description` menjadi sinopsis atau membuat target pasar
berdasarkan jenjang. Tidak ada UPDATE data buku; UUID, timestamp, referensi, grant, dan RLS
tetap utuh. Indeks tidak ditambahkan karena kedua kolom hanya untuk konten tampilan.

Urutan rollout:

1. Siapkan backup dan catat UUID, jumlah produk, timestamp, dan nilai `description` lama.
2. Terapkan migration melalui mekanisme yang mencatat versinya. Migration transaksional
   dan dapat diulang; nilai baru yang valid tetap tersimpan saat pengulangan. Data baru
   yang tidak valid menyebabkan transaksi gagal tanpa koreksi atau penghapusan otomatis.
3. Pada database pengujian, pastikan data lama tetap sama dan kolom baru memiliki nilai
   awal di atas. Uji sinopsis NULL/nonblank, batas 20.000/20.001 karakter, target pasar
   kosong/valid, batas 10/11 label serta 200/201 karakter, dan penolakan NULL/blank/multidimensi.
   Ulangi migration dan pastikan konten baru yang sudah valid tidak berubah.
4. Verifikasi pembacaan published oleh anon serta scope baca/tulis Editor tetap berlaku.
5. Tahap aplikasi berikutnya memperbarui tipe, validasi Zod, query, form, dan detail buku.
   Writer lama yang tidak mengirim field baru tetap mempertahankan nilai tersimpan.
   Lengkapi sinopsis dan target pasar melalui alur Editor setelah integrasi tersedia.

Jangan rename/drop `description` pada tahap database ini: repository publik, repository
Editor, form, dan metadata SEO masih menggunakannya. Penghapusan blok deskripsi singkat
merupakan perubahan UI berikutnya. Penghapusan kolom lama memerlukan migrasi lanjutan
setelah semua reader/writer dan kebutuhan SEO diperbarui serta konten lama ditinjau.

Rollback dengan aplikasi sebelumnya dan biarkan kolom baru, fungsi validasi, constraint,
serta data tersimpan. Migration belum dijalankan atau diuji pada PostgreSQL live oleh agent.

## Halaman jenjang/divisi dan popularitas

Terapkan `202610130001_book_divisions.sql`, kemudian
`202610130003_catalog_popularity.sql` sebelum memakai halaman `/jenjang` dan `/divisi`.
Migration popularitas diterapkan melalui mekanisme yang mencatat versinya dan dibungkus
transaksi. Versi terbaru dapat dijalankan ulang pada schema yang dibuat versi awal file ini:
tabel memakai `IF NOT EXISTS`, fungsi memakai `CREATE OR REPLACE`, dan policy statistik
dipasang ulang dalam transaksi yang sama. Ledger serta counter tidak dihapus atau direset.
Jika versi awal sudah dijalankan saat file masih disusun, jalankan seluruh file terbaru
untuk melengkapi RPC yang belum tersedia. Jangan drop tabel untuk mengatasi error `42P07`.
Schema tabel yang sudah ada tetap harus sesuai definisi migration; `IF NOT EXISTS` bukan
alat untuk memperbaiki tabel lain yang kebetulan memakai nama sama. Agent tidak menjalankan
migration ini ke database live.

- `product_access_days` menyimpan UUID browser acak, UUID produk, dan hari UTC. Primary key
  gabungan mencegah hit ganda untuk buku/browser/hari yang sama, termasuk request bersamaan.
  Tidak ada akses baca/tulis langsung bagi anon atau authenticated.
- `product_access_stats` menyimpan total kumulatif per buku. Publik hanya dapat membaca
  statistik buku published melalui RLS; seluruh penulisan langsung ditolak.
- `record_product_access(book_slug, visitor)` merupakan satu-satunya writer runtime.
  Fungsi `SECURITY DEFINER` memakai search path kosong, hanya menerima buku published,
  menentukan hari sendiri, dan menambah counter atomik hanya jika ledger baru berhasil dibuat.
  Grant execute dibatasi anon/authenticated karena pembacaan detail tetap publik.
- `catalog_browse_groups(group_kind)` memakai `SECURITY INVOKER`, RLS, dan filter published
  eksplisit. Satu RPC mengembalikan count dan maksimal empat buku dengan akses terbanyak
  untuk empat jenjang atau enam divisi. Kolom output eksplisit tidak menyertakan path materi
  privat; `image_path` sampul publik tetap dipetakan oleh helper storage server.
- `catalog_division_subject_counts` menyediakan facet mapel sesuai filter divisi tanpa
  mengubah signature RPC count lama. Fallback metadata hanya untuk RPC yang belum tersedia;
  error database/jaringan lain tetap menjadi error.

Endpoint `GET /api/catalog/browse?kind=level|division` membaca kelompok. Endpoint
`POST /api/products/:slug/access` menerima `{ "visitor": "UUID" }`, memvalidasi Zod, dan
tidak dicache. Client mencatat setelah detail berhasil tampil; kegagalan statistik tidak
menghalangi detail. Storage browser yang dinonaktifkan menyebabkan akses tidak dicatat.
Ranking kumulatif bukan jumlah manusia unik: browser berbeda, penghapusan storage, dan
UUID buatan dapat menghasilkan hit tambahan. Desain ini bukan perlindungan terhadap bot atau
manipulasi terarah; kebutuhan tersebut memerlukan kebijakan rate limiting terpisah.

Ledger bertambah mengikuti jumlah buku/browser/hari; jangan menghapus hari UTC aktif karena
akan membuka pencatatan ganda. Retensi ledger lama dapat ditetapkan operasional tanpa menghapus
counter kumulatif. Tidak ada cron atau penghapusan otomatis pada tahap ini.

Verifikasi di database pengujian: duplicate hit hari yang sama tetap satu, browser berbeda
menambah satu, draft/missing tidak tercatat, request bersamaan tidak kehilangan hit, penulisan
langsung dan pembacaan ledger ditolak untuk anon/authenticated, serta unpublish menghilangkan
buku dari ranking/count. Pastikan enam divisi dan empat jenjang tetap muncul saat kosong dan
respons tidak mengekspos materi privat. Periksa ranking empat teratas, tie-break, filter divisi,
scope Editor yang sudah ada, dan FK cascade saat buku dihapus. Buku lama dengan divisi NULL
tetap masuk jenjang yang sesuai tetapi tidak masuk kelompok divisi sebelum dilengkapi.

Gunakan `EXPLAIN (ANALYZE, BUFFERS)` pada data representatif untuk memeriksa query kelompok
dan filter divisi. Counter dipisahkan dari produk sehingga pencatatan tidak memicu perubahan
`products.updated_at`. Primary key statistik mendukung join; belum ditambahkan indeks filter
divisi tanpa pengukuran plan. Rollback aplikasi sebelumnya dan pertahankan tabel/fungsi/data;
jangan menghapus statistik atau kolom divisi sebagai rollback tampilan.

Skrip `scripts/verify-catalog-popularity.mjs` menjalankan migration dan pengujian permission,
deduplikasi, ranking, serta cascade pada PostgreSQL sementara di memori melalui PGlite.
Tentukan `PGLITE_MODULE_PATH` ke `dist/index.js` instalasi sementara; tidak ada dependency
PGlite pada aplikasi dan skrip tidak menghubungi Supabase live. Schema pengujian hanya
memodelkan akses publik; ini tidak menggantikan pengujian Auth dan scope Editor live.

Skrip `scripts/verify-catalog-browse.mjs` menguji SSR, navigasi, pilihan kelompok, history,
mobile, dan pencatatan detail di Chrome headless. Tentukan `PLAYWRIGHT_MODULE_PATH` ke
`index.mjs` instalasi Playwright, serta `CATALOG_TEST_BASE_URL` jika server bukan port 3000.
Data ranking UI merupakan fixture berlabel; seluruh POST statistik diintersep sehingga
skrip tidak menulis statistik live. `CATALOG_SCREENSHOT_DIR` opsional menyimpan screenshot.
