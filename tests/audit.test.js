// Tes regresi hasil audit: hak akses footage, akun Leader, nomor per jenis, validasi input.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { createApp } from "../server/app.js";
import { hashPassword } from "../server/auth.js";
import { fromPglite, migrate } from "../server/db.js";
import { isDate } from "../server/rules.js";

const NOW = new Date("2026-10-10T03:00:00Z");
let server, base, db, uploadDir, O;

before(async () => {
  db = await migrate(fromPglite(await PGlite.create()));
  uploadDir = `${await mkdtemp(join(tmpdir(), "creaboard-audit-"))}/`; // sengaja berakhiran "/"
  const people = [
    ["lm", "Alya", "Leader", "Marketing"], ["lc", "Bima", "Leader", "Creative"],
    ["nadia", "Nadia", "Staff", "Marketing"], ["dimas", "Dimas", "Staff", "Creative"], ["eko", "Eko", "Staff", "Creative"],
  ];
  for (const [u, n, p, r] of people) await db.run("insert into users (username, name, position, role, password_hash) values (?, ?, ?, ?, ?)", [u, n, p, r, hashPassword("rahasia123")]);
  O = await db.query("select * from options order by key, sort");
  const nadia = (await db.one("select id from users where username = 'nadia'")).id;
  for (const o of O.filter((x) => x.key === "app")) await db.run("insert into user_apps (user_id, app) values (?, ?)", [nadia, o.id]);
  server = createApp({ db, publicDir: join(import.meta.dirname, "..", "public"), uploadDir, now: () => NOW });
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
after(async () => {
  server.close();
  await rm(uploadDir, { recursive: true, force: true });
});

async function login(username) {
  const res = await fetch(`${base}/api/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password: "rahasia123" }) });
  const cookie = res.headers.get("set-cookie").split(";")[0];
  const call = async (method, path, body, headers = {}) => {
    const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json", cookie, ...headers }, body: body === undefined ? undefined : typeof body === "string" || body instanceof Uint8Array ? body : JSON.stringify(body) });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: r.status, data };
  };
  return { call, cookie, id: (await db.one("select id from users where username = ?", [username])).id };
}
const apps = () => O.filter((o) => o.key === "app").map((o) => o.id);
const sheet = (type, title) => (type === "Video"
  ? { type, meta: [title, "", "", ""], rows: [{ label: "Hook", text: "h" }, { label: "Tahapan 1", text: "t" }, { label: "CTA", text: "c" }], caption1: "c" }
  : { type, meta: [title], rows: [{ label: "Slide utama", text: "s" }, { label: "Slide 2", text: "x" }, { label: "CTA", text: "c" }], caption1: "c" });
const raw = { "Content-Type": "application/octet-stream", "X-Requested-With": "creaboard" };

test("footage hanya terlihat & bisa diunduh oleh yang boleh melihat kontennya", async () => {
  const mk = await login("nadia");
  const dimas = await login("dimas");
  const eko = await login("eko");
  const c = (await mk.call("POST", "/api/contents", { type: "Video", app: apps()[0], creative_user_id: dimas.id, sheet: sheet("Video", "Rahasia") })).data;
  const up = await mk.call("POST", `/api/footage/upload?content_id=${c.id}&name=a.mp4`, new TextEncoder().encode("isi"), raw);
  assert.equal(up.status, 200);
  // Editor yang ditugaskan bisa; staff Creative lain tidak.
  assert.equal((await dimas.call("GET", up.data.url)).status, 200, "UPLOAD_DIR berakhiran / tetap bisa diunduh");
  assert.equal((await eko.call("GET", `/api/contents/${c.id}`)).status, 404);
  assert.equal((await eko.call("GET", up.data.url)).status, 404);
  assert.equal((await eko.call("GET", `/api/footage?content_id=${c.id}`)).data.length, 0);
  assert.equal((await dimas.call("GET", `/api/footage?content_id=${c.id}`)).data.length, 1);
});

test("Leader tidak bisa mengubah peran sendiri atau mengambil alih akun Leader lain", async () => {
  const lc = await login("lc");
  const lm = await login("lm");
  assert.equal((await lc.call("PATCH", `/api/users/${lc.id}`, { role: "Marketing" })).status, 422);
  assert.equal((await lc.call("PATCH", `/api/users/${lm.id}`, { password: "diambilalih1" })).status, 403);
  assert.equal((await lc.call("PATCH", `/api/users/${lm.id}`, { active: false })).status, 403);
  assert.equal((await lc.call("PATCH", `/api/users/${lc.id}`, { name: "Bima S" })).status, 200);
});

test("ganti jenis memberi nomor baru (tidak ada nomor ganda) dan footage ikut pindah apps/jenis", async () => {
  const mk = await login("nadia");
  const car = (await mk.call("POST", "/api/contents", { type: "Carousel", app: apps()[0], sheet: sheet("Carousel", "C pertama") })).data;
  let v = (await mk.call("POST", "/api/contents", { type: "Video", app: apps()[0], sheet: sheet("Video", "Jadi carousel") })).data;
  await mk.call("POST", "/api/footage", { content_id: v.id, url: "https://drive.google.com/x" });
  v = (await mk.call("PATCH", `/api/contents/${v.id}`, { revision: v.revision, changes: { type: "Carousel", sheet: sheet("Carousel", "Jadi carousel"), app: apps()[1] } })).data;
  assert.equal(v.type, "Carousel");
  assert.notEqual(v.type_no, car.type_no);
  const f = (await mk.call("GET", `/api/footage?content_id=${v.id}`)).data[0];
  assert.deepEqual([f.app, f.type], [apps()[1], "Carousel"]);
});

test("edit footage pada skrip lama tanpa metaFootage tidak error", async () => {
  const mk = await login("nadia");
  const c = (await mk.call("POST", "/api/contents", { type: "Video", app: apps()[0], sheet: sheet("Video", "Lama") })).data;
  await db.run("update contents set sheet = ? where id = ?", [JSON.stringify({ type: "Video", meta: ["Lama"], rows: [{ label: "Hook", text: "h" }] }), c.id]);
  const cur = (await mk.call("GET", `/api/contents/${c.id}`)).data;
  const r = await mk.call("PATCH", `/api/contents/${c.id}`, { revision: cur.revision, changes: { footage: { metaFootage: ["https://drive.google.com/a"], rows: ["https://drive.google.com/b"] } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.sheet.metaFootage[0], "https://drive.google.com/a");
});

test("validasi input: tanggal mustahil, bulan salah, cookie rusak, body null, pilihan terhapus, ganti peran ber-KPI", async () => {
  assert.equal(isDate("2026-02-31"), false);
  assert.equal(isDate("2026-02-28"), true);
  const mk = await login("nadia");
  const lm = await login("lm");
  assert.equal((await mk.call("POST", "/api/contents", { type: "Video", app: apps()[0], created_date: "2026-02-31", upload_date: "2026-03-01", sheet: sheet("Video", "x") })).status, 422);
  assert.equal((await mk.call("GET", "/api/calendar?month=2026-13")).status, 200);
  assert.equal((await mk.call("GET", "/api/bootstrap", undefined, { cookie: `other=%E0%A4%A; ${mk.cookie}` })).status, 200);
  assert.equal((await mk.call("POST", "/api/footage", "null")).status, 400);
  assert.equal((await mk.call("POST", "/api/footage/upload?content_id=abc&name=a", new TextEncoder().encode("x"), raw)).status, 422);
  // Pilihan apps yang sudah dihapus dari dropdown tidak bisa dipakai untuk skrip baru.
  const appOpts = O.filter((o) => o.key === "app");
  await lm.call("PUT", "/api/options/app", { options: appOpts.slice(0, -1).map((o) => ({ id: o.id, label: o.label })) });
  const gone = appOpts.at(-1).id;
  assert.equal((await mk.call("POST", "/api/contents", { type: "Video", app: gone, sheet: sheet("Video", "x") })).status, 422);
  // Staff yang masih punya target KPI tidak bisa langsung dipindah peran.
  const k = await lm.call("POST", "/api/kpis", { user_id: mk.id, app: apps()[0], type: "Video", amount: 1, work_date: "2026-10-11", upload_date: "2026-10-14" });
  assert.equal(k.status, 200, JSON.stringify(k.data));
  assert.equal((await lm.call("PATCH", `/api/users/${mk.id}`, { role: "Creative" })).status, 409);
});
