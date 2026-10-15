# Staging dan serah-terima

## Vercel

Repository menyertakan `vercel.json` yang menetapkan framework Nuxt, instalasi `npm ci`, dan build `npm run build:vercel`. Build ini memakai preset Nitro `vercel` untuk mempertahankan SSR dan API, dengan output `.vercel/output`. Folder tersebut di-ignore dan tidak perlu di-commit. Build Node untuk Docker tetap memakai `npm run build`.

1. Import repository GitHub ke Vercel. Root Directory harus folder yang berisi `package.json`, `nuxt.config.ts`, dan `vercel.json` (root repository untuk proyek ini).
2. Pilih Node.js 22.x atau versi lebih baru yang didukung Vercel.
3. Pastikan Framework Preset adalah Nuxt dan matikan override Output Directory. Jangan isi `dist` atau `.output/public`; `outputDirectory: null` di konfigurasi memakai default framework.
4. Di Environment Variables, tetapkan `NUXT_CATALOG_SOURCE=demo` untuk katalog fixture dan `NUXT_PUBLIC_SITE_URL` ke URL deployment. Untuk katalog online, ikuti `docs/supabase.md`, gunakan `NUXT_CATALOG_SOURCE=supabase`, lalu tambahkan `NUXT_PUBLIC_SUPABASE_URL` dan `NUXT_PUBLIC_SUPABASE_KEY`. Atur environment Production dan Preview sesuai kebutuhan. File `.env` lokal tidak diunggah.
5. Commit dan push konfigurasi ini, lalu deploy commit terbaru. Redeploy deployment lama tetap memakai sumber dari commit lama. Setelah perubahan setting dashboard, redeploy commit yang sudah memuat konfigurasi ini; untuk pemeriksaan awal, nonaktifkan Use existing Build Cache.
6. Setelah status Ready, uji `/`, `/products`, detail produk melalui `/products/{kode-buku}` dan slug lama, produk tidak ditemukan (404), `/api/products` beserta pencarian, `/api/products/:identifier`, dan `/healthz`. Login dan admin membutuhkan Supabase yang sudah dikonfigurasi, termasuk Site URL/redirect allowlist domain deployment.

Build lokal tidak membuktikan deployment Vercel atau database/auth/RLS Supabase sudah bekerja. `/healthz` hanya memeriksa liveness aplikasi.

Referensi: https://vercel.com/docs/frameworks/full-stack/nuxt dan https://vercel.com/docs/project-configuration/vercel-json

### Unggahan materi besar

Vercel Functions membatasi body request hingga 4,5 MB. Form editor mengunggah Flyer,
Dummy Buku, dan PPT Produk langsung dari browser ke Supabase Storage menggunakan
signed upload token; API aplikasi hanya menerima JSON kecil untuk persiapan dan
penyelesaian. Batas aplikasi tetap 20 MB untuk PDF dan 50 MB untuk PowerPoint.
Sampul maksimal 2 MB tetap melalui API aplikasi.

Kedua endpoint memeriksa sesi editor dan lingkup buku. Endpoint penyelesaian memeriksa
path, ukuran, MIME, dan isi berkas dari Storage sebelum mengganti referensi materi.
Bucket tetap private, dan aturan akses materi yang sudah ada tetap berlaku.
Unggahan terputus atau gagal validasi dapat menyisakan objek tanpa referensi; objek
tersebut tidak dapat dibaca anonim. Hapus objek tanpa referensi melalui prosedur
pemeliharaan Storage setelah memastikan tidak dipakai oleh produk.

Setelah push perubahan ini, deploy commit terbaru di Vercel dan uji dengan akun
editor serta berkas asli. Terapkan migration PDF tampilan dan kebijakan Storage yang
didokumentasikan di `docs/supabase.md`.

Referensi: https://vercel.com/docs/functions/limitations

## Cloudflare Workers staging

Setelah `npm install` dan setup Supabase selesai:

