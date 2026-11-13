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

VERSION = 7
ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "data", "course_descriptions.json")
IMG = os.path.join(ROOT, "data", "coursedesc")
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
    """[(page, text, top, bottom)] for every visual line of the file, top to bottom (positions in PDF points)."""
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
                    out.append((n, t, min(c["top"] for c in cs), max(c["bottom"] for c in cs)))
    return out


def parse(lines, known):
    """Courses of one file: {code: {name, hours, pre, text, page}}."""
    # running heads and feet (the same line on three pages or more) are not part of any description
    pages = Counter()
    for p, t in {(x[0], x[1]) for x in lines}:
        pages[t] += 1
    noise = {t for t, k in pages.items() if k >= 3}
    found, cur = {}, None

    def head(t):
        if len(t) > 160:
            return None
        # a line that is only a prerequisite («متطلب سابق: 603391», read right to left) names no course of its own
        if PRE.search(t) or PRE.search(t[::-1]):   # some files keep a line's letters in reverse order
            rest = re.sub(r"(ال)?متطلب(ات)?|(ال)?سابق[ةه]?|prerequisites?|pre-?req\.?|لا يوجد|none|[\d\s+،,/:;()\[\].\-–و]", "", t if PRE.search(t) else t[::-1], flags=re.I)
            if len(rest) < 4:
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

    def span(c, page, top, bottom):   # the part of the page the course takes, page by page
        if c["seg"] and c["seg"][-1][0] == page:
            c["seg"][-1][2] = bottom
        else:
            c["seg"].append([page, top, bottom])

    for page, t, top, bottom in lines:
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
            cur = found[code] = {"name": name[:160], "hours": int(hm.group(1)) if hm else None, "pre": re.sub(r"\s+", " ", pre).strip()[:200], "text": [], "page": page, "seg": []}
            span(cur, page, top, bottom)
            continue
        if cur is not None:
            span(cur, page, top, bottom)
            if not cur["pre"] and PRE.match(t):
                cur["pre"] = t[:200]
                continue
            cur["text"].append(t)
    out = {}
    for code, c in found.items():
        text = re.sub(r"\s+", " ", " ".join(c["text"])).strip()
        if len(text) < 25 or len(text) > 4000:   # no description, or the cut went wrong: not shown
            continue
        out[code] = {**c, "text": text, "clean": clean_text(text)}
    return out


def clean_text(t):
    """False when the file's text layer is damaged (a font without a proper character map drops letters and turns the
    stretch of a word into a run of «ا»): then the page itself is shown, not the text."""
    ar = re.findall(r"[\u0600-\u06ff]+", t)
    if not ar:
        return True
    single = sum(1 for w in ar if len(w) == 1 and w not in "وبلك")
    return not re.search(r"ا{3,}|(?:\b\w\b ){4}", t) and single / len(ar) <= 0.03


def ocr_text(pg, top, bottom):
    """The printed text of one part of a page, read from its image at 300 dpi."""
    try:
        import pytesseract
    except ImportError:
        return ""
    w, h = pg.get_width(), pg.get_height()
    scale = 300 / 72
    img = pg.render(scale=scale).to_pil().convert("L")
    img = img.crop((0, int(max(0, top - 3) * scale), int(w * scale), int(min(h, bottom + 4) * scale)))
    try:
        t = pytesseract.image_to_string(img, lang="ara+eng", config="--psm 6")
    except Exception as e:  # no Arabic data on this machine: the page image is shown instead
        print(f"  OCR: {e}", file=sys.stderr)
        return ""
    t = unicodedata.normalize("NFKC", t)
    t = t.replace("»", "،").replace("؛؛", "؛")   # Tesseract reads the Arabic comma as «»»
    # drop the course's own title and prerequisite lines, which the page shows apart
    lines = [l.strip() for l in t.splitlines() if l.strip()]
    lines = [l for l in lines if not PRE.search(l) and not re.match(r"^\(?\d{6,7}\)?\s", l) and not re.search(r"\(\s*\d\s*-\s*\d\s*[:：]\s*\d\s*\)", l)]
    return " ".join(lines)


def crops(pdf_bytes, sha, got):
    """Every course's part of the page as an image (the published text exactly as printed), once per file."""
    import pypdfium2 as pdfium
    os.makedirs(IMG, exist_ok=True)
    doc = pdfium.PdfDocument(pdf_bytes)
    for code, c in got.items():
        names, ocr = [], []
        for i, (page, top, bottom) in enumerate(c["seg"][:3]):
            name = f"{sha[:12]}-{VERSION}-{code}-{i}.webp"
            path = os.path.join(IMG, name)
            if not os.path.exists(path):
                pg = doc[page - 1]
                w, h = pg.get_width(), pg.get_height()
                scale = 1100 / w
                img = pg.render(scale=scale).to_pil().convert("RGB")
                y0, y1 = max(0, (top - 4) * scale), min(h * scale, (bottom + 5) * scale)
                img.crop((int(0.04 * w * scale), int(y0), int(0.96 * w * scale), int(y1))).save(path, "WEBP", quality=70, method=6)
            names.append(name)
            if not c["clean"]:
                ocr.append(ocr_text(doc[page - 1], top, bottom))
        c["img"] = names
        if not c["clean"] and any(ocr):
            # the file's own text drops letters: the text is read from the printed page instead (Tesseract, Arabic + English)
            text = re.sub(r"\s+", " ", " ".join(ocr)).strip()
            c["text"], c["ocr"] = text, True
        c.pop("seg", None)


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
            try:
                crops(pdf, sha, got)
            except Exception as e:  # no images: the text and the link stay
                rec["img_error"] = repr(e)[:200]
                for c in got.values():
                    c.pop("seg", None)
            rec.update({"sha": sha, "read": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "lines": len(lines), "courses": len(got),
                        "sample": [x[1] for x in lines[:4]], "clean": sum(1 for c in got.values() if c["clean"])})
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
    used = {n for L in courses.values() for e in L for n in e.get("img", [])}
    for n in os.listdir(IMG) if os.path.isdir(IMG) else []:
        if n not in used:
            os.remove(os.path.join(IMG, n))
    print(f"course descriptions: {len(courses)} courses from {sum(1 for d in docs.values() if d.get('courses'))}/{len(docs)} files")


if __name__ == "__main__":
    main()
