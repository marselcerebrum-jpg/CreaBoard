# CreaBoard

Interface HTML untuk sheet **Creative** (pelacak produksi konten marketing) beserta pembuat skrip konten.

- `index.html` — buka langsung di browser, tidak perlu server.
- `data/seed.js` — data awal hasil ekstrak workbook (sheet Creative + isi skrip JadiASN dari
  SKRIP KONTEN, SKRIP CARROUSEL_, SKRIP SINGLE POST).
- `scripts/extract_seed.py` — buat ulang seed: `python3 scripts/extract_seed.py CONTOH.xlsx`

Fitur:
- Tabel Creative gabungan dengan kolom **Jenis Skrip** (Video / Carousel / Single Post / YouTube), tab per jenis,
  filter brand, editor, tahap produksi, pencarian, dan export CSV.
- Klik **nomor skrip** → panel overview: progres produksi, catatan QC, isi skrip lengkap per bagian + caption.
- **Buat Skrip** → form berbentuk tabel dengan urutan kolom & baris sama persis seperti blok skrip di sheet:
  - Video/YouTube: `SKRIP n | FOOTAGE | KETERANGAN | CAPTION (TIKTOK, INSTAGRAM)`, baris Kata Kunci → Tahapan 4 (CTA)
  - Carousel: `SKRIP n | KET | CAPTION`, baris Tema, Slide Utama, Slide 2…, CTA (slide bisa ditambah/dihapus)
  - Single post: `SKRIP n | KETERANGAN | CAPTION`, baris Title Hook/Judul, Sumber, Image/Ilustrasi, Isi, CTA

  Saat disimpan langsung masuk ke tabel Creative dengan nomor berikutnya.
- Talent, Editor, Creative, Link, QC diisi lewat dropdown; tanggal & jam upload langsung di tabel.

Catatan: ini prototipe interface — perubahan disimpan di `localStorage` browser masing-masing, belum ke database.
