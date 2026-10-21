#!/usr/bin/env python3
"""Quarterly covers + Off*Script intro pages.

Every quarterly volume gets:
  p1  an individual cover — parent art + a quarter band (quarter number,
      span, arc/season line) in the family palette: cohesive family,
      individual quarter.
  p2  an Off*Script intro page written for that quarter.
Original p1 is dropped (its art lives on in the new cover). Originals are
never touched; output goes to quarterly-covers-intros-2026-10-20/.
"""
import json, os, glob, subprocess, textwrap
from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader, PdfWriter
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT

YF = os.path.expanduser("~/workspace/your_files")
OUT = os.path.join(YF, "quarterly-covers-intros-2026-10-20")
TMP = os.path.expanduser("~/workspace/quarterly-build/tmp")
os.makedirs(OUT + "/2028", exist_ok=True)
os.makedirs(OUT + "/zodiac", exist_ok=True)
os.makedirs(TMP, exist_ok=True)

W, H = 2550, 3300  # Letter @300dpi
FB = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FS = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"

def font(path, size): return ImageFont.truetype(path, size)
def spaced(draw, xy, text, fnt, fill, spacing=10):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=fnt, fill=fill)
        x += draw.textlength(ch, font=fnt) + spacing
    return x

def cover_base(img, band_top, anchor="center"):
    """Fit image into the zone above the band (cover-crop, no distortion
    beyond a few percent), return composed RGB image with band area blank."""
    zone_h = band_top
    scale = max(W / img.width, zone_h / img.height)
    img2 = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    x = (img2.width - W) // 2
    if anchor == "top":
        y = 0
    else:
        y = max(0, (img2.height - zone_h) // 2 - 60)
    base = Image.new("RGB", (W, H), (10, 10, 14))
    base.paste(img2.crop((x, y, x + W, y + zone_h)), (0, 0))
    return base

def draw_band(base, band_top, band_color, rule_color, lines, qcolor=(250, 246, 239)):
    d = ImageDraw.Draw(base)
    d.rectangle([0, band_top, W, H], fill=band_color)
    d.rectangle([0, band_top, W, band_top + 14], fill=rule_color)
    # big Q block, left
    qlabel, qbig, span, sub, foot = lines
    d.text((150, band_top + 88), qlabel, font=font(FB, 58), fill=rule_color)
    d.text((140, band_top + 165), qbig, font=font(FS, 330), fill=qcolor)
    # right block
    rx = 880
    d.text((rx, band_top + 105), span, font=font(FB, 92), fill=(250, 246, 239))
    # wrap subtitle to width
    words, cur, yy = sub.split(), "", band_top + 245
    for w_ in words:
        t = (cur + " " + w_).strip()
        if d.textlength(t, font=font(FR, 62)) > W - rx - 130 and cur:
            d.text((rx, yy), cur, font=font(FR, 62), fill=(232, 226, 218)); yy += 82; cur = w_
        else: cur = t
    if cur: d.text((rx, yy), cur, font=font(FR, 62), fill=(232, 226, 218))
    d.text((150, H - 118), foot, font=font(FB, 46), fill=rule_color)
    return base

def img_to_pdf(img, path):
    img.save(path.replace(".pdf", ".png"))
    subprocess.run(["python3", "-c",
        f"from PIL import Image; Image.open('{path.replace('.pdf','.png')}').convert('RGB').save('{path}', 'PDF', resolution=300.0)"],
        check=True)

# ---------------------------------------------------------------- 2028 ----
pack = json.load(open(os.path.expanduser("~/workspace/editions-content/cosmic-2028-pack.json")))
suite = Image.open(os.path.join(YF, "Cosmic-Forecast-Suite-2028-cover-final-2026-10-19.png")).convert("RGB")
Q28 = {
    1: ("JANUARY – MARCH", "Capricorn's Tail · Aquarius · Pisces · Aries Rising"),
    2: ("APRIL – JUNE", "Aries · Taurus · Gemini — the Double Review"),
    3: ("JULY – SEPTEMBER", "Cancer · Leo · Virgo · Libra"),
    4: ("OCTOBER – DECEMBER", "Scorpio · Sagittarius · Capricorn Returns"),
}
RANGES28 = {1: ("2028-01-01", "2028-03-31"), 2: ("2028-04-01", "2028-06-30"),
            3: ("2028-07-01", "2028-09-30"), 4: ("2028-10-01", "2028-12-31")}
NAVY = (16, 26, 58); CYAN = (40, 215, 255)

def intro_2028(q):
    qs, qe = RANGES28[q]
    span, seasons = Q28[q]
    sky = []
    for dte in sorted(pack["days"]):
        if qs <= dte <= qe:
            nm = pack["days"][dte]["holiday"]["name"]
            if " Season · " not in nm and nm not in sky: sky.append((dte, nm))
    path = os.path.join(TMP, f"intro-2028-q{q}.pdf")
    c = canvas.Canvas(path, pagesize=letter)
    c.setFillColor(HexColor("#0B1230")); c.rect(0, 0, letter[0], letter[1], fill=1, stroke=0)
    c.setFillColor(HexColor("#28D7FF")); c.rect(0.75 * inch, letter[1] - 1.15 * inch, 1.6 * inch, 3, fill=1, stroke=0)
    def P(txt, style, y):
        p = Paragraph(txt, style); w, h = p.wrap(6.9 * inch, 700); p.drawOn(c, 0.8 * inch, y - h); return y - h
    eyebrow = ParagraphStyle("e", fontName="Helvetica-Bold", fontSize=10.5, textColor=HexColor("#EA4798"), leading=14)
    h1 = ParagraphStyle("h", fontName="Helvetica-Bold", fontSize=27, textColor=HexColor("#FAF6EF"), leading=33)
    body = ParagraphStyle("b", fontName="Helvetica", fontSize=12.5, textColor=HexColor("#E8E2DA"), leading=19)
    fact = ParagraphStyle("f", fontName="Helvetica", fontSize=12, textColor=HexColor("#BFE9FF"), leading=18)
    y = letter[1] - 1.5 * inch
    y = P("LIFE OS: OFF*SCRIPT · 2028 COSMIC FORECAST", eyebrow, y) - 10
    y = P(f"Before You Start — Quarter {q}", h1, y) - 16
    y = P(f"This quarter of the Cosmic Forecast year walks <b>{seasons}</b>. The yearly zodiac edition is about walking in someone else's shoes — and this is the stretch where the shoes are theirs, not yours. Every day carries one question in the season's voice — ACT, THINK, or FEEL — plus missions and soul-searching that sharpen that sign's powers by living them, never by drilling them.", body, y) - 10
    y = P("Work it one day at a time. Read the sky notes when they land: they are checkpoints, not decorations. Audits close each week — score honestly, name the pattern, pick one fix. Weeks here start on Sunday.", body, y) - 18
    y = P("<b>IN THIS QUARTER</b>", eyebrow, y) - 6
    y = P(f"{span.title()} 2028 · {sum(1 for d in pack['days'] if qs <= d <= qe)} days · weekly audits · the Missions &amp; Soul-Searching spread in every season chapter", fact, y) - 8
    for dte, nm in sky[:5]:
        nice = dte[5:].replace("-", "/")
        y = P(f"Sky checkpoint {nice}: {nm}", fact, y) - 2
    y -= 16
    y = P("Structure, not straightjackets. <b>Boredom = Death.</b>", body, y)
    c.showPage(); c.save()
    return path

PINK = (234, 71, 152); CREAM = (250, 246, 239)
WAYS28 = {1: (NAVY, CYAN), 2: (NAVY, PINK), 3: (PINK, NAVY), 4: (NAVY, CREAM)}
for q in (1, 2, 3, 4):
    span, seasons = Q28[q]
    band_c, acc_c = WAYS28[q]
    base = cover_base(suite, 2380, anchor="top")
    base = draw_band(base, 2380, band_c, acc_c,
                     ("QUARTER", f"Q{q}", span + " 2028", seasons,
                      "LIFE OS: OFF*SCRIPT · 2028 COSMIC FORECAST"))
    cov = os.path.join(TMP, f"cover-2028-q{q}.pdf"); img_to_pdf(base, cov)
    src_pdf = os.path.join(YF, f"LifeOS-OffScript-2028-Q{q}-2026-10-19.pdf")
    r = PdfReader(src_pdf); w_ = PdfWriter()
    for pg in [cov, intro_2028(q)]:
        for p in PdfReader(pg).pages: w_.add_page(p)
    for p in r.pages[1:]: w_.add_page(p)
    out = os.path.join(OUT, "2028", os.path.basename(src_pdf))
    with open(out, "wb") as f: w_.write(f)
    print("2028 Q%d:" % q, len(r.pages), "->", len(r.pages) + 1, "pages")

# ---------------------------------------------------------------- zodiac --
ARCS = {1: "THE OPENING — you meet the shadow",
        2: "THE DEEPENING — the pattern shows its roots",
        3: "THE RECKONING — no more negotiating",
        4: "THE RETURN — what you're keeping"}
QRANGE = {1: (1, 91), 2: (92, 182), 3: (183, 273), 4: (274, 365)}
SIGNS = ["aries","taurus","gemini","cancer","leo","virgo",
         "libra","scorpio","sagittarius","capricorn","aquarius","pisces"]

def intro_zodiac(sign, meta, q):
    a, b = QRANGE[q]
    audits = meta["audits"]
    au = audits[(q - 1) * 13]
    epi = au.get("key_lesson") or au.get("lesson") or ""
    pal = [HexColor(h) for h in meta["palette"]]
    path = os.path.join(TMP, f"intro-{sign}-q{q}.pdf")
    c = canvas.Canvas(path, pagesize=letter)
    c.setFillColor(HexColor("#FAF6EF")); c.rect(0, 0, letter[0], letter[1], fill=1, stroke=0)
    c.setFillColor(pal[0]); c.rect(0.75 * inch, letter[1] - 1.15 * inch, 1.6 * inch, 3, fill=1, stroke=0)
    def P(txt, style, y):
        p = Paragraph(txt, style); w, h = p.wrap(6.9 * inch, 700); p.drawOn(c, 0.8 * inch, y - h); return y - h
    eyebrow = ParagraphStyle("e", fontName="Helvetica-Bold", fontSize=10.5, textColor=pal[1], leading=14)
    h1 = ParagraphStyle("h", fontName="Helvetica-Bold", fontSize=27, textColor=HexColor("#1C1710"), leading=33)
    body = ParagraphStyle("b", fontName="Helvetica", fontSize=12.5, textColor=HexColor("#2A241C"), leading=19)
    fact = ParagraphStyle("f", fontName="Helvetica", fontSize=12, textColor=HexColor("#4A4034"), leading=18)
    epi_s = ParagraphStyle("q", fontName="Helvetica-Oblique", fontSize=12.5, textColor=pal[1], leading=18)
    y = letter[1] - 1.5 * inch
    y = P(f"LIFE OS: OFF*SCRIPT · {sign.upper()} — {meta['edition_title']} · UNDATED EDITION", eyebrow, y) - 10
    y = P(f"Before You Start — Quarter {q}", h1, y) - 8
    y = P(f"<b>{ARCS[q]}.</b>", body, y) - 12
    y = P(f"{meta['intro']} This volume is {sign.capitalize()} learning itself — and Quarter {q} is one act of that year: Days {a}–{b}, thirteen weekly audits, and the same daily rhythm as the full edition — {meta['question_label'].lower()} up front, {meta['missions_label'].lower()} out in the wild. Undated means it starts the day you do: write the date in yourself and begin.", body, y) - 10
    y = P("One day at a time. Questions first, missions in real life, audits on Sundays. If you miss a day, the book does not scold you — it waits. That's the whole method.", body, y) - 18
    y = P("<b>IN THIS QUARTER</b>", eyebrow, y) - 6
    y = P(f"Days {a}–{b} of 365 · 13 weekly audits · {meta['traits']} · from the full {sign.capitalize()} undated edition ({meta['edition_title']})", fact, y) - 12
    y = P("From this quarter's first audit:", eyebrow, y) - 4
    y = P(f"\u201c{epi}\u201d", epi_s, y) - 18
    y = P("Structure, not straightjackets. <b>Boredom = Death.</b>", body, y)
    c.showPage(); c.save()
    return path

splits = os.path.join(YF, "edition-quarter-splits-2026-10-19")
for sign in SIGNS:
    meta = json.load(open(os.path.expanduser(f"~/workspace/zodiac-rebuild/content/{sign}-final.json")))
    art = Image.open(os.path.expanduser(f"~/workspace/your_files/zodiac-covers-extracted/{meta["cover_file"]}")).convert("RGB")
    pal_rgb = [tuple(int(h[i:i+2], 16) for i in (1, 3, 5)) for h in meta["palette"]]
    INK = (24, 18, 12); CREAM = (250, 246, 239)
    ways = {1: (INK, pal_rgb[0]), 2: (pal_rgb[2], CREAM), 3: (pal_rgb[1], CREAM), 4: (pal_rgb[0], INK)}
    for q in (1, 2, 3, 4):
        a, b = QRANGE[q]
        band_c, acc_c = ways[q]
        base = cover_base(art, 2600)
        base = draw_band(base, 2600, band_c, acc_c,
                         ("QUARTER", f"Q{q}", f"DAYS {a}–{b}", ARCS[q].title(),
                          f"LIFE OS: OFF*SCRIPT · {sign.upper()} — {meta['edition_title']}"),
                         qcolor=CREAM if band_c != pal_rgb[0] else INK)
        cov = os.path.join(TMP, f"cover-{sign}-q{q}.pdf"); img_to_pdf(base, cov)
        folder = glob.glob(os.path.join(splits, f"Zodiac-{sign.capitalize()}-Undated"))[0]
        src_pdf = glob.glob(os.path.join(folder, f"*{sign.capitalize()}*Q{q}*.pdf"))[0]
        r = PdfReader(src_pdf); w_ = PdfWriter()
        for pg in [cov, intro_zodiac(sign, meta, q)]:
            for p in PdfReader(pg).pages: w_.add_page(p)
        for p in r.pages[1:]: w_.add_page(p)
        outdir = os.path.join(OUT, "zodiac", f"Zodiac-{sign.capitalize()}-Undated")
        os.makedirs(outdir, exist_ok=True)
        with open(os.path.join(outdir, os.path.basename(src_pdf)), "wb") as f: w_.write(f)
    print(sign, "quarters done")

print("ALL DONE")
