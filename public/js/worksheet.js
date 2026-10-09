// Dashboard dan worksheet produksi (tabel dengan dropdown per sel; kartu di ponsel).
import {
  api, ApiError, contentNo, delegate, errorText, esc, fmtDate, fmtStamp, icon, isLeader, leads, myApps, optionTags, optLabel, reloadContents, searchText, sem,
  state, toast, TYPES, typeLabel, usersByRole, userName,
} from "./core.js";

const filters = { app: "", type: "", from: "", to: "", search: "", editor: "" };
const cellErrors = new Map(); // "id:field" → pesan, ditampilkan di sel sampai diubah lagi

// Definisi kartu = flag yang dihitung server (satu sumber kebenaran).
const METRICS = [
  ["script", "Skrip ready", "Siap diproduksi", "script"],
  ["talent", "Perlu take", "Skrip ready, take belum", "talent"],
  ["edit", "Belum diedit", "Siap dikerjakan creative", "edit"],
  ["qc", "Menunggu QC", "Hasil selesai, QC kosong", "qc"],
  ["revision", "Perlu revisi", "Hasil QC: revisi", "revision"],
  ["upload", "Siap upload", "QC done, belum tayang", "upload"],
  ["lateScript", "Terlambat", "Skrip belum ready, lewat H-3", "late"],
  ["lateEdit", "Terlambat", "Edit belum selesai, lewat H-1", "late"],
  ["missed", "Terlewat", "Upload lewat, belum tayang", "missed"],
];
// Kartu dibedakan per bidang (berlaku juga untuk Leader di bidang tersebut).
const ROLE_CARDS = {
  Marketing: ["script", "qc", "lateScript", "missed"],
  Creative: ["talent", "edit", "revision", "lateEdit", "missed"],
  Talent: ["talent", "lateEdit", "missed"],
};
// Kartu berbasis tenggat tidak mengikuti filter rentang tanggal upload.
const DATELESS = ["lateScript", "lateEdit", "missed"];
const FIELD_NAME = {
  script_status: "Info skrip", talent_name: "Talent", talent_status: "Status take", creative_user_id: "Editor",
  creative_status: "Creative", qc_status: "QC", app: "Apps", link: "Link hasil", notes: "Catatan",
};

const cardKeys = () => ROLE_CARDS[state.me.role] ?? METRICS.map((m) => m[0]);

function scoped(c, { useDates = true } = {}) {
  return (
    (!filters.app || c.app === filters.app) &&
    (!filters.type || c.type === filters.type) &&
    (!filters.editor || String(c.creative_user_id) === filters.editor) &&
    (!useDates || ((!filters.from || c.upload_date >= filters.from) && (!filters.to || c.upload_date <= filters.to)))
  );
}

function visibleRows() {
  const q = filters.search.trim().toLowerCase();
  return state.contents
    .filter((c) => scoped(c, { useDates: !DATELESS.includes(state.stage) }))
    .filter((c) => !state.stage || c.flags[state.stage])
    .filter((c) => !q || `${contentNo(c)} ${optLabel(c.app)} ${searchText(c)}`.toLowerCase().includes(q))
    .sort((a, b) => a.upload_date.localeCompare(b.upload_date) || a.id - b.id);
}

function filterBar({ withEditor, withType = true }) {
  return `<div class="filters">
    <div class="field"><label for="fApp">Apps</label><select id="fApp" data-onchange="filter" data-key="app">${optionTags("app", filters.app, { blank: myApps().length ? "Semua apps saya" : "Semua apps", mine: true })}</select></div>
    ${withType ? `<div class="field"><label for="fType">Jenis konten</label><select id="fType" data-onchange="filter" data-key="type"><option value="">Semua</option>${TYPES.map((t) => `<option value="${t}" ${filters.type === t ? "selected" : ""}>${typeLabel(t)}</option>`).join("")}</select></div>` : ""}
    ${withEditor ? `<div class="field"><label for="fEditor">Editor</label><select id="fEditor" data-onchange="filter" data-key="editor"><option value="">Semua editor</option>${usersByRole("Creative").map((u) => `<option value="${u.id}" ${filters.editor === String(u.id) ? "selected" : ""}>${esc(u.name)}</option>`).join("")}</select></div>` : ""}
    <div class="field"><label for="fFrom">Tanggal upload mulai</label><input id="fFrom" type="date" value="${filters.from}" data-onchange="filter" data-key="from"></div>
    <div class="field"><label for="fTo">Tanggal upload sampai</label><input id="fTo" type="date" value="${filters.to}" data-onchange="filter" data-key="to"></div>
    <div class="filter-actions"><button class="btn" data-action="filter-today">Hari ini</button><button class="btn" data-action="filter-reset">Reset</button></div>
  </div>`;
}

