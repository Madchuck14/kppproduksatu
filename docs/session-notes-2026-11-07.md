# Catatan sesi: autentikasi NIP

## Konversi akun super existing, 10 November 2026

Atas permintaan pengguna, dua akun super existing sudah dihubungkan ke NIP pada Supabase live:
Editor super `000000000`, Sales super `000000001`. Registry sebelumnya kosong. Perubahan hanya
menambah hubungan NIP ke user ID; email Auth, password, membership, scope, dan Favorit tetap.
Ini menggantikan keterangan belum ada penulisan live untuk bagian pemetaan super ini saja.

Script `scripts/convert-super-nips.mjs` menyediakan rencana tanpa mutasi dan `--apply` untuk
insert seluruh hubungan baru dalam satu transaksi. Script menolak konflik NIP, tidak menimpa
hubungan existing, dan mempertahankan nomor saat diulang. Akun super tambahan memperoleh
nomor 9 digit berikutnya. Manifest lokal `.data/super-nip-conversion-*.json` mencatat hubungan
yang dibuat sebagai acuan rollback terarah. Jangan menghapus akun Auth sebagai rollback.

`scripts/verify-super-nip-conversion.mjs`, ESLint skrip, Prettier, dan whitespace check lulus.
Default provisioning Editor super dan `.env.example` sekarang memakai `000000000`.
Login nyata melalui `/api/auth/login` di port 3000 mengembalikan 200 memakai password lama;
pemeriksaan browser juga menerima 200 dari endpoint session setelah login, tanpa fixture Auth.
Browser berhasil menuju `/admin`, dengan session `nip=000000000`, `role=editor`, dan
`isSuper=true`; sesi pemeriksaan kemudian logout. Pengujian awal sempat timeout karena form
dioperasikan sebelum hidrasi Vue selesai; pengulangan setelah hidrasi lulus tanpa perubahan aplikasi.
Tidak ada password atau token dicetak dalam hasil pemeriksaan.

## Pembaruan 10 November 2026

Implementasi NIP sudah disambungkan: formulir daftar/login memakai NIP dan kata sandi tanpa
email; endpoint register mencocokkan registry, role, dan jenjang sebelum admin createUser;
login memakai NIP dan menyimpan sesi Supabase. Guard akun/admin memeriksa hubungan NIP.
Alias internal Auth tidak dikembalikan sebagai identitas email dalam API session aplikasi.

Migration `202611060001_employee_nip_auth.sql` tetap membuat registry kosong; rollback
`supabase/rollback/202611060001_email_auth.sql` tersedia tanpa menghapus data. Bundle
`supabase/setup.sql` sudah diperbarui menjadi 39 migration. Provisioning super memerlukan NIP
dan menolak menimpa hubungan akun lain. Environment contoh lokal/produksi sudah dilengkapi.
Panduan terbaru: [setup dan rollout NIP](nip-auth.md). Catatan implementasi belum selesai
pada bagian 7 November di bawah adalah riwayat, bukan status saat ini.

Verifikasi yang sudah lulus:

- `scripts/verify-nip-auth.mjs`: PostgreSQL terisolasi untuk registry kosong, preservasi akun,
  klaim atomik/duplikat, scope Editor, RLS pegawai, metadata palsu, retry, rollback; endpoint
  register/login asli diuji dengan boundary registry/Auth mock, termasuk NIP asing, password
  salah, user ID salah, alias internal, identitas legacy, dan respons 429.
- `scripts/verify-supabase-setup.mjs` dan bundle `--check`: 39 migration incremental sama
  dengan setup gabungan, guard database existing dan transaksi rollback lulus.
- `scripts/verify-nip-browser.mjs` pada server pengguna **port 3000**: SSR/API katalog/detail,
  pencarian, missing-product 404, input Auth invalid, formulir tanpa email, konfirmasi password,
  pemilihan jenjang, daftar, login gagal/berhasil, returnTo Favorit, navigasi Sales, logout,
  mobile tanpa overflow, dan tanpa error hydration. Auth berhasil memakai intersepsi fixture
  browser, bukan mutasi Supabase live. Screenshot di `artifacts/nip-auth/` (di-ignore), sudah
  diperiksa visual. Jangan menyimpulkan login/RLS live lulus dari hasil fixture ini.
- Typecheck exit 0, tetapi tetap menampilkan diagnostic plugin dependency
  `vue-router/volar/sfc-route-blocks` (`ERR_PACKAGE_PATH_NOT_EXPORTED`).
- Lint: 0 error, 73 warning `vue/html-self-closing`. Format file implementasi dan whitespace lulus.
- Build Cloudflare lulus; ada warning circular chunk dari modul Supabase dan annotation Zod.
- Build Node juga lulus dan dijalankan terakhir; `.output` sekarang kembali memakai target Node.
  Build memunculkan warning dependency/circular chunk, tanpa error. Tidak menguji runtime Worker live.

