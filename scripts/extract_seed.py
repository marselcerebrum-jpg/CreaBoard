"""Bangun data/seed.js dari workbook konten (sheet Creative + skrip JadiASN).

Pemakaian: python3 scripts/extract_seed.py path/ke/CONTOH.xlsx
"""
import datetime
import json
import re
import sys
from pathlib import Path

import openpyxl

SKRIP_RE = re.compile(r"\s*SKRIP\s*(\d+)\s*$", re.I)


def txt(v):
    if v is None:
        return ""
    if isinstance(v, datetime.datetime):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def blocks(ws, col, ncols, max_rows):
    """Kumpulkan blok 'SKRIP n' dari kolom label `col` (1-based)."""
    starts = [r for r in range(1, ws.max_row + 1)
              if isinstance(ws.cell(r, col).value, str) and SKRIP_RE.match(ws.cell(r, col).value)]
    out = []
    for i, r in enumerate(starts):
        end = min(starts[i + 1] if i + 1 < len(starts) else r + max_rows + 1, r + max_rows + 1)
        head = {txt(ws.cell(r, c).value).upper(): c for c in range(col + 1, col + ncols)
                if txt(ws.cell(r, c).value)}
        out.append((int(SKRIP_RE.match(ws.cell(r, col).value).group(1)), r, end, head))
    return out


def col_text(ws, c, r1, r2):
    skip = {"TIKTOK", "INSTAGRAM"}
    vals = [txt(ws.cell(r, c).value) for r in range(r1, r2)]
    return "\n".join(v for v in vals if v and v.upper() not in skip)


def video_scripts(ws):
    res = {}
    for n, r, end, head in blocks(ws, 1, 9, 11):
        cap = head.get("CAPTION")
        ig = next((c for c in range(1, 10) if txt(ws.cell(r + 1, c).value).upper() == "INSTAGRAM"), None)
        rows = []
        for rr in range(r + 1, end):
            label = txt(ws.cell(rr, 1).value)
            if not label:
                continue
            rows.append({
                "label": label,
                "text": txt(ws.cell(rr, 2).value),
                "footage": txt(ws.cell(rr, head["FOOTAGE"]).value) if "FOOTAGE" in head else "",
                "ket": txt(ws.cell(rr, head["KETERANGAN"]).value) if "KETERANGAN" in head else "",
            })
        res.setdefault(n, {
            "rows": rows,
            "captionTiktok": col_text(ws, cap, r + 1, end) if cap else "",
            "captionIg": col_text(ws, ig, r + 1, end) if ig else "",
        })
    return res


def simple_scripts(ws):
    """Carousel & single post: label di A, isi di B, KET di C, caption di D."""
    res = []
    for n, r, end, head in blocks(ws, 1, 4, 14):
        rows = [{"label": txt(ws.cell(rr, 1).value), "text": txt(ws.cell(rr, 2).value),
                 "ket": txt(ws.cell(rr, 3).value)}
                for rr in range(r + 1, end) if txt(ws.cell(rr, 1).value)]
        res.append({"rows": rows, "caption": col_text(ws, 4, r + 1, end)})
    return res


def tracker(ws, jenis, cols):
    out = []
    for r in range(5, ws.max_row + 1):
        no = ws[f"{cols['no']}{r}"].value
        if no is None:
            continue
        rec = {"brand": "JADIASN", "jenis": jenis, "no": int(no)}
        for key, c in cols.items():
            if key != "no":
                rec[key] = txt(ws[f"{c}{r}"].value)
        out.append(rec)
    return out


def main(path):
    wb = openpyxl.load_workbook(path)
    cr = wb["Creative"]
    rows = []
    rows += tracker(cr, "VIDEO", dict(no="A", tgl="B", usp="C", info="D", talent="E", editor="F",
                                      creative="G", link="H", qc="I", uploadTgl="J", uploadJam="K",
                                      yt="L", catatan="M", keterangan="N"))
    rows += tracker(cr, "CAROUSEL", dict(no="P", tgl="Q", usp="R", info="S", editor="T", creative="U",
                                         link="V", qc="W", uploadTgl="X", uploadJam="Y",
                                         catatan="Z", keterangan="AA"))
    rows += tracker(cr, "SINGLE", dict(no="AC", tgl="AD", usp="AE", info="AF", creative="AG", link="AH",
                                       qc="AI", uploadTgl="AJ", uploadJam="AK", catatan="AL",
                                       keterangan="AM"))
    rows += tracker(cr, "YOUTUBE", dict(no="AO", tgl="AP", usp="AQ", info="AR", creative="AS", link="AT",
                                        qc="AU", uploadTgl="AV", uploadJam="AW", catatan="AZ",
                                        keterangan="BA"))
    # Baris kosong di tracker (nomor ada tapi belum ada skrip) tidak ditampilkan.
    rows = [r for r in rows if r.get("usp") or r.get("info")]
    for r in rows:
        r["yt"] = r.get("yt") == "True"

    video = video_scripts(wb["SKRIP KONTEN"])
    carousel = simple_scripts(wb["SKRIP CARROUSEL_"])
    single = simple_scripts(wb["SKRIP SINGLE POST"])
    for r in rows:
        s = None
        if r["jenis"] == "VIDEO":
            s = video.get(r["no"])
        elif r["jenis"] == "CAROUSEL" and r["no"] <= len(carousel):
            s = carousel[r["no"] - 1]
        elif r["jenis"] == "SINGLE" and r["no"] <= len(single):
            s = single[r["no"] - 1]
        if s and any(x.get("text") for x in s["rows"]):
            r["script"] = s
        r["id"] = f"{r['brand']}-{r['jenis']}-{r['no']}"

    out = Path(__file__).resolve().parent.parent / "data" / "seed.js"
    out.write_text("window.CREABOARD_SEED = " + json.dumps(rows, ensure_ascii=False) + ";\n", encoding="utf-8")
    print(f"{len(rows)} baris -> {out} ({out.stat().st_size // 1024} KB)")
    for j in ("VIDEO", "CAROUSEL", "SINGLE", "YOUTUBE"):
        sub = [r for r in rows if r["jenis"] == j]
        print(j, len(sub), "dengan skrip:", sum("script" in r for r in sub))


if __name__ == "__main__":
    main(sys.argv[1])
