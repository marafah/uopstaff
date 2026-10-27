"""Organizational structure page data (data/org.json).

The structure itself is data/org_structure.json, transcribed by hand from the official chart
(www.uop.edu.jo/Ar/MoreAbout/Documents/OrganizationalStructure.pdf): the PDF's text layer is garbled and its
hierarchy is only drawn lines, so reading it automatically would guess. This script, run every hour:
  1. links each box to the staff directory (data/staff.json): the people whose job title names the box, the unit's
     staff count, and for each faculty its academic departments and their heads;
  2. downloads the official PDF and compares it with the transcribed version (SHA-256). A different file is shown
     on the page as "a new official version is under review" until data/org_structure.json is updated to it.

    python scripts/update_org.py
"""
import hashlib
import io
import json
import os
import re
import sys
from datetime import datetime, timezone

import requests

ROOT = os.path.join(os.path.dirname(__file__), "..")
STRUCT = os.path.join(ROOT, "data", "org_structure.json")
STAFF = os.path.join(ROOT, "data", "staff.json")
OUT = os.path.join(ROOT, "data", "org.json")
UA = "Mozilla/5.0 (compatible; uop-staff-directory; +https://marafah.github.io/uopstaff/)"
LEAD = {"رئيس مجلس الأمناء": 0, "رئيس الجامعة": 0, "نائب رئيس الجامعة": 1, "عميد": 2, "نائب عميد": 3,
        "مساعد عميد / رئيس": 4, "مدير": 5, "رئيس قسم": 6}


def norm(s):
    s = re.sub(r"[ً-ْـ]", "", str(s or ""))  # harakat, tatweel
    s = s.translate(str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ة": "ه", "ى": "ي"}))
    return re.sub(r"\s+", " ", s).strip()


def depts(v):
    return [x.strip() for x in str(v or "").split("،") if x.strip()]


def person(m):
    return {k: m.get(k, "") for k in ("id", "name", "job", "role", "type", "ext", "email", "photo", "faculty")}


def check_pdf(url, known_sha, previous):
    """The official PDF compared with the transcribed one. Keeps the previous result when the site is unreachable."""
    try:
        r = requests.get(url, headers={"User-Agent": UA}, timeout=60)
        r.raise_for_status()
        if not r.content.startswith(b"%PDF"):
            raise ValueError("not a PDF")
    except Exception as e:
        print(f"official PDF unavailable: {e}")
        return previous or {"status": "unknown"}
    sha = hashlib.sha256(r.content).hexdigest()
    revision = ""
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(r.content)) as pdf:
            text = " ".join(p.extract_text() or "" for p in pdf.pages)
        m = re.search(r"Rev\.?\s*([A-Z])\s*,\s*(\d{1,2})\s*/\s*(\d{1,2})\s*/\s*(\d{4})", text)
        if m:
            revision = f"Rev.{m.group(1)}, {int(m.group(2))}/{int(m.group(3))}/{m.group(4)}"
    except Exception as e:
        print(f"could not read the revision line: {e}")
    same = sha == known_sha
    out = {"status": "current" if same else "changed", "sha256": sha, "revision": revision,
           "last_modified": r.headers.get("Last-Modified", ""), "size": len(r.content)}
    if not same:
        # when the new version was first seen (kept across runs while it stays unreviewed)
        prev_same_file = previous and previous.get("sha256") == sha and previous.get("changed_since")
        out["changed_since"] = previous["changed_since"] if prev_same_file else datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return out


def main():
    with open(STRUCT, encoding="utf-8") as f:
        struct = json.load(f)
    with open(STAFF, encoding="utf-8") as f:
        staff = json.load(f)
    members = staff["members"]
    units = {str(x["id"]): x for x in staff["faculties"]}
    previous = {}
    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as f:
            previous = json.load(f)

    # a department belongs to the faculty most of its members are in (same rule as the directory page)
    home = {}
    for m in members:
        for d in depts(m["department"]):
            home.setdefault(d, {}).setdefault(str(m["faculty"]), 0)
            home[d][str(m["faculty"])] += 1
    home = {d: max(c, key=c.get) for d, c in home.items()}

    used_units, matched_ids = set(), set()

    def build(node, ctx_unit):
        unit = str(node["unit"]) if node.get("unit") is not None else None
        ctx = unit or ctx_unit
        out = {k: v for k, v in node.items() if k not in ("children", "match", "unit")}
        people = []
        for pat in node.get("match", []):
            scoped = pat.startswith("@")
            rx = re.compile(norm(pat.lstrip("@")))
            for m in members:
                if scoped and str(m["faculty"]) != ctx:
                    continue
                if node["kind"] != "board" and m["type"] == "board" and m["role"] not in ("رئيس الجامعة",):
                    continue  # trustees' board titles only count for the board itself
                if rx.search(norm(m["job"])) and m not in people:
                    people.append(m)
        if node["kind"] == "faculty" and unit:
            # the dean: "عميد" / "عميد كلية …" of this faculty (not a dean of a deanship who teaches here)
            people += [m for m in members if str(m["faculty"]) == unit and m["role"] == "عميد" and m not in people
                       and re.search(r"^عميد($| الكليه| كليه)", norm(m["job"]))]
        people.sort(key=lambda m: (LEAD.get(m["role"], 9), m["name"]))
        matched_ids.update(m["id"] for m in people)
        if unit:
            used_units.add(unit)
            u = units.get(unit)
            unit_staff = [m for m in members if str(m["faculty"]) == unit]
            out["unit"] = {"id": unit, "name": u["name"] if u else "", "count": len(unit_staff),
                           "academic": sum(m["type"] == "academic" for m in unit_staff)}
        out["people"] = [person(m) for m in people]
        kids = [build(c, ctx) for c in node.get("children", [])]
        if node["kind"] == "faculty" and unit:
            # academic departments (from the directory: the official chart stops at the faculty)
            for d in sorted((d for d, f in home.items() if f == unit), key=lambda d: norm(d)):
                in_d = [m for m in members if d in depts(m["department"]) and m["type"] == "academic"]
                heads = [m for m in in_d if m["role"] == "رئيس قسم" or re.search(r"رئيس قسم", norm(m["job"]))]
                kids.append({"id": f"{node['id']}-d{len(kids)}", "name": f"قسم {d}", "kind": "academic-dept", "from_directory": True,
                             "dept": d, "count": len(in_d), "people": [person(m) for m in sorted(heads, key=lambda m: m["name"])]})
        if kids:
            out["children"] = kids
        return out

    tree = build(struct["root"], None)
    official = check_pdf(struct["source"], struct.get("pdf_sha256", ""), previous.get("official"))

    def count(n):
        return 1 + sum(count(c) for c in n.get("children", []) if not c.get("from_directory"))
    data = {
        "updated": staff["updated"],
        "source": struct["source"], "revision": struct["revision"], "revision_date": struct["revision_date"],
        "official": official,
        "boxes": count(tree),
        "tree": tree,
        # directory units the official chart does not show (e.g. created after the chart's revision)
        "not_in_chart": [{"id": str(u["id"]), "name": u["name"], "count": sum(str(m["faculty"]) == str(u["id"]) for m in members)}
                         for u in staff["faculties"] if str(u["id"]) not in used_units],
    }
    if previous and {k: v for k, v in previous.items() if k != "updated"} == {k: v for k, v in data.items() if k != "updated"}:
        print("org: no changes")
        return
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=0)
    print(f"org: {data['boxes']} boxes, official PDF {official.get('status')}"
          + (f" (new version since {official.get('changed_since')})" if official.get("status") == "changed" else ""))


if __name__ == "__main__":
    sys.exit(main())
