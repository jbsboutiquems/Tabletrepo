#!/usr/bin/env python3
"""Sampler 'IT'S LIVE' Etsy ad — 720x1280, 30fps, ~19s, PIL frames piped to ffmpeg."""
import subprocess, math, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, FPS, DUR = 720, 1280, 30, 19.0
N = int(FPS * DUR)
YF = os.path.expanduser("~/workspace/your_files")
F_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
F_R = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
PINK = (255, 53, 173); BLUE = (40, 215, 255); INK = (246, 247, 255); MUT = (183, 191, 213); CREAM = (255, 240, 214)

def font(p, s): return ImageFont.truetype(p, s)
def ctext(d, y, text, f, fill, tracking=0):
    if tracking:
        total = sum(d.textlength(ch, font=f) for ch in text) + tracking * (len(text) - 1)
        x = (W - total) / 2
        for ch in text:
            d.text((x, y), ch, font=f, fill=fill); x += d.textlength(ch, font=f) + tracking
    else:
        w = d.textlength(text, font=f); d.text(((W - w) / 2, y), text, font=f, fill=fill)

# background: vertical navy gradient + faint stars
def make_bg():
    bg = Image.new("RGB", (W, H))
    px = bg.load()
    for y in range(H):
        t = y / H
        px_row = (int(5 + 7 * t), int(8 + 10 * t), int(23 + 30 * t))
        for x in range(W): px[x, y] = px_row
    import random; random.seed(7)
    d = ImageDraw.Draw(bg)
    for _ in range(90):
        x, y, r = random.randint(0, W), random.randint(0, H), random.choice([1, 1, 2])
        c = random.choice([(90, 110, 160), (60, 130, 160), (150, 90, 140)])
        d.ellipse([x - r, y - r, x + r, y + r], fill=c)
    return bg
BG = make_bg()

cover = Image.open(os.path.join(YF, "Q4-2026-sampler-cover-print-2026-10-19.png")).convert("RGB")
subprocess.run(["pdftoppm", "-png", "-r", "95", "-f", "41", "-l", "41", "-singlefile",
                os.path.join(YF, "Q4-2026-Sampler-Pink-Forest-Coloring-with-cover-2026-10-19-FIXED.pdf"), "/tmp/ad-day"], check=True)
subprocess.run(["pdftoppm", "-png", "-r", "95", "-f", "203", "-l", "203", "-singlefile",
                os.path.join(YF, "Q4-2026-Sampler-Pink-Forest-Coloring-with-cover-2026-10-19-FIXED.pdf"), "/tmp/ad-sticker"], check=True)
subprocess.run(["pdftoppm", "-png", "-r", "95", "-f", "151", "-l", "151", "-singlefile",
                os.path.join(YF, "Q4-2026-Sampler-Pink-Forest-Coloring-with-cover-2026-10-19-FIXED.pdf"), "/tmp/ad-review"], check=True)
pages = [(Image.open("/tmp/ad-day.png").convert("RGB"), "DAILY KHAOS HOLIDAYS"),
         (Image.open("/tmp/ad-sticker.png").convert("RGB"), "STICKER SHEETS"),
         (Image.open("/tmp/ad-review.png").convert("RGB"), "THE YEAR-END REVIEW")]

def card(img, w):
    h = int(img.height * w / img.width)
    im = img.resize((w, h))
    frame = Image.new("RGB", (w + 8, h + 8), (240, 240, 245))
    frame.paste(im, (4, 4))
    return frame

def ease(t): return 1 - (1 - t) ** 3
def fade(t, a, b): return max(0.0, min(1.0, (t - a) / (b - a))) if b > a else (1.0 if t >= a else 0.0)

