# Pendaftaran dan login dengan NIP

Pengguna mendaftar dan masuk memakai NIP serta kata sandi, tanpa email. NIP berupa teks
1–32 digit; nol awal dipertahankan. Katalog dan materi published tetap publik. Dokumen ini
menggantikan ketentuan pendaftaran email dan pemilihan hak Editor secara bebas.

## Sumber hak akses aktif (10 November 2026)

Setelah migration `202611100001_retire_admin_memberships.sql`, role dan status super
hanya dibaca dari `account_memberships`. Jenjang Editor tetap berada di `editor_scopes`
untuk mendukung lebih dari satu jenjang per akun. `employee_registry` menyimpan NIP,
hubungan Auth, dan role/jenjang awal pendaftaran; registry bukan sumber izin aktif.
Password dan akun login tetap dikelola Supabase Auth.

Alur daftar tetap memvalidasi NIP yang belum diklaim di server, mengambil role/jenjang
dari registry, lalu membuat hubungan NIP, membership, dan scope secara atomik melalui
trigger. Pendaftaran biasa tidak pernah memberi `is_super=true`. Perubahan akses setelah
daftar dilakukan melalui membership/scope oleh pengelola, bukan mengubah registry saja.

Rollout database existing:

1. Cadangkan database. Pastikan akun Editor super yang sah sudah mempunyai
   `account_memberships.role='editor'`, `is_super=true`, dan hubungan NIP terverifikasi.
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
4. Uji login NIP, session Sales/Editor biasa/super, Favorit, dan CRUD lintas jenjang.
   Akun Auth, password, NIP, membership, scope, dan Favorit tidak diubah migration ini.

Rollback: jalankan `supabase/rollback/202611100001_restore_admin_memberships.sql`
sebelum mengembalikan aplikasi/script lama. Tabel dan fungsi admin lama dipulihkan;
izin aktif pada membership/scope tetap dipertahankan. Arsip mencerminkan membership
admin sebelum migration, sehingga pengelola perlu meninjau ulang hak legacy sebelum
mengaktifkan versi lama. Jangan mengubah arsip selama aplikasi baru berjalan.

Database baru memakai `supabase/setup.sql` berisi 44 migration. Verifikasi terisolasi:
`PGLITE_MODULE_PATH` menunjuk `dist/index.js` PGlite, lalu jalankan
`node scripts/verify-account-access.mjs` dan `node scripts/verify-supabase-setup.mjs`.
Uji ini memeriksa pemeliharaan data, penolakan eskalasi izin, isolasi arsip, retry,
dan rollback; tidak membuktikan kondisi Auth/RLS Supabase live.

## Setup dan tabel pegawai

Database existing: cadangkan data lalu terapkan migration berurutan sampai
`supabase/migrations/202611060001_employee_nip_auth.sql`. Jangan menjalankan ulang `setup.sql`.
Database baru: gunakan `supabase/setup.sql`, yang menggabungkan 44 migration.

Migration NIP membuat tabel **kosong**, tanpa pegawai atau akun otomatis:

| Kolom             | Kegunaan                                                                 |
| ----------------- | ------------------------------------------------------------------------ |
| `nip`             | Primary key berupa teks 1–32 digit.                                      |
| `role`            | `sales` (default) atau `editor`.                                         |
| `education_level` | NULL untuk Sales; wajib SD/SMP/SMA/SMK untuk Editor.                     |
| `user_id`         | ID Auth unik, NULL sebelum daftar; bisa diisi pengelola untuk akun lama. |
| `created_at`      | Waktu pencatatan pegawai.                                                |

Pengelola mengisi NIP nyata melalui SQL Editor/database owner atau tooling server tepercaya.
Contoh berikut hanya template yang harus diganti, tidak dijalankan otomatis:

```sql
insert into public.employee_registry (nip, role) values ('000123', 'sales');
insert into public.employee_registry (nip, role, education_level)
values ('000456', 'editor', 'SMP');
```

Jangan menyimpan password di registry; password tetap dikelola Supabase Auth. Anon tidak
dapat membaca/menulis registry. Akun authenticated hanya dapat membaca NIP/user ID miliknya
melalui RLS, tanpa role/jenjang registry atau pegawai lain. Penulisan hanya untuk pengelola.

## Alur akun

