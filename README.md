# Creative Desk

Workspace Marketing × Creative: skrip (Video / Carrousel / Singlepost), worksheet produksi, QC, konfirmasi tayang, kalender rencana vs aktual, dan performa & target staff. Dibangun ulang dari prototipe `Content_Studio.html` — lihat [AUDIT.md](AUDIT.md) untuk temuan dan perbaikannya.

- **Server:** Node.js ≥ 22.13 (satu dependensi: `pg`).
- **Data:** MySQL 8 (mis. Google Cloud SQL, dikelola lewat phpMyAdmin) atau PostgreSQL — dipilih dari awalan `DATABASE_URL` (`mysql://` / `postgres://`). Untuk pengembangan lokal tanpa `DATABASE_URL`, server memakai PGlite (Postgres in-process) di `data/pglite`.
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
- **Jenis skrip** Reguler / Trend / Urgent. Trend dan Urgent tidak pernah dihitung telat (sifatnya mendadak); skrip Urgent yang belum tayang selalu tampil paling atas di tabel.
- **QC** hanya bisa diisi tim Marketing.
- **Target sesuai tanggal** — rencana kalender dianggap terpenuhi bila skripnya ready pada tanggal pengerjaan yang sama dengan tanggal rencana. Pencapaian & selisih di Kalender, Pencapaian di Dashboard Marketing, dan peringatan "skrip perlu disiapkan" (H+3) memakai aturan yang sama.
- **Hapus skrip** — tombol di detail skrip dan ikon tempat sampah di kolom Aksi. Penghapusan permanen (riwayat & file footage ikut terhapus). Leader Marketing bisa menghapus semua skrip; staff Marketing hanya skrip miliknya yang belum selesai diedit/tayang.
- **Telat & Terlewat** — Telat (Marketing): skrip belum ready padahal sudah lewat H-3 sebelum upload. Telat (Creative): edit belum selesai padahal sudah lewat H-1 (hari upload). Terlewat: tanggal upload sudah lewat dan belum tayang. Konten yang sudah terlewat tidak dihitung dobel sebagai telat.
- **Create Konten** (halaman penuh): tab Video / Carrousel / Singlepost, baris Informasi konten (Apps, Tanggal upload, Info skrip / judul konten, Jenis skrip, Kata kunci), lalu satu tabel Skrip · Footage/Keterangan · Caption. Tombol **B** / *I* muncul di kotak yang aktif (atau Ctrl+B / Ctrl+I). Status skrip, editor, dan talent diatur dari tabel antrean.
- **Draf otomatis** — isi editor disimpan di browser dan bisa dipulihkan setelah refresh atau saat dibuka lagi.
- Mengisi QC setelah Link hasil ada otomatis menandai Creative Done.
- **Pembaruan otomatis** — perubahan dari akun lain langsung tampil tanpa refresh (Server-Sent Events).
- **Pencarian** mencakup judul dan seluruh isi skrip/brief.
- **Konten kalender** — alur bulanan dalam 4 tampilan: **Ringkasan** (total rencana, aktual, selisih, pencapaian + kartu progres untuk semua platform), **Rencana Bulanan** (kalender Senin–Minggu per aplikasi & jenis konten, isi rencana harian, tandai warna = edit mandiri), **Aktual** (tabel selisih rencana vs aktual per aplikasi × jenis), **Evaluasi** (grafik per aplikasi, catatan otomatis, salin rencana ke bulan berikutnya, ekspor laporan CSV).
- **Footage** — skrip Video: tiap baris kolom FOOTAGE punya kolom tempel link dan tombol **Unggah dari komputer**; kolom ini boleh diubah/ditambah semua peran (juga dari detail skrip, tersimpan otomatis); Carrousel/Singlepost: kotak footage di bawah skrip. File yang diunggah disimpan di server CreaBoard dan link-nya ditulis ke kolom footage. 

