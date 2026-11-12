# KPP Produk Satu

**Nomor Induk Karyawan (NIK):** login/daftar menerima huruf dan angka, maksimal 32 karakter.
Terapkan `202611120001_employee_nik_alphanumeric.sql` sebelum deploy dan sebelum mengisi
registry alfanumerik. Nomor numerik serta seluruh identitas/hak akun master Sales dan Editor
lama tetap dipertahankan. Pengguna mengonfirmasi migration sudah diterapkan;
agent belum memverifikasi Auth/RLS live.
Lihat [rollout NIK dan kompatibilitas akun master](docs/nip-auth.md#nik-alfanumerik-12-november-2026).

**Materi promosi wajib login:** terapkan `202611110004_authenticated_book_materials.sql`
dan deploy versi ini untuk mengunci Dummy, PPT Produk, dan Flyer pada API/Storage.
Pengunjung anonim mendapat tombol login pada setiap materi. Migration belum diterapkan
live oleh agent. Lihat [rollout dan pengujian](docs/material-access.md).

**Login Sales dan data pegawai:** terapkan `202611110002_sales_login_events.sql`
dan `202611110003_sales_login_periods.sql`
sebelum deploy, lalu lengkapi nama serta daerah kerja resmi pada `employee_registry`.
Login Sales baru wajib tercatat sebelum sesi diberikan. Migration belum diterapkan
ke Supabase live oleh agent. Lihat [rollout dan rollback](docs/sales-dashboard.md).

**Hapus cabang Struktur Produk:** terapkan
`202611110001_delete_product_structure.sql` sebelum deploy versi ini. Aksi hapus permanen
menggantikan arsip pada UI, mencakup seluruh turunan, dan menolak cabang yang masih dipakai
buku draf/published. Tidak membersihkan arsip lama otomatis. Lihat [rollout dan rollback](docs/product-structure.md#migration-dan-rollback).
Migration belum diterapkan ke Supabase live oleh agent.

Hak akses aktif memakai `account_memberships` dan `editor_scopes`; `employee_registry`
menyimpan NIK dan ketentuan pendaftaran. Deploy aplikasi baru dahulu, lalu terapkan
`202611100001_retire_admin_memberships.sql` untuk mengarsipkan tabel admin lama secara
privat tanpa mengubah izin atau data akun. Ikuti [rollout dan rollback akses](docs/nip-auth.md#sumber-hak-akses-aktif-10-november-2026).

Login dan daftar memakai **NIK + kata sandi, tanpa email**. Terapkan migration
`202611060001_employee_nip_auth.sql`, isi tabel kosong `employee_registry`, dan kaitkan akun
lama dengan NIK sebelum deploy. Ikuti [setup, rollout, dan rollback NIK](docs/nip-auth.md).

Cleanup schema produk tersedia melalui migration `202610140001_remove_legacy_product_columns.sql`.
Kolom `description` dan `flyer_slide_paths` diarsipkan privat lalu dihapus; aplikasi memakai
sinopsis dan preview PPT Produk. Ikuti [urutan rollout dan rollback](docs/supabase.md#penghapusan-kolom-produk-lama-14-oktober-2026)
sebelum menerapkan migration. Perubahan ini belum diterapkan ke Supabase live oleh agent.

Fondasi katalog produk dengan Nuxt 4, Vue 3, TypeScript, Tailwind CSS, Nuxt UI, dan Supabase. Staging direncanakan di Cloudflare Workers; produksi memakai Node.js/Docker di infrastruktur klien.

## Mulai di Windows

Untuk menyiapkan database Supabase baru lewat satu file, gunakan
[`supabase/setup.sql`](supabase/setup.sql). File ini menggabungkan seluruh 49 migrasi
dengan komentar section dan penjelasan singkat. Ikuti [panduan file gabungan](docs/supabase.md#setup-satu-file-untuk-database-baru).
Database yang sudah terpasang tetap memakai migrasi incremental; jangan jalankan ulang file setup.

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

Editor super dapat membuka **Periksa Daerah Penjualan** untuk melihat nama/daerah resmi,
login terakhir, total login hari/minggu ini, dan daerah dengan login terbanyak beserta
jumlahnya pada kedua periode. Hari/minggu memakai WIB dan minggu dimulai Senin.
Terapkan `202611110002_sales_login_events.sql` dan `202611110003_sales_login_periods.sql` sebelum deploy, lalu lengkapi nama/daerah
pada registry pegawai. Pencatatan dimulai saat versi baru aktif, tanpa backfill.
Lihat [sumber data, akses, dan rollout](docs/sales-dashboard.md).

**Kelola Struktur Produk** tersedia untuk Editor super pada `/admin`. Hierarki per
jenjang mendukung kategori/subcabang, urutan, status produk opsional, serta hapus permanen subtree
yang ditolak bila masih dipakai buku termasuk draf. Form buku menyediakan pilihan jalur
yang bisa dicari; detail published menghubungkan ke struktur publik dengan cabang disorot.
Terapkan `202611100005_product_structure.sql` dan `202611110001_delete_product_structure.sql`
sebelum deploy. Produksi mulai tanpa seed;
lihat [model, rollout, dan pengujian Struktur Produk](docs/product-structure.md).

Pendataan area Sales sudah dihapus dari alur akun. Sales langsung melanjutkan ke
tujuan awal setelah login; header tidak lagi menampilkan area atau tautan Ubah area.
Data area lama dan API profil dipertahankan untuk kompatibilitas tanpa penghapusan data.

Editor super dapat membuka **Atur Halaman Kontak** dari dashboard untuk mengubah
judul/deskripsi, alamat, saluran kontak, peta Google Maps, dan dua jadwal operasional.
Terapkan `202611100002_contact_page.sql` sebelum deploy. Konten dibaca publik melalui SSR;
perubahan dibatasi di server dan RLS. Lihat [rollout Kontak](docs/supabase.md#pengaturan-halaman-kontak).

Nomor telepon mendukung tanda pengenal dan tombol **+ Tambah nomor telepon**, hingga
10 nomor. Terapkan `202611100003_contact_phones.sql` sebelum menjalankan versi ini;
nomor lama tetap tampil sebagai satu entri berlabel Telepon.

Hanya Editor super yang dapat memakai modal **Edit Klasifikasi Buku** untuk menambah kurikulum, divisi,
dan mata pelajaran per jenjang, serta menghapus opsi tambahan yang belum dipakai buku melalui
konfirmasi. Seluruh opsi termasuk divisi dan mapel awal dapat dihapus bila tidak dipakai buku.
Terapkan `202610150004_book_classifications.sql`, `202610150005_delete_book_classifications.sql`,
`202610150006_delete_all_book_classifications.sql`, dan
`202610160002_super_editor_classifications.sql` sebelum deploy. Beranda menampilkan
hanya divisi awal yang belum dihapus; `/divisi` menampilkan seluruh divisi
terdaftar, termasuk yang belum memiliki buku. Lihat [rollout klasifikasi](docs/supabase.md#klasifikasi-buku-dinamis).

ISBN dan kurikulum tersedia sebagai metadata buku opsional setelah migration
`202610140003_book_curriculum_isbn.sql`. Form Editor dapat menyimpan, mengedit, dan
mengosongkan kedua field; detail publik menampilkan nilainya. ISBN disimpan sebagai teks
tanpa spasi/tanda hubung agar nol di depan tidak hilang. Ikuti [rollout metadata](docs/supabase.md#kurikulum-dan-isbn-buku).

- Halaman beranda, katalog dengan pencarian, dan detail produk.
- URL detail memakai kode buku yang unik; URL slug lama tetap didukung untuk kompatibilitas.
  Judul boleh sama untuk edisi atau tahun terbit berbeda. Terapkan migration
  `202610150002_allow_duplicate_book_titles.sql` sebelum deploy.
- Carousel sampul buku pilihan di hero beranda, berganti setiap 5 detik; hanya Editor super mengelolanya
  lewat halaman `/admin/buku-pilihan`, maksimal 8 buku, dan dapat digeser pada carousel. Terapkan migration
  `202610150001_featured_books_limit.sql` sebelum mengelola pilihan buku di Supabase.
- API `GET /api/products` dan `GET /api/products/:identifier`, dengan validasi Zod.
- Pilihan data fixture atau Supabase; kegagalan Supabase tidak diam-diam diganti fixture.
- Login NIK/password dan dashboard Editor `/admin`: ringkasan, pencarian, filter jenjang/status,
  tambah/edit/hapus buku, publikasi, unggah sampul, dan pengelolaan buku pilihan. Akses dibatasi
  di server dan RLS.
- Login Sales/Editor dan pendaftaran keduanya di `/register`; NIK, role, dan jenjang harus cocok dengan data pegawai yang disiapkan pengelola.
- Provisioning Editor super dan Editor per jenjang melalui script lokal; akun Editor biasa juga dapat dibuat melalui pendaftaran per jenjang.
- Migration produk/admin membership, RLS, bucket gambar, dan seed demo. Tabel kategori lama tidak
  lagi dipakai aplikasi.
- Endpoint `/healthz` untuk liveness aplikasi (bukan pemeriksaan database).
- Konfigurasi Cloudflare Workers, Dockerfile, dan Compose untuk aplikasi Node.

Katalog tetap publik; Dummy, PPT Produk, dan Flyer memerlukan login. Sales dan Editor dapat memakai
Favorit pribadi setelah login NIK. Pendaftaran tidak membutuhkan email dan hanya menerima
NIK yang belum diklaim dalam registry. Role serta jenjang ditetapkan dari data pegawai;
pendaftaran tidak memberikan hak super. Data akun serta Favorit lama tetap dipertahankan.
Lihat [rollout NIK](docs/nip-auth.md), termasuk konfigurasi key server dan penutupan signup publik Auth.

Pagination tersedia pada dashboard Editor dan katalog publik. Cart, checkout, Midtrans, blog,
banner CMS, sitemap, dan structured data belum diimplementasikan.
Editor mengunggah dua berkas untuk PPT Produk: PDF untuk tombol **Tampilkan** dan PPT/PPTX asli
untuk tombol **Unduh PowerPoint**. Keduanya disimpan langsung di Supabase tanpa converter atau
server tambahan. Flyer dan Dummy Buku tetap PDF.
Materi disimpan pada bucket privat `book-materials`. Semua preview dan unduhan
memerlukan sesi terverifikasi, termasuk untuk buku published. Kebijakan akses anonim
pada migration historis telah digantikan `202611110004_authenticated_book_materials.sql`.
Lihat [aturan akses dan rollout](docs/material-access.md).

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