// ───────────── sel ─────────────
const can = (c, field) => c.editable.includes(field);
const stamp = (iso) => (iso ? `<div class="cell-time"><time datetime="${esc(iso)}">${esc(fmtStamp(iso))}</time></div>` : "");
const cellError = (c, field) => {
  const msg = cellErrors.get(`${c.id}:${field}`);
  return msg ? `<div class="cell-error" role="alert">${esc(msg)}</div>` : "";
};

/** Sel yang menjadi langkah berikutnya diberi sorotan kuning. */
function attention(c, field) {
  const f = c.flags;
  return (
    (field === "script_status" && sem(c.script_status) === "Draft" && !f.published) ||
    (field === "talent_status" && f.talent) ||
    ((field === "creative_status" || field === "link") && f.edit) ||
    (field === "qc_status" && f.qc)
  );
}

function select(c, field, key, blank) {
  const s = sem(c[field]) || "none";
  const cls = `cell-select s-${s.replace(/\s/g, "")} ${attention(c, field) ? "attn" : ""} ${cellErrors.has(`${c.id}:${field}`) ? "has-error" : ""}`;
  return `<select class="${cls}" aria-label="${esc(FIELD_NAME[field])} #${c.id}" data-onchange="cell" data-id="${c.id}" data-field="${field}" ${can(c, field) ? "" : "disabled"}>${optionTags(key, c[field], blank === undefined ? {} : { blank })}</select>${cellError(c, field)}`;
}
function editorSelect(c) {
  const list = usersByRole("Creative");
  const current = c.creative_user_id;
  const options = list.map((u) => `<option value="${u.id}" ${u.id === current ? "selected" : ""}>${esc(u.name)}</option>`).join("");
  const missing = current && !list.some((u) => u.id === current) ? `<option value="${current}" selected>${esc(userName(current) || "Nonaktif")}</option>` : "";
  return `<select class="cell-select s-none" aria-label="Editor #${c.id}" data-onchange="cell" data-id="${c.id}" data-field="creative_user_id" ${can(c, "creative_user_id") ? "" : "disabled"}><option value="">Belum ditentukan</option>${options}${missing}</select>${cellError(c, "creative_user_id")}`;
}
const none = '<span class="badge b-muted">Tidak perlu</span>';

