"""Course descriptions («وصف المواد») of every department, from the files the departments publish on the faculty sites.

The department pages (read by scripts/update_advisory.py into data/advisory_plans.json) link a «وصف المواد» PDF. Each
file is downloaded, its text rebuilt line by line (the Arabic glyphs are stored right to left, so every line goes through
advisory_parse._line_text), and cut at the course numbers: a line that starts with a known course number opens a course,
and the lines after it, up to the next course, are its description, word for word. Nothing is summarised or rewritten.

A file is read again only when its content changes (sha256) or the reader changes (VERSION); a file that cannot be
downloaded keeps what was read from it before. Scanned files (no text) are listed with zero courses and a link only.

    python scripts/update_course_desc.py   ->  data/course_descriptions.json
"""
import hashlib
import unicodedata
import io
import json
import os
import re
import sys
from collections import Counter
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))
import advisory_parse  # noqa: E402
import update_advisory  # noqa: E402

VERSION = 2
DEBUG = {}   # the first lines of every file read in this run, to check the reading (data/course_descriptions_lines.json)
ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "data", "course_descriptions.json")
LABEL = re.compile(r"وصف|description", re.I)
CODE = re.compile(r"(?<!\d)(\d{6,7})(?!\d)")
PRE = re.compile(r"متطلب|المتطلب|prereq|pre-req|pre req", re.I)
HOURS = re.compile(r"\(?\s*(\d)\s*\)?\s*(?:ساعات معتمدة|ساعة معتمدة|ساعات|ساعة|ساعه|س\.م|credit\s*hours?|cr\.?\s*h(?:rs?)?)\s*\)?", re.I)


def load(path, default):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return default


def known_codes():
    codes = set()
    sp = load(os.path.join(ROOT, "data", "study_plans.json"), {})
    for p in sp.get("plans", []):
        for g in p.get("groups", []):
            codes.update(c["code"] for c in g.get("courses", []))
    tt = load(os.path.join(ROOT, "data", "timetable.json"), {})
    codes.update(s["code"] for s in tt.get("sections", []))
    ap = load(os.path.join(ROOT, "data", "advisory_plans.json"), {})
    for r in ap.get("reads", {}).values():
        for y in r.get("years", []):
            for t in y.get("terms", []):
                codes.update(c.get("code", "") for c in t.get("courses", []))
    return {c for c in codes if re.fullmatch(r"\d{6,7}", c or "")}


def text_lines(pdf_bytes):
    """[(page, text)] for every visual line of the file, top to bottom."""
    import pdfplumber
    out = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for n, page in enumerate(pdf.pages, 1):
            lines = []
            for c in sorted(page.chars, key=lambda c: (round(c["top"]), c["x0"])):
                if lines and abs(lines[-1][0] - c["top"]) < c["size"] * 0.5:
                    lines[-1][1].append(c)
                else:
                    lines.append([c["top"], [c]])
            for _, cs in lines:
                t = advisory_parse._line_text(cs)
                t = re.sub(r"\s+", " ", unicodedata.normalize("NFKC", t)).strip() if t else ""
                if t:
                    out.append((n, t))
    return out


def parse(lines, known):
    """Courses of one file: {code: {name, hours, pre, text, page}}."""
    # running heads and feet (the same line on three pages or more) are not part of any description
    pages = Counter()
    for p, t in set(lines):
        pages[t] += 1
    noise = {t for t, k in pages.items() if k >= 3}
    found, cur = {}, None

    def head(t):
        if len(t) > 160:
            return None
        for m in CODE.finditer(t):
            code = m.group(1)
            before, after = t[:m.start()], t[m.end():]
            if PRE.search(before[-40:]) or re.search(r"(?:متطلب|prereq)[^0-9]{0,25}$", before, re.I):
                continue   # a prerequisite, not the course itself
            edge = not re.search(r"[\w\u0600-\u06ff]", re.sub(r"(رقم\s*(?:المساق|المادة|المقرر)|course\s*(?:no\.?|code|number))\s*:?", "", before, flags=re.I)[-12:] or "") \
                or not re.search(r"\w", after[:3])
            near = m.start() <= 25 or len(t) - m.end() <= 25 or len(t) < 70   # at either end of the line, not inside a sentence
            if near and (code in known or (edge and len(t) < 110)):
                return code
        return None

    for page, t in lines:
        if t in noise or re.fullmatch(r"[\d\s\-–/|.]+", t):
            continue
        code = head(t)
        if code and code not in found:
            rest = t.replace(code, " ", 1)
            pre = ""
            m = PRE.search(rest)
            if m:
                pre, rest = rest[m.start():], rest[:m.start()]
            hm = HOURS.search(rest) or HOURS.search(pre)
            name = HOURS.sub(" ", rest)
            name = re.sub(r"[\s:|–\-]+$|^[\s:|–\-]+", "", re.sub(r"\s+", " ", name))
            cur = found[code] = {"name": name[:160], "hours": int(hm.group(1)) if hm else None, "pre": re.sub(r"\s+", " ", pre).strip()[:200], "text": [], "page": page}
            continue
        if cur is not None:
            if not cur["pre"] and PRE.match(t):
                cur["pre"] = t[:200]
                continue
            cur["text"].append(t)
    out = {}
    for code, c in found.items():
        text = re.sub(r"\s+", " ", " ".join(c["text"])).strip()
        if len(text) < 25 or len(text) > 4000:   # no description, or the cut went wrong: not shown
            continue
        out[code] = {**c, "text": text}
    return out


