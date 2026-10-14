// Halaman Setting: akun & role + pembagian apps, dropdown (Leader), ganti password.
import { $, api, delegate, errorText, esc, icon, isAdmin, isLeader, leads, optionsFor, optLabel, state, toast } from "./core.js";

const head = (title) => `<h2 class="settings-title">${title}</h2>`;
const body = (html) => ($("settingsBody").innerHTML = html);

/** Pembagian apps hanya untuk staff Marketing dan diatur Leader Marketing. */
const hasApps = (position, role) => position === "Staff" && role === "Marketing";
const manages = (position, role) => leads("Marketing") && hasApps(position, role);
const usersTitle = () => (state.me.role === "Marketing" ? "Akun, role & apps" : "Akun & role");

const SECTIONS = {
  users: { title: () => usersTitle(), leader: true, show: () => showUsers() },
  options: { title: () => "Atur dropdown", leader: true, show: () => showOptions(optKey) },
  password: { title: () => "Ganti password", show: () => showPassword() },
};
let section = "";

export async function renderSettings(root) {
  const list = Object.entries(SECTIONS).filter(([, s]) => !s.leader || isLeader());
  if (!list.some(([k]) => k === section)) section = list[0][0];
  root.innerHTML = `<div class="settings-nav" role="tablist">${list
    .map(([k, s]) => `<button class="btn ${k === section ? "active" : ""}" role="tab" aria-selected="${k === section}" data-action="settings-section" data-section="${k}">${esc(s.title())}</button>`)
    .join("")}</div><div id="settingsBody"></div>`;
  await SECTIONS[section].show();
}

function showPassword() {
  body(`<form id="pwForm" class="panel narrow">${head("Ganti password")}<div class="grid">
    <div class="field"><label for="pwOld">Password lama</label><input id="pwOld" type="password" autocomplete="current-password" required></div>
    <div class="field"><label for="pwNew">Password baru (min. 8 karakter)</label><input id="pwNew" type="password" autocomplete="new-password" minlength="8" required></div>
    </div><button class="btn primary" style="margin-top:14px">Simpan password</button></form>`);
  $("pwForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("POST", "/api/me/password", { current: $("pwOld").value, next: $("pwNew").value });
      $("pwForm").reset();
      toast("Password diperbarui");
    } catch (err) {
      toast(errorText(err), { error: true });
    }
  });
}

// ───────────── dropdown ─────────────
const GROUPS = {
  app: ["Apps", "Platform tempat konten diunggah. Dipakai untuk pembagian apps, kalender, dan filter."],
  talentName: ["Talent", "Nama talent yang bisa dipilih untuk konten Video."],
  script: ["Info skrip", "Status skrip. Kategori menentukan skrip dihitung Draft atau sudah siap (Ready)."],
  talent: ["Status take", "Status take talent untuk konten Video."],
  creative: ["Creative", "Status editing oleh tim Creative."],
  qc: ["QC", "Hasil pemeriksaan oleh tim Marketing."],
  priority: ["Jenis skrip", "Nama bebas. Kategori menentukan aturannya: Trend dan Urgent tidak dihitung telat, Urgent selalu tampil paling atas."],
  editor: ["Editor", "Centang akun Creative yang muncul di dropdown Editor, atau tambah editor baru di bawah."],
};
// Kolom yang punya kategori proses (dipakai alur & dashboard). Apps/Talent hanya nama.
const HAS_CATEGORY = new Set(["script", "talent", "creative", "qc", "priority"]);
const SEMANTICS = { script: ["Draft", "Ready"], talent: ["Belum", "Done", "Tidak perlu"], creative: ["Belum", "Done"], qc: ["", "Done", "Revisi"], priority: ["Reguler", "Trend", "Urgent"] };
const SEM_LABEL = { Draft: "Draft", Ready: "Siap", Belum: "Belum", Done: "Selesai", "Tidak perlu": "Tidak perlu", "": "Belum QC", Revisi: "Revisi", Reguler: "Reguler", Trend: "Trend · tanpa telat", Urgent: "Urgent · paling atas" };
let editorDraft = null; // id akun yang dicentang sebagai editor
let optKey = "app";
let optDraft = [];
let optDirty = false;

function showOptions(key = optKey) {
  optKey = key;
  optDirty = false;
  if (key === "editor") {
    editorDraft = new Set(state.users.filter((u) => u.role === "Creative" && u.editor).map((u) => u.id));
    return renderEditors();
  }
  optDraft = optionsFor(key).map((o) => ({ id: o.id, label: o.label, category: o.category ?? o.label }));
  renderOptions();
}

