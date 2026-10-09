# Content Studio

Workspace Marketing × Creative: skrip (Video / Carrousel / Singlepost), worksheet produksi, QC, konfirmasi tayang, kalender rencana vs aktual, dan performa & target staff. Dibangun ulang dari prototipe `Content_Studio.html` — lihat [AUDIT.md](AUDIT.md) untuk temuan dan perbaikannya.

- **Server:** Node.js ≥ 22.13 (satu dependensi: `pg`).
- **Data:** PostgreSQL — di produksi memakai Postgres dari Supabase self-hosted (`supabase-content`) di VPS. Untuk pengembangan lokal tanpa `DATABASE_URL`, server memakai PGlite (Postgres in-process) di `data/pglite`.
- **Akses:** lewat browser; bisa di-*install* sebagai aplikasi (PWA) dari Chrome/Edge. Produksi: https://creaboard.marseltech.cloud

## Menjalankan

```bash
npm install
npm start
```

Buka `http://localhost:3000`, atau `http://<IP-komputer-server>:3000` dari komputer lain di jaringan yang sama.

Saat pertama kali dijalankan dengan database kosong, server membuat akun **Leader Marketing** dan mencetak username serta password-nya di terminal. Login, lalu ganti password lewat **Setting → Ganti password**. Akun anggota tim lain dibuat lewat **Setting → Akun & Role**.

### Data demo (opsional)

```bash
npm run demo     # hanya jika database belum berisi konten
npm start
```

Semua akun demo memakai password `demo12345`: `leader` (Leader Marketing), `bima` (Leader Creative), `nadia` & `raka` (Marketing), `dimas` & `sinta` (Creative), `putri` (Talent).

Ada dua Leader: **Leader Marketing** (skrip, rencana kalender, konfirmasi tayang, target & performa staff Marketing) dan **Leader Creative** (produksi, editor, link hasil, target & performa staff Creative). Keduanya melihat semua konten dan dapat mengelola akun serta dropdown.

**Pembagian apps** (khusus tim Marketing; Setting → Akun, role & apps — bisa dipilih saat membuat akun): Leader Marketing menentukan apps yang dipegang tiap staff Marketing. Staff otomatis melihat semua konten di apps-nya, dan pilihan apps saat membuat skrip, filter, serta kalender dibatasi ke apps tersebut. Creative dan Talent tidak memakai pembagian apps. Demo: Nadia → JadiASN; Raka → JadiBUMN & JadiBeasiswa.

**Fitur kerja harian:**
- **Nomor skrip per jenis** — Video, Carrousel, dan Singlepost masing-masing bernomor mulai dari 1. Klik nomor atau kolom USP/Keyword untuk membuka skrip.
- **Jenis skrip** Reguler / Trend / Urgent. Urgent bertenggat H-0; Trend tidak pernah dihitung telat (sifatnya mendadak).
- **Hapus skrip** — tombol di detail skrip dan ikon tempat sampah di kolom Aksi. Penghapusan permanen (riwayat & file footage ikut terhapus). Leader Marketing bisa menghapus semua skrip; staff Marketing hanya skrip miliknya yang belum selesai diedit/tayang.
- **Telat & Terlewat** — Telat (Marketing): skrip belum ready padahal sudah lewat H-3 sebelum upload. Telat (Creative): edit belum selesai padahal sudah lewat H-1 (hari upload). Terlewat: tanggal upload sudah lewat dan belum tayang. Konten yang sudah terlewat tidak dihitung dobel sebagai telat.
- **Editor skrip** (halaman penuh): tab Video / Carrousel / Singlepost, field utama (Judul konten, Apps, Tanggal upload, Editor), **Detail lainnya** (Info skrip, Jenis skrip, tanggal pengerjaan, talent, meta lain, keterangan), lalu tabel **Bagian · Skrip & arahan · Footage / Ilustrasi** dengan tombol tambah/hapus bagian dan caption. Format teks: tombol **B** / *I* di tiap kotak atau Ctrl+B / Ctrl+I (ditulis sebagai `**tebal**` / `*miring*`).
- **Draf otomatis** — isi editor disimpan di browser dan bisa dipulihkan setelah refresh atau saat dibuka lagi.
- Mengisi QC setelah Link hasil ada otomatis menandai Creative Done.
- **Pembaruan otomatis** — perubahan dari akun lain langsung tampil tanpa refresh (Server-Sent Events).
- **Pencarian** mencakup judul dan seluruh isi skrip/brief.
- **Konten kalender** — alur bulanan dalam 4 tampilan: **Ringkasan** (total rencana, aktual, selisih, pencapaian + progres per aplikasi), **Rencana Bulanan** (kalender Senin–Minggu per aplikasi & jenis konten, isi rencana harian, tandai warna = edit mandiri), **Aktual** (tabel selisih rencana vs aktual per aplikasi × jenis), **Evaluasi** (grafik per aplikasi, catatan otomatis, salin rencana ke bulan berikutnya, ekspor laporan CSV).
- **Footage** — skrip Video: tiap baris kolom FOOTAGE punya kolom tempel link dan tombol **Unggah dari komputer**; kolom ini boleh diubah/ditambah semua peran (juga dari detail skrip, tersimpan otomatis); Carrousel/Singlepost: kotak footage di bawah skrip. File yang diunggah disimpan di server CreaBoard dan link-nya ditulis ke kolom footage. Semua unggahan terkumpul di **Setting → Link footage** per platform × jenis konten, tempat Leader juga menyimpan link folder Drive tiap kelompok.

