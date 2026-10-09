// Tes fitur tambahan: nomor per jenis, Trend/Urgent, QC, footage, folder Drive, pembaruan otomatis.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { createApp } from "../server/app.js";
import { hashPassword } from "../server/auth.js";
import { fromPglite, migrate } from "../server/db.js";

const NOW = new Date("2026-10-10T03:00:00Z");
let server, base, db, uploadDir, O;

before(async () => {
  db = await migrate(fromPglite(await PGlite.create()));
  uploadDir = await mkdtemp(join(tmpdir(), "creaboard-up-"));
  for (const [u, n, p, r] of [["leader", "Alya", "Leader", "Marketing"], ["nadia", "Nadia", "Staff", "Marketing"], ["dimas", "Dimas", "Staff", "Creative"]]) {
    await db.run("insert into users (username, name, position, role, password_hash) values (?, ?, ?, ?, ?)", [u, n, p, r, hashPassword("rahasia123")]);
  }
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
    return { status: r.status, data, headers: r.headers };
  };
  return { call, cookie, id: (await db.one("select id from users where username = ?", [username])).id };
}
const opt = (key, semantic) => O.find((o) => o.key === key && o.semantic === semantic).id;
const app1 = () => O.find((o) => o.key === "app").id;
const sheetFor = (type, title) =>
  type === "Video"
    ? { type, meta: [title, "", "", ""], rows: [{ label: "Hook", text: "h" }, { label: "Tahapan 1", text: "isi **tebal** dan *miring* kata-unik-xyz" }, { label: "CTA", text: "c" }], caption1: "cap" }
    : type === "Carousel"
      ? { type, meta: [title], rows: [{ label: "Slide utama", text: "s" }, { label: "Slide 2", text: "x" }, { label: "CTA", text: "c" }], caption1: "cap" }
      : { type, meta: [title, "", ""], rows: [{ label: "Isi", text: "i" }, { label: "CTA", text: "c" }], caption1: "cap" };

test("nomor skrip per jenis konten mulai dari 1 dan terpisah", async () => {
  const mk = await login("nadia");
  const make = async (type, title) => (await mk.call("POST", "/api/contents", { type, app: app1(), sheet: sheetFor(type, title) })).data;
  const v1 = await make("Video", "V satu");
  const c1 = await make("Carousel", "C satu");
  const v2 = await make("Video", "V dua");
  const s1 = await make("Singlepost", "S satu");
  const c2 = await make("Carousel", "C dua");
  assert.deepEqual([v1.type_no, v2.type_no, c1.type_no, c2.type_no, s1.type_no], [1, 2, 1, 2, 1]);
});

test("skrip disimpan tetap ada setelah dimuat ulang (termasuk format tebal/miring)", async () => {
  const mk = await login("nadia");
  const c = (await mk.call("POST", "/api/contents", { type: "Video", app: app1(), sheet: sheetFor("Video", "Persisten") })).data;
  const again = (await mk.call("GET", `/api/contents/${c.id}`)).data;
  assert.equal(again.sheet.rows[1].text, "isi **tebal** dan *miring* kata-unik-xyz");
  const list = (await mk.call("GET", "/api/contents")).data;
  assert.ok(list.some((x) => x.id === c.id && x.sheet.rows[1].text.includes("kata-unik-xyz")));
});

test("Trend/Urgent: tenggat H-0 sehingga tidak otomatis telat", async () => {
  const lm = await login("leader");
  const mk = await login("nadia");
  // Upload 2026-10-11, skrip Ready 2026-10-10 (H-1): reguler telat (batas H-3), trend tepat waktu (batas H-0).
  const mkReady = async (priority, title) => {
    let c = (await mk.call("POST", "/api/contents", { type: "Video", app: app1(), created_date: "2026-10-10", upload_date: "2026-10-11", priority, sheet: sheetFor("Video", title) })).data;
    c = (await mk.call("PATCH", `/api/contents/${c.id}`, { revision: c.revision, changes: { script_status: opt("script", "Ready") } })).data;
    return c;
  };
  const reg = await mkReady("Reguler", "Reguler mepet");
  const tr = await mkReady("Trend", "Trend mepet");
  assert.equal(tr.priority, "Trend");
  const team = (await lm.call("GET", "/api/team?month=2026-10")).data;
  const items = team.people.find((p) => p.user.id === mk.id).items;
  assert.equal(items.find((i) => i.id === reg.id).status, "Selesai terlambat");
  assert.equal(items.find((i) => i.id === tr.id).status, "Tepat waktu");
  assert.equal(items.find((i) => i.id === tr.id).deadline, "2026-10-11");
  assert.equal((await mk.call("PATCH", `/api/contents/${tr.id}`, { revision: tr.revision, changes: { priority: "Viral" } })).status, 422);
});

