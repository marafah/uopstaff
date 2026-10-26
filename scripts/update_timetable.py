"""Refresh data/timetable.json from the university's public timetable (https://edugate.uop.edu.jo/timetable).

The page is a JSF form. One search with no filter gives every section (all rows on one page). Each row's own
"details" dialog then gives its faculty, department, degree, study type and number of registered students,
exactly as the page shows them (several sessions read the dialogs in parallel).
As an independent check, the search is repeated for every value of the four filters (degree, study type,
faculty, department) and the rows each one returns must match the dialogs exactly. The status column's
tooltip is "registered/capacity" (verified: a section is closed exactly when registered >= capacity).
Nothing is guessed: any disagreement fails the run and the previous file stays in place.

    pip install requests
    python scripts/update_timetable.py
"""
import html
import json
import os
import re
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import requests

URL = "https://edugate.uop.edu.jo/timetable"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
TIMEOUT = 90
TRIES = 4
WORKERS = 3
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "timetable.json")
AJAX = {"Faces-Request": "partial/ajax", "X-Requested-With": "XMLHttpRequest"}
COLS = ["code", "name", "activity", "time", "room", "section", "status", "instructor", "building"]
DAYS = {"ح": "الأحد", "ن": "الاثنين", "ث": "الثلاثاء", "ر": "الأربعاء", "خ": "الخميس", "س": "السبت", "ج": "الجمعة"}
MODES = ["الكتروني كامل", "غير متزامن", "وجاهي", "مدمج"]
DETAILS = {"الكلية": "faculty", "القسم": "department", "الدرجة العلمية": "degree", "نوع الدراسة": "study_type",
           "الطلاب المسجلين": "registered", "قاعة": "room"}


def clean(v):
    return re.sub(r"\s+", " ", str(v or "")).strip()


def call(method, *args, **kw):
    """One request with retries: the portal sometimes stops answering for a while."""
    for attempt in range(1, TRIES + 1):
        try:
            r = method(*args, timeout=TIMEOUT, **kw)
            r.raise_for_status()
            return r
        except requests.RequestException as e:
            if attempt == TRIES:
                raise
            print(f"retry {attempt} after {type(e).__name__}", file=sys.stderr)
            time.sleep(10 * attempt)


