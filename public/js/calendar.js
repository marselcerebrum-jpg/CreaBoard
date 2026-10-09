// Konten kalender: alur bulanan Ringkasan → Rencana Bulanan → Aktual (pantau selisih) → Evaluasi.
// Rencana diisi Leader & staff Marketing; aktual = skrip Ready per tanggal pengerjaan.
import { api, delegate, errorText, esc, icon, isLeader, myApps, optionsFor, state, toast, TYPES, typeLabel } from "./core.js";

const COLORS = [["blue", "Biru"], ["yellow", "Kuning"], ["green", "Hijau"], ["orange", "Oranye"], ["pink", "Pink"], ["cyan", "Toska"], ["purple", "Ungu"]];
const VIEWS = [
  ["summary", "Ringkasan", "dashboard"],
  ["plan", "Rencana Bulanan", "calendar"],
  ["actual", "Aktual", "qc"],
  ["eval", "Evaluasi", "team"],
];
const WEEKDAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

let view = "summary";
let month = "";
let planApp = "";
let planType = "Video";
let fltApp = "";
let fltType = "";
let planMode = "calendar"; // Leader: "calendar" (per aplikasi) atau "table" (lihat semua)
let showEmpty = false;
let data = null;

const key = (app, type, date) => JSON.stringify([app, type, date]);
const changed = () => window.dispatchEvent(new Event("cs:changed"));
const pct = (a, p) => (p ? Math.round((a / p) * 100) : null);
const gap = (p, a) => Math.max(0, p - a);
const scopeApps = () => optionsFor("app").filter((o) => !myApps().length || myApps().includes(o.id));
const canEditApp = (appId) => isLeader() || (state.me.role === "Marketing" && myApps().includes(appId));
const canPlan = () => isLeader() || state.me.role === "Marketing";
const monthLabel = (m) => {
  const [y, mm] = m.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, mm - 1, 1)));
};
const daysOf = (m) => {
  const [y, mm] = m.split("-").map(Number);
  return Array.from({ length: new Date(Date.UTC(y, mm, 0)).getUTCDate() }, (_, i) => `${m}-${String(i + 1).padStart(2, "0")}`);
};

/** Rekap rencana vs aktual per apps × jenis untuk bulan yang dibuka. */
function compute() {
  const apps = scopeApps();
  const ids = new Set(apps.map((a) => a.id));
  const by = Object.fromEntries(apps.map((a) => [a.id, Object.fromEntries(TYPES.map((t) => [t, { plan: 0, actual: 0 }]))]));
  const plans = Object.fromEntries(data.plans.map((p) => [key(p.app, p.type, p.date), p]));
  let selfEdit = 0;
  const underDays = new Set();
  for (const p of data.plans) {
    if (!ids.has(p.app) || p.amount == null) continue;
    by[p.app][p.type].plan += p.amount;
    if (p.color) selfEdit += p.amount;
    const actual = data.actuals[key(p.app, p.type, p.date)] ?? 0;
    if (p.date <= state.today && actual < p.amount) underDays.add(p.date);
  }
  for (const [k, n] of Object.entries(data.actuals)) {
    const [app, type] = JSON.parse(k);
    if (ids.has(app)) by[app][type].actual += n;
  }
  const appTotal = (id) => TYPES.reduce((s, t) => ({ plan: s.plan + by[id][t].plan, actual: s.actual + by[id][t].actual }), { plan: 0, actual: 0 });
  const total = apps.reduce((s, a) => {
    const t = appTotal(a.id);
    return { plan: s.plan + t.plan, actual: s.actual + t.actual };
  }, { plan: 0, actual: 0 });
  return { apps, by, plans, appTotal, total, selfEdit, underDays: [...underDays].sort() };
}

// ───────────── komponen ─────────────
function donut(value, size = 64) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value ?? 0));
  const tone = value == null ? "none" : value >= 100 ? "ok" : value >= 60 ? "mid" : "low";
  return `<svg class="donut d-${tone}" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="${r}" class="track"/><circle cx="32" cy="32" r="${r}" class="bar" stroke-dasharray="${(v / 100) * c} ${c}" transform="rotate(-90 32 32)"/></svg>`;
}
const bar = (value) => `<div class="pbar"><i style="width:${Math.min(100, value ?? 0)}%"></i></div>`;
const pctText = (v) => (v == null ? "—" : `${v}%`);

