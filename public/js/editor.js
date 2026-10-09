// Pemilih jenis konten, editor skrip (layout worksheet), detail, dan konfirmasi tayang.
import {
  $, addDays, api, closeModal, downloadUrl, hostOf, contentNo, delegate, errorText, esc, fmtDate, fmtStamp, icon, leads, myApps, openModal, optionTags, optLabel, reloadContents, richText, sem, state, toast, typeLabel, userName, usersByRole,
} from "./core.js";
import { uploadFile } from "./footage.js";
import { updateContent } from "./worksheet.js";

const MAX_ROWS = { Video: 12, Carousel: 10, Singlepost: 2 };
const META = {
  Video: ["Kata kunci", "Konsep konten · inframe / voice over", "Link contoh video", "Visual hook"],
  Carousel: ["Tema"],
  Singlepost: ["Judul / hook", "Sumber", "Image / ilustrasi"],
};
let draft = null; // { id, type, sheet, fields }

function blankSheet(type) {
  const labels = type === "Video" ? ["Hook", "Tahapan 1", "Tahapan 2", "Tahapan 3", "CTA"]
    : type === "Carousel" ? ["Slide utama", "Slide 2", "Slide 3", "Slide 4", "Slide 5", "Slide 6", "CTA"] : ["Isi", "CTA"];
  return {
    type,
    title: "",
    keyword: "",
    meta: META[type].map(() => ""),
    metaFootage: META[type].map(() => ""),
    metaEditing: type === "Video" ? ["", "", "", ""] : undefined,
    rows: labels.map((label) => ({ label, text: "", footage: "", direction: "" })),
    caption1: "",
    caption2: "",
    notes: "",
  };
}

// ───────────── markup sheet ─────────────
function cell(value, path, { read, cls = "", label, footage = false, footageEdit = false } = {}) {
  // Kolom FOOTAGE bisa diisi semua peran, juga dari tampilan detail (tersimpan otomatis).
  if (read && !(footage && footageEdit)) return `<div class="read">${richText(value) || '<span class="unfilled">—</span>'}</div>`;
  // Detail: kolom footage memakai komponen yang sama dengan editor dan tersimpan otomatis.
  if (read) return footageBox(path, value, { autosave: true });
  if (footage) return footageBox(path, value);
  return `<textarea class="${cls}" data-path="${path}" aria-label="${esc(label ?? path)}" placeholder="Tulis di sini…">${esc(value ?? "")}</textarea>`;
}

export function sheetMarkup(sh, { read = false, id, footageEdit = false } = {}) {
  const rows = sh.rows ?? [];
  const head = `SKRIP ${id ? esc(id) : typeLabel(sh.type).toUpperCase()}`;
  if (sh.type === "Video") {
    const total = 4 + rows.length;
    return `<div class="sheet"><table><colgroup><col style="width:7%"><col style="width:23%"><col style="width:16%"><col style="width:17%"><col style="width:13%"><col style="width:12%"><col style="width:12%"></colgroup>
      <thead><tr><th colspan="2">${head}</th><th>FOOTAGE</th><th>ARAHAN EDITING</th><th>KETERANGAN</th><th>CAPTION TIKTOK</th><th>CAPTION INSTAGRAM</th></tr></thead><tbody>
      ${META.Video.map((label, i) => `<tr><td class="row-label">${label}</td><td>${cell(sh.meta[i], `meta.${i}`, { read, cls: "compact", label })}</td>
        <td class="footage">${cell(sh.metaFootage?.[i], `metaFootage.${i}`, { read, cls: "compact", label: `${label} footage`, footage: true, footageEdit })}</td>
        <td class="editing">${cell(sh.metaEditing?.[i], `metaEditing.${i}`, { read, cls: "compact", label: `${label} arahan` })}</td>
        ${i === 0 ? `<td rowspan="${total}">${cell(sh.notes, "notes", { read, cls: "long", label: "Keterangan" })}</td><td rowspan="${total}">${cell(sh.caption1, "caption1", { read, cls: "long", label: "Caption TikTok" })}</td><td rowspan="${total}">${cell(sh.caption2, "caption2", { read, cls: "long", label: "Caption Instagram" })}</td>` : ""}</tr>`).join("")}
      ${rows.map((r, i) => `<tr><td class="row-label">${esc(r.label)}</td><td>${cell(r.text, `rows.${i}.text`, { read, label: `${r.label} skrip` })}</td>
        <td class="footage">${cell(r.footage, `rows.${i}.footage`, { read, label: `${r.label} footage`, footage: true, footageEdit })}</td><td class="editing">${cell(r.direction, `rows.${i}.direction`, { read, label: `${r.label} arahan` })}</td></tr>`).join("")}
      </tbody></table></div>`;
  }
  if (sh.type === "Carousel") {
    return `<div class="sheet static"><table><colgroup><col style="width:11%"><col style="width:34%"><col style="width:19%"><col style="width:18%"><col style="width:18%"></colgroup>
      <thead><tr><th colspan="2">${head}</th><th>FOOTAGE / ILUSTRASI</th><th>KETERANGAN DESAIN</th><th>CAPTION</th></tr></thead><tbody>
      <tr><td class="row-label">Tema</td><td>${cell(sh.meta[0], "meta.0", { read, cls: "compact", label: "Tema" })}</td><td class="footage"></td><td>${cell(sh.notes, "notes", { read, cls: "compact", label: "Keterangan umum" })}</td>
        <td rowspan="${rows.length + 1}">${cell(sh.caption1, "caption1", { read, cls: "long", label: "Caption" })}</td></tr>
      ${rows.map((r, i) => `<tr><td class="row-label">${esc(r.label)}</td><td>${cell(r.text, `rows.${i}.text`, { read, label: r.label })}</td><td class="footage">${cell(r.footage, `rows.${i}.footage`, { read, label: `${r.label} footage`, footage: true, footageEdit })}</td><td>${cell(r.direction, `rows.${i}.direction`, { read, label: `${r.label} desain` })}</td></tr>`).join("")}
      </tbody></table></div>`;
  }
  const last = rows.length - 1;
  const entries = [
    ["Judul / hook", sh.meta[0], "meta.0", "metaFootage.0"], ["Sumber", sh.meta[1], "meta.1"], ["Image / ilustrasi", sh.meta[2], "meta.2", "metaFootage.2"],
    ["Isi", rows[0]?.text, "rows.0.text", `rows.0.footage`], ["CTA", rows[last]?.text, `rows.${last}.text`, `rows.${last}.footage`],
  ];
  return `<div class="sheet static"><table><colgroup><col style="width:12%"><col style="width:32%"><col style="width:20%"><col style="width:18%"><col style="width:18%"></colgroup>
    <thead><tr><th colspan="2">${head}</th><th>FOOTAGE / ILUSTRASI</th><th>KETERANGAN</th><th>CAPTION</th></tr></thead><tbody>
    ${entries.map(([label, v, path, fpath], i) => `<tr><td class="row-label">${label}</td><td>${cell(v, path, { read, cls: label === "Isi" ? "" : "compact", label })}</td>
      <td class="footage">${fpath ? cell(fpath.split(".").reduce((o, k) => o?.[k], sh), fpath, { read, label: `${label} footage`, footage: true, footageEdit }) : ""}</td>
      ${i === 0 ? `<td rowspan="5">${cell(sh.notes, "notes", { read, cls: "long", label: "Keterangan" })}</td><td rowspan="5">${cell(sh.caption1, "caption1", { read, cls: "long", label: "Caption" })}</td>` : ""}</tr>`).join("")}
    </tbody></table></div>`;
}