const CELLS = {
  script: { head: "Status skrip", html: (c) => select(c, "script_status", "script") + stamp(c.script_ready_at) },
  talentName: { head: "Talent", html: (c) => (c.type === "Video" ? select(c, "talent_name", "talentName", "Belum ditentukan") : none) },
  take: { head: "Status take", html: (c) => (c.type === "Video" ? select(c, "talent_status", "talent") + stamp(c.talent_done_at) : none) },
  editor: { head: "Editor", html: editorSelect },
  creative: { head: "Creative", html: (c) => select(c, "creative_status", "creative") + stamp(c.creative_done_at) },
  link: {
    head: "Link hasil",
    html: (c) => {
      const ok = /^https?:\/\//i.test(c.link);
      return `<div class="link-cell"><input type="url" class="${attention(c, "link") && !c.link ? "attn" : ""}" aria-label="Link hasil #${c.id}" value="${esc(c.link)}" placeholder="Tempel link hasil…" data-onchange="cell" data-id="${c.id}" data-field="link" ${can(c, "link") ? "" : "disabled"}>${ok ? `<a href="${esc(c.link)}" target="_blank" rel="noopener noreferrer" aria-label="Buka link hasil #${c.id}">↗</a>` : ""}</div>${cellError(c, "link")}${stamp(c.link_at)}`;
    },
  },
  qc: { head: "QC", html: (c) => select(c, "qc_status", "qc") + stamp(c.qc_at) },
  upload: {
    head: "Upload",
    html: (c) => {
      const late = state.me.role === "Marketing" ? c.flags.lateScript : c.flags.lateEdit;
      const chip = c.flags.published
        ? `<span class="badge b-done" title="Tayang ${esc(fmtDate(c.published_date))}">Tayang</span>`
        : c.flags.missed ? '<span class="badge b-danger">Terlewat</span>'
        : late ? '<span class="badge b-late">Terlambat</span>'
        : c.upload_date === state.today ? '<span class="badge b-warn">Hari ini</span>' : "";
      return `<div class="nowrap up-date">${fmtDate(c.upload_date)}</div>${chip ? `<div class="cell-time">${chip}</div>` : ""}`;
    },
  },
  aksi: {
    head: "Aksi",
    html: (c) => `<div class="aksi">${/^https?:\/\//i.test(c.link)
      ? `<a class="icon-act" href="${esc(c.link)}" target="_blank" rel="noopener noreferrer" title="Buka link hasil" aria-label="Buka link hasil ${esc(c.title)}">${icon("link", 16)}</a>`
      : `<span class="icon-act off" title="Belum ada link hasil">${icon("link", 16)}</span>`}
      <button class="icon-act" data-action="detail" data-id="${c.id}" title="Detail skrip" aria-label="Detail ${esc(c.title)}">${icon("more", 16)}</button></div>`,
  },
  notes: {
    head: "Catatan",
    html: (c) => `<textarea class="inline-notes" rows="1" aria-label="Catatan #${c.id}" placeholder="Tulis catatan…" data-onchange="cell" data-id="${c.id}" data-field="notes" ${can(c, "notes") ? "" : "readonly"}>${esc(c.notes)}</textarea>${cellError(c, "notes")}`,
  },
};
// Urutan kolom mengikuti pekerjaan tiap peran: kolom tugas sendiri di depan.
const ORDER = {
  // Catatan tetap ada: QC "Revisi" wajib disertai catatan revisi.
  default: ["script", "talentName", "take", "editor", "creative", "qc", "upload", "notes", "aksi"],
  Creative: ["creative", "link", "editor", "qc", "upload", "script", "talentName", "take", "notes", "aksi"],
  Talent: ["take", "talentName", "upload", "script", "editor", "creative", "qc", "notes", "aksi"],
};
const columns = () => ORDER[state.me.role] ?? ORDER.default;

const TYPE_ICON = { Video: "edit", Carousel: "layers", Singlepost: "image" };
const contentCell = (c) => `<div class="k-cell"><span class="k-tile k-${c.type}">${icon(TYPE_ICON[c.type], 18)}</span><div>${titleCell(c)}</div></div>`;

function titleCell(c) {
  const prio = c.priority && c.priority !== "Reguler" ? ` <span class="badge b-prio">${esc(c.priority)}</span>` : "";
  return `<div class="t-title">${esc(c.title)}${prio}</div><div class="t-meta">${esc(optLabel(c.app))} · ${typeLabel(c.type)} · dibuat ${fmtDate(c.created_date)}</div>`;
}

