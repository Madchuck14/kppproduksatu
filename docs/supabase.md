## Dummy Buku publik (16 Oktober 2026)

Terapkan migration incremental `202610160001_public_dummy_books.sql` setelah seluruh
migration sebelumnya, sebelum deploy aplikasi terbaru. Dummy Buku published dapat
dilihat dan diunduh tanpa login. Bucket `book-materials` tetap privat; RLS hanya
membuka path materi yang direferensikan buku published. Draf, objek tanpa referensi,
dan hak tulis Editor tetap mengikuti pembatasan sebelumnya. Tidak ada perubahan data
buku atau objek Storage. Database baru memakai `supabase/setup.sql` yang sudah diperbarui.

Rollback: pulihkan definisi `can_access_public_book_material` dari migration
`202610140005_manual_product_knowledge_pdf.sql` dan aplikasi sebelumnya. Jangan jalankan
ulang seluruh migration lama karena berisi perubahan lain. Signed URL yang sudah terbit
tetap berlaku sampai kedaluwarsa. Migration ini belum diterapkan ke Supabase live oleh agent.

# Setup Supabase untuk demo online

## Setup satu file untuk database baru

[`supabase/setup.sql`](../supabase/setup.sql) menggabungkan seluruh 32 migrasi sampai
`202610160003_editor_only_favorites.sql`. Setiap bagian memiliki judul,
komentar penjelasan singkat tepat di bawahnya, serta nama file sumber. Urutan SQL sama
dengan migrasi berurutan; definisi historis yang diganti bagian berikutnya tetap diberi
penjelasan agar hasil akhir sesuai aplikasi terbaru.

Pada project Supabase **baru**, buka SQL Editor sebagai database owner, salin seluruh
isi `setup.sql`, lalu jalankan sekaligus. Auth, Storage, dan role bawaan Supabase harus
sudah tersedia. File memakai satu transaksi; kegagalan membatalkan seluruh setup.
Pelindung awal menolak database yang sudah memiliki tabel aplikasi. Jangan menjalankan
sebagian section secara terpisah pada database existing, terutama bagian cleanup historis.

File tidak menyertakan seed contoh, provisioning akun, rollback, diagnostics, atau isi
`schema.md` historis. Bila diperlukan, jalankan `supabase/seed.sql` secara terpisah setelah
setup untuk data demo; akun Editor/Sales tetap disiapkan melalui alur provisioning.
File gabungan sudah diuji pada PostgreSQL sementara dengan simulasi Auth/Storage,
belum dijalankan ke Supabase live.

File ini disimpan di luar `supabase/migrations/` agar CLI tidak menjalankan gabungan
bersama sumbernya. Riwayat migrasi lama tetap dipertahankan, dan setup manual ini **tidak**
mengisi `supabase_migrations.schema_migrations`. Untuk database existing atau workflow
Supabase CLI, gunakan file versioned sesuai riwayat yang tercatat. Jangan menjalankan
`db push` berisi seluruh migrasi lama setelah setup manual; rekonsiliasi baseline dan
riwayat melalui workflow migration yang dipakai tim terlebih dahulu.

Perbarui file gabungan secara mekanis setelah sumber migrasi berubah:

```powershell
node scripts/build-supabase-setup.mjs
node scripts/build-supabase-setup.mjs --check
$env:PGLITE_MODULE_PATH = '<temporary-install>/node_modules/@electric-sql/pglite/dist/index.js'
node scripts/verify-supabase-setup.mjs
```

Generator meminta judul dan penjelasan untuk setiap migrasi baru. Verifikasi membandingkan
schema, constraint, indeks, RLS, grant, fungsi, trigger, registry, dan bucket dengan migrasi
berurutan; juga memeriksa penolakan database existing dan rollback atomik saat SQL gagal.

## URL detail dengan kode buku

Route detail baru menggunakan kode buku sebagai identifier yang terlihat, misalnya
`/products/123456`. Kode buku tetap unique business key; UUID internal dan seluruh foreign key
tidak berubah. API detail dan materi juga menerima slug lama agar bookmark tidak langsung rusak.
Judul buku tidak lagi harus unik sehingga edisi dengan judul sama dapat dibuat pada tahun berbeda.

Sebelum deploy aplikasi, terapkan migration
`supabase/migrations/202610150002_allow_duplicate_book_titles.sql` setelah migration katalog
Editor `202610050002_editor_catalog.sql`. Migration hanya menghapus unique index judul;
unique index kode buku dan unique constraint slug tetap berlaku. Slug buku baru diberi kode buku
sebagai akhiran. Slug yang sudah ada dipertahankan ketika buku diedit.

