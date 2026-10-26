"""Refresh data/calendar.json and data/calendar.ics from the university's academic calendar PDF.

The PDF is a table (day | date | occasion) spanning the first, second and summer semesters. Text is read
right-to-left with pdfplumber; lam-alef ligatures and digit runs are put back in logical order. Every parsed
date is checked against the weekday written in its row, and any mismatch is reported in "warnings".
The data files change only when the calendar itself changes.

    pip install requests pdfplumber
    python scripts/update_calendar.py
"""
import hashlib
import io
import json
import os
import re
import sys
from datetime import date, datetime, timedelta, timezone

import pdfplumber
import requests

HOME = "https://www.uop.edu.jo/ar/pages/default.aspx"  # always links "التقويم الجامعي"
SRC = "https://www.uop.edu.jo/Ar/AdmissionsAndRegistration/Documents/AcademicCalendar.pdf"  # fallback
HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, "..", "data", "calendar.json")
ICS = os.path.join(HERE, "..", "data", "calendar.ics")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"

DAYS = {"السبت": 5, "الأحد": 6, "الاحد": 6, "الإثنين": 0, "الاثنين": 0, "الثلاثاء": 1, "الأربعاء": 2, "الاربعاء": 2,
        "الخميس": 3, "الجمعة": 4}  # -> Python weekday()
SEMESTERS = [("first", "الأول"), ("second", "الثاني"), ("summer", "الصيفي")]
CATEGORIES = [  # (key, keywords) – first match wins; order matters (e.g. withdrawal before "الماجستير")
    ("holiday", r"عيد|ذكرى|رأس السنة|الإسراء|رمضان|الميلاد المجيد"),
    ("registration", r"الانسحاب|السحب والإضافة|غرامة|تسجيل"),
    ("graduate", r"الرسائل|مناقشة|Proposal|الماجستير|الشامل|لجان المناقشات"),
    ("exams", r"امتحان|الامتحانات|الاختبار|بطاقة دخول"),
    ("results", r"علامات|النتائج|الدرجات العلمية|تخريج"),
    ("teaching", r"تدريس|دوام|العام الجامعي|عطلة|إجازة|دورات|التنويري"),
]


def fix_text(s):
    """Logical order for a right-to-left rendered cell: digit and Latin runs back to left-to-right."""
    s = re.sub(r"\d+", lambda m: m.group()[::-1], s or "")
    s = re.sub(r"[A-Za-z]+", lambda m: m.group()[::-1], s)
    s = s.replace("ـ", "")  # tatweel used for spacing in headers
    s = re.sub(r"إ\s+(?=[ء-ي])", "إ", s)  # "إ صدار" -> "إصدار" (glyph spacing in the PDF)
    return re.sub(r"[ \t]+", " ", s).strip()


def read_rows(pdf_bytes):
    """[(page, day, date_visual, occasion)] plus the text of each page (for the footnotes)."""
    rows, texts = [], []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for pno, page in enumerate(pdf.pages, 1):
            for ch in page.chars:  # ligatures (لأ، لا، لإ) are single glyphs with two letters; keep their order
                if len(ch["text"]) > 1:
                    ch["text"] = ch["text"][::-1]
            texts.append(fix_text(page.extract_text(char_dir_render="rtl") or ""))
            for table in page.extract_tables(table_settings={"text_char_dir_render": "rtl"}):
                for r in table:
                    cells = [c for c in r if c]
                    if not cells:
                        continue
                    if len(cells) == 1:
                        txt = fix_text(cells[0])
                        dm = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", txt)
                        if dm and rows and rows[-1][2]:  # a date cell split over two table rows: its second line
                            p, d, v, o = rows[-1]
                            rows[-1] = (p, d, f"{v} {dm.group(3)}/{dm.group(2)}/{dm.group(1)}", o)
                            continue
                        rows.append((pno, None, None, txt))
                        continue
                    occasion, dates, day = cells[0], cells[1], cells[-1]
                    rows.append((pno, fix_text(day), (dates or "")[::-1], fix_text(occasion)))
    return rows, texts


def semester_years(title):
    m = re.search(r"(\d{4})/(\d{4})", title)
    return (int(m.group(1)), int(m.group(2))) if m else (None, None)


