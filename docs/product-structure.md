# Struktur Produk

Struktur Produk adalah hierarki terpisah dari `book_classifications`. Editor super
mengelola cabang melalui `/admin/struktur-produk`; Editor biasa tetap hanya mengelola
buku dalam jenjangnya. Katalog dan struktur aktif tetap dapat dibaca publik.

## Model dan sumber data

`product_structure_nodes` menyimpan UUID, `education_level`, `parent_id` nullable,
`name`, `sort_order`, `product_status` nullable, dan `archived`. Induk harus aktif dalam
jenjang yang sama. Jenjang cabang tidak dapat diubah; perpindahan induk dalam jenjang
yang sama diperbolehkan selama tidak membentuk siklus. Urutan kecil tampil dahulu;
nama dan UUID menjadi pembanding bila urutan sama.

`products.structure_node_id` adalah foreign key nullable, sehingga satu buku memiliki
maksimal satu posisi dan satu cabang dapat dirujuk banyak buku. UUID produk, kode buku,
slug, referensi, dan data buku lama dipertahankan. Tidak ada jalur nama yang disalin
ke tabel buku: jalur dihitung dari ID dan hierarki aktif saat dibaca.

Status produk adalah teks opsional, maksimal 80 karakter, misalnya Eksisting atau
Produk 2026. Status ini ditampilkan sebagai label dalam bagan. Penanda `archived`
berbeda: arsip menyembunyikan cabang dari pembacaan publik dan pilihan buku.

Folder `docs/referensicabangproduk` memuat bagan SD, SMP, SMA, dan SMK. Bagan memakai
label tahun/status berbeda, sehingga aplikasi tidak memaksakan satu tahun atau
menganggap warna kategori sebagai status arsip. Nama contoh Buku Soal, Asesmen Formatif,
dan Bupena Merdeka hanya dipakai dalam `scripts/fixtures/product-structure.mjs` serta
pengujian. Migration tidak mengisi data produksi. Pengelola perlu memverifikasi versi,
hubungan induk-anak, dan status pada referensi sebelum memasukkan struktur nyata.

### Impor granddesignproduct.txt

Pengguna memberikan `docs/referensicabangproduk/granddesignproduct.txt` sebagai sumber
dan memilih menunda cabang/subtree yang belum terverifikasi. Impor terpisah dari migration:
`node scripts/import-product-structure.mjs` menampilkan preview; `--apply` memasukkan
seluruh cabang baru dalam satu INSERT atomik dengan induk sebelum anak. Script memakai
key admin lokal, bukan kode runtime/browser, dan tidak menjalankan DDL atau migration.

Impor sumber ini menghasilkan 101 cabang: SD 32, SMP 21, SMA 15, SMK 33. Sebelas entri
ditunda: kelompok asesmen SMP beserta tujuh turunannya, Buku NGC SMA, catatan posisi
Mata Uji Wajib SMA, dan gabungan Seri Point to Point/PP Revisi SMK. Header SMA yang
bertanda terbaca sebagian dinormalisasi menjadi SMA. Kategori Asesmen Sumatif SMA tetap
dimasukkan karena catatan menyatakan label kategorinya terbaca; daftar produknya belum diisi.
Catatan verifikasi tidak dijadikan nama cabang publik. Status produk tetap NULL karena
berkas tidak menetapkan status per cabang.

ID impor stabil berdasarkan jenjang/jalur. Cabang aktif existing dengan jalur sama
digunakan ulang tanpa mengubah nama, urutan, atau statusnya. Konflik arsip, jalur ganda,
atau ID yang sudah dipindahkan/diubah menghentikan impor. Pengulangan pada sumber sama
tidak menggandakan cabang. Manifest `prepared`/`applied`, checksum sumber, row baru, dan
daftar tertunda disimpan lokal di `.data/product-structure-import/` yang diabaikan Git.
Jika perlu membatalkan impor, tinjau manifest dan arsipkan hanya cabang baru yang masih
sesuai; aturan rujukan buku tetap berlaku. Jangan menghapus atau menimpa cabang existing.

Uji `node scripts/verify-product-structure-import.mjs` dengan `PGLITE_MODULE_PATH`
memeriksa parser, penundaan subtree/prosa, konflik, pengulangan, serta rollback insert atomik.

## Alur pengelolaan dan buku

