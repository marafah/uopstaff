"""Read a University of Petra advisory study plan («الخطة الاسترشادية») out of its PDF.

The plans are Excel sheets saved as PDF: for every year a band «السنة الأولى (30 ساعة معتمدة)», under it the semesters
side by side, each a table «رقم المادة | عنوان المادة | المتطلب السابق | (mark) | س.م» and a total row. The same
layout appears in the department handbooks and, in English, in the English plans.

Arabic text in these files is stored in visual order (right to left glyph by glyph, lam-alef as one glyph), so every cell
is rebuilt from its glyphs: glyphs sorted right to left, runs of digits and Latin letters put back left to right, and
brackets mirrored. Course numbers, hours and prerequisites are read as they are printed; nothing is inferred.

    plan = parse(path)  ->  {"title", "edition", "years": [{"name", "hours", "terms": [{"name", "courses": [...], "total"}]}], "pages"}
"""
import re
import unicodedata

import pdfplumber

# bump when the reading changes, so every file is read again
VERSION = 3

CODE = re.compile(r"^\d{6,7}$")
LTR = re.compile(r"[0-9A-Za-z.+*/&%:\-_]")
MIRROR = str.maketrans("()[]{}<>", ")(][}{><")
# Persian / Urdu forms some fonts use for Arabic letters (they look the same): back to the Arabic letters
PERSIAN = str.maketrans({"\u06CC": "\u064A", "\u06BE": "\u0647", "\u06A9": "\u0643", "\u06C1": "\u0647"})
AR = re.compile(r"[؀-ۿ]")

TERM_AR = [("الفصل الصيفي", "summer"), ("الصيفي", "summer"), ("الفصل الأول", "first"), ("الفصل الاول", "first"), ("الفصل الثاني", "second")]
TERM_EN = [("summer", "summer"), ("first", "first"), ("second", "second"), ("fall", "first"), ("spring", "second")]
YEARS_AR = ["الاولي", "الثانيه", "الثالثه", "الرابعه", "الخامسه", "السادسه"]
YEARS_EN = ["first", "second", "third", "fourth", "fifth", "sixth"]


def _line_text(chars):
    """One visual line of glyphs -> logical text."""
    chars = sorted(chars, key=lambda c: c["x0"])
    if not chars:
        return ""
    # spaces the PDF does not store: a gap wider than a third of the font size
    seq = []
    for i, c in enumerate(chars):
        if i and c["x0"] - chars[i - 1]["x1"] > max(1.2, c["size"] * 0.28) and seq[-1] != " " and c["text"] != " ":
            seq.append(" ")
        seq.append(c["text"])
    vis = "".join(seq)
    if not AR.search(vis):
        return re.sub(r"\s+", " ", vis).strip()
    # right-to-left line: reverse the glyphs, then put every left-to-right run back in its own order
    glyphs = [g for g in reversed(seq)]
    out, run = [], []

    def flush():
        if run:
            # keep the spaces that sit inside the run, trim the ones at its edges
            s = "".join(reversed(run))
            out.append(s)
            run.clear()
    for g in glyphs:
        if LTR.search(g) and not AR.search(g):
            run.append(g)
        elif g == " " and run:
            run.append(g)
        else:
            if run and run[-1] == " ":
                trailing = run.pop()
                flush()
                out.append(trailing)
            flush()
            out.append(g)
    flush()
    s = "".join(out).translate(PERSIAN)
    # brackets: these files store the mirrored glyph, so after reversing a pair reads ")x(" -> "(x)"
    s = re.sub(r"\)([^()]{0,40}?)\(", r"(\1)", s)
    return re.sub(r"\s+", " ", s).strip()


def cell_text(page, bbox):
    x0, top, x1, bottom = bbox
    cs = [c for c in page.chars if c["x0"] >= x0 - 0.5 and c["x1"] <= x1 + 0.5 and c["top"] >= top - 0.5 and c["bottom"] <= bottom + 0.5]
    lines = []
    for c in sorted(cs, key=lambda c: c["top"]):
        if lines and abs(lines[-1][0] - c["top"]) < c["size"] * 0.5:
            lines[-1][1].append(c)
        else:
            lines.append([c["top"], [c]])
    return " ".join(t for t in (_line_text(l[1]) for l in lines) if t)


