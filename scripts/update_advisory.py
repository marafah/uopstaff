"""Refresh data/advisory_plans.json: every advisory study plan («الخطة الاسترشادية») the faculty sites of the
University of Petra publish, with all its earlier versions, read into years and semesters.

Where the plans are
  * each faculty site (fit., arch., artsci., eng., pharma., law., fafs., dentist., mass.uop.edu.jo) lists its programmes
    in its «FacutlyProgram» list, with the address of each department site (/Ar/<Dept>, /En/<Dept>);
  * the links a department page shows beside its title («كتيّب القسم، الخطة الاسترشادية، الخطة الشجرية …») come from
    the department's «CollageLinks» list (Arabic and English title and link) — read here exactly as the page shows them;
  * the department's document libraries hold the files, and SharePoint keeps every earlier version of each file
    (its «Versions»), which is how the earlier editions of a plan are found.

Every PDF is read with scripts/advisory_parse.py. A plan is marked verified only when the hours read for every semester
equal the totals printed in the plan itself; otherwise only the original pages are shown. The pages that hold a plan
are also saved as images (data/advisory/<file>-<page>.webp) so the site can show the original next to the reading.

Files already read (same content hash) are not downloaded or read again; a run that finds no change writes nothing.

    pip install requests pdfplumber pypdfium2 pillow
    python scripts/update_advisory.py
"""
import hashlib
import io
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from urllib.parse import quote, unquote, urljoin, urlparse

import requests

sys.path.insert(0, os.path.dirname(__file__))
import advisory_parse  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "data", "advisory_plans.json")
IMG = os.path.join(ROOT, "data", "advisory")
HOSTS = {"fit": "تكنولوجيا المعلومات", "arch": "العمارة والتصميم", "artsci": "الآداب والعلوم", "eng": "الهندسة",
         "pharma": "الصيدلة والعلوم الطبية", "law": "الحقوق", "fafs": "العلوم الإدارية والمالية", "dentist": "طب الأسنان",
         "mass": "الإعلام"}
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
JSONH = {"Accept": "application/json; odata=nometadata"}
TIMEOUT = 60

KINDS = [("advisory", r"استرشاد|ارشاد|إرشاد|advis|indicative|guidance plan"), ("tree", r"شجر|tree|sequence"),
         ("handbook", r"كتي|handbo|hanbo|booklet|كتيب"), ("studyplan", r"الخطة الدراسية|خطة دراسية|study ?plan|studyplan")]
SKIP = r"وصف|description|مخرجات|outcome|مصفوف|matrix|سمات|attribute|internationali|بروشور|brochure|الجوده|quality"


def kind_of(*texts):
    t = " ".join(x or "" for x in texts)
    if re.search(SKIP, t, re.I) and not re.search(r"استرشاد|advis", t, re.I):
        return None
    for k, rx in KINDS:
        if re.search(rx, t, re.I):
            return k
    return None


S = requests.Session()
S.headers["User-Agent"] = UA


def get(url, headers=None, **kw):
    # the sites answer their own pages: without a Referer from the same site the firewall refuses (403)
    host = urlparse(url).netloc
    h = {"Referer": f"https://{host}/Ar/Pages/default.aspx", **(headers or {})}
    for attempt in range(4):
        try:
            r = S.get(url, timeout=TIMEOUT, headers=h, **kw)
            if r.status_code in (401, 403, 404):
                return r
            r.raise_for_status()
            return r
        except requests.RequestException as e:
            if attempt == 3:
                raise
            print(f"retry {url}: {type(e).__name__}", file=sys.stderr)
            time.sleep(5 * (attempt + 1))


def api(host, path):
    """A SharePoint REST call; the plain JSON form first, the older «verbose» form if the server does not offer it."""
    url = f"https://{host}{path}"
    r = get(url, headers=JSONH)
    if r.status_code == 200 and r.headers.get("content-type", "").startswith("application/json"):
        return r.json().get("value", [])
    r2 = get(url, headers={"Accept": "application/json;odata=verbose"})
    if r2.status_code == 200 and r2.headers.get("content-type", "").startswith("application/json"):
        d = r2.json().get("d", {})
        return d.get("results", d if isinstance(d, list) else [])
    print(f"  {r.status_code}/{r2.status_code} {r2.headers.get('content-type', '')[:40]} {url[:120]}", file=sys.stderr)
    return None


def lst(host, web, title, query=""):
    return api(host, f"{web}/_api/web/lists/getbytitle('{quote(title)}')/items{query}")


def web_of(url):
    m = re.match(r"^(?:https?://[^/]+)?(/(?:ar|en)/[^/]+)/", url or "", re.I)
    return m.group(1) if m else None