function setPath(path, value) {
  const parts = path.split(".");
  let target = draft.sheet;
  for (const p of parts.slice(0, -1)) target = target[p] ??= [];
  target[parts.at(-1)] = value;
}
function captureSheet() {
  document.querySelectorAll("#modal [data-path]").forEach((el) => setPath(el.dataset.path, el.value));
  // Kolom footage: teks + link + file digabung kembali ke satu field.
  document.querySelectorAll("#modal .ft2[data-fpath]").forEach((box) => setPath(box.dataset.fpath, footageValue(box)));
  if (draft?.type === "Video" && $("editorForm")) draft.sheet.meta[0] = draft.sheet.keyword ?? "";
}

// ───────────── kolom footage: teks, link (ikon), file unggahan ─────────────
const FILE_LINE = /^\[file\] (.+?) \| (\S+)$/;
const URL_LINE = /^https?:\/\/\S+$/i;
const isWebUrl = (u) => /^https?:\/\//i.test(u);
/** Pisahkan isi kolom footage: teks bebas, link (baris berisi URL saja), dan file unggahan. */
export function splitFootage(value) {
  const text = [];
  const links = [];
  const files = [];
  for (const line of String(value ?? "").split("\n")) {
    const t = line.trim();
    const m = t.match(FILE_LINE);
    if (m) files.push({ name: m[1], url: m[2] });
    else if (URL_LINE.test(t)) links.push(t);
    else text.push(line);
  }
  return { text: text.join("\n").trim(), links, files };
}
const joinFootage = (text, links, files) =>
  [text.trim(), ...links, ...files.map((f) => `[file] ${f.name.replace(/\|/g, "/")} | ${f.url}`)].filter(Boolean).join("\n");
const boxList = (box, key) => JSON.parse(box.dataset[key] || "[]");
const footageValue = (box) => joinFootage(box.querySelector("textarea").value, boxList(box, "links"), boxList(box, "files"));

const linkChips = (links, { removable = true } = {}) =>
  links.map((u, i) => `<span class="link-chip"><a href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="${esc(u)}">${icon("link", 13)}<span>${esc(hostOf(u))}</span></a>${removable ? `<button type="button" data-action="ft2-unlink" data-index="${i}" aria-label="Hapus link ${esc(hostOf(u))}">×</button>` : ""}</span>`).join("");
const IMG = /\.(png|jpe?g|gif|webp|avif)$/i;
const fileChips = (files) =>
  files.map((f, i) => {
    const web = isWebUrl(f.url);
    const dl = web ? downloadUrl(f.url) : null;
    const thumb = web && IMG.test(f.name) ? `<img src="${esc(f.url)}" alt="" loading="lazy">` : icon(/\.(mp4|mov|webm|mkv|avi)$/i.test(f.name) ? "edit" : "doc", 15);
    return `<div class="file-chip"><span class="fc-ico">${thumb}</span><span class="fc-name" title="${esc(f.name)}">${esc(f.name)}</span>
      ${web ? `<a class="fc-act" href="${esc(f.url)}" target="_blank" rel="noopener noreferrer" title="Lihat" aria-label="Lihat ${esc(f.name)}">${icon("eye", 16)}</a>` : ""}
      ${dl ? `<a class="fc-act" href="${esc(dl)}" title="Unduh" aria-label="Unduh ${esc(f.name)}">${icon("download", 16)}</a>` : ""}
      <button type="button" class="fc-act" data-action="ft2-remove" data-index="${i}" title="Lepas" aria-label="Lepas ${esc(f.name)}">×</button></div>`;
  }).join("");