function monthTools({ live = true } = {}) {
  const current = month === state.today.slice(0, 7);
  return `<div class="plan-tools">
    <button class="btn icon-btn" data-action="cal-shift" data-delta="-1" aria-label="Bulan sebelumnya">‹</button>
    <label class="month-pick">${icon("calendar", 16)}<input id="calMonth" type="month" value="${month}" data-onchange="cal-month" aria-label="Bulan"></label>
    <button class="btn icon-btn" data-action="cal-shift" data-delta="1" aria-label="Bulan berikutnya">›</button>
    ${live ? (current ? '<span class="live-badge">Bulan berjalan</span>' : '<button class="btn mini" data-action="cal-now">Bulan ini</button>') : ""}
  </div>`;
}

function statCards({ plan, actual }) {
  const p = pct(actual, plan);
  return `<div class="stat-row">
    <div class="stat"><div><span>Total Rencana</span><b>${plan}</b><small>konten</small></div><i class="stat-ico ico-plan">${icon("calendar", 22)}</i></div>
    <div class="stat"><div><span>Total Aktual <em>(skrip ready)</em></span><b>${actual}</b><small>konten</small></div><i class="stat-ico ico-ok">${icon("qc", 22)}</i></div>
    <div class="stat"><div><span>Selisih</span><b class="warn-num">${gap(plan, actual)}</b><small>konten</small></div><i class="stat-ico ico-warn">${icon("missed", 22)}</i></div>
    <div class="stat"><div><span>Pencapaian</span><b>${pctText(p)}</b></div>${donut(p)}</div>
  </div>`;
}

const appMark = (label) => `<span class="app-mark">${esc(label.trim().charAt(0).toUpperCase())}</span><b class="app-name">${esc(label)}</b>`;

// ───────────── 01 Ringkasan ─────────────
function summaryView(r) {
  const active = r.apps.filter((a) => {
    const t = r.appTotal(a.id);
    return t.plan || t.actual;
  });
  const idle = r.apps.filter((a) => !active.includes(a));
  const cards = active
    .sort((a, b) => r.appTotal(b.id).plan - r.appTotal(a.id).plan)
    .map((a) => {
      const t = r.appTotal(a.id);
      const p = pct(t.actual, t.plan);
      const noPlan = !t.plan;
      return `<article class="app-card">
        <header>${appMark(a.label)}</header>
        <div class="app-big"><b>${t.actual} / ${t.plan}</b>${noPlan ? '<span class="tag-noplan">Belum ada rencana</span>' : `<span class="${p >= 100 ? "pct-ok" : p ? "" : "pct-zero"}">${pctText(p)}</span>`}</div>
        <div class="small">${noPlan ? `${t.actual} skrip ready tanpa rencana` : "skrip ready dari rencana"}</div>${bar(noPlan ? 0 : p)}
        <div class="type-split">${TYPES.map((ty) => `<div><span>${typeLabel(ty)}</span><b>${r.by[a.id][ty].actual} / ${r.by[a.id][ty].plan}</b></div>`).join("")}</div>
        <button class="btn mini wide" data-action="cal-open" data-app="${esc(a.id)}">Lihat detail →</button>
      </article>`;
    })
    .join("");
  return `<div class="plan-head"><h2>Perencanaan Konten</h2>${monthTools()}
      ${canPlan() ? `<button class="btn accent" data-action="cal-view" data-view="plan">${icon("plus", 16)} Buat Rencana</button>` : ""}</div>
    ${statCards(r.total)}
    <h3 class="plan-sub">Progres per Aplikasi</h3>
    <div class="app-grid">${cards || '<div class="panel empty">Belum ada rencana atau aktual bulan ini.</div>'}</div>
    ${idle.length ? `<div class="idle-apps"><span class="small">Belum ada rencana:</span> ${idle.map((a) => `<button class="chip" data-action="cal-open" data-app="${esc(a.id)}">${esc(a.label)}</button>`).join("")}</div>` : ""}`;
}

