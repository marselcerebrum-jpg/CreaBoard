// Footage: unggah dari komputer atau link Google Drive, dikelompokkan per Apps × jenis konten.
import {
  api, contentNo, delegate, errorText, esc, fmtDate, fmtSize, isLeader, myApps, openModal, optionsFor, optLabel,
  state, toast, TYPES, typeLabel,
} from "./core.js";

let filterApp = "";
let filterType = "";
let modalContentId = null;

const head = (title) =>
  `<div class="modalhead"><h2 id="modalTitle">${title}</h2><button class="close" aria-label="Tutup" data-action="close-modal">×</button></div>`;

function itemHtml(f) {
  const me = state.me;
  const canDelete = isLeader() || f.uploaded_by === me.id;
  const open = f.kind === "link" ? f.url : `/api/footage/${f.id}/file`;
  return `<li class="footage-item">
    <span class="badge ${f.kind === "link" ? "b-link" : "b-file"}">${f.kind === "link" ? "Drive/link" : "File"}</span>
    <div class="fi-main"><a href="${esc(open)}" target="_blank" rel="noopener noreferrer">${esc(f.title)}</a>
      <div class="t-meta">${f.content_no ? `${esc(contentNo({ type: f.type, type_no: f.content_no }))} · ${esc(f.content_title ?? "")} · ` : ""}${esc(f.uploaded_by_name ?? "—")} · ${fmtDate(f.created_at?.slice(0, 10))}${f.size ? ` · ${fmtSize(f.size)}` : ""}</div></div>
    <div class="fi-actions">${f.kind === "file" ? `<a class="btn mini" href="/api/footage/${f.id}/file?download=1">Unduh</a>` : ""}
      ${canDelete ? `<button class="btn mini danger" data-action="footage-delete" data-id="${f.id}">Hapus</button>` : ""}</div>
  </li>`;
}

function addForm({ app, type, contentId }) {
  const scope = contentId ? `data-content="${contentId}"` : `data-app="${esc(app)}" data-type="${type}"`;
  return `<div class="footage-add" ${scope}>
    <label class="btn primary mini upload-btn">Unggah dari komputer<input type="file" multiple data-onchange="footage-upload" ${scope} hidden></label>
    <form class="footage-link" data-scope='${esc(JSON.stringify(contentId ? { content_id: contentId } : { app, type }))}'>
      <input type="url" name="url" placeholder="Tempel link Google Drive…" required>
      <input name="title" placeholder="Nama (opsional)">
      <button class="btn mini">Tambah link</button>
    </form>
    <div class="upload-progress hidden"><i></i><span></span></div>
  </div>`;
}

function folderLink(folders, app, type) {
  const f = folders.find((x) => x.app === app && x.type === type);
  return f ? `<a class="btn mini" href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">Buka folder Drive</a>` : "";
}

// ───────────── jendela footage per konten ─────────────
export async function openFootageModal(contentId) {
  modalContentId = contentId;
  const c = state.contents.find((x) => x.id === contentId);
  const [items, folders] = await Promise.all([api("GET", `/api/footage?content_id=${contentId}`), api("GET", "/api/drive-folders")]);
  openModal(`${head(`Footage ${c ? esc(contentNo(c)) : ""}`)}<div class="modalbody">
    ${c ? `<p class="t-meta">${esc(c.title)} · ${esc(optLabel(c.app))} · ${typeLabel(c.type)} ${folderLink(folders, c.app, c.type)}</p>` : ""}
    ${addForm({ contentId })}
    <ul class="footage-list">${items.map(itemHtml).join("") || '<li class="empty">Belum ada footage.</li>'}</ul>
  </div>`);
}