def main():
    old = load(OUT, {})
    same_reader = old.get("parser") == VERSION
    known = known_codes()
    ap = load(os.path.join(ROOT, "data", "advisory_plans.json"), {})
    docs, courses, failed = {}, {}, []
    old_docs = old.get("docs", {}) if same_reader else {}
    old_by_doc = {}
    for code, L in (old.get("courses", {}) if same_reader else {}).items():
        for e in L:
            old_by_doc.setdefault(e["url"], {})[code] = e
    for p in ap.get("programs", []):
        for link in p.get("links", []):
            url = link.get("url") or ""
            if not LABEL.search(link.get("label", "")) or not url.lower().endswith(".pdf"):
                continue
            if url in docs:
                docs[url]["programs"].append(p["id"])
                continue
            rec = {"programs": [p["id"]], "faculty": p.get("faculty"), "program": p.get("ar"), "label": link.get("label"), "lang": link.get("lang")}
            try:
                pdf = update_advisory.fetch_pdf(url)
            except Exception as e:  # the site is down: keep what was read before
                pdf = None
                print(f"  {url}: {type(e).__name__}", file=sys.stderr)
            if not pdf:
                failed.append(url)
                if url in old_docs:
                    docs[url] = {**old_docs[url], "stale": True}
                    for code, e in old_by_doc.get(url, {}).items():
                        courses.setdefault(code, []).append(e)
                continue
            sha = hashlib.sha256(pdf).hexdigest()
            if url in old_docs and old_docs[url].get("sha") == sha:
                docs[url] = {**old_docs[url], **rec, "sha": sha}
                for code, e in old_by_doc.get(url, {}).items():
                    courses.setdefault(code, []).append(e)
                continue
            try:
                lines = text_lines(pdf)
                got = parse(lines, known)
            except Exception as e:  # a damaged or unusual file: a link only
                lines, got = [], {}
                rec["error"] = repr(e)[:200]
            DEBUG[url] = [f"{pg}| {t}" for pg, t in lines[:120]]
            rec.update({"sha": sha, "read": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "lines": len(lines), "courses": len(got),
                        "sample": [t for _, t in lines[:4]]})
            docs[url] = rec
            for code, c in got.items():
                courses.setdefault(code, []).append({"url": url, "p": p["id"], **c})
            print(f"{p['id']}: {len(got)} courses from {len(lines)} lines")
    if not docs:
        print("no course description files found; keeping the previous file", file=sys.stderr)
        return
    data = {"updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "parser": VERSION,
            "source": "ملفات «وصف المواد» المنشورة على صفحات الأقسام في مواقع الكليات", "failed": failed,
            "docs": docs, "courses": dict(sorted(courses.items()))}
    if json.dumps({k: v for k, v in data.items() if k != "updated"}, sort_keys=True) == json.dumps({k: v for k, v in old.items() if k != "updated"}, sort_keys=True):
        print("course descriptions: no change")
        return
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
    if DEBUG:
        with open(os.path.join(ROOT, "data", "course_descriptions_lines.json"), "w", encoding="utf-8") as fh:
            json.dump(DEBUG, fh, ensure_ascii=False, indent=0)
    print(f"course descriptions: {len(courses)} courses from {sum(1 for d in docs.values() if d.get('courses'))}/{len(docs)} files")


if __name__ == "__main__":
    main()