/** Ikon untuk semua URL di sebuah teks (keterangan desain / arahan). */
const textLinks = (value) => linkChips(String(value ?? "").match(/https?:\/\/[^\s<]+/g) ?? [], { removable: false });

// ───────────── pemilih jenis & editor ─────────────
export function openContentPicker() {
  if (state.me.role !== "Marketing") return toast("Pembuatan skrip tersedia untuk Marketing.");
  if (state.me.position === "Staff" && !myApps().length) return toast("Anda belum memegang apps. Minta Leader Marketing membagikan apps.", { error: true });
  openEditor(null, "Video");
}

// ───────────── draf otomatis (bertahan saat halaman di-refresh) ─────────────
const draftKey = () => `creaboard:draft:${state.me.id}:${draft.id ?? "new"}`;
function storeDraft() {
  if (!draft || !$("editorForm")) return;
  captureSheet();
  const fields = Object.fromEntries([...document.querySelectorAll("#editorForm .top-fields [id]")].map((el) => [el.id, el.value]));
  try {
    localStorage.setItem(draftKey(), JSON.stringify({ at: Date.now(), type: draft.type, sheet: draft.sheet, fields }));
  } catch {
    // penyimpanan browser penuh/nonaktif: draf hanya hilang bila halaman ditutup
  }
}
function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(draftKey()) ?? "null");
  } catch {
    return null;
  }
}
function clearDraft() {
  try {
    localStorage.removeItem(draftKey());
  } catch {
    // abaikan
  }
}
let dirty = false;
window.addEventListener("beforeunload", (e) => {
  if (dirty && $("editorForm")) {
    storeDraft();
    e.preventDefault();
  }
});

function openEditor(content, type) {
  const c = content;
  draft = {
    id: c?.id ?? null,
    type: c?.type ?? type,
    sheet: c ? structuredClone(c.sheet) : blankSheet(type),
    revision: c?.revision,
  };
  if (!draft.sheet.rows?.length) draft.sheet = blankSheet(draft.type);
  if (!c) uploadedIds = [];
  dirty = false;
  const saved = loadDraft();
  renderEditor(c);
  state.closeGuard = closeGuard;
  if (saved && (c ? saved.type === draft.type && saved.at > Date.parse(c.updated_at) : true)) {
    $("draftBanner").innerHTML = `Ada draf yang belum disimpan (${new Date(saved.at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}).
      <button type="button" class="btn mini primary" data-action="draft-restore">Pulihkan</button> <button type="button" class="btn mini" data-action="draft-discard">Buang</button>`;
    $("draftBanner").classList.remove("hidden");
    pendingDraft = { saved, c };
  }
}
let pendingDraft = null;
let uploadedIds = []; // footage yang diunggah sebelum skrip baru tersimpan

/** Dipanggil sebelum editor ditutup (Batal / Esc / klik luar). */
function closeGuard() {
  if (!$("editorForm")) return true;
  if (uploading) return confirm("File footage masih diunggah. Tutup dan batalkan unggahan?");
  if (!dirty) return true;
  storeDraft(); // simpan draf terakhir saat itu juga
  return confirm("Tutup editor? Perubahan yang belum disimpan tetap ada sebagai draf dan bisa dipulihkan.");
}
/** Nilai field atas (Apps, tanggal, editor, dll.) dipertahankan saat editor dirender ulang. */
const readFields = () => Object.fromEntries([...document.querySelectorAll("#editorForm .top-fields [id]")].map((el) => [el.id, el.value]));
function applyFields(fields) {
  for (const [id, v] of Object.entries(fields ?? {})) {
    const el = document.getElementById(id);
    if (el && !el.disabled && [...(el.options ?? [{ value: v }])].some((o) => o.value === v)) el.value = v;
  }
}

const TYPE_TABS = [["Video", "Video"], ["Carousel", "Carrousel"], ["Singlepost", "Singlepost"]];
const getPath = (path) => path.split(".").reduce((o, k) => o?.[k], draft.sheet) ?? "";

/** Kotak teks tabel; tombol tebal/miring muncul saat kotak aktif (juga Ctrl+B / Ctrl+I). */
function richBox(path, value, { placeholder = "", label } = {}) {
  return `<div class="rt"><div class="rt-tools" role="toolbar" aria-label="Format teks">
      <button type="button" tabindex="-1" data-action="fmt" data-mark="**" data-target="${path}" title="Tebal (Ctrl+B)"><b>B</b></button>
      <button type="button" tabindex="-1" data-action="fmt" data-mark="*" data-target="${path}" title="Miring (Ctrl+I)"><i>I</i></button></div>
    <textarea data-path="${path}" placeholder="${esc(placeholder)}" aria-label="${esc(label ?? placeholder)}">${esc(value ?? "")}</textarea>
    <div class="dir-links">${textLinks(value)}</div></div>`;
}

