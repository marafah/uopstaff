"""Calendar subscriptions for the published exam timetable (data/exam_schedule.json, uploaded by the exams committee from
the «جدول الامتحانات» page). Every hour, so a change to the timetable reaches the phones that subscribed:

  * data/ics/exams/p-<sha1(name)[:10]>.ics  - one proctor's duties (their own course's exam and proctoring), with the room
  * data/ics/exams/f-<sha1(faculty)[:8]>.ics - every exam of a faculty, room by room (for the faculty's staff and lab technicians)
  * data/ics/exams/all.ics                   - the whole timetable

Each event carries two reminders: the evening before (18 hours) and one hour before. «امتحاناتي» (assets/myexams.js)
links to these files under the same names. Without a published timetable the folder is emptied.

    python scripts/exam_ics.py
"""
import hashlib
import json
import os

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC = os.path.join(ROOT, "data", "exam_schedule.json")
OUT = os.path.join(ROOT, "data", "ics", "exams")


def h(s, n):
    return hashlib.sha1(s.encode("utf-8")).hexdigest()[:n]


def esc(s):
    return str(s or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def fold(line):
    """lines of at most 75 octets (RFC 5545), cut between characters"""
    out, cur = [], b""
    for ch in line:
        b = ch.encode("utf-8")
        if len(cur) + len(b) > 74:
            out.append(cur.decode("utf-8"))
            cur = b" " + b
        else:
            cur += b
    out.append(cur.decode("utf-8"))
    return "\r\n".join(out)


def cal(name, events, stamp):
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//uopstaff//exams//AR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
             f"X-WR-CALNAME:{esc(name)}", "X-WR-TIMEZONE:Asia/Amman", "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H",
             "BEGIN:VTIMEZONE", "TZID:Asia/Amman", "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:+0300", "TZOFFSETTO:+0300",
             "TZNAME:+03", "END:STANDARD", "END:VTIMEZONE"]
    for uid, e, summary, where, desc in events:
        d = e["date"].replace("-", "")
        lines += ["BEGIN:VEVENT", f"UID:{uid}@uopstaff-exams", f"DTSTAMP:{stamp}",
                  f"DTSTART;TZID=Asia/Amman:{d}T{e['from'].replace(':', '')}00", f"DTEND;TZID=Asia/Amman:{d}T{e['to'].replace(':', '')}00",
                  f"SUMMARY:{esc(summary)}", f"LOCATION:{esc(where)}", f"DESCRIPTION:{esc(desc)}",
                  "BEGIN:VALARM", "TRIGGER:-PT18H", "ACTION:DISPLAY", f"DESCRIPTION:{esc('غداً: ' + summary)}", "END:VALARM",
                  "BEGIN:VALARM", "TRIGGER:-PT1H", "ACTION:DISPLAY", f"DESCRIPTION:{esc('بعد ساعة: ' + summary)}", "END:VALARM", "END:VEVENT"]
    lines.append("END:VCALENDAR")
    return "\r\n".join(fold(x) for x in lines) + "\r\n"


def write(path, text):
    old = None
    if os.path.exists(path):
        with open(path, encoding="utf-8", newline="") as f:
            old = f.read()
    # DTSTAMP changes every run: compare without it so an unchanged timetable writes nothing
    strip = lambda t: "\n".join(l.rstrip("\r") for l in (t or "").split("\n") if not l.startswith("DTSTAMP:"))
    if old is not None and strip(old) == strip(text):
        return False
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(text)
    return True


def main():
    os.makedirs(OUT, exist_ok=True)
    try:
        with open(SRC, encoding="utf-8") as f:
            ex = json.load(f)
    except (OSError, ValueError):
        ex = None
    keep, n = set(), 0
    if ex and ex.get("exams"):
        stamp = ex.get("published", "")[:19].replace("-", "").replace(":", "") + "Z"
        title = ex.get("type") or "الامتحانات"
        rooms = lambda e: " / ".join(r["room"] + (" (مختبر)" if r.get("lab") else "") for r in e["rooms"])
        files = {"all.ics": ("جدول " + title + " – جامعة البترا", [])}
        for e in ex["exams"]:
            base = f"{e['code']}-{e['date']}-{e['from']}"
            info = f"{title} · {e.get('dept', '')} · {e.get('students', '')} طالب · القاعات: {rooms(e)}"
            files["all.ics"][1].append((base, e, f"امتحان {e['name']} ({e['code']})", "جامعة البترا – " + rooms(e), info))
            fk = "f-" + h(e.get("fac") or "", 8) + ".ics"
            files.setdefault(fk, (f"امتحانات {e.get('fac', '')} – جامعة البترا", []))[1].append(
                (base, e, f"امتحان {e['code']} {e['name']}", rooms(e), info))
            for r in e["rooms"]:
                for p in r.get("proc") or []:
                    pk = "p-" + h(p, 10) + ".ics"
                    own = p in (e.get("ins") or [])
                    others = "، ".join(x for x in r.get("proc") or [] if x != p)
                    files.setdefault(pk, (f"مراقباتي – {p}", []))[1].append(
                        (f"{base}-{r['room']}", e, f"{'امتحان مقررك' if own else 'مراقبة'}: {e['name']} – القاعة {r['room']}",
                         "جامعة البترا – القاعة " + r["room"], f"{e['code']} · {r.get('n', '')} طالب في القاعة" + (f" · مع {others}" if others else "")))
        for k, (name, evs) in files.items():
            n += write(os.path.join(OUT, k), cal(name, evs, stamp))
            keep.add(k)
    for f in os.listdir(OUT):
        if f.endswith(".ics") and f not in keep:
            os.remove(os.path.join(OUT, f))
    print(f"exam calendars: {len(keep)} file(s), {n} written")


if __name__ == "__main__":
    main()
