// Performa & Target: scorecard KPI per staff. Leader mengatur metrik, target, dan tier tiap staff langsung di tabelnya.
import { $, api, prioSem, contentNo, delegate, errorText, esc, fmtDate, isAdmin, isLeader, optLabel, state, toast, typeLabel } from "./core.js";

let role = "";
let month = "";
let people = [];
let edit = null; // { userId, cfg } — scorecard staff yang sedang diedit

const SOURCES = [
  ["sla", "Otomatis · % selesai tepat waktu"],
  ["done:all", "Otomatis · jumlah konten selesai (semua jenis)"],
  ["done:Video", "Otomatis · jumlah Video selesai"],
  ["done:Carousel", "Otomatis · jumlah Carrousel selesai"],
  ["done:Singlepost", "Otomatis · jumlah Singlepost selesai"],
  ["manual", "Manual · diisi Leader"],
];
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const monthName = (m) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
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
  const pct = r.target && actual != null ? (actual / r.target) * 100 : 0;
  return { ...r, unit, actual, pct, score: (pct * r.weight) / 100 };
}

function scorecard(p, values) {
  const cfg = p.scorecard;
  const tiers = cfg.tiers;
  const ms = cfg.rows.map((r) => metric(r, p, values)).map((m) => ({ ...m, tier: tierOf(tiers, m.pct) }));
  const total = ms.reduce((n, m) => n + m.score, 0);
  // Kolom divisi (mis. CREATIVE) hanya untuk Admin, yang melihat staff semua tim.
  const division = isAdmin();
  const rows = ms.map((m, i) => {
    // Perspektif yang sama berturut-turut digabung (rowspan), seperti di spreadsheet.
    const first = i === 0 || ms[i - 1].perspective !== m.perspective;
    let span = 1;
    while (first && ms[i + span]?.perspective === m.perspective) span++;
    const actual = m.source === "manual" && isLeader()
      ? `<input class="sc-input" type="number" min="0" step="any" value="${m.actual ?? ""}" placeholder="isi" aria-label="Achievement ${esc(m.label)}" data-onchange="sc-value" data-user="${p.user.id}" data-row="${esc(m.id)}">${m.unit}`
      : m.actual == null ? "—" : `${numText(m.actual)}${m.unit}`;
    return `<tr>
      ${i === 0 && division ? `<th class="sc-team" rowspan="${ms.length + 1}" scope="rowgroup">${esc(cfg.team)}</th>` : ""}
      ${first ? `<td class="sc-persp" rowspan="${span}">${esc(m.perspective)}</td>` : ""}
      <td>${esc(m.label)}</td><td class="num">${numText(m.weight)}%</td><td class="num">${m.target ? `${numText(m.target)}${m.unit}` : "—"}</td>
      <td class="num">${actual}</td><td class="num">${pctText(m.pct)}</td><td class="num">${pctText(m.score)}</td>
      ${tiers.map((t) => `<td class="sc-tier${t === m.tier ? " is-hit" : ""}">${esc(t.label)}</td>`).join("")}
      <td class="sc-final">${numText(m.tier.value)}</td></tr>`;
  }).join("");
  return `<div class="tablewrap sc-wrap"><table class="scorecard">
    <thead><tr>${division ? '<th rowspan="2"></th>' : ""}<th rowspan="2" class="left">Perspektif</th><th rowspan="2" class="left">Metric indicator</th><th rowspan="2" class="num">Bobot (%)</th><th rowspan="2" class="num">Target</th><th rowspan="2" class="num">Achievement</th><th rowspan="2" class="num">% Pencapaian</th><th rowspan="2" class="num">Score</th><th colspan="${tiers.length}" class="sc-group">Scoring tier</th><th rowspan="2" class="sc-final-h">Hasil akhir</th></tr>
      <tr>${tiers.map((t) => `<th class="sc-tier-h">${numText(t.value)}</th>`).join("")}</tr></thead>
    <tbody>${rows}<tr class="sc-total"><td>Total</td><td></td><td class="num">${numText(ms.reduce((n, m) => n + m.weight, 0))}%</td><td colspan="3"></td><td class="num">${pctText(total)}</td><td colspan="${tiers.length + 1}"></td></tr></tbody>
  </table></div>`;
}

