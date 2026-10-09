// Penerima unggahan footage CreaBoard → folder Google Drive.
//
// Cara pasang (sekali, oleh akun Google pemilik folder footage):
// 1. Buka https://script.google.com → New project → hapus isi Code.gs → tempel seluruh file ini.
// 2. Ganti SECRET di bawah dengan kode acak (sama persis dengan GOOGLE_APPS_SCRIPT_SECRET di server).
// 3. Deploy → New deployment → Select type: Web app
//      Execute as: Me        Who has access: Anyone
//    → Deploy → Authorize access (izinkan akses Drive) → salin "Web app URL".
// 4. Isi GOOGLE_APPS_SCRIPT_URL (URL tadi) dan GOOGLE_APPS_SCRIPT_SECRET di .env server.
//
// File masuk ke folder sesuai Setting → Link footage di CreaBoard (per platform × jenis konten).

const SECRET = "GANTI-DENGAN-KODE-RAHASIA";

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    if (!SECRET || SECRET.indexOf("GANTI") === 0 || req.secret !== SECRET) return reply({ error: "Kode rahasia tidak cocok" });
    const folder = DriveApp.getFolderById(req.folderId);
    const blob = Utilities.newBlob(Utilities.base64Decode(req.data), req.mime || "application/octet-stream", req.name || "footage");
    const file = folder.createFile(blob);
    return reply({ ok: true, id: file.getId(), url: file.getUrl() });
  } catch (err) {
    return reply({ error: String((err && err.message) || err) });
  }
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