Untuk mengosongkan data lokal: hentikan server, hapus folder `data/`, lalu jalankan lagi.

## Konfigurasi (environment variable)

| Variabel | Default | Keterangan |
|---|---|---|
| `PORT` | `3000` | Port HTTP |
| `HOST` | `0.0.0.0` | Alamat yang didengarkan (`127.0.0.1` = hanya komputer ini) |
| `DATABASE_URL` | – | Koneksi Postgres, mis. `postgres://creaboard_app:…@db:5433/postgres`. Kosong = PGlite lokal |
| `PGLITE_DIR` | `data/pglite` | Lokasi database PGlite (hanya bila `DATABASE_URL` kosong) |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_NAME` | `leader` / acak / `Leader` | Akun Leader pertama (hanya saat database kosong) |
| `SECURE_COOKIES` | – | Isi `1` bila diakses lewat HTTPS |
| `TRUST_PROXY` | – | Isi `1` bila di belakang nginx (IP asli dari `X-Real-IP` untuk pembatas login) |
| `UPLOAD_DIR` | `data/uploads` | Folder file footage yang diunggah (di Docker: volume `creaboard_uploads`) |
| `MAX_UPLOAD_MB` | `1024` | Batas ukuran satu file footage |

## Deploy di VPS (Docker + Supabase self-hosted)

1. Di Postgres `supabase-content`, buat role & schema khusus (sekali):
   ```sql
   create role creaboard_app login password '…';
   grant creaboard_app to postgres;
   create schema creaboard authorization creaboard_app;
   alter role creaboard_app set search_path = creaboard;
   ```
2. `git clone` repo ke `/opt/creaboard`, salin `.env.example` → `.env` dan isi `DATABASE_URL` serta `ADMIN_PASSWORD`.
3. `docker compose up -d --build` — container `creaboard` bergabung ke jaringan `supabase-content_default` dan hanya membuka `127.0.0.1:3300`.
4. Nginx meneruskan `creaboard.marseltech.cloud` → `127.0.0.1:3300`, HTTPS dari Let's Encrypt (certbot). Tambahkan `client_max_body_size` ≥ `MAX_UPLOAD_MB` untuk `/api/footage/upload` (dengan `proxy_request_buffering off`) dan `proxy_buffering off` untuk `/api/stream` (pembaruan otomatis).

Update: `cd /opt/creaboard && git pull && docker compose up -d --build`.

## Operasional

- **Backup:** data ada di schema `creaboard` pada Postgres `supabase-content` — ikut backup database Supabase, atau `pg_dump -n creaboard`. File footage ada di volume Docker `creaboard_uploads`.
- **Log:** `docker logs creaboard`.

## Struktur

```
server/   index.js (entry) · app.js (API) · rules.js (aturan alur & izin) · auth.js · db.js
public/   index.html · styles.css · js/ (core, main, worksheet, editor, calendar, team, settings, footage)
scripts/  seed-demo.js
tests/    api.test.js · features.test.js   →  npm test
```

Semua aturan bisnis (izin per peran, urutan status, definisi kartu dashboard, KPI) ada di `server/rules.js`. UI hanya menampilkan hasil dari server, sehingga aturan tidak bisa dilewati dari browser.
