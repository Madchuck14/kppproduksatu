import { readFile, readdir, writeFile } from 'node:fs/promises'

// This is a mechanical bundle of versioned migrations, not a replacement history.
const sections = [
  [
    '202610040001_catalog.sql',
    'Fondasi katalog dan admin',
    'Membuat tabel produk, kategori, membership admin, RLS, dan bucket gambar publik.',
  ],
  [
    '202610050001_account_access.sql',
    'Role akun dan scope Editor',
    'Menambahkan membership Sales/Editor, status super, scope jenjang, dan fungsi pemeriksaan akses.',
  ],
  [
    '202610050002_editor_catalog.sql',
    'Katalog Editor per jenjang',
    'Menambahkan kode buku dan jenjang serta membatasi CRUD dan unggahan menurut akses Editor.',
  ],
  [
    '202610060001_book_publication_materials.sql',
    'Tahun terbit dan materi buku',
    'Menambahkan tahun terbit, path materi, bucket privat, dan aturan unggahan berkas.',
  ],
  [
    '202610060002_unique_book_title.sql',
    'Aturan judul unik historis',
    'Memasang aturan judul unik versi awal; bagian 26 nanti mencabut aturan ini.',
  ],
  [
    '202610060003_account_book_material_access.sql',
    'Akses materi berdasarkan akun',
    'Menyiapkan aturan akses materi untuk akun terdaftar tanpa memberikan hak Editor.',
  ],
  [
    '202610060004_public_book_material_access.sql',
    'Akses materi buku published',
    'Memperbarui fungsi akses materi berdasarkan status publikasi; aturan akhir diperbarui lagi pada bagian 21 dan 24.',
  ],
  [
    '202610060005_book_subjects.sql',
    'Mata pelajaran per jenjang',
    'Menambahkan field mata pelajaran dan validasi daftar awal menurut jenjang pendidikan.',
  ],
  [
    '202610070001_product_favorites.sql',
    'Favorit pribadi',
    'Membuat relasi favorit user dan buku beserta RLS pemilik serta pembersihan referensi melalui FK.',
  ],
  [
    '202610070002_smk_subjects.sql',
    'Mata pelajaran SMK',
    'Memperluas daftar mata pelajaran agar SMK menerima daftar yang sama dengan SMA.',
  ],
  [
    '202610090001_book_grades.sql',
    'Kelas buku',
    'Menambahkan kelas opsional dan memvalidasi pasangan kelas dengan jenjang pendidikan.',
  ],
  [
    '202610100001_book_highlights.sql',
    'Keunggulan buku',
    'Menambahkan daftar keunggulan buku dengan validasi jumlah dan panjang setiap poin.',
  ],
  [
    '202610100002_catalog_aggregate_counts.sql',
    'Agregasi jumlah katalog',
    'Membuat RPC jumlah buku per jenjang dan mapel tanpa mengunduh seluruh metadata produk.',
  ],
  [
    '202610130001_book_divisions.sql',
    'Divisi buku',
    'Menambahkan kode divisi opsional dengan enam pilihan awal, terpisah dari otorisasi jenjang.',
  ],
  [
    '202610130002_book_synopsis_target_market.sql',
    'Sinopsis dan target pasar',
    'Menambahkan sinopsis dan label target pasar tanpa menebak isinya dari data deskripsi lama.',
  ],
  [
    '202610130003_catalog_popularity.sql',
    'Popularitas dan koleksi katalog',
    'Membuat ledger akses harian, counter popularitas, serta RPC kelompok jenjang dan divisi.',
  ],
  [
    '202610130004_flyer_slide_previews.sql',
    'Preview Flyer historis',
    'Menyiapkan preview slide Flyer versi lama; kolom ini diarsipkan dan dihapus pada bagian 20.',
  ],
  [
    '202610130005_catalog_browse_book_details.sql',
    'Metadata buku pada ranking',
    'Melengkapi hasil RPC ranking dengan metadata publik buku tanpa mengekspos materi privat.',
  ],
  [
    '202610130006_product_presentation_previews.sql',
    'Preview presentasi historis',
    'Menyiapkan metadata gambar slide PPT versi lama sebelum beralih ke PDF tampilan.',
  ],
  [
    '202610140001_remove_legacy_product_columns.sql',
    'Arsip dan cleanup kolom lama',
    'Mengarsipkan deskripsi dan preview Flyer lama ke schema privat, lalu menghapus kolom yang tidak dipakai.',
  ],
  [
    '202610140002_public_promotional_materials.sql',
    'Flyer dan PPT publik',
    'Mengizinkan akses Flyer/PPT buku published tanpa login; Dummy dan materi draf tetap terlindungi.',
  ],
  [
    '202610140003_book_curriculum_isbn.sql',
    'Kurikulum dan ISBN',
    'Menambahkan metadata kurikulum/ISBN opsional serta memasukkannya ke hasil RPC ranking.',
  ],
  [
    '202610140004_server_presentation_previews.sql',
    'Status converter historis',
    'Menyiapkan status converter PPT versi lama; bagian berikutnya mengarsipkan metadata dan menggantinya.',
  ],
  [
    '202610140005_manual_product_knowledge_pdf.sql',
    'PDF tampilan dan PowerPoint unduhan',
    'Menambahkan PDF preview unggahan manual, memperbarui akses Storage, dan mengarsipkan kolom converter lama.',
  ],
  [
    '202610150001_featured_books_limit.sql',
    'Buku pilihan beranda',
    'Membatasi pilihan global menjadi delapan buku dan menyediakan RPC perubahan atomik sesuai scope Editor.',
  ],
  [
    '202610150002_allow_duplicate_book_titles.sql',
    'Judul boleh sama',
    'Mencabut indeks judul unik; kode buku dan slug tetap menjadi identifier unik masing-masing.',
  ],
  [
    '202610150004_book_classifications.sql',
    'Registry klasifikasi buku',
    'Membuat opsi kurikulum/divisi/mapel, mengisi daftar awal, serta mengganti validasi statis dengan registry.',
  ],
  [
    '202610150005_delete_book_classifications.sql',
    'RPC hapus klasifikasi',
    'Menambahkan RPC hapus dengan pemeriksaan scope dan referensi buku; perlindungan bawaan historis dicabut pada bagian 29.',
  ],
  [
    '202610150006_delete_all_book_classifications.sql',
    'Semua klasifikasi dapat dihapus',
    'Mengizinkan hapus permanen semua opsi yang tidak dipakai buku, termasuk divisi dan mapel awal.',
  ],
  [
    '202610160001_public_dummy_books.sql',
    'Dummy Buku publik',
    'Mengizinkan baca Dummy Buku published tanpa login; bucket dan materi draf tetap privat.',
  ],
  [
    '202610160002_super_editor_classifications.sql',
    'Klasifikasi hanya Editor super',
    'Membatasi tambah dan hapus klasifikasi ke Editor super melalui RLS dan RPC; pembacaan opsi tetap publik.',
  ],
]
const directory = new URL('../supabase/migrations/', import.meta.url)
const output = new URL('../supabase/setup.sql', import.meta.url)
const filenames = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()
if (JSON.stringify(filenames) !== JSON.stringify(sections.map(([name]) => name))) {
  throw new Error(
    'Daftar migrasi berubah. Lengkapi judul dan penjelasan section sebelum membuat ulang setup.sql.',
  )
}
const parts = [
  '-- KPP PRODUK SATU - SETUP SUPABASE LENGKAP',
  '-- Gabungan 31 migrasi berurutan, sampai versi 202610160002.',
  '-- Untuk database Supabase BARU yang belum memiliki tabel aplikasi ini.',
  '-- Jalankan seluruh file sebagai database owner melalui SQL Editor.',
  '-- Jangan jalankan pada database existing atau hanya memilih section tertentu.',
  '-- Satu transaksi: kegagalan membatalkan seluruh setup.',
  '-- Tidak menyertakan seed demo, akun/kredensial, rollback, atau diagnostics.',
  '-- Tidak mencatat versi pada supabase_migrations.schema_migrations.',
  '-- Untuk workflow CLI/database existing tetap gunakan migrations/ dan riwayat versinya.',
  '-- File dihasilkan oleh: node scripts/build-supabase-setup.mjs',
  '-- Ubah sumber migrasi, lalu buat ulang file ini; jangan mengedit hasil secara manual.',
  '',
  'begin;',
  '',
  '-- PRASYARAT DAN PELINDUNG DATABASE EXISTING',
  '-- Pastikan layanan Auth/Storage tersedia dan fondasi aplikasi belum terpasang.',
  `do $setup_guard$
begin
  if to_regclass('auth.users') is null
    or to_regprocedure('auth.uid()') is null
    or to_regclass('storage.buckets') is null
    or to_regclass('storage.objects') is null then
    raise exception 'setup.sql memerlukan database Supabase dengan Auth dan Storage tersedia.';
  end if;
  if to_regclass('public.products') is not null
    or to_regclass('public.admin_memberships') is not null
    or to_regclass('public.account_memberships') is not null
    or to_regclass('public.book_classifications') is not null then
    raise exception 'setup.sql hanya untuk database baru. Gunakan migrasi incremental untuk database existing.';
  end if;
end;
$setup_guard$;`,
]
for (const [index, [filename, title, description]] of sections.entries()) {
  const sql = (await readFile(new URL(filename, directory), 'utf8')).replace(/\r\n?/g, '\n').trim()
  if (!/^begin;\n[\s\S]*\ncommit;$/i.test(sql)) {
    throw new Error(`Pembungkus transaksi tidak dikenali: ${filename}`)
  }
  // Only remove the outer file-level transaction; preserve every SQL body verbatim.
  const body = sql
    .replace(/^begin;\n/i, '')
    .replace(/\ncommit;$/i, '')
    .trim()
  parts.push(
    '',
    '-- ============================================================================',
    `-- BAGIAN ${String(index + 1).padStart(2, '0')}: ${title.toUpperCase()}`,
    `-- Penjelasan: ${description}`,
    `-- Sumber: migrations/${filename}`,
    '-- ============================================================================',
    '',
    body,
  )
}
parts.push('', '-- SELESAI: simpan seluruh perubahan setup secara atomik.', 'commit;', '')
const bundle = parts.join('\n')
if (process.argv.includes('--check')) {
  if ((await readFile(output, 'utf8')) !== bundle)
    throw new Error(
      'setup.sql tidak sesuai sumber. Jalankan node scripts/build-supabase-setup.mjs.',
    )
  console.log('PASS: setup.sql sesuai dengan seluruh 31 migrasi dan komentar section.')
} else {
  await writeFile(output, bundle, 'utf8')
  console.log(`supabase/setup.sql: ${sections.length} bagian, ${Buffer.byteLength(bundle)} bytes.`)
}
