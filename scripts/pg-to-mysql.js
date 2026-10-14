// Memindahkan seluruh data Creative Desk dari Postgres ke MySQL, lalu mencocokkan isi setiap tabel.
//   SOURCE_DATABASE_URL=postgres://…  DATABASE_URL=mysql://…  node scripts/pg-to-mysql.js
// Postgres hanya dibaca. MySQL tujuan harus kosong (belum ada pengguna/konten); id dipertahankan.
import pg from "pg";
import { createMysqlPool, fromMysql, fromPool, migrate } from "../server/db.js";

const SRC = process.env.SOURCE_DATABASE_URL;
const DST = process.env.DATABASE_URL;
if (!SRC || !/^postgres/i.test(SRC) || !/^mysql:/i.test(DST ?? "")) {
  console.error("Isi SOURCE_DATABASE_URL (postgres://…) dan DATABASE_URL (mysql://…).");
  process.exit(1);
}

// Urutan mengikuti foreign key. Kolom diambil dari tabel sumber.
const TABLES = [
  ["users", "id"], ["options", "id"], ["sessions", "token_hash"], ["contents", "id"], ["events", "id"],
  ["calendar_plans", "app, type, date"], ["user_apps", "user_id, app"], ["footage", "id"],
  ["drive_folders", "app, type"], ["kpis", "id"], ["staff_scorecards", "user_id, month"], ["scorecard_values", "user_id, month, row_id"],
];

const pgPool = new pg.Pool({ connectionString: SRC, max: 2 });
const src = fromPool(pgPool);
const myPool = await createMysqlPool(DST, { connectionLimit: 2 });
const dst = await migrate(fromMysql(myPool));

const norm = (v) => (v === undefined ? null : typeof v === "bigint" ? Number(v) : v);
const rowKey = (r) => JSON.stringify(Object.keys(r).sort().map((k) => [k, norm(r[k]) === null ? null : String(norm(r[k]))]));

try {
  const used = await dst.one("select (select count(*) from users) u, (select count(*) from contents) c");
  if (Number(used.u) || Number(used.c)) throw new Error("MySQL tujuan sudah berisi data. Pemindahan dibatalkan agar tidak menimpa apa pun.");

  const plan = [];
  for (const [table, order] of TABLES) {
    const rows = await src.query(`select * from ${table} order by ${order}`);
    plan.push([table, order, rows]);
  }

  await dst.tx(async (q) => {
    // Pilihan bawaan yang baru dibuat migrate() diganti data asli.
    await q.run("delete from options");
    for (const [table, , rows] of plan) {
      if (!rows.length) continue;
      const cols = Object.keys(rows[0]);
      const colSql = cols.map((c) => `\`${c}\``).join(", ");
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        const values = chunk.map(() => `(${cols.map(() => "?").join(", ")})`).join(", ");
        await q.run(`insert into ${table} (${colSql}) values ${values}`, chunk.flatMap((r) => cols.map((c) => norm(r[c]))));
      }
    }
  });

  // Verifikasi: jumlah baris dan isi setiap baris harus sama persis.
  let ok = true;
  for (const [table, order, rows] of plan) {
    const got = await dst.query(`select * from ${table} order by ${order.split(", ").map((c) => `\`${c}\``).join(", ")}`);
    const a = new Set(rows.map(rowKey));
    const diff = got.filter((r) => !a.has(rowKey(r))).length;
    const same = got.length === rows.length && diff === 0;
    ok &&= same;
    console.log(`${same ? "✓" : "✗"} ${table.padEnd(15)} postgres ${String(rows.length).padStart(5)} · mysql ${String(got.length).padStart(5)}${diff ? ` · ${diff} baris berbeda` : ""}`);
  }
  if (!ok) throw new Error("Verifikasi gagal — periksa tabel bertanda ✗.");
  console.log("Selesai: semua tabel cocok.");
} catch (e) {
  console.error("GAGAL:", e.message);
  process.exitCode = 1;
} finally {
  await pgPool.end();
  await myPool.end();
}
