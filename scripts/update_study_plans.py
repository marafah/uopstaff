"""Refresh data/study_plans.json from the university's public study plans (https://edugate.uop.edu.jo/studyPlans).

The page is a JSF form with four linked lists: degree -> faculty -> department -> major. Choosing a major shows its
plan as tabs, one per requirement group (university, faculty, major, electives…). Every tab holds a table of courses
(code, name, credit hours, activity) and the hours the student must take from that group; long tables are paged, so
each one is asked for in full. The run walks every degree, faculty, department and major, exactly as the page does.

Checks (any failure stops the run and the previous file stays in place):
  * every table returns as many rows as it says it has;
  * every plan has at least one group and one course;
  * no more than a few plans may disappear compared with the previous file.

The page links every course to the current timetable (data/timetable.json): offered this term or not, how many sections.

    pip install requests
    python scripts/update_study_plans.py
"""
import html
import json
import os
import re
import sys
import time
from datetime import datetime, timezone

import requests

URL = "https://edugate.uop.edu.jo/studyPlans"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
TIMEOUT = 90
TRIES = 4
ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "data", "study_plans.json")
TT = os.path.join(ROOT, "data", "timetable.json")
AJAX = {"Faces-Request": "partial/ajax", "X-Requested-With": "XMLHttpRequest"}
LISTS = ["degrees", "faculties", "depts", "majors"]


def clean(v):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", str(v or "")))).strip()


def call(method, *args, **kw):
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


def options(text, name):
    m = re.search(rf'<select id="serviceContents:{name}_input".*?</select>', text, re.S)
    if not m:
        return []
    return [(v, clean(t)) for v, t in re.findall(r'<option value="([^"]*)"[^>]*>(.*?)</option>', m.group(0), re.S) if v]


def updates(text):
    """{id: html} of a JSF partial response."""
    return {i: body for i, body in re.findall(r'<update id="([^"]+)"><!\[CDATA\[(.*?)\]\]></update>', text, re.S)}


