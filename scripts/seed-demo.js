// Mengisi database dengan akun & konten contoh lewat API asli (aturan workflow tetap berlaku).
//   npm run demo                       → PGlite lokal di data/pglite (hanya bila belum ada konten)
//   DATABASE_URL=postgres://… npm run demo → Postgres/Supabase
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../server/app.js";
import { hashPassword } from "../server/auth.js";
import { connect } from "../server/index.js";
import { addDays, jakartaDate } from "../server/rules.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { db, close } = await connect();
if ((await db.one("select count(*)::int n from contents")).n > 0) {
  console.log("Database sudah berisi konten — demo tidak dimuat ulang.");
  process.exit(0);
}

const PASSWORD = "demo12345";
const people = [
  ["leader", "Alya", "Leader", "Marketing"], ["bima", "Bima", "Leader", "Creative"], ["nadia", "Nadia", "Staff", "Marketing"], ["raka", "Raka", "Staff", "Marketing"],
  ["dimas", "Dimas", "Staff", "Creative"], ["sinta", "Sinta", "Staff", "Creative"], ["putri", "Putri", "Staff", "Talent"],
];
for (const [username, name, position, role] of people) {
  const exists = await db.one("select id from users where lower(username) = lower(?)", [username]);
  if (exists) await db.run("update users set name = ?, position = ?, role = ?, password_hash = ?, active = 1 where id = ?", [name, position, role, hashPassword(PASSWORD), exists.id]);
  else await db.run("insert into users (username, name, position, role, password_hash) values (?, ?, ?, ?, ?)", [username, name, position, role, hashPassword(PASSWORD)]);
}

const server = createApp({ db, publicDir: join(root, "public") });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
async function as(username) {
  const res = await fetch(`${base}/api/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password: PASSWORD }) });
  const cookie = res.headers.get("set-cookie").split(";")[0];
  const { id } = await db.one("select id from users where lower(username) = lower(?)", [username]);
  const call = async (method, path, body) => {
    const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json", cookie }, body: body && JSON.stringify(body) });
    const data = await r.json();
    if (!r.ok) throw new Error(`${method} ${path}: ${data.error} ${JSON.stringify(data.details ?? "")}`);
    return data;
  };
  return { call, id };
}

const leader = await as("leader");
const leaderCreative = await as("bima");
const nadia = await as("nadia");
const raka = await as("raka");
const dimas = await as("dimas");
const sinta = await as("sinta");
const putri = await as("putri");

// Talent sesuai nama akun Talent.
const talentOpts = await db.query("select id, label from options where key = 'talentName' order by sort");
await leader.call("PUT", "/api/options/talentName", { options: [{ id: talentOpts[0].id, label: "Putri" }, { id: talentOpts[1].id, label: "Fajar" }] });

// Pembagian apps (khusus tim Marketing, diatur Leader Marketing).
const O = await db.query("select * from options order by key, sort");
const appIdByLabel = (label) => O.find((o) => o.key === "app" && o.label === label).id;
for (const [by, u, labels] of [
  [leader, nadia, ["JadiASN"]], [leader, raka, ["JadiBUMN", "JadiBeasiswa"]],
]) {
  await by.call("PUT", `/api/users/${u.id}/apps`, { apps: labels.map(appIdByLabel) });
}

const opt = (key, semantic) => O.find((o) => o.key === key && o.semantic === semantic && !o.archived).id;
const appId = appIdByLabel;
const talentPutri = O.find((o) => o.key === "talentName" && o.label === "Putri").id;
const today = jakartaDate();
const d = (n) => addDays(today, n);

const sheets = {
  Video: (title) => ({
    type: "Video",
    meta: [title, "Inframe talent + insert footage", "https://www.tiktok.com/@contoh/video/1", "Close-up talent, pertanyaan muncul di 2 detik pertama"],
    metaFootage: ["", "", "", "Talent menatap kamera"], metaEditing: ["", "", "", "Teks besar + SFX pop"],
    rows: [
      { label: "Hook", text: "Masih bingung mulai persiapan dari mana?", footage: "Talent bicara ke kamera", direction: "Subtitle kuning, zoom in" },
      { label: "Tahapan 1", text: "Kenali target dan materi tes.", footage: "Close-up buku materi", direction: "Highlight poin 1" },
      { label: "Tahapan 2", text: "Ukur kemampuan dengan latihan awal.", footage: "Layar aplikasi tryout", direction: "Screen record" },
      { label: "Tahapan 3", text: "Susun jadwal dan evaluasi tiap minggu.", footage: "Kalender belajar", direction: "Checklist animasi" },
      { label: "CTA", text: "Simpan video ini dan mulai latihan sekarang.", footage: "Talent menunjuk layar", direction: "Logo + link bio" },
    ],
    caption1: `${title} 🔥 Langkah kecil hari ini, hasil besar nanti. #PersiapanTes`,
    caption2: `${title}. Simpan sebagai pengingat belajarmu!`,
    notes: "Format 9:16, maksimal 45 detik.",
  }),
  Carousel: (title) => ({
    type: "Carousel",
    meta: [title],
    rows: [
      { label: "Slide utama", text: title, direction: "Judul besar, warna brand" },
      { label: "Slide 2", text: "Kenali target", direction: "Ikon target" },
      { label: "Slide 3", text: "Susun jadwal", direction: "Ilustrasi kalender" },
      { label: "CTA", text: "Simpan & bagikan ke teman belajar", direction: "Tombol save" },
    ],
    caption1: `${title} — simpan dulu biar nggak lupa!`, caption2: "", notes: "Format 4:5, satu fokus per slide.",
  }),
  Singlepost: (title) => ({
    type: "Singlepost",
    meta: [title, "Materi internal", "Ilustrasi pelajar dengan checklist"],
    rows: [{ label: "Isi", text: "Tentukan target, mulai latihan, dan evaluasi progresmu." }, { label: "CTA", text: "Mulai persiapan bersama kami." }],
    caption1: "Setiap langkah kecil adalah progres. Sudah mulai belajar hari ini?", caption2: "", notes: "Judul dominan, CTA di bawah.",
  }),
};

