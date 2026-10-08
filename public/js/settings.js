// Setting: ganti password (semua), dropdown, akun & role + pembagian apps, target KPI (Leader).
import { $, api, closeModal, delegate, errorText, esc, fmtDate, isLeader, openModal, optionsFor, optLabel, state, toast, TYPES, typeLabel, addDays } from "./core.js";

const head = (title) =>
  `<div class="modalhead"><h2 id="modalTitle">${title}</h2><button class="close" aria-label="Tutup" data-action="close-modal">×</button></div>`;
const back = '<button type="button" class="btn" data-action="settings-home">← Kembali</button>';
const changed = () => window.dispatchEvent(new Event("cs:changed"));

/** Pembagian apps hanya untuk staff Marketing dan diatur Leader Marketing. */
const hasApps = (position, role) => position === "Staff" && role === "Marketing";
const manages = (position, role) => isLeader() && state.me.role === "Marketing" && hasApps(position, role);
const usersTitle = () => (state.me.role === "Marketing" ? "Akun, role & apps" : "Akun & role");

export function openSettings() {
  openModal(`${head("Setting")}<div class="modalbody"><div class="setting-grid">
    <button class="setting-tile" data-action="settings-password"><b>Ganti password</b></button>
    ${isLeader() ? `<button class="setting-tile" data-action="settings-users"><b>${usersTitle()}</b></button>
    <button class="setting-tile" data-action="settings-kpi"><b>Target KPI</b></button>
    <button class="setting-tile" data-action="settings-options"><b>Atur dropdown</b></button>` : ""}
    </div></div>`);
}

function showPassword() {
  openModal(`${head("Ganti password")}<form id="pwForm"><div class="modalbody"><div class="grid">
    <div class="field"><label for="pwOld">Password lama</label><input id="pwOld" type="password" autocomplete="current-password" required></div>
    <div class="field"><label for="pwNew">Password baru (min. 8 karakter)</label><input id="pwNew" type="password" autocomplete="new-password" minlength="8" required></div>
    </div></div><div class="foot">${back}<button class="btn primary">Simpan password</button></div></form>`);
  $("pwForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("POST", "/api/me/password", { current: $("pwOld").value, next: $("pwNew").value });
      closeModal();
      toast("Password diperbarui");
    } catch (err) {
      toast(errorText(err), { error: true });
    }
  });
}

// ───────────── dropdown ─────────────
const KEYS = { app: "Apps", talentName: "Talent", script: "Info skrip", talent: "Status Take", creative: "Creative", qc: "QC" };
// Kolom yang punya kategori proses (dipakai alur & dashboard). Apps/Talent hanya nama.
const HAS_CATEGORY = new Set(["script", "talent", "creative", "qc"]);
let optKey = "app";
let optDraft = [];