Untuk deployment existing, backup schema terlebih dahulu, terapkan migration melalui mekanisme
yang mencatat versinya, lalu verifikasi judul duplikat dengan kode berbeda, kode duplikat ditolak,
link baru `/products/{kode-buku}`, serta link slug lama. Belum diterapkan ke database live oleh
agent.

## Buku pilihan beranda

Sebelum deploy pengelolaan buku pilihan, terapkan migration
`supabase/migrations/202610150001_featured_books_limit.sql` setelah migration katalog dan Editor.
Migration mempertahankan flag `products.featured` yang sudah ada, menambahkan batas global
delapan buku melalui trigger database, serta fungsi RPC untuk membaca jumlah dan menyimpan
perubahan pilihan secara atomik. Perubahan massal Editor hanya menyentuh buku dalam jenjang
yang boleh dikelolanya; role Editor diperiksa ulang di fungsi database. Sales tidak dapat
memanggil fungsi tersebut.

Carousel beranda mengambil buku `featured` melalui API katalog publik, yang tetap membatasi
hasil ke `published=true`. Buku draf dapat ditandai dari modal, tetapi baru muncul setelah
dipublikasikan. Modal dashboard menjadi satu-satunya tempat Editor memilih buku dari halaman
katalog berpaginasi dan mencari judul,
kode, atau penulis. Jumlah terpilih di jenjang lain tetap dihitung terhadap batas global;
Editor tidak dapat mengubah pilihan di luar scope-nya. Editor super dapat mengelola semua jenjang.

Rollout: periksa jumlah pilihan yang sudah ada dengan
`select count(*) from public.products where featured;`. Deploy migration lebih dulu, lalu
aplikasi. Jika jumlah lama lebih dari delapan, gunakan modal sebagai Editor super untuk
mengurangi pilihan menjadi delapan sebelum mengubah buku pilihan lainnya. Verifikasi perubahan
lewat modal, form edit satu buku, batas 8, batas scope Editor, serta tampilan carousel hanya
untuk buku published.
Migration belum diterapkan ke database live oleh agent.

Rollback: deploy aplikasi sebelumnya. Trigger dan fungsi dapat dipertahankan tanpa mengganggu
flag pilihan yang ada; jika perlu menghapusnya, lakukan melalui migration rollback terpisah
setelah memastikan tidak ada versi aplikasi yang memanggil RPC tersebut.

## Mengembalikan opsi mapel dan divisi tetap

Bagian ini merupakan catatan rollback historis. Jangan menjalankan migration penghapusan
registry pada aplikasi klasifikasi dinamis di bawah.

Jika migration opsi mapel/divisi dinamis sudah diterapkan tetapi tidak jadi digunakan, jangan
mengedit atau menghapus migration yang sudah tercatat. Setelah memastikan tidak ada buku yang
memakai nilai di luar daftar tetap lama, terapkan
`supabase/migrations/202610150003_restore_fixed_catalog_options.sql` sebagai migration baru.
Migration ini mengembalikan constraint mapel dan divisi, memulihkan RPC katalog dengan daftar
divisi tetap, lalu menghapus tabel opsi dinamis. Opsi tambahan yang hanya tersimpan di tabel
tersebut akan hilang. Jika data produk tidak cocok dengan constraint lama, transaksi akan gagal
dan seluruh rollback dibatalkan; koreksi nilai produk sebelum mencoba kembali.

## Klasifikasi buku dinamis

Terapkan `supabase/migrations/202610150004_book_classifications.sql` setelah migration
katalog, mapel, divisi, popularitas, kurikulum/ISBN, dan buku pilihan. Migration baru
memperluas schema dengan registry `book_classifications`; tidak mengubah UUID, data buku,
timestamp, favorit, statistik, atau file. Enam divisi dan seluruh mapel bawaan disalin ke
registry. Kurikulum dari buku published menjadi opsi; metadata buku draf tidak dibaca publik.
Kurikulum bebas pada buku lama tetap didukung.

Server tetap menggunakan public key dengan sesi Editor. RLS mengizinkan baca publik,
menolak tulis Sales/anon, dan hanya mengizinkan Editor menambah opsi. Mapel baru harus
berada pada scope jenjang Editor; divisi/kurikulum bersifat global. Editor tanpa scope
dan tanpa status super tidak dapat menambah opsi. UPDATE/DELETE langsung pada registry tidak diizinkan.
Nama duplikat pada jenis/jenjang sama ditolak tanpa membedakan kapital; kode divisi unik
dibuat server dari nama. Trigger menggantikan CHECK daftar tetap, memeriksa divisi
terdaftar dan pasangan mapel/jenjang pada setiap penulisan produk. Scope buku tetap
berdasarkan jenjang, bukan divisi. RPC ranking memakai registry dengan filter published.

