-- Demo-only data. Apply after all catalog migrations. Safe to run again.
begin;
insert into public.products (id, slug, title, author, synopsis, price, featured, published) values
  ('11111111-1111-4111-8111-111111111111', 'ruang-untuk-bertumbuh', 'Ruang untuk Bertumbuh', 'Penulis Contoh', 'Buku contoh tentang kebiasaan kecil, refleksi, dan perjalanan pengembangan diri.', 89000, true, true),
  ('22222222-2222-4222-8222-222222222222', 'cerita-dari-seberang', 'Cerita dari Seberang', 'Penulis Contoh', 'Novel contoh tentang pertemuan, perjalanan, dan cara menemukan jalan pulang.', 95000, true, true),
  ('33333333-3333-4333-8333-333333333333', 'belajar-melihat-dunia', 'Belajar Melihat Dunia', 'Penulis Contoh', 'Buku contoh untuk menjelajahi gagasan baru dan memahami dunia di sekitar kita.', 120000, true, true)
on conflict do nothing;
commit;
