import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createApp } from "../server/app.js";
import { hashPassword } from "../server/auth.js";
import { openDb } from "../server/db.js";

// Jam tetap: 10 Oktober 2026 pukul 10.00 WIB.
const NOW = new Date("2026-10-10T03:00:00Z");
const TODAY = "2026-10-10";
let server, base, db;

before(async () => {
  db = openDb(":memory:");
  const add = (username, name, position, role) =>
    db.prepare("insert into users (username, name, position, role, password_hash) values (?, ?, ?, ?, ?)")
      .run(username, name, position, role, hashPassword("rahasia123"));
  add("leader", "Alya", "Leader", "Marketing");
  add("nadia", "Nadia", "Staff", "Marketing");
  add("raka", "Raka", "Staff", "Marketing");
  add("dimas", "Dimas", "Staff", "Creative");
  add("sinta", "Sinta", "Staff", "Creative");
  add("putri", "Talent 1", "Staff", "Talent");
  add("bima", "Bima", "Leader", "Creative");
  // Staff Marketing hanya membuat konten untuk apps yang dipegang.
  const appIds = db.prepare("select id from options where key='app' order by sort").all().map((r) => r.id);
  const give = (username, ids) => {
    const uid = db.prepare("select id from users where username = ?").get(username).id;
    for (const app of ids) db.prepare("insert into user_apps (user_id, app) values (?, ?)").run(uid, app);
  };
  give("nadia", [appIds[0], appIds[1]]);
  give("raka", [appIds[2]]);
  server = createApp({ db, publicDir: join(import.meta.dirname, "..", "public"), now: () => NOW });
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

async function login(username) {
  const res = await fetch(`${base}/api/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password: "rahasia123" }),
  });
  assert.equal(res.status, 200, `login ${username}`);
  const cookie = res.headers.get("set-cookie").split(";")[0];
  const call = async (method, path, body) => {
    const r = await fetch(base + path, {
      method, headers: { "Content-Type": "application/json", cookie }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, data: await r.json() };
  };
  return { call, id: db.prepare("select id from users where username = ?").get(username).id };
}

const opt = (key, semantic) => db.prepare("select id from options where key = ? and semantic = ? order by sort").get(key, semantic).id;
const app1 = () => db.prepare("select id from options where key = 'app' order by sort").get().id;
const videoSheet = (over = {}) => ({
  type: "Video",
  meta: ["Tips SKD 30 hari", "Inframe", "", "Zoom in"],
  rows: [{ label: "Hook", text: "Mulai dari mana?" }, { label: "Tahapan 1", text: "Isi 1" }, { label: "CTA", text: "Daftar sekarang" }],
  caption1: "Caption TikTok", caption2: "", notes: "",
  ...over,
});

async function makeVideo(mk, extra = {}) {
  const r = await mk.call("POST", "/api/contents", { type: "Video", app: app1(), created_date: "2026-10-05", upload_date: "2026-10-12", sheet: videoSheet(), ...extra });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
}
const patch = (u, c, changes) => u.call("PATCH", `/api/contents/${c.id}`, { revision: c.revision, changes });

test("login salah ditolak dan endpoint butuh sesi", async () => {
  const bad = await fetch(`${base}/api/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "leader", password: "x" }) });
  assert.equal(bad.status, 401);
  assert.equal((await fetch(`${base}/api/contents`)).status, 401);
});

test("mutasi tanpa JSON ditolak (CSRF)", async () => {
  const r = await fetch(`${base}/api/logout`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "x" });
  assert.equal(r.status, 415);
});

test("hanya Marketing/Leader yang membuat skrip; nomor dari server", async () => {
  const cr = await login("dimas");
  assert.equal((await cr.call("POST", "/api/contents", { type: "Video", app: app1(), sheet: videoSheet() })).status, 403);
  const mk = await login("nadia");
  const a = await makeVideo(mk);
  const b = await makeVideo(mk);
  assert.equal(b.id, a.id + 1);
  assert.equal(a.title, "Tips SKD 30 hari");
  assert.equal(a.marketing_user_id, mk.id);
});