Urutan rollout: backup schema/data, catat jumlah/UUID/timestamp produk, jalankan seluruh
migration melalui mekanisme pencatatan versi, lalu deploy aplikasi. Migration dapat diulang
tanpa menghapus opsi tambahan atau mengubah buku. Verifikasi data lama tetap identik,
enam divisi awal tetap ada, tambah tiga jenis opsi, reload, pemakaian pada tambah/edit buku,
penolakan duplikat, akses Sales/anon, dan scope mapel Editor. Beranda harus tetap memiliki
enam kartu; halaman Divisi menampilkan kartu tambahan walaupun jumlah buku nol.
Endpoint klasifikasi mengembalikan 503 jika migration belum tersedia, tanpa fallback demo.

Rollback aplikasi dapat memakai versi sebelumnya sambil mempertahankan tabel dan opsi baru.
Versi lama tidak dapat membaca buku dengan divisi/mapel baru karena enum lamanya; hentikan
penambahan opsi dan pemakaian nilai baru selama jendela rollback. Untuk rollback setelah
nilai baru dipakai, gunakan versi yang sudah mendukung registry atau siapkan pemetaan data
yang disetujui terlebih dahulu. Jangan menghapus tabel atau memulihkan CHECK lama secara
langsung karena dapat membuang opsi atau menolak metadata yang sudah disimpan.

`node scripts/verify-classifications.mjs` memakai `PGLITE_MODULE_PATH` seperti pengujian
PostgreSQL sementara lain. Script memeriksa seluruh rantai migration, preservation, retry,
daftar bawaan, constraint, hak akses, scope, dan kelompok divisi baru. Tidak menghubungi
Supabase live. `scripts/verify-classifications-browser.mjs` memakai `PLAYWRIGHT_MODULE_PATH`
dan port 3000; mutasi klasifikasi diintersep fixture. Migration live belum diterapkan
atau diverifikasi oleh agent.

### Penghapusan opsi tambahan

Perlindungan bawaan pada migration `202610150005` di bagian ini bersifat historis;
migration `202610150006` di bawah menggantinya dengan izin hapus seluruh opsi.

Terapkan `202610150005_delete_book_classifications.sql` setelah migration registry di atas,
lalu deploy aplikasi. Migration menambahkan penanda bawaan yang tidak dapat ditulis melalui
API pengguna dan RPC `delete_book_classification`. Tidak ada opsi atau buku yang dihapus
saat migration dijalankan; pengulangan tetap mempertahankan data.

Popup menampilkan tombol Hapus hanya untuk opsi tambahan dan meminta konfirmasi. Endpoint
DELETE memverifikasi sesi Editor dan scope mapel; RPC SECURITY DEFINER memeriksa ulang akses,
menolak enam divisi awal dan mapel bawaan, serta membaca seluruh produk untuk memblokir
referensi termasuk buku draf di luar scope. Error tidak membocorkan identitas atau jumlah
buku tersebut. Penghapusan mengambil lock tabel produk selama transaksi agar pemeriksaan
referensi dan penghapusan tidak berlomba dengan penulisan buku; penulisan katalog lain
dapat menunggu singkat. Opsi yang tidak ditemukan mengembalikan 404, opsi terpakai 409.
Kurikulum lama tetap merupakan teks bebas; hapus opsi tidak mengubah metadata buku.

Uji lokal pada script klasifikasi mencakup tiga jenis penghapusan, penolakan bawaan,
Sales/anon/scope, referensi draf tersembunyi, retry migration, dan hilangnya kelompok divisi.
Uji browser port 3000 mengintersep DELETE sebagai fixture, termasuk batal dan error terpakai.
Migration/penghapusan Supabase live belum dijalankan oleh agent.

Rollback aplikasi dengan versi sebelum tombol hapus; biarkan kolom dan RPC tetap tersedia.
Opsi yang sengaja dihapus tidak otomatis pulih. Untuk memulihkannya, tambahkan kembali nama
dan jenjang yang sama melalui popup atau backup yang disetujui. Jangan menjalankan ulang
migration registry lama untuk memulihkan satu opsi karena dapat menambah label kurikulum lagi.

### Penghapusan seluruh opsi klasifikasi

Terapkan `202610150006_delete_all_book_classifications.sql` setelah `202610150005`, lalu
deploy aplikasi. Migration mengganti RPC penghapusan agar seluruh kurikulum, divisi, dan
mapel termasuk daftar awal dapat dihapus. Tidak ada label Bawaan pada popup. Field lama
`is_builtin` dipertahankan untuk kompatibilitas schema tetapi tidak lagi membatasi akses.
Migration tidak otomatis menghapus klasifikasi atau mengubah produk. DELETE setelah
konfirmasi benar-benar menghapus row registry, bukan menyembunyikannya.

