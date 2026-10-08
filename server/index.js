// Entry point: `npm start`. Konfigurasi lewat environment variable (lihat README).
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { hashPassword } from "./auth.js";
import { createApp } from "./app.js";
import { fromPglite, fromPool, migrate } from "./db.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Produksi: DATABASE_URL (Postgres/Supabase). Lokal tanpa DATABASE_URL: PGlite di data/pglite. */
export async function connect() {
  if (process.env.DATABASE_URL) {
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DB_POOL_SIZE ?? 10) });
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
  // Akun Leader Marketing pertama dibuat otomatis bila database masih kosong.
  const { n } = await db.one("select count(*)::int n from users");
  if (n === 0) {
    const username = process.env.ADMIN_USERNAME ?? "leader";
    const password = process.env.ADMIN_PASSWORD ?? randomBytes(9).toString("base64url");
    await db.run("insert into users (username, name, position, role, password_hash) values (?, ?, 'Leader', 'Marketing', ?)",
      [username, process.env.ADMIN_NAME ?? "Leader", hashPassword(password)]);
    console.log(`\n  Akun Leader pertama dibuat → username: ${username}  password: ${password}`);
    console.log("  Segera ganti password lewat menu Setting.\n");
  }
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";
  createApp({ db, publicDir: join(root, "public"), secureCookies: process.env.SECURE_COOKIES === "1" }).listen(port, host, () => {
    console.log(`  Content Studio berjalan di http://localhost:${port}`);
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