class Form:
    """One browser-like session on the timetable form."""

    def __init__(self):
        self.s = requests.Session()
        self.s.headers["User-Agent"] = UA
        page = call(self.s.get, URL).text
        self.vs = re.search(r'name="javax.faces.ViewState"[^>]*value="([^"]+)"', page).group(1)
        self.action = "https://edugate.uop.edu.jo" + html.unescape(re.search(r'<form id="serviceContents"[^>]*action="([^"]+)"', page).group(1))
        self.term = clean(re.sub(r"<[^>]+>", " ", re.search(r"الفصل الدراسي\s*:(.*?)</", page, re.S).group(1)))
        # the four filters in page order: degree, study type, faculty, department
        self.selects = re.findall(r'<select id="(serviceContents:\w+)_input"', page)
        if len(self.selects) != 4:
            raise RuntimeError(f"expected 4 filters, found {len(self.selects)}")
        self.options = {sid: self._options(page, sid) for sid in self.selects}
        self.search_btn = re.search(r'<button id="(serviceContents:scheduleDtl:\w+)"[^>]*>.*?بحث', page, re.S).group(1)
        self.values = {sid: "" for sid in self.selects}
        self.detail_btn = {}

    @staticmethod
    def _options(text, sid):
        sel = re.search(rf'<select id="{re.escape(sid)}_input".*?</select>', text, re.S).group(0)
        return [(v, clean(html.unescape(t))) for v, t in re.findall(r'<option value="([^"]*)"[^>]*>(.*?)</option>', sel, re.S) if v]

    def _post(self, extra):
        data = {"serviceContents": "serviceContents", "javax.faces.ViewState": self.vs, "javax.faces.partial.ajax": "true"}
        data.update({f"{sid}_input": v for sid, v in self.values.items()})
        data.update(extra)
        r = call(self.s.post, self.action, data=data, headers=AJAX)
        m = re.search(r'<update id="j_id1:javax.faces.ViewState:\d+"><!\[CDATA\[(.*?)\]\]>', r.text)
        if m:
            self.vs = m.group(1)
        return r.text

    def set(self, sid, value):
        """Choose a filter value; choosing a faculty loads its departments (as the page does)."""
        self.values[sid] = value
        if sid == self.selects[2]:
            dep = self.selects[3]
            self.values[dep] = ""
            text = self._post({"javax.faces.source": sid, "javax.faces.partial.execute": sid, "javax.faces.partial.render": dep,
                               "javax.faces.behavior.event": "change", "javax.faces.partial.event": "change"})
            self.options[dep] = self._options(text, dep) if value else []

    def search(self):
        text = self._post({"javax.faces.source": self.search_btn, "javax.faces.partial.execute": "@all",
                           "javax.faces.partial.render": "serviceContents:scheduleDtl serviceContents:msgs", self.search_btn: self.search_btn})
        n = int(re.search(r"rowCount:(\d+)", text).group(1))
        if n == 0:
            return []
        text = self._post({"javax.faces.source": "serviceContents:scheduleDtl", "javax.faces.partial.execute": "serviceContents:scheduleDtl",
                           "javax.faces.partial.render": "serviceContents:scheduleDtl", "serviceContents:scheduleDtl": "serviceContents:scheduleDtl",
                           "serviceContents:scheduleDtl_pagination": "true", "serviceContents:scheduleDtl_first": "0",
                           "serviceContents:scheduleDtl_rows": str(n), "serviceContents:scheduleDtl_skipChildren": "true",
                           "serviceContents:scheduleDtl_encodeFeature": "true"})
        trs = re.findall(r'<tr data-ri="(\d+)"[^>]*>(.*?)</tr>', text, re.S)
        if len(trs) != n:
            raise RuntimeError(f"search said {n} rows, page held {len(trs)}")
        self.detail_btn = {int(i): re.search(r'<button id="([^"]+)"[^>]*title="التفاصيل"', tr).group(1) for i, tr in trs}
        return [parse_row(tr) for _i, tr in trs]

    def details(self, i):
        """The row's own details dialog."""
        src = self.detail_btn[i]
        text = self._post({"javax.faces.source": src, "javax.faces.partial.execute": "@all",
                           "javax.faces.partial.render": "serviceContents:scheduleDetails", src: src})
        text = re.search(r'<update id="serviceContents:scheduleDetails"><!\[CDATA\[(.*?)\]\]>', text, re.S).group(1)
        parts = [clean(html.unescape(x)) for x in re.split(r"<[^>]+>", re.sub(r"<script.*?</script>", "", text, flags=re.S))]
        parts = [x for x in parts if x]
        out = {"name": parts[0]}
        for label, k in DETAILS.items():
            if parts.count(label) != 1:
                raise RuntimeError(f"row {i}: details without a single '{label}'")
            j = parts.index(label) + 1
            out[k] = parts[j] if j < len(parts) and parts[j] not in DETAILS else ""
        return out


def parse_row(tr):
    cells = re.findall(r'<td role="gridcell"[^>]*>(.*?)</td>', tr, re.S)
    values, titles = [], []
    for c in cells[1:10]:  # skip the running number and the details button
        m = re.search(r"<label([^>]*)>(.*?)</label>", c, re.S)
        title = re.search(r'title="([^"]*)"', m.group(1)) if m else None
        values.append(clean(html.unescape(m.group(2))) if m else "")
        titles.append(html.unescape(title.group(1)) if title else "")
    row = dict(zip(COLS, values))
    row["status_title"] = titles[COLS.index("status")]
    return row


def key(row):
    """A row's identity: every column except the status, which moves with registration."""
    return tuple(row[k] for k in COLS if k != "status")


def parse_time(text):
    """'[ 08:00_09:00 ] ح وجاهي ث وجاهي[ 10:00_11:00 ] خ غير متزامن' -> meetings; fails on anything unexpected."""
    block = r"\[\s*(\d{1,2}:\d{2})_(\d{1,2}:\d{2})\s*\]([^\[]*)"
    blocks = re.findall(block, text)
    if not blocks or re.sub(block, "", text).strip():
        raise ValueError(f"unexpected time format: {text!r}")
    day_mode = rf"([{''.join(DAYS)}])\s+({'|'.join(re.escape(m) for m in MODES)})"
    meetings = []
    for start, end, days in blocks:
        parts = re.findall(day_mode, days)
        if not parts or re.sub(day_mode, "", days).strip():
            raise ValueError(f"unexpected days in {text!r}")
        meetings += [{"day": d, "start": start.zfill(5), "end": end.zfill(5), "mode": mode} for d, mode in parts]
    return meetings