async function content(mk, { title, type, app = "JadiASN", created = d(-2), upload, editor, talent = true, steps = [] }) {
  let c = await mk.call("POST", "/api/contents", {
    type, app: appId(app), created_date: created, upload_date: upload, sheet: sheets[type](title),
    creative_user_id: editor?.id ?? null, ...(type === "Video" && talent ? { talent_name: talentPutri } : {}),
  });
  const patch = async (u, changes) => (c = await u.call("PATCH", `/api/contents/${c.id}`, { revision: c.revision, changes }));
  for (const step of steps) {
    if (step === "ready") await patch(mk, { script_status: opt("script", "Ready") });
    if (step === "notalent") await patch(mk, { talent_name: null });
    if (step === "take") await patch(putri, { talent_status: opt("talent", type === "Video" && talent ? "Done" : "Tidak perlu") });
    if (step === "skiptake") await patch(mk, { talent_status: opt("talent", "Tidak perlu") });
    if (step === "edit") await patch(editor, { link: `https://drive.google.com/file/d/demo-${c.id}`, creative_status: opt("creative", "Done") });
    if (step === "revisi") await patch(mk, { qc_status: opt("qc", "Revisi"), notes: "Subtitle opening terlambat, perbaiki tempo." });
    if (step === "qc") await patch(mk, { qc_status: opt("qc", "Done") });
    if (step === "publish") c = await mk.call("POST", `/api/contents/${c.id}/publish`, { revision: c.revision, url: `https://www.tiktok.com/@jadiasn/video/${c.id}`, date: upload <= today ? upload : today });
  }
  return c;
}