class Form:
    def __init__(self):
        self.s = requests.Session()
        self.s.headers["User-Agent"] = UA
        page = call(self.s.get, URL).text
        self.vs = re.search(r'name="javax.faces.ViewState"[^>]*value="([^"]+)"', page).group(1)
        self.action = "https://edugate.uop.edu.jo" + html.unescape(re.search(r'<form id="serviceContents"[^>]*action="([^"]+)"', page).group(1))
        self.term = clean(re.search(r"الفصل الدراسي\s*:(.*?)</", page, re.S).group(1))
        self.html = page
        self.values = {n: "" for n in LISTS}
        self.tabview, self.active = None, 0

    def _post(self, extra):
        data = {"serviceContents": "serviceContents", "javax.faces.ViewState": self.vs, "javax.faces.partial.ajax": "true"}
        for n in LISTS:
            data[f"serviceContents:{n}_focus"] = ""
            data[f"serviceContents:{n}_input"] = self.values[n]
        if self.tabview:
            data[f"{self.tabview}_activeIndex"] = str(self.active)
        data.update(extra)
        r = call(self.s.post, self.action, data=data, headers=AJAX)
        r.encoding = "utf-8"
        m = re.search(r'<update id="j_id1:javax.faces.ViewState:\d+"><!\[CDATA\[(.*?)\]\]>', r.text)
        if m:
            self.vs = m.group(1)
        if "<error>" in r.text:
            raise RuntimeError("portal error: " + clean(r.text)[:300])
        return r.text

    def choose(self, name, value):
        """Pick a value in one of the four lists; the lists after it are emptied, as on the page."""
        i = LISTS.index(name)
        self.values[name] = value
        for n in LISTS[i + 1:]:
            self.values[n] = ""
        self.tabview, self.active = None, 0
        src = f"serviceContents:{name}"
        text = self._post({"javax.faces.source": src, "javax.faces.partial.execute": src, "javax.faces.partial.render": "serviceContents",
                           "javax.faces.behavior.event": "change", "javax.faces.partial.event": "change"})
        self.html = updates(text).get("serviceContents", "")
        if not self.html:
            raise RuntimeError(f"no form returned after choosing {name}={value}")
        return self.html

    def plan(self):
        """The plan of the chosen major: total hours and every requirement group with all its courses."""
        h = self.html
        m = re.search(r'<div id="(serviceContents:\w+)" class="ui-tabs ', h)
        if not m:
            return None
        self.tabview = m.group(1)
        total = re.search(r"عدد الساعات المعتمدة\s*:\s*(\d+)", clean(h))
        nav = re.search(r'<ul class="ui-tabs-nav.*?</ul>', h, re.S).group(0)
        tabs = [(pid, clean(t)) for pid, t in re.findall(r'<a href="#([^"]+)"[^>]*>(.*?)</a>', nav, re.S)]
        cats = []
        for i, (pid, name) in enumerate(tabs):
            body = self._panel(h, pid)
            if not body:
                self.active = i
                text = self._post({"javax.faces.source": self.tabview, "javax.faces.partial.execute": self.tabview,
                                   "javax.faces.partial.render": self.tabview, self.tabview: self.tabview,
                                   f"{self.tabview}_contentLoad": "true", f"{self.tabview}_newTab": pid, f"{self.tabview}_tabindex": str(i)})
                up = updates(text)
                body = up.get(pid) or self._panel(up.get(self.tabview, ""), pid) or next(iter(up.values()), "")
            cats.append(self._group(name, body))
        return {"total": int(total.group(1)) if total else None, "groups": cats}

    @staticmethod
    def _panel(h, pid):
        m = re.search(rf'<div id="{re.escape(pid)}" class="ui-tabs-panel[^"]*"[^>]*>(.*?)(?=<div id="[^"]+" class="ui-tabs-panel|\Z)', h, re.S)
        return m.group(1).strip() if m and re.search(r"<tr", m.group(1)) else ""

    def _group(self, name, body):
        dt = re.search(r'<div id="([^"]+)" class="ui-datatable', body)
        n = re.search(r"rowCount:(\d+)", body)
        rows_per = re.search(r"rows:(\d+)", body)
        if dt and n and rows_per and int(n.group(1)) > int(rows_per.group(1)):
            d = dt.group(1)
            text = self._post({"javax.faces.source": d, "javax.faces.partial.execute": d, "javax.faces.partial.render": d, d: d,
                               f"{d}_pagination": "true", f"{d}_first": "0", f"{d}_rows": n.group(1),
                               f"{d}_skipChildren": "true", f"{d}_encodeFeature": "true"})
            rows_html = text  # the whole table; the group's footer (hours to take) stays in the tab's own html
        else:
            rows_html = body
        courses = []
        for tr in re.findall(r"<tr[^>]*data-ri=\"\d+\"[^>]*>(.*?)</tr>", rows_html, re.S):
            cells = [clean(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
            if len(cells) >= 4 and re.fullmatch(r"\d{4,}", cells[0]):
                courses.append({"code": cells[0], "name": cells[1], "hours": int(cells[2]) if cells[2].isdigit() else None, "activity": cells[3]})
        if n and int(n.group(1)) != len(courses):
            raise RuntimeError(f"group {name!r}: table says {n.group(1)} rows, read {len(courses)}")
        req = re.search(r"عدد الساعات المعتمدة\s*(\d+)", clean(body))
        kind = kind_of(name)
        return {"name": name, "kind": kind, "required_hours": int(req.group(1)) if req else None, "courses": courses}


def kind_of(name):
    """required / elective / free / remedial (remedial courses are set by placement and do not count toward graduation)"""
    return "remedial" if "استدراك" in name else "elective" if "اختيار" in name else "free" if "حرة" in name else "required"


def timetable_term():
    """The page links each course to the current timetable itself (data/timetable.json); only its term is noted here."""
    try:
        with open(TT, encoding="utf-8") as f:
            return json.load(f).get("term")
    except (OSError, ValueError):
        return None


def main():
    f = Form()
    plans = []
    for dv, dn in options(f.html, "degrees"):
        h = f.choose("degrees", dv)
        for fv, fn in options(h, "faculties"):
            h = f.choose("faculties", fv)
            for pv, pn in options(h, "depts"):
                h = f.choose("depts", pv)
                for mv, mn in options(h, "majors"):
                    f.choose("majors", mv)
                    p = f.plan()
                    if not p or not p["groups"] or not any(g["courses"] for g in p["groups"]):
                        raise RuntimeError(f"empty plan: {dn} / {fn} / {pn} / {mn}")
                    if p["total"] is None:  # the plan's own figure; failing that, every group but the remedial ones
                        p["total"] = sum(g["required_hours"] or 0 for g in p["groups"] if g["kind"] != "remedial")
                    plans.append({"id": mv, "version": mv.split(",")[-1], "degree": dn, "faculty": fn, "faculty_id": fv, "dept": pn, "dept_id": pv, "major": mn, **p})
                    print(f"{dn} / {fn} / {pn} / {mn}: {sum(len(g['courses']) for g in p['groups'])} courses", file=sys.stderr)
    old = []
    try:
        with open(OUT, encoding="utf-8") as fh:
            old = json.load(fh).get("plans", [])
    except (OSError, ValueError):
        pass
    gone = {p["id"] for p in old} - {p["id"] for p in plans}
    if old and len(gone) > max(3, len(old) // 10):
        raise RuntimeError(f"{len(gone)} plans disappeared since the last run; keeping the previous file")
    term = timetable_term()
    out = {"updated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "source": URL, "term": f.term,
           "timetable_term": term, "count": len(plans), "plans": plans}
    # only rewrite when the plans themselves changed, so the hourly run does not make empty commits
    if old and json.dumps(old, sort_keys=True, ensure_ascii=False) == json.dumps(plans, sort_keys=True, ensure_ascii=False):
        print("study plans unchanged")
        return
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"study plans: {len(plans)} plans, {sum(len(g['courses']) for p in plans for g in p['groups'])} course entries")


if __name__ == "__main__":
    main()
