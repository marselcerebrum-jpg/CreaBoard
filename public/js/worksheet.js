// Dashboard dan worksheet produksi (tabel dengan dropdown per sel; kartu di ponsel).
import {
  api, ApiError, delegate, errorText, esc, fmtDate, fmtStamp, icon, isLeader, leads, myApps, optionTags, optLabel, reloadContents, sem,
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
  ["late", "Telat", "Upload hari ini, hasil belum", "late"],
  ["missed", "Terlewat", "Upload lewat, belum tayang", "missed"],
];
// Kartu dibedakan per bidang (berlaku juga untuk Leader di bidang tersebut).
const ROLE_CARDS = {
  Marketing: ["script", "qc", "late", "missed"],
  Creative: ["talent", "edit", "revision", "late", "missed"],
  Talent: ["talent", "late", "missed"],
};
// Kartu berbasis tenggat tidak mengikuti filter rentang tanggal upload.
const DATELESS = ["late", "missed"];
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
    .filter((c) => !q || `${c.id} ${c.title} ${optLabel(c.app)}`.toLowerCase().includes(q))
    .sort((a, b) => a.upload_date.localeCompare(b.upload_date) || a.id - b.id);
}

function filterBar({ withEditor, withType = true }) {
  return `<div class="filters">
    <div class="field"><label for="fApp">Apps</label><select id="fApp" data-onchange="filter" data-key="app">${optionTags("app", filters.app, { blank: myApps().length ? "Semua apps saya" : "Semua apps", mine: true })}</select></div>
    ${withType ? `<div class="field"><label for="fType">Jenis konten</label><select id="fType" data-onchange="filter" data-key="type"><option value="">Semua</option>${TYPES.map((t) => `<option value="${t}" ${filters.type === t ? "selected" : ""}>${typeLabel(t)}</option>`).join("")}</select></div>` : ""}
    ${withEditor ? `<div class="field"><label for="fEditor">Editor</label><select id="fEditor" data-onchange="filter" data-key="editor"><option value="">Semua editor</option>${usersByRole("Creative").map((u) => `<option value="${u.id}" ${filters.editor === String(u.id) ? "selected" : ""}>${esc(u.name)}</option>`).join("")}</select></div>` : ""}
    <div class="field"><label for="fFrom">Upload mulai</label><input id="fFrom" type="date" value="${filters.from}" data-onchange="filter" data-key="from"></div>
    <div class="field"><label for="fTo">Upload sampai</label><input id="fTo" type="date" value="${filters.to}" data-onchange="filter" data-key="to"></div>
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
  script: { head: "Info skrip", html: (c) => select(c, "script_status", "script") + stamp(c.script_ready_at) },
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
      const chip = c.flags.published
        ? `<span class="badge b-done">Tayang ${esc(fmtDate(c.published_date))}</span>`
        : c.flags.missed ? '<span class="badge b-danger">Terlewat</span>' : c.upload_date === state.today ? '<span class="badge b-warn">Hari ini</span>' : "";
      return `<div class="nowrap">${fmtDate(c.upload_date)}</div>${chip ? `<div class="cell-time">${chip}</div>` : ""}`;
    },
  },
  notes: {
    head: "Catatan",
    html: (c) => `<textarea class="inline-notes" rows="1" aria-label="Catatan #${c.id}" placeholder="Tulis catatan…" data-onchange="cell" data-id="${c.id}" data-field="notes" ${can(c, "notes") ? "" : "readonly"}>${esc(c.notes)}</textarea>${cellError(c, "notes")}`,
  },
};
// Urutan kolom mengikuti pekerjaan tiap peran: kolom tugas sendiri di depan.
const ORDER = {
  default: ["script", "talentName", "take", "editor", "creative", "link", "qc", "upload", "notes"],
  Creative: ["creative", "link", "qc", "upload", "editor", "script", "talentName", "take", "notes"],
  Talent: ["take", "talentName", "upload", "script", "editor", "creative", "link", "qc", "notes"],
};
const columns = () => ORDER[state.me.role] ?? ORDER.default;

function titleCell(c) {
  return `<div class="t-title">${esc(c.title)}</div><div class="t-meta">${esc(optLabel(c.app))} · ${typeLabel(c.type)} · dibuat ${fmtDate(c.created_date)}</div>`;
}

function tableHtml(rows) {
  const cols = columns();
  const body = rows.length
    ? rows.map((c) => `<tr><td class="sticky-a"><button class="number" data-action="detail" data-id="${c.id}" aria-label="Buka skrip ${c.id}">${c.id}</button></td><td class="sticky-b">${titleCell(c)}</td>${cols.map((k) => `<td>${CELLS[k].html(c)}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${cols.length + 2}" class="empty">Tidak ada konten yang cocok. Ubah filter atau buat konten baru.</td></tr>`;
  const cards = rows.length
    ? rows.map((c) => `<article class="ws-card"><header><button class="number" data-action="detail" data-id="${c.id}">${c.id}</button><div>${titleCell(c)}</div></header>
        <dl>${cols.map((k) => `<div><dt>${CELLS[k].head}</dt><dd>${CELLS[k].html(c)}</dd></div>`).join("")}</dl></article>`).join("")
    : '<p class="empty">Tidak ada konten yang cocok.</p>';
  return `<div class="tablewrap ws-table"><table><thead><tr><th class="sticky-a">No.</th><th class="sticky-b">Konten</th>${cols.map((k) => `<th>${CELLS[k].head}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>
    <div class="ws-cards">${cards}</div>`;
}

function worksheetSection(title, rows, subtitle) {
  return `<section class="worksheet">
    <div class="tablehead"><div><h2>${esc(title)}</h2><span class="small">${esc(subtitle)}</span></div>
      <input class="search" type="search" placeholder="Cari nomor atau kata kunci…" value="${esc(filters.search)}" data-onchange="filter" data-key="search" aria-label="Cari konten"></div>
    ${tableHtml(rows)}
    <div class="legend"><span class="badge b-attn">Kuning</span><span class="small">langkah berikutnya</span><span class="badge b-done">Hijau</span><span class="small">selesai</span><span class="badge b-danger">Merah</span><span class="small">revisi / terlewat</span></div>
  </section>`;
}

// ───────────── halaman ─────────────
export async function renderDashboard(root) {
  const keys = cardKeys();
  const showTarget = state.me.role === "Marketing";
  const h3 = showTarget ? await api("GET", `/api/targets/h3${filters.app ? `?app=${encodeURIComponent(filters.app)}` : ""}`) : null;
  const inRange = state.contents.filter((c) => scoped(c));
  const cards = METRICS.filter((m) => keys.includes(m[0]))
    .map(([key, title, sub, ic]) => {
      const n = state.contents.filter((c) => scoped(c, { useDates: !DATELESS.includes(key) }) && c.flags[key]).length;
      return `<button class="card ${state.stage === key ? "selected" : ""} ${DATELESS.includes(key) && n ? "alert" : ""}" data-action="stage" data-stage="${key}" aria-pressed="${state.stage === key}" title="${esc(sub)}">
        <span class="card-top"><span class="card-title">${title}</span>${icon(ic, 16)}</span><span class="num">${n}</span></button>`;
    })
    .join("");
  const short = h3 ? TYPES.map((t) => ({ t, ...h3.byType[t] })).filter((x) => x.remaining > 0) : [];
  const totalShort = short.reduce((n, x) => n + x.remaining, 0);
  const reminder = totalShort
    ? `<div class="target-reminder" role="status"><div class="reminder-text">${icon("late", 16)}<b>${totalShort} skrip lagi</b> untuk target sampai ${fmtDate(h3.to)} (H+3):
        ${short.map((x) => `<span class="chip">${typeLabel(x.t)} ${x.remaining}</span>`).join("")}</div>
        <div class="target-reminder-actions"><button class="btn mini" data-action="goto" data-page="calendar">Lihat kalender</button><button class="btn mini primary" data-action="goto" data-page="create">Buat skrip</button></div></div>`
    : "";
  const composition = TYPES.map((t) => {
    const n = inRange.filter((c) => c.type === t).length;
    return `<div class="barrow"><span>${typeLabel(t)}</span><div class="bar"><i style="width:${inRange.length ? (n / inRange.length) * 100 : 0}%"></i></div><b>${n}</b></div>`;
  }).join("");
  const targetPanel = h3
    ? `<div class="panel"><h2>Sisa target skrip · H+3</h2>
        <div class="script-target-cards">${TYPES.map((t) => `<div class="script-target"><span>${typeLabel(t)}</span><strong>${h3.byType[t].remaining}</strong><small>dari ${h3.byType[t].plan}</small></div>`).join("")}</div></div>`
    : leads("Creative") ? workloadPanel()
    : `<div class="panel"><h2>Ringkasan</h2><div class="summary-nums"><div><strong>${inRange.length}</strong><span>konten</span></div><div><strong>${inRange.filter((c) => c.flags.published).length}</strong><span>sudah tayang</span></div></div></div>`;
  const rows = visibleRows();
  const title = state.stage ? METRICS.find((m) => m[0] === state.stage)[1] : "Antrean produksi";
  // Urutan: notifikasi → komposisi & target → filter → kartu → antrean.
  root.innerHTML = `${reminder}
    <div class="panels"><div class="panel"><h2>Komposisi konten</h2>${composition}</div>${targetPanel}</div>
    ${filterBar({ withEditor: false })}<div class="cards">${cards}</div>
    ${worksheetSection(title, rows, `${rows.length} konten`)}`;
}

/** Leader Creative: beban per editor (konten belum selesai vs selesai). */
function workloadPanel() {
  const rows = usersByRole("Creative").filter((u) => u.position === "Staff").map((u) => {
    const mine = state.contents.filter((c) => c.creative_user_id === u.id && scoped(c) && !c.flags.published);
    const open = mine.filter((c) => sem(c.creative_status) !== "Done").length;
    return { u, open, done: mine.length - open, late: mine.filter((c) => c.flags.late || c.flags.missed).length };
  });
  const unassigned = state.contents.filter((c) => !c.creative_user_id && scoped(c) && !c.flags.published).length;
  const max = Math.max(1, ...rows.map((r) => r.open + r.done));
  return `<div class="panel"><h2>Beban editor</h2>${unassigned ? `<span class="badge b-warn">${unassigned} belum punya editor</span>` : ""}
    ${rows.map((r) => `<div class="barrow"><span>${esc(r.u.name)}</span><div class="bar"><i style="width:${((r.open + r.done) / max) * 100}%"></i></div><b>${r.open} antre</b>${r.late ? `<span class="badge b-danger">${r.late} telat</span>` : ""}</div>`).join("") || '<p class="small">Belum ada staff Creative.</p>'}</div>`;
}

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

function describe(field, value) {
  if (field === "creative_user_id") return userName(value) || "Belum ditentukan";
  if (field === "link" || field === "notes") return "";
  return optLabel(value) || "kosong";
}

delegate(document.body, "change", {
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
            toast(`#${id} · ${FIELD_NAME[field]} dikembalikan`);
          } catch (e) {
            toast(errorText(e), { error: true });
          }
          changed();
        },
      };
      toast(`#${id} · ${FIELD_NAME[field]}${label ? ` → ${label}` : " tersimpan"}`, undoable ? { action: undo } : {});
    } catch (e) {
      cellErrors.set(key, errorText(e).replace(/^[^:]+: /, ""));
      toast(`#${id} · ${errorText(e)}`, { error: true });
    }
    changed();
  },
});

delegate(document.body, "click", {
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