Belum ada migration atau pengaturan Auth Supabase live diubah. Belum deploy, commit, atau push.
Untuk pemakaian nyata, pengelola perlu menerapkan migration, mengisi NIP, mengaitkan akun lama,
menyediakan key server, dan menutup public signup sesuai panduan. Kepemilikan NIP tanpa faktor
tambahan serta pemulihan password melalui pengelola dijelaskan pada panduan.

Catatan konfigurasi: pemeriksaan modul Nuxt Supabase lokal menunjukkan `SUPABASE_SECRET_KEY`
dan `SUPABASE_SERVICE_ROLE_KEY` juga dibaca saat konfigurasi build. Untuk override runtime,
gunakan `NUXT_SUPABASE_SECRET_KEY`. Ini memperjelas asumsi sementara pada catatan lama.

## Riwayat sesi 7 November 2026

Tanggal catatan: 7 November 2026. Pekerjaan dihentikan atas permintaan pengguna untuk dilanjutkan besok.

## Permintaan dan keputusan

- Pendaftaran dan login harus menggunakan Nomor Induk Pegawai (NIP).
- Sediakan tabel kosong untuk daftar NIP yang nantinya diisi pengelola; pendaftaran/login harus mencocokkan tabel tersebut.
- Pengguna sudah memilih **hanya NIP + kata sandi, tanpa email**, termasuk saat pendaftaran.
- Rancangan sementara: role dan jenjang diambil atau dicocokkan dengan registry yang dikelola pihak tepercaya. Jangan memberi akses Editor hanya berdasarkan input klien.

## Pemeriksaan yang dilakukan

- Membaca panduan repository, RTK, skill caveman, investigate-first, dan migration.
- Membaca README, dokumentasi arsitektur/Supabase/roadmap, schema autentikasi, formulir login/daftar, session guard, provisioning, dan skrip bundle/pengujian migrasi. Sebagian output dokumentasi terpotong; baca kembali bagian relevan saat melanjutkan.
- Sistem sebelum perubahan NIP menggunakan Supabase email/password. Pendaftaran Sales/Editor langsung per jenjang sudah ada dalam working tree.
- Memeriksa dokumentasi resmi Supabase `createUser` dan `signInWithPassword`, serta implementasi lokal `serverSupabaseServiceRole`.
- Working tree sudah berisi banyak perubahan sebelum sesi ini. Jangan menghapus atau menganggap seluruh diff sebagai hasil pekerjaan NIP.

## Perubahan yang sudah tersimpan pada sesi ini

1. `shared/schemas/auth.ts`: menambah `nipSchema`, mengganti email pada `loginSchema` menjadi NIP. Validasi sementara 1–32 digit, disimpan sebagai teks agar nol di depan tetap ada. Schema pendaftaran mewarisi perubahan ini.
2. `supabase/migrations/202611060001_employee_nip_auth.sql`: migration baru, belum diterapkan. Membuat tabel kosong `public.employee_registry` dengan `nip`, `role`, `education_level`, `user_id`, dan `created_at`. Ada PK NIP, user ID unik, FK, validasi pasangan role/jenjang, dan pembatasan akses. Pengguna authenticated hanya bisa membaca NIP/user ID miliknya; pengelola tepercaya menulis registry.
3. Migration tersebut mengganti trigger `assign_new_sales_account`: signup harus melalui jalur server tepercaya; registry dikunci saat klaim agar satu NIP tidak dipakai dua akun. Membership dan scope dibentuk dalam transaksi yang sama dari registry. Tidak memberikan status super. Ada jalur provisioning tepercaya melalui app metadata.
4. `server/utils/employee-registry.ts`: helper server untuk membaca registry memakai secret/service-role key, dengan validasi hasil query dan error terkontrol.
5. `server/api/auth/login.post.ts`: endpoint baru menerima NIP/password, mencocokkan registry, mencari identitas Auth terkait, lalu memverifikasi password. Mengembalikan token sesi kepada pemilik kredensial agar klien Supabase dapat menyimpan sesi. Belum dihubungkan ke formulir.
6. `server/utils/require-account.ts`: menambah pemeriksaan hubungan akun dengan registry setelah `auth.getUser()`, lalu menyertakan NIP pada hasil session.
7. `shared/types/account.ts`: menambah properti opsional `nip`.
8. `scripts/provision-super-accounts.mjs`: menambah app metadata `employee_provisioning` pada atribut admin Auth agar provisioning bisa melewati trigger signup publik yang baru. Belum menambah proses pengaitan NIP akun super.

## Kondisi saat berhenti — implementasi belum selesai

**Jangan deploy kondisi ini.** Schema sudah memakai NIP, tetapi endpoint register dan formulir masih memakai email. Ada ketidakcocokan kontrak dan kemungkinan error TypeScript.