Untuk mengosongkan data lokal: hentikan server, hapus folder `data/`, lalu jalankan lagi.

## Konfigurasi (environment variable)

| Variabel | Default | Keterangan |
|---|---|---|
| `PORT` | `3000` | Port HTTP |
| `HOST` | `0.0.0.0` | Alamat yang didengarkan (`127.0.0.1` = hanya komputer ini) |
| `DATABASE_URL` | – | `mysql://user:…@host:3306/marsel_creative_desk` (MySQL 8) atau `postgres://…` (Postgres). Kosong = PGlite lokal |
| `DB_CLIENT` / `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | `mysql` / – / `3306` (Postgres `5432`) / – / – / – | Pengganti `DATABASE_URL` bila diisi terpisah (dipakai saat `DATABASE_URL` kosong dan `DB_HOST` terisi). Password boleh berisi karakter khusus apa adanya. `DB_CLIENT`: `mysql` atau `postgres` |
| `DB_SSL_CA_FILE` | – | File sertifikat CA server MySQL (PEM) bila terhubung langsung lewat IP publik dengan SSL |
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

## Deploy ke Cloud Run (GitLab CI)

`.gitlab-ci.yml` hanya berjalan untuk tag git: `test` → `build-app-prod` (manual) → `deploy-prod` (manual), service `creative-desk-service` di `asia-southeast2`.

- **Variabel CI (group):** `GCP_PROJECT`, `GCP_REGISTRY_URL`, `SERVICE_ACCOUNT_KEY`; opsional `DISCORD_WEBHOOK_URL` untuk notifikasi.
- **Setup sekali:**
  1. Buat bucket `creative-desk-uploads` (asia-southeast2) dan beri service account runtime Cloud Run peran `roles/storage.objectUser` di bucket itu — folder footage `/app/data/uploads` di-mount ke bucket ini.
  2. Di service Cloud Run (Edit & deploy new revision → Variables & Secrets), isi `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (atau satu `DATABASE_URL`) dan `ADMIN_PASSWORD` — deploy berikutnya mempertahankannya. Tanpa database, container langsung berhenti. Simpan `DB_PASSWORD` di Secret Manager. DB di IP privat (`10.x`) perlu Networking → Connect to a VPC for outbound traffic.
- **Rilis:** `git tag v1.2.3 && git push origin v1.2.3`, lalu jalankan build dan deploy dari halaman pipeline.
- **Batasan:** unggah langsung maks 30 MB per file (Cloud Run menolak body > 32 MB) — footage lebih besar pakai link Drive. Service dibatasi 1 instance karena pembaruan otomatis disiarkan di memori proses.

## Operasional

- **Backup:** MySQL — ikut backup otomatis Cloud SQL / ekspor dari phpMyAdmin. Postgres — `pg_dump -n creaboard`. File footage ada di volume Docker `creaboard_uploads`.
- **Pindah Postgres → MySQL:** `SOURCE_DATABASE_URL=postgres://… DATABASE_URL=mysql://… node scripts/pg-to-mysql.js` — Postgres hanya dibaca, MySQL tujuan harus kosong, setiap tabel dicocokkan setelah disalin.
- **Tes terhadap MySQL:** `TEST_MYSQL_URL=mysql://root:…@host:3306 npm test` (membuat database `cd_test_*` sendiri).
- **Log:** `docker logs creaboard`.

## Struktur

```
server/   index.js (entry) · app.js (API) · rules.js (aturan alur & izin) · auth.js · db.js
public/   index.html · styles.css · js/ (core, main, worksheet, editor, calendar, team, settings, footage)
scripts/  seed-demo.js · pg-to-mysql.js
tests/    api.test.js · features.test.js   →  npm test
```

Semua aturan bisnis (izin per peran, urutan status, definisi kartu dashboard, KPI) ada di `server/rules.js`. UI hanya menampilkan hasil dari server, sehingga aturan tidak bisa dilewati dari browser.
