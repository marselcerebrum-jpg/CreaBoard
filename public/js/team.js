// Performa & Target per staff (dihitung server) + pengaturan Target KPI (khusus Leader).
import { $, addDays, api, prioSem, contentNo, delegate, errorText, esc, fmtDate, isLeader, optionsFor, optLabel, state, toast, TYPES, typeLabel } from "./core.js";

let role = "";
let month = "";
const COLORS = ["#C62828", "#FF8F00", "#E0A800"];

function card(label, value, target, color) {
  const pct = target ? Math.round((value / target) * 100) : 0;
  return `<div class="team-card"><label>${esc(label)}</label><strong style="color:${color}">${value}</strong>
    <div class="track"><i style="width:${Math.min(100, pct)}%;background:${color}"></i></div>
    <div class="team-card-foot"><span>Target: ${target}</span><b>${target ? `${pct}%` : "—"}</b></div></div>`;
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
      const cards = TYPES.map((t, i) => card(`${verb} ${typeLabel(t).toLowerCase()}`, p.byType[t].done, p.byType[t].target, COLORS[i])).join("")
        + `<div class="team-card"><label>Tepat waktu (H-${days})</label><strong>${p.onTimeRate == null ? "—" : `${p.onTimeRate}%`}</strong></div>`
        + `<div class="team-card"><label>Sisa target</label><strong>${p.remaining}</strong></div>`
        + `<div class="team-card"><label>Telat</label><strong style="color:${p.late ? "#B71C1C" : "#2E1F17"}">${p.late}</strong></div>`;
      return `<article class="person"><div class="person-head"><div class="person-id"><div class="avatar">${esc(initials)}</div><b>${esc(p.user.name)}</b></div></div><div class="team-cards">${cards}</div>
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