Pemeriksaan role Editor, scope mapel, referensi semua buku termasuk draf tersembunyi,
dan lock transaksi tetap berlaku. Lepas klasifikasi dari buku terlebih dahulu bila
mendapat 409. Penghapusan divisi menghilangkan kartu di `/divisi`; landing hanya membaca
divisi awal yang masih terdaftar, sehingga tidak menampilkan kartu menuju divisi terhapus.
Divisi tambahan tetap tidak dimasukkan ke landing.

Uji PostgreSQL sementara memeriksa penghapusan row divisi/mapel awal, scope, opsi terpakai,
preservation produk, dan retry migration tanpa memunculkan opsi terhapus. Uji browser
port 3000 memakai fixture untuk seluruh mutasi. Belum diterapkan ke Supabase live.

Rollback aplikasi tidak mengembalikan opsi yang telah dihapus. Tambahkan opsi lagi melalui
popup bila diperlukan. Jangan menjalankan ulang migration seed lama karena dapat
memunculkan opsi yang sengaja dihapus; gunakan riwayat migration berurutan. Pengulangan
migration `202610150006` sendiri tidak menambah atau menghapus opsi apa pun.

## Kurikulum dan ISBN buku

Terapkan `supabase/migrations/202610140003_book_curriculum_isbn.sql` setelah migration sebelumnya,
sebelum deploy aplikasi yang membaca kedua kolom secara eksplisit. Migration transaksional
menambah metadata publik opsional dan memperbarui output RPC `catalog_browse_groups`.

| Kolom        | Tipe             | Aturan                                                                        |
| ------------ | ---------------- | ----------------------------------------------------------------------------- |
| `curriculum` | `text`, nullable | Label bebas nonblank, maksimal 200 karakter, spasi tepi dibuang aplikasi.     |
| `isbn`       | `text`, nullable | ISBN-10 (9 digit + digit/X) atau 13 digit, disimpan tanpa spasi/tanda hubung. |

Kedua kolom memiliki nilai awal NULL pada buku lama. Tidak ada backfill dari judul/deskripsi,
perubahan UUID, timestamp, referensi favorit/statistik, grant tabel, atau scope/RLS. ISBN tidak
dijadikan angka, primary key, atau unique key; angka nol di depan tetap utuh. Aplikasi menerima
spasi/tanda hubung dan X kecil, kemudian menormalisasi sebelum simpan. Validasi ISBN memeriksa
format, bukan prefix/checksum penerbitan. Kurikulum tetap input teks, bukan daftar pilihan tetap.

Form tambah/edit memakai nilai tersimpan, menampilkan error per field, dan mengirim NULL ketika
dikosongkan. API lama yang menghilangkan field mempertahankan metadata yang sudah tersimpan;
pada insert, nilai yang dihilangkan tetap NULL. Detail publik menampilkan Kurikulum dan ISBN
dengan keadaan belum tersedia bila kosong. RPC ranking terbaru mengembalikan keduanya; aplikasi
melengkapi RPC lama melalui pembacaan detail published, tanpa mengarang nilai metadata.

Rollout: backup dan catat metadata/count/UUID/timestamp, terapkan migration melalui mekanisme
yang mencatat versinya, verifikasi buku lama tetap sama dengan kedua field NULL, lalu deploy.
Jika kolom pernah dibuat manual, tinjau isinya: nilai tidak valid menggagalkan transaksi tanpa
koreksi otomatis. Pengulangan migration mempertahankan metadata valid yang sudah diisi.
Verifikasi tambah/edit/muat ulang/kosongkan, ISBN dengan nol di depan, format/batas input,
detail/ranking published, dan penolakan tulis Sales/Editor di luar scope.

Rollback cukup deploy aplikasi sebelumnya dan pertahankan kolom, constraint, serta RPC agar
metadata baru tidak hilang. Jangan drop kedua kolom saat rollback tampilan. Client lama tidak
menulis kedua field dan mengabaikan tambahan key JSON dalam RPC.

`node scripts/verify-catalog.mjs` memeriksa kontrak, normalisasi, mapping, roundtrip, pengosongan,
writer lama, dan fallback RPC dengan query stub. `node scripts/verify-public-materials.mjs`
(dengan `PGLITE_MODULE_PATH` seperti di bawah) juga menguji migration metadata pada PostgreSQL
sementara: preservation, default NULL, retry, constraint, RPC, dan scope. Browser form diperiksa
dengan API fixture; verifikasi ini tidak menggantikan persistensi/Auth/RLS Supabase live.
Migration belum diterapkan ke database live oleh agent.

