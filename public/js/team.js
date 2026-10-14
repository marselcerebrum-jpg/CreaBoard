// Performa & Target per staff (dihitung server) + scorecard KPI dan Target KPI yang diatur Leader.
import { $, addDays, api, prioSem, closeModal, contentNo, delegate, errorText, esc, fmtDate, isLeader, openModal, optionsFor, optLabel, state, toast, TYPES, typeLabel } from "./core.js";

let role = "";
let month = "";
let config = null; // scorecard tim (dari server)
let edit = null; // salinan yang sedang diubah di jendela "Atur scorecard"

const SOURCES = [
  ["sla", "Otomatis · % selesai tepat waktu"],
  ["done:all", "Otomatis · jumlah konten selesai (semua jenis)"],
  ["done:Video", "Otomatis · jumlah Video selesai"],
  ["done:Carousel", "Otomatis · jumlah Carrousel selesai"],
  ["done:Singlepost", "Otomatis · jumlah Singlepost selesai"],
  ["manual", "Manual · diisi Leader per staff"],
];
const fmt = (n, digits = 2) => n.toLocaleString("id-ID", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const pctText = (n) => `${fmt(n)}%`;
const numText = (n) => (Number.isInteger(n) ? String(n) : fmt(n));

/** Tier = tingkat pertama (urut batas minimal terbesar) yang batasnya tercapai. */
const tierOf = (tiers, pct) => tiers.find((t) => Math.round(pct * 100) / 100 >= t.min) ?? tiers[tiers.length - 1];

function metric(r, p, values) {
  const type = r.source.startsWith("done:") ? r.source.slice(5) : null;
  const unit = r.source === "sla" ? "%" : r.unit;
  const actual = r.source === "sla" ? p.onTimeRate
    : r.source === "manual" ? values.get(`${p.user.id}:${r.id}`) ?? null
    : type === "all" ? p.done : p.byType[type]?.done ?? 0;
  const target = r.target ?? (type === "all" ? p.target : p.byType[type]?.target ?? 0);
  const pct = target && actual != null ? (actual / target) * 100 : 0;
  return { ...r, unit, actual, target, pct, score: (pct * r.weight) / 100 };
}

function scorecard(p, values) {
  const tiers = config.tiers;
  const ms = config.rows.map((r) => ({ ...metric(r, p, values), tier: null })).map((m) => ({ ...m, tier: tierOf(tiers, m.pct) }));
  const total = ms.reduce((n, m) => n + m.score, 0);
  const manual = isLeader();
  const rows = ms.map((m, i) => {
    // Perspektif yang sama berturut-turut digabung (rowspan), seperti di spreadsheet.
    const first = i === 0 || ms[i - 1].perspective !== m.perspective;
    let span = 1;
    while (first && ms[i + span]?.perspective === m.perspective) span++;
    const actual = m.source === "manual" && manual
      ? `<input class="sc-input" type="number" min="0" step="any" value="${m.actual ?? ""}" placeholder="isi" aria-label="Achievement ${esc(m.label)}" data-onchange="sc-value" data-user="${p.user.id}" data-row="${esc(m.id)}">${m.unit}`
      : m.actual == null ? "—" : `${numText(m.actual)}${m.unit}`;
    return `<tr>
      ${i === 0 ? `<th class="sc-team" rowspan="${ms.length + 1}" scope="rowgroup">${esc(config.team)}</th>` : ""}
      ${first ? `<td class="sc-persp" rowspan="${span}">${esc(m.perspective)}</td>` : ""}
      <td>${esc(m.label)}</td><td class="num">${numText(m.weight)}%</td><td class="num">${m.target ? `${numText(m.target)}${m.unit}` : "—"}</td>
      <td class="num">${actual}</td><td class="num">${pctText(m.pct)}</td><td class="num">${pctText(m.score)}</td>
      ${tiers.map((t) => `<td class="sc-tier${t === m.tier ? " is-hit" : ""}">${esc(t.label)}</td>`).join("")}
      <td class="sc-final">${numText(m.tier.value)}</td></tr>`;
  }).join("");
  return `<div class="tablewrap sc-wrap"><table class="scorecard">
    <thead><tr><th rowspan="2"></th><th rowspan="2">Perspektif</th><th rowspan="2">Metric indicator</th><th rowspan="2" class="num">Bobot (%)</th><th rowspan="2" class="num">Target</th><th rowspan="2" class="num">Achievement</th><th rowspan="2" class="num">% Pencapaian</th><th rowspan="2" class="num">Score</th><th colspan="${tiers.length}" class="sc-group">Scoring tier</th><th rowspan="2" class="sc-final-h">Hasil akhir</th></tr>
      <tr>${tiers.map((t) => `<th class="sc-tier-h">${numText(t.value)}</th>`).join("")}</tr></thead>
    <tbody>${rows}<tr class="sc-total"><td>Total</td><td></td><td class="num">${numText(ms.reduce((n, m) => n + m.weight, 0))}%</td><td colspan="3"></td><td class="num">${pctText(total)}</td><td colspan="${tiers.length + 1}"></td></tr></tbody>
  </table></div>`;
}

// ───────────── jendela "Atur scorecard" (Leader) ─────────────
function editorHtml() {
  const total = edit.rows.reduce((n, r) => n + (Number(r.weight) || 0), 0);
  const ok = Math.abs(total - 100) < 0.001;
  return `<div class="modalhead"><div><div class="eyebrow">Performa & Target · Tim ${esc(role)}</div><h2 id="modalTitle">Atur scorecard</h2></div><button class="close" aria-label="Tutup" data-action="close-modal">×</button></div>
    <div class="modalbody sc-edit">
      <div class="field" style="max-width:320px"><label for="scTeam">Nama di kolom kiri</label><input id="scTeam" maxlength="40" value="${esc(edit.team)}"></div>
      <h3>Metrik</h3>
      <p class="small">Target kosong pada metrik jumlah konten = memakai Target KPI staff bulan itu. Metrik "Manual" diisi Leader langsung di kolom Achievement.</p>
      <div class="tablewrap sc-edit-wrap"><table><thead><tr><th>Perspektif</th><th>Metric indicator</th><th>Sumber achievement</th><th>Bobot (%)</th><th>Target</th><th>Satuan</th><th></th></tr></thead><tbody>
        ${edit.rows.map((r, i) => `<tr data-i="${i}">
          <td><input data-f="perspective" maxlength="80" value="${esc(r.perspective)}" aria-label="Perspektif"></td>
          <td><input data-f="label" maxlength="120" value="${esc(r.label)}" aria-label="Nama metrik" required></td>
          <td><select data-f="source" data-onchange="sc-source" aria-label="Sumber">${SOURCES.map(([v, l]) => `<option value="${v}" ${v === r.source ? "selected" : ""}>${l}</option>`).join("")}</select></td>
          <td><input data-f="weight" type="number" min="0" max="100" step="any" value="${r.weight}" data-oninput="sc-weight" aria-label="Bobot"></td>
          <td><input data-f="target" type="number" min="0" step="any" value="${r.target ?? ""}" placeholder="${r.source.startsWith("done:") ? "Target KPI" : "wajib"}" aria-label="Target"></td>
          <td>${r.source === "manual" ? `<select data-f="unit" aria-label="Satuan"><option value="" ${r.unit ? "" : "selected"}>Angka</option><option value="%" ${r.unit === "%" ? "selected" : ""}>%</option></select>` : `<span class="small">${r.source === "sla" ? "%" : "Angka"}</span>`}</td>
          <td class="sc-row-tools"><button type="button" class="btn mini" data-action="sc-move" data-i="${i}" data-d="-1" ${i ? "" : "disabled"} aria-label="Naikkan">↑</button><button type="button" class="btn mini" data-action="sc-move" data-i="${i}" data-d="1" ${i < edit.rows.length - 1 ? "" : "disabled"} aria-label="Turunkan">↓</button><button type="button" class="btn mini danger" data-action="sc-del" data-i="${i}" ${edit.rows.length > 1 ? "" : "disabled"}>Hapus</button></td>
        </tr>`).join("")}
      </tbody></table></div>
      <div class="sc-edit-foot"><button type="button" class="btn" data-action="sc-add">+ Tambah metrik</button><span id="scTotal" class="sc-weight ${ok ? "" : "bad"}">Total bobot: ${numText(total)}%${ok ? "" : " — harus 100%"}</span></div>
      <h3>Scoring tier</h3>
      <p class="small">Hasil akhir = tier pertama yang batas minimal % pencapaiannya tercapai. Tier dengan batas terendah otomatis menampung semua di bawahnya.</p>
      <div class="tablewrap sc-edit-wrap"><table class="sc-tier-edit"><thead><tr><th>Nilai (hasil akhir)</th><th>Minimal % pencapaian</th><th>Label di tabel</th><th></th></tr></thead><tbody>
        ${edit.tiers.map((t, i) => `<tr data-t="${i}">
          <td><input data-f="value" type="number" step="any" value="${t.value}" aria-label="Nilai tier"></td>
          <td><input data-f="min" type="number" min="0" step="any" value="${t.min}" aria-label="Minimal pencapaian"></td>
          <td><input data-f="label" maxlength="30" value="${esc(t.label)}" aria-label="Label tier"></td>
          <td><button type="button" class="btn mini danger" data-action="sc-tier-del" data-i="${i}" ${edit.tiers.length > 2 ? "" : "disabled"}>Hapus</button></td>
        </tr>`).join("")}
      </tbody></table></div>
      <div class="sc-edit-foot"><button type="button" class="btn" data-action="sc-tier-add">+ Tambah tier</button></div>
    </div>
    <div class="foot"><div class="left"><button class="btn" data-action="sc-reset">Kembalikan bawaan</button></div>
      <button class="btn" data-action="close-modal">Batal</button><button class="btn primary" data-action="sc-save">Simpan scorecard</button></div>`;
}

/** Baca isian jendela ke `edit` (dipanggil sebelum menggambar ulang atau menyimpan). */
function readEditor() {
  const modal = $("modal");
  edit.team = $("scTeam")?.value ?? edit.team;
  modal.querySelectorAll("tr[data-i]").forEach((tr) => {
    const r = edit.rows[Number(tr.dataset.i)];
    tr.querySelectorAll("[data-f]").forEach((el) => {
      r[el.dataset.f] = el.dataset.f === "target" ? (el.value === "" ? null : el.value) : el.value;
    });
  });
  modal.querySelectorAll("tr[data-t]").forEach((tr) => {
    const t = edit.tiers[Number(tr.dataset.t)];
    tr.querySelectorAll("[data-f]").forEach((el) => (t[el.dataset.f] = el.value));
  });
}
const redraw = () => openModal(editorHtml(), { wide: true, keepScroll: true });

/** Panel Target KPI: Leader mengatur target staff timnya untuk bulan yang dipilih. */
function kpiPanel(list) {
  const staff = state.users.filter((u) => u.active && u.position === "Staff" && u.role === state.me.role);
  return `<section class="panel kpi-panel">
    <div class="kpi-panel-head"><h2>Target KPI</h2><span class="small">Target per staff tim ${esc(state.me.role)} · bulan upload yang dipilih</span></div>
    <form id="kpiForm" class="kpi-form">
      <div class="field"><label for="kStaff">Staff</label><select id="kStaff" required>${staff.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join("") || '<option value="">Belum ada staff</option>'}</select></div>
      <div class="field"><label for="kApp">Apps</label><select id="kApp">${optionsFor("app").map((o) => `<option value="${esc(o.id)}">${esc(o.label)}</option>`).join("")}</select></div>
      <div class="field"><label for="kType">Jenis konten</label><select id="kType">${TYPES.map((t) => `<option value="${t}">${typeLabel(t)}</option>`).join("")}</select></div>
      <div class="field"><label for="kAmount">Target</label><input id="kAmount" type="number" min="1" step="1" value="3" required></div>
      <div class="field"><label for="kUpload">Tanggal upload</label><input id="kUpload" type="date" value="${addDays(state.today, 3)}" required></div>
      <div class="field"><label for="kWork">Tanggal pengerjaan (maks. H-${state.deadlines[state.me.role] ?? 3})</label><input id="kWork" type="date" value="${state.today}" required></div>
      <div class="field kpi-submit"><button class="btn primary" ${staff.length ? "" : "disabled"}>Simpan target</button></div>
    </form>
    <div class="tablewrap kpi-list"><table><thead><tr><th>Staff</th><th>Apps</th><th>Jenis</th><th>Pengerjaan</th><th>Upload</th><th>Target</th><th></th></tr></thead><tbody>
      ${list.map((k) => `<tr><td>${esc(k.user_name)}</td><td>${esc(optLabel(k.app))}</td><td>${typeLabel(k.type)}</td><td>${fmtDate(k.work_date)}</td><td>${fmtDate(k.upload_date)}</td><td><b>${k.amount}</b></td><td><button type="button" class="btn mini danger" data-action="kpi-delete" data-id="${k.id}">Hapus</button></td></tr>`).join("") || '<tr><td colspan="7" class="empty">Belum ada target untuk bulan ini.</td></tr>'}
    </tbody></table></div></section>`;
}

export async function renderTeam(root) {
  month ||= state.today.slice(0, 7);
  role = state.me.role; // Leader Marketing → tim Marketing, Leader Creative → tim Creative
  const [data, kpis] = await Promise.all([api("GET", `/api/team?month=${month}`), isLeader() ? api("GET", `/api/kpis?month=${month}`) : null]);
  const people = data.people.filter((p) => p.user.role === role);
  config = data.scorecard;
  const values = new Map(data.values.map((v) => [`${v.user_id}:${v.row_id}`, v.value]));
  const days = state.deadlines[role];
  const verb = role === "Marketing" ? "Skrip" : "Hasil";
  root.innerHTML = `<div class="filters">
      ${isLeader() ? `<div class="field" style="max-width:220px"><label>Tim</label><div class="team-label">Tim ${esc(role)}</div></div>` : ""}
      <div class="field" style="max-width:200px"><label for="teamMonth">Bulan upload</label><input id="teamMonth" type="month" value="${month}" data-onchange="team-month"></div>
      ${isLeader() ? '<div class="field sc-open"><button class="btn" data-action="sc-open">Atur scorecard</button></div>' : ""}
    </div>
    ${kpis ? kpiPanel(kpis) : ""}
    ${people.length ? people.map((p) => {
      const initials = p.user.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
      return `<article class="person"><div class="person-head"><div class="person-id"><div class="avatar">${esc(initials)}</div><b>${esc(p.user.name)}</b></div>
          <div class="person-meta small">Tepat waktu = ${verb.toLowerCase()} selesai paling lambat H-${days} · Sisa target ${p.remaining} · Telat <b style="color:${p.late ? "#B71C1C" : "inherit"}">${p.late}</b></div></div>
        ${scorecard(p, values)}
        <details><summary>Rincian konten & ketepatan waktu</summary><div style="overflow:auto"><table><thead><tr><th>Konten</th><th>Jenis</th><th>Upload</th><th>Batas selesai</th><th>Selesai</th><th>Status</th></tr></thead>
        <tbody>${p.items.map((i) => `<tr><td><button class="number" data-action="detail" data-id="${i.id}">${esc(contentNo(i))}</button> ${esc(i.title)}${prioSem(i.priority) !== "Reguler" ? ` <span class="badge b-prio">${esc(optLabel(i.priority) || i.priority)}</span>` : ""}</td><td>${typeLabel(i.type)}</td><td>${fmtDate(i.upload_date)}</td><td>${fmtDate(i.deadline)}</td><td>${i.done ? fmtDate(i.done) : "Belum selesai"}</td><td>${esc(i.status)}</td></tr>`).join("") || '<tr><td colspan="6" class="small">Belum ada konten.</td></tr>'}</tbody></table></div></details></article>`;
    }).join("") : '<div class="panel" style="margin-top:18px">Belum ada anggota untuk tim ini.</div>'}`;
  $("kpiForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("POST", "/api/kpis", { user_id: Number($("kStaff").value), app: $("kApp").value, type: $("kType").value, amount: Number($("kAmount").value), work_date: $("kWork").value, upload_date: $("kUpload").value });
      toast("Target KPI disimpan");
      window.dispatchEvent(new Event("cs:changed"));
    } catch (err) {
      toast(errorText(err), { error: true });
    }
  });
}