// ───────────── halaman Footage ─────────────
export async function renderFootage(root) {
  const scope = myApps();
  const apps = optionsFor("app").filter((o) => !scope.length || scope.includes(o.id));
  const query = new URLSearchParams();
  if (filterApp) query.set("app", filterApp);
  if (filterType) query.set("type", filterType);
  const [items, folders] = await Promise.all([api("GET", `/api/footage?${query}`), api("GET", "/api/drive-folders")]);
  const groups = [];
  for (const a of apps.filter((o) => !filterApp || o.id === filterApp)) {
    for (const t of TYPES.filter((x) => !filterType || x === filterType)) {
      const list = items.filter((f) => f.app === a.id && f.type === t);
      const folder = folders.find((x) => x.app === a.id && x.type === t);
      if (!list.length && !folder && !(filterApp && filterType)) continue;
      groups.push({ a, t, list, folder });
    }
  }
  root.innerHTML = `<div class="filters">
      <div class="field"><label for="ftApp">Apps</label><select id="ftApp" data-onchange="footage-filter" data-key="app"><option value="">Semua apps</option>${apps.map((o) => `<option value="${esc(o.id)}" ${o.id === filterApp ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select></div>
      <div class="field"><label for="ftType">Jenis konten</label><select id="ftType" data-onchange="footage-filter" data-key="type"><option value="">Semua</option>${TYPES.map((t) => `<option value="${t}" ${t === filterType ? "selected" : ""}>${typeLabel(t)}</option>`).join("")}</select></div>
    </div>
    ${filterApp && filterType ? "" : '<div class="note">Pilih Apps dan jenis konten untuk mengunggah footage atau mengatur folder Drive-nya.</div>'}
    ${groups.map(({ a, t, list, folder }) => `<section class="panel footage-group">
      <div class="fg-head"><h2>${esc(a.label)} · ${typeLabel(t)}</h2>
        <div class="fg-tools">${folder ? `<a class="btn mini" href="${esc(folder.url)}" target="_blank" rel="noopener noreferrer">Buka folder Drive</a>` : '<span class="t-meta">Folder Drive belum diatur</span>'}
        ${isLeader() ? `<button class="btn mini" data-action="folder-edit" data-app="${esc(a.id)}" data-type="${t}" data-url="${esc(folder?.url ?? "")}">${folder ? "Ubah folder" : "Atur folder Drive"}</button>` : ""}</div></div>
      ${filterApp && filterType ? addForm({ app: a.id, type: t }) : ""}
      <ul class="footage-list">${list.map(itemHtml).join("") || '<li class="empty">Belum ada footage.</li>'}</ul>
    </section>`).join("") || '<div class="panel empty">Belum ada footage atau folder Drive. Pilih Apps dan jenis konten untuk mulai.</div>'}`;
}

// ───────────── interaksi ─────────────
const refresh = async () => {
  if (modalContentId && !document.getElementById("overlay").classList.contains("hidden")) await openFootageModal(modalContentId);
  window.dispatchEvent(new Event("cs:changed"));
};

function uploadOne(file, params, bar) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/footage/upload?${new URLSearchParams({ ...params, name: file.name })}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("X-Requested-With", "creaboard");
    xhr.setRequestHeader("X-File-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const pct = Math.round((e.loaded / e.total) * 100);
      bar.querySelector("i").style.width = `${pct}%`;
      bar.querySelector("span").textContent = `${file.name} · ${pct}%`;
    };
    xhr.onload = () => {
      const data = JSON.parse(xhr.responseText || "{}");
      if (xhr.status === 200) resolve(data);
      else reject(new Error(data.error ?? "Unggah gagal"));
    };
    xhr.onerror = () => reject(new Error("Koneksi terputus saat mengunggah"));
    xhr.send(file);
  });
}

delegate(document.body, "change", {
  "footage-filter": (el) => {
    if (el.dataset.key === "app") filterApp = el.value;
    else filterType = el.value;
    window.dispatchEvent(new Event("cs:changed"));
  },
  "footage-upload": async (el) => {
    const files = [...el.files];
    if (!files.length) return;
    const params = el.dataset.content ? { content_id: el.dataset.content } : { app: el.dataset.app, type: el.dataset.type };
    const bar = el.closest(".footage-add").querySelector(".upload-progress");
    bar.classList.remove("hidden");
    try {
      for (const f of files) await uploadOne(f, params, bar);
      toast(`${files.length} file terunggah`);
    } catch (e) {
      toast(e.message, { error: true });
    }
    bar.classList.add("hidden");
    el.value = "";
    await refresh();
  },
});

document.body.addEventListener("submit", async (e) => {
  const form = e.target.closest(".footage-link");
  if (!form) return;
  e.preventDefault();
  const scope = JSON.parse(form.dataset.scope);
  try {
    await api("POST", "/api/footage", { ...scope, url: form.url.value.trim(), title: form.title.value.trim() });
    toast("Link footage ditambahkan");
    form.reset();
    await refresh();
  } catch (err) {
    toast(errorText(err), { error: true });
  }
});

delegate(document.body, "click", {
  "footage-open": (el) => openFootageModal(Number(el.dataset.id)).catch((e) => toast(errorText(e), { error: true })),
  "footage-delete": async (el) => {
    if (!confirm("Hapus footage ini?")) return;
    try {
      await api("DELETE", `/api/footage/${el.dataset.id}`, {});
      toast("Footage dihapus");
      await refresh();
    } catch (e) {
      toast(errorText(e), { error: true });
    }
  },
  "folder-edit": async (el) => {
    const url = prompt(`Link folder Google Drive untuk ${optLabel(el.dataset.app)} · ${typeLabel(el.dataset.type)} (kosongkan untuk menghapus):`, el.dataset.url);
    if (url === null) return;
    try {
      await api("PUT", "/api/drive-folders", { app: el.dataset.app, type: el.dataset.type, url: url.trim() });
      toast("Folder Drive disimpan");
      await refresh();
    } catch (e) {
      toast(errorText(e), { error: true });
    }
  },
});

