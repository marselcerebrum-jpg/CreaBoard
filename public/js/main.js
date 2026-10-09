import { $, api, closeModal, delegate, errorText, esc, icon, isLeader, myApps, reloadContents, state, toast } from "./core.js";
import { renderCalendar } from "./calendar.js";
import { openContentPicker, openDetail } from "./editor.js";
import { renderSettings } from "./settings.js";
import { renderTeam } from "./team.js";
import { renderDashboard, renderWorksheet } from "./worksheet.js";

const PAGES = {
  dashboard: { label: "Dashboard", icon: "dashboard", render: renderDashboard },
  create: { label: "Create konten", icon: "create", render: renderWorksheet },
  calendar: { label: "Konten kalender", icon: "calendar", render: renderCalendar },
  team: { label: "Performa & Target", icon: "team", render: renderTeam },
  settings: { label: "Setting", icon: "settings", render: renderSettings },
};

function allowedPages() {
  const { role } = state.me;
  if (isLeader()) return ["dashboard", "create", "calendar", "team"];
  if (role === "Talent") return ["dashboard", "calendar"];
  return ["dashboard", "create", "calendar", "team"];
}

function pageTitle(page) {
  const { role } = state.me;
  return {
    dashboard: isLeader() ? `Dashboard Leader ${role}` : `Dashboard ${role}`,
    create: role === "Creative" ? "Produksi konten" : "Worksheet konten",
    calendar: "Konten kalender",
    settings: "Setting",
    team: "Performa & Target",
  }[page];
}

export async function navigate(page) {
  // Setting ada di bagian bawah sidebar, bukan di daftar menu utama.
  if (page !== "settings" && !allowedPages().includes(page)) page = "dashboard";
  state.page = page;
  state.stage = "";
  $("pageTitle").textContent = pageTitle(page);
  $("createButton").classList.toggle("hidden", !(page === "create" && state.me.role === "Marketing"));
  document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("active", b.dataset.page === page));
  $("settingsBtn").classList.toggle("active", page === "settings");
  history.replaceState(null, "", `#${page}`);
  await rerender();
}

export async function rerender() {
  try {
    await PAGES[state.page].render($("page"));
  } catch (e) {
    $("page").innerHTML = `<p class="form-error">${esc(errorText(e))}</p>`;
  }
}

async function boot() {
  try {
    const data = await fetch("/api/bootstrap", { credentials: "same-origin" });
    if (data.status === 401) return showLogin();
    Object.assign(state, await data.json());
    await reloadContents();
  } catch {
    return showLogin("Tidak dapat terhubung ke server");
  }
  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  const { name, position, role } = state.me;
  const apps = myApps().map((id) => state.options.find((o) => o.id === id)?.label).filter(Boolean);
  $("account").innerHTML = `<b>${esc(name)}</b><span>${esc(position)} · ${esc(role)}</span>${apps.length ? `<span class="account-apps">${esc(apps.join(" · "))}</span>` : ""}`;
  $("settingsBtn").innerHTML = `${icon("settings")}<span>Setting</span>`;
  $("logoutBtn").innerHTML = `${icon("logout")}<span>Keluar</span>`;
  $("createButton").innerHTML = `${icon("plus", 16)}<span>Buat konten</span>`;
  $("nav").innerHTML = allowedPages()
    .map((p) => `<button data-page="${p}" data-action="nav">${icon(PAGES[p].icon)}<span>${p === "create" && role === "Creative" ? "Produksi konten" : PAGES[p].label}</span></button>`)
    .join("");
  navigate(location.hash.slice(1) || "dashboard");
  startLiveUpdates();
}

function showLogin(message) {
  $("appView").classList.add("hidden");
  $("loginView").classList.remove("hidden");
  $("loginError").classList.toggle("hidden", !message);
  $("loginError").textContent = message ?? "";
  $("loginUser").focus();
}

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("POST", "/api/login", { username: $("loginUser").value, password: $("loginPass").value });
    $("loginPass").value = "";
    boot();
  } catch (err) {
    showLogin(errorText(err));
  }
});

delegate(document.body, "click", {
  nav: (el) => navigate(el.dataset.page),
  settings: () => navigate("settings"),
  create: () => openContentPicker(),
  detail: (el) => openDetail(Number(el.dataset.id)),
  "close-modal": () => closeModal(),
  logout: async () => {
    await api("POST", "/api/logout", {}).catch(() => null);
    location.hash = "";
    location.reload();
  },
});

$("overlay").addEventListener("click", (e) => {
  if (e.target === $("overlay")) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("overlay").classList.contains("hidden")) closeModal();
});
window.addEventListener("cs:changed", () => rerender());

// ───────────── pembaruan otomatis ─────────────
// Server mengirim sinyal setiap ada perubahan; data dimuat ulang tanpa refresh halaman.
// Saat pengguna sedang mengetik di tabel atau jendela terbuka, pembaruan ditunda.
let pendingSync = false;
let syncTimer;
const busy = () => {
  const a = document.activeElement;
  const typing = a && a.closest("#page") && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  return typing || !$("overlay").classList.contains("hidden");
};
async function syncNow() {
  if (!state.me) return;
  if (busy()) {
    pendingSync = true;
    return;
  }
  pendingSync = false;
  try {
    await reloadContents();
    // Halaman Setting tidak dirender ulang agar isian yang belum disimpan tidak hilang.
    if (state.page !== "settings") await rerender();
  } catch {
    // koneksi putus sementara; dicoba lagi pada sinyal berikutnya
  }
}
function startLiveUpdates() {
  const source = new EventSource("/api/stream");
  source.onmessage = () => {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncNow, 400);
  };
  // Cadangan bila koneksi stream terputus lama: sinkron tiap 60 detik.
  setInterval(() => document.visibilityState === "visible" && syncNow(), 60_000);
}
document.addEventListener("focusout", () => pendingSync && setTimeout(syncNow, 300));
window.addEventListener("cs:modal-closed", () => pendingSync && syncNow());
window.addEventListener("cs:navigate", (e) => navigate(e.detail));
window.addEventListener("unhandledrejection", (e) => toast(errorText(e.reason)));

boot();
