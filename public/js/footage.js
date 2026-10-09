// Footage: unggah dari komputer atau link Google Drive, diisi langsung di form skrip
// (Video: di kolom FOOTAGE tiap baris; Carrousel/Singlepost: kotak footage di bawah skrip).
// File yang diunggah otomatis masuk ke folder Drive Apps × jenis konten bila Drive terhubung.
// Rekap per platform (Apps) × jenis konten beserta link folder Drive ada di Setting → Link footage.
import {
  $, api, delegate, errorText, esc, fmtDate, fmtSize, isLeader, myApps, optionsFor, optLabel, state, toast, TYPES, typeLabel,
} from "./core.js";

let boxContentId = null; // konten yang kotak footage-nya sedang tampil (null = skrip baru)
let boxApp = "";
let boxType = "";
let pending = []; // footage untuk skrip baru: dikirim setelah skrip tersimpan

function itemHtml(f, { withContent = false } = {}) {
  const canDelete = isLeader() || f.uploaded_by === state.me.id;
  const open = f.kind === "link" ? f.url : `/api/footage/${f.id}/file`;
  const content = withContent && f.content_no ? `${typeLabel(f.type)} ${f.content_no} · ${esc(f.content_title ?? "")} · ` : "";
  return `<li class="footage-item">
    <span class="badge ${f.kind === "link" ? "b-link" : "b-file"}">${f.kind === "file" ? "File" : /drive\.google\.com/.test(f.url) ? "Drive" : "Link"}</span>
    <div class="fi-main"><a href="${esc(open)}" target="_blank" rel="noopener noreferrer">${esc(f.title)}</a>
      <div class="t-meta">${content}${esc(f.uploaded_by_name ?? "—")} · ${fmtDate(f.created_at?.slice(0, 10))}${f.size ? ` · ${fmtSize(f.size)}` : ""}</div></div>
    <div class="fi-actions">${f.kind === "file" ? `<a class="btn mini" href="/api/footage/${f.id}/file?download=1">Unduh</a>` : ""}
      ${canDelete ? `<button type="button" class="btn mini danger" data-action="footage-delete" data-id="${f.id}">Hapus</button>` : ""}</div>
  </li>`;
}

function pendingHtml(p, i) {
  return `<li class="footage-item">
    <span class="badge ${p.kind === "link" ? "b-link" : "b-file"}">${p.kind === "link" ? "Link" : "File"}</span>
    <div class="fi-main"><b>${esc(p.title)}</b><div class="t-meta">${p.kind === "file" ? `${fmtSize(p.file.size)} · ` : ""}terunggah setelah skrip disimpan</div></div>
    <div class="fi-actions"><button type="button" class="btn mini" data-action="footage-unqueue" data-index="${i}">Batal</button></div>
  </li>`;
}

// ───────────── kotak footage di form skrip & detail ─────────────
/** Dipanggil saat form skrip baru dibuka: kosongkan antrean footage. */
export function resetPendingFootage() {
  pending = [];
}

/** Markup kotak footage. Isinya dimuat lewat fillFootageBox() setelah markup dipasang. */
export function footageBoxHtml(content, { app, type } = {}) {
  boxContentId = content?.id ?? null;
  boxApp = content?.app ?? app ?? "";
  boxType = content?.type ?? type ?? "";
  return `<section class="footage-box">
    <div class="fb-head"><h3>Footage</h3><span id="fbFolder"></span></div>
    <div class="footage-add">
      <label class="btn primary mini upload-btn">Unggah dari komputer<input type="file" multiple data-onchange="footage-pick" hidden></label>
      <input type="url" id="fbUrl" placeholder="Tempel link Google Drive…" aria-label="Link footage">
      <input id="fbTitle" placeholder="Nama (opsional)" aria-label="Nama footage">
      <button type="button" class="btn mini" data-action="footage-add-link">Tambah link</button>
      <div class="upload-progress hidden"><i></i><span></span></div>
    </div>
    <ul class="footage-list" id="footageList"><li class="empty">Memuat…</li></ul>
  </section>`;
}

export async function fillFootageBox() {
  const list = $("footageList");
  if (!list) return;
  const app = $("eApp")?.value || boxApp;
  const [items, folders] = await Promise.all([
    boxContentId ? api("GET", `/api/footage?content_id=${boxContentId}`) : Promise.resolve(null),
    api("GET", "/api/drive-folders"),
  ]);
  const folder = folders.find((f) => f.app === app && f.type === boxType);
  if ($("fbFolder")) $("fbFolder").innerHTML = folder ? `<a class="btn mini" href="${esc(folder.url)}" target="_blank" rel="noopener noreferrer">Buka folder Drive ${esc(optLabel(app))} · ${typeLabel(boxType)}</a>` : "";
  list.innerHTML = items
    ? items.map((f) => itemHtml(f)).join("") || '<li class="empty">Belum ada footage.</li>'
    : pending.map(pendingHtml).join("") || '<li class="empty">Belum ada footage.</li>';
}

