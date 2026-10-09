// Footage: diisi di kolom Footage / Ilustrasi skrip (teks, link, file unggahan).
// Modul ini: helper unggah file + rekap per platform (Apps) × jenis konten di Setting → Link footage.
import { api, delegate, errorText, esc, fmtDate, fmtSize, isLeader, myApps, optionsFor, state, toast, TYPES, typeLabel } from "./core.js";

function itemHtml(f, { withContent = false } = {}) {
  const canDelete = isLeader() || f.uploaded_by === state.me.id;
  const open = f.kind === "link" ? f.url : `/api/footage/${f.id}/file`;
  const content = withContent && f.content_no ? `${typeLabel(f.type)} ${f.content_no} · ${esc(f.content_title ?? "")} · ` : "";
  return `<li class="footage-item">
    <span class="badge ${f.kind === "link" ? "b-link" : "b-file"}">${f.kind === "file" ? "File" : /drive\.google\.com/.test(f.url) ? "Drive" : "Link"}</span>
    <div class="fi-main"><a href="${esc(open)}" target="_blank" rel="noopener noreferrer">${esc(f.title)}</a>
      <div class="t-meta">${content}${esc(f.uploaded_by_name ?? "—")} · ${fmtDate(f.created_at ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date(f.created_at)) : "")}${f.size ? ` · ${fmtSize(f.size)}` : ""}</div></div>
    <div class="fi-actions">${f.kind === "file" ? `<a class="btn mini" href="/api/footage/${f.id}/file?download=1">Unduh</a>` : ""}
      ${canDelete ? `<button type="button" class="btn mini danger" data-action="footage-delete" data-id="${f.id}">Hapus</button>` : ""}</div>
  </li>`;
}

/** Unggah satu file; hasil: { id, url, title }. */
export const uploadFile = (file, params, onProgress = () => {}) => uploadOne(file, params, onProgress);

function uploadOne(file, params, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/footage/upload?${new URLSearchParams({ ...params, name: file.name })}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("X-Requested-With", "creaboard");
    xhr.setRequestHeader("X-File-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText || "{}");
      } catch {
        // respons bukan JSON (mis. ditolak proxy)
      }
      if (xhr.status === 200) resolve(data);
      else reject(new Error(data.error ?? (xhr.status === 413 ? "File terlalu besar" : "Unggah gagal")));
    };
    xhr.onerror = () => reject(new Error("Koneksi terputus saat mengunggah"));
    xhr.send(file);
  });
}

// ───────────── Setting → Link footage ─────────────
let filterApp = "";
let filterType = "";

export async function renderFootageLibrary(root) {
  const scope = myApps();
  const apps = optionsFor("app").filter((o) => !scope.length || scope.includes(o.id));
  const query = new URLSearchParams();
  if (filterApp) query.set("app", filterApp);
  if (filterType) query.set("type", filterType);
  const [items, folders] = await Promise.all([api("GET", `/api/footage?${query}`), api("GET", "/api/drive-folders")]);
  const groups = [];
  for (const a of apps.filter((o) => !filterApp || o.id === filterApp)) {
    for (const t of TYPES.filter((x) => !filterType || x === filterType)) {
      groups.push({ a, t, list: items.filter((f) => f.app === a.id && f.type === t), folder: folders.find((x) => x.app === a.id && x.type === t) });
    }
  }
  root.innerHTML = `<div class="filters">
      <div class="field"><label for="ftApp">Platform</label><select id="ftApp" data-onchange="footage-filter" data-key="app"><option value="">Semua platform</option>${apps.map((o) => `<option value="${esc(o.id)}" ${o.id === filterApp ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select></div>
      <div class="field"><label for="ftType">Jenis konten</label><select id="ftType" data-onchange="footage-filter" data-key="type"><option value="">Semua</option>${TYPES.map((t) => `<option value="${t}" ${t === filterType ? "selected" : ""}>${typeLabel(t)}</option>`).join("")}</select></div>
    </div>
    ${groups.map(({ a, t, list, folder }) => `<section class="panel footage-group">
      <div class="fg-head"><h2>${esc(a.label)} · ${typeLabel(t)}</h2><span class="t-meta">${list.length} footage</span></div>
      <div class="folder-row">
        ${isLeader()
          ? `<input type="url" placeholder="Link folder Google Drive…" aria-label="Folder Drive ${esc(a.label)} ${typeLabel(t)}" value="${esc(folder?.url ?? "")}" data-app="${esc(a.id)}" data-type="${t}">
             <button class="btn mini" data-action="folder-save">Simpan</button>`
          : folder ? "" : '<span class="t-meta">Folder Drive belum diatur</span>'}
        ${folder ? `<a class="btn mini" href="${esc(folder.url)}" target="_blank" rel="noopener noreferrer">Buka folder</a>` : ""}
      </div>
      <ul class="footage-list">${list.map((f) => itemHtml(f, { withContent: true })).join("") || '<li class="empty">Belum ada footage.</li>'}</ul>
    </section>`).join("") || '<div class="panel empty">Belum ada platform.</div>'}`;
}

// ───────────── interaksi ─────────────
delegate(document.body, "change", {
  "footage-filter": (el) => {
    if (el.dataset.key === "app") filterApp = el.value;
    else filterType = el.value;
    window.dispatchEvent(new Event("cs:changed"));
  },
});

delegate(document.body, "click", {
  "footage-delete": async (el) => {
    if (!confirm("Hapus footage ini?")) return;
    try {
      await api("DELETE", `/api/footage/${el.dataset.id}`, {});
      toast("Footage dihapus");
      window.dispatchEvent(new Event("cs:changed"));
    } catch (e) {
      toast(errorText(e), { error: true });
    }
  },
  "folder-save": async (el) => {
    const input = el.parentElement.querySelector("input[data-app]");
    try {
      await api("PUT", "/api/drive-folders", { app: input.dataset.app, type: input.dataset.type, url: input.value.trim() });
      toast(input.value.trim() ? "Folder Drive disimpan" : "Folder Drive dihapus");
      window.dispatchEvent(new Event("cs:changed"));
    } catch (e) {
      toast(errorText(e), { error: true });
    }
  },
});
