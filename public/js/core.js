// Utilitas bersama: API, state, format, opsi dropdown.

export const $ = (id) => document.getElementById(id);

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/api/login") {
    location.reload();
    throw new ApiError(401, "Sesi berakhir");
  }
  if (!res.ok) throw new ApiError(res.status, data.error ?? "Gagal", data.details);
  return data;
}

export function errorText(e) {
  if (e instanceof ApiError && Array.isArray(e.details) && e.details.length && e.details.every((d) => typeof d === "string")) {
    return `${e.message}: ${e.details.join("; ")}`;
  }
  return e?.message ?? "Terjadi kesalahan";
}

export const state = {
  me: null,
  today: "",
  users: [],
  options: [],
  contents: [],
  deadlines: {},
  page: "dashboard",
  stage: "",
  activeId: null,
};

// ───────────── opsi dropdown ─────────────
export const opt = (id) => state.options.find((o) => o.id === id);
export const optLabel = (id) => opt(id)?.label ?? "";
export const sem = (id) => opt(id)?.semantic ?? "";
export const optionsFor = (key) => state.options.filter((o) => o.key === key && !o.archived).sort((a, b) => a.sort - b.sort);

/** Apps yang dipegang pengguna (kosong = tidak dibatasi; Leader selalu semua). */
export const myApps = () => (state.me?.position === "Staff" && state.me.role === "Marketing" ? state.me.apps ?? [] : []);

/** <option> untuk satu kolom; pilihan arsip yang sedang dipakai tetap ditampilkan.
 *  `mine: true` membatasi Apps ke apps yang dipegang pengguna. */
export function optionTags(key, current, { blank, mine = false } = {}) {
  let html = blank !== undefined ? `<option value="">${esc(blank)}</option>` : "";
  const scope = mine && key === "app" ? myApps() : [];
  html += optionsFor(key).filter((o) => !scope.length || scope.includes(o.id) || o.id === current).map((o) => `<option value="${esc(o.id)}" ${o.id === current ? "selected" : ""}>${esc(o.label)}</option>`).join("");
  const cur = opt(current);
  if (cur?.archived) html += `<option value="${esc(cur.id)}" selected>${esc(cur.label)} (arsip)</option>`;
  return html;
}

export const userName = (id) => state.users.find((u) => u.id === id)?.name ?? "";
export const usersByRole = (role) => state.users.filter((u) => u.role === role && u.active);
export const isLeader = () => state.me?.position === "Leader";
/** Ada dua Leader: Leader Marketing dan Leader Creative. */
export const leads = (role) => isLeader() && state.me.role === role;
export const typeLabel = (t) => (t === "Carousel" ? "Carrousel" : t === "Singlepost" ? "Singlepost" : t);
export const TYPES = ["Video", "Carousel", "Singlepost"];

// ───────────── tanggal ─────────────
export function fmtDate(d) {
  return d ? new Date(`${d}T12:00:00`).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}
export function fmtStamp(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short" }).format(d);
  const time = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d).replace(".", ":");
  return `${day} · ${time} WIB`;
}
export function addDays(date, n) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ───────────── ikon (SVG, tampil sama di semua perangkat) ─────────────
const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  create: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 12v6M9 15h6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  team: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  script: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  talent: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  edit: '<rect x="2" y="5" width="15" height="14" rx="2"/><path d="m17 10 5-3v10l-5-3"/>',
  qc: '<path d="M20 6 9 17l-5-5"/>',
  revision: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  chart: '<path d="M6 20V12M12 20V5M18 20v-9"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4h6v3"/>',
  late: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  missed: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
};
export const icon = (name, size = 18) =>
  `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ""}</svg>`;

// ───────────── toast & modal ─────────────
let toastTimer;
/** Toast dengan aksi opsional, mis. { label: "Batalkan", run: fn }. */
export function toast(text, { action, error = false } = {}) {
  const el = $("toast");
  el.classList.toggle("toast-error", error);
  el.innerHTML = `<span>${esc(text)}</span>${action ? `<button type="button" class="toast-action">${esc(action.label)}</button>` : ""}`;
  if (action) {
    el.querySelector(".toast-action").addEventListener("click", () => {
      el.classList.add("hidden");
      action.run();
    });
  }
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), action || error ? 7000 : 3500);
}