test("skrip Ready butuh isi lengkap", async () => {
  const mk = await login("nadia");
  const c = await makeVideo(mk, { sheet: videoSheet({ rows: [{ label: "Hook", text: "" }, { label: "CTA", text: "" }], caption1: "" }) });
  const r = await patch(mk, c, { script_status: opt("script", "Ready") });
  assert.equal(r.status, 422);
  assert.ok(r.data.details.includes("Hook wajib diisi"));
  assert.ok(r.data.details.includes("Minimal satu caption (TikTok/Instagram)"));
});

test("alur lengkap: urutan status dijaga dan QC lama batal saat hasil berubah", async () => {
  const mk = await login("nadia");
  const leader = await login("leader");
  const cr = await login("dimas");
  const talent = await login("putri");
  let c = await makeVideo(mk, { talent_name: db.prepare("select id from options where key='talentName' and label='Talent 1'").get().id });
  c = (await patch(mk, c, { script_status: opt("script", "Ready"), creative_user_id: cr.id })).data;
  assert.ok(c.script_ready_at);

  // Creative tidak bisa Done sebelum take talent selesai dan tanpa link.
  let r = await patch(cr, c, { creative_status: opt("creative", "Done") });
  assert.equal(r.status, 422);
  assert.deepEqual(r.data.details, ["Take talent belum selesai", "Link hasil wajib diisi"]);

  // Field non-dropdown tetap per peran: Creative tidak mengubah isi skrip, Marketing tidak mengisi link.
  assert.equal((await patch(cr, c, { sheet: videoSheet({ caption2: "x" }) })).status, 403);
  assert.equal((await patch(mk, c, { link: "https://drive.example.com/x" })).status, 403);
  const tn = await patch(talent, c, { notes: "catatan talent" });
  assert.equal(tn.status, 200, JSON.stringify(tn.data));
  c = (await mk.call("GET", `/api/contents/${c.id}`)).data;

  // Dropdown boleh diubah semua peran, tetapi urutan proses tetap dijaga.
  assert.equal((await patch(mk, c, { qc_status: opt("qc", "Done") })).status, 422);
  assert.equal((await patch(talent, c, { creative_status: opt("creative", "Done") })).status, 422);

  c = (await patch(talent, c, { talent_status: opt("talent", "Done") })).data;
  assert.ok(c.talent_done_at);
  assert.equal((await patch(cr, c, { link: "bukan-url" })).status, 422);
  c = (await patch(cr, c, { link: "https://drive.example.com/v1", creative_status: opt("creative", "Done") })).data;
  assert.ok(c.flags.qc);

  // Revisi wajib catatan.
  assert.equal((await patch(mk, c, { qc_status: opt("qc", "Revisi"), notes: "" })).status, 422);
  c = (await patch(mk, c, { qc_status: opt("qc", "Revisi"), notes: "Subtitle terlambat" })).data;
  assert.ok(c.flags.revision);

  // Creative mengunggah hasil baru → kembali menunggu QC.
  c = (await patch(cr, c, { link: "https://drive.example.com/v2" })).data;
  assert.equal(c.qc_status, opt("qc", ""));
  assert.ok(c.flags.qc && !c.flags.revision);

  // Skrip terkunci setelah hasil Done.
  assert.equal((await patch(mk, c, { sheet: videoSheet({ caption2: "baru" }) })).status, 409);
  assert.equal((await patch(mk, c, { script_status: opt("script", "Draft") })).status, 409);

  c = (await patch(mk, c, { qc_status: opt("qc", "Done") })).data;
  assert.ok(c.flags.upload);

  // Konfirmasi tayang: butuh permalink & tanggal tidak di masa depan.
  assert.equal((await mk.call("POST", `/api/contents/${c.id}/publish`, { revision: c.revision, url: "", date: TODAY })).status, 422);
  assert.equal((await mk.call("POST", `/api/contents/${c.id}/publish`, { revision: c.revision, url: "https://tiktok.com/@a/1", date: "2026-10-11" })).status, 422);
  c = (await mk.call("POST", `/api/contents/${c.id}/publish`, { revision: c.revision, url: "https://tiktok.com/@a/1", date: TODAY })).data;
  assert.ok(c.flags.published && !c.flags.upload);

  // Setelah tayang, status dikunci kecuali Leader membatalkan tayang.
  assert.equal((await patch(cr, c, { link: "https://drive.example.com/v3" })).status, 409);
  c = (await leader.call("DELETE", `/api/contents/${c.id}/publish`)).data;
  assert.equal(c.published_date, null);

  const events = (await mk.call("GET", `/api/contents/${c.id}`)).data.events;
  assert.ok(events.some((e) => e.field === "qc_status" && e.user_name === "Nadia"));
});