/** Kolom visual: catatan footage/ilustrasi, link (tampil sebagai ikon), dan file unggahan. */
function footageBox(path, value, { autosave = false } = {}) {
  const { text, links, files } = splitFootage(value);
  return `<div class="ft2" data-fpath="${path}" data-files="${esc(JSON.stringify(files))}" data-links="${esc(JSON.stringify(links))}">
    <textarea placeholder="Ketik footage / ilustrasi…" aria-label="Arahan visual" ${autosave ? 'data-onchange="footage-save"' : ""}>${esc(text)}</textarea>
    <input type="url" placeholder="Tempel link…" aria-label="Link visual" data-ft2-link>
    <div class="ft2-links">${linkChips(links)}</div>
    <label class="ft2-upload"><span>＋ Upload file</span><input type="file" multiple hidden data-onchange="ft2-upload"></label>
    <div class="ft2-files">${fileChips(files)}</div></div>`;
}

const keepInactive = (list, id) => (id && !list.some((u) => u.id === id) ? `<option value="${id}" selected>${esc(userName(id) || "Akun nonaktif")} (nonaktif)</option>` : "");

/** Baris tabel per jenis: baris pengantar (teks saja) dan blok (teks + visual [+ keterangan Video]). */
function tableSpec(t, rows) {
  if (t === "Video") {
    return {
      intro: [["Kata kunci", "keyword"], ["Konsep konten", "meta.1"], ["Link contoh video", "meta.2"]],
      blocks: [{ label: "Visual Hook", text: "meta.3", visual: "metaFootage.3", remark: "metaEditing.3" },
        ...rows.map((r, i) => ({ label: r.label, text: `rows.${i}.text`, visual: `rows.${i}.footage`, remark: `rows.${i}.direction` }))],
    };
  }
  if (t === "Carousel") {
    return { intro: [["Tema", "meta.0"]], blocks: rows.map((r, i) => ({ label: r.label, text: `rows.${i}.text`, visual: `rows.${i}.footage` })) };
  }
  return {
    intro: [["Sumber", "meta.1"]],
    blocks: [{ label: "Judul / Hook", text: "meta.0", visual: "metaFootage.0" }, { label: "Image / Ilustrasi", text: "meta.2", visual: "metaFootage.2" },
      ...rows.map((r, i) => ({ label: r.label, text: `rows.${i}.text`, visual: `rows.${i}.footage` }))],
  };
}

function renderEditor(c) {
  const fieldsBefore = $("editorForm") ? readFields() : null;
  const scrollBefore = $("modal").scrollTop;
  const t = draft.type;
  const sh = draft.sheet;
  // Skrip lama: judul & kata kunci diambil dari kolom lama bila field barunya masih kosong.
  sh.title ||= sh.meta?.[0] ?? "";
  if (t === "Video") sh.keyword ||= sh.meta?.[0] ?? "";
  const editable = c ? c.editable : ["app", "upload_date", "priority"];
  const dis = (f) => (editable.includes(f) ? "" : "disabled");
  const rows = sh.rows ?? [];
  const video = t === "Video";
  const { intro, blocks } = tableSpec(t, rows);
  const total = intro.length + blocks.length;
  const captions = video ? [["caption1", "Caption TikTok…"], ["caption2", "Caption Instagram…"]] : [["caption1", "Caption Instagram…"]];
  const captionCells = captions.map(([path, ph]) => `<td class="captioncell" rowspan="${total}">${richBox(path, sh[path], { placeholder: ph })}</td>`).join("");
  const body = [
    ...intro.map(([label, path], i) => `<tr class="tableintro"><td class="part">${esc(label.toUpperCase())}</td><td>${richBox(path, getPath(path), { placeholder: `Tulis ${label.toLowerCase()}…`, label })}</td><td></td>${video ? "<td></td>" : ""}${i === 0 ? captionCells : ""}</tr>`),
    ...blocks.map((b) => `<tr><td class="part">${esc(b.label.toUpperCase())}</td><td>${richBox(b.text, getPath(b.text), { placeholder: `Tulis ${b.label.toLowerCase()}…`, label: `Isi ${b.label}` })}</td>
      <td>${footageBox(b.visual, getPath(b.visual))}</td>${video ? `<td>${richBox(b.remark, getPath(b.remark), { placeholder: "Keterangan…", label: `Keterangan ${b.label}` })}</td>` : ""}</tr>`),
  ].join("");
  const head = video
    ? '<tr><th colspan="2" rowspan="2">SKRIP</th><th rowspan="2">FOOTAGE</th><th rowspan="2">KETERANGAN</th><th colspan="2">CAPTION</th></tr><tr><th>TIKTOK</th><th>INSTAGRAM</th></tr>'
    : '<tr><th colspan="2">SKRIP</th><th>KETERANGAN</th><th>CAPTION</th></tr>';
  const cols = video
    ? '<col style="width:10%"><col style="width:31%"><col style="width:23%"><col style="width:12%"><col style="width:12%"><col style="width:12%">'
    : '<col style="width:10%"><col style="width:44%"><col style="width:24%"><col style="width:22%">';
  openModal(
    `<form id="editorForm" class="ck ck-${t}">
    <div class="ck-page">
      <header class="ck-head"><div><h2 id="modalTitle">${c ? "Edit Konten" : "Create Konten"}</h2><p>Siapkan skrip, visual, dan caption konten dalam satu tabel.</p></div>
        <span class="ck-badge">✎ ${c ? `${esc(typeLabel(t))} ${esc(contentNo(c))}` : "Draft baru"}</span></header>
      <div class="ck-types" role="tablist" aria-label="Jenis konten">${TYPE_TABS.map(([k, label]) => `<button type="button" role="tab" aria-selected="${k === t}" class="${k === t ? "selected" : ""}" ${c && k !== t ? "disabled" : ""} data-action="switch-type" data-type="${k}">${label}</button>`).join("")}</div>
      <div id="draftBanner" class="note draft-banner hidden"></div>
      <section class="ck-info top-fields">
        <div class="field"><label for="eApp">Apps</label><select id="eApp" ${dis("app")}>${optionTags("app", c?.app, { mine: true })}</select></div>
        <div class="field"><label for="eUpload">Tanggal upload</label><input id="eUpload" type="date" required value="${c?.upload_date ?? addDays(state.today, 3)}" ${dis("upload_date")}></div>
        <div class="field"><label for="eTitle">Info skrip / judul konten</label><input id="eTitle" data-path="title" value="${esc(sh.title)}" placeholder="Contoh: Syarat wajib daftar RBB 2026" maxlength="200"></div>
        <div class="field"><label for="ePriority">Jenis skrip</label><select id="ePriority" ${dis("priority")}>${["Reguler", "Trend", "Urgent"].map((p) => `<option ${(c?.priority ?? "Reguler") === p ? "selected" : ""}>${p}</option>`).join("")}</select></div>
        <div class="field"><label for="eKeyword">Kata kunci</label><input id="eKeyword" data-path="keyword" value="${esc(sh.keyword ?? "")}" placeholder="Contoh: syarat RBB, lowongan BUMN"></div>
      </section>
      <div class="ck-tablewrap"><table class="ck-table"><colgroup>${cols}</colgroup><thead>${head}</thead><tbody>${body}</tbody></table></div>
      ${t === "Singlepost" ? "" : `<button type="button" class="ck-add" data-action="add-stage">＋ ${video ? "Tambah tahapan" : "Tambah slide"}</button>`}
      <p id="editorError" class="form-error hidden" role="alert"></p>
    </div>
    <footer class="ck-foot"><span class="small">Draft tersimpan di browser ini</span>
      <div class="ck-actions"><button type="button" class="btn" data-action="ck-export">Unduh JSON</button><button class="btn primary" type="submit">Simpan konten</button></div></footer>
    </form>`,
    { full: true, keepScroll: Boolean(fieldsBefore) },
  );
  if (fieldsBefore) {
    applyFields(fieldsBefore);
    $("modal").scrollTop = scrollBefore;
  }
  $("editorForm").addEventListener("submit", (e) => {
    e.preventDefault();
    saveEditor(c);
  });
}

