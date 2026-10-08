# Content Studio

Workspace Marketing × Creative: skrip (Video / Carrousel / Singlepost), worksheet produksi, QC, konfirmasi tayang, kalender rencana vs aktual, dan performa & target staff. Dibangun ulang dari prototipe `Content_Studio.html` — lihat [AUDIT.md](AUDIT.md) untuk temuan dan perbaikannya.

- **Server:** Node.js ≥ 22.13, tanpa dependensi npm (HTTP & SQLite bawaan Node).
- **Data:** satu file SQLite di `data/studio.db`, dipakai bersama seluruh tim.
- **Akses:** lewat browser di jaringan kantor; bisa di-*install* sebagai aplikasi (PWA) dari Chrome/Edge.

## Menjalankan

```bash
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

Untuk mengosongkan data: hentikan server, hapus folder `data/`, lalu jalankan lagi.

## Konfigurasi (environment variable)

| Variabel | Default | Keterangan |
|---|---|---|
| `PORT` | `3000` | Port HTTP |
| `HOST` | `0.0.0.0` | Alamat yang didengarkan (`127.0.0.1` = hanya komputer ini) |
| `DB_PATH` | `data/studio.db` | Lokasi file database |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_NAME` | `leader` / acak / `Leader` | Akun Leader pertama (hanya saat database kosong) |
| `SECURE_COOKIES` | – | Isi `1` bila diakses lewat HTTPS |

## Operasional

- **Backup:** salin file `data/studio.db` (beserta `studio.db-wal` jika ada) secara berkala, sebaiknya saat server berhenti.
- **Akses dari luar kantor:** pasang di server/VPS di belakang reverse proxy HTTPS (mis. Caddy/Nginx), lalu set `SECURE_COOKIES=1`.
- **Menjalankan terus-menerus:** gunakan service manager (mis. NSSM di Windows, systemd di Linux, atau `pm2`).

## Struktur

```
server/   index.js (entry) · app.js (API) · rules.js (aturan alur & izin) · auth.js · db.js
public/   index.html · styles.css · js/ (core, main, worksheet, editor, calendar, team, settings)
scripts/  seed-demo.js
tests/    api.test.js   →  npm test
```

Semua aturan bisnis (izin per peran, urutan status, definisi kartu dashboard, KPI) ada di `server/rules.js`. UI hanya menampilkan hasil dari server, sehingga aturan tidak bisa dilewati dari browser.