def scene(t):
    im = BG.copy(); d = ImageDraw.Draw(im, "RGBA")
    if t < 2.6:  # S1 hook
        s = 0.8 + 0.2 * ease(min(1, t / 0.5))
        f = font(F_B, int(118 * s))
        ctext(d, 470, "IT'S LIVE.", f, PINK)
        a = int(255 * fade(t, 0.5, 1.1))
        ctext(d, 640, "THE Q4 2026 SAMPLER", font(F_B, 40), (40, 215, 255, a))
        ctext(d, 700, "from Life OS: Off*Script", font(F_R, 30), (183, 191, 213, a))
    elif t < 6.2:  # S2 cover
        lt = (t - 2.6) / 3.6
        w = int(430 + 26 * lt)
        c = card(cover, w)
        im.paste(c, ((W - c.width) // 2, 150 + int(10 * (1 - ease(min(1, lt * 2))))))
        d = ImageDraw.Draw(im, "RGBA")
        a = int(255 * fade(t, 3.1, 3.7))
        ctext(d, 1015, "OCT — DEC 2026 · 204 PAGES", font(F_B, 34), (246, 247, 255, a))
        ctext(d, 1075, "one quarter, walked Off*Script", font(F_R, 28), (183, 191, 213, a))
    elif t < 11.2:  # S3 pages
        lt = t - 6.2
        idx = min(2, int(lt / 1.67))
        local = (lt - idx * 1.67) / 1.67
        img, cap = pages[idx]
        c = card(img, 500)
        x = (W - c.width) // 2 + int(26 * (1 - local) * (1 if idx % 2 == 0 else -1))
        im.paste(c, (x, 130))
        d = ImageDraw.Draw(im, "RGBA")
        ctext(d, 1085, cap, font(F_B, 40), PINK if idx != 1 else BLUE)
    elif t < 14.2:  # S4 checklist
        ctext(d, 300, "INSIDE:", font(F_B, 54), BLUE)
        lines = ["92 days of questions", "+ living adventures", "sticker sheets + coloring", "the year-end review"]
        for i, ln in enumerate(lines):
            a = int(255 * fade(t, 11.5 + i * 0.55, 11.9 + i * 0.55))
            f = font(F_B, 44)
            w = d.textlength(ln, font=f)
            d.text(((W - w) / 2, 430 + i * 95), ln, font=f, fill=(246, 247, 255, a))
    else:  # S5 CTA
        lt = t - 14.2
        s = 0.85 + 0.15 * ease(min(1, lt / 0.45))
        ctext(d, 300, "$10", font(F_B, int(210 * s)), CREAM)
        a = int(255 * fade(t, 14.8, 15.4))
        ctext(d, 580, "INSTANT DOWNLOAD ON ETSY", font(F_B, 40), (255, 53, 173, a))
        ctext(d, 650, "TheLifeOSPlanner · etsy.com", font(F_R, 32), (40, 215, 255, a))
        ctext(d, 1080, "LIFE OS: OFF*SCRIPT", font(F_B, 34), (246, 247, 255, a))
        ctext(d, 1140, "Boredom = Death.", font(F_B, 34), (255, 53, 173, a))
    return im

# audio: soft synth pad under the VO
subprocess.run(["ffmpeg", "-y", "-v", "error",
                "-f", "lavfi", "-i", "sine=frequency=196:duration=19",
                "-f", "lavfi", "-i", "sine=frequency=294:duration=19",
                "-f", "lavfi", "-i", "sine=frequency=392:duration=19",
                "-filter_complex", "[0:a][1:a][2:a]amix=inputs=3:normalize=0,volume=0.05,tremolo=f=0.4:d=0.5,afade=t=in:st=0:d=1.2,afade=t=out:st=17.6:d=1.4[pad]",
                "-map", "[pad]", "/tmp/ad-pad.m4a"], check=True)
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", "/tmp/ad-pad.m4a", "-i", os.path.join(YF, "ad-vo-2026-10-21.mp3"),
                "-filter_complex", "[1:a]adelay=400:all=1,volume=1.15[vo];[0:a][vo]amix=inputs=2:normalize=0,alimiter=limit=0.95[a]",
                "-map", "[a]", "-t", "19", "/tmp/ad-audio.m4a"], check=True)

ff = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "image2pipe", "-vcodec", "png", "-r", str(FPS),
                       "-i", "-", "-i", "/tmp/ad-audio.m4a", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                       "-crf", "19", "-preset", "medium", "-c:a", "aac", "-b:a", "160k", "-shortest",
                       os.path.join(YF, "sampler-etsy-launch-ad-2026-10-21.mp4")], stdin=subprocess.PIPE)
for i in range(N):
    import io
    buf = io.BytesIO(); scene(i / FPS).save(buf, "PNG"); ff.stdin.write(buf.getvalue())
ff.stdin.close(); ff.wait()
print("done", ff.returncode)