test("timestamp dihapus saat status mundur", async () => {
  const mk = await login("nadia");
  let c = await makeVideo(mk);
  c = (await patch(mk, c, { script_status: opt("script", "Ready") })).data;
  assert.ok(c.script_ready_at);
  c = (await patch(mk, c, { script_status: opt("script", "Draft") })).data;
  assert.equal(c.script_ready_at, null);
});

test("edit bersamaan menghasilkan 409", async () => {
  const mk = await login("nadia");
  const c = await makeVideo(mk);
  assert.equal((await patch(mk, c, { notes: "A" })).status, 200);
  const stale = await patch(mk, c, { notes: "B" });
  assert.equal(stale.status, 409);
});

test("visibilitas per akun", async () => {
  const nadia = await login("nadia");
  const raka = await login("raka");
  const sinta = await login("sinta");
  const c = await makeVideo(nadia);
  assert.equal((await raka.call("GET", `/api/contents/${c.id}`)).status, 404);
  assert.equal((await sinta.call("GET", `/api/contents/${c.id}`)).status, 404);
  const list = (await raka.call("GET", "/api/contents")).data;
  assert.ok(list.every((x) => x.marketing_user_id === raka.id));
});

test("Terlewat hanya untuk yang belum tayang; konten selesai tidak dihitung", async () => {
  const mk = await login("nadia");
  const old = await makeVideo(mk, { created_date: "2026-10-01", upload_date: "2026-10-05" });
  assert.equal(old.flags.missed, true);
  db.prepare("update contents set published_date = '2026-10-05', published_url = 'https://x.com/1' where id = ?").run(old.id);
  const after = (await mk.call("GET", `/api/contents/${old.id}`)).data;
  assert.equal(after.flags.missed, false);
  assert.equal(after.flags.published, true);
});

