// Pemilih jenis konten, editor skrip (layout worksheet), detail, dan konfirmasi tayang.
import {
  $, api, closeModal, delegate, errorText, esc, fmtDate, fmtStamp, leads, myApps, openModal, optionTags, optLabel, reloadContents,
  sem, state, toast, typeLabel, usersByRole, userName,
} from "./core.js";
import { updateContent } from "./worksheet.js";

const MAX_ROWS = { Video: 12, Carousel: 10, Singlepost: 2 };
const META = {
  Video: ["Kata kunci", "Konsep konten · inframe / voice over", "Link contoh video", "Visual hook"],
  Carousel: ["Tema"],
  Singlepost: ["Judul / hook", "Sumber", "Image / ilustrasi"],
};
let draft = null; // { id, type, sheet, fields }

function blankSheet(type) {
  const labels = type === "Video" ? ["Hook", "Tahapan 1", "Tahapan 2", "Tahapan 3", "CTA"] : type === "Carousel" ? ["Slide utama", "Slide 2", "CTA"] : ["Isi", "CTA"];
  return {
    type,
    meta: META[type].map(() => ""),
    metaFootage: type === "Video" ? ["", "", "", ""] : undefined,
    metaEditing: type === "Video" ? ["", "", "", ""] : undefined,
    rows: labels.map((label) => ({ label, text: "", footage: "", direction: "" })),
    caption1: "",
    caption2: "",
    notes: "",
  };
}

// ───────────── markup sheet ─────────────
function cell(value, path, { read, cls = "", label } = {}) {
  if (read) return `<div class="read">${esc(value) || '<span class="unfilled">—</span>'}</div>`;
  return `<textarea class="${cls}" data-path="${path}" aria-label="${esc(label ?? path)}" placeholder="Tulis di sini…">${esc(value ?? "")}</textarea>`;
}

export function sheetMarkup(sh, { read = false, id } = {}) {
  const rows = sh.rows ?? [];
  const head = `SKRIP ${id ? `#${id}` : typeLabel(sh.type).toUpperCase()}`;
  if (sh.type === "Video") {
    const total = 4 + rows.length;
    return `<div class="sheet"><table><colgroup><col style="width:7%"><col style="width:23%"><col style="width:16%"><col style="width:17%"><col style="width:13%"><col style="width:12%"><col style="width:12%"></colgroup>
      <thead><tr><th colspan="2">${head}</th><th>FOOTAGE</th><th>ARAHAN EDITING</th><th>KETERANGAN</th><th>CAPTION TIKTOK</th><th>CAPTION INSTAGRAM</th></tr></thead><tbody>
      ${META.Video.map((label, i) => `<tr><td class="row-label">${label}</td><td>${cell(sh.meta[i], `meta.${i}`, { read, cls: "compact", label })}</td>
        <td class="footage">${cell(sh.metaFootage?.[i], `metaFootage.${i}`, { read, cls: "compact", label: `${label} footage` })}</td>
        <td class="editing">${cell(sh.metaEditing?.[i], `metaEditing.${i}`, { read, cls: "compact", label: `${label} arahan` })}</td>
        ${i === 0 ? `<td rowspan="${total}">${cell(sh.notes, "notes", { read, cls: "long", label: "Keterangan" })}</td><td rowspan="${total}">${cell(sh.caption1, "caption1", { read, cls: "long", label: "Caption TikTok" })}</td><td rowspan="${total}">${cell(sh.caption2, "caption2", { read, cls: "long", label: "Caption Instagram" })}</td>` : ""}</tr>`).join("")}
      ${rows.map((r, i) => `<tr><td class="row-label">${esc(r.label)}</td><td>${cell(r.text, `rows.${i}.text`, { read, label: `${r.label} skrip` })}</td>
        <td class="footage">${cell(r.footage, `rows.${i}.footage`, { read, label: `${r.label} footage` })}</td><td class="editing">${cell(r.direction, `rows.${i}.direction`, { read, label: `${r.label} arahan` })}</td></tr>`).join("")}
      </tbody></table></div>`;
  }
  if (sh.type === "Carousel") {
    return `<div class="sheet static"><table><colgroup><col style="width:12%"><col style="width:44%"><col style="width:22%"><col style="width:22%"></colgroup>
      <thead><tr><th colspan="2">${head}</th><th>KETERANGAN DESAIN</th><th>CAPTION</th></tr></thead><tbody>
      <tr><td class="row-label">Tema</td><td>${cell(sh.meta[0], "meta.0", { read, cls: "compact", label: "Tema" })}</td><td>${cell(sh.notes, "notes", { read, cls: "compact", label: "Keterangan umum" })}</td>
        <td rowspan="${rows.length + 1}">${cell(sh.caption1, "caption1", { read, cls: "long", label: "Caption" })}</td></tr>
      ${rows.map((r, i) => `<tr><td class="row-label">${esc(r.label)}</td><td>${cell(r.text, `rows.${i}.text`, { read, label: r.label })}</td><td>${cell(r.direction, `rows.${i}.direction`, { read, label: `${r.label} desain` })}</td></tr>`).join("")}
      </tbody></table></div>`;
  }
  const entries = [
    ["Judul / hook", sh.meta[0], "meta.0"], ["Sumber", sh.meta[1], "meta.1"], ["Image / ilustrasi", sh.meta[2], "meta.2"],
    ["Isi", rows[0]?.text, "rows.0.text"], ["CTA", rows[rows.length - 1]?.text, `rows.${rows.length - 1}.text`],
  ];
  return `<div class="sheet static"><table><colgroup><col style="width:12%"><col style="width:38%"><col style="width:25%"><col style="width:25%"></colgroup>
    <thead><tr><th colspan="2">${head}</th><th>KETERANGAN</th><th>CAPTION</th></tr></thead><tbody>
    ${entries.map(([label, v, path], i) => `<tr><td class="row-label">${label}</td><td>${cell(v, path, { read, cls: label === "Isi" ? "" : "compact", label })}</td>
      ${i === 0 ? `<td rowspan="5">${cell(sh.notes, "notes", { read, cls: "long", label: "Keterangan" })}</td><td rowspan="5">${cell(sh.caption1, "caption1", { read, cls: "long", label: "Caption" })}</td>` : ""}</tr>`).join("")}
    </tbody></table></div>`;
}

