// Konten kalender: rencana (Leader) vs aktual (skrip Ready per tanggal pengerjaan).
import { api, delegate, errorText, esc, isLeader, myApps, optionsFor, state, toast, TYPES, typeLabel } from "./core.js";

const COLORS = [["blue", "Biru"], ["yellow", "Kuning"], ["green", "Hijau"], ["orange", "Oranye"], ["pink", "Pink"], ["cyan", "Toska"], ["purple", "Ungu"]];
let month = "";
let appFilter = "";
let data = null;
const key = (app, type, date) => JSON.stringify([app, type, date]);

export async function renderCalendar(root) {
  month ||= state.today.slice(0, 7);
  data = await api("GET", `/api/calendar?month=${month}`);
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dates = Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const weekend = (d) => [0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay());
  const plans = Object.fromEntries(data.plans.map((p) => [key(p.app, p.type, p.date), p]));
  const linked = new Set(data.kpiLinked);
  // Staff melihat baris apps yang dipegangnya; Leader melihat semua.
  const scope = myApps();
  const apps = optionsFor("app").filter((o) => (!appFilter || o.id === appFilter) && (!scope.length || scope.includes(o.id)));
  // Rencana diedit kedua Leader dan staff Marketing (hanya baris apps yang dipegangnya).
  const canEditApp = (appId) => isLeader() || (state.me.role === "Marketing" && myApps().includes(appId));
  let totalPlan = 0;
  let totalActual = 0;
  let selfEdit = 0; // rencana pada kotak berwarna = edit mandiri
  let body = "";
  for (const app of apps) {
    TYPES.forEach((type, ti) => {
      let p = 0;
      let a = 0;
      const cells = dates.map((d) => {
        const k = key(app.id, type, d);
        const plan = plans[k];
        const actual = data.actuals[k] ?? 0;
        p += plan?.amount ?? 0;
        a += actual;
        if (plan?.color) selfEdit += plan.amount ?? 0;
        const isLinked = linked.has(k);
        const under = plan?.amount != null && actual < plan.amount && d < state.today;
        return `<td class="${weekend(d) ? "weekend" : ""}" title="Rencana: ${plan?.amount ?? "belum diisi"} · Aktual: ${actual}${plan?.color ? " · edit mandiri" : ""}${isLinked ? " · terhubung KPI" : ""}">
          <div class="pair"><div class="plan-box ${plan?.color ? `c-${plan.color}` : ""} ${isLinked ? "linked" : ""}">
            <input type="number" min="0" step="1" inputmode="numeric" value="${plan?.amount ?? ""}" placeholder="—" aria-label="Rencana ${esc(app.label)} ${typeLabel(type)} ${d}"
              data-onchange="plan" data-app="${esc(app.id)}" data-type="${type}" data-date="${d}" ${canEditApp(app.id) && !isLinked ? "" : "disabled"}>
            ${canEditApp(app.id) ? `<button class="swatch" aria-label="Warna ${d}" data-action="plan-color" data-app="${esc(app.id)}" data-type="${type}" data-date="${d}">●</button>` : ""}
          </div><span class="actual ${under ? "under" : ""}" aria-label="Aktual ${actual}">${actual}</span></div></td>`;
      });
      totalPlan += p;
      totalActual += a;
      body += `<tr class="${ti === 0 ? "app-start" : ""}">${ti === 0 ? `<td rowspan="3" class="c-app">${esc(app.label)}</td>` : ""}<td class="c-type">${typeLabel(type)}</td>${cells.join("")}<td class="c-total"><div class="pair"><span>${p}</span><span class="actual">${a}</span></div></td></tr>`;
    });
  }
  const monthName = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
  root.innerHTML = `<div class="filters">
      <div class="field" style="max-width:200px"><label for="calMonth">Bulan</label><input id="calMonth" type="month" value="${month}" data-onchange="cal-month"></div>
      <div class="field" style="max-width:220px"><label for="calApp">Apps</label><select id="calApp" data-onchange="cal-app"><option value="">Semua apps</option>${optionsFor("app").filter((o) => !scope.length || scope.includes(o.id)).map((o) => `<option value="${esc(o.id)}" ${o.id === appFilter ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select></div>
      <button class="btn" data-action="cal-shift" data-delta="-1" aria-label="Bulan sebelumnya">←</button><button class="btn" data-action="cal-shift" data-delta="1" aria-label="Bulan berikutnya">→</button><button class="btn" data-action="cal-now">Bulan ini</button>
    </div>
    <div class="calendar-summary"><div class="panel"><span class="small">Rencana bulan ini</span><b>${totalPlan}</b></div><div class="panel"><span class="small">Aktual (skrip ready)</span><b>${totalActual}</b></div><div class="panel"><span class="small">Capaian rencana</span><b>${totalPlan ? `${Math.round((totalActual / totalPlan) * 100)}%` : "—"}</b></div><div class="panel self-edit"><span class="small">Edit mandiri</span><b>${selfEdit}</b></div></div>
    <section class="worksheet"><div class="tablehead"><h2>Rencana & aktual harian</h2>
      <div style="display:flex;gap:8px"><span class="legend-chip">Rencana · kiri</span><span class="legend-chip">Aktual · kanan</span><span class="legend-chip legend-self">Berwarna · edit mandiri</span></div></div>
      <div class="calendar-scroll"><table><thead><tr><th colspan="2"></th><th colspan="${days}" class="month-name"><span>${esc(monthName)}</span></th><th rowspan="2" class="c-total">JUMLAH</th></tr>
      <tr class="days-row"><th class="c-app">Apps</th><th class="c-type">Jenis konten</th>${dates.map((d, i) => `<th class="${weekend(d) ? "weekend" : ""} ${d === state.today ? "today" : ""}">${i + 1}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div></section>`;
}

const changed = () => window.dispatchEvent(new Event("cs:changed"));
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
  "cal-app": (el) => {
    appFilter = el.value;
    changed();
  },
});

delegate(document.body, "click", {
  "cal-shift": (el) => {
    const [y, m] = month.split("-").map(Number);
    month = new Date(Date.UTC(y, m - 1 + Number(el.dataset.delta), 1)).toISOString().slice(0, 7);
    changed();
  },
  "cal-now": () => {
    month = state.today.slice(0, 7);
    changed();
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
