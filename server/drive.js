// Unggah footage langsung ke folder Google Drive (Drive API v3, tanpa library tambahan).
//
// Tiga cara menghubungkan akun Google (pilih salah satu lewat environment variable):
// 1. Google Apps Script (paling mudah):  GOOGLE_APPS_SCRIPT_URL, GOOGLE_APPS_SCRIPT_SECRET
//    → skrip scripts/drive-upload.gs di-deploy sebagai Web App oleh pemilik folder. Maks. ±35 MB per file.
// 2. OAuth akun Google biasa (Gmail):  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
//    → file tersimpan atas nama akun itu dan memakai kuota Drive-nya. Tanpa batas ukuran khusus.
// 3. Service account:  GOOGLE_SERVICE_ACCOUNT_FILE (path file JSON kunci)
//    → hanya untuk folder di Shared Drive (service account tidak punya kuota My Drive).
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/drive";

/** Ambil ID folder dari link Google Drive (…/folders/<id> atau ?id=<id>). */
export function folderIdFromUrl(url) {
  const s = String(url ?? "");
  return s.match(/\/folders\/([\w-]{10,})/)?.[1] ?? s.match(/[?&]id=([\w-]{10,})/)?.[1] ?? null;
}

// Apps Script menerima isi file sebagai base64 di body (batas ±50 MB) → file mentah maks. ±35 MB.
export const APPS_SCRIPT_MAX_BYTES = 35 * 1024 * 1024;

function appsScriptDrive(url, secret) {
  return {
    enabled: true,
    maxBytes: APPS_SCRIPT_MAX_BYTES,
    async upload({ folderId, name, mime, size, stream }) {
      if (size > APPS_SCRIPT_MAX_BYTES) throw new Error("File lebih dari 35 MB. Unggah langsung ke folder Drive, lalu tempel link-nya.");
      const chunks = [];
      for await (const ch of stream) chunks.push(ch);
      // POST → Apps Script membalas redirect ke hasilnya; fetch mengikutinya otomatis.
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ secret, folderId, name, mime, data: Buffer.concat(chunks).toString("base64") }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(`Unggah ke Google Drive gagal: ${data.error ?? res.status}`);
      return { id: data.id, url: data.url };
    },
  };
}

export function createDrive(env = process.env) {
  if (env.GOOGLE_APPS_SCRIPT_URL) return appsScriptDrive(env.GOOGLE_APPS_SCRIPT_URL, env.GOOGLE_APPS_SCRIPT_SECRET ?? "");
  let tokenRequest;
  if (env.GOOGLE_REFRESH_TOKEN && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    tokenRequest = () =>
      new URLSearchParams({
        grant_type: "refresh_token",
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: env.GOOGLE_REFRESH_TOKEN,
      });
  } else if (env.GOOGLE_SERVICE_ACCOUNT_FILE) {
    const key = JSON.parse(readFileSync(env.GOOGLE_SERVICE_ACCOUNT_FILE, "utf8"));
    tokenRequest = () => {
      const now = Math.floor(Date.now() / 1000);
      const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
      const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({ iss: key.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })}`;
      const signature = createSign("RSA-SHA256").update(unsigned).sign(key.private_key, "base64url");
      return new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` });
    };
  } else {
    return { enabled: false };
  }

  let cached = { token: null, until: 0 };
  async function accessToken() {
    if (cached.token && Date.now() < cached.until) return cached.token;
    const res = await fetch(TOKEN_URL, { method: "POST", body: tokenRequest() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) throw new Error(`Login Google Drive gagal: ${data.error_description ?? data.error ?? res.status}`);
    cached = { token: data.access_token, until: Date.now() + (data.expires_in - 120) * 1000 };
    return cached.token;
  }

  return {
    enabled: true,
    /** Unggah stream ke folder; mengembalikan { id, url }. Memakai resumable upload agar file besar aman. */
    async upload({ folderId, name, mime, size, stream }) {
      const token = await accessToken();
      const start = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,webViewLink", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": mime,
          "X-Upload-Content-Length": String(size),
        },
        body: JSON.stringify({ name, parents: [folderId] }),
      });
      if (!start.ok) {
        const err = await start.json().catch(() => ({}));
        throw new Error(start.status === 404 ? "Folder Drive tidak ditemukan atau belum dibagikan ke akun CreaBoard" : `Google Drive menolak: ${err.error?.message ?? start.status}`);
      }
      const put = await fetch(start.headers.get("location"), {
        method: "PUT",
        headers: { "Content-Type": mime, "Content-Length": String(size) },
        body: Readable.toWeb(stream),
        duplex: "half",
      });
      const file = await put.json().catch(() => ({}));
      if (!put.ok || !file.id) throw new Error(`Unggah ke Google Drive gagal: ${file.error?.message ?? put.status}`);
      return { id: file.id, url: file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view` };
    },
  };
}