test("QC Done bisa langsung diisi bila link hasil sudah ada (Creative otomatis Done)", async () => {
  const mk = await login("nadia");
  const cr = await login("dimas");
  let c = (await mk.call("POST", "/api/contents", { type: "Carousel", app: app1(), creative_user_id: cr.id, sheet: sheetFor("Carousel", "QC langsung") })).data;
  c = (await mk.call("PATCH", `/api/contents/${c.id}`, { revision: c.revision, changes: { script_status: opt("script", "Ready") } })).data;
  // Tanpa link: ditolak dengan pesan jelas.
  const no = await mk.call("PATCH", `/api/contents/${c.id}`, { revision: c.revision, changes: { qc_status: opt("qc", "Done") } });
  assert.equal(no.status, 422);
  assert.match(no.data.error, /Link hasil/);
  c = (await cr.call("PATCH", `/api/contents/${c.id}`, { revision: c.revision, changes: { link: "https://drive.google.com/file/d/abc" } })).data;
  c = (await mk.call("PATCH", `/api/contents/${c.id}`, { revision: c.revision, changes: { qc_status: opt("qc", "Done") } })).data;
  assert.equal(c.qc_status, opt("qc", "Done"));
  assert.equal(c.creative_status, opt("creative", "Done"));
  assert.ok(c.flags.upload);
});

test("footage: link Drive & unggah file dari komputer, unduh, hapus; folder Drive per apps × jenis", async () => {
  const lm = await login("leader");
  const mk = await login("nadia");
  const cr = await login("dimas");
  const c = (await mk.call("POST", "/api/contents", { type: "Video", app: app1(), creative_user_id: cr.id, sheet: sheetFor("Video", "Dengan footage") })).data;
  // Link Drive
  assert.equal((await cr.call("POST", "/api/footage", { content_id: c.id, url: "bukan-link" })).status, 422);
  const link = await cr.call("POST", "/api/footage", { content_id: c.id, url: "https://drive.google.com/drive/folders/xyz", title: "Take 1" });
  assert.equal(link.status, 200);
  // Unggah file: tanpa header khusus ditolak (CSRF), dengan header berhasil.
  const bytes = new TextEncoder().encode("isi-video-palsu");
  const q = `/api/footage/upload?content_id=${c.id}&name=${encodeURIComponent("take 2.mp4")}`;
  assert.equal((await cr.call("POST", q, bytes, { "Content-Type": "application/octet-stream" })).status, 415);
  const up = await cr.call("POST", q, bytes, { "Content-Type": "application/octet-stream", "X-Requested-With": "creaboard", "X-File-Type": "video/mp4" });
  assert.equal(up.status, 200, JSON.stringify(up.data));
  const list = (await cr.call("GET", `/api/footage?content_id=${c.id}`)).data;
  assert.equal(list.length, 2);
  assert.ok(list.every((f) => f.app === c.app && f.type === "Video" && !("file_path" in f)));
  const file = await cr.call("GET", `/api/footage/${up.data.id}/file`);
  assert.equal(file.status, 200);
  assert.equal(file.data, "isi-video-palsu");
  assert.equal((await cr.call("GET", "/api/contents")).data.find((x) => x.id === c.id).footage_count, 2);
  // Filter per apps & jenis
  assert.equal((await cr.call("GET", `/api/footage?app=${app1()}&type=Carousel`)).data.length, 0);
  // Hapus: hanya pengunggah atau Leader.
  assert.equal((await mk.call("DELETE", `/api/footage/${up.data.id}`, {})).status, 403);
  assert.equal((await cr.call("DELETE", `/api/footage/${up.data.id}`, {})).status, 200);
  assert.equal((await cr.call("GET", `/api/footage/${up.data.id}/file`)).status, 404);
  // Folder Drive: hanya Leader yang mengatur.
  const folder = { app: app1(), type: "Video", url: "https://drive.google.com/drive/folders/folder-video" };
  assert.equal((await mk.call("PUT", "/api/drive-folders", folder)).status, 403);
  assert.equal((await lm.call("PUT", "/api/drive-folders", folder)).status, 200);
  assert.deepEqual((await cr.call("GET", "/api/drive-folders")).data, [folder]);
});