1. Pada dashboard Editor super, pilih **Kelola Struktur Produk**.
2. Pilih tab SD/SMP/SMA/SMK. **Tambah kategori** membuat cabang utama; pilih cabang
   lalu **Tambah subcabang** untuk membuat anaknya. Panel kanan mengatur nama, induk,
   urutan, dan status produk. Panel berpindah ke bawah daftar pada layar sempit.
3. Pada Tambah/Edit Buku, field opsional **Struktur Produk** berada setelah Jenjang.
   Cari nama/jalur lalu pilih satu posisi. **Lepas pilihan** menyimpan NULL. Mengubah
   jenjang mengosongkan pilihan sebelumnya. Buku lama tanpa struktur tetap dapat disimpan.
4. Detail buku published yang terhubung menampilkan jalur dan **Lihat struktur [jenjang]**.
   Tautan menuju `/struktur-produk?level=SD&node=<UUID>`; jalur leluhur dibuka dan cabang
   disorot. Nama dan induk yang berubah tercermin dari hierarki yang sama.
5. **Hapus cabang** membuka konfirmasi **Hapus permanen** dan menghapus cabang beserta
   seluruh turunannya dari database. Tindakan ini tidak dapat dibatalkan dari aplikasi.
   Jika ada buku yang masih merujuk cabang atau turunannya, termasuk draf, hapus ditolak.
   Pindahkan atau lepas posisi buku dahulu. Buku tidak ikut dihapus.

Sejak migration `202611110001_delete_product_structure.sql`, UI memakai hapus permanen.
Kolom arsip dan RPC lama tetap dipertahankan untuk kompatibilitas klien lama. Migration
tidak menghapus arsip existing. Cabang yang sudah diarsipkan tidak dapat diedit/dipilih
sebagai induk; jika menjadi turunan cabang aktif yang dihapus, baris arsip itu ikut dihapus.
Input form tetap tersedia ketika penyimpanan gagal. Tidak ada fallback diam-diam ke
data contoh jika Supabase gagal. Demo menampilkan struktur kosong dan tidak menyediakan mutasi.

## API dan otorisasi

| Endpoint                                        | Akses dan perilaku                                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `GET /api/catalog/product-structure?level=SD`   | Publik, seluruh cabang aktif pada jenjang itu, dibaca dalam batch agar tidak terpotong batas 1.000 row. |
| `GET /api/admin/product-structure?level=SD`     | Editor super, daftar aktif untuk pengelola.                                                             |
| `POST /api/admin/product-structure`             | Editor super, tambah cabang tervalidasi Zod.                                                            |
| `PUT /api/admin/product-structure/:id`          | Editor super, edit cabang aktif; jenjang tetap.                                                         |
| `POST /api/admin/product-structure/:id/archive` | Editor super, RPC pengarsipan subtree atomik.                                                           |
| `DELETE /api/admin/product-structure/:id`       | Editor super, hapus permanen subtree yang tidak dipakai buku, termasuk turunan arsip.                   |

Endpoint kelola memakai `requireSuperEditor` dan verifikasi Auth server. RLS mengizinkan
SELECT publik hanya untuk cabang aktif dan INSERT/UPDATE hanya untuk role Editor dengan
`is_super=true`. Super dapat membaca arsip untuk pemeriksaan internal. DELETE tidak
diberikan kepada pengguna. RPC arsip memeriksa ulang role dari membership dan menelusuri
seluruh produk melalui fungsi server tepercaya, sehingga draf tidak terlewat karena RLS.
Runtime tetap memakai public key/sesi pengguna, tanpa key admin untuk fitur ini.

API buku menerima `structureNodeId?: UUID | null`; ketiadaan field pada klien lama
mempertahankan posisi tersimpan, sedangkan NULL melepas posisi. Server dan trigger database
memastikan cabang aktif dengan jenjang yang sesuai. RLS Editor per jenjang tetap berlaku
pada jenjang asal dan tujuan. Respons katalog menambah field opsional `structureNodeId`;
detail yang terhubung juga memuat `structurePath`. Kontrak sebelumnya tetap tersedia,
termasuk kode/slug dan filter `published=true`. Path dan pilihan dropdown memakai helper
yang sama; tidak ada query tambahan struktur untuk setiap kartu daftar buku.

## Konsistensi penyimpanan bersamaan

Statement perubahan hierarki serta INSERT/UPDATE posisi/jenjang buku memperbarui satu
row pengunci privat pada `product_structure_private.write_guard`. RPC arsip mengambil
pengunci yang sama sebelum membaca rujukan buku. Trigger yang memvalidasi subtree,
induk/siklus, dan pilihan buku berjalan di dalam transaksi tersebut.