// ───────────── edit KPI staff (Leader), langsung di kartu staff ─────────────
function editorHtml(p) {
  const cfg = edit.cfg;
  const total = cfg.rows.reduce((n, r) => n + (Number(r.weight) || 0), 0);
  const ok = Math.abs(total - 100) < 0.001;
  return `<div class="sc-edit">
      <p class="sc-edit-note">Berlaku untuk <b>${esc(p.user.name)}</b> mulai <b>${monthName(month)}</b> dan bulan-bulan berikutnya sampai diubah lagi. Bulan sebelumnya tidak berubah.</p>
      ${isAdmin() ? `<div class="field" style="max-width:280px"><label for="scTeam">Nama divisi (kolom kiri)</label><input id="scTeam" maxlength="40" value="${esc(cfg.team)}"></div>` : ""}
      <h3>Metrik & target</h3>
      <div class="tablewrap sc-edit-wrap"><table><thead><tr><th>Perspektif</th><th>Metric indicator</th><th>Sumber achievement</th><th>Bobot (%)</th><th>Target</th><th>Satuan</th><th></th></tr></thead><tbody>
        ${cfg.rows.map((r, i) => `<tr data-i="${i}">
          <td><input data-f="perspective" maxlength="80" value="${esc(r.perspective)}" aria-label="Perspektif"></td>
          <td><input data-f="label" maxlength="120" value="${esc(r.label)}" aria-label="Nama metrik"></td>
          <td><select data-f="source" data-onchange="sc-source" aria-label="Sumber">${SOURCES.map(([v, l]) => `<option value="${v}" ${v === r.source ? "selected" : ""}>${l}</option>`).join("")}</select></td>
          <td><input data-f="weight" type="number" min="0" max="100" step="any" value="${r.weight}" data-oninput="sc-weight" aria-label="Bobot"></td>
          <td><input data-f="target" type="number" min="0" step="any" value="${r.target ?? ""}" placeholder="isi target" aria-label="Target"></td>
          <td>${r.source === "manual" ? `<select data-f="unit" aria-label="Satuan"><option value="" ${r.unit ? "" : "selected"}>Angka</option><option value="%" ${r.unit === "%" ? "selected" : ""}>%</option></select>` : `<span class="small">${r.source === "sla" ? "%" : "Angka"}</span>`}</td>
          <td class="sc-row-tools"><button type="button" class="btn mini" data-action="sc-move" data-i="${i}" data-d="-1" ${i ? "" : "disabled"} aria-label="Naikkan">↑</button><button type="button" class="btn mini" data-action="sc-move" data-i="${i}" data-d="1" ${i < cfg.rows.length - 1 ? "" : "disabled"} aria-label="Turunkan">↓</button><button type="button" class="btn mini danger" data-action="sc-del" data-i="${i}" ${cfg.rows.length > 1 ? "" : "disabled"}>Hapus</button></td>
        </tr>`).join("")}
      </tbody></table></div>
      <div class="sc-edit-foot"><button type="button" class="btn" data-action="sc-add">+ Tambah metrik</button><span id="scTotal" class="sc-weight ${ok ? "" : "bad"}">Total bobot: ${numText(total)}%${ok ? "" : " — harus 100%"}</span></div>
      <h3>Scoring tier</h3>
      <p class="small">Hasil akhir = tier pertama yang batas minimal % pencapaiannya tercapai. Tier dengan batas terendah otomatis menampung semua di bawahnya.</p>
      <div class="tablewrap sc-edit-wrap"><table><thead><tr><th>Nilai (hasil akhir)</th><th>Minimal % pencapaian</th><th>Label di tabel</th><th></th></tr></thead><tbody>
        ${cfg.tiers.map((t, i) => `<tr data-t="${i}">
          <td><input data-f="value" type="number" step="any" value="${t.value}" aria-label="Nilai tier"></td>
          <td><input data-f="min" type="number" min="0" step="any" value="${t.min}" aria-label="Minimal pencapaian"></td>
          <td><input data-f="label" maxlength="30" value="${esc(t.label)}" aria-label="Label tier"></td>
          <td><button type="button" class="btn mini danger" data-action="sc-tier-del" data-i="${i}" ${cfg.tiers.length > 2 ? "" : "disabled"}>Hapus</button></td>
        </tr>`).join("")}
      </tbody></table></div>
      <div class="sc-edit-foot"><button type="button" class="btn" data-action="sc-tier-add">+ Tambah tier</button></div>
      <div class="sc-edit-actions">
        ${p.scorecardFrom === month ? `<button type="button" class="btn" data-action="sc-reset">Hapus pengaturan ${esc(monthName(month))}</button>` : ""}
        <span class="grow"></span>
        <button type="button" class="btn" data-action="sc-cancel">Batal</button>
        <button type="button" class="btn primary" data-action="sc-save">Simpan KPI</button>
      </div>
    </div>`;
}