test("pembaruan otomatis: perubahan dikirim ke browser lewat /api/stream", async () => {
  const mk = await login("nadia");
  const ctrl = new AbortController();
  const res = await fetch(`${base}/api/stream`, { headers: { cookie: mk.cookie }, signal: ctrl.signal });
  assert.equal(res.headers.get("content-type"), "text/event-stream");
  const reader = res.body.getReader();
  const got = (async () => {
    let buf = "";
    while (!buf.includes("data:")) buf += new TextDecoder().decode((await reader.read()).value);
    return buf;
  })();
  await mk.call("POST", "/api/contents", { type: "Singlepost", app: app1(), sheet: sheetFor("Singlepost", "Picu update") });
  const msg = await got;
  assert.match(msg, /"what":"contents"/);
  ctrl.abort();
});

test("footage yang diunggah sebelum skrip tersimpan dihubungkan ke skripnya setelah disimpan", async () => {
  const mk = await login("nadia");
  const app = O.filter((o) => o.key === "app")[1].id;
  const bytes = new TextEncoder().encode("gambar-desain");
  const up = await mk.call("POST", `/api/footage/upload?app=${app}&type=Carousel&name=desain.png`, bytes, { "Content-Type": "application/octet-stream", "X-Requested-With": "creaboard", "X-File-Type": "image/png" });
  assert.equal(up.status, 200, JSON.stringify(up.data));
  assert.equal(up.data.url, `/api/footage/${up.data.id}/file`);
  const c = (await mk.call("POST", "/api/contents", { type: "Carousel", app, sheet: sheetFor("Carousel", "Dengan desain") })).data;
  assert.equal((await mk.call("POST", "/api/footage/attach", { content_id: c.id, ids: [up.data.id] })).status, 200);
  const list = (await mk.call("GET", `/api/footage?content_id=${c.id}`)).data;
  assert.deepEqual(list.map((f) => [f.title, f.kind]), [["desain.png", "file"]]);
  assert.equal((await mk.call("GET", up.data.url)).data, "gambar-desain");
});

