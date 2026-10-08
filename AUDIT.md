# Audit `Content_Studio.html` & perbaikan

Tanggal audit: 7 Oktober 2026 · Objek: prototipe satu file `Content_Studio.html` (± 60 KB, HTML + CSS + JS inline, data di `localStorage`).

Hasil akhir: prototipe dibangun ulang menjadi aplikasi tim **Content Studio** (server Node.js + SQLite) di folder ini. Fitur dan tampilan dipertahankan; temuan di bawah diperbaiki.

## Ringkasan

| # | Temuan | Tingkat | Status |
|---|---|---|---|
| 1 | Data hanya di `localStorage` — tiap anggota tim melihat data berbeda, tidak ada kolaborasi | Kritis | **Diperbaiki** — database bersama di server |
| 2 | Tidak ada login; akun/peran dipilih dari dropdown, pembatasan hanya di tampilan | Kritis | **Diperbaiki** — login password (scrypt), sesi cookie HttpOnly, izin dicek server |
| 3 | Nomor skrip = angka terbesar + 1 per browser → bentrok antar pengguna | Tinggi | **Diperbaiki** — nomor dari database |
| 4 | Kartu "Terlewat" menghitung semua skrip Ready dengan tanggal upload lewat, termasuk yang sudah selesai/tayang | Tinggi | **Diperbaiki** — Terlewat = tanggal upload lewat **dan belum tayang** |
| 5 | Tidak ada status tayang (kolom Upload hanya rencana; field `yt` tidak terpakai) | Tinggi | **Diperbaiki** — konfirmasi tayang dengan permalink + tanggal aktual; kartu "Siap upload" |
| 6 | Urutan status tidak dijaga: QC Done saat Creative belum selesai, Creative Done tanpa link, take Done saat skrip Draft | Tinggi | **Diperbaiki** — aturan alur di server (lihat bawah) |
| 7 | Revisi QC tidak punya siklus: setelah creative memperbaiki, status tetap "Revisi" | Sedang | **Diperbaiki** — link hasil baru otomatis mengembalikan QC ke "Belum QC" (menunggu QC ulang) |
| 8 | Timestamp tetap tercatat saat status mundur (Ready → Draft), merusak hitungan ketepatan waktu | Sedang | **Diperbaiki** — timestamp diisi saat masuk status selesai, dihapus saat mundur; dicatat server, tidak bisa diubah klien |
| 9 | Tiga basis tanggal bercampur: aktual kalender (tanggal dibuat, status apa pun), target H+3 (tanggal dibuat + Ready), KPI (tanggal upload) | Sedang | **Diperbaiki** — kalender & H+3 memakai definisi sama: *skrip Ready dengan tanggal pengerjaan tsb.*; KPI tetap per tanggal upload (aturan H-3/H-1), dijelaskan di UI |
| 10 | Demo `loadFullDemo` menambah +1 ke setiap target KPI | Rendah | **Diperbaiki** — data demo dibuat lewat API dengan target apa adanya |
| 11 | Skrip bisa diubah setelah hasil selesai tanpa jejak | Sedang | **Diperbaiki** — skrip terkunci saat Creative Done / sudah tayang; riwayat perubahan per konten |
| 12 | Dua orang mengedit baris sama → perubahan saling menimpa diam-diam | Sedang | **Diperbaiki** — revisi per konten, konflik → pesan "muat ulang" (HTTP 409) |
| 13 | Mengubah "kategori proses" pilihan dropdown mengubah arti data lama | Sedang | **Diperbaiki** — kategori pilihan yang sudah dipakai dikunci; pilihan dihapus = diarsipkan |
| 14 | Fungsi inti dibungkus ulang 5–8 kali (`render`, `openForm`, `saveForm`, `sheetMarkup`, `navigate`, `renderTeam`); kode mati (kalender versi 1, kontrol tim tersembunyi) | Sedang (maintainability) | **Diperbaiki** — modul terpisah (`public/js/*`), satu implementasi per fitur |
| 15 | Handler `onclick` inline dengan string yang dirakit (`onclick='setCalendarPlan(…)'`) | Sedang (keamanan) | **Diperbaiki** — event delegation + Content-Security-Policy tanpa script inline |
| 16 | Validasi rencana kalender/KPI hanya di klien | Rendah | **Diperbaiki** — validasi server (bilangan bulat ≥ 0, tanggal pengerjaan ≤ H-3/H-1 upload) |
| 17 | Dropdown terkunci tampak sama dengan yang bisa diedit | Rendah (UX) | **Diperbaiki** — dropdown terkunci tampil tanpa panah |

## Aturan alur yang kini dijaga server