/** Arti proses sebuah pilihan, mengikuti rantai kategorinya (sama dengan aturan server). */
function semanticOf(item, depth = 0) {
  const ref = optDraft.find((o) => o.label === item.category);
  if (ref && ref !== item && depth < optDraft.length) return semanticOf(ref, depth + 1);
  return state.options.find((o) => o.id === item.id)?.semantic ?? SEMANTICS[optKey]?.[0] ?? "";
}

const groupNav = () => `<nav class="opt-groups" aria-label="Kolom dropdown">${Object.entries(GROUPS).map(([k, [n]]) => `<button class="${k === optKey ? "active" : ""}" data-action="opt-tab" data-key="${k}"><span>${n}</span><b>${k === "editor" ? (k === optKey ? editorDraft.size : state.users.filter((u) => u.role === "Creative" && u.active && u.editor).length) : k === optKey ? optDraft.length : optionsFor(k).length}</b></button>`).join("")}</nav>`;

/** Editor: centang akun Creative yang muncul di dropdown Editor, atau tambah editor baru (akun staff Creative). */
function renderEditors() {
  const [title, desc] = GROUPS.editor;
  const people = state.users.filter((u) => u.role === "Creative").sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name));
  body(`<div class="opt-shell">${groupNav()}
    <section class="panel opt-panel">
      <header class="opt-head"><div><h2>${title}</h2><p>${desc}</p></div></header>
      <div class="opt-list">
        <div class="opt-row opt-row-head editor-row"><span>Tampil</span><span>Nama</span><span>Posisi</span></div>
        ${people.map((u) => `<label class="opt-row editor-row ${u.active ? "" : "is-off"}">
          <span><input type="checkbox" data-onchange="editor-pick" value="${u.id}" ${editorDraft.has(u.id) ? "checked" : ""} ${u.active ? "" : "disabled"}></span>
          <span><b>${esc(u.name)}</b> <span class="small">${esc(u.username)}</span></span>
          <span class="small">${esc(u.position)} Creative${u.active ? "" : " · nonaktif"}</span></label>`).join("") || '<p class="empty">Belum ada akun Creative.</p>'}
      </div>
      <details class="editor-add" ${people.length ? "" : "open"}><summary class="ck-add">＋ Tambah editor</summary>
        <form id="editorForm2" class="editor-add-form">
          <p class="small">Editor adalah akun staff Creative: ia login untuk melihat skrip yang ditugaskan, mengisi link hasil, dan tercatat di Performa.</p>
          <div class="field"><label for="edName">Nama</label><input id="edName" required maxlength="100" placeholder="Contoh: Zia"></div>
          <div class="field"><label for="edUser">Username</label><input id="edUser" required pattern="[a-zA-Z0-9._\-]{3,40}" autocomplete="off" placeholder="contoh: zia"></div>
          <div class="field"><label for="edPass">Password awal (min. 8)</label><input id="edPass" type="text" minlength="8" required autocomplete="off"></div>
          <div class="field editor-add-submit"><button class="btn primary">Tambah editor</button></div>
        </form></details>
      <footer class="opt-foot"><span class="small">${optDirty ? "● Ada perubahan yang belum disimpan" : `${editorDraft.size} editor`}</span>
        <div class="opt-foot-actions"><button class="btn" data-action="settings-section" data-section="users">Kelola akun</button><button class="btn primary" data-action="editor-save">Simpan perubahan</button></div></footer>
    </section></div>`);
  $("editorForm2")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const { id } = await api("POST", "/api/users", { name: $("edName").value, username: $("edUser").value, password: $("edPass").value, position: "Staff", role: "Creative", apps: [] });
      await refreshBootstrap();
      editorDraft.add(id); // langsung tampil di dropdown Editor (bawaan staff Creative)
      toast(`Editor ${$("edName").value} ditambahkan. Bagikan username & password awalnya.`);
      renderEditors();
      window.dispatchEvent(new Event("cs:changed"));
    } catch (err) {
      toast(errorText(err), { error: true });
    }
  });
}