def parse_dates(visual, years, key):
    """Visual date cell -> sorted list of dates (a range gives [start, end], a list gives each day)."""
    s = visual.replace("\n", " ").replace("–", "-").strip()
    if len(re.findall(r"\d{4}/", s)) >= 2:  # "2026/12-27" (slash typed as a dash) next to a full date
        s = re.sub(r"(\d{4})/(\d{1,2})-(\d{1,2})(?![/\d])", r"\1/\2/\3", s)
    full = [(int(a), int(b), int(c)) for a, b, c in re.findall(r"(\d{4})/(\d{1,2})/(\d{1,2})", s)]
    if len(full) >= 2:
        return sorted(date(*f) for f in full[:2])
    if len(full) == 1:
        y, m, d = full[0]
        end = date(y, m, d)
        rest = re.sub(r"\d{4}/\d{1,2}/\d{1,2}", "", s, count=1)
        m2 = re.search(r"(\d{1,2})/(\d{1,2})", rest)
        if m2:  # "Y/M/D-M2/D2": the second part is the start (written right to left)
            sm, sd = int(m2.group(1)), int(m2.group(2))
            start = date(y - 1 if sm > m else y, sm, sd)
            return sorted([start, end])
        d2 = re.search(r"\d{1,2}", rest)
        if d2:  # "Y/M/D-D2"
            return sorted([date(y, m, int(d2.group())), end])
        return [end]
    parts = [(int(a), int(b)) for a, b in re.findall(r"(\d{1,2})/(\d{1,2})", s)]
    if parts:  # list of month/day (weekly midterm slots): year from the semester
        y1, y2 = years
        out = []
        for mth, d in parts:
            y = y1 if (key == "first" and mth >= 8) else y2
            out.append(date(y, mth, d))
        return sorted(out)
    return []


def weekdays(day_label):
    found = []
    for part in re.split(r"\s*-\s*", day_label or ""):
        part = part.strip()
        if part in DAYS:
            found.append(DAYS[part])
    return found


def category_of(title):
    for key, pattern in CATEGORIES:
        if re.search(pattern, title):
            return key
    return "other"


def parse(pdf_bytes):
    rows, texts = read_rows(pdf_bytes)
    year_title = ""
    m = re.search(r"التقويم الجامعي للعام الدراسي (\d{4}/\d{4})", " ".join(texts))
    if m:
        a, b = m.group(1).split("/")
        year_title = f"{min(a, b)}/{max(a, b)}"
    semesters, current, warnings = [], None, []
    for pno, day, dvis, occ in rows:
        if day is None:
            sm = re.search(r"الفصل الدراسي (الأول|الثاني|الصيفي)\s*(\d{4}/\d{4})?", occ)
            if sm:
                key = next(k for k, n in SEMESTERS if n == sm.group(1))
                yrs = sorted(int(x) for x in (sm.group(2) or year_title).split("/")) if (sm.group(2) or year_title) else [None, None]
                current = {"key": key, "name": f"الفصل الدراسي {sm.group(1)}", "years": yrs, "events": [], "stats": {}}
                semesters.append(current)
            continue
        if current is None or not dvis or "المناسبة" in occ:  # header row
            continue
        try:
            dates = parse_dates(dvis, current["years"], current["key"])
        except ValueError as e:
            warnings.append(f"صفحة {pno}: تاريخ غير مفهوم «{dvis}» ({occ[:40]})")
            continue
        if not dates:
            warnings.append(f"صفحة {pno}: لا تاريخ في «{dvis}» ({occ[:40]})")
            continue
        lines = [l.strip() for l in occ.split("\n") if l.strip()]
        title = " ".join(lines)
        note = ""
        nm = re.search(r"\((مع فقدان [^)]*)\)", title)
        if nm:
            note, title = nm.group(1), re.sub(r"\s*\(مع فقدان [^)]*\)", "", title).strip()
        is_list = len(dates) > 2 or (len(dates) == 2 and re.fullmatch(r"[\d/\s]+", dvis.replace("\n", " ")) and "-" not in dvis)
        wd = weekdays(day)
        if wd:
            check = dates if is_list else [dates[0], dates[-1]]
            expect = wd * len(check) if (is_list or len(wd) == 1) else wd
            for d, w in zip(check, expect if len(expect) == len(check) else [wd[0], wd[-1]]):
                if d.weekday() != w:
                    warnings.append(f"صفحة {pno}: «{title[:45]}» – {d.isoformat()} ليس يوم {day}")
        ev = {
            "title": title, "note": note, "day": day, "category": category_of(title),
            "estimated": "تقديرا" in title,
        }
        ev["title"] = re.sub(r"\s*\(تقديرا\)", "", ev["title"]).strip()
        if is_list:
            ev["dates"] = [d.isoformat() for d in dates]
            ev["start"], ev["end"] = ev["dates"][0], ev["dates"][-1]
        else:
            ev["start"], ev["end"] = dates[0].isoformat(), dates[-1].isoformat()
        ev["id"] = hashlib.sha1(f"{current['key']}|{ev['title']}|{ev['start']}".encode()).hexdigest()[:10]
        current["events"].append(ev)
    # footnotes after each semester: study days and final-exam days
    joined = "\n".join(texts)
    for sem, block in zip(semesters, re.split(r"الفصل الدراسي (?:الأول|الثاني|الصيفي)\s*\d{4}/\d{4}", joined)[1:]):
        sd = re.search(r"عدد أيام الدراسة \((\d+)\)", block)
        ed = re.search(r"عدد أيام الامتحانات النهائية \((\d+)\)", block)
        if sd:
            sem["stats"]["study_days"] = int(sd.group(1))
        if ed:
            sem["stats"]["exam_days"] = int(ed.group(1))
    for sem in semesters:
        sem["events"].sort(key=lambda e: (e["start"], e["end"]))
        sem["start"] = min(e["start"] for e in sem["events"])
        sem["end"] = max(e["end"] for e in sem["events"])
    return {"year": year_title, "semesters": semesters, "warnings": warnings}