## Flyer PPT publik dan preview gambar

Persyaratan terbaru: Flyer dan PPT Produk milik buku published dapat dibuka tanpa login.
Hanya Dummy Buku yang memerlukan sesi terverifikasi. Terapkan migration sebelumnya, lalu
`supabase/migrations/202610140002_public_promotional_materials.sql` sebelum deploy aplikasi ini.
Jangan mengubah bucket `book-materials` menjadi public: policy SELECT anon/authenticated
memeriksa status published, UUID buku, folder Flyer/PPT, dan path asli yang tersimpan.
Dummy, draft, bucket lain, dan objek tanpa referensi tidak mendapat akses anonim. Writer
tetap membutuhkan Editor dan scope jenjang; tidak ada perubahan UUID, metadata, atau file.

Editor mengunggah PPT/PPTX maksimal 10 MB untuk unduhan dan PDF maksimal 10 MB untuk tampilan.
Tidak ada iframe Microsoft, converter, atau layanan viewer pihak ketiga.

Endpoint publik menggunakan client anonim dan query published. Dummy menggunakan
`auth.getUser()` sebelum query file. Status materi hanya mengembalikan boolean/format.
URL Dummy, Flyer, PDF tampilan, dan unduhan berlaku 60 detik. Mode demo
mengembalikan status berkas kosong dan 404 untuk Flyer/PPT; Dummy anonim tetap 401.

Urutan rollout:

1. Backup dan catat metadata/path produk serta policy Storage pada project tujuan.
2. Terapkan migration melalui mekanisme yang mencatat versinya. Migration transaksional,
   dapat diulang, dan tidak menghapus/memindahkan file. Jangan menjalankan migration cleanup
   lama lagi setelah ini karena definisi fungsi lama mengembalikan akses login-only.
3. Verifikasi anon dapat membuat signed URL/mengunduh Flyer/PPT untuk buku published,
   tetapi Dummy/draft/objek lain ditolak. Periksa Sales tidak dapat menulis dan Editor
   tetap dibatasi jenjang. Uji unpublish menghilangkan penerbitan URL baru.
4. Deploy aplikasi. Uji unggahan pasangan PDF dan PPT/PPTX, tombol Tampilkan, login Dummy dengan
   returnTo, dan unduhan PowerPoint asli.

Rollback: deploy aplikasi sebelumnya, lalu jalankan
`supabase/rollback/202610140002_private_promotional_materials.sql`. Script memulihkan policy
login-only tanpa menghapus file atau metadata. Signed URL yang sudah terbit tetap berlaku
sampai kedaluwarsa; salinan materi yang sebelumnya diunduh publik tidak dapat ditarik kembali.
Catat rollback pada riwayat migration. Catatan akses login-only dan gambar slide di bagian
historis berikut menjelaskan versi sebelum migration publik ini.

Verifikasi lokal:

```powershell
node scripts/verify-material-upload.mjs
$env:PGLITE_MODULE_PATH = '<temporary-install>/node_modules/@electric-sql/pglite/dist/index.js'
node scripts/verify-public-materials.mjs
```

Script RLS memakai PostgreSQL sementara dengan Auth/Storage simulasi. Tidak mengunggah data ke
Supabase live.

## PDF tampilan dan PowerPoint unduhan

Setelah migration converter `202610140004_server_presentation_previews.sql` yang sudah diterapkan,
jalankan `supabase/migrations/202610140005_manual_product_knowledge_pdf.sql`. Migration menambah
`product_knowledge_preview_path`, mengarsipkan metadata converter pada schema privat
`catalog_cleanup_archive`, lalu menghapus kolom status dan slide yang tidak lagi digunakan.

Editor mendapat dua input independen. Folder `product-knowledge-preview` hanya menerima PDF
maksimal 10 MB untuk tombol **Tampilkan**. Folder `product-knowledge` menerima PPT/PPTX maksimal
10 MB untuk tombol **Unduh PowerPoint**. Keduanya dapat dibaca anonim hanya pada buku published;
Dummy Buku tetap membutuhkan login. Tidak diperlukan port 3001 atau environment converter.

Rollback `supabase/rollback/202610140005_restore_presentation_converter_columns.sql` mengembalikan
metadata converter dari arsip tanpa menghapus PDF tampilan. Object gambar lama juga tidak dihapus
otomatis; bersihkan terpisah setelah memastikan rollback tidak diperlukan.

## Penghapusan kolom produk lama (14 Oktober 2026)