/** Label baris tengah dinomori ulang setelah ditambah/dihapus. */
function relabel() {
  const rows = draft.sheet.rows;
  rows.forEach((r, i) => {
    if (i === 0 || i === rows.length - 1) return;
    r.label = draft.type === "Video" ? `Tahapan ${i}` : `Slide ${i + 1}`;
  });
}

async function saveEditor(c) {
  captureSheet();
  const fields = { app: $("eApp").value, upload_date: $("eUpload").value, priority: $("ePriority").value };
  const errorEl = $("editorError");
  const submit = document.querySelector('#editorForm button[type="submit"]');
  let failed = 0;
  submit.disabled = true; // cegah skrip ganda saat footage masih diunggah
  try {
    if (!(draft.sheet.title || draft.sheet.meta[0])?.trim()) throw new Error("Info skrip / judul konten perlu diisi.");
    if (c) {
      const changes = { sheet: draft.sheet };
      for (const [k, v] of Object.entries(fields)) if (c.editable.includes(k) && v !== c[k]) changes[k] = v;
      await updateContent(c.id, changes, { revision: draft.revision });
      draft.revision = state.contents.find((x) => x.id === c.id)?.revision;
    } else {
      const created = await api("POST", "/api/contents", { type: draft.type, sheet: draft.sheet, ...fields });
      clearDraft();
      dirty = false;
      if (uploadedIds.length) await api("POST", "/api/footage/attach", { content_id: created.id, ids: uploadedIds }).catch(() => {});
      uploadedIds = [];
      await reloadContents();
    }
    clearDraft();
    dirty = false;
    closeModal();
    if (failed) toast(`Skrip tersimpan, tetapi ${failed} footage gagal diunggah. Tambahkan lagi dari detail skrip.`, { error: true });
    else toast("Skrip tersimpan. Dashboard sudah diperbarui.");
    window.dispatchEvent(new Event("cs:changed"));
  } catch (e) {
    errorEl.textContent = errorText(e);
    errorEl.classList.remove("hidden");
    errorEl.scrollIntoView({ block: "nearest" });
    submit.disabled = false;
  }
}

// ───────────── detail ─────────────
const FIELD_LABEL = {
  created: "Konten dibuat", app: "Apps", type: "Bentuk", created_date: "Tanggal pengerjaan", upload_date: "Tanggal upload",
  script_status: "Info skrip", talent_status: "Status take", talent_name: "Talent", creative_status: "Creative", qc_status: "QC",
  link: "Link hasil", notes: "Catatan", marketing_user_id: "Marketing", creative_user_id: "Editor", sheet: "Isi skrip diubah",
  published_date: "Status tayang", archived: "Diarsipkan",
};
function eventValue(field, v) {
  if (v == null || v === "") return "—";
  if (["app", "script_status", "talent_status", "talent_name", "creative_status", "qc_status"].includes(field)) return optLabel(v) || v;
  if (field.endsWith("_user_id")) return userName(Number(v)) || v;
  return v;
}

