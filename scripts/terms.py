"""The semesters kept by the site: one folder per semester in data/terms/<id>/ (id = "2026-2027-1": academic year and
semester number, 1 = الأول, 2 = الثاني, 3 = الصيفي), each with its own timetable.json, instructors.json and
seats_history.json.

The portal (edugate.uop.edu.jo/timetable) shows one semester only: the one it is preparing. Each hourly read is saved in
that semester's folder, so a semester stays on the site after the portal moves on to the next one.

The site's default semester (what data/timetable.json, data/instructors.json and data/seats_history.json hold, and what
every page shows unless the reader chooses another) is the semester being taught by the official academic calendar
(data/calendar.json): the last kept semester whose teaching starts within LEAD_DAYS from today. When the calendar does
not cover any kept semester, it is the portal's own semester.

data/terms/index.json lists the kept semesters for the pages' semester choice.
"""
import json
import os
import re
import shutil
from datetime import date, datetime, timedelta, timezone

ROOT = os.path.join(os.path.dirname(__file__), "..")
DATA = os.path.join(ROOT, "data")
TERMS = os.path.join(DATA, "terms")
INDEX = os.path.join(TERMS, "index.json")
SEM_NO = {"الأول": 1, "الثاني": 2, "الصيفي": 3}
SEM_KEY = {1: "first", 2: "second", 3: "summer"}
SEM_NAME = {1: "الفصل الأول", 2: "الفصل الثاني", 3: "الفصل الصيفي"}
LEAD_DAYS = 7  # the new semester becomes the default a week before its teaching starts (when the staff start work)
FILES = ("timetable.json", "instructors.json", "seats_history.json")


def parse(term):
    """'الفصل الثاني 2027/2026' -> ('2026-2027-2', '2026/2027', 2); None when the name is not of that form."""
    m = re.search(r"الفصل\s+(الأول|الثاني|الصيفي)\s+(\d{4})\s*/\s*(\d{4})", term or "")
    if not m:
        return None
    y0, y1 = sorted((int(m.group(2)), int(m.group(3))))
    if y1 != y0 + 1:
        return None
    n = SEM_NO[m.group(1)]
    return f"{y0}-{y1}-{n}", f"{y0}/{y1}", n


def folder(tid):
    return os.path.join(TERMS, tid)


def load(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def kept():
    """The kept semesters, oldest first: [(id, timetable)]."""
    out = []
    if os.path.isdir(TERMS):
        for tid in os.listdir(TERMS):
            tt = load(os.path.join(TERMS, tid, "timetable.json"))
            if tt and parse(tt.get("term")) and parse(tt["term"])[0] == tid:
                out.append((tid, tt))
    return sorted(out, key=lambda x: x[0])


def calendar_semester(term, cal):
    """The semester of the official calendar that is this term (same academic year and semester), or None."""
    p = parse(term)
    if not p or not cal:
        return None
    years = re.findall(r"\d{4}", str(cal.get("year", "")))
    if sorted(int(y) for y in years) != [int(y) for y in p[1].split("/")]:
        return None
    return next((s for s in cal.get("semesters", []) if s.get("key") == SEM_KEY[p[2]]), None)


def teaching_start(term, cal):
    sem = calendar_semester(term, cal)
    if not sem:
        return None
    d = next((e["start"] for e in sem["events"] if e["category"] == "teaching" and e["title"].startswith("بدء التدريس")), None)
    return date.fromisoformat(d) if d else None


def iso(d):
    return d.isoformat() if d else ""


def today_amman():
    return (datetime.now(timezone.utc) + timedelta(hours=3)).date()


def choose_default(terms, portal_id, cal, today=None):
    today = today or today_amman()
    started = [(teaching_start(tt["term"], cal), tid) for tid, tt in terms]
    started = [(d, tid) for d, tid in started if d and d - timedelta(days=LEAD_DAYS) <= today]
    if started:
        return max(started)[1]
    ids = [tid for tid, _ in terms]
    return portal_id if portal_id in ids else (ids[-1] if ids else None)


def write_if_changed(path, text):
    if os.path.exists(path):
        with open(path, encoding="utf-8", newline="") as f:
            if f.read() == text:
                return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(text)
    return True


def copy_if_changed(src, dst):
    with open(src, encoding="utf-8", newline="") as f:
        return write_if_changed(dst, f.read())


def publish(portal_id=None):
    """Write data/terms/index.json and copy the default semester's files to data/. Returns the default id."""
    cal = load(os.path.join(DATA, "calendar.json"))
    old = load(INDEX, {})
    portal_id = portal_id or old.get("portal")
    terms = kept()
    default = choose_default(terms, portal_id, cal)
    if not default:
        return None
    index = {
        "default": default,
        "portal": portal_id,
        "terms": [{
            "id": tid, "term": tt["term"], "year": parse(tt["term"])[1], "sem": parse(tt["term"])[2],
            "count": tt["count"], "faculties": len({s["faculty"] for s in tt["sections"]}), "updated": tt["updated"],
            "teaching": iso(teaching_start(tt["term"], cal)),
        } for tid, tt in reversed(terms)],
    }
    write_if_changed(INDEX, json.dumps(index, ensure_ascii=False, indent=1) + "\n")
    for name in FILES:
        src = os.path.join(folder(default), name)
        if os.path.exists(src):
            copy_if_changed(src, os.path.join(DATA, name))
    return default


if __name__ == "__main__":
    print("default:", publish())