Migration `supabase/migrations/202610140001_remove_legacy_product_columns.sql`
menghapus `products.description` dan `products.flyer_slide_paths`. Reader/writer aplikasi
baru tidak membutuhkan kedua kolom, tetapi tetap mempertahankan field JSON `description`
sebagai alias `synopsis` (string kosong jika belum diisi). SEO memakai sinopsis atau teks
Indonesia berdasarkan judul buku. Isi deskripsi lama tidak otomatis dianggap sinopsis.

Migration menyimpan nilai lama persis, termasuk daftar preview, ke tabel
`catalog_cleanup_archive.product_legacy_columns`. Schema arsip tidak boleh dimasukkan
ke exposed schemas Supabase. Akses schema/tabel dicabut dari PUBLIC, anon, dan authenticated;
RLS aktif tanpa policy pengguna. Arsip hanya untuk pemulihan operator database.
UUID, sinopsis, timestamp, favorit, statistik, serta objek Storage tidak diubah.
Preview flyer lama tidak lagi mendapat akses runtime; preview PPT Produk tetap tersedia.

Urutan penerapan:

1. Ambil backup database dan simpan jumlah/UUID produk serta statistik/favorit.
   Pastikan migration sebelumnya sudah diterapkan dan tinjau fungsi/constraint live
   yang mungkin berbeda dari repository. Jangan menjalankan snapshot `schema.md` sebagai SQL.
2. Hentikan sementara penulisan katalog/unggahan, deploy aplikasi baru, lalu pastikan
   tidak ada server atau worker versi lama. Kolom lama tetap dapat berada di database
   saat reader baru digunakan. Periksa konten lama yang akan diarsipkan; SEO tidak lagi
   memakai deskripsi lama. Jangan mengisi sinopsis otomatis dari data tersebut.
3. Jalankan seluruh migration melalui mekanisme yang mencatat versinya. Migration
   transaksional, mengunci tabel produk, memverifikasi arsip, dan tidak menggunakan CASCADE.
   Dependency yang tidak dikenal atau schema parsial menggagalkan transaksi.
4. Pastikan kedua kolom hilang, semua UUID/count/timestamp tetap sama, arsip cocok,
   pengguna anon/authenticated tidak dapat mengakses arsip, dan katalog/ranking,
   SEO, CRUD Editor, unggah Flyer PDF, serta preview PPT Produk masih berfungsi.
   Setelah pemeriksaan lulus, aktifkan kembali penulisan. Ambil ulang snapshot schema live.

Rollback: hentikan penulisan, jalankan
`supabase/rollback/202610140001_restore_legacy_product_columns.sql`, verifikasi, kemudian
deploy aplikasi sebelumnya. Script mengembalikan nilai arsip, constraint preview lama,
fungsi Storage, dan RPC tanpa menghapus arsip atau mengubah sinopsis/timestamp. Produk
baru yang belum memiliki arsip mendapat default deskripsi/preview kosong. Jika Flyer
PowerPoint lama sudah diganti PDF setelah cleanup, pemulihan daftar preview lama dapat
melanggar constraint. Rollback gagal atomik; tinjau metadata dan pulihkan berkas asli
yang sesuai sebelum mencoba ulang. Jangan memakai CASCADE atau menghapus berkas untuk
mengatasi kegagalan. Catat rollback di riwayat migration agar tidak berbeda dari schema.

Pengujian lokal:

```powershell
$env:PGLITE_MODULE_PATH = '<temporary-install>/node_modules/@electric-sql/pglite/dist/index.js'
node scripts/verify-legacy-column-cleanup.mjs
node scripts/verify-catalog.mjs
node scripts/verify-presentation.mjs
```

Script cleanup menggunakan seluruh migration pada PostgreSQL sementara, dengan Auth/Storage
simulasi. Tidak membaca `.env` dan tidak menghubungi database live. Pemeriksaan ini tidak
menggantikan verifikasi Supabase live, sesi Editor, atau interaksi browser.

## Database

1. Buat project Supabase milik vendor untuk staging. Jangan gunakan database produksi klien.
2. Terapkan seluruh migration `supabase/migrations/` berurutan melalui mekanisme yang mencatat versinya; perhatikan urutan deployment aplikasi untuk migration cleanup di atas.
3. Setelah semua migration, jalankan `supabase/seed.sql` untuk tiga produk contoh. Ini opsional dan jangan dipakai sebagai inventory produksi.
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
Pertahankan **Confirm email**; provisioning administratif mengonfirmasi akun Editor yang disetujui.

## Provisioning Editor per jenjang