def _norm(s):
    s = s.translate(PERSIAN)
    return re.sub(r"[ً-ْـ]", "", s).replace("أ", "ا").replace("إ", "ا").replace("آ", "ا").replace("ة", "ه").replace("ى", "ي").lower()


def _term_of(text):
    n = _norm(text)
    for k, v in TERM_AR:
        if _norm(k) in n:
            return v
    for k, v in TERM_EN:
        if re.search(rf"\b{k}\b", n) and ("semester" in n or "term" in n):
            return v
    return None


def _year_of(text):
    n = _norm(text)
    if "السنه" in n:
        for i, y in enumerate(YEARS_AR):
            if _norm(y) in n:
                return i + 1
    if "year" in n:
        for i, y in enumerate(YEARS_EN):
            if re.search(rf"\b{y}\b", n):
                return i + 1
    return None


def _hours(text):
    m = re.search(r"(\d+)\s*(ساعة|ساعه|credit|cr)", text, re.I) or re.search(r"\(\s*(\d+)\s", text)
    return int(m.group(1)) if m else None


def _header_kind(t):
    n = _norm(t)
    if "رقم" in n and ("الماده" in n or "المساق" in n) or re.search(r"course\s*(no|code|#|number)", n) or n in ("course", "code", "course no.", "no."):
        return "code"
    if "عنوان" in n or "اسم الماده" in n or re.search(r"course\s*(title|name)", n) or n in ("title", "name"):
        return "name"
    if "المتطلب" in n or "متطلب" in n or "prereq" in n or "pre-req" in n or "pre req" in n:
        return "prereq"
    if n in ("س.م", "س م", "س.م.", "ساعات", "الساعات", "م.س") or n.startswith("س.م") or "معتمد" in n or re.search(r"\b(cr|credit|hrs|hours|ch)\b", n):
        return "hours"
    return None


SLOT = re.compile(r"^(\d{6,7}|\d{0,4}[xX]{2,7})$")   # a course number, or an elective slot such as 6xxxxx


def segments(page):
    """Text pieces of the page: glyphs on one line, split where the gap is wider than a cell's padding."""
    chars = sorted(({**c, "text": unicodedata.normalize("NFKC", c["text"])} for c in page.chars if c["text"].strip() or c["text"] == " "),
                   key=lambda c: (c["top"], c["x0"]))
    lines = []
    for c in chars:
        if lines and abs(lines[-1][0] - c["top"]) < 1.6:
            lines[-1][1].append(c)
        else:
            lines.append([c["top"], [c]])
    out = []
    vedges = [e for e in page.edges if e["orientation"] == "v" and e["bottom"] - e["top"] > 3]
    for top, cs in lines:
        cs.sort(key=lambda c: c["x0"])
        bottom = max(c["bottom"] for c in cs)
        # the table's vertical rules on this line: text on either side of one is in different cells
        rules = sorted(e["x0"] for e in vedges if e["top"] <= top + 1 and e["bottom"] >= bottom - 1)
        groups = [[cs[0]]]
        for c in cs[1:]:
            prev = groups[-1][-1]
            split = c["x0"] - prev["x1"] > max(3.2, c["size"] * 0.45) or (c["x0"] - prev["x1"] > 0.4 and any(prev["x1"] - 0.2 <= r <= c["x0"] + 0.2 for r in rules))
            if split:
                groups.append([c])
            else:
                groups[-1].append(c)
        for g in groups:
            t = _line_text(g)
            if t:
                out.append({"x0": g[0]["x0"], "x1": max(c["x1"] for c in g), "top": min(c["top"] for c in g), "bottom": max(c["bottom"] for c in g), "t": t})
    return out