1. **Skrip Ready** hanya bila isi wajib lengkap — Video: kata kunci, hook, ≥1 tahapan, CTA, ≥1 caption; Carrousel: tema, slide utama, CTA, caption, maks. 10 slide; Singlepost: judul, isi, CTA, caption.
2. **Take talent Done** (video) hanya setelah skrip Ready. Konten non-video otomatis "Tidak perlu".
3. **Creative Done** butuh skrip Ready, take selesai/tidak perlu, dan **link hasil** (http/https).
4. **QC** hanya setelah Creative Done; **Revisi wajib catatan**. Link hasil baru → QC kembali "Belum QC".
5. **Tayang** butuh QC Done + permalink + tanggal aktual (tidak di masa depan). Setelah tayang, skrip/status terkunci; hanya Leader yang bisa membatalkan status tayang.
6. Skrip tidak bisa dikembalikan ke Draft bila take/hasil sudah selesai; bentuk konten hanya bisa diubah saat Draft.
7. Tanggal upload tidak boleh sebelum tanggal pengerjaan.

## Hak akses per peran

Atas permintaan tim (7 Okt 2026), semua dropdown di tabel *Antrean produksi* dan *Create konten* dapat diubah oleh siapa pun yang melihat konten tersebut. Urutan proses (aturan di atas) tetap dijaga server, dan setiap perubahan tercatat di riwayat konten dengan nama pengubahnya.


| | Leader Marketing | Leader Creative | Staff Marketing | Staff Creative | Talent |
|---|---|---|---|---|---|
| Melihat konten | Semua | Semua | Miliknya + semua konten di apps-nya | Yang ditugaskan kepadanya | Video dengan nama talent = namanya |
| Buat akun & atur role | ✓ | ✓ | – | – | – |
| Target KPI | staff Marketing | staff Creative | – | – | – |
| Performa & target | tim Marketing | tim Creative | diri sendiri | diri sendiri | – |
| Membagi apps | ✓ (staff Marketing) | – | – | – | – |
| Buat konten / isi skrip | ✓ | – | ✓ (hanya apps-nya) | – | – |
| Edit kalender konten | ✓ | ✓ | ✓ (baris apps-nya) | lihat | lihat |
| Dropdown di tabel | ✓ | ✓ | ✓ | ✓ | ✓ |
| Link hasil | – | ✓ | – | ✓ (syarat Creative Done) | – |
| Catatan | ✓ | ✓ | ✓ | – | ✓ |
| Konfirmasi tayang | ✓ | – | ✓ (miliknya) | – | – |
| Atur dropdown | ✓ | ✓ | – | – | – |

Staff melihat konten bila ia pemilik/editor/talent konten tersebut; staff Marketing juga melihat semua konten di apps yang dipegangnya.

## Verifikasi

- `npm test` — 13 tes API (login, CSRF, izin per peran, alur status, siklus revisi, kunci setelah tayang, timestamp mundur, konflik 409, Terlewat, kalender & H+3, KPI telat, dropdown, akun): **13/13 lulus**.
- Uji UI di Microsoft Edge (Leader, Creative, Talent): dashboard, worksheet, editor skrip, detail, kalender, performa; validasi tampil sebagai pesan yang jelas; tidak ada overflow horizontal di lebar 390 px.

## Yang belum dicakup

- Unggah file langsung (saat ini link hasil dari Drive/penyimpanan lain).
- Notifikasi/email; publikasi otomatis ke TikTok/Instagram.
- Status tayang per channel terpisah (saat ini satu permalink per konten).

## Audit UI/UX (putaran 2) & perbaikan

| Temuan | Perbaikan |
|---|---|
| Tabel 14 kolom; di layar 1366 px kolom Creative/Link/QC/Upload tersembunyi, baris ±90 px | Kolom No. & Konten menempel saat digeser; Apps/Bentuk/Dibuat digabung ke sel Konten (11 kolom); urutan kolom mengikuti peran (Creative: Creative → Link → QC dulu; Talent: Status take dulu); catatan 1 baris yang melebar saat diklik |
| Dashboard: antrean baru terlihat setelah scroll | Pengingat H+3 jadi satu baris, kartu ringkas satu strip, tabel di atas panel ringkasan |
| Status hampir semuanya biru | Warna semantik: hijau selesai, biru siap, **kuning = langkah berikutnya**, merah revisi/terlewat; legenda di bawah tabel |
| Dropdown langsung tersimpan tanpa batal; error hanya toast 4 detik | Toast "Batalkan" untuk setiap perubahan dropdown; error ditampilkan di sel yang bersangkutan + toast merah 7 detik |
| Worksheet tidak terpakai di ponsel; navigasi makan 3 baris | Tampilan kartu per konten di layar < 760 px; header ponsel satu baris dengan ikon Setting/Keluar |
| Ikon unicode tidak konsisten, ikon ganda; judul berulang; catatan teknis; kontras label rendah | Ikon SVG; judul tabel tidak mengulang judul halaman; teks bantuan bahasa sehari-hari; label memakai warna kontras ≥ 4.5:1 |
| Palet | Diganti ke palet sage green tim: #344E41 · #3A5A40 · #588157 · #A3B18A · #DAD7CD |