Empat akun Editor biasa (SD, SMP, SMA, SMK) disiapkan melalui script lokal
`scripts/provision-editor-accounts.mjs`. Setiap akun memiliki satu row `editor_scopes`,
`is_super=false`, dan tidak diberi `admin_memberships`. Jenjang adalah batas akses;
divisi buku tetap metadata katalog dan tidak menjadi scope akun.

Simpan kredensial di `.env.editor-accounts` lokal memakai pasangan variabel
`EDITOR_SD_EMAIL`/`EDITOR_SD_PASSWORD`, dengan pola sama untuk SMP, SMA, dan SMK.
File ini diabaikan Git dan tidak dibaca runtime aplikasi. Konfigurasi Supabase dan key
admin tetap berasal dari `.env`; jangan menyalin rahasia ke dokumentasi atau contoh env.

Jalankan `node scripts/provision-editor-accounts.mjs --check` untuk preflight, kemudian
`node scripts/provision-editor-accounts.mjs` untuk membuat/memperbarui akun target.
Email target mengikuti `editor<jenjang-huruf-kecil>@erlangga.com`. Script mengonfirmasi
email secara administratif tanpa mengirim undangan. Akun target dengan role lain, hak
super, atau membership admin ditolak sebelum mutasi. Rerun memperbarui password akun
Editor target dan membatasi ulang scope ke satu jenjang; akun lain tidak disentuh.

Verifikasi script mencakup login Supabase, membership non-super, satu scope, RPC RLS
`can_manage_book_level`, dan API dashboard pada seluruh pasangan jenjang melalui
server lokal port 3000. Jenjang sendiri harus 200; tiga jenjang lain harus 403.
Gunakan `EDITOR_TEST_BASE_URL` bila server berada pada alamat lain.

## Provisioning Editor super

Isi `SUPER_ACCOUNT_EDITOR_EMAIL`, `SUPER_ACCOUNT_EDITOR_PASSWORD`, URL/public key, dan
`SUPABASE_SECRET_KEY` di `.env` lokal. Jalankan
`npm.cmd run provision:super-accounts -- --check` untuk preflight, lalu
`npm.cmd run provision:super-accounts` untuk membuat/memperbarui Editor super.
Script hanya membuat Editor; kredensial akun umum lama tidak dibaca. Tidak ada email
undangan dikirim. Editor super mendapat empat jenjang dan membership admin kompatibilitas.
Gunakan provisioning Editor per jenjang di atas untuk akun non-super.

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

Flyer menerima PDF maksimal 10 MB; Dummy Buku maksimal 15 MB. PPT Produk (Product Knowledge) menerima
PPT/PPTX maksimal 10 MB dengan gambar slide hasil ekspor PNG/JPG untuk preview statis.
Product Knowledge PDF lama tetap dapat dibuka. Bucket tidak memiliki URL publik permanen.
Materi published hanya dapat dibuka setelah login lewat endpoint server yang membuat signed URL
berumur 60 detik.

Jalankan `supabase/migrations/202610060002_unique_book_title.sql` setelah migration materi privat.
Migration berhenti tanpa perubahan bila menemukan judul duplikat setelah spasi tepi dan kapital
dinormalisasi. Ubah judul duplikat lebih dahulu, lalu jalankan ulang migration. Unique index ini
mencegah dua request bersamaan membuat nama buku yang sama.

Jika migration akses akun pernah dijalankan, lanjutkan dengan
`supabase/migrations/202610060004_public_book_material_access.sql`. Migration mengganti kebijakan
baca menjadi publik hanya untuk materi milik buku published. Ini merupakan langkah historis;
migration `202610130004_flyer_slide_previews.sql` berikutnya menggantinya dengan akses authenticated.
Bucket tetap privat; object path harus sama dengan path yang tersimpan pada row produk.

## Divisi, sinopsis, dan target pasar

Sebelum memakai form Editor yang menyimpan divisi, sinopsis, dan target pasar, jalankan berurutan:

1. `supabase/migrations/202610130001_book_divisions.sql`
2. `supabase/migrations/202610130002_book_synopsis_target_market.sql`
3. `supabase/migrations/202610130003_catalog_popularity.sql` jika belum diterapkan.
4. `supabase/migrations/202610130005_catalog_browse_book_details.sql`