/** Baca isian form edit ke `edit.cfg` (sebelum menggambar ulang atau menyimpan). */
function readEditor() {
  const box = document.querySelector(".sc-edit");
  // Setelah baris ditambah/dihapus/dipindah, form di layar sudah tidak sesuai urutan `edit` sampai digambar ulang.
  if (!box || !edit || edit.stale) return;
  edit.cfg.team = $("scTeam")?.value ?? edit.cfg.team;
  box.querySelectorAll("tr[data-i]").forEach((tr) => {
    const r = edit.cfg.rows[Number(tr.dataset.i)];
    tr.querySelectorAll("[data-f]").forEach((el) => {
      r[el.dataset.f] = el.dataset.f === "target" ? (el.value === "" ? null : el.value) : el.value;
    });
  });
  box.querySelectorAll("tr[data-t]").forEach((tr) => {
    const t = edit.cfg.tiers[Number(tr.dataset.t)];
    tr.querySelectorAll("[data-f]").forEach((el) => (t[el.dataset.f] = el.value));
  });
}
const redraw = () => {
  if (edit) edit.stale = true;
  window.dispatchEvent(new Event("cs:changed"));
};

function personHtml(p, values) {
  const initials = p.user.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  const days = state.deadlines[role];
  const verb = role === "Marketing" ? "skrip" : "hasil";
  const editing = edit?.userId === p.user.id;
  const from = p.scorecardFrom ? `KPI berlaku sejak ${monthName(p.scorecardFrom)}` : "KPI bawaan (belum diatur)";
  return `<article class="person" id="person-${p.user.id}"><div class="person-head"><div class="person-id"><div class="avatar">${esc(initials)}</div><div><b>${esc(p.user.name)}</b><div class="small">${esc(from)}</div></div></div>
      <div class="person-tools"><span class="person-meta small">Tepat waktu = ${verb} selesai paling lambat H-${days} · Telat <b style="color:${p.late ? "#B71C1C" : "inherit"}">${p.late}</b></span>
      ${isLeader() && !editing ? `<button class="btn" data-action="sc-edit" data-user="${p.user.id}">Edit KPI</button>` : ""}</div></div>
    ${editing ? editorHtml(p) : scorecard(p, values)}
    <details><summary>Rincian konten & ketepatan waktu</summary><div style="overflow:auto"><table><thead><tr><th>Konten</th><th>Jenis</th><th>Upload</th><th>Batas selesai</th><th>Selesai</th><th>Status</th></tr></thead>
    <tbody>${p.items.map((i) => `<tr><td><button class="number" data-action="detail" data-id="${i.id}">${esc(contentNo(i))}</button> ${esc(i.title)}${prioSem(i.priority) !== "Reguler" ? ` <span class="badge b-prio">${esc(optLabel(i.priority) || i.priority)}</span>` : ""}</td><td>${typeLabel(i.type)}</td><td>${fmtDate(i.upload_date)}</td><td>${fmtDate(i.deadline)}</td><td>${i.done ? fmtDate(i.done) : "Belum selesai"}</td><td>${esc(i.status)}</td></tr>`).join("") || '<tr><td colspan="6" class="small">Belum ada konten.</td></tr>'}</tbody></table></div></details></article>`;
}