function captureSheet() {
  document.querySelectorAll("#modal [data-path]").forEach((el) => {
    const parts = el.dataset.path.split(".");
    let target = draft.sheet;
    for (const p of parts.slice(0, -1)) target = target[p] ??= [];
    target[parts.at(-1)] = el.value;
  });
}

// ───────────── pemilih jenis & editor ─────────────
export function openContentPicker() {
  if (state.me.role !== "Marketing") return toast("Pembuatan skrip tersedia untuk Marketing.");
  if (state.me.position === "Staff" && !myApps().length) return toast("Anda belum memegang apps. Minta Leader Marketing membagikan apps.", { error: true });
  openModal(`<div class="modalhead"><div><div class="eyebrow">CREATE KONTEN</div><h2 id="modalTitle">Mau buat konten apa?</h2></div><button class="close" aria-label="Tutup" data-action="close-modal">×</button></div>
    <div class="modalbody"><div class="content-picker">
      <button class="type-choice" data-action="new-type" data-type="Video"><span class="type-icon">▷</span><strong>Video</strong></button>
      <button class="type-choice" data-action="new-type" data-type="Carousel"><span class="type-icon">▥</span><strong>Carrousel</strong></button>
      <button class="type-choice" data-action="new-type" data-type="Singlepost"><span class="type-icon">▧</span><strong>Singlepost</strong></button>
    </div></div><div class="foot"><button class="btn" data-action="close-modal">Batal</button></div>`);
}

function openEditor(content, type) {
  const c = content;
  draft = {
    id: c?.id ?? null,
    type: c?.type ?? type,
    sheet: c ? structuredClone(c.sheet) : blankSheet(type),
    revision: c?.revision,
  };
  if (!draft.sheet.rows?.length) draft.sheet = blankSheet(draft.type);
  renderEditor(c);
}