function renderOptions() {
  const withCategory = HAS_CATEGORY.has(optKey);
  const names = optDraft.map((o) => o.label.trim()).filter(Boolean);
  const [title, desc] = GROUPS[optKey];
  body(`<div class="opt-shell">${groupNav()}
    <section class="panel opt-panel">
      <header class="opt-head"><div><h2>${title}</h2><p>${desc}</p></div></header>
      <div class="opt-list ${withCategory ? "with-cat" : ""}">
        <div class="opt-row opt-row-head"><span>Urutan</span><span>Nama pilihan</span>${withCategory ? "<span>Kategori proses</span>" : ""}<span></span></div>
        ${optDraft.map((o, i) => {
          const sem = withCategory ? semanticOf(o) : null;
          return `<div class="opt-row">
          <div class="opt-order"><button type="button" class="icon-act" data-action="opt-move" data-index="${i}" data-dir="-1" ${i === 0 ? "disabled" : ""} aria-label="Naikkan ${esc(o.label)}">↑</button><button type="button" class="icon-act" data-action="opt-move" data-index="${i}" data-dir="1" ${i === optDraft.length - 1 ? "disabled" : ""} aria-label="Turunkan ${esc(o.label)}">↓</button></div>
          <input aria-label="Nama pilihan ${i + 1}" data-opt-label="${i}" data-onchange="opt-rename" value="${esc(o.label)}" maxlength="60">
          ${withCategory ? `<div class="opt-cat"><select aria-label="Kategori ${esc(o.label)}" data-opt-cat="${i}" data-prev="${esc(o.category)}" data-onchange="opt-recat">${names.map((n) => `<option value="${esc(n)}" ${n === o.category ? "selected" : ""}>${esc(n)}</option>`).join("")}</select><span class="opt-sem sem-${esc(sem || "none").replace(/\s/g, "")}" title="Arti proses">${esc(SEM_LABEL[sem] ?? sem)}</span></div>` : ""}
          <button type="button" class="icon-act danger" data-action="opt-remove" data-index="${i}" aria-label="Hapus ${esc(o.label)}">${icon("trash", 16)}</button></div>`;
        }).join("")}
      </div>
      <button type="button" class="ck-add" data-action="opt-add">＋ Tambah pilihan</button>
      <footer class="opt-foot"><span class="small">${optDirty ? "● Ada perubahan yang belum disimpan" : `${optDraft.length} pilihan`}</span><button class="btn primary" data-action="opt-save">Simpan perubahan</button></footer>
    </section></div>`);
}
// Penanda perubahan langsung muncul saat mengetik nama pilihan.
document.addEventListener("input", (e) => {
  if (!e.target.matches?.("[data-opt-label]")) return;
  optDirty = true;
  const note = document.querySelector(".opt-foot .small");
  if (note) note.textContent = "● Ada perubahan yang belum disimpan";
});
function captureOptions() {
  // Kategori hanya diambil dari dropdown yang benar-benar diubah pengguna; selebihnya mengikuti data
  // (agar ganti nama pilihan tidak tertimpa nilai lama di dropdown yang belum dirender ulang).
  document.querySelectorAll("[data-opt-cat]").forEach((el) => {
    if (el.value !== el.dataset.prev) optDraft[Number(el.dataset.optCat)].category = el.value;
    el.dataset.prev = el.value;
  });
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
  body(`<form id="userForm" class="panel">${head("Tambah akun")}<div class="grid">
      <div class="field"><label for="uName">Nama</label><input id="uName" required maxlength="100"></div>
      <div class="field"><label for="uUser">Username</label><input id="uUser" required pattern="[a-zA-Z0-9._\\-]{3,40}" autocomplete="off"></div>
      <div class="field"><label for="uPos">Posisi</label><select id="uPos" data-onchange="new-user-scope"><option>Staff</option><option>Leader</option>${isAdmin() ? "<option>Admin</option>" : ""}</select></div>
      <div class="field"><label for="uRole">Peran</label><select id="uRole" data-onchange="new-user-scope"><option ${state.me.role === "Marketing" ? "selected" : ""}>Marketing</option><option ${state.me.role === "Creative" ? "selected" : ""}>Creative</option><option>Talent</option></select></div>
      <div class="field full" id="uAppsField"><label>Apps yang dipegang</label><div id="uApps"></div></div>
      <div class="field"><label for="uPass">Password awal (min. 8)</label><input id="uPass" type="text" minlength="8" required autocomplete="off"></div>
      <div class="field" style="justify-content:end"><button class="btn primary">Tambah akun</button></div></div></form>
    <div class="panel" style="margin-top:14px;overflow:auto"><table class="users-table"><thead><tr><th>Nama</th><th>Posisi</th><th>Peran</th><th>Apps</th><th>Status</th><th></th></tr></thead><tbody>
      ${users.map((u) => {
        const editableApps = manages(u.position, u.role);
        // Akun sendiri: posisi/peran terkunci. Akun Leader lain & Admin hanya bisa diubah pemiliknya atau Admin.
        const otherLeader = u.id !== state.me.id && !isAdmin() && (u.position === "Leader" || u.position === "Admin");
        const lock = u.id === state.me.id || otherLeader ? "disabled" : "";
        const appsCell = editableApps
          ? appChips("", u.apps, { userId: u.id })
          : hasApps(u.position, u.role) ? esc(u.apps.map(optLabel).join(", ")) || '<span class="muted-inline">—</span>' : "";
        return `<tr><td><b>${esc(u.name)}</b><div class="t-meta">${esc(u.username)}</div></td>
        <td><select aria-label="Posisi ${esc(u.name)}" data-onchange="user-field" data-id="${u.id}" data-field="position" ${lock}><option ${u.position === "Staff" ? "selected" : ""}>Staff</option><option ${u.position === "Leader" ? "selected" : ""}>Leader</option>${isAdmin() || u.position === "Admin" ? `<option ${u.position === "Admin" ? "selected" : ""}>Admin</option>` : ""}</select></td>
        <td><select aria-label="Peran ${esc(u.name)}" data-onchange="user-field" data-id="${u.id}" data-field="role" ${lock}><option ${u.role === "Marketing" ? "selected" : ""}>Marketing</option><option ${u.role === "Creative" ? "selected" : ""}>Creative</option><option ${u.role === "Talent" ? "selected" : ""}>Talent</option></select></td>
        <td class="apps-cell">${appsCell}</td>
        <td>${u.id === state.me.id || otherLeader ? (u.active ? "Aktif" : "Nonaktif") : `<select aria-label="Status ${esc(u.name)}" data-onchange="user-field" data-id="${u.id}" data-field="active"><option value="1" ${u.active ? "selected" : ""}>Aktif</option><option value="0" ${u.active ? "" : "selected"}>Nonaktif</option></select>`}</td>
        <td>${otherLeader ? `<span class="small">${u.position === "Admin" ? "Admin" : "Leader lain"}</span>` : `<button class="btn mini" data-action="user-reset" data-id="${u.id}" data-name="${esc(u.name)}">Reset password</button>`}</td></tr>`;
      }).join("")}
    </tbody></table></div>`);
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

delegate(document.body, "click", {
  "settings-section": (el) => {
    section = el.dataset.section;
    window.dispatchEvent(new Event("cs:changed"));
  },
  "editor-save": async () => {
    try {
      state.users = await api("PUT", "/api/editors", { ids: [...editorDraft] });
      toast("Daftar editor diperbarui");
      showOptions("editor");
      window.dispatchEvent(new Event("cs:changed"));
    } catch (e) {
      toast(errorText(e), { error: true });
    }
  },
  "opt-tab": (el) => {
    if (optKey !== "editor") captureOptions();
    if (optDirty && !confirm("Perubahan dropdown ini belum disimpan. Pindah dan buang perubahan?")) return;
    showOptions(el.dataset.key);
  },
  "opt-move": (el) => {
    captureOptions();
    const i = Number(el.dataset.index);
    const j = i + Number(el.dataset.dir);
    if (j < 0 || j >= optDraft.length) return;
    [optDraft[i], optDraft[j]] = [optDraft[j], optDraft[i]];
    optDirty = true;
    renderOptions();
  },
  "opt-add": () => {
    captureOptions();
    let label = "Pilihan baru";
    for (let n = 2; optDraft.some((o) => o.label === label); n++) label = `Pilihan baru ${n}`;
    optDraft.push({ label, category: label });
    optDirty = true;
    renderOptions();
    document.querySelector(`[data-opt-label="${optDraft.length - 1}"]`)?.select();
  },
  "opt-remove": (el) => {
    captureOptions();
    const [removed] = optDraft.splice(Number(el.dataset.index), 1);
    // Kategori yang merujuk pilihan yang dihapus kembali ke nama sendiri.
    optDraft.forEach((o) => o.category === removed.label && (o.category = o.label));
    optDirty = true;
    renderOptions();
  },
  "opt-save": async () => {
    captureOptions();
    try {
      state.options = await api("PUT", `/api/options/${optKey}`, { options: optDraft });
      toast("Pilihan dropdown diperbarui");
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
});

delegate(document.body, "change", {
  "new-user-scope": () => newUserApps(),
  // Render ulang ditunda: "change" dipicu saat kolom ditinggalkan (blur), tepat ketika tombol lain diklik.
  "editor-pick": (el) => {
    if (el.checked) editorDraft.add(Number(el.value));
    else editorDraft.delete(Number(el.value));
    optDirty = true;
    document.querySelector(".opt-foot .small").textContent = "● Ada perubahan yang belum disimpan";
  },
  "opt-rename": () => {
    captureOptions();
    optDirty = true;
    setTimeout(() => $("settingsBody")?.querySelector(".opt-shell") && (captureOptions(), renderOptions()));
  },
  "opt-recat": () => {
    captureOptions();
    optDirty = true;
    setTimeout(() => $("settingsBody")?.querySelector(".opt-shell") && (captureOptions(), renderOptions()));
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
    } catch (e) {
      el.checked = !el.checked;
      toast(errorText(e), { error: true });
    }
  },
});
