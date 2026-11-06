"""«المالية»: data/finance.json, read every hour from the university's official pages — nothing estimated or rounded.

Sources (all on www.uop.edu.jo):
  * majors and credit-hour prices: the «UniversityMajor» list that the page «التخصصات المطروحة والرسوم» (AllCourses.aspx)
    draws from, with the faculties in the page's own order («FacultyList»);
  * the semester fees, the master's fees and the admission notes: the text of AllCourses.aspx;
  * «معلومات مالية هامة» (FinanceDepartment): the questions and answers, word for word («ContentItems» list);
  * «المنح الأكاديمية» (AcademicGrants.aspx): the grants text, word for word.

Every number shown on the site is read from these texts. If a source cannot be read, or its text no longer matches
what the reader expects (for example the university rewords a sentence), that part is NOT changed: the last good copy
stays and the page shows that the official page changed and needs a look, with its link. The change is detected by the
hash of each source's text, so a reworded page is never silently replaced by a guess.

    python scripts/update_finance.py            # from the university
    python scripts/update_finance.py --fixtures fixtures/   # offline test with saved copies
"""
import argparse
import datetime as dt
import hashlib
import html
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "data", "finance.json")
BASE = "https://www.uop.edu.jo"
URL = {
    "fees": BASE + "/Ar/AdmissionsAndRegistration/Pages/AllCourses.aspx",
    "finance": BASE + "/Ar/FinanceDepartment/Pages/ImportantFinancialInformation.aspx",
    "grants": BASE + "/Ar/AdmissionsAndRegistration/Pages/AcademicGrants.aspx",
    "brochure": BASE + "/Ar/AdmissionsAndRegistration/Documents/%D8%A8%D8%B1%D9%88%D8%B4%D9%88%D8%B1%20%D8%A7%D9%84%D9%85%D9%86%D8%AD%20%D8%A7%D9%84%D8%AF%D8%B1%D8%A7%D8%B3%D9%8A%D8%A9%20%D9%88%D9%85%D9%86%D8%AD%20%D8%A7%D9%84%D9%85%D8%B3%D8%A7%D8%B9%D8%AF%D8%A9%20%D9%88%D8%A7%D9%84%D9%85%D9%86%D8%AD%20%D8%A7%D9%84%D8%AA%D8%B4%D8%AC%D9%8A%D8%B9%D9%8A%D8%A9.pdf",
    "regulations": BASE + "/Ar/MoreAbout/Pages/GuideLawsRegulationsInstructions.aspx",
    "calendar": BASE + "/Ar/AdmissionsAndRegistration/Documents/AcademicCalendar.pdf",
    "housing": BASE + "/ar/StudentsAffairs/Pages/FemaleStudentHousing.aspx",
}
API_MAJORS = (BASE + "/_api/web/lists/getbytitle('UniversityMajor')/items?$expand=Faculty&$select=Faculty/TitleAR,Faculty/ID,"
              "Title,TitleAR,MajorType,NumberOfHours,LowRate,LowRateAR,LowRate2,LowRate2AR,CostOfHour,CostOfHour2,ID,LinkAR&$orderby=Order0 asc&$top=1000")
API_FACULTIES = BASE + "/_api/web/lists/getbytitle('FacultyList')/items?$orderby=Order0 asc&$top=100"
API_FAQ = BASE + "/en/FinanceDepartment/_api/web/lists/getbytitle('ContentItems')/items?$select=ID,TitleAR,DescriptionAR&$top=500"
DEGREE = {"Bachelors": "بكالوريوس", "Master": "ماجستير"}
ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")


class ReadError(Exception):
    pass