delegate(document.body, "click", {
  "sc-open": () => {
    edit = structuredClone(config);
    redraw();
  },
  "sc-add": () => {
    readEditor();
    edit.rows.push({ id: `m${Date.now().toString(36)}`, perspective: edit.rows.at(-1)?.perspective ?? "", label: "", weight: 0, source: "manual", target: null, unit: "" });
    redraw();
  },
  "sc-del": (el) => {
    readEditor();
    edit.rows.splice(Number(el.dataset.i), 1);
    redraw();
  },
  "sc-move": (el) => {
    readEditor();
    const i = Number(el.dataset.i);
    const j = i + Number(el.dataset.d);
    [edit.rows[i], edit.rows[j]] = [edit.rows[j], edit.rows[i]];
    redraw();
  },
  "sc-tier-add": () => {
    readEditor();
    const low = edit.tiers.at(-1);
    edit.tiers.push({ value: Number(low?.value ?? 1) - 1, min: 0, label: "" });
    redraw();
  },
  "sc-tier-del": (el) => {
    readEditor();
    edit.tiers.splice(Number(el.dataset.i), 1);
    redraw();
  },
  "sc-reset": async () => {
    if (!confirm("Kembalikan scorecard ke bawaan (SLA 30%, Video 40%, Carrousel 30%)? Nilai manual yang sudah diisi tetap tersimpan.")) return;
    try {
      await api("PUT", "/api/scorecard", { reset: true });
      closeModal();
      toast("Scorecard dikembalikan ke bawaan");
      window.dispatchEvent(new Event("cs:changed"));
    } catch (e) {
      toast(errorText(e), { error: true });
    }
  },
  "sc-save": async (el) => {
    readEditor();
    el.disabled = true;
    try {
      await api("PUT", "/api/scorecard", { config: edit });
      closeModal();
      toast("Scorecard disimpan");
      window.dispatchEvent(new Event("cs:changed"));
    } catch (e) {
      toast(errorText(e), { error: true });
      el.disabled = false;
    }
  },
  "kpi-delete": async (el) => {
    if (!confirm("Hapus target ini?")) return;
    try {
      await api("DELETE", `/api/kpis/${el.dataset.id}`, {});
      toast("Target dihapus");
    } catch (e) {
      toast(errorText(e), { error: true });
    }
    window.dispatchEvent(new Event("cs:changed"));
  },
});

delegate(document.body, "input", {
  "sc-weight": () => {
    const total = [...$("modal").querySelectorAll('[data-f="weight"]')].reduce((n, el) => n + (Number(el.value) || 0), 0);
    const ok = Math.abs(total - 100) < 0.001;
    $("scTotal").textContent = `Total bobot: ${numText(total)}%${ok ? "" : " — harus 100%"}`;
    $("scTotal").classList.toggle("bad", !ok);
  },
});

delegate(document.body, "change", {
  "sc-source": () => {
    readEditor();
    redraw();
  },
  "sc-value": async (el) => {
    try {
      await api("PUT", "/api/scorecard/value", { user_id: Number(el.dataset.user), month, row_id: el.dataset.row, value: el.value === "" ? null : Number(el.value) });
      toast("Achievement disimpan");
    } catch (e) {
      toast(errorText(e), { error: true });
    }
    window.dispatchEvent(new Event("cs:changed"));
  },
  "team-month": (el) => {
    month = el.value || state.today.slice(0, 7);
    window.dispatchEvent(new Event("cs:changed"));
  },
});