Divisi disimpan sebagai `products.division_code` dari daftar tetap aplikasi. Sinopsis disimpan
sebagai `products.synopsis`; target pasar disimpan sebagai daftar berurutan di
`products.target_market` (maksimal 10 label, masing-masing maksimal 200 karakter).
Migration mempertahankan `products.description` dan data yang sudah ada. Form Editor tidak lagi
mengubah kolom deskripsi lama saat menyimpan buku. Migration browse memperluas hasil RPC koleksi
agar menyertakan detail publik tersebut tanpa mengirimkan path berkas Storage.

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
ranking tetap kompatibel dengan definisi RPC lama yang belum menyertakan divisi, sinopsis,
atau target pasar: aplikasi membaca metadata nyata melalui satu query produk published, dengan
urutan ranking tetap berasal dari statistik. Tetap terapkan migration
`202610130005_catalog_browse_book_details.sql` untuk menghindari query tambahan; jangan reset
counter atau ledger untuk memperbaiki kontrak metadata. Perubahan ini tidak menulis database.
Endpoint
`POST /api/products/:identifier/access` menerima kode buku atau slug lama serta
`{ "visitor": "UUID" }`, memvalidasi Zod, dan
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

## Pengelolaan klasifikasi hanya Editor super

Terapkan migration `202610160002_super_editor_classifications.sql` setelah migration
sebelumnya dan sebelum deploy aplikasi terbaru. Endpoint tambah/hapus klasifikasi
memverifikasi sesi dan mensyaratkan `role=editor` serta `is_super=true` sebelum
membaca input. Tombol **Edit Klasifikasi Buku** hanya tampil bagi Editor super.
RLS insert dan RPC hapus memeriksa syarat yang sama, termasuk akses langsung Supabase.
Editor super tidak harus memiliki row scope jenjang untuk mengelola mapel.

Editor biasa tetap memilih opsi yang tersedia saat mengedit buku dalam jenjangnya.
Pembacaan opsi publik, perlindungan klasifikasi yang sedang dipakai buku (termasuk
draf), serta data buku/klasifikasi tidak diubah. Sales super tetap tidak boleh mengelola
klasifikasi. Ketentuan historis yang membolehkan Editor biasa di bagian sebelumnya
sudah digantikan. Migration belum diterapkan ke Supabase live oleh agent.

Rollback aplikasi sebelumnya, lalu pulihkan policy `classifications_editor_insert`
dari migration `202610150004` dan definisi RPC hapus dari `202610150006`; hapus policy
`classifications_super_insert`. Salin hanya definisi tersebut, jangan jalankan ulang
seluruh migration lama. Rollback ini membuka kembali pengelolaan untuk Editor biasa.

## Transisi akun hanya Editor (16 Oktober 2026)

Katalog dan materi published terbuka untuk publik tanpa akun. Hanya Editor yang dikenali
oleh session aplikasi, dashboard, dan Favorit. Login akun non-Editor ditolak dan sesi login
baru yang ditolak dibersihkan. Tidak ada pendaftaran mandiri atau pilihan role publik;
`/register` lama mengalihkan ke login Editor sambil mempertahankan tujuan yang tervalidasi.

Urutan rollout: cadangkan database, terapkan seluruh migration sampai
`202610160003_editor_only_favorites.sql`, lalu deploy aplikasi dari branch
`feat/editor-only-access`. Migration mengganti policy pembacaan membership agar hanya
Editor yang dikenali, serta policy select/insert/delete Favorit agar mensyaratkan pemilik
sekaligus role Editor. Editor biasa dan super tetap dapat menyimpan buku published dari
semua jenjang; scope CRUD katalog tidak berubah. Favorit draf dan pemalsuan pemilik ditolak.

Baris Auth, membership legacy, dan favorit lama tetap disimpan; tidak ada konversi Sales
menjadi Editor atau penghapusan data. Auth Supabase lama secara teknis masih dapat menerbitkan
session kepada akun legacy, tetapi session itu tidak memberi akses akun/Favorit pada aplikasi
atau RLS terbaru. Nonaktifkan signup langsung pada pengaturan Supabase Auth seperti sebelumnya.
Tidak ada mutasi Auth/pengaturan atau migration live yang dijalankan agent pada transisi ini.

Rollback: deploy aplikasi sebelumnya dan jalankan
`supabase/rollback/202610160003_all_account_favorites.sql`. Policy lama akan kembali
mengizinkan akun authenticated mengelola favoritnya; data tidak perlu dipulihkan.
Jangan hapus tabel atau row akun sebagai bagian rollback.

Verifikasi terisolasi: `node scripts/verify-editor-only.mjs` dengan `PGLITE_MODULE_PATH`.
Verifikasi browser fixture: `node scripts/verify-favorites-browser.mjs` dengan
`PLAYWRIGHT_MODULE_PATH`. Test integrasi mutasi `scripts/verify-favorites.mjs` hanya
untuk project pengujian yang sudah dimigrasi; jangan dipakai sebagai bukti database live
sebelum migration diterapkan. Catatan historis tentang akun umum di atas digantikan bagian ini.
