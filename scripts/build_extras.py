"""Data for the instructor, planner, now and registration pages, built from the files the other scripts write.

  * data/instructors.json   - every instructor in the timetable: short id, own department (staff directory), e-mail,
                              ext, office, photo and the id of their calendar file
  * data/ics/<id>.ics       - each instructor's teaching as weekly recurring events over the teaching period of the
                              official academic calendar, holidays excluded (subscribable: refreshed hourly)
  * data/seats_history.json - registered students per section over time (a point is added only when it changes)

Nothing here is guessed: the teaching period and holidays come from data/calendar.json; when they cannot be found
the calendar files are not written. Asynchronous meetings have no fixed time and are left out of the calendars.

    python scripts/build_extras.py
"""
import hashlib
import json
import os
import re
import sys
from datetime import date, datetime, timedelta, timezone

HERE = os.path.dirname(__file__)
DATA = os.path.join(HERE, "..", "data")
DAY_IDX = {"ح": 6, "ن": 0, "ث": 1, "ر": 2, "خ": 3, "س": 5, "ج": 4}   # Python weekday(): Monday = 0
ICS_DAY = {"ح": "SU", "ن": "MO", "ث": "TU", "ر": "WE", "خ": "TH", "س": "SA", "ج": "FR"}
SEM = {"الأول": "first", "الثاني": "second", "الصيفي": "summer"}


