"""Refresh data/staff.json from the University of Petra website.

Sources (public, used by the university's own pages):
  * academic staff – the InstructorProfile service behind every faculty's "AllAcademicStaff.aspx" page
    (each faculty is queried on its own: the all-faculties call leaves out the deans);
  * administrative staff – the SharePoint list "AdministrativeStaff" on each faculty site.
Only what the public pages show is kept: no personal e-mail, home address, mobile or employee number.

    pip install requests
    python scripts/update_data.py
"""
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
    return re.sub(r"\s+", " ", str(v or "")).strip()


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


def fetch_admin(s, fid, fac, log):
    site = site_url(fac[2])
    page = f"{site}/Ar/Pages/AllAdministrativeStaff.aspx"
    s.get(f"{site}/Ar/Pages/default.aspx", timeout=TIMEOUT)  # SharePoint hands out the anonymous session cookie here
    h = {"Accept": "application/json; odata=nometadata", "Referer": page}
    lst = f"{site}/_api/web/lists/getbytitle('AdministrativeStaff')/items"
    r = s.get(lst + "?$top=1000&$orderby=Order0 asc", headers=h, timeout=TIMEOUT)
    r.raise_for_status()
    out = []
    for it in r.json()["value"]:
        photo = ""
        try:
            html = s.get(f"{lst}({it['ID']})/FieldValuesAsHtml", headers=h, timeout=TIMEOUT).json().get("PublishingPageImage") or ""
            m = re.search(r'src="([^"]+)"', html)
            if m:
                photo = m.group(1) if m.group(1).startswith("http") else site + quote(m.group(1), safe="/%:")
        except Exception:
            pass
        job_ar, job_en = clean(it.get("PositionAR")), clean(it.get("Position"))
        role, order = role_of(job_ar, job_en)
        out.append({
            "id": f"S:{fac[2]}:{it['ID']}", "type": "admin", "faculty": fid,
            "name": clean(it.get("TitleAR")) or clean(it.get("Title")), "name_en": clean(it.get("Title")),
            "job": job_ar, "rank": "", "rank_order": 99, "role": role, "sort": order + 20,
            "department": "", "specialization": "",
            "qualification": " – ".join(x for x in [clean(it.get("QualificationAR")), clean(it.get("UniversityAR"))] if x),
            "ext": clean(it.get("ExtensionNumber")), "office": clean(it.get("OfficeLocationAR")) or clean(it.get("OfficeLocation")),
            "email": clean(it.get("Email")).lower(), "photo": photo, "profile": page, "source": f"admin_{fac[2]}",
        })
    log(f"administrative staff – {fac[1]}: {len(out)}")
    return out


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
    for fid, fac in faculties.items():
        try:
            adm = fetch_admin(s, fid, fac, log)
            members += adm
            sources.append({"key": f"admin_{fac[2]}", "name": f"الكادر الإداري – {fac[0]}", "kind": "admin",
                            "url": f"{site_url(fac[2])}/Ar/Pages/AllAdministrativeStaff.aspx", "count": len(adm), "faculty": fid})
        except Exception as e:
            failed.append(f"{fac[0]}: {e}")
            log(f"FAILED {fac[0]}: {e}")

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

    order = {fid: i for i, (fid, *_rest) in enumerate(FACULTIES)}
    members.sort(key=lambda m: (order.get(m["faculty"], 99), m["sort"], m["rank_order"], m["name"]))
    data = {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "main_line": "+96265799555", "main_line_display": "06 5799555",
        "faculties": [{"id": fid, "name": ar, "name_en": en, "site": site_url(site)} for fid, ar, en, site in FACULTIES],
        "ranks": [r[0] for r in RANKS], "roles": [r[1] for r in ROLES],
        "sources": sources, "failed": failed, "members": members,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=0)
    print(f"wrote {len(members)} members to data/staff.json" + (f" ({len(failed)} source(s) failed)" if failed else ""))


if __name__ == "__main__":
    main()