export async function openDetail(id) {
  let c;
  try {
    c = await api("GET", `/api/contents/${id}`);
  } catch (e) {
    return toast(errorText(e));
  }
  state.activeId = id;
  const canPublish = c.flags.upload && (leads("Marketing") || (state.me.role === "Marketing" && c.marketing_user_id === state.me.id));
  const chips = [
    `Upload · ${fmtDate(c.upload_date)}`,
    `Talent · ${c.type === "Video" ? optLabel(c.talent_name) || "Belum ditentukan" : "Tidak perlu"}`,
    `Take · ${c.type === "Video" ? optLabel(c.talent_status) : "Tidak perlu"}`,
    `Editor · ${userName(c.creative_user_id) || "Belum ditentukan"}`,
    `Creative · ${optLabel(c.creative_status)}`,
    `QC · ${optLabel(c.qc_status) || "Belum QC"}`,
    `Marketing · ${userName(c.marketing_user_id) || "—"}`,
  ];
  const published = c.published_date
    ? `<div class="note">✓ Tayang ${fmtDate(c.published_date)} · <a href="${esc(c.published_url)}" target="_blank" rel="noopener noreferrer">${esc(c.published_url)}</a> · dikonfirmasi ${esc(userName(c.published_by))}</div>`
    : "";
  const publishForm = canPublish
    ? `<div class="panel" style="margin-top:14px"><h3 style="margin-top:0">Konfirmasi sudah tayang</h3>
        <div class="grid"><div class="field"><label for="pUrl">Permalink</label><input id="pUrl" type="url" placeholder="https://www.tiktok.com/@…"></div>
        <div class="field"><label for="pDate">Tanggal tayang</label><input id="pDate" type="date" value="${state.today}" max="${state.today}"></div></div>
        <button class="btn primary" style="margin-top:12px" data-action="publish" data-id="${c.id}" data-revision="${c.revision}">Simpan konfirmasi</button></div>`
    : "";
  openModal(
    `<div class="modalhead"><div><div class="eyebrow">${esc(optLabel(c.app))} / ${typeLabel(c.type)} / SKRIP ${esc(contentNo(c))}${c.priority && c.priority !== "Reguler" ? ` · ${esc(c.priority.toUpperCase())}` : ""}</div><h2 id="modalTitle">${esc(c.title)}</h2></div><button class="close" aria-label="Tutup" data-action="close-modal">×</button></div>
    <div class="modalbody"><div class="inline-meta">${chips.map((x) => `<span>${esc(x)}</span>`).join("")}</div>
      ${published}${sheetMarkup(c.sheet, { read: true, id: contentNo(c), footageEdit: c.editable.includes("footage") })}
      <div class="note">Catatan: ${esc(c.notes) || "Belum ada catatan produksi."}</div>${publishForm}
      <details class="panel" style="margin-top:14px"><summary class="small" style="cursor:pointer">Riwayat perubahan (${c.events.length})</summary><ul class="events">
        ${c.events.map((e) => `<li><b>${esc(e.user_name ?? "—")}</b> · ${esc(FIELD_LABEL[e.field] ?? e.field)}${e.field === "sheet" || e.field === "created" ? "" : `: ${esc(eventValue(e.field, e.from_value))} → ${esc(eventValue(e.field, e.to_value))}`}<div class="small">${esc(fmtStamp(e.at))}</div></li>`).join("")}
      </ul></details></div>
    <div class="foot"><div class="left">${c.canDelete ? `<button class="btn danger" data-action="delete-content" data-id="${c.id}">${icon("trash", 16)} Hapus skrip</button>` : ""}${leads("Marketing") && c.published_date ? `<button class="btn" data-action="unpublish" data-id="${c.id}">Batalkan status tayang</button>` : ""}</div>
      <button class="btn" data-action="close-modal">Tutup</button>${c.editable.includes("sheet") ? `<button class="btn primary" data-action="edit-content" data-id="${c.id}">Edit skrip & info</button>` : ""}</div>`,
    { wide: true },
  );
  draft = { id: c.id, content: c };
}

/** Hapus skrip permanen (setelah konfirmasi); dipakai dari detail dan kolom Aksi tabel. */
export async function deleteContent(id) {
  const c = state.contents.find((x) => x.id === id) ?? draft?.content;
  const name = c ? `${typeLabel(c.type)} ${contentNo(c)} · "${c.title}"` : "skrip ini";
  if (!confirm(`Hapus ${name}?\n\nSkrip, riwayat perubahan, dan file footage yang diunggah akan terhapus permanen dan tidak bisa dikembalikan.`)) return;
  try {
    await api("DELETE", `/api/contents/${id}`, {});
    await reloadContents();
    if (!$("overlay").classList.contains("hidden")) closeModal();
    toast("Skrip dihapus");
    window.dispatchEvent(new Event("cs:changed"));
  } catch (e) {
    toast(errorText(e), { error: true });
  }
}