export function openModal(html, { wide = false, full = false, keepScroll = false } = {}) {
  const modal = $("modal");
  modal.innerHTML = html;
  modal.classList.toggle("video-modal", wide);
  modal.classList.toggle("full", full);
  $("overlay").classList.toggle("full", full);
  $("overlay").classList.remove("hidden");
  if (!keepScroll) modal.scrollTop = 0;
  (modal.querySelector("[autofocus]") ?? modal).focus({ preventScroll: true });
}
export function closeModal() {
  $("overlay").classList.add("hidden");
  $("modal").innerHTML = "";
  state.closeGuard = null;
  state.activeId = null;
  window.dispatchEvent(new Event("cs:modal-closed"));
}

/** Event delegation: elemen dengan data-action="nama" memanggil handlers[nama](el, event). */
export function delegate(root, type, handlers) {
  root.addEventListener(type, (e) => {
    const el = e.target.closest(`[data-${type === "click" ? "action" : "on" + type}]`);
    if (!el || !root.contains(el)) return;
    const name = el.dataset[type === "click" ? "action" : "on" + type];
    if (handlers[name]) handlers[name](el, e);
  });
}

export async function reloadContents() {
  state.contents = await api("GET", "/api/contents");
}

// ───────────── nomor & format teks ─────────────
/** Nomor skrip per jenis konten: tiap jenis (Video, Carrousel, Singlepost) mulai dari 1. */
export const contentNo = (c) => String(c.type_no ?? c.id);

/** Nama domain singkat untuk ikon link (mis. "drive.google.com"). */
export const hostOf = (u) => {
  try {
    return new URL(u.replace(/&amp;/g, "&")).hostname.replace(/^www\./, "");
  } catch {
    return "link";
  }
};
/** URL unduhan untuk file yang diunggah ke server (paksa unduh, bukan buka). */
export const downloadUrl = (u) => (/\/api\/footage\/\d+\/file/.test(u) ? `${u}${u.includes("?") ? "&" : "?"}download=1` : null);
/** Link ditampilkan sebagai ikon + domain (rapi), URL lengkap di tooltip. `u` sudah di-escape. */
const iconLink = (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer" class="link-ico" title="${u}">${icon("link", 13)}<span>${esc(hostOf(u))}</span></a>`;

/**
 * Teks skrip → HTML aman: **tebal**, *miring*, link sebagai ikon, dan baris file unggahan
 * "[file] nama | url" sebagai tautan file + tombol unduh.
 */
export function richText(s) {
  // Tebal/miring hanya untuk teks biasa, tidak menyentuh URL (agar href tidak rusak).
  const mark = (t) => t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*\w])\*(?![\s*])(.+?)\*(?![*\w])/g, "$1<em>$2</em>");
  return esc(s)
    .split("\n")
    .map((line) => {
      const file = line.match(/^\[file\] (.+?) \| (https?:\/\/\S+)$/);
      if (file) {
        const dl = downloadUrl(file[2]);
        return `<span class="file-line">${icon("doc", 14)}<a href="${file[2]}" target="_blank" rel="noopener noreferrer">${file[1]}</a>${dl ? `<a class="file-dl" href="${dl}" title="Unduh ${file[1]}" aria-label="Unduh ${file[1]}">${icon("download", 14)}</a>` : ""}</span>`;
      }
      // URL disisihkan dulu (tanda * tidak termasuk URL), format diterapkan, lalu URL dikembalikan sebagai ikon.
      const urls = [];
      const masked = line.replace(/https?:\/\/[^\s<*]+/g, (u) => `\u0000${urls.push(u) - 1}\u0000`);
      return mark(masked).replace(/\u0000(\d+)\u0000/g, (_, k) => iconLink(urls[k]));
    })
    .join("\n");
}

/** Semua teks skrip (judul, brief, caption, catatan) untuk pencarian menyeluruh. */
export function searchText(c) {
  const s = c.sheet ?? {};
  const parts = [c.title, c.notes, s.title, s.keyword, ...(s.meta ?? []), ...(s.metaFootage ?? []), ...(s.metaEditing ?? []), s.caption1, s.caption2, s.notes];
  for (const r of s.rows ?? []) parts.push(r.label, r.text, r.footage, r.direction);
  return parts.filter(Boolean).join(" ").replace(/\*/g, "").toLowerCase();
}

export const fmtSize = (n) => (n == null ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : n < 1024 ** 3 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${(n / 1024 ** 3).toFixed(2)} GB`);
