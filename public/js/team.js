// Performa & Target per staff (dihitung server).
import { api, delegate, esc, fmtDate, isLeader, state, TYPES, typeLabel } from "./core.js";

let role = "";
let month = "";
const COLORS = ["#3A5A40", "#588157", "#7F9467"];

function card(label, value, target, color) {
  const pct = target ? Math.round((value / target) * 100) : 0;
  return `<div class="team-card"><label>${esc(label)}</label><strong style="color:${color}">${value}</strong>
    <div class="track"><i style="width:${Math.min(100, pct)}%;background:${color}"></i></div>
    <div class="team-card-foot"><span>Target: ${target}</span><b>${target ? `${pct}%` : "—"}</b></div></div>`;
}

export async function renderTeam(root) {
  month ||= state.today.slice(0, 7);
  role = state.me.role; // Leader Marketing → tim Marketing, Leader Creative → tim Creative
  const data = await api("GET", `/api/team?month=${month}`);
  const people = data.people.filter((p) => p.user.role === role);
  const days = state.deadlines[role];
  const verb = role === "Marketing" ? "Skrip" : "Hasil";
  root.innerHTML = `<div class="filters">
      ${isLeader() ? `<div class="field" style="max-width:220px"><label>Tim</label><div class="team-label">Tim ${esc(role)}</div></div>` : ""}
      <div class="field" style="max-width:200px"><label for="teamMonth">Bulan upload</label><input id="teamMonth" type="month" value="${month}" data-onchange="team-month"></div>
    </div>
    ${people.length ? people.map((p) => {
      const initials = p.user.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
      const cards = TYPES.map((t, i) => card(`${verb} ${typeLabel(t).toLowerCase()}`, p.byType[t].done, p.byType[t].target, COLORS[i])).join("")
        + `<div class="team-card"><label>Tepat waktu (H-${days})</label><strong>${p.onTimeRate == null ? "—" : `${p.onTimeRate}%`}</strong></div>`
        + `<div class="team-card"><label>Sisa target</label><strong>${p.remaining}</strong></div>`
        + `<div class="team-card"><label>Telat</label><strong style="color:${p.late ? "#B42318" : "#344E41"}">${p.late}</strong></div>`;
      return `<article class="person"><div class="person-head"><div class="person-id"><div class="avatar">${esc(initials)}</div><b>${esc(p.user.name)}</b></div></div><div class="team-cards">${cards}</div>
        <details><summary>Rincian konten & ketepatan waktu</summary><div style="overflow:auto"><table><thead><tr><th>Konten</th><th>Jenis</th><th>Upload</th><th>Batas selesai</th><th>Selesai</th><th>Status</th></tr></thead>
        <tbody>${p.items.map((i) => `<tr><td><button class="number" data-action="detail" data-id="${i.id}">#${i.id}</button> ${esc(i.title)}</td><td>${typeLabel(i.type)}</td><td>${fmtDate(i.upload_date)}</td><td>${fmtDate(i.deadline)}</td><td>${i.done ? fmtDate(i.done) : "Belum selesai"}</td><td>${esc(i.status)}</td></tr>`).join("") || '<tr><td colspan="6" class="small">Belum ada konten.</td></tr>'}</tbody></table></div></details></article>`;
    }).join("") : '<div class="panel" style="margin-top:18px">Belum ada anggota untuk tim ini.</div>'}`;
}

delegate(document.body, "change", {
  "team-role": (el) => {
    role = el.value;
    window.dispatchEvent(new Event("cs:changed"));
  },
  "team-month": (el) => {
    month = el.value || state.today.slice(0, 7);
    window.dispatchEvent(new Event("cs:changed"));
  },
});