// Format teks: bungkus seleksi di kotak skrip dengan **tebal** atau *miring*.
let lastField = null;
document.addEventListener("focusin", (e) => {
  if (e.target.matches?.("#editorForm textarea[data-path]")) lastField = e.target;
});
function applyMark(field, mark) {
  if (!field) return;
  const { selectionStart: a, selectionEnd: b, value } = field;
  const picked = value.slice(a, b) || "teks";
  field.value = value.slice(0, a) + mark + picked + mark + value.slice(b);
  field.focus();
  field.setSelectionRange(a + mark.length, a + mark.length + picked.length);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}
document.addEventListener("keydown", (e) => {
  if (!(e.ctrlKey || e.metaKey) || !e.target.matches?.("#editorForm textarea[data-path]")) return;
  const k = e.key.toLowerCase();
  if (k === "b" || k === "i") {
    e.preventDefault();
    applyMark(e.target, k === "b" ? "**" : "*");
  }
});
let draftTimer;
document.addEventListener("input", (e) => {
  if (!e.target.closest?.("#editorForm")) return;
  dirty = true;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(storeDraft, 600);
});
document.addEventListener("change", (e) => {
  if (e.target.closest?.("#editorForm .top-fields")) {
    dirty = true;
    storeDraft();
  }
});

