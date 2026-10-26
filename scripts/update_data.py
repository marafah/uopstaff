"""Refresh data/staff.json from the University of Petra website.

Sources (public, used by the university's own pages):
  * academic staff – the InstructorProfile service behind every faculty's "AllAcademicStaff.aspx" page
    (each faculty is queried on its own: the all-faculties call leaves out the deans);
  * administrative staff – the SharePoint list "AdministrativeStaff" on each faculty site.
Only what the public pages show is kept: no personal e-mail, home address, mobile or employee number.
Photos are stored with the site (assets/photos/, 240px thumbnails): inside the university network the
university's hosts resolve to private addresses, so loading them from a public page makes browsers ask
for "local network" permission. Local copies avoid that and load faster.

    pip install requests pillow
    python scripts/update_data.py
"""
import hashlib
import io
import json
import os
import re
import sys
from collections import OrderedDict
from datetime import datetime, timezone
from urllib.parse import quote

import requests

API = "https://services.uop.edu.jo/InstructorProfile/Services/api"
PHOTO_BASE = "https://services.uop.edu.jo/InstructorProfile/ProfileImage/"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
TIMEOUT = 40
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "staff.json")
PHOTOS = os.path.join(os.path.dirname(__file__), "..", "assets", "photos")
THUMB = 240  # px, longest side

FACULTIES = [  # id used by the InstructorProfile service, Arabic, English, faculty site sub-domain
    (1, "كلية تكنولوجيا المعلومات", "Information Technology", "fit"),
    (2, "كلية الصيدلة والعلوم الطبية", "Pharmacy & Medical Sciences", "pharma"),
    (3, "كلية العلوم الإدارية والمالية", "Administrative & Financial Sciences", "fafs"),
    (4, "كلية العمارة والتصميم", "Architecture & Design", "arch"),
    (5, "كلية الآداب والعلوم", "Arts and Sciences", "artsci"),
    (9, "كلية الحقوق", "Law", "law"),
    (11, "كلية الإعلام", "Mass Communication", "mass"),
    (12, "كلية الهندسة", "Engineering", "eng"),
    (13, "كلية طب الأسنان", "Dentistry", "dentist"),
]
UNITS = [  # non-faculty units with an administrative staff page: id (outside the InstructorProfile range), Arabic, English, page, list web
    (100, "رئاسة الجامعة", "University Presidency", "https://www.uop.edu.jo/Ar/UniversityPresident/Pages/AdministrativeStaff.aspx",
     "https://www.uop.edu.jo/En/UniversityPresident"),
]
RANKS = [("أستاذ", "Professor", 1), ("أستاذ مشارك", "Associate Professor", 2), ("أستاذ مساعد", "Assistant Professor", 3),
         ("مدرس", "Lecturer", 4), ("محاضر", "Instructor", 5), ("مشرف مختبر", "Lab Supervisor", 6)]
RANK_ORDER = {r[0]: r[2] for r in RANKS}
ROLES = [  # leadership role from the job title -> (label, order); first match wins
    (r"نائب رئيس الجامعة|vice president", "نائب رئيس الجامعة", 1),
    (r"^(?!.*(نائب|مساعد)).*عميد|^dean", "عميد", 2),
    (r"نائب (ال)?عميد", "نائب عميد", 3),
    (r"مساعد (ال)?(عميد|رئيس)", "مساعد عميد / رئيس", 4),
    (r"رئيس قسم|head of", "رئيس قسم", 5),
    (r"مدير|director", "مدير", 6),
]


def clean(v):
    return re.sub(r"\s+", " ", re.sub(r"[​-‏‪-‮⁠﻿]", "", str(v or ""))).strip()  # drop zero-width / bidi marks


def role_of(*titles):
    text = " ".join(clean(t) for t in titles if t)
    if re.search(r"سكرت|مكتب|secretar", text, flags=re.I):  # "سكرتيرة العميد" is not a leadership role
        return "", 10
    for pattern, label, order in ROLES:
        if re.search(pattern, text, flags=re.I):
            return label, order
    return "", 10


def site_url(site):
    return f"https://{site}.uop.edu.jo"