export async function renderTeam(root) {
  readEditor(); // isian yang sedang diedit tidak hilang saat halaman digambar ulang
  month ||= state.today.slice(0, 7);
  role = state.me.role; // Leader Marketing → tim Marketing, Leader Creative → tim Creative
  const data = await api("GET", `/api/team?month=${month}`);
  people = data.people.filter((p) => p.user.role === role);
  if (edit && !people.some((p) => p.user.id === edit.userId)) edit = null;
  const values = new Map(data.values.map((v) => [`${v.user_id}:${v.row_id}`, v.value]));
  if (edit) edit.stale = false;
  root.innerHTML = `<div class="filters">
      ${isLeader() ? `<div class="field" style="max-width:220px"><label>Tim</label><div class="team-label">Tim ${esc(role)}</div></div>` : ""}
      <div class="field" style="max-width:200px"><label for="teamMonth">Bulan upload</label><input id="teamMonth" type="month" value="${month}" data-onchange="team-month"></div>
    </div>
    ${people.length ? people.map((p) => personHtml(p, values)).join("") : '<div class="panel" style="margin-top:18px">Belum ada anggota untuk tim ini.</div>'}`;
}

delegate(document.body, "click", {
  "sc-edit": (el) => {
    readEditor();
    if (edit && !confirm("KPI staff lain sedang diedit dan belum disimpan. Tinggalkan perubahan itu?")) return;
    const p = people.find((x) => x.user.id === Number(el.dataset.user));
    edit = { userId: p.user.id, cfg: structuredClone(p.scorecard) };
    redraw();
  },
  "sc-cancel": () => {
    edit = null;
    redraw();
  },
  "sc-add": () => {
    readEditor();
    edit.cfg.rows.push({ id: `m${Date.now().toString(36)}`, perspective: edit.cfg.rows.at(-1)?.perspective ?? "", label: "", weight: 0, source: "manual", target: null, unit: "" });
    redraw();
  },
  "sc-del": (el) => {
    readEditor();
    edit.cfg.rows.splice(Number(el.dataset.i), 1);
    redraw();
  },
  "sc-move": (el) => {
    readEditor();
    const i = Number(el.dataset.i);
    const j = i + Number(el.dataset.d);
    [edit.cfg.rows[i], edit.cfg.rows[j]] = [edit.cfg.rows[j], edit.cfg.rows[i]];
    redraw();
  },
  "sc-tier-add": () => {
    readEditor();
    edit.cfg.tiers.push({ value: Number(edit.cfg.tiers.at(-1)?.value ?? 1) - 1, min: 0, label: "" });
    redraw();
  },
  "sc-tier-del": (el) => {
    readEditor();
    edit.cfg.tiers.splice(Number(el.dataset.i), 1);
    redraw();
  },
  "sc-reset": async () => {
    if (!confirm(`Hapus pengaturan KPI ${monthName(month)}? Staff ini kembali memakai KPI bulan sebelumnya (atau bawaan).`)) return;
    try {
      await api("PUT", "/api/scorecard", { user_id: edit.userId, month, reset: true });
      edit = null;
      toast("Pengaturan KPI bulan ini dihapus");
    } catch (e) {
      toast(errorText(e), { error: true });
    }
    redraw();
  },
  "sc-save": async (el) => {
    readEditor();
    el.disabled = true;
    try {
      await api("PUT", "/api/scorecard", { user_id: edit.userId, month, config: edit.cfg });
      edit = null;
      toast("KPI disimpan");
      redraw();
    } catch (e) {
      toast(errorText(e), { error: true });
      el.disabled = false;
    }
  },
});

delegate(document.body, "input", {
  "sc-weight": () => {
    const total = [...document.querySelectorAll('.sc-edit [data-f="weight"]')].reduce((n, el) => n + (Number(el.value) || 0), 0);
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
    if (edit && !confirm("Perubahan KPI yang belum disimpan akan dibuang. Lanjut?")) {
      el.value = month;
      return;
    }
    edit = null;
    month = el.value || state.today.slice(0, 7);
    window.dispatchEvent(new Event("cs:changed"));
  },
});