- `server/api/auth/register.post.ts` masih implementasi lama: membaca `email` dari schema dan memanggil public `signUp`. Patch pengganti yang direncanakan gagal diterapkan; pengecekan terakhir memastikan file masih versi lama.
- `app/pages/login.vue` dan `app/pages/register.vue` masih input/alur email. Keduanya sudah memiliki perubahan dari pekerjaan sebelum sesi ini; edit secara terarah.
- Rencana endpoint register: validasi NIP/password/role/jenjang; cek registry tersedia dan belum diklaim; buat Auth user lewat admin `createUser`, dengan alias internal `${nip}@nip.invalid`, `email_confirm: true`, dan app metadata `employee_registration: true`. Alias adalah kebutuhan internal Supabase, bukan email pengguna; tidak mengirim email atau meminta konfirmasi email. Trigger memeriksa alias/role/jenjang dan mengikat NIP secara atomik.
- Rencana login UI: POST ke `/api/auth/login`, lalu `client.auth.setSession` memakai token respons, muat `/api/auth/session`, dan pertahankan tujuan navigasi yang tervalidasi.
- Akun lama belum dipetakan ke NIP. Data Auth, membership, scope, dan Favorit lama tidak dihapus. Pengelola perlu mengisi registry dan mengaitkan `user_id` akun lama sebelum rollout agar pengguna lama tetap dapat masuk. Jangan mengarang NIP atau otomatis mengikat akun tanpa bukti.
- Registry kosong berarti pendaftaran belum tersedia sampai pengelola memasukkan data.
- Belum ada mekanisme verifikasi kepemilikan tambahan: siapa pun yang mengetahui NIP yang belum diklaim berpotensi mendaftarkannya. Jelaskan batas ini dan pertimbangkan kebutuhan operasional pengguna tanpa menambahkan alur email yang sudah ditolak.

## Pekerjaan berikutnya

1. Periksa ulang diff dan isi file yang sudah dibuat; review desain trigger, role/scope, concurrency, pemetaan akun lama, serta jalur provisioning.
2. Selesaikan endpoint register dan integrasi kedua formulir. Ganti label/pesan email menjadi NIP; pertahankan kata sandi dan konfirmasi, penanganan error, serta returnTo.
3. Pastikan UI tidak menampilkan alias email internal sebagai identitas pengguna. Telusuri layout/dashboard dan gunakan NIP bila sesuai.
4. Lengkapi konfigurasi `.env.example`: runtime server membutuhkan `NUXT_SUPABASE_SECRET_KEY` atau konfigurasi server key yang benar. `SUPABASE_SECRET_KEY` yang ada dipakai skrip provisioning, tidak otomatis sama dengan runtime key Nuxt. Jangan membaca/menampilkan isi `.env`.
5. Dokumentasikan setup tabel kosong, pengisian NIP/role/jenjang, pengaitan akun lama/super, reset kata sandi melalui pengelola, urutan rollout, dan rollback tanpa menghapus data. Signup publik langsung perlu ditutup di pengaturan Auth; trigger juga menolak bypass public signup. Verifikasi admin createUser tetap bekerja sesuai konfigurasi.
6. Tambah rollback versioned yang mengembalikan fungsi trigger sebelumnya tanpa menghapus registry/akun, dengan urutan rollback aplikasi yang jelas.
7. Tambah migration ke `scripts/build-supabase-setup.mjs`, perbarui jumlah/versi section, lalu generate ulang `supabase/setup.sql`. Sesuaikan README dan pengujian bundle. Belum dilakukan.
8. Tambah pengujian bermakna: NIP tidak terdaftar, NIP sudah dipakai, nol awal, password salah, role/jenjang tidak cocok, metadata palsu/public signup, scope Editor, transaksi klaim, registry privat, akun lama, retry, rollback. Fixture Auth PostgreSQL yang ada belum memiliki `raw_app_meta_data`; perlu penyesuaian untuk migration baru.
9. Jalankan typecheck, lint, format file yang berubah, dan build yang sesuai. Smoke-test katalog, login/daftar, redirect, logout, Favorit, dan admin. Uji live Supabase hanya bila memang dikonfigurasi/diotorisasi; jangan menganggap demo membuktikan RLS/Auth live.

## Verifikasi dan keterbatasan

- Pemeriksaan terakhir memastikan migration, helper registry, dan endpoint login sudah ada; endpoint register masih versi email.
- Belum menjalankan typecheck, lint, Prettier, build, pengujian migrasi, maupun browser untuk perubahan NIP.
- Tidak menjalankan migration ke Supabase live, tidak membuat tabel live, tidak mengubah konfigurasi Auth live, dan tidak deploy.
- Tidak membuat commit atau push.
- Terminal sandbox gagal dimulai dengan `helper_unknown_error: setup refresh had errors`. Pembacaan melalui terminal di luar sandbox berhasil setelah persetujuan. Satu pemeriksaan dibatalkan pengguna, lalu pemeriksaan status terakhir berhasil saat membuat catatan ini.

Untuk melanjutkan: baca catatan ini, periksa `git diff`, lalu selesaikan alur NIP yang belum tersambung sebelum pengujian dan deployment.