HEADER_LABELS = re.compile(r"(رقم ال?ماده|رقم ال?مساق|رمز ال?ماده|عنوان ال?ماده|اسم ال?ماده|ال?ماده|ال?متطلب ال?سابق|ال?متطلبات ال?سابقه|متطلب سابق|"
                           r"س\.?م\.?|م\.?س\.?|ال?ساعات( ال?معتمده)?|عدد ال?ساعات|ساعات معتمده|"
                           r"course( no\.?| number| code| #)?|course (title|name)|title|name|code|no\.?|pre-?requisites?|pre-?req\.?|"
                           r"ch|cr\.?|crs|cr\.? ?hrs?\.?|credit ?hours?|credits?|hours|hrs\.?|l)")


def _is_header(t):
    """A column label such as «رقم المادة» or «Course Title», not a course title such as «متطلب جامعة (اجباري)»."""
    n = re.sub(r"\s+", " ", _norm(t)).strip(" :")
    return bool(_header_kind(t) or n == "l") and bool(HEADER_LABELS.fullmatch(n))


def parse_page(page, state):
    """state: what the previous page ended with (its last header row, year and term bands), for tables that run on."""
    segs = segments(page)
    cm = lambda s: (s["x0"] + s["x1"]) / 2
    rows = sorted({round(s["top"]) for s in segs})
    years = [(s["top"], _year_of(s["t"]), _hours(s["t"])) for s in segs if _year_of(s["t"]) and not SLOT.match(s["t"])]
    terms = [(s["top"], cm(s), _term_of(s["t"])) for s in segs if _term_of(s["t"]) and len(s["t"]) < 40]
    heads = [s for s in segs if _is_header(s["t"])]
    hrows = []
    for h in sorted(heads, key=lambda s: s["top"]):
        if hrows and abs(hrows[-1][0] - h["top"]) < 4:
            hrows[-1][1].append(h)
        else:
            hrows.append([h["top"], [h]])
    hrows = [(t, hs) for t, hs in hrows if sum(_header_kind(h["t"]) == "code" for h in hs) >= 1 and len(hs) >= 3]
    if state and state.get("hrows"):
        # a table continued from the previous page: its header, year and semesters still apply above this page
        hrows = [(-1e6, [{k: v for k, v in h.items() if k not in ("e0", "e1")} for h in state["hrows"][-1][1]])] + hrows
        years = [(-1e6, state["years"][-1][1], state["years"][-1][2])] + years if state.get("years") else years
        terms = [(-1e6 + 1, x, tm) for _, x, tm in state.get("lastterms", [])] + terms
    if not hrows:
        return [], []
    if state is not None:
        state["hrows"], state["years"] = hrows, years
        if terms:
            last = max(t[0] for t in terms)
            state["lastterms"] = [t for t in terms if abs(t[0] - last) < 4]
    courses, totals = [], []

    def halves(hs):
        """[(lo, hi, cols)] for each course-number column of a header row: the columns of that semester's table."""
        codes = sorted((h for h in hs if _header_kind(h["t"]) == "code"), key=lambda h: h["x0"])
        names = [h for h in hs if _header_kind(h["t"]) == "name"]
        out = []
        for idx, mycode in enumerate(codes):
            rtl = bool(names) and min(names, key=lambda h: abs(cm(h) - cm(mycode)))["x0"] < mycode["x0"]
            if rtl:
                lo, hi = (codes[idx - 1]["x1"] + 1 if idx else -1), mycode["x1"] + 6
            else:
                lo, hi = mycode["x0"] - 6, (codes[idx + 1]["x0"] - 1 if idx + 1 < len(codes) else 1e9)
            cols = sorted((h for h in hs if lo <= cm(h) <= hi), key=cm)
            for k, h in enumerate(cols):
                if "e0" in h:
                    continue
                vs = sorted({round(e["x0"], 1) for e in page.edges if e["orientation"] == "v" and e["top"] <= h["bottom"] and e["bottom"] >= h["top"]})
                left = [v for v in vs if v <= h["x0"] + 0.5]
                right = [v for v in vs if v >= h["x1"] - 0.5]
                h["e0"] = left[-1] if left else ((cm(cols[k - 1]) + cm(h)) / 2 if k else lo)
                h["e1"] = right[0] if right else ((cm(h) + cm(cols[k + 1])) / 2 if k + 1 < len(cols) else hi)
            out.append((lo, hi, cols, mycode))
        return out

    hedges = [e for e in page.edges if e["orientation"] == "h" and e["x1"] - e["x0"] > 8]

    def band(x, top, bottom):
        """The table row a piece at x sits in: between the horizontal rules above and below it (None without rules)."""
        ys = sorted({round(e["top"], 1) for e in hedges if e["x0"] - 1 <= x <= e["x1"] + 1})
        up = [y for y in ys if y <= top + 1.2]
        down = [y for y in ys if y >= bottom - 1.2]
        if not up or not down or down[0] - up[-1] > 60:
            return None
        return (up[-1], down[0])

    for s in segs:
        txt = s["t"].replace(" ", "")
        if not SLOT.match(txt):
            continue
        above = [hr for hr in hrows if hr[0] < s["top"] - 2]
        if not above:
            continue
        htop, hs = above[-1]
        codes = sorted((h for h in hs if _header_kind(h["t"]) == "code"), key=lambda h: h["x0"])
        mycode = next((h for h in codes if h["x0"] - 6 <= cm(s) <= h["x1"] + 6), None)
        if not mycode:
            continue
        names = [h for h in hs if _header_kind(h["t"]) == "name"]
        rtl = bool(names) and min(names, key=lambda h: abs(cm(h) - cm(mycode)))["x0"] < mycode["x0"]
        idx = codes.index(mycode)
        if rtl:
            lo = codes[idx - 1]["x1"] + 1 if idx else -1
            hi = mycode["x1"] + 6
        else:
            lo = mycode["x0"] - 6
            hi = codes[idx + 1]["x0"] - 1 if idx + 1 < len(codes) else 1e9
        cols = sorted((h for h in hs if lo <= cm(h) <= hi), key=cm)
        # each column spans its cell: the table's vertical rules on either side of the header label (titles are
        # aligned to one side of a wide cell); without rules, halfway to the neighbouring labels
        for k, h in enumerate(cols):
            if "e0" in h:
                continue
            vs = sorted({round(e["x0"], 1) for e in page.edges if e["orientation"] == "v" and e["top"] <= h["bottom"] and e["bottom"] >= h["top"]})
            left = [v for v in vs if v <= h["x0"] + 0.5]
            right = [v for v in vs if v >= h["x1"] - 0.5]
            h["e0"] = left[-1] if left else ((cm(cols[k - 1]) + cm(h)) / 2 if k else lo)
            h["e1"] = right[0] if right else ((cm(h) + cm(cols[k + 1])) / 2 if k + 1 < len(cols) else hi)
        yr = [y for y in years if y[0] < s["top"]]
        tm = [t for t in terms if t[0] < s["top"] and t[0] > (yr[-1][0] if yr else -1) and lo <= t[1] <= hi]
        rec = {"code": txt, "year": yr[-1][1] if yr else None, "year_hours": yr[-1][2] if yr else None,
               "term": tm[-1][2] if tm else None, "name": "", "prereq": "", "mark": "", "hours": None,
               "_y": (s["top"] + s["bottom"]) / 2, "_lo": lo, "_hi": hi, "_cols": cols, "_htop": htop, "_seg": id(s),
               "_band": band(cm(s), s["top"], s["bottom"])}
        courses.append(rec)
    # a row with a title and hours but no course number (a free course, «مادة حرة»): a slot of its own
    used = {c["_seg"] for c in courses}
    for s in segs:
        if id(s) in used or not (AR.search(s["t"]) or re.search(r"[A-Za-z]{3}", s["t"])) or _is_header(s["t"]) or _year_of(s["t"]) or _term_of(s["t"]):
            continue
        y = (s["top"] + s["bottom"]) / 2
        above = [hr for hr in hrows if hr[0] < s["top"] - 2]
        if not above or any(c["_lo"] <= cm(s) <= c["_hi"] and ((c["_band"][0] - 0.5 <= y <= c["_band"][1] + 0.5) if c["_band"] else abs(c["_y"] - y) <= 5) for c in courses):
            continue
        htop, hs = above[-1]
        # the half this title sits in: same rule as for the course numbers
        half = next(((lo, hi, cols) for lo, hi, cols, _ in halves(hs) if lo <= cm(s) <= hi), None)
        if not half:
            continue
        lo, hi, cols = half
        if not any(_header_kind(h["t"]) == "name" and h["e0"] <= cm(s) <= h["e1"] for h in cols):
            continue
        hrs = [n for n in segs if re.fullmatch(r"\d{1,2}", n["t"]) and abs((n["top"] + n["bottom"]) / 2 - y) < 5 and lo <= cm(n) <= hi]
        if not hrs or re.search(r"المجموع|Total", s["t"], re.I):
            continue
        yr = [yy for yy in years if yy[0] < s["top"]]
        tm = [t for t in terms if t[0] < s["top"] and t[0] > (yr[-1][0] if yr else -1) and lo <= t[1] <= hi]
        courses.append({"code": "", "year": yr[-1][1] if yr else None, "year_hours": yr[-1][2] if yr else None, "term": tm[-1][2] if tm else None,
                        "name": "", "prereq": "", "mark": "", "hours": None, "_y": y, "_lo": lo, "_hi": hi, "_cols": cols, "_htop": htop, "_seg": None,
                        "_band": band(cm(s), s["top"], s["bottom"])})
    # every other piece goes to the course of its half on the nearest line
    for s in segs:
        if id(s) in used:
            continue
        y = (s["top"] + s["bottom"]) / 2
        # same table row: inside the course's row rules when the table has them, else within a line's height
        cand = [c for c in courses if c["_lo"] <= cm(s) <= c["_hi"] and c["_htop"] < s["top"] and (
            (c["_band"][0] - 0.5 <= y <= c["_band"][1] + 0.5) if c["_band"] else abs(c["_y"] - y) <= 7)]
        if not cand:
            continue
        c = min(cand, key=lambda c: abs(c["_y"] - y))
        col = next((h for h in c["_cols"] if h["e0"] <= cm(s) <= h["e1"]), None)
        kind = _header_kind(col["t"]) if col else None
        if s["t"] in ("+", "*", "**", "++", "#"):
            c["mark"] = s["t"]
        elif kind == "hours" and re.fullmatch(r"\d{1,2}", s["t"]):
            c["hours"] = int(s["t"])
        elif kind == "prereq":
            c["prereq"] = (c["prereq"] + " " + s["t"]).strip()
        elif kind == "name" or (kind is None and AR.search(s["t"]) or re.search(r"[A-Za-z]{3}", s["t"])) and kind != "prereq":
            c["name"] = (c["name"] + " " + s["t"]).strip() if c["name"] and s["top"] > c["_y"] else (s["t"] + " " + c["name"]).strip()
        elif kind is None and re.fullmatch(r"\d{1,2}", s["t"]) and c["hours"] is None:
            c["hours"] = int(s["t"])
    # printed totals: «المجموع / Total» rows, the number in each half's hours column
    for s in segs:
        if not re.search(r"المجموع|Total", s["t"], re.I):
            continue
        y = (s["top"] + s["bottom"]) / 2
        nums = [n for n in segs if re.fullmatch(r"\d{1,3}", n["t"]) and abs((n["top"] + n["bottom"]) / 2 - y) < 6]
        above = [hr for hr in hrows if hr[0] < s["top"]]
        if not above:
            continue
        yr = [yy for yy in years if yy[0] < s["top"]]
        for h in above[-1][1]:
            if _header_kind(h["t"]) != "hours":
                continue
            n = min(nums, key=lambda n: abs(cm(n) - cm(h)), default=None)
            if n and abs(cm(n) - cm(h)) < 15:
                tm = [t for t in terms if t[0] < s["top"] and t[0] > (yr[-1][0] if yr else -1)]
                term = min(tm, key=lambda t: abs(t[1] - cm(h)))[2] if tm else None
                totals.append({"year": yr[-1][1] if yr else None, "term": term, "total": int(n["t"]), "_x": cm(h)})
    for c in courses:
        for k in [k for k in c if k.startswith("_")]:
            del c[k]
    return courses, totals