def read_details(n):
    """Details of rows 0..n-1, read by several sessions (each runs the full search first, like a browser)."""
    def work(idx):
        f = Form()
        rows = f.search()
        return [(i, key(rows[i]), f.details(i)) for i in idx]
    out = {}
    with ThreadPoolExecutor(WORKERS) as ex:
        for part in ex.map(work, [list(range(k, n, WORKERS)) for k in range(WORKERS)]):
            out.update({i: (k, d) for i, k, d in part})
    return out


def check_filter(form, sections, sid, fields, problems):
    """Re-run the search per filter value: the rows it returns must be exactly the rows whose details say so."""
    want = Counter((key(r),) + tuple(r[f] for f in fields) for r in sections)
    got = Counter()
    if len(fields) == 1:
        for value, name in form.options[sid]:
            form.set(sid, value)
            got.update((key(r), name) for r in form.search())
        form.set(sid, "")
    else:  # departments: per faculty, every department of it
        fac_sid, dep_sid = sid
        for fv, fname in form.options[fac_sid]:
            form.set(fac_sid, fv)
            for dv, dname in list(form.options[dep_sid]):
                form.values[dep_sid] = dv
                got.update((key(r), fname, dname) for r in form.search())
            form.values[dep_sid] = ""
        form.set(fac_sid, "")
    if got != want:
        problems.append(f"{'/'.join(fields)}: {sum((got - want).values())} rows from the filter not in the details, "
                        f"{sum((want - got).values())} the other way")


def read():
    """One complete, cross-checked read of the portal: (form, rows, details, problems)."""
    form = Form()
    rows = form.search()
    print(f"{form.term}: {len(rows)} rows")
    problems = []
    det = read_details(len(rows))
    for i, r in enumerate(rows):
        k, d = det[i]
        if k != key(r):
            problems.append(f"row {i}: the parallel session saw a different row")
            continue
        if d["name"] != r["name"] or d["room"] != r["room"]:
            problems.append(f"row {i}: details name/room differ from the list")
        reg, cap = r.pop("status_title").split("/")
        if d["registered"] != reg:
            problems.append(f"row {i}: {d['registered']} registered in the details, {reg} in the list")
        if (int(reg) >= int(cap)) != (r["status"] == "مغلقة"):
            problems.append(f"row {i}: status {r['status']} with {reg}/{cap}")
        r.update({"faculty": d["faculty"], "department": d["department"], "degree": d["degree"], "study_type": d["study_type"],
                  "registered": int(reg), "capacity": int(cap), "meetings": parse_time(r["time"])})
    if not problems:
        deg_sid, type_sid, fac_sid, dep_sid = form.selects
        check_filter(form, rows, deg_sid, ["degree"], problems)
        check_filter(form, rows, type_sid, ["study_type"], problems)
        check_filter(form, rows, fac_sid, ["faculty"], problems)
        check_filter(form, rows, (fac_sid, dep_sid), ["faculty", "department"], problems)
    return form, rows, det, problems


def main():
    # during registration the seats move between the first read and the checks; a fresh read settles that
    for attempt in range(1, 4):
        form, rows, det, problems = read()
        if not problems:
            break
        print(f"attempt {attempt}: " + "; ".join(problems[:5]), file=sys.stderr)
        if attempt < 3:
            time.sleep(60)
    if problems:
        print("\n".join(problems[:40]), file=sys.stderr)
        sys.exit(f"{len(problems)} problem(s); data/timetable.json left unchanged")

    data = {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "checked": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": URL, "term": form.term, "count": len(rows), "days": DAYS,
        "filters": {"degree": [n for _v, n in form.options[form.selects[0]]], "study_type": [n for _v, n in form.options[form.selects[1]]],
                    "faculty": [n for _v, n in form.options[form.selects[2]]]},
        "sections": rows,
        # what this run checked (shown on the page)
        "checks": {"rows": len(rows), "details_read": len(det), "filters": ["degree", "study_type", "faculty", "department"],
                   "status_vs_seats": len(rows)},
    }
    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as f:
            old = json.load(f)
        if {k: v for k, v in old.items() if k not in ("updated", "checked")} == {k: v for k, v in data.items() if k not in ("updated", "checked")}:
            print(f"no changes since {old.get('updated')}")
            return
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=0)
    print(f"wrote {len(rows)} sections to data/timetable.json")


if __name__ == "__main__":
    main()