test("kolom FOOTAGE bisa diubah/ditambah semua peran, termasuk setelah Creative selesai; isi skrip tetap terkunci", async () => {
  const mk = await login("nadia");
  const cr = await login("dimas");
  let c = (await mk.call("POST", "/api/contents", { type: "Video", app: app1(), creative_user_id: cr.id, sheet: sheetFor("Video", "Footage bersama") })).data;
  const rows = c.sheet.rows.map((_, i) => (i === 1 ? "https://drive.google.com/file/d/take1/view" : ""));
  let r = await cr.call("PATCH", `/api/contents/${c.id}`, { revision: c.revision, changes: { footage: { metaFootage: ["https://drive.google.com/x", "", "", ""], rows } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  c = r.data;
  assert.equal(c.sheet.rows[1].footage, "https://drive.google.com/file/d/take1/view");
  assert.equal(c.sheet.metaFootage[0], "https://drive.google.com/x");
  assert.equal(c.sheet.rows[1].text, "isi **tebal** dan *miring* kata-unik-xyz"); // isi skrip tidak tersentuh
  // Staff Creative tetap tidak bisa mengubah isi skrip.
  assert.equal((await cr.call("PATCH", `/api/contents/${c.id}`, { revision: c.revision, changes: { sheet: c.sheet } })).status, 403);
  // Setelah Creative Done (skrip terkunci), footage masih bisa ditambah.
  r = await mk.call("PATCH", `/api/contents/${c.id}`, { revision: c.revision, changes: { script_status: opt("script", "Ready"), talent_status: opt("talent", "Tidak perlu") } });
  c = r.data;
  r = await cr.call("PATCH", `/api/contents/${c.id}`, { revision: c.revision, changes: { link: "https://drive.google.com/hasil", creative_status: opt("creative", "Done") } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  c = r.data;
  r = await cr.call("PATCH", `/api/contents/${c.id}`, { revision: c.revision, changes: { footage: { rows: rows.map((v, i) => (i === 2 ? "https://drive.google.com/file/d/take2/view" : v)) } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.sheet.rows[2].footage, "https://drive.google.com/file/d/take2/view");
});

test("salin rencana ke bulan berikutnya tanpa menimpa rencana yang sudah ada", async () => {
  const lm = await login("leader");
  const app = app1();
  for (const [date, amount] of [["2026-10-05", 2], ["2026-10-31", 1]]) await lm.call("PUT", "/api/calendar/plan", { app, type: "Singlepost", date, amount });
  await lm.call("PUT", "/api/calendar/plan", { app, type: "Singlepost", date: "2026-11-05", amount: 7 });
  const r = await lm.call("POST", "/api/calendar/copy-next", { month: "2026-10" });
  assert.equal(r.status, 200);
  assert.equal(r.data.month, "2026-11");
  const nov = (await lm.call("GET", "/api/calendar?month=2026-11")).data.plans.filter((p) => p.app === app && p.type === "Singlepost");
  assert.deepEqual(nov.map((p) => [p.date, p.amount]), [["2026-11-05", 7]]); // 31 Nov tidak ada; 5 Nov tidak ditimpa
  assert.equal((await (await login("dimas")).call("POST", "/api/calendar/copy-next", { month: "2026-10" })).status, 403);
});

test("Telat & Terlewat: Marketing H-3 skrip, Creative H-1 edit, Trend tidak pernah telat, Terlewat = upload sudah lewat", async () => {
  const mk = await login("nadia");
  // Hari ini (NOW) = 2026-10-10.
  const make = async (title, upload_date, { priority = "Reguler", ready = false } = {}) => {
    let c = (await mk.call("POST", "/api/contents", { type: "Carousel", app: app1(), created_date: "2026-10-01", upload_date, priority, sheet: sheetFor("Carousel", title) })).data;
    if (ready) c = (await mk.call("PATCH", `/api/contents/${c.id}`, { revision: c.revision, changes: { script_status: opt("script", "Ready") } })).data;
    return c.flags;
  };
  // Marketing: skrip belum ready setelah lewat H-3 → telat.
  assert.equal((await make("upload H+2 draft", "2026-10-12")).lateScript, true);
  assert.equal((await make("upload H+3 draft", "2026-10-13")).lateScript, false);
  assert.equal((await make("upload H+2 ready", "2026-10-12", { ready: true })).lateScript, false);
  // Trend tidak pernah telat (skrip maupun edit).
  const trend = await make("trend upload hari ini", "2026-10-10", { priority: "Trend" });
  assert.equal(trend.lateScript, false);
  assert.equal(trend.lateEdit, false);
  // Creative: edit belum selesai di hari upload (lewat H-1) → telat; upload besok → belum.
  assert.equal((await make("edit upload hari ini", "2026-10-10", { ready: true })).lateEdit, true);
  assert.equal((await make("edit upload besok", "2026-10-11", { ready: true })).lateEdit, false);
  // Terlewat: tanggal upload sudah lewat & belum tayang (tidak dobel dengan telat).
  const past = await make("upload kemarin", "2026-10-09");
  assert.deepEqual([past.missed, past.lateScript, past.lateEdit], [true, false, false]);
});
