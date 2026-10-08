// Entry point: `npm start`. Konfigurasi lewat environment variable (lihat README).
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { hashPassword } from "./auth.js";
import { createApp } from "./app.js";
import { openDb } from "./db.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const db = openDb(process.env.DB_PATH ?? join(root, "data", "studio.db"));

// Akun Leader pertama dibuat otomatis bila database masih kosong.
if (db.prepare("select count(*) n from users").get().n === 0) {
  const username = process.env.ADMIN_USERNAME ?? "leader";
  const password = process.env.ADMIN_PASSWORD ?? randomBytes(9).toString("base64url");
  db.prepare("insert into users (username, name, position, role, password_hash) values (?, ?, 'Leader', 'Marketing', ?)")
    .run(username, process.env.ADMIN_NAME ?? "Leader", hashPassword(password));
  console.log(`\n  Akun Leader pertama dibuat → username: ${username}  password: ${password}`);
  console.log("  Segera ganti password lewat menu Setting.\n");
}

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
createApp({ db, publicDir: join(root, "public"), secureCookies: process.env.SECURE_COOKIES === "1" }).listen(port, host, () => {
  console.log(`  Content Studio berjalan di http://localhost:${port}`);
});
