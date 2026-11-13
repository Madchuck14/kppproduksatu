# Tambah Mapel untuk Editor

Terapkan `supabase/migrations/202611130001_editor_add_subjects.sql` sebelum menggunakan
menu **Tambah Mapel** di sidebar Editor biasa. Halaman `/admin/mapel` memakai form
klasifikasi yang sama, khusus mapel pada jenjang akses akun. Kurikulum dan divisi tetap
khusus Editor super melalui halaman klasifikasi sebelumnya.

Terapkan juga `supabase/migrations/202611130002_editor_delete_subjects.sql` untuk tombol
hapus mapel bagi Editor biasa. Tombol hapus membuka konfirmasi yang sama dengan Editor
super. Mapel yang dipakai buku termasuk draf tidak dapat dihapus. RPC memeriksa role
Editor dan scope jenjang sebelum menghapus; DELETE langsung ke tabel tetap ditolak.

POST/DELETE `/api/admin/classifications` memverifikasi sesi Editor. Repository menolak mapel di
luar scope dan jenis lain untuk Editor biasa; RLS INSERT dan RPC hapus menerapkan batas yang sama.
Tidak ada perubahan akun, scope, data buku, atau opsi yang sudah tersimpan.

Rollback: deploy aplikasi sebelumnya dan jalankan
`drop policy if exists classifications_scoped_subject_insert on public.book_classifications;`.
Mapel yang sudah ditambahkan tetap disimpan. Migration belum dijalankan pada Supabase live
oleh agent.

Untuk membatalkan izin hapus saja, deploy aplikasi sebelumnya lalu pulihkan hanya definisi
fungsi `delete_book_classification` beserta REVOKE/GRANT dari migration
`202610160002_super_editor_classifications.sql`. Jangan jalankan ulang seluruh migration
tersebut karena akan mengubah policy INSERT historis. Mapel yang sudah dihapus tidak
dipulihkan oleh rollback izin; pulihkan dari backup bila diperlukan.
