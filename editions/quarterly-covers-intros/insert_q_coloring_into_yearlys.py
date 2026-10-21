#!/usr/bin/env python3
"""Insert quarter-cover coloring pages into the yearly editions.

For each yearly (12 undated zodiac volumes + the 2028 planner), the four
quarter covers are converted to line art (matching the house coloring-page
style) and inserted at the quarter boundaries inside the volume.
Originals untouched; output to yearlys-with-q-coloring-2026-10-20/.
"""
import json, os, re, subprocess, glob
from PIL import Image, ImageFilter
from pypdf import PdfReader, PdfWriter

YF = os.path.expanduser("~/workspace/your_files")
TMP = os.path.expanduser("~/workspace/quarterly-build/tmp")
OUT = os.path.join(YF, "yearlys-with-q-coloring-2026-10-20")
os.makedirs(OUT, exist_ok=True)
LINE = os.path.join(TMP, "line"); os.makedirs(LINE, exist_ok=True)

def line_art(src_png, out_pdf):
    im = Image.open(src_png).convert("L")
    im = im.filter(ImageFilter.GaussianBlur(1.2))
    edges = im.filter(ImageFilter.FIND_EDGES)
    edges = edges.filter(ImageFilter.MaxFilter(5))  # bold the linework
    # invert + hard threshold: black lines on white (C-speed LUT)
    out = edges.point(lambda v: 0 if v > 30 else 255).convert("RGB")
    png = out_pdf.replace(".pdf", ".png")
    out.save(png)
    subprocess.run(["python3", "-c",
        f"from PIL import Image; Image.open('{png}').save('{out_pdf}', 'PDF', resolution=300.0)"],
        check=True)
    return out_pdf

def norm(s):
    return re.sub(r"\s+", " ", (s or "").lower()).strip()

def find_page(texts, probe):
    p = norm(probe)
    for i, t in enumerate(texts):
        if p in t: return i
    # loosen: first 5 words
    p2 = " ".join(p.split()[:5])
    for i, t in enumerate(texts):
        if p2 in t: return i
    return None

def page_texts(pdf):
    r = PdfReader(pdf)
    return r, [norm(p.extract_text()) for p in r.pages]

def assemble(src_pdf, inserts, out_pdf):
    """inserts: {page_index: [extra pdf paths inserted BEFORE that page]}"""
    r = PdfReader(src_pdf); w = PdfWriter()
    for i, page in enumerate(r.pages):
        for extra in inserts.get(i, []):
            for p in PdfReader(extra).pages: w.add_page(p)
        w.add_page(page)
    with open(out_pdf, "wb") as f: w.write(f)
    return len(r.pages)

# ---------------- zodiac yearlys ----------------
SIGNS = ["aries","taurus","gemini","cancer","leo","virgo",
         "libra","scorpio","sagittarius","capricorn","aquarius","pisces"]
for sign in SIGNS:
    meta = json.load(open(os.path.expanduser(f"~/workspace/zodiac-rebuild/content/{sign}-final.json")))
    src = os.path.join(YF, "zodiac-rebuild-2026-10-19", f"{sign.capitalize()}-OffScript-Undated-Edition-2026-10-19.pdf")
    r, texts = page_texts(src)
    inserts = {}
    for q, dayno in ((1, 1), (2, 92), (3, 183), (4, 274)):
        day = meta["days"][dayno - 1]
        idx = find_page(texts, day["question"])
        assert idx is not None, f"{sign} day {dayno} not found"
        lp = line_art(os.path.join(TMP, f"cover-{sign}-q{q}.png"), os.path.join(LINE, f"{sign}-q{q}.pdf"))
        inserts.setdefault(idx, []).append(lp)
    n = assemble(src, inserts, os.path.join(OUT, os.path.basename(src)))
    print(sign, "inserted at", {k: v for k, v in sorted(inserts.items())}, "| pages", n, "->", n + 4)

# ---------------- 2028 yearly ----------------
seasons = []
for f in sorted(glob.glob(os.path.expanduser("~/workspace/planner-2028/seasons-content/*.json"))):
    seasons += json.load(open(f))["days"]
by_date = {d["date"]: d for d in seasons}
src = os.path.join(YF, "LifeOS-OffScript-2028-Planner-2026-10-19.pdf")
r, texts = page_texts(src)
inserts = {}
for q, dte in ((1, "2028-01-01"), (2, "2028-04-01"), (3, "2028-07-01"), (4, "2028-10-01")):
    idx = find_page(texts, by_date[dte]["q"])
    assert idx is not None, f"2028 {dte} not found"
    lp = line_art(os.path.join(TMP, f"cover-2028-q{q}.png"), os.path.join(LINE, f"2028-q{q}.pdf"))
    inserts.setdefault(idx, []).append(lp)
n = assemble(src, inserts, os.path.join(OUT, os.path.basename(src)))
print("2028 inserted at", sorted(inserts), "| pages", n, "->", n + 4)
print("ALL DONE")
