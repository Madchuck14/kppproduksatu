# Pendaftaran dan login dengan NIK

Pengguna mendaftar dan masuk memakai NIK serta kata sandi, tanpa email. NIK berupa teks
1–32 digit; nol awal dipertahankan. Katalog tetap publik; materi promosi memerlukan login. Dokumen ini
menggantikan ketentuan pendaftaran email dan pemilihan hak Editor secara bebas.

## NIK alfanumerik (12 November 2026)

Istilah pada aplikasi sekarang **Nomor Induk Karyawan (NIK)**. Nama field API, kolom
`employee_registry.nip`, metadata `nip`, kode error `NIP_NOT_FOUND`, domain alias
`nip.invalid`, dan konfigurasi `SUPER_ACCOUNT_EDITOR_NIP` dipertahankan untuk kompatibilitas.
Login dan daftar memangkas spasi luar lalu mengubah huruf ke kapital; nol awal tetap utuh.
Format yang diterima adalah 1–32 huruf ASCII A–Z atau angka 0–9, tanpa spasi internal,
tanda baca, atau tanda hubung. Pengelola memasukkan nomor alfanumerik dalam huruf kapital
di registry, misalnya `KRY001A`. Alias Auth baru memakai `kry001a@nip.invalid` agar sesuai
normalisasi huruf kecil Supabase; metadata serta kunci registry tetap `KRY001A`.

Rollout: cadangkan database, terapkan `202611120001_employee_nik_alphanumeric.sql` setelah
migration sebelumnya, kemudian deploy aplikasi baru dan isi registry alfanumerik dari data
perusahaan yang sah. Migration hanya memperluas CHECK nomor dan menyesuaikan pemeriksaan
alias trigger. Instance lama tetap menerima akun numerik selama transisi; aktifkan penggunaan
nomor alfanumerik setelah semua instance aplikasi baru tersedia. Jangan menjalankan ulang
migration NIP historis sesudah migration ini karena akan mengembalikan definisi trigger lama.

Seluruh akun lama Sales/Editor, baik super maupun biasa, mempertahankan nomor numerik,
UUID, email Auth, kata sandi, membership, status super, scope, dan Favorit. Akun tersebut
tetap dapat digunakan sebagai akun master dengan hak akses yang sama. Tidak ada role master
baru, penomoran ulang, provisioning ulang, atau penimpaan hubungan registry. Primary key
nomor dan UNIQUE user ID tetap menjaga keunikan; nomor yang sudah diklaim tidak dapat
didaftarkan kembali. Jangan jalankan script konversi/provisioning untuk perubahan istilah ini.

Rollback aplikasi: pertahankan schema yang diperluas dan seluruh data akun; aplikasi lama
tetap dapat memakai nomor numerik. Akun alfanumerik memerlukan aplikasi baru. Jangan
mempersempit CHECK menjadi angka saja atau mengubah nomor akun untuk memaksakan rollback.
Migration dapat diulang tanpa mengubah data. Pengujian `scripts/verify-nip-auth.mjs`
mencakup format baru, alias huruf kecil, penolakan klaim ganda, serta pelestarian nomor dan
hak empat kombinasi akun lama. Ini pengujian PostgreSQL/endpoint terisolasi. Pengguna
mengonfirmasi migration NIK sudah diterapkan; Auth/RLS Supabase live belum diverifikasi
oleh agent.

## Sumber hak akses aktif (10 November 2026)

Setelah migration `202611100001_retire_admin_memberships.sql`, role dan status super
hanya dibaca dari `account_memberships`. Jenjang Editor tetap berada di `editor_scopes`
untuk mendukung lebih dari satu jenjang per akun. `employee_registry` menyimpan NIK,
hubungan Auth, dan role/jenjang awal pendaftaran; registry bukan sumber izin aktif.
Password dan akun login tetap dikelola Supabase Auth.

Alur daftar tetap memvalidasi NIK yang belum diklaim di server, mengambil role/jenjang
dari registry, lalu membuat hubungan NIK, membership, dan scope secara atomik melalui
trigger. Pendaftaran biasa tidak pernah memberi `is_super=true`. Perubahan akses setelah
daftar dilakukan melalui membership/scope oleh pengelola, bukan mengubah registry saja.

Rollout database existing:

1. Cadangkan database. Pastikan akun Editor super yang sah sudah mempunyai
   `account_memberships.role='editor'`, `is_super=true`, dan hubungan NIK terverifikasi.
   Baris admin lama tidak otomatis dipromosikan menjadi Editor super.
2. Deploy aplikasi dan script provisioning baru terlebih dahulu. Keduanya kompatibel
   dengan database sebelum migration dan tidak lagi memakai `admin_memberships`.
   Endpoint kompatibilitas `/api/admin/session` hanya menerima Editor super; dashboard
   Editor biasa tetap memakai guard Editor serta scope seperti sebelumnya.