function renderEditor(c) {
  const t = draft.type;
  const editable = c ? c.editable : ["app", "created_date", "upload_date", "script_status", "talent_name", "creative_user_id"];
  const dis = (f) => (editable.includes(f) ? "" : "disabled");
  const creatives = usersByRole("Creative");
  const ready = c?.readyErrors ?? null;
  openModal(
    `<form id="editorForm"><div class="modalhead"><div><div class="eyebrow">${c ? `${esc(optLabel(c.app))} / ${typeLabel(t)} / SKRIP #${c.id}` : "CONTENT PLANNING"}</div>
      <h2 id="modalTitle">${c ? "Edit" : "Buat"} skrip ${typeLabel(t).toLowerCase()}${c ? ` #${c.id}` : ""}</h2></div><button type="button" class="close" aria-label="Tutup" data-action="close-modal">×</button></div>
    <div class="modalbody">
      <div class="top-fields">
        <div class="field"><label for="eCreated">Tanggal pengerjaan</label><input id="eCreated" type="date" required value="${c?.created_date ?? state.today}" ${dis("created_date")}></div>
        <div class="field"><label for="eApp">Apps</label><select id="eApp" ${dis("app")}>${optionTags("app", c?.app, { mine: true })}</select></div>
        <div class="field"><label for="eUpload">Tanggal upload</label><input id="eUpload" type="date" required value="${c?.upload_date ?? state.today}" ${dis("upload_date")}></div>
        <div class="field"><label for="eScript">Info skrip</label><select id="eScript" ${dis("script_status")}>${optionTags("script", c?.script_status ?? state.options.find((o) => o.key === "script" && o.semantic === "Draft" && !o.archived)?.id)}</select></div>
        <div class="field"><label for="eEditor">Editor</label><select id="eEditor" ${dis("creative_user_id")}><option value="">Belum ditentukan</option>${creatives.map((u) => `<option value="${u.id}" ${c?.creative_user_id === u.id ? "selected" : ""}>${esc(u.name)}</option>`).join("")}</select></div>
        ${leads("Marketing") ? `<div class="field"><label for="eOwner">Penanggung jawab skrip</label><select id="eOwner">${usersByRole("Marketing").map((u) => `<option value="${u.id}" ${(c?.marketing_user_id ?? state.me.id) === u.id ? "selected" : ""}>${esc(u.name)}${u.id === state.me.id ? " (saya)" : ""}</option>`).join("")}</select></div>` : ""}
        ${t === "Video" ? `<div class="field"><label for="eTalent">Talent</label><select id="eTalent" ${dis("talent_name")}>${optionTags("talentName", c?.talent_name, { blank: "Belum ditentukan" })}</select></div>` : ""}
      </div>
      ${ready ? `<div class="ready-check ${ready.length ? "" : "ok"}">${ready.length ? `Syarat skrip ready yang belum terpenuhi:<ul>${ready.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>` : "✓ Isi skrip lengkap — bisa ditandai Skrip ready."}</div>` : ""}
      ${t === "Singlepost" ? "" : `<div class="toolbar"><button type="button" class="btn mini" data-action="add-stage">＋ ${t === "Video" ? "Tahapan" : "Slide"}</button><button type="button" class="btn mini" data-action="remove-stage">− Terakhir</button></div>`}
      ${sheetMarkup(draft.sheet, { id: c?.id })}
      <p id="editorError" class="form-error hidden" role="alert" style="margin-top:14px"></p>
    </div>
    <div class="foot"><button type="button" class="btn" data-action="close-modal">Batal</button><button class="btn primary" type="submit">Simpan konten</button></div></form>`,
    { wide: true },
  );
  $("editorForm").addEventListener("submit", (e) => {
    e.preventDefault();
    saveEditor(c);
  });
}

async function saveEditor(c) {
  captureSheet();
  const fields = {
    created_date: $("eCreated").value,
    app: $("eApp").value,
    upload_date: $("eUpload").value,
    script_status: $("eScript").value,
    creative_user_id: $("eEditor").value ? Number($("eEditor").value) : null,
    ...(draft.type === "Video" ? { talent_name: $("eTalent").value || null } : {}),
    ...($("eOwner") ? { marketing_user_id: Number($("eOwner").value) } : {}),
  };
  const errorEl = $("editorError");
  try {
    if (!draft.sheet.meta[0]?.trim()) throw new Error(draft.type === "Video" ? "Kata kunci perlu diisi." : draft.type === "Carousel" ? "Tema carrousel perlu diisi." : "Judul / hook perlu diisi.");
    if (c) {
      const changes = { sheet: draft.sheet };
      for (const [k, v] of Object.entries(fields)) if (c.editable.includes(k) && v !== c[k]) changes[k] = v;
      await updateContent(c.id, changes);
    } else {
      await api("POST", "/api/contents", { type: draft.type, sheet: draft.sheet, ...fields });
      await reloadContents();
    }
    closeModal();
    toast("Skrip tersimpan. Dashboard sudah diperbarui.");
    window.dispatchEvent(new Event("cs:changed"));
  } catch (e) {
    errorEl.textContent = errorText(e);
    errorEl.classList.remove("hidden");
    errorEl.scrollIntoView({ block: "nearest" });
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
  const canArchive = leads("Marketing") || (state.me.role === "Marketing" && c.marketing_user_id === state.me.id && sem(c.creative_status) !== "Done" && !c.published_date);
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
    `<div class="modalhead"><div><div class="eyebrow">${esc(optLabel(c.app))} / ${typeLabel(c.type)} / SKRIP #${c.id}</div><h2 id="modalTitle">${esc(c.title)}</h2></div><button class="close" aria-label="Tutup" data-action="close-modal">×</button></div>
    <div class="modalbody"><div class="inline-meta">${chips.map((x) => `<span>${esc(x)}</span>`).join("")}</div>
      ${published}${sheetMarkup(c.sheet, { read: true, id: c.id })}
      <div class="note">Catatan: ${esc(c.notes) || "Belum ada catatan produksi."}</div>${publishForm}
      <details class="panel" style="margin-top:14px"><summary class="small" style="cursor:pointer">Riwayat perubahan (${c.events.length})</summary><ul class="events">
        ${c.events.map((e) => `<li><b>${esc(e.user_name ?? "—")}</b> · ${esc(FIELD_LABEL[e.field] ?? e.field)}${e.field === "sheet" || e.field === "created" ? "" : `: ${esc(eventValue(e.field, e.from_value))} → ${esc(eventValue(e.field, e.to_value))}`}<div class="small">${esc(fmtStamp(e.at))}</div></li>`).join("")}
      </ul></details></div>
    <div class="foot"><div class="left">${canArchive ? `<button class="btn danger" data-action="archive" data-id="${c.id}">Arsipkan</button>` : ""}${leads("Marketing") && c.published_date ? `<button class="btn" data-action="unpublish" data-id="${c.id}">Batalkan status tayang</button>` : ""}</div>
      <button class="btn" data-action="close-modal">Tutup</button>${c.editable.includes("sheet") ? `<button class="btn primary" data-action="edit-content" data-id="${c.id}">Edit skrip & info</button>` : ""}</div>`,
    { wide: true },
  );
  draft = { id: c.id, content: c };
}

delegate(document.body, "click", {
  "new-type": (el) => openEditor(null, el.dataset.type),
  "edit-content": () => openEditor(draft.content, draft.content.type),
  "add-stage": () => {
    captureSheet();
    const rows = draft.sheet.rows;
    if (rows.length >= MAX_ROWS[draft.type]) return toast(`Maksimal ${MAX_ROWS[draft.type]} ${draft.type === "Video" ? "baris" : "slide"}.`);
    const n = rows.length - 1;
    rows.splice(rows.length - 1, 0, { label: draft.type === "Video" ? `Tahapan ${n}` : `Slide ${n + 1}`, text: "", footage: "", direction: "" });
    renderEditor(draft.id ? state.contents.find((x) => x.id === draft.id) : null);
  },
  "remove-stage": () => {
    captureSheet();
    if (draft.sheet.rows.length <= 3) return toast("Pertahankan hook / slide utama, satu isi, dan CTA.");
    draft.sheet.rows.splice(draft.sheet.rows.length - 2, 1);
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
      toast(errorText(e));
    }
  },
  unpublish: async (el) => {
    if (!confirm("Batalkan status tayang konten ini?")) return;
    await api("DELETE", `/api/contents/${el.dataset.id}/publish`, {}).catch((e) => toast(errorText(e)));
    await reloadContents();
    openDetail(Number(el.dataset.id));
    window.dispatchEvent(new Event("cs:changed"));
  },
  archive: async (el) => {
    if (!confirm("Arsipkan konten ini? Konten arsip tidak muncul di dashboard.")) return;
    try {
      await api("DELETE", `/api/contents/${el.dataset.id}`, {});
      await reloadContents();
      closeModal();
      toast("Konten diarsipkan");
      window.dispatchEvent(new Event("cs:changed"));
    } catch (e) {
      toast(errorText(e));
    }
  },
});