def ics(cal):
    def esc(s):
        return s.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")
    out = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//uopstaff//Academic Calendar//AR", "CALSCALE:GREGORIAN",
           "METHOD:PUBLISH", f"X-WR-CALNAME:التقويم الجامعي – جامعة البترا {cal['year']}", "X-WR-TIMEZONE:Asia/Amman",
           "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"]
    for sem in cal["semesters"]:
        for ev in sem["events"]:
            spans = [(d, d) for d in ev["dates"]] if ev.get("dates") else [(ev["start"], ev["end"])]
            for i, (a, b) in enumerate(spans):
                end = (date.fromisoformat(b) + timedelta(days=1)).strftime("%Y%m%d")
                out += ["BEGIN:VEVENT", f"UID:{ev['id']}-{i}@marafah.github.io", f"DTSTAMP:{cal['updated'].replace('-', '').replace(':', '')}",
                        f"DTSTART;VALUE=DATE:{a.replace('-', '')}", f"DTEND;VALUE=DATE:{end}",
                        f"SUMMARY:{esc(ev['title'] + (' (تقديراً)' if ev['estimated'] else ''))}",
                        f"DESCRIPTION:{esc(sem['name'] + (' – ' + ev['note'] if ev['note'] else ''))}", f"CATEGORIES:{ev['category']}",
                        "TRANSP:TRANSPARENT", "END:VEVENT"]
    out.append("END:VCALENDAR")
    return "\r\n".join(out) + "\r\n"


def find_source():
    """The calendar PDF linked as "التقويم الجامعي" on the university homepage (the file may be renamed)."""
    try:
        page = requests.get(HOME, headers={"User-Agent": UA}, timeout=60).text
        for href, text in re.findall(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', page, flags=re.S):
            label = re.sub(r"<[^>]+>|\s+", " ", text).strip()
            if "التقويم الجامعي" in label or "AcademicCalendar" in href:
                return requests.compat.urljoin(HOME, href)
    except requests.RequestException:
        pass
    return SRC


def main():
    src = find_source()
    print("source:", src)
    r = requests.get(src, headers={"User-Agent": UA}, timeout=60)
    r.raise_for_status()
    digest = hashlib.sha256(r.content).hexdigest()
    old = None
    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as f:
            old = json.load(f)
        if old.get("sha256") == digest:
            print(f"calendar unchanged since {old.get('updated')}")
            return
    cal = parse(r.content)
    n = sum(len(s["events"]) for s in cal["semesters"])
    if len(cal["semesters"]) < 1 or n < 20:  # a layout change we cannot read: keep the previous data
        print(f"could not read the calendar reliably ({len(cal['semesters'])} semesters, {n} events); keeping previous data", file=sys.stderr)
        sys.exit(0 if old else 1)
    cal.update({"source": src, "sha256": digest, "source_modified": r.headers.get("Last-Modified", ""),
                "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")})
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(cal, f, ensure_ascii=False, indent=1)
    with open(ICS, "w", encoding="utf-8", newline="") as f:
        f.write(ics(cal))
    print(f"calendar {cal['year']}: {len(cal['semesters'])} semesters, {n} events, {len(cal['warnings'])} warnings")
    for w in cal["warnings"]:
        print("  warning:", w)


if __name__ == "__main__":
    main()