def fetch_academic(s, faculties, log):
    data = []
    for fid in sorted(faculties):
        data += s.get(f"{API}/MemberInfo/GetFaculty?fact={fid}&deptID=0", timeout=TIMEOUT).json()
    data += s.get(f"{API}/MemberInfo/GetFaculty?fact=0&deptID=0", timeout=TIMEOUT).json()
    people = OrderedDict()
    for d in data:
        enc = d.get("enc")
        if not enc:
            continue
        dept = clean(d.get("DeptNameArabic"))
        if enc in people:  # listed under two departments
            p = people[enc]
            if dept and dept not in p["department"]:
                p["department"] += f"، {dept}"
            continue
        fid = int(d.get("FacultyID") or 0)
        fac = faculties.get(fid)
        rank = clean(d.get("AcademicRankArabic")).replace("استاذ", "أستاذ")
        job_ar, job_en = clean(d.get("JobTitleArabic")), clean(d.get("JobTitle"))
        role, order = role_of(job_ar, job_en)
        img = clean(d.get("ImagePath"))
        people[enc] = {
            "id": f"A:{enc}", "type": "academic", "faculty": fid if fac else None,
            "name": clean(d.get("FullNameAr")) or clean(d.get("FullNameEn")), "name_en": clean(d.get("FullNameEn")),
            "job": job_ar, "rank": rank, "rank_order": RANK_ORDER.get(rank, 9), "role": role, "sort": order,
            "department": dept,
            "specialization": " – ".join(x for x in [clean(d.get("GeneralSpecializationArabic")), clean(d.get("SpecificSpecializationArabic"))] if x),
            "qualification": "", "ext": clean(d.get("Extention")), "office": clean(d.get("OfficeNumber")),
            "email": clean(d.get("UniversityEmail")).lower(),
            "photo": PHOTO_BASE + quote(img) if img else "",
            "profile": f"{site_url(fac[2]) if fac else 'https://www.uop.edu.jo'}/Ar/Pages/AcademicStaffInfo.aspx?uid={enc}",
            "source": "academic_api",
        }
    log(f"academic staff: {len(people)}")
    return list(people.values())


def fetch_admin(s, fid, key, name, page, api, log):
    """`page` is the public list page, `api` the SharePoint web that holds the AdministrativeStaff list."""
    origin = "/".join(page.split("/")[:3])
    s.get(page, timeout=TIMEOUT)  # SharePoint hands out the anonymous session cookie here
    h = {"Accept": "application/json; odata=nometadata", "Referer": page}
    lst = f"{api}/_api/web/lists/getbytitle('AdministrativeStaff')/items"
    r = s.get(lst + "?$top=1000&$orderby=Order0 asc", headers=h, timeout=TIMEOUT)
    r.raise_for_status()
    out = []
    for it in r.json()["value"]:
        photo = ""
        try:
            html = s.get(f"{lst}({it['ID']})/FieldValuesAsHtml", headers=h, timeout=TIMEOUT).json().get("PublishingPageImage") or ""
            m = re.search(r'src="([^"]+)"', html)
            if m:
                photo = m.group(1) if m.group(1).startswith("http") else origin + quote(m.group(1), safe="/%:")
        except Exception:
            pass
        job_ar, job_en = clean(it.get("PositionAR")), clean(it.get("Position"))
        role, order = role_of(job_ar, job_en)
        out.append({
            "id": f"S:{key}:{it['ID']}", "type": "admin", "faculty": fid,
            "name": clean(it.get("TitleAR")) or clean(it.get("Title")), "name_en": clean(it.get("Title")),
            "job": job_ar, "rank": "", "rank_order": 99, "role": role, "sort": order + 20,
            "department": "", "specialization": "",
            "qualification": " – ".join(x for x in [clean(it.get("QualificationAR")), clean(it.get("UniversityAR"))] if x),
            "ext": clean(it.get("ExtensionNumber")), "office": clean(it.get("OfficeLocationAR")) or clean(it.get("OfficeLocation")),
            "email": clean(it.get("Email")).lower(), "photo": photo, "profile": page, "source": f"admin_{key}",
        })
    log(f"administrative staff – {name}: {len(out)}")
    return out