def inventory(sub):
    """Programmes, page links and library files of one faculty site."""
    host = f"{sub}.uop.edu.jo"
    progs = lst(host, "", "FacutlyProgram", "?$top=500") or []
    out = []
    for p in progs:
        ar_web, en_web = web_of(p.get("WebsiteLinkAR")), web_of(p.get("WebsiteLinkEN"))
        if not ar_web and not en_web:
            continue
        key = (ar_web or en_web).split("/")[-1].lower()
        en_base = "/En/" + (en_web or ar_web).split("/")[-1]
        links = lst(host, en_base, "CollageLinks", "?$top=1000") or []
        info = (lst(host, en_base, "CollageInfo", "?$top=10") or [{}])
        rec = {"id": f"{sub}/{key}", "host": host, "faculty": HOSTS[sub], "ar": (p.get("TitleAR") or "").strip(), "en": (p.get("Title") or "").strip(),
               "type": p.get("ProgramsType"), "url_ar": urljoin(f"https://{host}/", p.get("WebsiteLinkAR") or ""),
               "url_en": urljoin(f"https://{host}/", p.get("WebsiteLinkEN") or ""), "links": [], "files": [], "info": {}}
        i0 = info[0] if info else {}
        for k in ("NumberOfHours", "Years", "Fees", "NumberOfHoursAR", "YearsAR", "FeesAR"):
            if i0.get(k):
                rec["info"][k] = i0[k]
        for l in sorted(links, key=lambda x: x.get("Order0") or 0):
            for lang in ("AR", "EN"):
                t, h = (l.get("Title" + lang) or "").strip(), (l.get("Link" + lang) or "").strip()
                if t:
                    rec["links"].append({"lang": lang.lower(), "label": t, "url": urljoin(f"https://{host}/", h) if h else "", "kind": kind_of(t)})
        for web in {w for w in (ar_web, en_web) if w}:
            libs = api(host, f"{web}/_api/web/lists?$select=Title,BaseTemplate,ItemCount&$top=200") or []
            for lib in libs:
                if lib.get("BaseTemplate") != 101 or not lib.get("ItemCount"):
                    continue
                for it in lst(host, web, lib["Title"], "?$select=FileRef,FileLeafRef,Modified,FSObjType&$top=5000") or []:
                    if it.get("FSObjType") == 0 and it["FileLeafRef"].lower().endswith(".pdf"):
                        rec["files"].append({"web": web, "ref": it["FileRef"], "name": it["FileLeafRef"], "mod": it.get("Modified")})
        out.append(rec)
    return out


def versions(host, web, ref):
    v = api(host, f"{web}/_api/web/GetFileByServerRelativeUrl('{quote(ref.replace(chr(39), chr(39) * 2))}')/Versions") or []
    return [{"label": x["VersionLabel"], "created": x.get("Created"), "url": f"https://{host}{web}/{x['Url']}"} for x in v]


def fetch_pdf(url):
    r = get(quote(url, safe=":/?=&%"))
    if r.status_code != 200 or not r.content.startswith(b"%PDF"):
        return None
    return r.content


def render(pdf_bytes, sha, pages):
    """The plan's pages as images, once per file."""
    import pypdfium2 as pdfium
    os.makedirs(IMG, exist_ok=True)
    out = []
    doc = pdfium.PdfDocument(pdf_bytes)
    for p in pages:
        name = f"{sha[:12]}-{p}.webp"
        path = os.path.join(IMG, name)
        if not os.path.exists(path):
            page = doc[p - 1]
            scale = 1500 / page.get_width()
            img = page.render(scale=scale).to_pil().convert("RGB")
            img.save(path, "WEBP", quality=72, method=6)
        out.append(name)
    return out


def read(pdf_bytes, sha, cache):
    if sha in cache:
        return cache[sha]
    with open("/tmp/_adv.pdf", "wb") as fh:
        fh.write(pdf_bytes)
    try:
        plan = advisory_parse.parse("/tmp/_adv.pdf")
    except Exception as e:  # a damaged or unusual file: shown as a link only
        plan = {"error": repr(e)[:200], "years": [], "pages": [], "ok": False}
    import pdfplumber
    with pdfplumber.open("/tmp/_adv.pdf") as pdf:
        plan["npages"] = len(pdf.pages)
        plan["text_pages"] = sum(1 for p in pdf.pages if len(p.chars) > 150)
    plan.pop("head", None)
    cache[sha] = plan
    return plan


