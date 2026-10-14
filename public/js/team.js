// Performa & Target per staff (dihitung server) + pengaturan Target KPI (khusus Leader).
import { $, addDays, api, prioSem, contentNo, delegate, errorText, esc, fmtDate, isLeader, optionsFor, optLabel, state, toast, TYPES, typeLabel } from "./core.js";

let role = "";
let month = "";

// Scorecard KPI: bobot tetap, target konten dari Target KPI bulan ini, SLA = persentase selesai tepat waktu.
const SLA_TARGET = 95;
const TIERS = [[5, ">100%"], [4, "96–100%"], [3, "91–96%"], [2, "81–90%"], [1, "<80%"]];
const tierOf = (pct) => (pct > 100 ? 5 : pct >= 96 ? 4 : pct >= 91 ? 3 : pct >= 81 ? 2 : 1);
const pctText = (n) => `${n.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

function scorecard(p, role) {
  const metrics = [
    { label: "SLA Ticket", weight: 30, target: SLA_TARGET, actual: p.onTimeRate, unit: "%" },
    { label: "Konten Video", weight: 40, target: p.byType.Video.target, actual: p.byType.Video.done },
    { label: "Konten Carousel", weight: 30, target: p.byType.Carousel.target, actual: p.byType.Carousel.done },
  ].map((m) => {
    const pct = m.target && m.actual != null ? (m.actual / m.target) * 100 : 0;
    return { ...m, pct, score: (pct * m.weight) / 100, tier: tierOf(pct) };
  });
  const total = metrics.reduce((n, m) => n + m.score, 0);
  const rows = metrics.map((m, i) => `<tr>
      ${i === 0 ? `<th class="sc-team" rowspan="${metrics.length + 1}" scope="rowgroup">${esc(role.toUpperCase())}</th><td class="sc-persp" rowspan="${metrics.length}">Content Performance</td>` : ""}
      <td>${m.label}</td><td class="num">${m.weight}%</td><td class="num">${m.target ? `${m.target}${m.unit ?? ""}` : "—"}</td>
      <td class="num">${m.actual == null ? "—" : `${m.actual}${m.unit ?? ""}`}</td><td class="num">${pctText(m.pct)}</td><td class="num">${pctText(m.score)}</td>
      ${TIERS.map(([t, r]) => `<td class="sc-tier${t === m.tier ? " is-hit" : ""}">${r}</td>`).join("")}
      <td class="sc-final">${m.tier}</td></tr>`).join("");
  return `<div class="tablewrap sc-wrap"><table class="scorecard">
    <thead><tr><th rowspan="2"></th><th rowspan="2">Perspektif</th><th rowspan="2">Metric indicator</th><th rowspan="2" class="num">Bobot (%)</th><th rowspan="2" class="num">Target</th><th rowspan="2" class="num">Achievement</th><th rowspan="2" class="num">% Pencapaian</th><th rowspan="2" class="num">Score</th><th colspan="5" class="sc-group">Scoring tier</th><th rowspan="2" class="sc-final-h">Hasil akhir</th></tr>
      <tr>${TIERS.map(([t]) => `<th class="sc-tier-h">${t}</th>`).join("")}</tr></thead>
    <tbody>${rows}<tr class="sc-total"><td>Total</td><td></td><td class="num">100%</td><td colspan="3"></td><td class="num">${pctText(total)}</td><td colspan="6"></td></tr></tbody>
  </table></div>`;
}

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
  const days = state.deadlines[role];
  const verb = role === "Marketing" ? "Skrip" : "Hasil";
  root.innerHTML = `<div class="filters">
      ${isLeader() ? `<div class="field" style="max-width:220px"><label>Tim</label><div class="team-label">Tim ${esc(role)}</div></div>` : ""}
      <div class="field" style="max-width:200px"><label for="teamMonth">Bulan upload</label><input id="teamMonth" type="month" value="${month}" data-onchange="team-month"></div>
    </div>
    ${kpis ? kpiPanel(kpis) : ""}
    ${people.length ? people.map((p) => {
      const initials = p.user.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
      return `<article class="person"><div class="person-head"><div class="person-id"><div class="avatar">${esc(initials)}</div><b>${esc(p.user.name)}</b></div>
          <div class="person-meta small">SLA = ${verb.toLowerCase()} selesai tepat waktu (H-${days}) · Sisa target ${p.remaining} · Telat <b style="color:${p.late ? "#B71C1C" : "inherit"}">${p.late}</b></div></div>
        ${scorecard(p, role)}
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

delegate(document.body, "change", {
  "team-month": (el) => {
    month = el.value || state.today.slice(0, 7);
    window.dispatchEvent(new Event("cs:changed"));
  },
});
