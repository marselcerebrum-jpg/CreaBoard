// Footage: helper unggah file dari komputer (disimpan di server CreaBoard).
// Footage diisi di kolom Footage / Ilustrasi pada Create Konten dan detail skrip.

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