// ───────────── 02 Rencana bulanan (kalender per apps & jenis) ─────────────
const modeToggle = () =>
  isLeader()
    ? `<div class="seg" role="tablist" aria-label="Tampilan rencana">
        <button class="${planMode === "calendar" ? "active" : ""}" data-action="plan-mode" data-mode="calendar">${icon("calendar", 15)} Per aplikasi</button>
        <button class="${planMode === "table" ? "active" : ""}" data-action="plan-mode" data-mode="table">${icon("dashboard", 15)} Lihat semua (tabel)</button></div>`
    : "";

function planView(r) {
  if (!r.apps.length) return '<div class="panel empty">Belum ada apps yang bisa ditampilkan.</div>';
  if (planMode === "table" && isLeader()) return tableView(r);
  if (!r.apps.some((a) => a.id === planApp)) planApp = r.apps[0].id;
  const app = r.apps.find((a) => a.id === planApp);
  const linked = new Set(data.kpiLinked);
  const editable = canEditApp(app.id);
  const dates = daysOf(month);
  const lead = (new Date(`${dates[0]}T12:00:00Z`).getUTCDay() + 6) % 7;
  let target = 0;
  let actualSum = 0;
  let self = 0;
  const cells = dates.map((d, i) => {
    const k = key(app.id, planType, d);
    const plan = r.plans[k];
    const actual = data.actuals[k] ?? 0;
    const amount = plan?.amount;
    target += amount ?? 0;
    actualSum += actual;
    if (plan?.color) self += amount ?? 0;
    const isLinked = linked.has(k);
    const status = amount == null ? "none" : actual >= amount ? "ok" : d <= state.today ? "under" : "wait";
    const dow = (lead + i) % 7;
    return `<div class="day ${dow >= 5 ? "weekend" : ""} ${d === state.today ? "today" : ""}" title="${isLinked ? "Terhubung target KPI" : ""}">
      <div class="day-num">${i + 1}</div>
      <div class="day-line"><span>Rencana</span>
        <span class="plan-box ${plan?.color ? `c-${plan.color}` : ""} ${isLinked ? "linked" : ""}">
          <input type="number" min="0" step="1" inputmode="numeric" value="${amount ?? ""}" placeholder="—" aria-label="Rencana ${esc(app.label)} ${typeLabel(planType)} ${d}"
            data-onchange="plan" data-app="${esc(app.id)}" data-type="${planType}" data-date="${d}" ${editable && !isLinked ? "" : "disabled"}>
          ${editable ? `<button class="swatch" aria-label="Warna ${d}" data-action="plan-color" data-app="${esc(app.id)}" data-type="${planType}" data-date="${d}">●</button>` : ""}
        </span></div>
      <div class="day-line"><span><i class="dot dot-${status}"></i>Aktual</span><b class="act-${status}">${actual}</b></div>
    </div>`;
  });
  const p = pct(actualSum, target);
  return `<div class="plan-head"><h2>${esc(app.label)} · ${esc(monthLabel(month))}</h2>${modeToggle()}${monthTools({ live: false })}</div>
    <div class="plan-bar">
      <div class="field"><label for="planApp">Aplikasi</label><select id="planApp" data-onchange="plan-app">${r.apps.map((a) => `<option value="${esc(a.id)}" ${a.id === app.id ? "selected" : ""}>${esc(a.label)}</option>`).join("")}</select></div>
      <div class="type-tabs" role="tablist">${TYPES.map((t) => `<button class="btn ${t === planType ? "active" : ""}" role="tab" aria-selected="${t === planType}" data-action="plan-type" data-type="${t}">${typeLabel(t)}</button>`).join("")}</div>
      <div class="mini-stats">
        <div class="mini-stat"><span>Target bulanan (${typeLabel(planType)})</span><b>${target}</b></div>
        <div class="mini-stat"><span>Aktual (skrip ready)</span><b>${actualSum}</b></div>
        <div class="mini-stat with-donut"><span>Pencapaian</span><b class="accent-num">${pctText(p)}</b>${donut(p, 44)}</div>
        <div class="mini-stat self-edit"><span>Edit mandiri</span><b>${self}</b></div>
      </div>
    </div>
    <div class="month-grid">
      ${WEEKDAYS.map((w) => `<div class="wd">${w}</div>`).join("")}
      ${'<div class="day blank"></div>'.repeat(lead)}${cells.join("")}${'<div class="day blank"></div>'.repeat((7 - ((lead + dates.length) % 7)) % 7)}
    </div>
    <div class="legend"><span><i class="dot dot-ok"></i>Aktual memenuhi rencana</span><span><i class="dot dot-under"></i>Aktual di bawah rencana</span>
      <span class="legend-chip legend-self">Berwarna · edit mandiri</span><span class="legend-chip legend-linked">Garis putus · terhubung KPI</span>
      ${editable ? "" : '<span class="small">Rencana hanya bisa diubah Leader dan staff Marketing pemegang apps ini.</span>'}</div>`;
}