await content(nadia, { title: "Persiapan SKD: mulai dari mana?", type: "Video", upload: d(3), editor: dimas, steps: [] });
await content(nadia, { title: "3 kesalahan saat wawancara", type: "Video", upload: d(0), editor: dimas, steps: ["ready"] });
await content(nadia, { title: "Strategi belajar 30 menit sehari", type: "Video", upload: d(1), editor: dimas, steps: ["ready", "take"] });
await content(nadia, { title: "Checklist sebelum hari tes", type: "Video", upload: d(2), editor: dimas, steps: ["ready", "take", "edit"] });
await content(nadia, { title: "Cara menjawab soal numerik", type: "Video", upload: d(1), editor: dimas, steps: ["ready", "take", "edit", "revisi"] });
await content(raka, { title: "Kenali tipe soal psikotes", type: "Carousel", app: "JadiBUMN", upload: d(0), editor: sinta, steps: ["ready", "edit", "qc"] });
await content(raka, { title: "Bikin rencana belajar mingguan", type: "Singlepost", app: "JadiBUMN", upload: d(2), editor: sinta, steps: ["ready"] });
await content(raka, { title: "Persiapan S2 yang sering terlewat", type: "Carousel", app: "JadiBeasiswa", created: d(-6), upload: d(-2), editor: sinta, steps: ["ready"] });
await content(nadia, { title: "Belajar konsisten tanpa burnout", type: "Video", created: d(-7), upload: d(-3), editor: dimas, steps: ["ready", "take", "edit", "qc", "publish"] });
await content(raka, { title: "Tips menutup wawancara", type: "Singlepost", app: "JadiBUMN", created: d(-5), upload: d(-1), editor: sinta, steps: ["ready", "edit", "qc", "publish"] });
await content(nadia, { title: "Bingung pilih jurusan?", type: "Video", app: "JadiASN", created: d(-4), upload: d(-1), editor: dimas, talent: false, steps: ["ready", "skiptake"] });

// Target KPI bulan ini → otomatis menjadi rencana kalender (Marketing).
for (const [u, app, type, work, upload, amount] of [
  [nadia, "JadiASN", "Video", d(0), d(3), 3], [nadia, "JadiASN", "Video", d(1), d(4), 2], [raka, "JadiBUMN", "Carousel", d(0), d(3), 2],
  [raka, "JadiBUMN", "Singlepost", d(2), d(5), 2], [dimas, "JadiASN", "Video", d(1), d(3), 3], [sinta, "JadiBUMN", "Carousel", d(1), d(3), 2],
]) {
  // Target staff Creative ditetapkan Leader Creative; staff Marketing oleh Leader Marketing.
  const by = [dimas, sinta].includes(u) ? leaderCreative : leader;
  await by.call("POST", "/api/kpis", { user_id: u.id, app: appId(app), type, work_date: work, upload_date: upload, amount });
}
await leader.call("PUT", "/api/calendar/plan", { app: appId("JadiASN"), type: "Video", date: d(0), color: "blue" });
await leader.call("PUT", "/api/calendar/plan", { app: appId("JadiBUMN"), type: "Carousel", date: d(0), color: "yellow" });
await leader.call("PUT", "/api/calendar/plan", { app: appId("JadiBeasiswa"), type: "Carousel", date: d(2), amount: 1, color: "green" });

// Data demo dibuat sekaligus hari ini; mundurkan waktu selesai agar performa terlihat realistis.
// (Hanya untuk demo — di pemakaian nyata timestamp dicatat server saat status berubah.)
const day = (expr) => `to_char((${expr})::date, 'YYYY-MM-DD')`;
await db.exec(`
  update contents set script_ready_at = created_date || 'T03:00:00.000Z' where script_ready_at is not null;
  update contents set talent_done_at = least(${day("created_date::date + 1")}, ${day("upload_date::date - 1")}) || 'T05:00:00.000Z' where talent_done_at is not null;
  update contents set creative_done_at = ${day("upload_date::date - 1")} || 'T07:00:00.000Z', link_at = ${day("upload_date::date - 1")} || 'T07:00:00.000Z'
    where creative_done_at is not null and ${day("upload_date::date - 1")} <= ${day("now()")};
  update contents set script_ready_at = ${day("upload_date::date - 1")} || 'T03:00:00.000Z' where title = 'Cara menjawab soal numerik';
`);
server.close();
await close();
console.log(`Data demo dimuat. Login (password semua: ${PASSWORD}): ${people.map((p) => `${p[0]} (${p[1]} · ${p[2]} ${p[3]})`).join(", ")}`);