1. Ubah `name` pada `wrangler.jsonc` jika nama Worker bentrok.
2. Ubah `vars.NUXT_CATALOG_SOURCE` menjadi `supabase`.
3. Tambahkan public runtime variables dalam `vars`: `NUXT_PUBLIC_SUPABASE_URL`, `NUXT_PUBLIC_SUPABASE_KEY`, dan `NUXT_PUBLIC_SITE_URL` (URL Worker staging). Public key boleh dipublikasikan, secret/service-role key tidak.
4. Jalankan:

```powershell
npx.cmd wrangler login
npm.cmd run build:cloudflare
npx.cmd wrangler deploy --dry-run
npx.cmd wrangler deploy
```

`npm run deploy:staging` menggabungkan build dan publish. Setup folder ini belum membuat akun, Worker, database cloud, atau deployment online. Jangan menganggap `.env` otomatis menjadi runtime environment Worker; tetapkan melalui Wrangler vars atau Dashboard. Untuk local Worker preview gunakan `.dev.vars` (di-ignore) lalu `npx wrangler dev` setelah build Cloudflare.

Uji beranda, pencarian, detail, 404, API, login, role admin, dan `/healthz` di Worker. Perhatikan ukuran bundle, CPU, dan request limits free tier sebelum memilihnya untuk demo. Free tier bukan jaminan kapasitas untuk seluruh fitur ecommerce berikutnya.

Referensi: https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/nuxt/ dan https://nitro.build/deploy/providers/cloudflare

## Aplikasi di server klien

Compose menjalankan Nuxt sebagai container non-root. Compose ini tidak menjalankan seluruh stack
Supabase dan bukan reverse proxy.

```powershell
Copy-Item .env.production.example .env.production
# Isi URL/key Supabase dan domain produksi terlebih dahulu.
docker compose up -d --build
docker compose ps
```

App terikat ke `127.0.0.1:3000`. Pasang reverse proxy HTTPS yang dikelola klien ke app, misalnya
Nginx atau Caddy. Contoh Caddy:

```caddyfile
catalog.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

Sediakan DNS dan akses port 80/443 untuk TLS. Server perlu akses ke Supabase; jika nanti ada Midtrans/email, akses keluar ke layanan tersebut juga diperlukan. `/healthz` hanya liveness; verifikasi database dengan request katalog.

Jalankan `docker compose build`, cek healthcheck app, lalu uji pasangan PDF dan PPT/PPTX asli milik
klien sebelum handover.

## Pilihan layanan Supabase klien

**Managed:** klien menyediakan project Supabase miliknya; import schema/data dan pindahkan gambar, lalu ubah runtime environment. Serahkan ownership akun, billing, dan backup sesuai kesepakatan.

**Self-hosted:** siapkan stack Docker resmi Supabase yang versioned, domain HTTPS, SMTP jika dipakai, backup, dan monitoring. Validasi kebutuhan RAM/disk dengan tim infra. Repository ini belum menyertakan stack self-hosted Supabase.

**PostgreSQL biasa:** membutuhkan penggantian integrasi Supabase API, Auth, dan Storage. Itu perubahan arsitektur, bukan hanya mengganti connection string.

## Checklist handover

- Commit lockfile setelah install pertama dan catat versi Node/dependencies.
- Build Node dan Cloudflare, lint, serta typecheck lulus.
- Tentukan apakah user demo dibuang atau dipindahkan; migrasi Auth mengikuti prosedur Supabase, bukan hanya dump tabel produk.
- Export schema/data aplikasi dengan prosedur resmi yang sesuai source/target; jangan restore dump seluruh managed Supabase secara buta ke self-hosted.
- Export/import object gambar terpisah; dump PostgreSQL tidak berisi file gambar.
- Update domain, Supabase Auth settings, public URLs, dan environment; rotasi credentials saat ownership berpindah.
- Uji RLS, akun admin, gambar, katalog, dan backup/restore di target klien.
- Siapkan rollback dan tentukan PIC server/backup setelah serah-terima.
- Hapus data contoh dari produksi setelah data klien tersedia.

Referensi: https://supabase.com/docs/guides/self-hosting/docker
