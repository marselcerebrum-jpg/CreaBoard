// Ambil GOOGLE_REFRESH_TOKEN untuk unggah footage ke Google Drive (sekali saja).
//
//   GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… node scripts/google-auth.js
//
// Buka link yang dicetak, login dengan akun Google pemilik folder Drive, izinkan akses.
// Refresh token dicetak di terminal → salin ke .env di server.
import { createServer } from "node:http";

const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret } = process.env;
if (!clientId || !clientSecret) {
  console.error("Isi GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET (OAuth client jenis Desktop app).");
  process.exit(1);
}
const port = 53682;
const redirect = `http://127.0.0.1:${port}`;
const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirect,
  response_type: "code",
  scope: "https://www.googleapis.com/auth/drive",
  access_type: "offline",
  prompt: "consent",
})}`;

const server = createServer(async (req, res) => {
  const code = new URL(req.url, redirect).searchParams.get("code");
  if (!code) return res.end("Menunggu izin Google…");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirect, grant_type: "authorization_code" }),
  });
  const data = await r.json();
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  if (data.refresh_token) {
    res.end("Berhasil. Kembali ke terminal.");
    console.log(`\nGOOGLE_REFRESH_TOKEN=${data.refresh_token}\n\nSalin baris di atas (beserta GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET) ke .env server.`);
  } else {
    res.end("Gagal mengambil token. Lihat terminal.");
    console.error("Gagal:", data);
  }
  server.close();
});
server.listen(port, "127.0.0.1", () => console.log(`Buka link ini di browser:\n\n${authUrl}\n`));