/** Kirim footage yang diantrekan untuk skrip baru. Mengembalikan jumlah yang gagal. */
export async function flushPendingFootage(contentId) {
  const bar = document.querySelector(".footage-box .upload-progress");
  let failed = 0;
  for (const p of pending) {
    try {
      if (p.kind === "link") await api("POST", "/api/footage", { content_id: contentId, url: p.url, title: p.title });
      else {
        bar?.classList.remove("hidden");
        await uploadOne(p.file, { content_id: contentId }, progressBar(bar, p.file));
      }
    } catch {
      failed++;
    }
  }
  pending = [];
  return failed;
}

/** Progress bar kotak footage → callback persen. */
function progressBar(bar, file) {
  return (pct) => {
    if (!bar) return;
    bar.querySelector("i").style.width = `${pct}%`;
    bar.querySelector("span").textContent = `${file.name} · ${pct}%`;
  };
}

/** Unggah satu file; hasil: { id, url, title, stored: "drive" | "server" }. */
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

async function addLink() {
  const url = $("fbUrl").value.trim();
  const title = $("fbTitle").value.trim();
  if (!/^https?:\/\//i.test(url)) return toast("Link footage harus diawali https://", { error: true });
  if (!boxContentId) {
    pending.push({ kind: "link", url, title: title || url });
  } else {
    try {
      await api("POST", "/api/footage", { content_id: boxContentId, url, title });
      toast("Link footage ditambahkan");
    } catch (e) {
      return toast(errorText(e), { error: true });
    }
  }
  $("fbUrl").value = "";
  $("fbTitle").value = "";
  await fillFootageBox();
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
  const [items, folders, status] = await Promise.all([api("GET", `/api/footage?${query}`), api("GET", "/api/drive-folders"), api("GET", "/api/drive-status")]);
  const groups = [];
  for (const a of apps.filter((o) => !filterApp || o.id === filterApp)) {
    for (const t of TYPES.filter((x) => !filterType || x === filterType)) {
      groups.push({ a, t, list: items.filter((f) => f.app === a.id && f.type === t), folder: folders.find((x) => x.app === a.id && x.type === t) });
    }
  }
  root.innerHTML = `<div class="note ${status.connected ? "" : "warn-note"}">${status.connected
      ? "Google Drive terhubung. File yang diunggah dari form skrip otomatis masuk ke folder di bawah sesuai platform dan jenis kontennya. Pastikan tiap folder dibagikan (Editor) ke akun Google CreaBoard."
      : "Google Drive belum terhubung ke server, jadi file yang diunggah sementara disimpan di server CreaBoard. Link folder di bawah tetap dipakai begitu Drive dihubungkan."}</div>
    <div class="filters">
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
const refreshAll = async () => {
  if ($("footageList")) await fillFootageBox();
  else window.dispatchEvent(new Event("cs:changed"));
};

delegate(document.body, "change", {
  "footage-filter": (el) => {
    if (el.dataset.key === "app") filterApp = el.value;
    else filterType = el.value;
    window.dispatchEvent(new Event("cs:changed"));
  },
  "footage-pick": async (el) => {
    const files = [...el.files];
    el.value = "";
    if (!files.length) return;
    if (!boxContentId) {
      pending.push(...files.map((file) => ({ kind: "file", file, title: file.name })));
      return fillFootageBox();
    }
    const bar = el.closest(".footage-add").querySelector(".upload-progress");
    bar.classList.remove("hidden");
    try {
      for (const f of files) await uploadOne(f, { content_id: boxContentId }, progressBar(bar, f));
      toast(`${files.length} file terunggah`);
    } catch (e) {
      toast(e.message, { error: true });
    }
    bar.classList.add("hidden");
    await fillFootageBox();
  },
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || !e.target.matches?.("#fbUrl, #fbTitle")) return;
  e.preventDefault(); // jangan ikut menyimpan form skrip
  addLink();
});
document.addEventListener("change", (e) => {
  if (e.target.id === "eApp" && $("footageList")) fillFootageBox().catch(() => {});
});

delegate(document.body, "click", {
  "footage-add-link": () => addLink(),
  "footage-unqueue": (el) => {
    pending.splice(Number(el.dataset.index), 1);
    fillFootageBox();
  },
  "footage-delete": async (el) => {
    if (!confirm("Hapus footage ini?")) return;
    try {
      await api("DELETE", `/api/footage/${el.dataset.id}`, {});
      toast("Footage dihapus");
      await refreshAll();
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