function showOptions(key = optKey) {
  optKey = key;
  optDraft = optionsFor(key).map((o) => ({ id: o.id, label: o.label, category: o.category ?? o.label }));
  renderOptions();
}
function renderOptions() {
  const withCategory = HAS_CATEGORY.has(optKey);
  const names = optDraft.map((o) => o.label.trim()).filter(Boolean);
  openModal(`${head("Atur dropdown")}<div class="modalbody">
    <div class="settings-tabs">${Object.entries(KEYS).map(([k, n]) => `<button class="btn mini ${k === optKey ? "active" : ""}" data-action="opt-tab" data-key="${k}">${n}</button>`).join("")}</div>
    ${withCategory ? '<div class="setting-cols"><span>Nama pilihan</span><span>Kategori proses</span></div>' : ""}
    <div>${optDraft.map((o, i) => `<div class="settingrow"><input aria-label="Nama pilihan ${i + 1}" data-opt-label="${i}" data-onchange="opt-rename" value="${esc(o.label)}" maxlength="60">
      ${withCategory ? `<select aria-label="Kategori ${i + 1}" data-opt-cat="${i}">${names.map((n) => `<option value="${esc(n)}" ${n === o.category ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>` : ""}
      <button class="btn mini" data-action="opt-remove" data-index="${i}">Hapus</button></div>`).join("")}</div>
    <button class="btn mini" style="margin-top:14px" data-action="opt-add">＋ Tambah pilihan</button></div>
    <div class="foot">${back}<button class="btn primary" data-action="opt-save">Simpan dropdown</button></div>`);
}
function captureOptions() {
  document.querySelectorAll("[data-opt-cat]").forEach((el) => (optDraft[Number(el.dataset.optCat)].category = el.value));
  document.querySelectorAll("[data-opt-label]").forEach((el) => {
    const item = optDraft[Number(el.dataset.optLabel)];
    const next = el.value.trim();
    // Nama berganti → kategori yang merujuk nama lama ikut berganti.
    if (next && next !== item.label) optDraft.forEach((o) => o.category === item.label && (o.category = next));
    item.label = next || item.label;
  });
}

// ───────────── akun, role & apps ─────────────
function appChips(name, selected, { userId, disabled = false } = {}) {
  return `<div class="app-chips">${optionsFor("app").map((a) => `<label class="app-chip"><input type="checkbox" value="${esc(a.id)}" ${selected.includes(a.id) ? "checked" : ""} ${disabled ? "disabled" : ""}
    ${userId ? `data-onchange="user-app" data-user="${userId}"` : `name="${name}"`}><span>${esc(a.label)}</span></label>`).join("")}</div>`;
}

function newUserApps() {
  const pos = $("uPos").value;
  const role = $("uRole").value;
  // Field apps hanya untuk staff Marketing; untuk Creative/Talent/Leader disembunyikan.
  $("uAppsField").classList.toggle("hidden", !hasApps(pos, role));
  $("uApps").innerHTML = manages(pos, role) ? appChips("newApps", []) : '<span class="muted-inline">Diatur Leader Marketing</span>';
}

async function showUsers() {
  const users = await api("GET", "/api/users");
  openModal(`${head(usersTitle())}<div class="modalbody">
    <form id="userForm" class="panel"><h3 style="margin-top:0">Tambah akun</h3><div class="grid">
      <div class="field"><label for="uName">Nama</label><input id="uName" required maxlength="100"></div>
      <div class="field"><label for="uUser">Username</label><input id="uUser" required pattern="[a-zA-Z0-9._\\-]{3,40}" autocomplete="off"></div>
      <div class="field"><label for="uPos">Posisi</label><select id="uPos" data-onchange="new-user-scope"><option>Staff</option><option>Leader</option></select></div>
      <div class="field"><label for="uRole">Peran</label><select id="uRole" data-onchange="new-user-scope"><option ${state.me.role === "Marketing" ? "selected" : ""}>Marketing</option><option ${state.me.role === "Creative" ? "selected" : ""}>Creative</option><option>Talent</option></select></div>
      <div class="field full" id="uAppsField"><label>Apps yang dipegang</label><div id="uApps"></div></div>
      <div class="field"><label for="uPass">Password awal (min. 8)</label><input id="uPass" type="text" minlength="8" required autocomplete="off"></div>
      <div class="field" style="justify-content:end"><button class="btn primary">Tambah akun</button></div></div></form>
    <div class="panel" style="margin-top:14px;overflow:auto"><table class="users-table"><thead><tr><th>Nama</th><th>Posisi</th><th>Peran</th><th>Apps</th><th>Status</th><th></th></tr></thead><tbody>
      ${users.map((u) => {
        const editableApps = manages(u.position, u.role);
        const appsCell = editableApps
          ? appChips("", u.apps, { userId: u.id })
          : hasApps(u.position, u.role) ? esc(u.apps.map(optLabel).join(", ")) || '<span class="muted-inline">—</span>' : "";
        return `<tr><td><b>${esc(u.name)}</b><div class="t-meta">${esc(u.username)}</div></td>
        <td><select data-onchange="user-field" data-id="${u.id}" data-field="position" ${u.id === state.me.id ? "disabled" : ""}><option ${u.position === "Staff" ? "selected" : ""}>Staff</option><option ${u.position === "Leader" ? "selected" : ""}>Leader</option></select></td>
        <td><select data-onchange="user-field" data-id="${u.id}" data-field="role" ${u.id === state.me.id ? "disabled" : ""}><option ${u.role === "Marketing" ? "selected" : ""}>Marketing</option><option ${u.role === "Creative" ? "selected" : ""}>Creative</option><option ${u.role === "Talent" ? "selected" : ""}>Talent</option></select></td>
        <td class="apps-cell">${appsCell}</td>
        <td>${u.id === state.me.id ? "Aktif" : `<select data-onchange="user-field" data-id="${u.id}" data-field="active"><option value="1" ${u.active ? "selected" : ""}>Aktif</option><option value="0" ${u.active ? "" : "selected"}>Nonaktif</option></select>`}</td>
        <td><button class="btn mini" data-action="user-reset" data-id="${u.id}" data-name="${esc(u.name)}">Reset password</button></td></tr>`;
      }).join("")}
    </tbody></table></div></div><div class="foot">${back}</div>`, { wide: true });
  newUserApps();
  $("userForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const apps = [...document.querySelectorAll('#uApps input[name="newApps"]:checked')].map((x) => x.value);
    try {
      await api("POST", "/api/users", { name: $("uName").value, username: $("uUser").value, position: $("uPos").value, role: $("uRole").value, password: $("uPass").value, apps });
      toast("Akun dibuat");
      await refreshBootstrap();
      showUsers();
    } catch (err) {
      toast(errorText(err), { error: true });
    }
  });
}

async function refreshBootstrap() {
  const b = await api("GET", "/api/bootstrap");
  Object.assign(state, { users: b.users, options: b.options });
}

// ───────────── KPI ─────────────
let kpiMonth = "";
async function showKpi() {
  kpiMonth ||= state.today.slice(0, 7);
  const list = await api("GET", `/api/kpis?month=${kpiMonth}`);
  // Leader hanya mengatur target tim yang dipimpinnya.
  const staff = state.users.filter((u) => u.active && u.position === "Staff" && u.role === state.me.role);
  openModal(`${head("Target KPI")}<div class="modalbody">
    <form id="kpiForm" class="panel"><div class="grid">
      <div class="field"><label for="kStaff">Staff</label><select id="kStaff" required>${staff.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join("")}</select></div>
      <div class="field"><label for="kApp">Apps</label><select id="kApp">${optionsFor("app").map((o) => `<option value="${esc(o.id)}">${esc(o.label)}</option>`).join("")}</select></div>
      <div class="field"><label for="kType">Jenis konten</label><select id="kType">${TYPES.map((t) => `<option value="${t}">${typeLabel(t)}</option>`).join("")}</select></div>
      <div class="field"><label for="kAmount">Target jumlah</label><input id="kAmount" type="number" min="1" step="1" value="3" required></div>
      <div class="field"><label for="kUpload">Tanggal upload</label><input id="kUpload" type="date" value="${addDays(state.today, 3)}" required></div>
      <div class="field"><label for="kWork">Tanggal pengerjaan (maks. H-${state.deadlines[state.me.role] ?? 3})</label><input id="kWork" type="date" value="${state.today}" required></div>
    </div><button class="btn primary" style="margin-top:12px">Simpan target</button></form>
    <div class="filters"><div class="field" style="max-width:200px"><label for="kMonth">Bulan upload</label><input id="kMonth" type="month" value="${kpiMonth}" data-onchange="kpi-month"></div></div>
    <div class="panel" style="overflow:auto"><table><thead><tr><th>Staff</th><th>Apps</th><th>Jenis</th><th>Pengerjaan</th><th>Upload</th><th>Target</th><th></th></tr></thead><tbody>
      ${list.map((k) => `<tr><td>${esc(k.user_name)}</td><td>${esc(optLabel(k.app))}</td><td>${typeLabel(k.type)}</td><td>${fmtDate(k.work_date)}</td><td>${fmtDate(k.upload_date)}</td><td>${k.amount}</td><td><button class="btn mini danger" data-action="kpi-delete" data-id="${k.id}">Hapus</button></td></tr>`).join("") || '<tr><td colspan="7" class="empty">Belum ada target bulan ini.</td></tr>'}
    </tbody></table></div></div><div class="foot">${back}</div>`);
  $("kpiForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("POST", "/api/kpis", { user_id: Number($("kStaff").value), app: $("kApp").value, type: $("kType").value, amount: Number($("kAmount").value), work_date: $("kWork").value, upload_date: $("kUpload").value });
      toast("Target KPI disimpan");
      changed();
      showKpi();
    } catch (err) {
      toast(errorText(err), { error: true });
    }
  });
}

delegate(document.body, "click", {
  "settings-home": () => openSettings(),
  "settings-password": () => showPassword(),
  "settings-options": () => showOptions("app"),
  "settings-users": () => showUsers().catch((e) => toast(errorText(e), { error: true })),
  "settings-kpi": () => showKpi().catch((e) => toast(errorText(e), { error: true })),
  "opt-tab": (el) => {
    captureOptions();
    showOptions(el.dataset.key);
  },
  "opt-add": () => {
    captureOptions();
    let label = "Pilihan baru";
    for (let n = 2; optDraft.some((o) => o.label === label); n++) label = `Pilihan baru ${n}`;
    optDraft.push({ label, category: label });
    renderOptions();
  },
  "opt-remove": (el) => {
    captureOptions();
    const [removed] = optDraft.splice(Number(el.dataset.index), 1);
    // Kategori yang merujuk pilihan yang dihapus kembali ke nama sendiri.
    optDraft.forEach((o) => o.category === removed.label && (o.category = o.label));
    renderOptions();
  },
  "opt-save": async () => {
    captureOptions();
    try {
      state.options = await api("PUT", `/api/options/${optKey}`, { options: optDraft });
      toast("Pilihan dropdown diperbarui");
      changed();
      showOptions(optKey);
    } catch (e) {
      toast(errorText(e), { error: true });
    }
  },
  "user-reset": async (el) => {
    const pw = prompt(`Password baru untuk ${el.dataset.name} (min. 8 karakter):`);
    if (!pw) return;
    try {
      await api("PATCH", `/api/users/${el.dataset.id}`, { password: pw });
      toast("Password direset");
    } catch (e) {
      toast(errorText(e), { error: true });
    }
  },
  "kpi-delete": async (el) => {
    if (!confirm("Hapus target ini?")) return;
    await api("DELETE", `/api/kpis/${el.dataset.id}`, {}).catch((e) => toast(errorText(e), { error: true }));
    changed();
    showKpi();
  },
});

delegate(document.body, "change", {
  "new-user-scope": () => newUserApps(),
  "opt-rename": () => {
    captureOptions();
    renderOptions();
  },
  "user-field": async (el) => {
    const field = el.dataset.field;
    const value = field === "active" ? el.value === "1" : el.value;
    try {
      await api("PATCH", `/api/users/${el.dataset.id}`, { [field]: value });
      await refreshBootstrap();
      toast("Akun diperbarui");
      if (field !== "active") showUsers();
    } catch (e) {
      toast(errorText(e), { error: true });
      showUsers();
    }
  },
  "user-app": async (el) => {
    const userId = el.dataset.user;
    const apps = [...document.querySelectorAll(`[data-onchange="user-app"][data-user="${userId}"]:checked`)].map((x) => x.value);
    try {
      await api("PUT", `/api/users/${userId}/apps`, { apps });
      await refreshBootstrap();
      toast("Apps disimpan");
      changed();
    } catch (e) {
      el.checked = !el.checked;
      toast(errorText(e), { error: true });
    }
  },
  "kpi-month": (el) => {
    kpiMonth = el.value;
    showKpi();
  },
});
