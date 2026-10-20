#!/usr/bin/env python3
"""Build app edition packs from the delivered planner masters.

Outputs (server-data shape, matching the Q4 2026 pack):
  editions-content/cosmic-2028-pack.json   (dated, 366 days, 13 seasons)
  editions-content/zodiac-<sign>-pack.json (undated, 365 days, day-numbered)

2028 day mapping (per season, day index i within the season):
  holiday.name    = sky_event if present, else "<Sign> Season · <MODE>"
  holiday.action  = "<MODE> day in <Sign> season — <EDITION TITLE>"
  soulQuestions   = [day.q, powers pair question (cycling the sign's 8 pairs)]
  adventures      = [pair mission, next pair mission] (cycling)

Zodiac day mapping (day number n, 1-based):
  holiday.name    = "<Sign> · Day n"
  holiday.action  = "<EDITION TITLE> — <traits>"
  soulQuestions   = [question, question2]
  adventures      = missions
"""
import json, glob, os, calendar

OUT = os.path.expanduser("~/workspace/editions-content")
SRV = os.path.expanduser("~/workspace/off-script-life-os-tablet-build/server-data")
os.makedirs(OUT, exist_ok=True)

SIGNS = ["aries","taurus","gemini","cancer","leo","virgo",
         "libra","scorpio","sagittarius","capricorn","aquarius","pisces"]

def dump(pack, fname):
    for base in (OUT, SRV):
        with open(os.path.join(base, fname), "w") as f:
            json.dump(pack, f, ensure_ascii=False, indent=1)
    print(fname, "days:", len(pack["days"]))

# ---------- 2028 Cosmic Forecast ----------
powers = {}
for f in glob.glob(os.path.expanduser("~/workspace/planner-2028/powers-content/*.json")):
    d = json.load(open(f))
    powers[d["sign"].lower()] = d

days = {}
themes = {}
season_files = sorted(glob.glob(os.path.expanduser("~/workspace/planner-2028/seasons-content/*.json")))
for sf in season_files:
    s = json.load(open(sf))
    sign = s["sign"]
    pw = powers[sign.lower()]
    pairs = pw["pairs"]
    title = pw["edition"]
    for i, day in enumerate(sorted(s["days"], key=lambda x: x["date"])):
        pair = pairs[i % len(pairs)]
        nxt = pairs[(i + 1) % len(pairs)]
        sky = day.get("sky_event")
        days[day["date"]] = {
            "date": day["date"],
            "season": s["season"],
            "mode": day["mode"],
            "holiday": {
                "name": sky if sky else f"{sign} Season · {day['mode']}",
                "action": f"A {day['mode']} day in {sign} season — {title}.",
            },
            "soulQuestions": [day["q"], pair["question"]],
            "adventures": [pair["mission"], nxt["mission"]],
        }
# themes keyed by month: the season in force on the 15th
for m in range(1, 13):
    key = f"2028-{m:02d}-15"
    d = days[key]
    sign = d["season"]
    themes[calendar.month_name[m]] = {"name": sign, "theme": powers[d["season"].lower() if d["season"].lower() in powers else [k for k in powers if d['season'].lower().startswith(k)][0]]["edition"]}

pack2028 = {
    "edition": "cosmic-2028",
    "name": "2028 Cosmic Forecast — Life OS: Off*Script",
    "window": {"start": "2028-01-01", "end": "2028-12-31"},
    "themes": themes,
    "days": days,
}
assert len(days) == 366, len(days)
dump(pack2028, "cosmic-2028-pack.json")

# ---------- 12 undated zodiac editions ----------
for sign in SIGNS:
    src = json.load(open(os.path.expanduser(f"~/workspace/zodiac-rebuild/content/{sign}-final.json")))
    zdays = {}
    for i, day in enumerate(src["days"], start=1):
        sq = [day["question"]] + ([day["question2"]] if day.get("question2") else [])
        adv = list(day["missions"]) + ([day["finish"]] if day.get("finish") else [])
        zdays[str(i)] = {
            "day": i,
            "holiday": {
                "name": f"{sign.capitalize()} · Day {i}",
                "action": f"{src['edition_title']} — {src['traits']}",
            },
            "soulQuestions": sq,
            "adventures": adv,
        }
    pack = {
        "edition": f"zodiac-{sign}",
        "name": f"{sign.capitalize()} — {src['edition_title']} · Undated Edition",
        "undated": True,
        "themes": {},
        "days": zdays,
    }
    assert len(zdays) == 365
    dump(pack, f"zodiac-{sign}-pack.json")

print("done")
