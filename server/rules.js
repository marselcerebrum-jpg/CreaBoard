// Aturan bisnis Content Studio. Semua keputusan izin & workflow ada di sini (server),
// bukan di UI, sehingga tidak bisa dilewati lewat devtools.

export const TYPES = ["Video", "Carousel", "Singlepost"];
export const STATUS_KEYS = ["script", "talent", "creative", "qc"];
export const SEMANTICS = {
  script: ["Draft", "Ready"],
  talent: ["Belum", "Done", "Tidak perlu"],
  creative: ["Belum", "Done"],
  qc: ["", "Done", "Revisi"],
};
// Tenggat KPI: skrip Ready paling lambat H-3 upload, hasil creative Done paling lambat H-1 upload.
export const DEADLINE_DAYS = { Marketing: 3, Creative: 1 };
export const MAX_ROWS = { Video: 12, Carousel: 10, Singlepost: 2 };
// Jenis skrip. Trend & Urgent dibuat mendekati tanggal upload, jadi tenggatnya H-0 (hari upload).
export const PRIORITIES = ["Reguler", "Trend", "Urgent"];
export const deadlineDays = (role, priority) => (priority === "Trend" || priority === "Urgent" ? 0 : DEADLINE_DAYS[role]);
/** Skrip Trend sifatnya mendadak: tidak pernah dihitung telat. */
export const neverLate = (priority) => priority === "Trend";

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export const fail = (status, message, details) => {
  throw new HttpError(status, message, details);
};