def parse(path):
    with pdfplumber.open(path) as pdf:
        courses, pages, head, totals, state = [], [], "", [], {}
        for i, page in enumerate(pdf.pages):
            got, tot = parse_page(page, state)
            if got:
                pages.append(i + 1)
                courses += got
                totals += tot
                if not head:
                    first = min((s["top"] for s in segments(page) if SLOT.match(s["t"].replace(" ", ""))), default=200)
                    head = " ".join(s["t"] for s in segments(page) if s["top"] < first - 30)
    edition = re.search(r"(?:اصدار|إصدار|الإصدار|Version|Edition|Issue)\s*[\(:]?\s*(\d+)", head, re.I)
    years = re.search(r"\(?\s*(20\d\d)\s*[-/–]\s*(20\d\d)\s*\)?", head)
    plan = {"edition": int(edition.group(1)) if edition else None, "academic_year": f"{years.group(1)}/{years.group(2)}" if years else None,
            "pages": pages, "years": []}
    for c in courses:
        y = next((y for y in plan["years"] if y["year"] == c["year"]), None)
        if not y:
            y = {"year": c["year"], "hours": c["year_hours"], "terms": []}
            plan["years"].append(y)
        t = next((t for t in y["terms"] if t["term"] == c["term"]), None)
        if not t:
            t = {"term": c["term"], "courses": []}
            y["terms"].append(t)
        t["courses"].append({k: c[k] for k in ("code", "name", "prereq", "mark", "hours")})
    order = {"first": 0, "second": 1, "summer": 2, None: 3}
    for y in plan["years"]:
        y["terms"].sort(key=lambda t: order[t["term"]])
        for t in y["terms"]:
            t["hours"] = sum(c["hours"] or 0 for c in t["courses"])
    plan["years"].sort(key=lambda y: y["year"] or 99)
    plan["head"] = head
    # the plan's own totals, to check that every course was read
    plan["checks"] = []
    seen = set()
    for t in totals:
        k = (t["year"], t["term"])
        if k in seen:
            continue
        seen.add(k)
        y = next((y for y in plan["years"] if y["year"] == t["year"]), None)
        tt = next((x for x in (y or {}).get("terms", []) if x["term"] == t["term"]), None)
        plan["checks"].append({"year": t["year"], "term": t["term"], "printed": t["total"], "read": tt["hours"] if tt else None})
    for y in plan["years"]:
        y["read_hours"] = sum(t["hours"] for t in y["terms"])
    # verified: every printed figure (semester totals, year hours) equals the sum of the hours read, and there is at
    # least one such figure to compare with
    # the semester totals are the finest check; where a plan prints none, its year headers are used. A year header
    # that disagrees with the plan's own semester totals is noted as it is printed, not corrected.
    printed_years = [y for y in plan["years"] if y["hours"] is not None]
    sem_ok = bool(plan["checks"]) and all(c["printed"] == c["read"] for c in plan["checks"])
    covered = {(c["year"], c["term"]) for c in plan["checks"]}
    all_terms = {(y["year"], t["term"]) for y in plan["years"] for t in y["terms"]}
    yr_ok = bool(printed_years) and all(y["hours"] == y["read_hours"] for y in printed_years)
    # every semester is checked: by its printed total, or (where the plan prints none) by its year's printed hours
    yr_match = {y["year"] for y in printed_years if y["hours"] == y["read_hours"]}
    every = all(k in covered or k[1] == "summer" or k[0] in yr_match for k in all_terms)
    plan["ok"] = bool(plan["years"]) and all(y["year"] is not None for y in plan["years"]) and every and (
        sem_ok or (not plan["checks"] and yr_ok))
    plan["notes"] = [f"year {y['year']}: header says {y['hours']} hours, its semesters total {y['read_hours']}"
                     for y in printed_years if y["hours"] != y["read_hours"]] if sem_ok else []
    return plan