def load(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


def write_if_changed(path, text):
    if os.path.exists(path):
        with open(path, encoding="utf-8", newline="") as f:
            if f.read() == text:
                return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(text)
    return True


def short_id(name):
    return hashlib.sha1(name.encode("utf-8")).hexdigest()[:10]


def section_key(s):
    return "|".join([s["code"], s["section"], s["activity"], s["degree"], s["study_type"]])


def person_key(name):
    n = re.sub(r"^\s*((أ|ا)\s*\.\s*د|د|م|أ|ا)\s*\.+\s*", "", name)
    n = re.sub(r"^\s*((أ|ا)\s*\.\s*د|د|م)\s*\.+\s*", "", n)
    n = n.translate(str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ة": "ه", "ى": "ي", ".": " "}))
    return re.sub(r"\s+", " ", n).strip()


def teaching_period(tt, cal):
    """First and last teaching day of the timetable's term, and the holidays in between (official calendar)."""
    sem_word = next((w for w in SEM if w in tt["term"]), None)
    sem = next((s for s in cal["semesters"] if sem_word and s["key"] == SEM[sem_word]), None)
    if not sem:
        return None
    start = next((e["start"] for e in sem["events"] if e["category"] == "teaching" and e["title"].startswith("بدء التدريس")), None)
    end = next((e["end"] for e in sem["events"] if e["category"] == "teaching" and e["title"].startswith("آخر يوم تدريس")), None)
    if not start or not end:
        return None
    holidays = set()
    for e in sem["events"]:
        if e["category"] != "holiday":
            continue
        days = [date.fromisoformat(d) for d in e["dates"]] if e.get("dates") else None
        if days is None:
            d0, d1 = date.fromisoformat(e["start"]), date.fromisoformat(e["end"])
            days = [d0 + timedelta(n) for n in range((d1 - d0).days + 1)]
        holidays.update(d for d in days if start <= d.isoformat() <= end)
    return date.fromisoformat(start), date.fromisoformat(end), sorted(holidays)


def esc(v):
    return str(v).replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def fold(line):
    out, cur, size = [], "", 0
    for ch in line:
        n = len(ch.encode("utf-8"))
        if size + n > 75:
            out.append(cur)
            cur, size = " ", 1
        cur += ch
        size += n
    out.append(cur)
    return "\r\n".join(out)


def ics_for(name, sections, period):
    start, end, holidays = period
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//uopstaff//timetable//AR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
             f"X-WR-CALNAME:{esc('محاضرات ' + name)}", "X-WR-TIMEZONE:Asia/Amman", "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
             "X-PUBLISHED-TTL:PT1H",
             "BEGIN:VTIMEZONE", "TZID:Asia/Amman", "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:+0300",
             "TZOFFSETTO:+0300", "TZNAME:+03", "END:STANDARD", "END:VTIMEZONE"]
    stamp = start.strftime("%Y%m%dT000000Z")  # fixed, so an unchanged timetable gives an unchanged file
    for s in sections:
        groups = {}
        for m in s["meetings"]:
            if m["mode"] == "غير متزامن":
                continue
            groups.setdefault((m["start"], m["end"], m["mode"]), []).append(m["day"])
        for (t0, t1, mode), ds in sorted(groups.items()):
            first = min((start + timedelta((DAY_IDX[d] - start.weekday()) % 7) for d in ds))
            dt0 = datetime.combine(first, datetime.strptime(t0, "%H:%M").time())
            dt1 = datetime.combine(first, datetime.strptime(t1, "%H:%M").time())
            ex = [h for h in holidays if any(h.weekday() == DAY_IDX[d] for d in ds)]
            where = "إلكتروني" if s["room"] == "0" or mode == "الكتروني كامل" else f"{s['room']} – {s['building']}"
            uid = hashlib.sha1(f"{section_key(s)}|{t0}|{''.join(ds)}".encode("utf-8")).hexdigest()[:16]
            byday = ",".join(ICS_DAY[d] for d in sorted(ds, key=lambda d: DAY_IDX[d]))
            summary = "%s %s – ش%s" % (s["code"], s["name"], s["section"])
            about = "%s · %s · %s – %s" % (s["activity"], mode, s["department"], s["faculty"])
            lines += ["BEGIN:VEVENT", f"UID:{uid}@uopstaff", f"DTSTAMP:{stamp}",
                      f"DTSTART;TZID=Asia/Amman:{dt0:%Y%m%dT%H%M%S}", f"DTEND;TZID=Asia/Amman:{dt1:%Y%m%dT%H%M%S}",
                      # UNTIL in UTC (RFC 5545 when DTSTART has a TZID): 23:59:59 Amman = 20:59:59Z
                      f"RRULE:FREQ=WEEKLY;BYDAY={byday};UNTIL={end:%Y%m%d}T205959Z"]
            if ex:  # official holidays on a teaching day: no lecture
                lines.append("EXDATE;TZID=Asia/Amman:" + ",".join(datetime.combine(h, dt0.time()).strftime("%Y%m%dT%H%M%S") for h in ex))
            lines += [f"SUMMARY:{esc(summary)}", f"LOCATION:{esc(where)}", f"DESCRIPTION:{esc(about)}", "END:VEVENT"]
    lines.append("END:VCALENDAR")
    return "\r\n".join(fold(l) for l in lines) + "\r\n"


def main():
    tt, cal, staff = load("timetable.json"), load("calendar.json"), load("staff.json")
    S = tt["sections"]
    by_key = {}
    for m in staff["members"]:
        if m["type"] == "academic":
            by_key.setdefault(person_key(m["name"]), []).append(m)
    period = teaching_period(tt, cal)

    # instructors: id, own department, contact; calendar files
    people = {}
    for s in S:
        people.setdefault(s["instructor"], []).append(s)
    index, written = [], 0
    for name in sorted(people):
        found = by_key.get(person_key(name), [])
        m = found[0] if len(found) == 1 else None
        home = (tt.get("homes") or {}).get(name)
        rec = {"id": short_id(name), "name": name, "sections": len(people[name]),
               "department": ", ".join(home["departments"]) if home else "", "faculty": home["faculty"] if home else ""}
        if m:
            rec.update({"email": m["email"], "ext": m["ext"], "office": m["office"] if m["office"] != m["ext"] else "",
                        "photo": m["photo"], "rank": m["rank"], "job": m["job"], "role": m["role"], "profile": m["profile"],
                        "name_en": m["name_en"], "directory_id": m["id"], "corrected": bool(m.get("corrected"))})
        if period:
            written += write_if_changed(os.path.join(DATA, "ics", rec["id"] + ".ics"), ics_for(name, people[name], period))
            rec["ics"] = f"data/ics/{rec['id']}.ics"
        index.append(rec)
    if period:  # calendars of instructors no longer in the timetable
        keep = {r["id"] + ".ics" for r in index}
        for f in os.listdir(os.path.join(DATA, "ics")):
            if f.endswith(".ics") and f not in keep:
                os.remove(os.path.join(DATA, "ics", f))
    out = {"term": tt["term"], "updated": tt["updated"],
           "teaching": {"start": period[0].isoformat(), "end": period[1].isoformat(), "holidays": [h.isoformat() for h in period[2]]} if period else None,
           "instructors": index}
    write_if_changed(os.path.join(DATA, "instructors.json"), json.dumps(out, ensure_ascii=False, indent=0))
    print(f"instructors: {len(index)}, calendar files changed: {written}" + ("" if period else " (no teaching period found: calendars not written)"))

    # seats history: one point per section when its registered count or capacity changes
    path = os.path.join(DATA, "seats_history.json")
    hist = load("seats_history.json") if os.path.exists(path) else {"term": tt["term"], "times": [], "series": {}}
    if hist.get("term") != tt["term"]:
        hist = {"term": tt["term"], "times": [], "series": {}}
    t = tt["updated"]
    if not hist["times"] or hist["times"][-1] < t:
        hist["times"].append(t)
        ti = len(hist["times"]) - 1
        for s in S:
            k = section_key(s)
            ser = hist["series"].setdefault(k, [])
            if not ser or ser[-1][1:] != [s["registered"], s["capacity"]]:
                ser.append([ti, s["registered"], s["capacity"]])
        write_if_changed(path, json.dumps(hist, ensure_ascii=False, separators=(",", ":")))
        print(f"seats history: {len(hist['times'])} snapshots")


if __name__ == "__main__":
    sys.exit(main())