function tableHtml(rows) {
  const cols = columns();
  const body = rows.length
    ? rows.map((c) => `<tr><td class="sticky-a open-cell" data-action="detail" data-id="${c.id}"><button class="number" aria-label="Buka skrip ${esc(c.title)}">${esc(contentNo(c))}</button></td><td class="sticky-b open-cell" data-action="detail" data-id="${c.id}" title="Buka skrip">${contentCell(c)}</td>${cols.map((k) => `<td>${CELLS[k].html(c)}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${cols.length + 2}" class="empty">Tidak ada konten yang cocok. Ubah filter atau buat konten baru.</td></tr>`;
  const cards = rows.length
    ? rows.map((c) => `<article class="ws-card"><header class="open-cell" data-action="detail" data-id="${c.id}"><button class="number">${esc(contentNo(c))}</button><div>${titleCell(c)}</div></header>
        <dl>${cols.map((k) => `<div><dt>${CELLS[k].head}</dt><dd>${CELLS[k].html(c)}</dd></div>`).join("")}</dl></article>`).join("")
    : '<p class="empty">Tidak ada konten yang cocok.</p>';
  return `<div class="tablewrap ws-table"><table><thead><tr><th class="sticky-a">No.</th><th class="sticky-b">Konten · USP/Keyword</th>${cols.map((k) => `<th>${CELLS[k].head}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>
    <div class="ws-cards">${cards}</div>`;
}

function worksheetSection(title, rows, subtitle) {
  return `<section class="worksheet">
    <div class="tablehead"><div><h2>${esc(title)}</h2><span class="small">${esc(subtitle)}</span></div>
      <input class="search" type="search" placeholder="Cari judul atau isi skrip…" value="${esc(filters.search)}" data-onchange="filter" data-key="search" aria-label="Cari konten"></div>
    ${tableHtml(rows)}
    <div class="q-legend">
      <span><i class="ld ld-todo"></i><b>Perlu tindakan</b><small>Perlu segera ditindaklanjuti</small></span>
      <span><i class="ld ld-done"></i><b>Selesai</b><small>Sudah sesuai target</small></span>
      <span><i class="ld ld-late"></i><b>Terlambat</b><small>${state.me.role === "Marketing" ? "Skrip belum ready lewat H-3" : "Edit belum selesai lewat H-1"}</small></span>
      <span><i class="ld ld-missed"></i><b>Terlewat</b><small>Tanggal upload lewat, belum tayang</small></span></div>
  </section>`;
}

// ───────────── halaman ─────────────
let dashMonth = "";
const monthName = (m) => {
  const [y, mm] = m.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, mm - 1, 1)));
};
const pctOf = (a, b) => (b ? Math.round((a / b) * 100) : 0);

/** Angka bulan ini per bidang: Marketing = skrip, Creative = editing, Talent = take. */
async function dashNumbers() {
  const role = state.me.role;
  const inMonth = (d) => Boolean(d) && d.slice(0, 7) === dashMonth;
  const byType = Object.fromEntries(TYPES.map((t) => [t, { target: 0, actual: 0 }]));
  const uploaded = state.contents.filter((c) => inMonth(c.published_date)).length;
  if (role === "Marketing") {
    const [cal, h3] = await Promise.all([api("GET", `/api/calendar?month=${dashMonth}`), api("GET", "/api/targets/h3")]);
    const scope = myApps();
    const ok = (app) => !scope.length || scope.includes(app);
    for (const p of cal.plans) if (ok(p.app) && p.amount != null) byType[p.type].target += p.amount;
    for (const [k, n] of Object.entries(cal.actuals)) {
      const [app, type] = JSON.parse(k);
      if (ok(app)) byType[type].actual += n;
    }
    const need = Object.fromEntries(TYPES.map((t) => [t, h3.byType[t].remaining]));
    return {
      byType, uploaded,
      doneTitle: "Skrip selesai", doneSub: "Skrip yang sudah siap untuk diproduksi.", doneIcon: "qc",
      targetSub: `Total target konten untuk ${monthName(dashMonth)}.`,
      rate: { value: uploaded, label: "target konten" },
      alert: { need, title: "skrip perlu disiapkan", sub: `Target sampai ${fmtDate(h3.to)}.`, action: '<button class="btn wide" data-action="goto" data-page="calendar">' + icon("calendar", 16) + " Lihat kalender</button>" },
    };
  }
  const talent = role === "Talent";
  const rows = state.contents.filter((c) => inMonth(c.upload_date) && (!talent || (c.type === "Video" && sem(c.talent_status) !== "Tidak perlu")));
  for (const c of rows) {
    byType[c.type].target++;
    if (talent ? sem(c.talent_status) === "Done" : sem(c.creative_status) === "Done") byType[c.type].actual++;
  }
  const until = new Date(Date.parse(`${state.today}T12:00:00Z`) + 3 * 864e5).toISOString().slice(0, 10);
  const need = Object.fromEntries(TYPES.map((t) => [t, 0]));
  for (const c of state.contents) {
    if (c.upload_date > until) continue;
    if (talent ? c.flags.talent : c.flags.edit || c.flags.revision) need[c.type]++;
  }
  const done = TYPES.reduce((n, t) => n + byType[t].actual, 0);
  return {
    byType, uploaded,
    doneTitle: talent ? "Take selesai" : "Selesai diedit", doneSub: talent ? "Video yang sudah selesai take." : "Konten yang editingnya sudah selesai.", doneIcon: talent ? "talent" : "qc",
    targetSub: `Konten dengan jadwal upload ${monthName(dashMonth)}.`,
    rate: { value: done, label: talent ? "video selesai take" : "konten selesai diedit" },
    alert: {
      need, title: talent ? "video perlu take" : "konten perlu diedit", sub: `Upload sampai ${fmtDate(until)}.`,
      action: `<button class="btn wide" data-action="stage" data-stage="${talent ? "talent" : "edit"}">${icon("edit", 16)} Lihat antrean</button>`,
    },
  };
}

export async function renderDashboard(root) {
  dashMonth ||= state.today.slice(0, 7);
  const n = await dashNumbers();
  const target = TYPES.reduce((x, t) => x + n.byType[t].target, 0);
  const actual = TYPES.reduce((x, t) => x + n.byType[t].actual, 0);
  const rate = pctOf(n.rate.value, target);
  // Header: subjudul, pilihan bulan, tombol buat skrip (Marketing).
  $id("pageSub").textContent = "Perencanaan dan aktual konten dalam satu tempat.";
  $id("pageSub").classList.remove("hidden");
  $id("headTools").innerHTML = `<label class="month-pick">${icon("calendar", 16)}<input type="month" value="${dashMonth}" data-onchange="dash-month" aria-label="Bulan"></label>
    ${state.me.role === "Marketing" ? `<button class="btn primary big" data-action="create">${icon("plus", 18)} Buat skrip</button>` : ""}`;

  const kpi = (ic, title, value, sub) => `<div class="kpi"><span class="kpi-ico">${icon(ic, 24)}</span><div><span class="kpi-title">${title}</span><b>${value}</b><small>${sub}</small></div></div>`;
  const kpis = `<div class="kpi-row">
    ${kpi("doc", "Target bulanan", target, esc(n.targetSub))}
    ${kpi(n.doneIcon, n.doneTitle, actual, esc(n.doneSub))}
    ${kpi("upload", "Konten terunggah", n.uploaded, "Konten yang sudah dipublikasikan.")}
    <div class="kpi"><span class="kpi-ico">${icon("chart", 24)}</span><div class="kpi-grow"><span class="kpi-title">Pencapaian</span><b>${rate}%</b>
      <div class="kbar"><i style="width:${Math.min(100, rate)}%"></i></div><small>${n.rate.value} dari ${target} ${esc(n.rate.label)}.</small></div></div>
  </div>`;

  const scale = Math.max(1, ...TYPES.map((t) => Math.max(n.byType[t].target, n.byType[t].actual)));
  const TICON = { Video: "edit", Carousel: "layers", Singlepost: "image" };
  const tva = `<section class="panel tva"><div class="tva-head"><h2>Target vs Aktual Konten Bulan Ini</h2>
      <div class="tva-legend"><span><i class="dt dt-t"></i>Target</span><span><i class="dt dt-a"></i>Aktual</span></div></div>
    <div class="tva-grid">${TYPES.map((t) => `<div class="tva-item"><div class="tva-top">${icon(TICON[t], 18)}<b>${typeLabel(t)}</b><span>${n.byType[t].actual} / ${n.byType[t].target}</span></div>
      <div class="tbar tbar-t"><i style="width:${(n.byType[t].target / scale) * 100}%"></i></div><div class="tbar tbar-a"><i style="width:${(n.byType[t].actual / scale) * 100}%"></i></div></div>`).join("")}</div></section>`;

  const needTotal = TYPES.reduce((x, t) => x + n.alert.need[t], 0);
  const alert = `<section class="alert-card ${needTotal ? "" : "ok"}"><div class="ac-head"><span class="ac-ico">${needTotal ? "!" : "✓"}</span>
      <div><b>${needTotal ? `${needTotal} ${esc(n.alert.title)}` : "Semua aman"}</b><small>${esc(n.alert.sub)}</small></div></div>
    <div class="ac-types">${TYPES.map((t) => `<div><span>${typeLabel(t)}</span><b>${n.alert.need[t]}</b></div>`).join("")}</div>${n.alert.action}</section>`;

  root.innerHTML = `${kpis}<div class="dash-mid">${tva}${alert}</div>${queueSection()}`;
}

/** Antrean produksi di dashboard: filter, tab status, dan tabel. */
function queueSection() {
  const keys = cardKeys();
  const rows = visibleRows();
  const count = (key) => state.contents.filter((c) => scoped(c, { useDates: !DATELESS.includes(key) }) && c.flags[key]).length;
  const all = state.contents.filter((c) => scoped(c)).length;
  const tone = (k) => (k === "missed" ? "p-missed" : k.startsWith("late") ? "p-late" : k === "qc" || k === "revision" ? "p-neutral" : "p-info");
  const pills = `<div class="pills" role="tablist">
    <button class="pill p-all ${state.stage ? "" : "active"}" data-action="stage-all">Semua <b>${all}</b></button>
    ${METRICS.filter((m) => keys.includes(m[0])).map(([k, label, sub]) => `<button class="pill ${tone(k)} ${state.stage === k ? "active" : ""}" data-action="stage" data-stage="${k}" title="${esc(sub)}">${label} <b>${count(k)}</b></button>`).join("")}
  </div>`;
  const apps = `<select data-onchange="filter" data-key="app" aria-label="Apps">${optionTags("app", filters.app, { blank: myApps().length ? "Semua apps saya" : "Semua apps", mine: true })}</select>`;
  const types = `<select data-onchange="filter" data-key="type" aria-label="Jenis konten"><option value="">Semua jenis</option>${TYPES.map((t) => `<option value="${t}" ${filters.type === t ? "selected" : ""}>${typeLabel(t)}</option>`).join("")}</select>`;
  return `<section class="worksheet queue">
    <div class="q-head"><div class="q-title"><h2>Antrean produksi</h2><span class="q-count">${rows.length} konten</span><span class="q-hint">Klik dropdown pada setiap kolom untuk memperbarui data.</span></div>
      <div class="q-tools">
        <label class="q-search">${icon("search", 16)}<input type="search" placeholder="Cari judul atau isi skrip…" value="${esc(filters.search)}" data-onchange="filter" data-key="search" aria-label="Cari konten"></label>
        ${apps}${types}
        <span class="q-range">${icon("calendar", 16)}<input type="date" value="${filters.from}" data-onchange="filter" data-key="from" aria-label="Tanggal upload mulai"><span>–</span><input type="date" value="${filters.to}" data-onchange="filter" data-key="to" aria-label="Tanggal upload sampai"></span>
        ${filters.app || filters.type || filters.from || filters.to || filters.search || state.stage ? '<button class="btn mini" data-action="filter-reset">Reset</button>' : ""}
      </div></div>
    ${pills}
    ${tableHtml(rows)}
    <div class="q-legend">
      <span><i class="ld ld-todo"></i><b>Perlu tindakan</b><small>Perlu segera ditindaklanjuti</small></span>
      <span><i class="ld ld-done"></i><b>Selesai</b><small>Sudah sesuai target</small></span>
      <span><i class="ld ld-late"></i><b>Terlambat</b><small>${state.me.role === "Marketing" ? "Skrip belum ready lewat H-3" : "Edit belum selesai lewat H-1"}</small></span>
      <span><i class="ld ld-missed"></i><b>Terlewat</b><small>Tanggal upload lewat, belum tayang</small></span></div>
  </section>`;
}
const $id = (id) => document.getElementById(id);

let typeTab = "";
export async function renderWorksheet(root) {
  filters.type = typeTab;
  const rows = visibleRows();
  const creative = state.me.role === "Creative";
  root.innerHTML = `<div class="tabs" role="tablist">${["", ...TYPES].map((t) => `<button role="tab" aria-selected="${typeTab === t}" class="${typeTab === t ? "active" : ""}" data-action="type-tab" data-type="${t}">${t ? typeLabel(t) : "Semua konten"}</button>`).join("")}</div>
    ${filterBar({ withEditor: isLeader(), withType: false })}
    ${worksheetSection(creative ? (isLeader() ? "Produksi tim Creative" : "Pekerjaan saya") : "Semua skrip", rows, `${rows.length} konten`)}`;
}

// ───────────── interaksi ─────────────
const changed = () => window.dispatchEvent(new Event("cs:changed"));

export async function updateContent(id, changes) {
  const c = state.contents.find((x) => x.id === id);
  try {
    const next = await api("PATCH", `/api/contents/${id}`, { revision: c.revision, changes });
    state.contents = state.contents.map((x) => (x.id === id ? next : x));
    return next;
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) await reloadContents();
    throw e;
  }
}

const noOf = (id) => {
  const c = state.contents.find((x) => x.id === id);
  return c ? `${typeLabel(c.type)} ${contentNo(c)}` : `#${id}`;
};

function describe(field, value) {
  if (field === "creative_user_id") return userName(value) || "Belum ditentukan";
  if (field === "link" || field === "notes") return "";
  return optLabel(value) || "kosong";
}

delegate(document.body, "change", {
  "dash-month": (el) => {
    dashMonth = el.value || state.today.slice(0, 7);
    changed();
  },
  filter: (el) => {
    filters[el.dataset.key] = el.value;
    if (el.dataset.key === "type") typeTab = el.value;
    changed();
  },
  cell: async (el) => {
    const id = Number(el.dataset.id);
    const field = el.dataset.field;
    const key = `${id}:${field}`;
    const before = state.contents.find((x) => x.id === id)?.[field] ?? null;
    let value = el.value;
    if (field === "creative_user_id") value = value ? Number(value) : null;
    if (field === "link") value = value.trim();
    if (field === "talent_name" && value === "") value = null;
    try {
      await updateContent(id, { [field]: value });
      cellErrors.delete(key);
      const label = describe(field, value);
      const undoable = !["link", "notes"].includes(field);
      const undo = {
        label: "Batalkan",
        run: async () => {
          try {
            await updateContent(id, { [field]: before });
            toast(`${noOf(id)} · ${FIELD_NAME[field]} dikembalikan`);
          } catch (e) {
            toast(errorText(e), { error: true });
          }
          changed();
        },
      };
      toast(`${noOf(id)} · ${FIELD_NAME[field]}${label ? ` → ${label}` : " tersimpan"}`, undoable ? { action: undo } : {});
    } catch (e) {
      cellErrors.set(key, errorText(e).replace(/^[^:]+: /, ""));
      toast(`${noOf(id)} · ${errorText(e)}`, { error: true });
    }
    changed();
  },
});

delegate(document.body, "click", {
  "stage-all": () => {
    state.stage = "";
    changed();
  },
  stage: (el) => {
    state.stage = state.stage === el.dataset.stage ? "" : el.dataset.stage;
    changed();
  },
  "filter-today": () => {
    filters.from = filters.to = state.today;
    changed();
  },
  "filter-reset": () => {
    Object.assign(filters, { app: "", type: state.page === "create" ? typeTab : "", from: "", to: "", search: "", editor: "" });
    state.stage = "";
    changed();
  },
  "type-tab": (el) => {
    typeTab = el.dataset.type;
    changed();
  },
  goto: (el) => window.dispatchEvent(new CustomEvent("cs:navigate", { detail: el.dataset.page })),
});