// ───────────── 02b Lihat semua (tabel, khusus Leader) ─────────────
function tableView(r) {
  const dates = daysOf(month);
  const linked = new Set(data.kpiLinked);
  const types = TYPES.filter((t) => !fltType || t === fltType);
  const sum = (id) => types.reduce((s, t) => ({ plan: s.plan + r.by[id][t].plan, actual: s.actual + r.by[id][t].actual }), { plan: 0, actual: 0 });
  const apps = r.apps.filter((a) => showEmpty || sum(a.id).plan || sum(a.id).actual);
  const hidden = r.apps.length - apps.length;
  const dayTotals = dates.map(() => ({ plan: 0, actual: 0 }));
  const wd = (d) => new Intl.DateTimeFormat("id-ID", { weekday: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  const weekend = (d) => [0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay());
  const cls = (d) => `${weekend(d) ? "we" : ""} ${d === state.today ? "td" : ""}`;
  const totalCell = ({ plan, actual }) => {
    const v = pct(actual, plan);
    return `<td class="tot"><b>${actual}</b><span>/ ${plan}</span>${plan ? `<em class="${v >= 100 ? "pct-ok" : ""}">${v}%</em>` : ""}</td>`;
  };
  const body = apps.map((a) => {
    const t = sum(a.id);
    const v = pct(t.actual, t.plan);
    const group = `<tr class="grp"><th class="sc">${appMark(a.label)}<span class="grp-meta">${t.actual} / ${t.plan}${t.plan ? ` · ${v}%` : ""}</span></th><td colspan="${dates.length + 1}"></td></tr>`;
    const rows = types.map((ty) => {
      const cells = dates.map((d, i) => {
        const k = key(a.id, ty, d);
        const plan = r.plans[k];
        const amount = plan?.amount;
        const actual = data.actuals[k] ?? 0;
        dayTotals[i].plan += amount ?? 0;
        dayTotals[i].actual += actual;
        const status = amount == null ? (actual ? "extra" : "none") : actual >= amount ? "ok" : d <= state.today ? "under" : "wait";
        const isLinked = linked.has(k);
        return `<td class="${cls(d)}"><div class="tc">
          <span class="plan-box ${plan?.color ? `c-${plan.color}` : ""} ${isLinked ? "linked" : ""}">
            <input type="number" min="0" step="1" inputmode="numeric" value="${amount ?? ""}" placeholder="·" aria-label="Rencana ${esc(a.label)} ${typeLabel(ty)} ${d}"
              data-onchange="plan" data-app="${esc(a.id)}" data-type="${ty}" data-date="${d}" ${isLinked ? "disabled" : ""}>
            <button class="swatch" aria-label="Warna ${d}" data-action="plan-color" data-app="${esc(a.id)}" data-type="${ty}" data-date="${d}">●</button></span>
          <b class="ta ta-${status}" title="Aktual (skrip ready)">${status === "none" ? "" : actual}</b></div></td>`;
      });
      return `<tr><th class="sc type">${typeLabel(ty)}</th>${cells.join("")}${totalCell(r.by[a.id][ty])}</tr>`;
    });
    return group + rows.join("");
  }).join("");
  const grand = apps.reduce((s, a) => {
    const t = sum(a.id);
    return { plan: s.plan + t.plan, actual: s.actual + t.actual };
  }, { plan: 0, actual: 0 });
  return `<div class="plan-head"><h2>Semua aplikasi · ${esc(monthLabel(month))}</h2>${modeToggle()}${monthTools({ live: false })}</div>
    <div class="table-tools">
      <div class="type-tabs">${["", ...TYPES].map((t) => `<button class="btn mini ${t === fltType ? "active" : ""}" data-action="tbl-type" data-type="${t}">${t ? typeLabel(t) : "Semua jenis"}</button>`).join("")}</div>
      <label class="check"><input type="checkbox" data-onchange="tbl-empty" ${showEmpty ? "checked" : ""}> Tampilkan aplikasi tanpa rencana${hidden ? ` (${hidden})` : ""}</label>
      <div class="tbl-legend"><span><i class="dot dot-ok"></i>tercapai</span><span><i class="dot dot-under"></i>di bawah rencana</span><span><i class="dot dot-extra"></i>tanpa rencana</span><span class="small">Kotak = rencana · angka di sampingnya = aktual (skrip ready)</span></div>
    </div>
    <div class="all-wrap" id="allWrap"><table class="all-table">
      <thead><tr><th class="sc">Aplikasi / jenis</th>${dates.map((d, i) => `<th class="${cls(d)}" data-day="${d}"><b>${i + 1}</b><small>${wd(d)}</small></th>`).join("")}<th class="tot">Total</th></tr></thead>
      <tbody>${body || `<tr><td colspan="${dates.length + 2}" class="empty">Belum ada rencana bulan ini.</td></tr>`}</tbody>
      ${apps.length ? `<tfoot><tr><th class="sc">Total per hari</th>${dayTotals.map((t, i) => `<td class="${cls(dates[i])}">${t.plan || t.actual ? `<b>${t.actual}</b><span>/ ${t.plan}</span>` : ""}</td>`).join("")}${totalCell(grand)}</tr></tfoot>` : ""}
    </table></div>`;
}

// ───────────── 03 Aktual: pantau selisih ─────────────
function actualView(r) {
  const types = TYPES.filter((t) => !fltType || t === fltType);
  const sum = (id) => types.reduce((s, t) => ({ plan: s.plan + r.by[id][t].plan, actual: s.actual + r.by[id][t].actual }), { plan: 0, actual: 0 });
  const apps = r.apps.filter((a) => (fltApp ? a.id === fltApp : sum(a.id).plan || sum(a.id).actual));
  const hidden = fltApp ? 0 : r.apps.length - apps.length;
  const line = (cells, { cls = "", app = "", type = "" } = {}) => {
    const [p, a] = cells;
    const v = pct(a, p);
    return `<td class="num">${p}</td><td class="num">${a}</td><td class="num warn-num">${gap(p, a)}</td>
      <td><div class="pct-cell"><b>${pctText(v)}</b>${bar(v)}</div></td>
      <td>${app ? `<button class="btn mini" data-action="cal-open" data-app="${esc(app)}" ${type ? `data-type="${type}"` : ""}>Lihat tanggal</button>` : ""}</td>`;
  };
  let grand = { plan: 0, actual: 0 };
  const body = apps.map((a) => {
    const t = sum(a.id);
    grand = { plan: grand.plan + t.plan, actual: grand.actual + t.actual };
    const rows = types.map((ty, i) => `<tr>${i === 0 ? `<td rowspan="${types.length + (types.length > 1 ? 1 : 0)}" class="app-cell">${appMark(a.label)}</td>` : ""}<td>${typeLabel(ty)}</td>${line([r.by[a.id][ty].plan, r.by[a.id][ty].actual], { app: a.id, type: ty })}</tr>`).join("");
    const totalRow = types.length > 1 ? `<tr class="row-total"><td>Total ${esc(a.label)}</td>${line([t.plan, t.actual], { app: a.id })}</tr>` : "";
    return rows + totalRow;
  }).join("");
  const scoped = scopeApps();
  return `<div class="plan-head"><h2>Pemantauan Bulanan</h2></div>
    <div class="filters plan-filters">
      <div class="field"><label>Bulan</label>${monthTools({ live: false })}</div>
      <div class="field"><label for="fltApp">Aplikasi</label><select id="fltApp" data-onchange="flt-app"><option value="">Semua aplikasi</option>${scoped.map((o) => `<option value="${esc(o.id)}" ${o.id === fltApp ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select></div>
      <div class="field"><label for="fltType">Jenis konten</label><select id="fltType" data-onchange="flt-type"><option value="">Semua jenis</option>${TYPES.map((t) => `<option value="${t}" ${t === fltType ? "selected" : ""}>${typeLabel(t)}</option>`).join("")}</select></div>
    </div>
    <div class="panel flush"><div class="tablewrap"><table class="gap-table">
      <thead><tr><th>Aplikasi</th><th>Jenis konten</th><th class="num">Rencana</th><th class="num">Aktual<small>(skrip ready)</small></th><th class="num">Selisih</th><th>Pencapaian</th><th></th></tr></thead>
      <tbody>${body || '<tr><td colspan="7" class="empty">Belum ada rencana atau aktual untuk filter ini.</td></tr>'}</tbody>
      ${apps.length ? `<tfoot><tr><td colspan="2">Total keseluruhan</td>${line([grand.plan, grand.actual])}</tr></tfoot>` : ""}
    </table></div></div>
    ${hidden ? `<p class="small">${hidden} aplikasi tanpa rencana & aktual tidak ditampilkan. Pilih di filter Aplikasi untuk melihatnya.</p>` : ""}`;
}

// ───────────── 04 Evaluasi akhir bulan ─────────────
function evaluationNotes(r) {
  const notes = [];
  const { plan, actual } = r.total;
  if (!plan) notes.push(["Belum ada rencana", "Isi rencana harian di menu Rencana Bulanan agar capaian bisa dievaluasi."]);
  else if (gap(plan, actual)) notes.push([`${gap(plan, actual)} konten belum selesai`, `Masih ada ${gap(plan, actual)} konten dari total rencana ${plan} yang belum mencapai skrip ready.`]);
  else notes.push(["Semua rencana tercapai", `Aktual ${actual} konten dari rencana ${plan}. Pertahankan ritme ini bulan depan.`]);
  const byType = TYPES.map((t) => {
    const s = r.apps.reduce((acc, a) => ({ plan: acc.plan + r.by[a.id][t].plan, actual: acc.actual + r.by[a.id][t].actual }), { plan: 0, actual: 0 });
    return { t, g: gap(s.plan, s.actual) };
  }).sort((a, b) => b.g - a.g);
  if (byType[0].g > 0) notes.push([`${typeLabel(byType[0].t)} perlu diprioritaskan`, `Jenis konten ${typeLabel(byType[0].t)} memiliki selisih paling besar (${byType[0].g}); jadikan fokus utama bulan berikutnya.`]);
  const behind = r.apps.map((a) => ({ a, ...r.appTotal(a.id) })).filter((x) => x.plan && x.actual < x.plan).sort((x, y) => x.actual / x.plan - y.actual / y.plan)[0];
  if (behind) notes.push([`${behind.a.label} paling tertinggal`, `Pencapaian ${pct(behind.actual, behind.plan)}% (${behind.actual} dari ${behind.plan} konten).`]);
  if (r.underDays.length) notes.push([`${r.underDays.length} hari di bawah rencana`, "Cek tanggal-tanggalnya di menu Rencana Bulanan (titik oranye)."]);
  if (r.selfEdit) notes.push([`${r.selfEdit} rencana edit mandiri`, "Rencana bertanda warna dikerjakan secara mandiri."]);
  return notes;
}

function evalView(r) {
  const apps = r.apps.filter((a) => r.appTotal(a.id).plan || r.appTotal(a.id).actual);
  const max = Math.max(1, ...apps.map((a) => Math.max(r.appTotal(a.id).plan, r.appTotal(a.id).actual)));
  const step = Math.max(1, Math.ceil(max / 4));
  const top = step * 4;
  const chart = apps.length
    ? `<div class="chart"><div class="y-axis">${[4, 3, 2, 1, 0].map((i) => `<span>${i * step}</span>`).join("")}</div>
        <div class="bars">${apps.map((a) => {
          const t = r.appTotal(a.id);
          return `<div class="bar-group"><div class="bar-pair">
            <div class="vbar v-plan" style="height:${(t.plan / top) * 100}%"><b>${t.plan}</b></div>
            <div class="vbar v-act" style="height:${(t.actual / top) * 100}%"><b>${t.actual}</b></div></div>
            <div class="bar-label">${esc(a.label)}</div></div>`;
        }).join("")}</div></div>`
    : '<div class="empty">Belum ada data bulan ini.</div>';
  return `<div class="plan-head"><h2>Evaluasi Akhir Bulan</h2>${monthTools({ live: false })}</div>
    ${statCards(r.total)}
    <div class="eval-grid">
      <section class="panel"><div class="chart-head"><h3>Perbandingan Rencana vs Aktual per Aplikasi</h3>
        <div class="chart-legend"><span><i class="sq v-plan"></i>Rencana</span><span><i class="sq v-act"></i>Aktual (skrip ready)</span></div></div>${chart}</section>
      <section class="panel"><h3 class="notes-title">${icon("calendar", 18)} Catatan Evaluasi</h3>
        <ul class="eval-notes">${evaluationNotes(r).map(([t, d]) => `<li><b>${esc(t)}</b><span>${esc(d)}</span></li>`).join("")}</ul></section>
    </div>
    <div class="eval-actions">
      ${canPlan() ? `<button class="btn accent" data-action="cal-copy">Salin Rencana ke Bulan Berikutnya</button>` : ""}
      <button class="btn" data-action="cal-export">${icon("download", 16)} Ekspor Laporan</button>
    </div>`;
}

// ───────────── halaman ─────────────
export async function renderCalendar(root) {
  const prevWrap = root.querySelector("#allWrap");
  tableScroll = prevWrap ? { month, left: prevWrap.scrollLeft, top: prevWrap.scrollTop } : null;
  month ||= state.today.slice(0, 7);
  data = await api("GET", `/api/calendar?month=${month}`);
  const r = compute();
  const content = { summary: summaryView, plan: planView, actual: actualView, eval: evalView }[view](r);
  root.innerHTML = `<div class="plan-shell">
    <nav class="plan-nav" aria-label="Alur perencanaan">${VIEWS.map(([k, label, ic], i) => `<button class="${k === view ? "active" : ""}" data-action="cal-view" data-view="${k}" ${k === view ? 'aria-current="page"' : ""}>
      <span class="step">${String(i + 1).padStart(2, "0")}</span>${icon(ic, 17)}<span>${label}</span></button>`).join("")}</nav>
    <div class="plan-main">${content}</div></div>`;
  const wrap = root.querySelector("#allWrap");
  if (wrap) {
    if (tableScroll && tableScroll.month === month) {
      wrap.scrollLeft = tableScroll.left;
      wrap.scrollTop = tableScroll.top;
    } else {
      const th = wrap.querySelector(`th[data-day="${state.today}"]`);
      const first = wrap.querySelector("thead th.sc");
      // Hari ini tampil sebagai kolom ketiga setelah kolom Aplikasi/jenis.
      if (th && first) wrap.scrollLeft = Math.max(0, th.getBoundingClientRect().left - wrap.getBoundingClientRect().left - first.offsetWidth - th.offsetWidth * 2);
    }
  }
}
let tableScroll = null; // posisi geser tabel dipertahankan saat data diperbarui

function exportCsv() {
  const r = compute();
  const cell = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [[`Laporan rencana vs aktual · ${monthLabel(month)}`], [], ["Aplikasi", "Jenis konten", "Rencana", "Aktual (skrip ready)", "Selisih", "Pencapaian"]];
  for (const a of r.apps) {
    for (const t of TYPES) {
      const { plan, actual } = r.by[a.id][t];
      if (plan || actual) lines.push([a.label, typeLabel(t), plan, actual, gap(plan, actual), pctText(pct(actual, plan))]);
    }
  }
  lines.push(["Total", "", r.total.plan, r.total.actual, gap(r.total.plan, r.total.actual), pctText(pct(r.total.actual, r.total.plan))]);
  lines.push([], ["Harian"], ["Tanggal", "Aplikasi", "Jenis konten", "Rencana", "Aktual (skrip ready)"]);
  const ids = new Set(r.apps.map((a) => a.id));
  const label = Object.fromEntries(r.apps.map((a) => [a.id, a.label]));
  const daily = new Map();
  for (const p of data.plans) if (ids.has(p.app) && p.amount != null) daily.set(key(p.app, p.type, p.date), { ...daily.get(key(p.app, p.type, p.date)), plan: p.amount });
  for (const [k, n] of Object.entries(data.actuals)) if (ids.has(JSON.parse(k)[0])) daily.set(k, { ...daily.get(k), actual: n });
  [...daily.entries()]
    .map(([k, v]) => [...JSON.parse(k), v])
    .sort((x, y) => x[2].localeCompare(y[2]) || label[x[0]].localeCompare(label[y[0]]))
    .forEach(([app, type, date, v]) => lines.push([date, label[app], typeLabel(type), v.plan ?? "", v.actual ?? 0]));
  const csv = "﻿" + lines.map((l) => l.map(cell).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `laporan-konten-${month}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

// ───────────── interaksi ─────────────
let pop = null;
const closePop = () => {
  pop?.remove();
  pop = null;
};

async function savePlan(body) {
  try {
    await api("PUT", "/api/calendar/plan", body);
  } catch (e) {
    toast(errorText(e));
  }
  changed();
}

delegate(document.body, "change", {
  plan: (el) => {
    const v = el.value.trim();
    if (v !== "" && !/^\d+$/.test(v)) {
      toast("Isi jumlah berupa bilangan bulat mulai dari 0.");
      return changed();
    }
    savePlan({ app: el.dataset.app, type: el.dataset.type, date: el.dataset.date, amount: v === "" ? null : Number(v) });
  },
  "cal-month": (el) => {
    month = el.value || state.today.slice(0, 7);
    changed();
  },
  "plan-app": (el) => {
    planApp = el.value;
    changed();
  },
  "flt-app": (el) => {
    fltApp = el.value;
    changed();
  },
  "flt-type": (el) => {
    fltType = el.value;
    changed();
  },
  "tbl-empty": (el) => {
    showEmpty = el.checked;
    changed();
  },
});

delegate(document.body, "click", {
  "cal-view": (el) => {
    view = el.dataset.view;
    changed();
  },
  "cal-open": (el) => {
    planApp = el.dataset.app;
    if (el.dataset.type) planType = el.dataset.type;
    view = "plan";
    changed();
  },
  "plan-mode": (el) => {
    planMode = el.dataset.mode;
    changed();
  },
  "tbl-type": (el) => {
    fltType = el.dataset.type;
    changed();
  },
  "plan-type": (el) => {
    planType = el.dataset.type;
    changed();
  },
  "cal-shift": (el) => {
    const [y, m] = month.split("-").map(Number);
    month = new Date(Date.UTC(y, m - 1 + Number(el.dataset.delta), 1)).toISOString().slice(0, 7);
    changed();
  },
  "cal-now": () => {
    month = state.today.slice(0, 7);
    changed();
  },
  "cal-export": () => exportCsv(),
  "cal-copy": async () => {
    const [y, m] = month.split("-").map(Number);
    const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
    if (!confirm(`Salin rencana ${monthLabel(month)} ke ${monthLabel(next)}? Rencana yang sudah ada di ${monthLabel(next)} tidak ditimpa.`)) return;
    try {
      const res = await api("POST", "/api/calendar/copy-next", { month });
      toast(`${res.copied} rencana disalin ke ${monthLabel(res.month)}${res.skipped ? ` · ${res.skipped} dilewati` : ""}`, {
        action: { label: "Buka", run: () => { month = res.month; view = "plan"; changed(); } },
      });
    } catch (e) {
      toast(errorText(e), { error: true });
    }
  },
  "plan-color": (el, e) => {
    e.stopPropagation();
    closePop();
    const { app, type, date } = el.dataset;
    pop = document.createElement("div");
    pop.className = "color-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Warna rencana");
    pop.innerHTML = `<div class="small">Tandai edit mandiri</div><div class="swatches">${COLORS.map(([c, l]) => `<button class="c-${c}" title="${l}" aria-label="${l}" data-color="${c}"></button>`).join("")}</div><button class="btn mini" data-color="">Hapus warna</button>`;
    pop.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const b = ev.target.closest("[data-color]");
      if (!b) return;
      closePop();
      savePlan({ app, type, date, color: b.dataset.color || null });
    });
    document.body.appendChild(pop);
    const r = el.getBoundingClientRect();
    pop.style.left = `${Math.max(8, Math.min(r.left, innerWidth - 220))}px`;
    pop.style.top = `${r.bottom + 120 > innerHeight ? Math.max(8, r.top - 115) : r.bottom + 6}px`;
  },
});
document.addEventListener("click", (e) => {
  if (pop && !pop.contains(e.target)) closePop();
});
document.addEventListener("keydown", (e) => e.key === "Escape" && closePop());
