# Data pegawai dan penggunaan Sales

## Alur akun

`employee_registry` adalah daftar pegawai resmi yang disiapkan pengelola sebelum
pendaftaran. `nip` merupakan business key unik berupa teks sehingga nol awal tetap
utuh. `name` menyimpan nama pegawai dan `work_area` menyimpan satu daerah kerja tetap.
Role/jenjang awal serta hubungan `user_id` mengikuti mekanisme registry NIP yang ada.
Data resmi dapat dimuat dari sistem pegawai perusahaan oleh pengelola; integrasi atau
sinkronisasi ke database eksternal belum tersedia.

Saat daftar, server mencocokkan NIP dengan registry. NIP tidak terdaftar mendapat
400 dengan kode `NIP_NOT_FOUND` dan pesan **NIP tidak cocok dengan data pegawai
perusahaan.** NIP yang sudah diklaim atau role/jenjang yang tidak cocok tetap ditolak.
Trigger mengunci dan mengklaim NIP secara atomik; formulir tidak boleh menetapkan nama,
daerah resmi, role lain, atau hak super. Kredensial tetap NIP/password.

Setelah Auth memverifikasi password dan hubungan NIP/user ID cocok, server membaca
membership aktif. Login Sales, termasuk Sales super, harus berhasil mencatat event
sebelum token dikembalikan ke browser. Login Editor tidak membuat event Sales.
Jika pencatatan gagal, login menghasilkan 503 dan server mencoba mencabut sesi lokal;
token tidak diberikan ke browser. Password salah, NIP asing, daftar akun, refresh token,
reload halaman, dan pemulihan sesi browser tidak membuat event.

## Model data dan akses

Migration `202611110002_sales_login_events.sql` menambahkan dua kolom nullable pada
registry dan tabel `sales_login_events`:

| Kolom          | Isi                                                                     |
| -------------- | ----------------------------------------------------------------------- |
| `id`           | UUID event                                                              |
| `user_id`      | FK ke Auth user Sales                                                   |
| `session_id`   | UUID sesi dari token yang diterbitkan Auth setelah password benar; unik |
| `logged_in_at` | Waktu server database, `timestamptz`                                    |

Tidak ada password, access token, refresh token, IP, atau lokasi perangkat yang disimpan.
UUID sesi hanya dipakai untuk deduplikasi: pencatatan ulang sesi sama tidak menambah
jumlah. Daerah tidak disalin ke event karena penempatan Sales tetap; laporan membaca
`employee_registry.work_area`. Mengubah data resmi akan mengubah pengelompokan laporan.
Event terhapus jika akun Auth dihapus melalui FK `ON DELETE CASCADE`.

RPC `record_sales_login` hanya boleh dipanggil `service_role`. Endpoint login mengambil
UUID sesi langsung dari hasil Auth, bukan dari body pengguna, dan RPC memeriksa membership
Sales serta hubungan registry. Anon dan authenticated tidak mendapat izin insert/update/delete
event atau execute RPC pencatatan. SELECT event lewat RLS hanya untuk Editor super.
Metadata registry tetap privat dengan privilege kolom existing; nama/daerah dikembalikan
khusus melalui RPC dashboard yang memeriksa ulang Editor super.

## Dashboard

Menu **Periksa Daerah Penjualan** membuka `/admin/daerah-penjualan`. Halaman, API, dan
RPC database hanya untuk Editor super; Sales super dan Editor biasa ditolak.
`GET /api/admin/sales-dashboard?page=1` memakai sesi terverifikasi dan RPC
`get_sales_dashboard`, tanpa client admin untuk membaca dashboard.
Respons `private, no-store` berisi maksimal 20 akun Sales per halaman, diurutkan berdasarkan
login terbaru lalu UUID. Halaman di luar hasil dijepit; input halaman tidak valid ditolak.

Tabel menampilkan NIP, nama resmi, daerah kerja, login terakhir dalam WIB, serta jumlah
login per Sales. Ringkasan menampilkan empat metrik:

- Total kejadian login hari ini, mulai 00.00 WIB sampai waktu pembacaan data.
- Total kejadian login minggu kalender ini, mulai Senin 00.00 WIB sampai waktu pembacaan.
- Daerah dengan login terbanyak hari ini beserta jumlah loginnya.
- Daerah dengan login terbanyak minggu ini beserta jumlah loginnya.

Batas periode dihitung database dalam `Asia/Jakarta`, terlepas dari zona waktu server.
`periods` pada respons berisi `asOf`, `todayStart`, `weekStart`, dan objek `today`/`week`
masing-masing dengan `loginEvents` serta `topAreas`. Semua daerah yang seri pada posisi
pertama ditampilkan, diurutkan berdasarkan nama. Jika tidak ada login, total nol dan
daftar daerah teratas kosong. Login dengan daerah belum diisi tetap masuk total tetapi
tidak masuk peringkat daerah. Event bertanggal masa depan tidak masuk periode.