def clean(s):
    """the text as published: entities decoded, invisible marks removed, spaces collapsed (letters and numbers untouched)"""
    s = html.unescape(str(s or ""))
    s = re.sub(r"[​‌‍‎‏ ﻿]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def strip_html(h):
    h = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", h)
    h = re.sub(r"(?i)<br\s*/?>|</p>|</li>|</div>|</h\d>|</tr>", "\n", h)
    return html.unescape(re.sub(r"<[^>]+>", " ", h))


def abs_url(href):
    href = html.unescape(href).strip()
    return href if href.startswith("http") else BASE + ("" if href.startswith("/") else "/") + href


def sha(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


# ------------------------------------------------------------------ fetching
def fetcher(fixtures):
    if fixtures:
        def get(name, url, kind):
            path = os.path.join(fixtures, {"majors": "majors.json", "faculties": "faculties.json", "faq": "faq.json",
                                           "fees": "page.txt", "grants": "grants.txt"}[name])
            with open(path, encoding="utf-8") as f:
                data = f.read()
            return json.loads(data) if kind == "json" else data
        return get
    import requests
    s = requests.Session()
    s.headers.update({"User-Agent": "Mozilla/5.0 (compatible; UoP-Compass/1.0; +https://marafah.github.io/uopstaff/)"})

    def get(name, url, kind):
        r = s.get(url, timeout=60, headers={"Accept": "application/json;odata=verbose"} if kind == "json" else {})
        r.raise_for_status()
        if kind == "json":
            d = r.json()["d"]
            return d.get("results", d)
        r.encoding = "utf-8"
        return r.text
    return get


def page_text(raw, start, end):
    """the main text of a page between two phrases the page always has"""
    t = clean(strip_html(raw)) if "<" in raw else clean(raw)
    i = t.find(start)
    if i < 0:
        raise ReadError(f"لم يُعثر على «{start}»")
    j = t.find(end, i)
    return t[i:j if j > 0 else None].strip()


# ------------------------------------------------------------------ readers
def read_programs(majors, faculties):
    order = {f["ID"]: n for n, f in enumerate(faculties)}
    names = {f["ID"]: clean(f.get("TitleAR") or f.get("Title")) for f in faculties}
    out = []
    for m in majors:
        fid = (m.get("Faculty") or {}).get("ID")
        deg = DEGREE.get(m.get("MajorType"))
        name, price, hours = clean(m.get("TitleAR")), m.get("CostOfHour"), m.get("NumberOfHours")
        if not (fid in names and deg and name and isinstance(price, (int, float)) and price > 0 and isinstance(hours, (int, float)) and hours > 0):
            raise ReadError(f"تخصص بلا بيانات كاملة: {m.get('ID')} {name}")
        low = clean(m.get("LowRateAR") or m.get("LowRate"))
        p = {"id": m["ID"], "faculty": names[fid], "name": name, "degree": deg, "hours": hours, "price": price,
             "min": (low + "%") if re.fullmatch(r"\d+(\.\d+)?", low) else low, "link": m.get("LinkAR") or ""}
        if m.get("CostOfHour2"):
            p["price_intl"] = m["CostOfHour2"]
        out.append((order.get(fid, 99), p))
    if len(out) < 30:
        raise ReadError(f"عدد التخصصات {len(out)} أقل من المتوقع")
    # the page shows each faculty's majors in the list's order, faculty by faculty
    return [p for _, p in sorted(out, key=lambda x: x[0])], [names[f["ID"]] for f in faculties]


def num(pattern, text, what):
    m = re.search(pattern, text)
    if not m:
        raise ReadError(f"لم يُعثر على {what}")
    return int(m.group(1).translate(ARABIC_DIGITS))


def read_fees_page(t):
    t = t.translate(ARABIC_DIGITS)
    head = re.search(r"رسوم تسجيل الفصل الدراسي للطلبة المستجدين لعام (\d{4})\s*[-–/]\s*(\d{4})", t)
    if not head:
        raise ReadError("لم يُعثر على عنوان رسوم التسجيل وسنته")
    year = f"{head.group(1)}-{head.group(2)}"
    notes_part, fees_part = t[:head.start()], t[head.end():]
    D = "دينار(?:اً|ا)?"

    def two(label, key, refund_word):
        m = re.search(re.escape(label) + r"[^:]*\((" + refund_word + r")\)\s*:\s*(\d+)\s*" + D + r" للفصل الاعتيادي،?\s*و\s*(\d+)\s*" + D + r" للفصل الصيفي", fees_part)
        if not m:
            raise ReadError(f"لم يُعثر على {label}")
        return {"key": key, "name": label, "text": clean(m.group(0)), "regular": int(m.group(2)), "summer": int(m.group(3)), "refund": m.group(1) == "مستردة"}

    def one(label, key):
        m = re.search(re.escape(label) + r".*?\((غير مستردة|مستردة)\)\s*:\s*(\d+)\s*" + D + r"(\s*\([^)]*\))?", fees_part)
        if not m:
            raise ReadError(f"لم يُعثر على {label}")
        when = re.findall(r"\((تُدفع[^)]*|لطلبة[^)]*)\)", m.group(0))
        return {"key": key, "name": label, "text": clean(m.group(0)), "once": int(m.group(2)), "refund": m.group(1) == "مستردة", "when": "، ".join(when)}

    if len(re.findall(r"رسوم\s", fees_part)) != 5:
        raise ReadError("تغيّر عدد بنود رسوم التسجيل")
    items = [two("رسوم التسجيل", "registration", "غير مستردة|مستردة"), two("رسوم الخدمات", "services", "غير مستردة|مستردة"),
             two("رسوم تأمين", "insurance", "غير مستردة|مستردة"), one("رسوم طلب التحاق لأول مرة", "application"), one("رسوم امتحانات المستوى", "placement")]
    # the services fee's description in brackets, as published
    sv = re.search(r"رسوم الخدمات\s*(\([^)]*\))", fees_part)
    if sv:
        items[1]["name"] = "رسوم الخدمات " + sv.group(1)
    notes = [clean(x) + "." for x in re.split(r"\.(?!\d)", notes_part) if clean(x)]
    masters = {"thesis_defense": num(r"رسوم مناقشة الرسالة\s*/?\s*الأطروحة\s*(\d+)\s*دينار", t, "رسوم مناقشة الرسالة"),
               "comprehensive": num(r"رسوم الامتحان الشامل\s*(\d+)\s*دينار", t, "رسوم الامتحان الشامل")}
    return {"year": year, "fixed": {"title": clean(head.group(0)), "items": items}, "notes": notes, "masters": masters}


def read_faq(items):
    faq = []
    for it in items:
        q, a_html = clean(it.get("TitleAR")), it.get("DescriptionAR") or ""
        links = [(clean(strip_html(txt)), href) for href, txt in re.findall(r'(?is)<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', a_html)]
        a = "\n".join(clean(x) for x in strip_html(a_html).split("\n") if clean(x))
        if q and a:
            faq.append({"id": it.get("ID"), "q": re.sub(r"^\d+\.\s*", "", q), "a": a,
                        "links": [{"text": t or href, "href": abs_url(href)} for t, href in links]})
    faq.sort(key=lambda x: x["id"] or 0)  # the page's own order
    if len(faq) < 5:
        raise ReadError("الأسئلة والأجوبة أقل من المتوقع")

    def find(word):
        for x in faq:
            if word in x["q"]:
                return x["a"].translate(ARABIC_DIGITS)
        raise ReadError(f"لا سؤال عن {word}")
    early, late, tr = find("التسجيل المبكر وكيف"), find("بعد انتهاء فترة التسجيل المبكر"), find("المواصلات")
    nums = [int(x) for x in re.findall(r"(\d+)", tr)]
    m = re.search(r"ب?\s*(\d+)\s*(?:دينار\S*)?\s*لطالب أول فصل ثم (\d+) دينار كل فصل اعتيادي.*?(\d+) دينار للفصل الإختياري الصيفي.*?ثم (\d+) دينار كل فصل صيفي", tr)
    if not m:
        raise ReadError("لم تُقرأ أرقام المواصلات")
    rf, r, sf, s = (int(x) for x in m.groups())
    if sorted(nums) != sorted([rf, r, sf, s]):
        raise ReadError("أرقام المواصلات غير متطابقة")
    derived = {"early_pct": num(r"(\d+)%\s*من رسوم الساعات", early, "نسبة التسجيل المبكر"),
               "late_pct": num(r"(\d+)%\s*من رسوم الساعات", late, "نسبة الدفع بعد التسجيل المبكر"),
               "late_except_dentistry": "طب الأسنان" in late,
               "transport": {"regular_first": rf, "regular": r, "summer_first": sf, "summer": s}}
    return faq, derived


def read_grants(t, programs, faculties):
    t = t.translate(ARABIC_DIGITS)
    note = re.search(r"لا يخضع طلبة تخصصي.*?\.(?!\d)(?:\s*كما أن مادة العلوم العسكرية.*?\.(?!\d))?", t)
    if not note:
        raise ReadError("لم تُقرأ ملاحظة التخصصات المستثناة")
    note_txt = clean(note.group(0))
    excl_part = note_txt.split("لأي منح")[0]
    excluded = sorted({p["name"] for p in programs if p["degree"] == "بكالوريوس" and all(w in excl_part for w in p["name"].split())})
    if not excluded:
        raise ReadError("لم تُطابق التخصصات المستثناة أي تخصص")

    def bands(part):
        out = []
        for lo, hi, pc in re.findall(r"من\s*(\d+(?:\.\d+)?)%\s*(?:فأكثر|-\s*[أا]قل من\s*(\d+(?:\.\d+)?)%)\s*%?\s*(\d+)\s*%?", part):
            out.append([float(lo), float(hi) if hi else 100.0, int(pc)])
        return out
    a = re.search(r"أ\.\s*(.*?)\s*المعدل العام في الثانوية العامة\s*المنحة المقررة(.*?)ب\.\s*(.*?)\s*المعدل العام في الثانوية العامة\s*المنحة المقررة(.*?)\*", t)
    if not a:
        raise ReadError("لم يُقرأ جدول منح الثانوية العامة")
    label_a, part_a, label_b, part_b = (clean(x) for x in a.groups())
    ba, bb = bands(part_a), bands(part_b)
    # every row of the published table must be read: as many bands as there are "من …%" and "%…" in it
    for part_, b in ((part_a, ba), (part_b, bb)):
        if len(b) != len(re.findall(r"(?<!قل )من\s*\d", part_)) or len(b) != len(re.findall(r"%\s*\d+", part_)):
            raise ReadError("جدول منح الثانوية العامة تغيّر شكله")
    if not ba or not bb:
        raise ReadError("لم تُقرأ شرائح منح الثانوية العامة")
    fac_a = [f for f in faculties if f in label_a]
    maj_a = [p["name"] for p in programs if "تخصص " + p["name"] in label_a]
    keep = re.search(r"\*\s*(تستمر هذه المنحة.*?\.(?!\d))", t)
    kg = dict((int(pc), float(g)) for g, pc in re.findall(r"(\d\.\d\d)\s*(?:على الأقل\s*)?لمنحة ال\s*(\d+)%", t))
    acad = re.search(r"المنحة المقررة من الرسوم الدراسية\s*(.*?)يشترط على الطالب", t)
    if not (keep and kg and acad):
        raise ReadError("لم تُقرأ شروط استمرار المنحة أو جدول التفوق الأكاديمي")
    ab = []
    for m in re.finditer(r"(\d\.\d\d)(?:\s*-\s*(\d\.\d\d))?\s*%\s*(\d+)", acad.group(1)):
        x, y = float(m.group(1)), float(m.group(2) or m.group(1))
        ab.append([min(x, y), max(x, y), int(m.group(3))])
    if not ab or len(ab) != len(re.findall(r"%\s*\d+", acad.group(1))):
        raise ReadError("لم تُقرأ شرائح التفوق الأكاديمي كاملة")
    sent = lambda pat: clean(m.group(0)) if (m := re.search(pat, t)) else ""
    who = sent(r"يشترط لحصول الطالب المستجد على هذه المنحة.*?\.(?!\d)")
    after = sent(r"\*\*\s*يتم تقييم أداء الطالب.*?\.(?!\d)").lstrip("* ")
    covers_a = sent(r"تقدم الجامعة منحة دراسية فصلية[^:]*")
    first = sent(r"يشترط على الطالب للحصول على منحة التفوق الأكاديمي للمرة الأولى.*?الفصل الاعتيادي")
    cont = sent(r"تستمر منحة التفوق الأكاديمي في الفصول اللاحقة.*?\.(?!\d)")
    disc = sent(r"بغض النظر عما ورد.*?\.(?!\d)")
    instr = sent(r"تعليمات رقم \(\d+\) لسنة \d{4}\s*-\s*.*?جامعة البترا")
    if not all([who, first, cont, disc]):
        raise ReadError("لم تُقرأ شروط منح التفوق كاملة")
    return {"excluded_majors": excluded, "excluded_note": note_txt,
            "tawjihi": {"title": "منح التفوق في امتحان الثانوية العامة", "who": who, "covers": "منحة خاصة بالرسوم الدراسية فقط",
                        "groupA": {"label": label_a.rstrip(" ،"), "faculties": fac_a, "majors": maj_a, "bands": ba},
                        "groupB": {"label": label_b, "bands": bb},
                        "keep": clean(keep.group(1)), "after": after, "keep_gpa": {str(k): v for k, v in sorted(kg.items())}},
            "academic": {"title": "منح التفوق الأكاديمي", "covers": covers_a, "bands": sorted(ab, key=lambda b: -b[0]),
                         "first": first, "continue": cont, "discipline": disc},
            "instructions": instr}


# ------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fixtures")
    ap.add_argument("--out", default=OUT)
    args = ap.parse_args()
    get = fetcher(args.fixtures)
    try:
        with open(args.out, encoding="utf-8") as f:
            old = json.load(f)
    except (OSError, ValueError):
        old = {}
    new = {k: v for k, v in old.items()}
    new["sources"] = {**URL}
    hashes, review, now = dict(old.get("hashes", {})), [], dt.datetime.now(dt.timezone(dt.timedelta(hours=3))).isoformat(timespec="seconds")

    def part(name, fn):
        try:
            fn()
            review_old = [r for r in old.get("review", []) if r["part"] == name]
            return bool(review_old) or True
        except Exception as e:  # noqa: BLE001 – any failure keeps the last good copy of this part
            review.append({"part": name, "reason": str(e), "url": URL.get(name, URL["fees"]), "since": next((r["since"] for r in old.get("review", []) if r["part"] == name), now)})
            print(f"[{name}] kept the last copy: {e}", file=sys.stderr)
            return False

    def fees():
        majors, facs = get("majors", API_MAJORS, "json"), get("faculties", API_FACULTIES, "json")
        progs, order = read_programs(majors, facs)
        txt = page_text(get("fees", URL["fees"], "text"), "ملاحظة هامة لطلبة", "ابق معنا")
        page = read_fees_page(txt)
        new.update(programs=progs, faculties=order, year=page["year"], fixed=page["fixed"], notes=page["notes"], masters=page["masters"])
        hashes["fees"] = sha(json.dumps([progs, txt], ensure_ascii=False))

    def faq():
        items = get("faq", API_FAQ, "json")
        f, d = read_faq(items)
        new.update(faq=f, payment=d)
        hashes["finance"] = sha(json.dumps(f, ensure_ascii=False))

    def grants():
        txt = page_text(get("grants", URL["grants"], "text"), "ملاحظة هامة", "دليل أنظمة")
        new["grants"] = read_grants(txt, new.get("programs", []), new.get("faculties", []))
        hashes["grants"] = sha(txt)

    prev_hashes = dict(hashes)
    part("fees", fees)
    part("finance", faq)
    part("grants", grants)
    if not new.get("programs"):
        print("no programmes read and no earlier copy: nothing written", file=sys.stderr)
        return 1
    new["review"] = review
    changes = list(old.get("changes", []))
    for k, v in hashes.items():
        if prev_hashes.get(k) and prev_hashes[k] != v:
            changes.insert(0, {"part": k, "at": now})
    new["changes"] = changes[:50]
    new["note"] = "صفحة غير رسمية؛ كل الأرقام والنصوص منقولة كما تنشرها جامعة البترا على موقعها الرسمي دون تقدير أو تقريب، والمرجع المعتمد دائرة الشؤون المالية ودائرة القبول والتسجيل."
    changed = hashes != old.get("hashes") or review != old.get("review") or not old
    new["hashes"], new["checked"] = hashes, now
    if changed:
        new["updated"] = now
    body = {k: new[k] for k in sorted(new) if k != "checked"}
    if not changed and {k: old.get(k) for k in body} == body:
        print("finance: no change")
        return 0
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(new, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print("finance: written", len(new["programs"]), "programmes;", "review: " + ", ".join(r["part"] for r in review) if review else "all parts read")
    return 0


if __name__ == "__main__":
    sys.exit(main())