// ───────────── tanggal (Asia/Jakarta) ─────────────
const JKT = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" });
export const jakartaDate = (d = new Date()) => JKT.format(d);
export function addDays(date, n) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
export const stampDay = (iso) => (iso ? jakartaDate(new Date(iso)) : null);
export const isHttpUrl = (v) => {
  if (typeof v !== "string" || !/^https?:\/\//i.test(v)) return false;
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
};

// ───────────── opsi dropdown ─────────────
export async function optionIndex(db) {
  const rows = await db.query("select * from options order by key, sort");
  const byId = new Map(rows.map((o) => [o.id, o]));
  const sem = (id) => byId.get(id)?.semantic ?? null;
  const firstWith = (key, semantic) =>
    rows.find((o) => o.key === key && o.semantic === semantic && !o.archived)?.id ??
    rows.find((o) => o.key === key && o.semantic === semantic)?.id;
  return { rows, byId, sem, firstWith };
}

// ───────────── visibilitas & izin ─────────────
export function canSee(user, c, opts) {
  if (user.position === "Leader") return true;
  // Pembagian apps hanya untuk Marketing: staff Marketing melihat semua konten di apps yang dipegangnya.
  if (user.role === "Marketing" && user.apps?.includes(c.app)) return true;
  if (user.role === "Marketing") return c.marketing_user_id === user.id;
  if (user.role === "Creative") return c.creative_user_id === user.id;
  if (user.role === "Talent") {
    const label = opts.byId.get(c.talent_name)?.label ?? "";
    return c.type === "Video" && label.trim().toLowerCase() === user.name.trim().toLowerCase();
  }
  return false;
}

// Semua dropdown di tabel boleh diubah siapa pun yang dapat melihat konten (keputusan tim:
// alur lebih dinamis). Urutan proses tetap dijaga applyWorkflow. Field non-dropdown tetap per peran.
// "footage" = kolom FOOTAGE skrip Video (link footage): boleh diubah/ditambah semua peran.
const DROPDOWN_FIELDS = ["app", "script_status", "talent_name", "talent_status", "creative_user_id", "creative_status", "qc_status", "footage"];
const MARKETING_FIELDS = [...DROPDOWN_FIELDS, "type", "created_date", "upload_date", "sheet", "notes", "priority"];
// Staff Creative hanya mengubah dropdown (+ link hasil, syarat wajib status Creative "Done").
const CREATIVE_FIELDS = [...DROPDOWN_FIELDS, "link"];
const TALENT_FIELDS = [...DROPDOWN_FIELDS, "notes"];

// Ada dua Leader: Leader Marketing dan Leader Creative. Keduanya melihat semua konten,
// tetapi masing-masing memimpin bidangnya sendiri.
export const isLeader = (user) => user?.position === "Leader";
export const leads = (user, role) => isLeader(user) && user.role === role;
/** Pembagian apps hanya di tim Marketing dan diatur Leader Marketing. */
export const manages = (leader, target) => leads(leader, "Marketing") && target.position === "Staff" && target.role === "Marketing";

/** Hapus skrip: Leader Marketing semua; staff Marketing hanya skrip miliknya yang belum selesai diedit/tayang. */
export function canDeleteContent(user, c, opts) {
  if (leads(user, "Marketing")) return true;
  const started = opts.sem(c.creative_status) === "Done" || Boolean(c.published_date);
  return user.role === "Marketing" && c.marketing_user_id === user.id && !started;
}

export function editableFields(user, c, opts) {
  if (!canSee(user, c, opts)) return [];
  if (leads(user, "Marketing")) return [...MARKETING_FIELDS, "marketing_user_id"];
  if (user.role === "Marketing") return MARKETING_FIELDS;
  if (leads(user, "Creative")) return [...CREATIVE_FIELDS, "notes"];
  if (user.role === "Creative") return CREATIVE_FIELDS;
  if (user.role === "Talent") return TALENT_FIELDS;
  return [];
}

// ───────────── skrip (sheet) ─────────────
/** Ganti hanya kolom FOOTAGE skrip Video: { metaFootage: [4 teks], rows: [teks per baris] }. */
export function mergeFootage(sheet, footage) {
  if (sheet?.type !== "Video" || !footage || typeof footage !== "object") return sheet;
  const next = structuredClone(sheet);
  if (Array.isArray(footage.metaFootage)) next.metaFootage = next.metaFootage.map((v, i) => (typeof footage.metaFootage[i] === "string" ? footage.metaFootage[i].slice(0, 20000) : v));
  if (Array.isArray(footage.rows)) next.rows = next.rows.map((r, i) => (typeof footage.rows[i] === "string" ? { ...r, footage: footage.rows[i].slice(0, 20000) } : r));
  return next;
}
/** Isi skrip tanpa kolom footage — perubahan footage saja tidak terkena kunci skrip. */
const scriptCore = (sheet) => {
  if (!sheet) return sheet;
  const { metaFootage, ...rest } = sheet;
  return { ...rest, rows: (rest.rows ?? []).map(({ footage, ...r }) => r) };
};

const str = (v, max = 20000) => (typeof v === "string" ? v.slice(0, max) : "");

/** Menormalkan struktur worksheet dari klien; field asing dibuang. */
export function normalizeSheet(type, raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  const metaLen = type === "Video" ? 4 : type === "Carousel" ? 1 : 3;
  const arr = (v, n) => Array.from({ length: n }, (_, i) => str(Array.isArray(v) ? v[i] : ""));
  let rows = Array.isArray(s.rows) ? s.rows.slice(0, MAX_ROWS[type] + 1) : [];
  rows = rows.map((r) => ({ label: str(r?.label, 80), text: str(r?.text), footage: str(r?.footage), direction: str(r?.direction) }));
  const sheet = {
    type,
    meta: arr(s.meta, metaLen),
    rows,
    caption1: str(s.caption1),
    caption2: str(s.caption2),
    notes: str(s.notes),
  };
  if (type === "Video") {
    sheet.metaFootage = arr(s.metaFootage, 4);
    sheet.metaEditing = arr(s.metaEditing, 4);
  }
  return sheet;
}

export function defaultSheet(type) {
  const rows =
    type === "Video"
      ? ["Hook", "Tahapan 1", "Tahapan 2", "Tahapan 3", "CTA"]
      : type === "Carousel"
        ? ["Slide utama", "Slide 2", "CTA"]
        : ["Isi", "CTA"];
  return normalizeSheet(type, { rows: rows.map((label) => ({ label })) });
}

/** Syarat "Skrip ready". Mengembalikan daftar kekurangan (kosong = lengkap). */
export function scriptReadyErrors(c) {
  const s = c.sheet;
  const e = [];
  const filled = (v) => typeof v === "string" && v.trim() !== "";
  const rows = s.rows ?? [];
  const first = rows[0]?.text;
  const last = rows.length > 1 ? rows[rows.length - 1]?.text : "";
  if (c.type === "Video") {
    if (!filled(s.meta[0])) e.push("Kata kunci wajib diisi");
    if (!filled(first)) e.push("Hook wajib diisi");
    if (!rows.slice(1, -1).some((r) => filled(r.text))) e.push("Minimal satu tahapan isi");
    if (!filled(last)) e.push("CTA wajib diisi");
    if (!filled(s.caption1) && !filled(s.caption2)) e.push("Minimal satu caption (TikTok/Instagram)");
  } else if (c.type === "Carousel") {
    if (!filled(s.meta[0])) e.push("Tema wajib diisi");
    if (!filled(first)) e.push("Slide utama wajib diisi");
    if (rows.length > MAX_ROWS.Carousel) e.push(`Carrousel maksimal ${MAX_ROWS.Carousel} slide`);
    if (!filled(last)) e.push("CTA wajib diisi");
    if (!filled(s.caption1)) e.push("Caption wajib diisi");
  } else {
    if (!filled(s.meta[0])) e.push("Judul / hook wajib diisi");
    if (!filled(first)) e.push("Isi wajib diisi");
    if (!filled(last)) e.push("CTA wajib diisi");
    if (!filled(s.caption1)) e.push("Caption wajib diisi");
  }
  return e;
}

export const titleFromSheet = (sheet, fallback = "") => (sheet.meta?.[0] ?? "").trim().split("\n")[0].slice(0, 200) || fallback;

// ───────────── validasi transisi ─────────────
/**
 * Memvalidasi state baru terhadap state lama dan mengisi otomatis timestamp/QC.
 * `next` dimodifikasi di tempat. Melempar HttpError 422/409 bila melanggar aturan.
 */
export function applyWorkflow(prev, next, opts, now) {
  const S = (key, id) => opts.sem(id);
  const was = {
    script: S("script", prev.script_status),
    talent: S("talent", prev.talent_status),
    creative: S("creative", prev.creative_status),
    qc: S("qc", prev.qc_status),
  };
  const is = {
    script: S("script", next.script_status),
    talent: S("talent", next.talent_status),
    creative: S("creative", next.creative_status),
    qc: S("qc", next.qc_status),
  };
  const published = Boolean(prev.published_date);
  const errors = [];

  for (const [key, id] of [["script", next.script_status], ["creative", next.creative_status], ["qc", next.qc_status]]) {
    const o = opts.byId.get(id);
    if (!o || o.key !== key) errors.push(`Pilihan ${key} tidak valid`);
  }
  if (next.type === "Video") {
    const o = opts.byId.get(next.talent_status);
    if (!o || o.key !== "talent") errors.push("Status take tidak valid");
    if (next.talent_name && opts.byId.get(next.talent_name)?.key !== "talentName") errors.push("Nama talent tidak valid");
  }
  if (!opts.byId.get(next.app) || opts.byId.get(next.app).key !== "app") errors.push("Apps tidak valid");
  if (!isDate(next.created_date) || !isDate(next.upload_date)) errors.push("Tanggal tidak valid");
  else if (next.upload_date < next.created_date) errors.push("Tanggal upload tidak boleh sebelum tanggal pengerjaan");
  if (errors.length) fail(422, "Data tidak valid", errors);

  // Konten yang sudah tayang dikunci; Leader Marketing harus membatalkan status tayang dulu.
  if (published) {
    const locked = ["sheet", "type", "script_status", "talent_status", "creative_status", "qc_status", "link"].filter((f) =>
      f === "sheet" ? JSON.stringify(scriptCore(prev.sheet)) !== JSON.stringify(scriptCore(next.sheet)) : JSON.stringify(prev[f]) !== JSON.stringify(next[f]),
    );
    if (locked.length) fail(409, "Konten sudah tayang. Batalkan status tayang dulu untuk mengubah skrip/status.");
  }

  const sheetChanged = JSON.stringify(scriptCore(prev.sheet)) !== JSON.stringify(scriptCore(next.sheet)) || prev.type !== next.type;
  if (sheetChanged && was.creative === "Done" && is.creative === "Done") {
    fail(409, "Skrip terkunci karena hasil creative sudah selesai. Ubah status Creative ke Belum dulu bila perlu revisi skrip.");
  }
  if (prev.type !== next.type && was.script === "Ready") fail(409, "Bentuk konten hanya bisa diubah saat skrip masih Draft.");

  // Skrip
  if (is.script === "Ready") {
    const missing = scriptReadyErrors(next);
    if (missing.length) fail(422, "Skrip belum lengkap untuk ditandai ready", missing);
  }
  if (was.script === "Ready" && is.script !== "Ready" && (is.creative === "Done" || is.talent === "Done")) {
    fail(409, "Skrip tidak bisa dikembalikan ke Draft karena take/hasil sudah selesai.");
  }

  // Take talent (khusus video)
  if (next.type !== "Video") {
    next.talent_status = opts.firstWith("talent", "Tidak perlu");
    next.talent_name = null;
    is.talent = "Tidak perlu";
  } else if (is.talent === "Done" && is.script !== "Ready") {
    fail(422, "Take talent hanya bisa Done setelah skrip ready.");
  }

  if (!PRIORITIES.includes(next.priority ?? "Reguler")) fail(422, "Jenis skrip tidak valid");
  next.priority = next.priority ?? "Reguler";

  // Creative
  const link = (next.link ?? "").trim();
  if (link && !isHttpUrl(link)) fail(422, "Link hasil harus diawali http:// atau https://");
  next.link = link;
  // QC diisi saat link hasil sudah ada → hasil creative dianggap selesai (tidak perlu dua langkah).
  if (is.qc !== "" && is.qc !== was.qc && is.creative !== "Done" && link) {
    next.creative_status = opts.firstWith("creative", "Done");
    is.creative = "Done";
  }
  if (is.creative === "Done") {
    const missing = [];
    if (is.script !== "Ready") missing.push("Skrip belum ready");
    if (next.type === "Video" && !["Done", "Tidak perlu"].includes(is.talent)) missing.push("Take talent belum selesai");
    if (!link) missing.push("Link hasil wajib diisi");
    if (missing.length) fail(422, "Hasil belum bisa ditandai Done", missing);
  }

  // Hasil berubah (link baru / creative dibuka lagi) → keputusan QC lama tidak berlaku.
  const resubmitted = (prev.link ?? "") !== link || (was.creative === "Done" && is.creative !== "Done");
  if (resubmitted && was.qc !== "" && next.qc_status === prev.qc_status) {
    next.qc_status = opts.firstWith("qc", "");
    is.qc = "";
  }

  // QC
  if (is.qc !== "" && is.creative !== "Done") fail(422, "QC baru bisa diisi setelah Creative mengisi Link hasil.");
  if (is.qc === "Revisi" && !String(next.notes ?? "").trim()) fail(422, "Tulis catatan revisi di kolom Catatan sebelum memilih Revisi.");

  // Timestamp otomatis: diisi saat masuk status selesai, dihapus bila status mundur.
  const stamp = (field, active, changed) => {
    if (!active) next[field] = null;
    else if (changed || !prev[field]) next[field] = now;
  };
  stamp("script_ready_at", is.script === "Ready", was.script !== "Ready");
  stamp("talent_done_at", next.type === "Video" && is.talent === "Done", was.talent !== "Done");
  stamp("creative_done_at", is.creative === "Done", was.creative !== "Done");
  stamp("qc_at", is.qc !== "", was.qc !== is.qc);
  if ((prev.link ?? "") !== link) next.link_at = link ? now : null;
  return is;
}

// ───────────── metrik dashboard ─────────────
/**
 * Flag per konten. Satu definisi dipakai kartu dan tabel.
 * - "Telat" Marketing (lateScript) = skrip belum Ready padahal sudah lewat H-3 sebelum upload.
 * - "Telat" Creative (lateEdit)    = edit belum Done padahal sudah lewat H-1 (= hari upload).
 *   Keduanya hanya untuk konten yang tanggal uploadnya belum lewat (yang lewat masuk "Terlewat"),
 *   dan skrip Trend tidak pernah telat.
 * - "Terlewat" = tanggal upload sudah lewat dari hari ini dan BELUM tayang.
 */
export function contentFlags(c, opts, today) {
  const s = opts.sem(c.script_status);
  const t = c.type === "Video" ? opts.sem(c.talent_status) : "Tidak perlu";
  const cr = opts.sem(c.creative_status);
  const qc = opts.sem(c.qc_status);
  const pub = Boolean(c.published_date);
  const ready = s === "Ready";
  const talentOk = ["Done", "Tidak perlu"].includes(t);
  return {
    script: ready && cr !== "Done" && !pub,
    talent: c.type === "Video" && ready && t === "Belum",
    edit: ready && talentOk && cr !== "Done",
    qc: cr === "Done" && qc === "" && !pub,
    revision: qc === "Revisi" && !pub,
    upload: qc === "Done" && !pub,
    lateScript: !pub && !neverLate(c.priority) && !ready && c.upload_date >= today && today > addDays(c.upload_date, -deadlineDays("Marketing", c.priority)),
    lateEdit: !pub && !neverLate(c.priority) && cr !== "Done" && c.upload_date >= today && today > addDays(c.upload_date, -deadlineDays("Creative", c.priority)),
    missed: c.upload_date < today && !pub,
    published: pub,
  };
}

// ───────────── performa & KPI ─────────────
export async function performance(db, opts, users, month, today, viewer) {
  const contents = await db.query("select * from contents where archived = 0 and substr(upload_date,1,7) = ?", [month]);
  const kpis = await db.query("select * from kpis where substr(upload_date,1,7) = ?", [month]);
  const staff = users.filter((u) => u.position === "Staff" && u.active && (u.role === "Marketing" || u.role === "Creative"));
  // Leader melihat staff timnya sendiri (Leader Marketing → staff Marketing, Leader Creative → staff Creative).
  const visible = staff.filter((u) => (isLeader(viewer) ? u.role === viewer.role : u.id === viewer.id));

  return visible.map((u) => {
    const marketing = u.role === "Marketing";
    const owner = marketing ? "marketing_user_id" : "creative_user_id";
    const doneAt = marketing ? "script_ready_at" : "creative_done_at";
    const days = DEADLINE_DAYS[u.role];
    const rows = contents.filter((c) => c[owner] === u.id);
    const targets = kpis.filter((k) => k.user_id === u.id);
    const items = rows.map((c) => {
      const done = c[doneAt] && stampDay(c[doneAt]) <= today ? stampDay(c[doneAt]) : null;
      const deadline = addDays(c.upload_date, -deadlineDays(u.role, c.priority));
      const trend = neverLate(c.priority);
      const status = done
        ? trend || done <= deadline ? "Tepat waktu" : "Selesai terlambat"
        : trend ? "Trend · tidak dihitung telat" : today > deadline ? "Terlambat" : today === deadline ? "Jatuh tempo hari ini" : "Dalam tenggat";
      return { id: c.id, type_no: c.type_no, title: c.title, type: c.type, priority: c.priority, upload_date: c.upload_date, deadline, done, status };
    });
    const doneItems = items.filter((i) => i.done);
    const onTime = doneItems.filter((i) => i.status === "Tepat waktu").length;
    // Target yang tenggatnya lewat tetapi kontennya belum dibuat ikut dihitung telat.
    let missingLate = 0;
    for (const k of targets) {
      if (today <= addDays(k.upload_date, -days)) continue;
      const made = rows.filter((c) => c.app === k.app && c.type === k.type && c.upload_date === k.upload_date).length;
      missingLate += Math.max(0, k.amount - made);
    }
    const byType = Object.fromEntries(
      TYPES.map((t) => [t, { done: doneItems.filter((i) => i.type === t).length, target: targets.filter((k) => k.type === t).reduce((n, k) => n + k.amount, 0) }]),
    );
    const target = targets.reduce((n, k) => n + k.amount, 0);
    return {
      user: { id: u.id, name: u.name, role: u.role },
      byType,
      target,
      done: doneItems.length,
      remaining: Math.max(0, target - doneItems.length),
      onTimeRate: doneItems.length ? Math.round((onTime / doneItems.length) * 100) : null,
      late: items.filter((i) => i.status === "Terlambat" || i.status === "Selesai terlambat").length + missingLate,
      items,
    };
  });
}

// ───────────── kalender ─────────────
/**
 * Rencana per (apps, jenis, tanggal pengerjaan). Aktual = konten dengan tanggal pengerjaan itu
 * yang skripnya sudah Ready — definisi yang sama dipakai pengingat target H+3.
 */
export async function actualCounts(db, opts, from, to) {
  const rows = await db.query(
    "select app, type, created_date, script_status from contents where archived = 0 and created_date between ? and ?",
    [from, to],
  );
  const out = {};
  for (const r of rows) {
    if (opts.sem(r.script_status) !== "Ready") continue;
    const k = JSON.stringify([r.app, r.type, r.created_date]);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