// ───────────── link footage → ikon ─────────────
function setBoxLinks(box, links) {
  box.dataset.links = JSON.stringify(links);
  box.querySelector(".ft2-links").innerHTML = linkChips(links);
  box.querySelector("textarea").dispatchEvent(new Event("input", { bubbles: true }));
  if (!$("editorForm")) saveDetailFootage();
}
function addFootageLink(box) {
  const input = box.querySelector("[data-ft2-link]");
  const urls = input.value.match(/https?:\/\/[^\s<]+/g);
  if (!urls) return input.value.trim() && toast("Link harus diawali https://", { error: true });
  input.value = "";
  setBoxLinks(box, [...new Set([...boxList(box, "links"), ...urls])]);
}
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || !e.target.matches?.("[data-ft2-link]")) return;
  e.preventDefault(); // jangan ikut menyimpan form
  addFootageLink(e.target.closest(".ft2"));
});
// Link yang ditempel di catatan footage dipindah menjadi ikon (sebelum autosave di detail berjalan).
document.addEventListener("change", (e) => {
  if (e.target.matches?.("[data-ft2-link]")) return addFootageLink(e.target.closest(".ft2"));
  if (!e.target.matches?.(".ft2 > textarea")) return;
  const urls = e.target.value.match(/https?:\/\/[^\s<]+/g);
  if (!urls) return;
  const box = e.target.closest(".ft2");
  e.target.value = e.target.value.replace(/https?:\/\/[^\s<]+/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  box.dataset.links = JSON.stringify([...new Set([...boxList(box, "links"), ...urls])]);
  box.querySelector(".ft2-links").innerHTML = linkChips(boxList(box, "links"));
}, true);
// Ikon link di bawah keterangan desain / arahan dan ringkasan diperbarui saat mengetik.
document.addEventListener("input", (e) => {
  if (e.target.matches?.("#editorForm .rt textarea")) {
    const holder = e.target.parentElement.querySelector(".dir-links");
    if (holder) holder.innerHTML = textLinks(e.target.value);
  }
});
// Isian yang sama di dua tempat (mis. Kata kunci) selalu sinkron.
document.addEventListener("input", (e) => {
  const path = e.target.dataset?.path;
  if (!path || !e.target.closest("#editorForm")) return;
  document.querySelectorAll(`#editorForm [data-path="${path}"]`).forEach((el) => el !== e.target && (el.value = e.target.value));
});

// Unggah dari kolom Footage / Ilustrasi: file tampil sebagai daftar di kolom itu.
let uploading = 0;
delegate(document.body, "change", {
  "footage-save": () => saveDetailFootage(),
  "ft2-upload": async (el) => {
    const files = [...el.files];
    el.value = "";
    if (!files.length) return;
    const box = el.closest(".ft2");
    const label = el.parentElement.querySelector("span");
    const params = draft.id ? { content_id: draft.id } : { app: $("eApp").value, type: draft.type };
    const submit = document.querySelector('#editorForm button[type="submit"]');
    const inDetail = !submit;
    uploading++;
    if (submit) submit.disabled = true;
    try {
      for (const file of files) {
        const res = await uploadFile(file, params, (pct) => label && (label.textContent = `Mengunggah ${file.name.slice(0, 24)} · ${pct}%`));
        if (!draft.id) uploadedIds.push(res.id);
        const list = JSON.parse(box.dataset.files || "[]");
        list.push({ name: file.name, url: `${location.origin}${res.url}` });
        box.dataset.files = JSON.stringify(list);
        box.querySelector(".ft2-files").innerHTML = fileChips(list);
        box.querySelector("textarea").dispatchEvent(new Event("input", { bubbles: true }));
      }
      if (inDetail) await saveDetailFootage();
      else toast(`${files.length} file terunggah`);
    } catch (e) {
      toast(e.message, { error: true });
    } finally {
      if (label) label.textContent = "＋ Upload file";
      if (--uploading === 0 && submit) submit.disabled = false;
    }
  },
});

/** Simpan kolom FOOTAGE dari tampilan detail (semua peran). */
async function saveDetailFootage() {
  const c = draft?.content;
  if (!c) return;
  const val = (path) => {
    const box = document.querySelector(`#modal .ft2[data-fpath="${path}"]`);
    if (box) return footageValue(box);
    return document.querySelector(`#modal textarea[data-path="${path}"]`)?.value ?? "";
  };
  const footage = {
    // Baris yang tidak tampil di detail tetap memakai nilai lamanya.
    metaFootage: (c.sheet.meta ?? []).map((_, i) => (document.querySelector(`#modal .ft2[data-fpath="metaFootage.${i}"]`) ? val(`metaFootage.${i}`) : c.sheet.metaFootage?.[i] ?? "")),
    rows: c.sheet.rows.map((_, i) => val(`rows.${i}.footage`)),
  };
  try {
    draft.content = await updateContent(c.id, { footage });
    toast("Footage tersimpan");
  } catch (e) {
    toast(errorText(e), { error: true });
  }
}

delegate(document.body, "click", {
  fmt: (el) => applyMark(el.dataset.target ? document.querySelector(`#modal textarea[data-path="${el.dataset.target}"]`) : lastField, el.dataset.mark),
  "switch-type": (el) => {
    const type = el.dataset.type;
    if (draft.id || type === draft.type) return;
    if (uploading) return toast("Tunggu unggahan footage selesai.");
    captureSheet();
    const written = draft.sheet.rows.some((r) => r.text?.trim() || r.footage?.trim() || r.direction?.trim());
    if (written && !confirm(`Ganti ke ${typeLabel(type)}? Isi tabel akan dikosongkan (judul, kata kunci & caption tetap).`)) return;
    const { title, keyword, caption1, caption2 } = draft.sheet;
    draft.type = type;
    draft.sheet = { ...blankSheet(type), title, keyword, caption1, caption2 };
    renderEditor(null);
  },
  "ft2-unlink": (el) => {
    const box = el.closest(".ft2");
    const links = boxList(box, "links");
    links.splice(Number(el.dataset.index), 1);
    setBoxLinks(box, links);
  },
  "ck-export": () => {
    captureSheet();
    const data = { type: draft.type, app: $("eApp").value, upload_date: $("eUpload").value, priority: $("ePriority").value, sheet: draft.sheet };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    a.download = `skrip-${(draft.sheet.title || "konten").replace(/[^\w-]+/g, "-").slice(0, 40)}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  },
  "ft2-remove": (el) => {
    const box = el.closest(".ft2");
    const list = JSON.parse(box.dataset.files || "[]");
    list.splice(Number(el.dataset.index), 1);
    box.dataset.files = JSON.stringify(list);
    box.querySelector(".ft2-files").innerHTML = fileChips(list);
    box.querySelector("textarea").dispatchEvent(new Event("input", { bubbles: true }));
    if (!$("editorForm")) saveDetailFootage();
  },
  "draft-restore": () => {
    if (!pendingDraft) return;
    const { saved, c } = pendingDraft;
    pendingDraft = null;
    if (!c && saved.type) draft.type = saved.type;
    draft.sheet = saved.sheet;
    renderEditor(c);
    applyFields(saved.fields);
    dirty = true;
    toast("Draf dipulihkan");
  },
  "draft-discard": () => {
    pendingDraft = null;
    clearDraft();
    $("draftBanner").classList.add("hidden");
  },
  "edit-content": () => openEditor(draft.content, draft.content.type),
  "add-stage": () => {
    if (uploading) return toast("Tunggu unggahan footage selesai.");
    captureSheet();
    const rows = draft.sheet.rows;
    if (rows.length >= MAX_ROWS[draft.type]) return toast(`Maksimal ${MAX_ROWS[draft.type]} ${draft.type === "Video" ? "baris" : "slide"}.`);
    rows.splice(rows.length - 1, 0, { label: "", text: "", footage: "", direction: "" });
    relabel();
    renderEditor(draft.id ? state.contents.find((x) => x.id === draft.id) : null);
  },
  "remove-stage": (el) => {
    if (uploading) return toast("Tunggu unggahan footage selesai.");
    captureSheet();
    const rows = draft.sheet.rows;
    const i = el.dataset.index ? Number(el.dataset.index) : rows.length - 2;
    if (rows.length <= 3 || i <= 0 || i >= rows.length - 1) return toast("Pertahankan hook / slide utama, satu isi, dan CTA.");
    const r = rows[i];
    if ((r.text?.trim() || r.footage?.trim()) && !confirm(`Hapus bagian "${r.label}" beserta isinya?`)) return;
    rows.splice(i, 1);
    relabel();
    renderEditor(draft.id ? state.contents.find((x) => x.id === draft.id) : null);
  },
  publish: async (el) => {
    try {
      await api("POST", `/api/contents/${el.dataset.id}/publish`, { revision: Number(el.dataset.revision), url: $("pUrl").value.trim(), date: $("pDate").value });
      await reloadContents();
      toast("Status tayang tersimpan");
      openDetail(Number(el.dataset.id));
      window.dispatchEvent(new Event("cs:changed"));
    } catch (e) {
      toast(errorText(e), { error: true });
    }
  },
  unpublish: async (el) => {
    if (!confirm("Batalkan status tayang konten ini?")) return;
    await api("DELETE", `/api/contents/${el.dataset.id}/publish`, {}).catch((e) => toast(errorText(e)));
    await reloadContents();
    openDetail(Number(el.dataset.id));
    window.dispatchEvent(new Event("cs:changed"));
  },
  "delete-content": (el) => deleteContent(Number(el.dataset.id)),
});