def cache_photos(s, members, log):
    """Store each photo once as a small JPEG named after its source URL; drop files nobody uses any more."""
    from PIL import Image
    os.makedirs(PHOTOS, exist_ok=True)
    used, fetched, failed = set(), 0, 0
    for m in members:
        src = m.get("photo_src") or (m["photo"] if m["photo"].startswith("http") else "")
        m["photo_src"] = src
        if not src:
            m["photo"] = ""
            continue
        name = hashlib.sha1(src.encode("utf-8")).hexdigest()[:16] + ".jpg"
        path = os.path.join(PHOTOS, name)
        if not os.path.exists(path):
            try:
                r = s.get(src, timeout=TIMEOUT)
                r.raise_for_status()
                img = Image.open(io.BytesIO(r.content)).convert("RGB")
                img.thumbnail((THUMB, THUMB))
                img.save(path, "JPEG", quality=82, optimize=True, progressive=True)
                fetched += 1
            except Exception:
                failed += 1
                m["photo"] = ""  # initials instead of a broken or off-site image
                continue
        used.add(name)
        m["photo"] = f"assets/photos/{name}"
    removed = 0
    for f in os.listdir(PHOTOS):
        if f.endswith(".jpg") and f not in used:
            os.remove(os.path.join(PHOTOS, f))
            removed += 1
    log(f"photos: {len(used)} stored ({fetched} new, {removed} removed, {failed} unavailable)")


def main():
    s = requests.Session()
    s.headers["User-Agent"] = UA
    faculties = {fid: (ar, en, site) for fid, ar, en, site in FACULTIES}
    lines, members, sources, failed = [], [], [], []

    def log(msg):
        lines.append(msg)
        print(msg)

    try:
        acad = fetch_academic(s, faculties, log)
        members += acad
        sources.append({"key": "academic_api", "name": "الهيئة التدريسية – خدمة الملفات الأكاديمية", "kind": "academic",
                        "url": f"{API}/MemberInfo/GetFaculty?fact=0&deptID=0", "count": len(acad)})
    except Exception as e:
        failed.append(f"academic: {e}")
    admin_pages = [(fid, ar, "unit", page, api) for fid, ar, _en, page, api in UNITS] + [
        (fid, fac[0], fac[2], f"{site_url(fac[2])}/Ar/Pages/AllAdministrativeStaff.aspx", site_url(fac[2])) for fid, fac in faculties.items()]
    for fid, name, key, page, api in admin_pages:
        key = "president" if key == "unit" else key
        try:
            adm = fetch_admin(s, fid, key, name, page, api, log)
            members += adm
            sources.append({"key": f"admin_{key}", "name": f"الكادر الإداري – {name}", "kind": "admin",
                            "url": page, "count": len(adm), "faculty": fid})
        except Exception as e:
            failed.append(f"{name}: {e}")
            log(f"FAILED {name}: {e}")

    # Keep the previous data for any source that failed, so one unreachable site never empties the page.
    if failed and os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as f:
            old = json.load(f)
        ok_sources = {x["key"] for x in sources}
        kept = [m for m in old.get("members", []) if m["source"] not in ok_sources]
        members += kept
        sources += [x for x in old.get("sources", []) if x["key"] not in ok_sources]
        log(f"kept {len(kept)} members from the previous update for {len(failed)} failed source(s)")
    if not members:
        print("no data fetched; leaving data/staff.json unchanged", file=sys.stderr)
        sys.exit(1)

    cache_photos(s, members, log)
    order = {fid: i for i, (fid, *_rest) in enumerate(UNITS + FACULTIES)}
    members.sort(key=lambda m: (order.get(m["faculty"], 99), m["sort"], m["rank_order"], m["name"]))
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    data = {
        "updated": now,
        "main_line": "+96265799555", "main_line_display": "06 5799555",
        "faculties": [{"id": fid, "name": ar, "name_en": en, "site": "https://www.uop.edu.jo", "unit": True} for fid, ar, en, *_ in UNITS]
                     + [{"id": fid, "name": ar, "name_en": en, "site": site_url(site)} for fid, ar, en, site in FACULTIES],
        "ranks": [r[0] for r in RANKS], "roles": [r[1] for r in ROLES],
        "sources": sources, "failed": failed, "members": members,
    }
    # "updated" = when the data last changed; keep it (and the file) as is when nothing changed
    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as f:
            old = json.load(f)
        if {k: v for k, v in old.items() if k != "updated"} == {k: v for k, v in data.items() if k != "updated"}:
            print(f"no changes since {old.get('updated')}")
            return
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=0)
    print(f"wrote {len(members)} members to data/staff.json" + (f" ({len(failed)} source(s) failed)" if failed else ""))


if __name__ == "__main__":
    main()