Agregat memakai seluruh akun Sales aktif, bukan hanya halaman yang terbuka. Satu Sales
login sepuluh kali pada periode tersebut dihitung sepuluh login. Ini minggu kalender,
bukan tujuh hari bergulir. Field `usage` kumulatif tetap dikembalikan agar klien lama
kompatibel, tetapi tidak lagi menjadi kartu ringkasan atau tabel daerah pada halaman.

Angka berlaku sejak pencatatan diaktifkan. Tidak ada backfill dari timestamp Auth lama
karena timestamp itu bukan riwayat event lengkap. Akun lama tanpa event diberi label
**Belum ada login tercatat**; itu tidak berarti akun belum pernah memakai aplikasi.
Nama/daerah yang belum diisi pengelola diberi label yang jelas, tanpa nama atau daerah
buatan. Kegagalan database menampilkan error/retry, bukan angka nol palsu.
Ini statistik login, bukan status sedang online, pelacakan GPS, atau catatan logout.

## Rollout dan rollback

1. Cadangkan registry, membership, dan Auth. Terapkan migration `202611110002_sales_login_events.sql`
   lalu `202611110003_sales_login_periods.sql` setelah migration sebelumnya,
   sebelum deploy versi login baru. Jangan jalankan bundle setup pada database existing.
2. Isi `name` dan `work_area` berdasarkan data perusahaan yang benar. Kolom nullable menjaga
   akun lama tetap kompatibel; migration tidak mengubah NIP, role, scope, password, atau akun.
   Jangan memindahkan label area yang dulu diisi Sales menjadi penempatan resmi otomatis.
3. Deploy seluruh instance aplikasi. Selama instance lama masih berjalan, login di instance
   lama tidak tercatat. Key server NIP existing tetap dibutuhkan untuk mencatat login.
4. Uji daftar NIP asing/valid/duplikat, login Sales/Editor, deduplikasi, dashboard dan RLS
   lintas role pada lingkungan tujuan. Migration belum diterapkan ke Supabase live oleh agent.

Contoh pengisian berikut hanya template; ganti seluruh nilai dengan data resmi:

```sql
insert into public.employee_registry (nip, role, name, work_area)
values ('NIP_RESMI', 'sales', 'NAMA_RESMI', 'DAERAH_RESMI');

update public.employee_registry
set name = 'NAMA_RESMI', work_area = 'DAERAH_RESMI'
where nip = 'NIP_RESMI';
```

NIP nyata wajib berupa 1?32 digit. Untuk akun existing gunakan UPDATE berdasarkan NIP;
jangan menimpa atau mengosongkan `user_id`. Pengguna tidak mengisi daerah pada daftar/login.
Database baru memakai `supabase/setup.sql` berisi 48 migration.

Rollback aman: deploy aplikasi sebelumnya dan pertahankan kolom, tabel, serta event.
Aplikasi lama tetap dapat login tetapi tidak mencatat event baru. Tidak perlu DROP atau
DELETE data. Versi dashboard sebelumnya yang memakai timestamp Auth memiliki definisi
metrik berbeda; jangan menggabungkan angkanya sebagai riwayat event.

## Verifikasi

- `node scripts/verify-sales-login-events.mjs` dengan `PGLITE_MODULE_PATH`: preservation,
  deduplikasi sesi, agregat pengguna/daerah, batas hari/minggu WIB, daerah seri, periode kosong,
  timestamp database, retry migration, dan RLS/RPC.
- `node scripts/verify-nip-auth.mjs`: klaim NIP, enrollment tepercaya, login gagal,
  pencatatan sebelum token diberikan, dan kegagalan pencatatan yang mencabut sesi.
- `node scripts/verify-sales-dashboard.mjs`: guard API, no-store, validasi RPC, serta
  ekstraksi sesi dari hasil Auth dan penolakan token yang tidak memuat UUID sesi.
- `node scripts/verify-sales-dashboard-browser.mjs` dengan `PLAYWRIGHT_MODULE_PATH`:
  tabel nama/daerah, WIB, pagination, error/retry, mobile, dan penolakan Editor biasa.
  `SALES_DASHBOARD_TEST_BASE_URL` dapat menunjuk server build lokal.
- `node scripts/verify-supabase-setup.mjs`: bundle versus migration incremental.

Fixture tidak membuktikan data perusahaan, Auth/RLS Supabase live, atau deployment cloud.