Setelah migration `202611100004_sales_areas.sql`, Sales mengisi area pada langkah kedua
halaman login. Kredensial tetap hanya NIP/password; area disimpan melalui endpoint profil
terautentikasi setelah login, bukan metadata role dari klien. Area lama dimuat ulang dan
tujuan awal tetap dipertahankan. Editor langsung menuju tujuannya seperti sebelumnya.
Area merupakan label mandiri sampai sumber resmi tim IT tersedia; bukan pembatas izin.
Ikuti [rollout, keamanan kolom, dan rollback area Sales](supabase.md#area-sales-yang-diisi-pengguna).

`POST /api/auth/register` menerima `nip`, `password`, `role`, serta `educationLevel` untuk
Editor. Zod memvalidasi input. Server mencocokkan role/jenjang dengan registry. NIP asing,
sudah diklaim, atau tidak cocok ditolak dengan pesan umum. Admin createUser membuat akun;
trigger mengunci row NIP dan mengikat Auth user, membership biasa, serta tepat satu scope
Editor secara atomik. Kegagalan membatalkan seluruh klaim. Tidak ada pemberian akses super,
penggantian sesi aktif, pengiriman email, atau pengembalian token saat daftar.

Supabase password authentication membutuhkan identitas email secara internal. Akun baru
memakai alias non-deliverable `NIP@nip.invalid`, dikonfirmasi server tanpa email. Alias tidak
diminta dalam formulir atau digunakan untuk reset password. Rujukan resmi:
[createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser) dan
[signInWithPassword](https://supabase.com/docs/reference/javascript/auth-signinwithpassword).

`POST /api/auth/login` mencocokkan NIP ke user ID lalu memverifikasi password Auth akun itu.
Akun lama boleh mempertahankan email Auth asli. Token dikembalikan hanya bila user ID cocok;
klien Supabase menyimpan sesi. Tujuan buku/Favorit tetap dipertahankan. Tanpa tujuan, Sales
menuju katalog dan Editor menuju dashboard. Guard memanggil `auth.getUser()` dan memeriksa
hubungan NIP sebelum membership/scope. RLS produk, Favorit, dan scope existing tetap berlaku.

Registry menetapkan hak saat daftar. Mengubah role/jenjang registry tidak otomatis mengubah
membership/scope existing; pengelola harus memperbarui tabel akses melalui provisioning.
Menghapus hubungan NIP menolak akses aplikasi tetapi bukan pencabutan semua token/RLS Auth.
Untuk pencabutan menyeluruh, nonaktifkan akun dan cabut sesi melalui Auth admin.

Tanpa email/faktor tambahan, orang yang mengetahui NIP belum diklaim dapat mendaftarkannya.
Pengelola mengendalikan distribusi NIP dan sengketa kepemilikan. Reset kata sandi dilakukan
pengelola melalui Auth admin setelah memverifikasi pegawai, tanpa reset mandiri via email.
Login tetap tunduk pada password throttling Auth. Admin createUser tidak memakai limit
pengiriman email signup; terapkan batas request di gateway hosting sesuai kebijakan operasional.

## Rollout dan akun lama

1. Cadangkan Auth user ID, membership, scope, dan Favorit. Terapkan migration, lalu isi registry.
2. Hubungkan setiap akun lama, termasuk Editor super, dengan NIP terverifikasi sebelum deploy.
   Jangan meminta akun lama daftar ulang. Contoh untuk row NIP yang sudah disiapkan:

   ```sql
   update public.employee_registry
   set user_id = '11111111-1111-4111-8111-111111111111'
   where nip = '000123' and user_id is null;
   ```

   Ganti UUID/NIP dengan data nyata dan pastikan tepat satu row berubah. Password, membership,
   status super, scope, dan Favorit lama dipertahankan. Akun legacy yang email Auth-nya belum
   terkonfirmasi tetap mengikuti aturan Auth existing; selesaikan statusnya melalui pengelola.

3. Konfigurasi public URL/key dan server-only `NUXT_SUPABASE_SECRET_KEY` sesuai `.env.example`.
   Modul Nuxt juga membaca `SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY` saat konfigurasi
   build; gunakan variabel `NUXT_SUPABASE_SECRET_KEY` untuk override runtime. Jangan memakai
   prefix PUBLIC untuk key admin. Restart server setelah environment berubah.
4. Nonaktifkan **Allow new users to sign up** di Supabase Auth. Jalur admin createUser tetap
   digunakan aplikasi; trigger menolak signup tanpa app metadata tepercaya. User metadata
   tidak dapat memalsukannya. Tidak perlu mematikan konfirmasi email global atau SMTP.
5. Deploy lalu uji daftar/login/logout, returnTo, Favorit terpisah, NIP asing/duplikat,
   Sales tanpa admin, serta Editor biasa/super dan pembatasan jenjang.

Provisioning super memakai `SUPER_ACCOUNT_EDITOR_NIP` selain kredensial yang ada.
Nilai default Editor super adalah `000000000` (9 digit). Untuk akun super existing yang
belum memiliki NIP, jalankan `node scripts/convert-super-nips.mjs` untuk membaca rencana,
lalu `node scripts/convert-super-nips.mjs --apply` untuk mengaitkannya. Editor super utama
mendapat `000000000`, Sales super berikutnya `000000001`, dan akun super tambahan mendapat
nomor 9 digit berikutnya. NIP yang sudah dipetakan dipertahankan saat script diulang.
Script menolak konflik dengan pegawai lain, tidak mengubah email Auth, password, membership,
scope, atau Favorit, dan memasukkan seluruh hubungan baru dalam satu transaksi insert.
Manifest hubungan baru tersimpan lokal di `.data/super-nip-conversion-*.json` (di-ignore).
Untuk rollback, pengelola menghapus hanya row registry dengan pasangan NIP/user ID dalam
manifest berstatus `applied`, setelah memeriksa bahwa hubungan itu belum diubah sejak konversi.
Jangan menghapus akun Auth atau mengubah hak akses sebagai rollback pemetaan login.

`npm.cmd run provision:super-accounts -- --check` tidak menulis. Script dapat mengaitkan row
NIP kosong tetapi menolak menimpa hubungan NIP yang sudah dimiliki akun lain. Jika pengaitan
berubah bersamaan atau satu tahap gagal, periksa hubungan akun lalu ulangi; script tidak
menghapus akun untuk menyembunyikan kegagalan. Script memang dapat mengubah password dan hak akun.

### Editor per jenjang

Editor SD/SMP/SMA/SMK melanjutkan nomor setelah Editor super `000000000` dan Sales
super legacy `000000001`: SD `000000002`, SMP `000000003`, SMA `000000004`, dan SMK
`000000005`. NIP adalah teks sembilan digit; nol awal dipertahankan. Pemetaan sembilan
digit yang sudah ada untuk Editor tersebut dipertahankan, tanpa penomoran ulang.

Untuk akun Editor lama yang email internalnya `editor<jenjang>@erlangga.com`, jalankan
`node scripts/convert-editor-nips.mjs` untuk melihat rencana, lalu
`node scripts/convert-editor-nips.mjs --apply` untuk mengaitkan NIP. Script memeriksa
keempat akun mempunyai role Editor biasa dan tepat satu scope yang sesuai. Seluruh
hubungan baru dimasukkan dalam satu transaksi insert, tanpa mengubah Auth, password,
membership, scope, atau Favorit. Benturan NIP, termasuk row NIP kosong yang sudah
disiapkan pengelola, ditolak tanpa ditimpa. Jalankan ulang setelah konflik diselesaikan.

Manifest hubungan baru tersimpan lokal di `.data/editor-nip-conversion-*.json`.
Rollback hanya menghapus pasangan NIP/user ID baru pada manifest `applied`, setelah
pengelola memastikan hubungan belum berubah. Jangan menghapus akun atau membership.

Untuk membuat/memperbarui akun lewat provisioning administratif, gunakan
`node scripts/provision-editor-accounts.mjs --check`, lalu
`node scripts/provision-editor-accounts.mjs`. Script memakai rencana NIP yang sama,
membuat akun Auth baru dengan metadata provisioning tepercaya tanpa registrasi biasa,
dan menyimpan registry, membership non-super, serta satu scope per jenjang. Kredensial
password/email internal tetap berasal dari `.env.editor-accounts`; menjalankan provisioning
dapat mengganti password. Setiap tahap diperiksa; jika terjadi kegagalan sebagian, periksa
akun/registry lalu ulangi. Pemetaan akun lama saja tidak memerlukan provisioning.

Uji lokal `node scripts/verify-editor-nip-conversion.mjs` memeriksa urutan, pemeliharaan
hubungan, benturan, dan retry tanpa mengakses Supabase.

Setelah server lokal aktif dengan katalog Supabase, jalankan
`node scripts/verify-editor-nip-login.mjs` untuk memeriksa empat NIP default dengan
password existing dari `.env.editor-accounts`, sesi non-super, serta akses API/RLS
antarjenjang. Script hanya login dan membaca data; tidak menjalankan provisioning atau
menulis katalog. Gunakan `EDITOR_TEST_BASE_URL` bila server bukan port 3000.

## Rollback dan pengujian

Tutup sementara pendaftaran, deploy kembali aplikasi versi email, lalu jalankan
`supabase/rollback/202611060001_email_auth.sql`. Trigger signup sebelumnya dipulihkan;
registry, akun, scope, membership, dan Favorit tidak dihapus. Aktifkan public signup hanya
jika memang kembali ke kebijakan email. Akun NIP baru tidak mempunyai email nyata; gunakan
lagi aplikasi NIP atau rencanakan pemetaan identitas sebelum mengharapkan login email lama.
Migration NIP dapat diterapkan ulang tanpa mereset hubungan NIP existing.

Uji PostgreSQL terisolasi: `scripts/verify-nip-auth.mjs` dengan `PGLITE_MODULE_PATH` menunjuk
`dist/index.js` PGlite. Uji UI port 3000: `scripts/verify-nip-browser.mjs` dengan
`PLAYWRIGHT_MODULE_PATH` menunjuk `index.mjs` Playwright. Fixture tidak membuktikan Auth/RLS
Supabase live. Migration, pemetaan akun, dan pengaturan Auth live harus diperiksa di tujuan.