3. Setelah semua instance lama berhenti, jalankan migration baru. Tabel
   `public.admin_memberships` dipindahkan ke `account_access_archive.admin_memberships`,
   schema privat tanpa akses anon/authenticated. Jangan mengekspos schema arsip di API.
   Data asli dipertahankan untuk rollback; aplikasi tidak membaca/menulis arsip.
   RPC kompatibilitas `is_admin()` sekarang membaca role Editor super dari membership.
4. Uji login NIK, session Sales/Editor biasa/super, Favorit, dan CRUD lintas jenjang.
   Akun Auth, password, NIK, membership, scope, dan Favorit tidak diubah migration ini.

Rollback: jalankan `supabase/rollback/202611100001_restore_admin_memberships.sql`
sebelum mengembalikan aplikasi/script lama. Tabel dan fungsi admin lama dipulihkan;
izin aktif pada membership/scope tetap dipertahankan. Arsip mencerminkan membership
admin sebelum migration, sehingga pengelola perlu meninjau ulang hak legacy sebelum
mengaktifkan versi lama. Jangan mengubah arsip selama aplikasi baru berjalan.

Database baru memakai `supabase/setup.sql` berisi 49 migration. Verifikasi terisolasi:
`PGLITE_MODULE_PATH` menunjuk `dist/index.js` PGlite, lalu jalankan
`node scripts/verify-account-access.mjs` dan `node scripts/verify-supabase-setup.mjs`.
Uji ini memeriksa pemeliharaan data, penolakan eskalasi izin, isolasi arsip, retry,
dan rollback; tidak membuktikan kondisi Auth/RLS Supabase live.

## Setup dan tabel pegawai

Database existing: cadangkan data lalu terapkan migration berurutan sampai
`supabase/migrations/202611060001_employee_nip_auth.sql`. Jangan menjalankan ulang `setup.sql`.
Database baru: gunakan `supabase/setup.sql`, yang menggabungkan 49 migration.

Migration NIK membuat tabel **kosong**, tanpa pegawai atau akun otomatis:

| Kolom             | Kegunaan                                                                 |
| ----------------- | ------------------------------------------------------------------------ |
| `nip`             | Primary key berupa teks 1–32 digit.                                      |
| `role`            | `sales` (default) atau `editor`.                                         |
| `education_level` | NULL untuk Sales; wajib SD/SMP/SMA/SMK untuk Editor.                     |
| `user_id`         | ID Auth unik, NULL sebelum daftar; bisa diisi pengelola untuk akun lama. |
| `name`            | Nama resmi pegawai; ditambahkan migration login Sales.                   |
| `work_area`       | Daerah kerja tetap dari data resmi perusahaan.                           |
| `created_at`      | Waktu pencatatan pegawai.                                                |

Pengelola mengisi NIK nyata melalui SQL Editor/database owner atau tooling server tepercaya.
Contoh berikut hanya template yang harus diganti, tidak dijalankan otomatis:

```sql
insert into public.employee_registry (nip, role) values ('000123', 'sales');
insert into public.employee_registry (nip, role, education_level)
values ('000456', 'editor', 'SMP');
```

Jangan menyimpan password di registry; password tetap dikelola Supabase Auth. Anon tidak
dapat membaca/menulis registry. Akun authenticated hanya dapat membaca NIK/user ID miliknya
melalui RLS, tanpa role/jenjang registry atau pegawai lain. Penulisan hanya untuk pengelola.

## Alur akun

Registry kini juga menyediakan `name` dan `work_area` resmi. NIK asing ditolak dengan
pesan **NIK tidak cocok dengan data pegawai perusahaan.** Login Sales berhasil wajib
tercatat per sesi pada `sales_login_events` sebelum token dikembalikan. Terapkan
migration `202611110002_sales_login_events.sql` sebelum deploy. Lihat
[rollout, dashboard penggunaan, dan rollback](sales-dashboard.md).

Sales dan Editor langsung menuju tujuan awal setelah login NIK/password berhasil.
Pendaftaran dan login tidak meminta area Sales; ringkasan serta pengubahan area tidak
lagi ditampilkan pada header. Data area lama dan endpoint profil tetap dipertahankan
untuk kompatibilitas, tanpa perubahan hak akses atau penghapusan data akun.

`POST /api/auth/register` menerima `nip`, `password`, `role`, serta `educationLevel` untuk
Editor. Zod memvalidasi input. Server mencocokkan role/jenjang dengan registry. NIK asing,
sudah diklaim, atau tidak cocok ditolak dengan pesan umum. Admin createUser membuat akun;
trigger mengunci row NIK dan mengikat Auth user, membership biasa, serta tepat satu scope
Editor secara atomik. Kegagalan membatalkan seluruh klaim. Tidak ada pemberian akses super,
penggantian sesi aktif, pengiriman email, atau pengembalian token saat daftar.