def main():
    old = {}
    try:
        with open(OUT, encoding="utf-8") as fh:
            old = json.load(fh)
    except (OSError, ValueError):
        pass
    # reads from an earlier version of the reader are not reused
    cache = old.get("reads", {}) if old.get("parser") == advisory_parse.VERSION else {}
    programs, docs, failed = [], {}, []
    for sub in HOSTS:
        try:
            progs = inventory(sub)
            if not progs:
                raise RuntimeError("no programmes listed (site not reachable from here?)")
        except Exception as e:
            failed.append(f"{sub}: {e}")
            print(f"{sub}: {e}", file=sys.stderr)
            # keep what the previous run found for this faculty
            programs += [p for p in old.get("programs", []) if p["id"].startswith(sub + "/")]
            docs.update({k: v for k, v in old.get("docs", {}).items() if k.startswith(sub + "/")})
            continue
        for p in progs:
            # the plan documents: what the page links to, then any other plan file in the department's libraries
            wanted = []
            for l in p["links"]:
                u = urlparse(l["url"])
                if l["kind"] and u.path.lower().endswith(".pdf") and u.netloc.endswith("uop.edu.jo"):
                    wanted.append((u.netloc, unquote(u.path), l["kind"], l["label"], l["lang"], True))
            seen = {w[1].lower() for w in wanted}
            for f in p["files"]:
                k = kind_of(f["name"])
                if k and f["ref"].lower() not in seen:
                    wanted.append((p["host"], f["ref"], k, f["name"], "ar" if "/ar/" in f["ref"].lower() else "en", False))
                    seen.add(f["ref"].lower())
            p["docs"] = []
            for host, ref, kind, label, lang, linked in wanted:
                did = f"{p['id']}/{hashlib.md5(ref.lower().encode()).hexdigest()[:8]}"
                web = web_of(ref) or "/" + ref.strip("/").split("/")[0]
                mod = next((f["mod"] for f in p["files"] if f["ref"].lower() == ref.lower()), None)
                prev = old.get("docs", {}).get(did)
                d = {"id": did, "program": p["id"], "kind": kind, "label": label, "lang": lang, "linked": linked, "name": ref.split("/")[-1],
                     "url": f"https://{host}{ref}", "mod": mod, "versions": []}
                vlist = versions(host, web, ref) + [{"label": "current", "created": mod, "url": f"https://{host}{ref}"}]
                for v in vlist:
                    pv = next((x for x in (prev or {}).get("versions", []) if x["url"] == v["url"] and x.get("created") == v.get("created")), None)
                    if pv and pv.get("sha") in cache and (v["label"] != "current" or (prev or {}).get("mod") == mod) and all(
                            os.path.exists(os.path.join(IMG, n)) for n in pv.get("images", [])):
                        d["versions"].append(pv)
                        continue
                    b = fetch_pdf(v["url"])
                    if not b:
                        d["versions"].append({**v, "missing": True})
                        continue
                    sha = hashlib.sha256(b).hexdigest()
                    plan = read(b, sha, cache)
                    imgs = []
                    # the original pages: the plan's own pages, or every page of an advisory file (up to 12)
                    if plan.get("pages") or (kind == "advisory" and 0 < plan.get("npages", 0) <= 12):
                        try:
                            imgs = render(b, sha, plan.get("pages") or list(range(1, plan["npages"] + 1)))
                        except Exception as e:
                            print(f"render {ref}: {e}", file=sys.stderr)
                    d["versions"].append({**v, "sha": sha, "size": len(b), "images": imgs})
                docs[did] = d
                p["docs"].append(did)
            del p["files"]
            programs.append(p)
            print(f"{p['id']}: {len(p['docs'])} documents", file=sys.stderr)
    used = {v["sha"] for d in docs.values() for v in d["versions"] if v.get("sha")}
    out = {"updated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "parser": advisory_parse.VERSION, "failed": failed, "faculties": HOSTS,
           "programs": programs, "docs": docs, "reads": {k: v for k, v in cache.items() if k in used}}
    if not programs:
        print("advisory plans: nothing read; the previous file stays", file=sys.stderr)
        sys.exit(1)
    same = {k: v for k, v in old.items() if k != "updated"} == {k: v for k, v in json.loads(json.dumps(out)).items() if k != "updated"}
    if same:
        print("advisory plans unchanged")
        if not os.path.exists(EN_OUT):
            write_english_names(out)
        return
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"advisory plans: {len(programs)} programmes, {len(docs)} documents, {len(used)} files read")
    write_english_names(out)


EN_OUT = os.path.join(ROOT, "data", "course_names_en.json")


def write_english_names(data):
    """data/course_names_en.json: the English name of each course code, from the English editions of the advisory plans.
    The plans spell a name in several ways (and the PDF reading sometimes glues a neighbouring cell to it), so the
    clean spelling met most often wins."""
    seen = {}
    def walk(o):
        if isinstance(o, dict):
            c, n = str(o.get("code", "")), o.get("name")
            if re.fullmatch(r"\d{5,8}", c) and isinstance(n, str) and re.search(r"[A-Za-z]{3}", n):
                n = re.sub(r"\s+", " ", n).strip()
                if not re.search(r"\d{4,}|[\u0600-\u06ff]", n) and 3 <= len(n) <= 90:
                    n = re.sub(r"\s*\(\s*(\w+)\s*\)", r" (\1)", n).strip()
                    seen.setdefault(c, {}).setdefault(n, 0)
                    seen[c][n] += 1
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for x in o:
                walk(x)
    walk(data)
    names = {c: max(v.items(), key=lambda kv: (kv[1], kv[0][:1].isupper(), -len(kv[0])))[0] for c, v in sorted(seen.items())}
    with open(EN_OUT, "w", encoding="utf-8") as fh:
        json.dump({"about": "English course names read from the English advisory plans (scripts/update_advisory.py)", "names": names}, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"English course names: {len(names)}")


if __name__ == "__main__":
    main()
