# Materi promosi wajib login

Dummy Buku, PPT Produk (PDF pratinjau dan PPT/PPTX unduhan), serta Flyer hanya dapat
dibuka setelah login. Katalog, sampul, identitas buku, dan status ketersediaan materi
tetap publik. Tidak ada perubahan hak Editor untuk mengelola file buku dalam scope-nya.

## Alur pengunjung

Pengunjung anonim melihat tiga kartu dengan ikon kunci dan tombol **Login untuk melihat
materi promosi**. Tombol masing-masing mengarah ke `/login` dengan `returnTo` berupa
halaman buku dan anchor `#dummy`, `#product-knowledge`, atau `#flyer`. Sesudah login,
pengguna kembali ke materi yang dituju dan dapat memilih Lihat atau Unduh. Tautan daftar
mempertahankan tujuan yang sama. Buku tanpa file tetap menampilkan status belum tersedia
bagi pengguna login. Logout menutup preview yang terbuka dan mengosongkan URL viewer.

## Server dan Storage

Seluruh varian `GET /api/products/:identifier/resources/:kind`, termasuk `preview=1`
dan `download=1`, memakai `auth.getUser()` dari client sesi server sebelum mencari materi
atau menerbitkan URL file. Tanpa sesi terverifikasi, endpoint mengembalikan 401. Buku tetap
harus published; login tidak membuka draf melalui endpoint katalog. Pengguna Auth yang
sudah login dapat membaca materi published tanpa syarat Editor. Admin upload dan scope
draf tetap memakai guard/RLS yang sudah ada.

Bucket `book-materials` tetap privat. Migration `202611110004_authenticated_book_materials.sql`
mencabut SELECT Storage serta eksekusi helper publik dari anon. Policy authenticated
memerlukan `auth.uid()` dan path yang direferensikan buku published, meliputi seluruh
empat jenis file. Policy Editor per jenjang tetap berlaku. Nama fungsi historis
`can_access_public_book_material` dipertahankan untuk kompatibilitas; kini memerlukan login.
Tidak ada file, UUID buku, atau metadata yang dihapus atau dipindahkan.

Endpoint file memberi `Cache-Control: private, no-store`. URL bertanda tangan berlaku
60 detik dan hanya diterbitkan setelah verifikasi sesi. URL yang sudah diterbitkan tetap
berlaku sampai habis waktunya, termasuk jika logout; tidak ada pencabutan URL instan.
Status materi publik hanya mengirim boolean/format, tanpa URL bertanda tangan atau isi file.

## Rollout dan rollback

Terapkan migration setelah seluruh migration sebelumnya, kemudian deploy aplikasi ini
dalam window yang sama. Migration dahulu menutup akses Storage anonim; aplikasi lama yang
memakai client anonim untuk file akan gagal membuka materi sampai versi baru aktif.
Jangan membuat bucket public atau memakai service-role client untuk pembacaan materi.
Database baru memakai bundle `supabase/setup.sql` berisi 48 migration. Database existing
harus memakai migration incremental; jangan jalankan ulang setup.

Pengguna mengonfirmasi migration sudah aktif di Supabase. Agent belum memverifikasi
Auth/RLS live; pengujian database menggunakan PostgreSQL terisolasi. Verifikasi di tujuan:
anon tidak dapat membuka file melalui API ataupun Storage; Sales/Editor dapat membuka
materi published; Sales dan Editor lintas scope tetap tidak dapat membaca draf.

Rollback aman dapat menjalankan UI lama sambil mempertahankan penguncian Storage; file
pada aplikasi lama mungkin tidak tersedia. Memulihkan akses anonim merupakan perubahan
kebijakan terpisah: jika memang disetujui, pulihkan hanya definisi helper dan policy SELECT
dari `202610160001_public_dummy_books.sql`. Jangan menjalankan ulang migration historis
lain atau menghapus file sebagai rollback.

## Verifikasi

- `node scripts/verify-protected-materials.mjs`: handler/repository nyata dengan fixture,
  anon dan sesi kedaluwarsa ditolak sebelum pencarian/signing, semua preview/unduhan login,
  no-store, pilihan PDF/PPT, TTL, dan pembatasan published.
- `node scripts/verify-public-materials.mjs` dengan `PGLITE_MODULE_PATH`: rangkaian kebijakan
  historis lalu aturan final login wajib, penolakan anonim, scope draf, preservasi dan retry.
- `node scripts/verify-material-scroll-browser.mjs` dengan `PLAYWRIGHT_MODULE_PATH`: tiga
  tombol login, tujuan materi setelah login, serta viewer seluruh materi pada desktop/mobile.
- `node scripts/verify-supabase-setup.mjs`: bundle dan migration incremental konsisten.

Fixture tidak membuktikan Auth/RLS atau file Supabase live. Build lokal tidak berarti deploy.