Penulis menunggu row lock pada READ COMMITTED. Pada REPEATABLE READ/SERIALIZABLE,
penulis dengan snapshot lama mendapat serialization failure; API memetakannya menjadi
409 agar editor memuat ulang. Ini mengikuti perilaku [isolasi PostgreSQL](https://www.postgresql.org/docs/current/transaction-iso.html)
dan [row lock](https://www.postgresql.org/docs/current/explicit-locking.html).
Pengunci berada di schema privat tanpa privilege pengguna dan tidak memblokir pembacaan
katalog biasa. Pertukaran yang dipilih: perubahan struktur/posisi buku diserialisasi
secara global agar aturan lintas tabel konsisten. Transaksi harus tetap singkat.

## Migration dan rollback

Untuk fitur hapus, terapkan `202611110001_delete_product_structure.sql` setelah migration
struktur dan sebelum deploy aplikasi baru. Migration hanya menambahkan RPC; tidak mengubah
data atau memberi privilege DELETE langsung. RPC memakai pengunci transaksi yang sama
dengan perubahan hierarki dan posisi buku, memeriksa Editor super serta seluruh referensi
buku, kemudian menghapus subtree dalam satu statement. FK tetap aktif.
Database baru memakai bundle 45 migration. Agent tidak menerapkan migration ke Supabase live.

Rollback fitur: jalankan aplikasi sebelumnya, lalu bila diperlukan cabut RPC baru dengan
`DROP FUNCTION public.delete_product_structure_node(uuid);`. Kolom, data, RPC arsip lama,
serta kebijakan lama tetap tersedia. Penghapusan yang sudah dikonfirmasi tidak dapat
dipulihkan dengan rollback aplikasi/migration; pemulihan memerlukan backup database.
Tidak ada pembersihan massal arsip lama.

Terapkan `supabase/migrations/202611100005_product_structure.sql` setelah migration
sebelumnya, sebelum deploy aplikasi baru. Database baru memakai `supabase/setup.sql`
berisi 45 migration. Jangan menjalankan ulang setup pada database existing. Sebelum
pengelola mulai menghubungkan buku, pastikan seluruh instance aplikasi sudah diperbarui.
Migration mempertahankan buku lama dengan pilihan NULL dan tidak membuat struktur contoh.
Agent tidak menerapkan migration ini ke Supabase live.

Rollback aplikasi mempertahankan tabel, trigger, pengunci, dan foreign key. Versi lama
mengabaikan field baru. Jangan menghapus tabel/kolom atau mematikan validasi saat rollback.
Jika klien lama mengubah jenjang buku yang sudah terhubung, validasi database dapat
menolak perubahan; gunakan aplikasi baru untuk melepas/memindahkan posisi dahulu.
Cadangkan tabel struktur dan referensi buku sebelum perubahan manual.

## Verifikasi

- `PGLITE_MODULE_PATH` menunjuk `dist/index.js` PGlite, lalu jalankan
  `node scripts/verify-product-structure.mjs` dan `node scripts/verify-supabase-setup.mjs`.
  Uji memeriksa preservasi buku lama, tambah/ubah induk, siklus, referensi salah jenjang,
  status arsip, rujukan draf/published, subtree, private guard, dan RLS per peran.
- `PLAYWRIGHT_MODULE_PATH` menunjuk `index.mjs` Playwright, lalu jalankan
  `node scripts/verify-product-structure-browser.mjs`. `STRUCTURE_TEST_BASE_URL` dapat
  menunjuk server build lokal. Auth/API browser memakai fixture; tidak ada mutasi live.
- Jalankan typecheck, lint, Prettier file berubah, build Node dan Cloudflare, serta
  smoke test katalog, detail/404, struktur publik, dan `/healthz`.

PGlite tidak menyediakan dua koneksi transaksi independen. Sebelum produksi, lakukan
uji contention pada PostgreSQL terisolasi dengan dua sesi: tahan transaksi penyimpanan
posisi buku pada sesi A, lalu arsipkan leluhurnya pada sesi B; B harus menunggu dan
kemudian menolak karena rujukan. Ulangi urutan sebaliknya: tahan transaksi arsip pada A,
lalu hubungkan buku pada B; setelah commit A, B harus menolak cabang arsip. Ulangi pada
REPEATABLE READ untuk memastikan penulis lama dibatalkan dengan 40001. Pemeriksaan ini,
Auth/RLS Supabase live, cloud deployment, dan Docker tidak dibuktikan oleh fixture lokal.