test("kalender: aktual = skrip Ready pada tanggal pengerjaan; rencana KPI terkunci", async () => {
  const leader = await login("leader");
  const mk = await login("nadia");
  const nadiaId = mk.id;
  const r = await leader.call("POST", "/api/kpis", { user_id: nadiaId, app: app1(), type: "Video", work_date: TODAY, upload_date: "2026-10-13", amount: 3 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  // Tanggal pengerjaan setelah H-3 upload ditolak.
  assert.equal((await leader.call("POST", "/api/kpis", { user_id: nadiaId, app: app1(), type: "Video", work_date: "2026-10-11", upload_date: "2026-10-13", amount: 1 })).status, 422);
  assert.equal((await leader.call("PUT", "/api/calendar/plan", { app: app1(), type: "Video", date: TODAY, amount: 9 })).status, 409);
  // Staff Marketing boleh mengisi rencana untuk apps yang dipegangnya.
  assert.equal((await mk.call("PUT", "/api/calendar/plan", { app: app1(), type: "Carousel", date: TODAY, amount: 1 })).status, 200);

  let c = await makeVideo(mk, { created_date: TODAY, upload_date: "2026-10-13" });
  let h3 = (await mk.call("GET", "/api/targets/h3")).data.byType.Video;
  assert.deepEqual(h3, { plan: 3, ready: 0, remaining: 3 });
  await patch(mk, c, { script_status: opt("script", "Ready") });
  h3 = (await mk.call("GET", "/api/targets/h3")).data.byType.Video;
  assert.deepEqual(h3, { plan: 3, ready: 1, remaining: 2 });
  const cal = (await mk.call("GET", "/api/calendar?month=2026-10")).data;
  assert.equal(cal.actuals[JSON.stringify([app1(), "Video", TODAY])], 1);
});

test("performa: tepat waktu H-3 untuk Marketing dan target yang belum dibuat dihitung telat", async () => {
  const leader = await login("leader");
  const raka = await login("raka");
  // Target lewat tenggat (upload 2026-10-11 → tenggat 2026-10-08), belum ada konten.
  await leader.call("POST", "/api/kpis", { user_id: raka.id, app: app1(), type: "Carousel", work_date: "2026-10-07", upload_date: "2026-10-11", amount: 2 });
  const team = (await leader.call("GET", "/api/team?month=2026-10")).data;
  const p = team.people.find((x) => x.user.id === raka.id);
  assert.equal(p.target, 2);
  assert.equal(p.late, 2);
  // Staff hanya melihat dirinya sendiri.
  const own = (await raka.call("GET", "/api/team?month=2026-10")).data.people;
  assert.deepEqual(own.map((x) => x.user.id), [raka.id]);
});

test("dropdown: kategori pilihan yang sudah dipakai tidak bisa diubah; pilihan dihapus diarsipkan", async () => {
  const leader = await login("leader");
  const rows = db.prepare("select * from options where key = 'script' order by sort").all();
  const bad = await leader.call("PUT", "/api/options/script", { options: [{ id: rows[0].id, label: "Draft", semantic: "Ready" }, { id: rows[1].id, label: "Siap", semantic: "Ready" }] });
  assert.equal(bad.status, 422);
  const ok = await leader.call("PUT", "/api/options/script", { options: [{ id: rows[0].id, label: "Draft", semantic: "Draft" }, { id: rows[1].id, label: "Siap shooting", semantic: "Ready" }] });
  assert.equal(ok.status, 200);
  const apps = db.prepare("select * from options where key = 'app' order by sort").all();
  await leader.call("PUT", "/api/options/app", { options: apps.slice(1).map((o) => ({ id: o.id, label: o.label })) });
  assert.equal(db.prepare("select archived from options where id = ?").get(apps[0].id).archived, 1);
  assert.equal((await leader.call("PUT", "/api/options/qc", { options: [{ label: "Done", semantic: "Done" }] })).status, 422);
});

test("akun: hanya Leader mengelola; password minimal 8", async () => {
  const leader = await login("leader");
  const mk = await login("nadia");
  assert.equal((await mk.call("POST", "/api/users", { username: "xena", name: "X", position: "Staff", role: "Creative", password: "12345678" })).status, 403);
  assert.equal((await leader.call("POST", "/api/users", { username: "xena", name: "X", position: "Staff", role: "Creative", password: "123" })).status, 422);
  assert.equal((await leader.call("POST", "/api/users", { username: "xena", name: "X", position: "Staff", role: "Creative", password: "12345678" })).status, 200);
  assert.equal((await leader.call("PATCH", `/api/users/${leader.id}`, { active: false })).status, 422);
});

test("semua peran dapat mengubah dropdown tabel pada konten yang terlihat", async () => {
  const mk = await login("nadia");
  const cr = await login("dimas");
  let c = await makeVideo(mk, { creative_user_id: cr.id });
  c = (await patch(mk, c, { script_status: opt("script", "Ready") })).data;
  // Creative mengubah status take dan editor; Marketing mengubah status creative kembali.
  c = (await patch(cr, c, { talent_status: opt("talent", "Done") })).data;
  assert.equal(c.talent_status, opt("talent", "Done"));
  const r = await patch(cr, c, { app: db.prepare("select id from options where key='app' and archived=0 order by sort desc").get().id });
  assert.equal(r.status, 200);
  assert.ok(r.data.editable.includes("qc_status"));
});

test("dua Leader: Leader Creative memimpin tim Creative, Leader Marketing tim Marketing", async () => {
  const lm = await login("leader");
  const lc = await login("bima");
  const nadia = await login("nadia");
  const dimas = await login("dimas");
  const c = await makeVideo(nadia);
  // Keduanya melihat semua konten.
  assert.equal((await lc.call("GET", `/api/contents/${c.id}`)).status, 200);
  // Pembuatan skrip & rencana kalender milik Marketing.
  assert.equal((await lc.call("POST", "/api/contents", { type: "Video", app: app1(), sheet: videoSheet() })).status, 403);
  assert.equal((await lc.call("PUT", "/api/calendar/plan", { app: app1(), type: "Video", date: TODAY, color: "blue" })).status, 200);
  // KPI hanya untuk tim sendiri.
  const kpi = { app: app1(), type: "Video", work_date: TODAY, upload_date: "2026-10-12", amount: 2 };
  assert.equal((await lc.call("POST", "/api/kpis", { ...kpi, user_id: nadia.id })).status, 422);
  assert.equal((await lc.call("POST", "/api/kpis", { ...kpi, user_id: dimas.id, work_date: "2026-10-11" })).status, 200);
  assert.equal((await lm.call("POST", "/api/kpis", { ...kpi, user_id: dimas.id, work_date: "2026-10-11" })).status, 422);
  assert.ok((await lc.call("GET", "/api/kpis?month=2026-10")).data.every((k) => k.role === "Creative"));
  // Performa: masing-masing melihat timnya.
  assert.ok((await lc.call("GET", "/api/team?month=2026-10")).data.people.every((p) => p.user.role === "Creative"));
  assert.ok((await lm.call("GET", "/api/team?month=2026-10")).data.people.every((p) => p.user.role === "Marketing"));
  // Leader Creative mengisi link hasil, tidak mengubah isi skrip.
  const cur = (await lc.call("GET", `/api/contents/${c.id}`)).data;
  assert.ok(cur.editable.includes("link") && !cur.editable.includes("sheet"));
  // Leader Marketing bisa langsung menugaskan skrip ke staff.
  const assigned = await lm.call("POST", "/api/contents", { type: "Carousel", app: app1(), marketing_user_id: nadia.id, sheet: { type: "Carousel", meta: ["Tema"], rows: [{ label: "Slide utama" }, { label: "CTA" }] } });
  assert.equal(assigned.data.marketing_user_id, nadia.id);
  // Leader tidak boleh berperan Talent.
  assert.equal((await lm.call("POST", "/api/users", { username: "tl1", name: "T", position: "Leader", role: "Talent", password: "12345678" })).status, 422);
});

test("pembagian apps: hanya tim Marketing, diatur Leader Marketing", async () => {
  const lm = await login("leader");
  const lc = await login("bima");
  const nadia = await login("nadia");
  const raka = await login("raka");
  const sinta = await login("sinta");
  const apps = db.prepare("select id from options where key='app' and archived=0 order by sort").all().map((r) => r.id);
  const [a1, a2] = [apps[0], apps[1]];
  // Leader Creative tidak mengatur apps; staff Creative tidak bisa diberi apps.
  assert.equal((await lc.call("PUT", `/api/users/${raka.id}/apps`, { apps: [a2] })).status, 403);
  assert.equal((await lm.call("PUT", `/api/users/${sinta.id}/apps`, { apps: [a2] })).status, 403);
  assert.equal((await lm.call("PUT", `/api/users/${raka.id}/apps`, { apps: [a2] })).status, 200);
  await lm.call("PUT", `/api/users/${nadia.id}/apps`, { apps: [a1, a2] });
  assert.ok((await lm.call("GET", "/api/app-assignments")).data.every((u) => u.role === "Marketing"));
  // Konten Nadia di apps a2 terlihat oleh Raka lewat pembagian apps; Sinta (Creative) tidak.
  const inA2 = (await nadia.call("POST", "/api/contents", { type: "Video", app: a2, sheet: videoSheet() })).data;
  const inA1 = (await nadia.call("POST", "/api/contents", { type: "Video", app: a1, sheet: videoSheet() })).data;
  assert.equal((await raka.call("GET", `/api/contents/${inA2.id}`)).status, 200);
  assert.equal((await raka.call("GET", `/api/contents/${inA1.id}`)).status, 404);
  assert.equal((await sinta.call("GET", `/api/contents/${inA2.id}`)).status, 404);
  // Staff dengan apps tertentu tidak bisa membuat konten di apps lain.
  assert.equal((await raka.call("POST", "/api/contents", { type: "Video", app: a1, sheet: videoSheet() })).status, 422);
  assert.deepEqual((await raka.call("GET", "/api/bootstrap")).data.me.apps, [a2]);
});

test("apps langsung ditentukan saat membuat akun", async () => {
  const lm = await login("leader");
  const app = db.prepare("select id from options where key='app' and archived=0 order by sort").get().id;
  const ok = await lm.call("POST", "/api/users", { username: "mira", name: "Mira", position: "Staff", role: "Marketing", password: "12345678", apps: [app] });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.data.apps, [app]);
  // Leader Marketing tidak mengatur apps staff Creative.
  const bad = await lm.call("POST", "/api/users", { username: "cici", name: "Cici", position: "Staff", role: "Creative", password: "12345678", apps: [app] });
  assert.equal(bad.status, 422);
  assert.equal(db.prepare("select count(*) n from users where username = 'cici'").get().n, 0);
});

test("hak akses staff: Marketing per apps (konten & kalender), Creative hanya dropdown", async () => {
  const lm = await login("leader");
  const lc = await login("bima");
  const nadia = await login("nadia");
  const dimas = await login("dimas");
  const apps = db.prepare("select id from options where key='app' and archived=0 order by sort").all().map((r) => r.id);
  const own = apps[5];
  const other = apps[6];
  // Staff Marketing tanpa apps belum bisa membuat konten; setelah diberi apps hanya untuk apps-nya.
  db.prepare("delete from user_apps where user_id = ?").run(nadia.id);
  assert.equal((await nadia.call("POST", "/api/contents", { type: "Video", app: own, sheet: videoSheet() })).status, 422);
  await lm.call("PUT", `/api/users/${nadia.id}/apps`, { apps: [own] });
  assert.equal((await nadia.call("POST", "/api/contents", { type: "Video", app: own, sheet: videoSheet() })).status, 200);
  assert.equal((await nadia.call("POST", "/api/contents", { type: "Video", app: other, sheet: videoSheet() })).status, 422);
  // Kalender: staff Marketing untuk apps-nya; staff Creative tidak; kedua Leader bisa.
  assert.equal((await nadia.call("PUT", "/api/calendar/plan", { app: own, type: "Carousel", date: "2026-10-20", amount: 2 })).status, 200);
  assert.equal((await nadia.call("PUT", "/api/calendar/plan", { app: other, type: "Carousel", date: "2026-10-20", amount: 2 })).status, 422);
  assert.equal((await dimas.call("PUT", "/api/calendar/plan", { app: own, type: "Carousel", date: "2026-10-21", amount: 1 })).status, 403);
  assert.equal((await lc.call("PUT", "/api/calendar/plan", { app: other, type: "Carousel", date: "2026-10-21", amount: 1 })).status, 200);
  // Staff Creative: dropdown & link saja, catatan tidak.
  const c = (await nadia.call("POST", "/api/contents", { type: "Video", app: own, sheet: videoSheet(), creative_user_id: dimas.id })).data;
  const seen = (await dimas.call("GET", `/api/contents/${c.id}`)).data;
  assert.ok(!seen.editable.includes("notes") && !seen.editable.includes("sheet") && seen.editable.includes("qc_status"));
  assert.equal((await dimas.call("PATCH", `/api/contents/${c.id}`, { revision: seen.revision, changes: { notes: "x" } })).status, 403);
});
