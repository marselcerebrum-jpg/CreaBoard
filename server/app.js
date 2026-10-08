// HTTP server Content Studio: API JSON + file statis dari /public.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import {
  clearLoginFailures, createSession, destroySession, destroyUserSessions, hashPassword, loginThrottled,
  recordLoginFailure, SESSION_COOKIE, sessionUser, validatePassword, verifyPassword,
} from "./auth.js";
import {
  actualCounts, addDays, applyWorkflow, canSee, contentFlags, DEADLINE_DAYS, defaultSheet, editableFields, fail, HttpError,
  isDate, isHttpUrl, isLeader, jakartaDate, leads, manages, normalizeSheet, optionIndex, performance, scriptReadyErrors, titleFromSheet, TYPES,
} from "./rules.js";

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };
const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "X-Frame-Options": "DENY",
};
const CONTENT_COLS = ["title", "app", "type", "created_date", "upload_date", "script_status", "talent_status", "talent_name",
  "creative_status", "qc_status", "link", "notes", "marketing_user_id", "creative_user_id", "script_ready_at",
  "talent_done_at", "creative_done_at", "link_at", "qc_at"];

export function createApp({ db, publicDir, now = () => new Date(), secureCookies = false, trustProxy = false }) {
  // Di belakang reverse proxy (nginx), IP asli dibaca dari X-Real-IP.
  const clientIp = (req) => (trustProxy && req.headers["x-real-ip"]) || req.socket.remoteAddress;
  const today = () => jakartaDate(now());
  const nowIso = () => now().toISOString();
  const routes = [];
  const route = (method, pattern, handler, { auth = true } = {}) => {
    const keys = [];
    const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)"))}$`);
    routes.push({ method, re, keys, handler, auth });
  };

  // ───────────── helpers (q = db atau transaksi) ─────────────
  const appsOf = async (q, userId) => (await q.query("select app from user_apps where user_id = ? order by app", [userId])).map((r) => r.app);
  const users = async (q = db) => {
    const rows = await q.query("select id, username, name, position, role, active from users order by name");
    const apps = await q.query("select user_id, app from user_apps order by app");
    return rows.map((u) => ({ ...u, apps: apps.filter((a) => a.user_id === u.id).map((a) => a.app) }));
  };
  // Staff Marketing hanya membuat/memindahkan konten & mengisi rencana untuk apps yang dipegangnya.
  const checkAppAllowed = (user, app) => {
    if (isLeader(user) || user.role !== "Marketing") return;
    if (!user.apps.length) fail(422, "Anda belum memegang apps. Minta Leader Marketing membagikan apps.");
    if (!user.apps.includes(app)) fail(422, "Apps ini tidak termasuk apps yang Anda pegang");
  };
  const parseContent = (c) => (c ? { ...c, sheet: JSON.parse(c.sheet || "{}") } : null);
  const loadContent = async (q, id, { lock = false } = {}) =>
    parseContent(await q.one(`select * from contents where id = ? and archived = 0${lock ? " for update" : ""}`, [Number(id)]));
  const visibleContent = async (q, user, id, opts, lock = false) => {
    if (!/^\d+$/.test(String(id))) fail(404, "Konten tidak ditemukan");
    const c = await loadContent(q, id, { lock });
    if (!c || !canSee(user, c, opts)) fail(404, "Konten tidak ditemukan");
    return c;
  };
  const present = (c, user, opts) => ({
    ...c,
    flags: contentFlags(c, opts, today()),
    editable: editableFields(user, c, opts),
    readyErrors: scriptReadyErrors(c),
  });
  const requireLeader = (user) => !isLeader(user) && fail(403, "Hanya Leader yang dapat melakukan ini");
  const requireLeads = (user, role) => !leads(user, role) && fail(403, `Hanya Leader ${role} yang dapat melakukan ini`);
  const logEvents = async (q, contentId, userId, prev, next, fields) => {
    const at = nowIso();
    for (const f of fields) {
      const a = f === "sheet" ? null : prev?.[f] ?? null;
      const b = f === "sheet" ? null : next[f] ?? null;
      if (f !== "sheet" && String(a ?? "") === String(b ?? "")) continue;
      await q.run("insert into events (content_id, user_id, field, from_value, to_value, at) values (?, ?, ?, ?, ?, ?)",
        [contentId, userId, f, a == null ? null : String(a), b == null ? null : String(b), at]);
    }
  };
  const userExists = async (q, id, role) =>
    id == null || Boolean(await q.one("select 1 from users where id = ? and active = 1 and role = ?", [Number(id), role]));
  const monthOf = (query) => (/^\d{4}-\d{2}$/.test(query.month ?? "") ? query.month : today().slice(0, 7));

  // ───────────── auth ─────────────
  route("POST", "/api/login", async ({ body, req, res }) => {
    const username = String(body.username ?? "").trim();
    const key = `${clientIp(req)}|${username.toLowerCase()}`;
    if (loginThrottled(key)) fail(429, "Terlalu banyak percobaan. Coba lagi dalam 15 menit.");
    const u = await db.one("select * from users where lower(username) = lower(?)", [username]);
    if (!u || !u.active || !verifyPassword(String(body.password ?? ""), u.password_hash)) {
      recordLoginFailure(key);
      fail(401, "Username atau password salah");
    }
    clearLoginFailures(key);
    const { token, maxAge } = await createSession(db, u.id);
    res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secureCookies ? "; Secure" : ""}`);
    return { ok: true };
  }, { auth: false });

  route("POST", "/api/logout", async ({ token, res }) => {
    await destroySession(db, token);
    res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
    return { ok: true };
  }, { auth: false });

  route("POST", "/api/me/password", async ({ user, body }) => {
    const row = await db.one("select password_hash from users where id = ?", [user.id]);
    if (!verifyPassword(String(body.current ?? ""), row.password_hash)) fail(422, "Password lama salah");
    const err = validatePassword(body.next);
    if (err) fail(422, err);
    await db.run("update users set password_hash = ? where id = ?", [hashPassword(body.next), user.id]);
    return { ok: true };
  });

  route("GET", "/api/bootstrap", async ({ user }) => ({
    me: user,
    today: today(),
    users: (await users()).map(({ id, name, position, role, active, apps }) => ({ id, name, position, role, active, apps })),
    options: (await optionIndex(db)).rows,
    deadlines: DEADLINE_DAYS,
  }));

  // ───────────── konten ─────────────
  route("GET", "/api/contents", async ({ user }) => {
    const opts = await optionIndex(db);
    return (await db.query("select * from contents where archived = 0 order by upload_date, id"))
      .map(parseContent)
      .filter((c) => canSee(user, c, opts))
      .map((c) => present(c, user, opts));
  });

  route("GET", "/api/contents/:id", async ({ user, params }) => {
    const opts = await optionIndex(db);
    const c = await visibleContent(db, user, params.id, opts);
    const events = await db.query(
      "select e.*, u.name user_name from events e left join users u on u.id = e.user_id where content_id = ? order by e.id desc limit 200",
      [c.id],
    );
    return { ...present(c, user, opts), events };
  });

  route("POST", "/api/contents", async ({ user, body }) => {
    if (user.role !== "Marketing") fail(403, "Pembuatan skrip tersedia untuk Marketing");
    const opts = await optionIndex(db);
    const type = TYPES.includes(body.type) ? body.type : fail(422, "Bentuk konten tidak valid");
    const sheet = normalizeSheet(type, body.sheet ?? defaultSheet(type));
    const draft = {
      title: titleFromSheet(sheet),
      app: body.app,
      type,
      created_date: body.created_date ?? today(),
      upload_date: body.upload_date ?? today(),
      script_status: body.script_status ?? opts.firstWith("script", "Draft"),
      talent_status: type === "Video" ? body.talent_status ?? opts.firstWith("talent", "Belum") : opts.firstWith("talent", "Tidak perlu"),
      talent_name: type === "Video" ? body.talent_name || null : null,
      creative_status: opts.firstWith("creative", "Belum"),
      qc_status: opts.firstWith("qc", ""),
      link: "",
      notes: String(body.notes ?? "").slice(0, 5000),
      sheet,
      // Leader Marketing boleh langsung menugaskan skrip ke staff Marketing; staff selalu pemiliknya sendiri.
      marketing_user_id: leads(user, "Marketing") && body.marketing_user_id ? Number(body.marketing_user_id) : user.id,
      creative_user_id: body.creative_user_id ? Number(body.creative_user_id) : null,
    };
    checkAppAllowed(user, draft.app);
    if (!draft.title) fail(422, type === "Video" ? "Kata kunci perlu diisi." : type === "Carousel" ? "Tema carrousel perlu diisi." : "Judul / hook perlu diisi.");
    if (!(await userExists(db, draft.creative_user_id, "Creative"))) fail(422, "Editor tidak valid");
    if (!(await userExists(db, draft.marketing_user_id, "Marketing"))) fail(422, "Pemilik Marketing tidak valid");
    const empty = { script_status: null, talent_status: null, creative_status: null, qc_status: null, link: "", sheet: draft.sheet, type };
    applyWorkflow(empty, draft, opts, nowIso());
    const id = await db.tx(async (q) => {
      const row = await q.one(
        `insert into contents (${CONTENT_COLS.join(", ")}, sheet) values (${CONTENT_COLS.map(() => "?").join(", ")}, ?) returning id`,
        [...CONTENT_COLS.map((c) => draft[c] ?? null), JSON.stringify(draft.sheet)],
      );
      await logEvents(q, row.id, user.id, null, { created: "Dibuat" }, ["created"]);
      return row.id;
    });
    return present(await loadContent(db, id), user, opts);
  });

  // PATCH dengan expected revision + kunci baris: edit bersamaan menghasilkan 409, bukan saling menimpa.
  route("PATCH", "/api/contents/:id", async ({ user, params, body }) => {
    const opts = await optionIndex(db);
    return db.tx(async (q) => {
      const prev = await visibleContent(q, user, params.id, opts, true);
      if (body.revision !== prev.revision) fail(409, "Konten ini baru saja diubah orang lain. Muat ulang untuk melihat versi terbaru.");
      const changes = body.changes && typeof body.changes === "object" ? body.changes : {};
      const allowed = editableFields(user, prev, opts);
      const denied = Object.keys(changes).filter((f) => !allowed.includes(f));
      if (denied.length) fail(403, "Kolom ini dikelola oleh peran lain", denied);

      const next = { ...prev, ...changes };
      if ("sheet" in changes || "type" in changes) next.sheet = normalizeSheet(next.type, changes.sheet ?? prev.sheet);
      if (!TYPES.includes(next.type)) fail(422, "Bentuk konten tidak valid");
      if ("app" in changes && changes.app !== prev.app) checkAppAllowed(user, changes.app);
      next.title = titleFromSheet(next.sheet, prev.title);
      next.notes = String(next.notes ?? "").slice(0, 5000);
      for (const k of ["creative_user_id", "marketing_user_id"]) next[k] = next[k] === "" || next[k] == null ? null : Number(next[k]);
      if ("creative_user_id" in changes && !(await userExists(q, next.creative_user_id, "Creative"))) fail(422, "Editor tidak valid");
      if ("marketing_user_id" in changes && !(await userExists(q, next.marketing_user_id, "Marketing"))) fail(422, "Pemilik Marketing tidak valid");
      if (next.talent_name === "") next.talent_name = null;
      applyWorkflow(prev, next, opts, nowIso());

      await q.run(
        `update contents set ${CONTENT_COLS.map((c) => `${c} = ?`).join(", ")}, sheet = ?, revision = revision + 1, updated_at = ? where id = ?`,
        [...CONTENT_COLS.map((c) => next[c] ?? null), JSON.stringify(next.sheet), nowIso(), prev.id],
      );
      const sheetChanged = JSON.stringify(prev.sheet) !== JSON.stringify(next.sheet);
      await logEvents(q, prev.id, user.id, prev, next, [...CONTENT_COLS.filter((c) => !c.endsWith("_at") && c !== "title"), ...(sheetChanged ? ["sheet"] : [])]);
      return present(await loadContent(q, prev.id), user, opts);
    });
  });

  // Konfirmasi tayang: butuh QC Done, permalink, dan tanggal aktual.
  route("POST", "/api/contents/:id/publish", async ({ user, params, body }) => {
    const opts = await optionIndex(db);
    return db.tx(async (q) => {
      const c = await visibleContent(q, user, params.id, opts, true);
      if (!(leads(user, "Marketing") || (user.role === "Marketing" && c.marketing_user_id === user.id))) fail(403, "Konfirmasi tayang dilakukan Marketing pemilik konten atau Leader Marketing");
      if (body.revision !== c.revision) fail(409, "Konten ini baru saja diubah orang lain. Muat ulang dulu.");
      if (c.published_date) fail(409, "Konten sudah dikonfirmasi tayang");
      if (opts.sem(c.qc_status) !== "Done") fail(422, "Konten harus QC Done sebelum tayang");
      const url = String(body.url ?? "").trim();
      if (!isHttpUrl(url)) fail(422, "Permalink tayangan wajib diisi (https://…)");
      if (!isDate(body.date) || body.date > today()) fail(422, "Tanggal tayang tidak valid atau di masa depan");
      await q.run("update contents set published_url = ?, published_date = ?, published_by = ?, revision = revision + 1, updated_at = ? where id = ?",
        [url, body.date, user.id, nowIso(), c.id]);
      await logEvents(q, c.id, user.id, c, { published_date: body.date }, ["published_date"]);
      return present(await loadContent(q, c.id), user, opts);
    });
  });

  route("DELETE", "/api/contents/:id/publish", async ({ user, params }) => {
    requireLeads(user, "Marketing");
    const opts = await optionIndex(db);
    const c = await visibleContent(db, user, params.id, opts);
    await db.run("update contents set published_url = null, published_date = null, published_by = null, revision = revision + 1 where id = ?", [c.id]);
    await logEvents(db, c.id, user.id, c, { published_date: null }, ["published_date"]);
    return present(await loadContent(db, c.id), user, opts);
  });

  // Arsip (bukan hapus permanen). Marketing hanya untuk skrip miliknya yang belum diproduksi.
  route("DELETE", "/api/contents/:id", async ({ user, params }) => {
    const opts = await optionIndex(db);
    const c = await visibleContent(db, user, params.id, opts);
    const started = opts.sem(c.creative_status) === "Done" || c.published_date;
    if (!leads(user, "Marketing") && !(user.role === "Marketing" && c.marketing_user_id === user.id && !started)) {
      fail(403, "Hanya Leader Marketing yang dapat mengarsipkan konten yang sudah diproduksi");
    }
    await db.run("update contents set archived = 1, revision = revision + 1 where id = ?", [c.id]);
    await logEvents(db, c.id, user.id, c, { archived: 1 }, ["archived"]);
    return { ok: true };
  });

  // ───────────── kalender ─────────────
  route("GET", "/api/calendar", async ({ query }) => {
    const month = monthOf(query);
    const from = `${month}-01`;
    const to = addDays(addDays(from, 32).slice(0, 8) + "01", -1);
    const plans = await db.query("select * from calendar_plans where date between ? and ?", [from, to]);
    const linked = (await db.query(
      `select distinct k.app, k.type, k.work_date from kpis k join users u on u.id = k.user_id
       where u.role = 'Marketing' and k.work_date between ? and ?`, [from, to],
    )).map((k) => JSON.stringify([k.app, k.type, k.work_date]));
    return { month, from, to, plans, actuals: await actualCounts(db, await optionIndex(db), from, to), kpiLinked: linked };
  });

  // Ringkasan H+3: rencana dikurangi skrip Ready dengan tanggal pengerjaan yang sama.
  route("GET", "/api/targets/h3", async ({ user, query }) => {
    const from = today();
    const to = addDays(from, 3);
    const opts = await optionIndex(db);
    const plans = await db.query("select * from calendar_plans where date between ? and ? and amount is not null", [from, to]);
    const actual = await actualCounts(db, opts, from, to);
    const out = Object.fromEntries(TYPES.map((t) => [t, { plan: 0, ready: 0, remaining: 0 }]));
    for (const p of plans) {
      if (query.app && p.app !== query.app) continue;
      if (!isLeader(user) && user.apps.length && !user.apps.includes(p.app)) continue;
      const ready = actual[JSON.stringify([p.app, p.type, p.date])] ?? 0;
      out[p.type].plan += p.amount;
      out[p.type].ready += Math.min(ready, p.amount);
      out[p.type].remaining += Math.max(0, p.amount - ready);
    }
    return { from, to, byType: out };
  });

  // Rencana kalender: diedit kedua Leader dan staff Marketing (untuk apps yang dipegangnya).
  route("PUT", "/api/calendar/plan", async ({ user, body }) => {
    if (!isLeader(user) && user.role !== "Marketing") fail(403, "Kalender hanya bisa diedit Leader dan staff Marketing");
    checkAppAllowed(user, body.app);
    const { app, type, date } = body;
    const opts = await optionIndex(db);
    if (opts.byId.get(app)?.key !== "app" || !TYPES.includes(type) || !isDate(date)) fail(422, "Data rencana tidak valid");
    const linked = await db.one(
      "select 1 from kpis k join users u on u.id = k.user_id where u.role = 'Marketing' and k.app = ? and k.type = ? and k.work_date = ?",
      [app, type, date],
    );
    const existing = await db.one("select * from calendar_plans where app = ? and type = ? and date = ?", [app, type, date]);
    let amount = existing?.amount ?? null;
    if ("amount" in body) {
      if (linked) fail(409, "Rencana ini terhubung dengan target KPI. Ubah lewat menu Target KPI.");
      amount = body.amount === null || body.amount === "" ? null : Number(body.amount);
      if (amount !== null && (!Number.isSafeInteger(amount) || amount < 0)) fail(422, "Isi jumlah berupa bilangan bulat mulai dari 0");
    }
    const color = "color" in body ? (["blue", "yellow", "green", "orange", "pink", "cyan", "purple"].includes(body.color) ? body.color : null) : existing?.color ?? null;
    if (amount === null && color === null) await db.run("delete from calendar_plans where app = ? and type = ? and date = ?", [app, type, date]);
    else
      await db.run(`insert into calendar_plans (app, type, date, amount, color) values (?, ?, ?, ?, ?)
                    on conflict (app, type, date) do update set amount = excluded.amount, color = excluded.color`, [app, type, date, amount, color]);
    return { ok: true };
  });

  // ───────────── performa & KPI ─────────────
  route("GET", "/api/team", async ({ user, query }) => {
    if (user.role === "Talent") fail(403, "Performa tersedia untuk Marketing dan Creative");
    const month = monthOf(query);
    const all = await db.query("select id, name, position, role, active from users");
    return { month, today: today(), people: await performance(db, await optionIndex(db), all, month, today(), user) };
  });

  route("GET", "/api/kpis", async ({ user, query }) => {
    requireLeader(user);
    return db.query(
      "select k.*, u.name user_name, u.role from kpis k join users u on u.id = k.user_id where substr(k.upload_date,1,7) = ? and u.role = ? order by k.upload_date",
      [monthOf(query), user.role],
    );
  });

  const syncPlanFromKpis = async (q, app, type, date) => {
    const { n } = await q.one(
      `select coalesce(sum(k.amount),0)::int n from kpis k join users u on u.id = k.user_id
       where u.role = 'Marketing' and k.app = ? and k.type = ? and k.work_date = ?`, [app, type, date],
    );
    const existing = await q.one("select color from calendar_plans where app = ? and type = ? and date = ?", [app, type, date]);
    if (n === 0 && !existing?.color) await q.run("delete from calendar_plans where app = ? and type = ? and date = ?", [app, type, date]);
    else
      await q.run(`insert into calendar_plans (app, type, date, amount, color) values (?, ?, ?, ?, ?)
                   on conflict (app, type, date) do update set amount = excluded.amount`, [app, type, date, n || null, existing?.color ?? null]);
  };

  route("POST", "/api/kpis", async ({ user, body }) => {
    requireLeader(user);
    const staff = await db.one("select * from users where id = ? and active = 1 and position = 'Staff' and role = ?", [Number(body.user_id) || 0, user.role]);
    if (!staff) fail(422, `Pilih staff ${user.role} — target hanya untuk tim yang Anda pimpin`);
    const opts = await optionIndex(db);
    const amount = Number(body.amount);
    if (opts.byId.get(body.app)?.key !== "app" || !TYPES.includes(body.type) || !isDate(body.work_date) || !isDate(body.upload_date)) fail(422, "Data target tidak valid");
    if (!Number.isSafeInteger(amount) || amount < 1) fail(422, "Target minimal 1");
    const limit = addDays(body.upload_date, -DEADLINE_DAYS[staff.role]);
    if (body.work_date > limit) fail(422, `Tanggal pengerjaan paling lambat ${limit} (H-${DEADLINE_DAYS[staff.role]} upload)`);
    await db.tx(async (q) => {
      await q.run(`insert into kpis (user_id, app, type, work_date, upload_date, amount) values (?, ?, ?, ?, ?, ?)
                   on conflict (user_id, app, type, work_date) do update set upload_date = excluded.upload_date, amount = excluded.amount`,
        [staff.id, body.app, body.type, body.work_date, body.upload_date, amount]);
      if (staff.role === "Marketing") await syncPlanFromKpis(q, body.app, body.type, body.work_date);
    });
    return { ok: true };
  });

  route("DELETE", "/api/kpis/:id", async ({ user, params }) => {
    requireLeader(user);
    const k = await db.one("select k.*, u.role from kpis k join users u on u.id = k.user_id where k.id = ?", [Number(params.id) || 0]);
    if (!k) fail(404, "Target tidak ditemukan");
    if (k.role !== user.role) fail(403, "Target ini milik tim lain");
    await db.tx(async (q) => {
      await q.run("delete from kpis where id = ?", [k.id]);
      if (k.role === "Marketing") await syncPlanFromKpis(q, k.app, k.type, k.work_date);
    });
    return { ok: true };
  });

  // ───────────── akun ─────────────
  route("GET", "/api/users", async ({ user }) => {
    requireLeader(user);
    return users();
  });

  route("POST", "/api/users", async ({ user, body }) => {
    requireLeader(user);
    const username = String(body.username ?? "").trim();
    const name = String(body.name ?? "").trim();
    if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username)) fail(422, "Username 3–40 karakter (huruf, angka, . _ -)");
    if (!name) fail(422, "Nama wajib diisi");
    if (!["Leader", "Staff"].includes(body.position) || !["Marketing", "Creative", "Talent"].includes(body.role)) fail(422, "Posisi/peran tidak valid");
    if (body.position === "Leader" && body.role === "Talent") fail(422, "Leader hanya untuk Marketing atau Creative");
    const err = validatePassword(body.password);
    if (err) fail(422, err);
    if (await db.one("select 1 from users where lower(username) = lower(?)", [username])) fail(409, "Username sudah dipakai");
    // Pembagian apps bisa langsung ditentukan saat akun dibuat (khusus staff Marketing).
    const apps = Array.isArray(body.apps) ? [...new Set(body.apps)] : [];
    if (apps.length) {
      if (!manages(user, { position: body.position, role: body.role })) fail(422, "Pembagian apps hanya untuk staff Marketing dan diatur Leader Marketing");
      const opts = await optionIndex(db);
      if (apps.some((a) => opts.byId.get(a)?.key !== "app")) fail(422, "Apps tidak valid");
    }
    const id = await db.tx(async (q) => {
      const row = await q.one("insert into users (username, name, position, role, password_hash) values (?, ?, ?, ?, ?) returning id",
        [username, name.slice(0, 100), body.position, body.role, hashPassword(body.password)]);
      for (const app of apps) await q.run("insert into user_apps (user_id, app) values (?, ?)", [row.id, app]);
      return row.id;
    });
    return { id, apps: await appsOf(db, id) };
  });

  route("PATCH", "/api/users/:id", async ({ user, params, body }) => {
    requireLeader(user);
    const target = await db.one("select * from users where id = ?", [Number(params.id) || 0]);
    if (!target) fail(404, "Akun tidak ditemukan");
    if (target.id === user.id && (body.active === false || body.position === "Staff")) fail(422, "Anda tidak bisa menonaktifkan/menurunkan akun sendiri");
    const next = {
      name: body.name !== undefined ? String(body.name).trim().slice(0, 100) || target.name : target.name,
      position: ["Leader", "Staff"].includes(body.position) ? body.position : target.position,
      role: ["Marketing", "Creative", "Talent"].includes(body.role) ? body.role : target.role,
      active: typeof body.active === "boolean" ? Number(body.active) : target.active,
    };
    if (next.position === "Leader" && next.role === "Talent") fail(422, "Leader hanya untuk Marketing atau Creative");
    if (body.password) {
      const err = validatePassword(body.password);
      if (err) fail(422, err);
    }
    await db.tx(async (q) => {
      await q.run("update users set name = ?, position = ?, role = ?, active = ? where id = ?", [next.name, next.position, next.role, next.active, target.id]);
      if (body.password) await q.run("update users set password_hash = ? where id = ?", [hashPassword(body.password), target.id]);
      if (next.role !== "Marketing" || next.position !== "Staff") await q.run("delete from user_apps where user_id = ?", [target.id]);
      if (!next.active || body.password) await destroyUserSessions(q, target.id);
    });
    return { ok: true };
  });

  // ───────────── pembagian apps ─────────────
  route("GET", "/api/app-assignments", async ({ user }) => {
    requireLeader(user);
    return (await users()).filter((u) => u.active && manages(user, u)).map(({ id, name, role, apps }) => ({ id, name, role, apps }));
  });

  route("PUT", "/api/users/:id/apps", async ({ user, params, body }) => {
    requireLeader(user);
    const target = await db.one("select * from users where id = ?", [Number(params.id) || 0]);
    if (!target || !manages(user, target)) fail(403, "Pembagian apps hanya untuk staff Marketing dan diatur Leader Marketing");
    const apps = Array.isArray(body.apps) ? [...new Set(body.apps)] : fail(422, "Daftar apps tidak valid");
    const opts = await optionIndex(db);
    if (apps.some((a) => opts.byId.get(a)?.key !== "app")) fail(422, "Apps tidak valid");
    await db.tx(async (q) => {
      await q.run("delete from user_apps where user_id = ?", [target.id]);
      for (const a of apps) await q.run("insert into user_apps (user_id, app) values (?, ?)", [target.id, a]);
    });
    return { id: target.id, apps: await appsOf(db, target.id) };
  });

  // ───────────── opsi dropdown ─────────────
  // Leader mengirim daftar lengkap satu kolom; pilihan yang hilang diarsipkan (bukan dihapus).
  route("PUT", "/api/options/:key", async ({ user, params, body }) => {
    requireLeader(user);
    const key = params.key;
    const allowed = { app: null, talentName: null, script: ["Draft", "Ready"], talent: ["Belum", "Done", "Tidak perlu"], creative: ["Belum", "Done"], qc: ["", "Done", "Revisi"] };
    if (!(key in allowed)) fail(404, "Kolom tidak dikenal");
    const list = Array.isArray(body.options) ? body.options : fail(422, "Daftar pilihan tidak valid");
    const labels = list.map((o) => String(o.label ?? "").trim());
    if (!list.length || labels.some((l) => !l || l.length > 60)) fail(422, "Setiap pilihan perlu nama (maks. 60 karakter)");
    if (new Set(labels.map((l) => l.toLowerCase())).size !== labels.length) fail(422, "Nama pilihan dalam satu kolom harus berbeda");
    await db.tx(async (q) => {
      const existing = await q.query("select * from options where key = ?", [key]);
      // Kategori = salah satu nama pilihan di daftar ini. Arti prosesnya (semantic) diturunkan dari
      // pilihan yang dirujuk; pilihan yang menjadi kategori sendiri memakai artinya sendiri, dan
      // pilihan baru yang berdiri sendiri dianggap belum selesai.
      const items = list.map((o, i) => {
        const found = o.id ? existing.find((e) => e.id === o.id) : null;
        const category = allowed[key] ? String(o.category ?? (o.semantic !== undefined ? "" : labels[i])).trim() : labels[i];
        return { o, i, found, label: labels[i], category };
      });
      if (allowed[key]) {
        const ownSemantic = (it) => {
          if (it.o.category === undefined && it.o.semantic !== undefined) return it.o.semantic ?? ""; // klien lama
          if (it.found && (it.found.category ?? it.found.label) === it.found.label) return it.found.semantic;
          return allowed[key][0];
        };
        const resolve = (it, depth = 0) => {
          if (depth > items.length) fail(422, "Kategori saling merujuk berputar");
          const ref = items.find((x) => x.label === it.category);
          if (!ref || ref === it) return ownSemantic(it);
          return resolve(ref, depth + 1);
        };
        for (const it of items) {
          if (it.o.category === undefined && it.o.semantic !== undefined) {
            it.category = it.label;
          } else if (!labels.includes(it.category)) {
            fail(422, `Kategori "${it.category || "(kosong)"}" harus salah satu nama pilihan`);
          }
        }
        for (const it of items) it.semantic = resolve(it);
        if (items.some((it) => !allowed[key].includes(it.semantic))) fail(422, "Kategori proses tidak valid");
        const missing = allowed[key].filter((sem) => !items.some((it) => it.semantic === sem));
        if (missing.length) fail(422, `Perlu minimal satu pilihan untuk: ${missing.map((m) => ({ "": "Belum QC", Ready: "skrip siap", Done: "selesai", Revisi: "revisi", Draft: "draft", Belum: "belum", "Tidak perlu": "tidak perlu" })[m] ?? m).join(", ")}`);
      } else {
        for (const it of items) it.semantic = "";
      }
      const keep = new Set();
      for (const it of items) {
        if (it.found) {
          // Mengubah arti proses pilihan yang sudah dipakai konten akan mengubah arti data lama; larang.
          const used = await q.one("select 1 from contents where ? in (app, script_status, talent_status, talent_name, creative_status, qc_status) limit 1", [it.found.id]);
          if (used && it.found.semantic !== it.semantic) fail(422, `"${it.found.label}" sudah dipakai konten; arti prosesnya tidak bisa diubah. Buat pilihan baru sebagai gantinya`);
          await q.run("update options set label = ?, semantic = ?, sort = ?, archived = 0, category = ? where id = ?", [it.label, it.semantic, it.i, it.category, it.found.id]);
          keep.add(it.found.id);
        } else {
          const id = `${key}:${Date.now().toString(36)}${it.i}`;
          await q.run("insert into options (id, key, label, semantic, sort, category) values (?, ?, ?, ?, ?, ?)", [id, key, it.label, it.semantic, it.i, it.category]);
          keep.add(id);
        }
      }
      for (const e of existing) if (!keep.has(e.id)) await q.run("update options set archived = 1 where id = ?", [e.id]);
    });
    return (await optionIndex(db)).rows;
  });

  // ───────────── HTTP ─────────────
  const parseCookies = (h = "") => Object.fromEntries(h.split(";").map((p) => p.trim().split("=")).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join("="))]));

  async function readBody(req) {
    const chunks = [];
    let size = 0;
    for await (const ch of req) {
      size += ch.length;
      if (size > 2_000_000) fail(413, "Data terlalu besar");
      chunks.push(ch);
    }
    if (!chunks.length) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      fail(400, "Body harus JSON");
    }
  }

  async function serveStatic(req, res, pathname) {
    const file = normalize(join(publicDir, pathname === "/" ? "index.html" : decodeURIComponent(pathname)));
    if (!file.startsWith(normalize(publicDir) + sep) && file !== normalize(join(publicDir, "index.html"))) return false;
    try {
      const s = await stat(file);
      if (!s.isFile()) return false;
      res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-cache", ...SECURITY_HEADERS });
      res.end(await readFile(file));
      return true;
    } catch {
      return false;
    }
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const send = (status, data) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...SECURITY_HEADERS });
      res.end(JSON.stringify(data));
    };
    try {
      if (url.pathname === "/healthz") return send(200, { ok: true });
      if (!url.pathname.startsWith("/api/")) {
        if (req.method !== "GET" && req.method !== "HEAD") return send(405, { error: "Method not allowed" });
        if (await serveStatic(req, res, url.pathname)) return;
        // SPA fallback
        if (await serveStatic(req, res, "/")) return;
        return send(404, { error: "Not found" });
      }
      // Proteksi CSRF: mutasi wajib JSON dari origin yang sama (cookie juga SameSite=Strict).
      if (req.method !== "GET" && !String(req.headers["content-type"] ?? "").startsWith("application/json")) {
        return send(415, { error: "Gunakan application/json" });
      }
      const match = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
      if (!match) return send(404, { error: "Endpoint tidak ditemukan" });
      const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      const user = await sessionUser(db, token);
      if (user) user.apps = await appsOf(db, user.id);
      if (match.auth && !user) return send(401, { error: "Silakan login" });
      const params = Object.fromEntries(match.keys.map((k, i) => [k, decodeURIComponent(url.pathname.match(match.re)[i + 1])]));
      const body = req.method === "GET" ? {} : await readBody(req);
      const result = await match.handler({ req, res, user, token, params, body, query: Object.fromEntries(url.searchParams) });
      send(200, result ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return send(e.status, { error: e.message, details: e.details });
      console.error("[server]", e);
      send(500, { error: "Terjadi kesalahan server" });
    }
  });
  return server;
}