Supabase password authentication membutuhkan identitas email secara internal. Akun baru
memakai alias non-deliverable `nik-huruf-kecil@nip.invalid`, dikonfirmasi server tanpa email. Alias tidak
diminta dalam formulir atau digunakan untuk reset password. Rujukan resmi:
[createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser) dan
[signInWithPassword](https://supabase.com/docs/reference/javascript/auth-signinwithpassword).

`POST /api/auth/login` mencocokkan NIK ke user ID lalu memverifikasi password Auth akun itu.
Akun lama boleh mempertahankan email Auth asli. Token dikembalikan hanya bila user ID cocok;
klien Supabase menyimpan sesi. Tujuan buku/Favorit tetap dipertahankan. Tanpa tujuan, Sales
menuju katalog dan Editor menuju dashboard. Guard memanggil `auth.getUser()` dan memeriksa
hubungan NIK sebelum membership/scope. RLS produk, Favorit, dan scope existing tetap berlaku.

Registry menetapkan hak saat daftar. Mengubah role/jenjang registry tidak otomatis mengubah
membership/scope existing; pengelola harus memperbarui tabel akses melalui provisioning.
Menghapus hubungan NIK menolak akses aplikasi tetapi bukan pencabutan semua token/RLS Auth.
Untuk pencabutan menyeluruh, nonaktifkan akun dan cabut sesi melalui Auth admin.

Tanpa email/faktor tambahan, orang yang mengetahui NIK belum diklaim dapat mendaftarkannya.
Pengelola mengendalikan distribusi NIK dan sengketa kepemilikan. Reset kata sandi dilakukan
pengelola melalui Auth admin setelah memverifikasi pegawai, tanpa reset mandiri via email.
Login tetap tunduk pada password throttling Auth. Admin createUser tidak memakai limit
pengiriman email signup; terapkan batas request di gateway hosting sesuai kebijakan operasional.

## Rollout dan akun lama

1. Cadangkan Auth user ID, membership, scope, dan Favorit. Terapkan migration, lalu isi registry.
2. Hubungkan setiap akun lama, termasuk Editor super, dengan NIK terverifikasi sebelum deploy.
   Jangan meminta akun lama daftar ulang. Contoh untuk row NIK yang sudah disiapkan:

   ```sql
   update public.employee_registry
   set user_id = '11111111-1111-4111-8111-111111111111'
   where nip = '000123' and user_id is null;
   ```

   Ganti UUID/NIK dengan data nyata dan pastikan tepat satu row berubah. Password, membership,
   status super, scope, dan Favorit lama dipertahankan. Akun legacy yang email Auth-nya belum
   terkonfirmasi tetap mengikuti aturan Auth existing; selesaikan statusnya melalui pengelola.

3. Konfigurasi public URL/key dan server-only `NUXT_SUPABASE_SECRET_KEY` sesuai `.env.example`.
   Modul Nuxt juga membaca `SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY` saat konfigurasi
   build; gunakan variabel `NUXT_SUPABASE_SECRET_KEY` untuk override runtime. Jangan memakai
   prefix PUBLIC untuk key admin. Restart server setelah environment berubah.
4. Nonaktifkan **Allow new users to sign up** di Supabase Auth. Jalur admin createUser tetap
   digunakan aplikasi; trigger menolak signup tanpa app metadata tepercaya. User metadata
   tidak dapat memalsukannya. Tidak perlu mematikan konfirmasi email global atau SMTP.
5. Deploy lalu uji daftar/login/logout, returnTo, Favorit terpisah, NIK asing/duplikat,
   Sales tanpa admin, serta Editor biasa/super dan pembatasan jenjang.

Provisioning super memakai `SUPER_ACCOUNT_EDITOR_NIP` selain kredensial yang ada.
Nilai default Editor super adalah `000000000` (9 digit). Untuk akun super existing yang
belum memiliki NIK, jalankan `node scripts/convert-super-nips.mjs` untuk membaca rencana,
lalu `node scripts/convert-super-nips.mjs --apply` untuk mengaitkannya. Editor super utama
mendapat `000000000`, Sales super berikutnya `000000001`, dan akun super tambahan mendapat
nomor 9 digit berikutnya. NIK yang sudah dipetakan dipertahankan saat script diulang.
Script menolak konflik dengan pegawai lain, tidak mengubah email Auth, password, membership,
scope, atau Favorit, dan memasukkan seluruh hubungan baru dalam satu transaksi insert.
Manifest hubungan baru tersimpan lokal di `.data/super-nip-conversion-*.json` (di-ignore).
Untuk rollback, pengelola menghapus hanya row registry dengan pasangan NIK/user ID dalam
manifest berstatus `applied`, setelah memeriksa bahwa hubungan itu belum diubah sejak konversi.
Jangan menghapus akun Auth atau mengubah hak akses sebagai rollback pemetaan login.

`npm.cmd run provision:super-accounts -- --check` tidak menulis. Script dapat mengaitkan row
NIK kosong tetapi menolak menimpa hubungan NIK yang sudah dimiliki akun lain. Jika pengaitan
berubah bersamaan atau satu tahap gagal, periksa hubungan akun lalu ulangi; script tidak
menghapus akun untuk menyembunyikan kegagalan. Script memang dapat mengubah password dan hak akun.

### Editor per jenjang

Editor SD/SMP/SMA/SMK melanjutkan nomor setelah Editor super `000000000` dan Sales
super legacy `000000001`: SD `000000002`, SMP `000000003`, SMA `000000004`, dan SMK
`000000005`. NIK adalah teks sembilan digit; nol awal dipertahankan. Pemetaan sembilan
digit yang sudah ada untuk Editor tersebut dipertahankan, tanpa penomoran ulang.

Untuk akun Editor lama yang email internalnya `editor<jenjang>@erlangga.com`, jalankan
`node scripts/convert-editor-nips.mjs` untuk melihat rencana, lalu
`node scripts/convert-editor-nips.mjs --apply` untuk mengaitkan NIK. Script memeriksa
keempat akun mempunyai role Editor biasa dan tepat satu scope yang sesuai. Seluruh
hubungan baru dimasukkan dalam satu transaksi insert, tanpa mengubah Auth, password,
membership, scope, atau Favorit. Benturan NIK, termasuk row NIK kosong yang sudah
disiapkan pengelola, ditolak tanpa ditimpa. Jalankan ulang setelah konflik diselesaikan.

Manifest hubungan baru tersimpan lokal di `.data/editor-nip-conversion-*.json`.
Rollback hanya menghapus pasangan NIK/user ID baru pada manifest `applied`, setelah
pengelola memastikan hubungan belum berubah. Jangan menghapus akun atau membership.

Untuk membuat/memperbarui akun lewat provisioning administratif, gunakan
`node scripts/provision-editor-accounts.mjs --check`, lalu
`node scripts/provision-editor-accounts.mjs`. Script memakai rencana NIK yang sama,
membuat akun Auth baru dengan metadata provisioning tepercaya tanpa registrasi biasa,
dan menyimpan registry, membership non-super, serta satu scope per jenjang. Kredensial
password/email internal tetap berasal dari `.env.editor-accounts`; menjalankan provisioning
dapat mengganti password. Setiap tahap diperiksa; jika terjadi kegagalan sebagian, periksa
akun/registry lalu ulangi. Pemetaan akun lama saja tidak memerlukan provisioning.

Uji lokal `node scripts/verify-editor-nip-conversion.mjs` memeriksa urutan, pemeliharaan
hubungan, benturan, dan retry tanpa mengakses Supabase.

Setelah server lokal aktif dengan katalog Supabase, jalankan
`node scripts/verify-editor-nip-login.mjs` untuk memeriksa empat NIK default dengan
password existing dari `.env.editor-accounts`, sesi non-super, serta akses API/RLS
antarjenjang. Script hanya login dan membaca data; tidak menjalankan provisioning atau
menulis katalog. Gunakan `EDITOR_TEST_BASE_URL` bila server bukan port 3000.

## Rollback dan pengujian

Tutup sementara pendaftaran, deploy kembali aplikasi versi email, lalu jalankan
`supabase/rollback/202611060001_email_auth.sql`. Trigger signup sebelumnya dipulihkan;
registry, akun, scope, membership, dan Favorit tidak dihapus. Aktifkan public signup hanya
jika memang kembali ke kebijakan email. Akun NIK baru tidak mempunyai email nyata; gunakan
lagi aplikasi NIK atau rencanakan pemetaan identitas sebelum mengharapkan login email lama.
Migration NIK dapat diterapkan ulang tanpa mereset hubungan NIK existing.

Uji PostgreSQL terisolasi: `scripts/verify-nip-auth.mjs` dengan `PGLITE_MODULE_PATH` menunjuk
`dist/index.js` PGlite. Uji UI port 3000: `scripts/verify-nip-browser.mjs` dengan
`PLAYWRIGHT_MODULE_PATH` menunjuk `index.mjs` Playwright. Fixture tidak membuktikan Auth/RLS
Supabase live. Migration, pemetaan akun, dan pengaturan Auth live harus diperiksa di tujuan.
