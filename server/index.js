// Entry point: `npm start`. Konfigurasi lewat environment variable (lihat README).
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { hashPassword } from "./auth.js";
import { createApp } from "./app.js";
import { createMysqlPool, fromMysql, fromPglite, fromPool, migrate } from "./db.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** DATABASE_URL, atau dirakit dari DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME (DB_CLIENT: mysql | postgres).
 *  Password di-encode di sini, jadi karakter seperti \ + ? , { aman dipakai apa adanya. */
export function databaseUrl(env = process.env) {
  if (env.DATABASE_URL || !env.DB_HOST) return env.DATABASE_URL;
  const client = env.DB_CLIENT ?? "mysql";
  const port = env.DB_PORT ?? (client === "mysql" ? "3306" : "5432");
  const auth = `${encodeURIComponent(env.DB_USER ?? "")}:${encodeURIComponent(env.DB_PASSWORD ?? "")}`;
  return `${client}://${auth}@${env.DB_HOST}:${port}/${encodeURIComponent(env.DB_NAME ?? "")}`;
}

/** Produksi: DATABASE_URL / DB_* (MySQL atau Postgres). Lokal tanpa keduanya: PGlite di data/pglite. */
export async function connect() {
  const url = databaseUrl();
  if (/^mysql:/i.test(url ?? "")) {
    const pool = await createMysqlPool(url, {
      connectionLimit: Number(process.env.DB_POOL_SIZE ?? 10),
      // DB_SSL_CA_FILE: sertifikat server (PEM) bila terhubung langsung lewat IP publik dengan SSL.
      ssl: process.env.DB_SSL_CA_FILE ? { ca: readFileSync(process.env.DB_SSL_CA_FILE, "utf8") } : undefined,
    });
    return { db: await migrate(fromMysql(pool)), close: () => pool.end() };
  }
  if (url) {
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({ connectionString: url, max: Number(process.env.DB_POOL_SIZE ?? 10) });
    pool.on("error", (e) => console.error("[db]", e.message));
    return { db: await migrate(fromPool(pool)), close: () => pool.end() };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR ?? join(root, "data", "pglite");
  mkdirSync(dirname(dir), { recursive: true });
  const pglite = await PGlite.create(dir);
  return { db: await migrate(fromPglite(pglite)), close: () => pglite.close() };
}

async function main() {
  const { db } = await connect();
  // Akun Admin pertama dibuat otomatis bila database masih kosong.
  const { n } = await db.one("select count(*)::int n from users");
  if (n === 0) {
    const username = process.env.ADMIN_USERNAME ?? "leader";
    const password = process.env.ADMIN_PASSWORD ?? randomBytes(9).toString("base64url");
    await db.run("insert into users (username, name, position, role, password_hash) values (?, ?, 'Admin', 'Marketing', ?)",
      [username, process.env.ADMIN_NAME ?? "Admin", hashPassword(password)]);
    console.log(`\n  Akun Admin pertama dibuat → username: ${username}  password: ${password}`);
    console.log("  Segera ganti password lewat menu Setting.\n");
  }
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";
  createApp({ db, publicDir: join(root, "public"), uploadDir: process.env.UPLOAD_DIR ?? join(root, "data", "uploads"), maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 1024), secureCookies: process.env.SECURE_COOKIES === "1", trustProxy: process.env.TRUST_PROXY === "1" }).listen(port, host, () => {
    console.log(`  Creative Desk berjalan di http://localhost:${port}`);
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
