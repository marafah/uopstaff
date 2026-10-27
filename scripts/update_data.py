"""Refresh data/staff.json from the University of Petra website.

Sources (public, used by the university's own pages):
  * academic staff – the InstructorProfile service behind every faculty's "AllAcademicStaff.aspx" page
    (each faculty is queried on its own: the all-faculties call leaves out the deans);
  * administrative staff – the SharePoint list "AdministrativeStaff" on each faculty site and on every unit of
    www.uop.edu.jo that has one (presidency, admissions, centres ...; found through the site navigation each run).
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
WWW = "https://www.uop.edu.jo"
UNITS = [  # units of www.uop.edu.jo known to keep their own list: SharePoint web, Arabic name, English name
    ("BoardofTrustees", "مجلس الأمناء", "Board of Trustees"),
    ("UniversityPresident", "رئاسة الجامعة", "University Presidency"),
    ("AdmissionsAndRegistration", "عمادة القبول والتسجيل", "Admissions and Registration"),
    ("ComputerCenter", "مركز الحاسوب والمعلومات والسيطرة", "Computer Center"),
    ("ELearningCenter", "مركز التعلم الإلكتروني", "E-Learning Center"),
    ("ContinuingEducationCenter", "مركز التعليم المستمر وخدمة المجتمع", "Continuing Education Center"),
]
# sub-sites that are not units of their own: their staff list is shown under another unit
MERGED = {"adnan": "boardoftrustees"}  # the higher consultant's office: its staff serve the Board of Trustees
TEMPLATE_WEB = "CenterTemplate"  # new unit sites start with a copy of this list; such copies are not real staff lists
RANKS = [("أستاذ", "Professor", 1), ("أستاذ مشارك", "Associate Professor", 2), ("أستاذ مساعد", "Assistant Professor", 3),
         ("مدرس", "Lecturer", 4), ("محاضر", "Instructor", 5), ("مشرف مختبر", "Lab Supervisor", 6)]
RANK_ORDER = {r[0]: r[2] for r in RANKS}
ROLES = [  # leadership role from the job title -> (label, order); first match wins
    (r"^رئيس مجلس الأمناء|^chairman", "رئيس مجلس الأمناء", 0),
    (r"^رئيس الجامعة|^president", "رئيس الجامعة", 0),
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


def discover_units(s, log):
    """Units with a real AdministrativeStaff list: the known ones plus any web found in the site navigation."""
    h = {"Accept": "application/json; odata=nometadata", "Referer": f"{WWW}/Ar/Pages/default.aspx"}
    s.get(f"{WWW}/Ar/Pages/default.aspx", timeout=TIMEOUT)
    webs = OrderedDict((w.lower(), (w, ar, en)) for w, ar, en in UNITS)

    def add(link):
        m = re.match(r"(?i)^(?:https?://(?:www\.)?uop\.edu\.jo)?/(?:ar|en)/([^/?#]+)/", (link or "") + "/")
        if m and m.group(1).lower() not in webs and m.group(1).lower() not in ("pages", "_layouts", "documents", "publishingimages"):
            webs[m.group(1).lower()] = (m.group(1), "", "")

    def walk(node):
        for x in node.get("Nodes", []):
            add(x.get("SimpleUrl"))
            walk(x)
    # the home page menus are built from these two lists
    for lst in ("MenuQuickNavigation", "UsersLink"):
        try:
            for it in s.get(f"{WWW}/_api/web/lists/getbytitle('{lst}')/items?$top=1000&$select=LinkAR,Link", headers=h, timeout=TIMEOUT).json()["value"]:
                for k in ("LinkAR", "Link"):
                    v = it.get(k)
                    add(v.get("Url") if isinstance(v, dict) else v)
        except Exception as e:
            log(f"menu {lst} unavailable: {e}")
    for lang in ("Ar", "En"):
        try:
            walk(s.get(f"{WWW}/{lang}/_api/navigation/menustate?mapprovidername='GlobalNavigationSwitchableProvider'&depth=10",
                       headers=h, timeout=TIMEOUT).json())
        except Exception as e:
            log(f"navigation ({lang}) unavailable: {e}")

    def staff_of(web):
        r = s.get(f"{WWW}/En/{web}/_api/web/lists/getbytitle('AdministrativeStaff')/items?$top=1000&$select=Title,TitleAR,Email",
                  headers=h, timeout=TIMEOUT)
        return r.json().get("value", []) if r.ok else None
    template = staff_of(TEMPLATE_WEB)
    out = []
    for key, (web, ar, en) in webs.items():
        if key == TEMPLATE_WEB.lower():
            continue
        try:
            # a missing sub-site resolves to its parent, so the web's own URL must match
            info = s.get(f"{WWW}/Ar/{web}/_api/web?$select=Url,Title", headers=h, timeout=TIMEOUT)
            if not info.ok or not info.json()["Url"].lower().endswith(f"/ar/{key}"):
                continue
            items = staff_of(web)
            if not items or items == template:
                continue
            ar = ar or clean(info.json()["Title"])
            page = next((f"{WWW}/Ar/{web}/Pages/{pg}" for pg in ("AdministrativeStaff.aspx", "AllAdministrativeStaff.aspx")
                         if s.get(f"{WWW}/Ar/{web}/Pages/{pg}", timeout=TIMEOUT, allow_redirects=False).status_code == 200),
                        f"{WWW}/Ar/{web}/Pages/default.aspx")
            out.append((key, ar, en or ar, page, f"{WWW}/En/{web}"))
        except Exception as e:
            log(f"unit {web}: {e}")
    log(f"units with their own staff list: {len(out)}")
    return out


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
            "name": short_title(clean(it.get("TitleAR")) or clean(it.get("Title"))), "name_en": clean(it.get("Title")),
            "job": job_ar, "rank": "", "rank_order": 99, "role": role, "sort": order + 20,
            "department": "", "specialization": "",
            "qualification": " – ".join(x for x in [clean(it.get("QualificationAR")), clean(it.get("UniversityAR"))] if x),
            "ext": clean(it.get("ExtensionNumber")), "office": clean(it.get("OfficeLocationAR")) or clean(it.get("OfficeLocation")),
            "email": clean(it.get("Email")).lower(), "photo": photo, "profile": page, "source": f"admin_{key}",
        })
    log(f"administrative staff – {name}: {len(out)}")
    return out


BOARD = ("boardoftrustees", "BoardofTrustees", 2)  # the board's members: the web's AllStaff list, StaffTypeId 2
HONORIFIC = [(r"^(معالي|عطوفة|سعادة)\s+الدكتور\s+", r"\1 د. "), (r"^الأستاذ الدكتور\s+", "أ.د. "), (r"^الدكتور\s+", "د. "),
             (r"^المهندس\s+", "م. "), (r"^(السيد|السيدة|الآنسة)\s+", "")]


def short_title(name):
    """The directory's short titles ("الأستاذ الدكتور" -> "أ.د.", "المهندس" -> "م."); courtesy titles are dropped."""
    for pattern, repl in HONORIFIC:
        name = re.sub(pattern, repl, name)
    return name


def fetch_board(s, log):
    """Board of Trustees members (www.uop.edu.jo/Ar/BoardofTrustees/Pages/AllStaff.aspx?staffid=2), in the board's order.
    Most members are from outside the university: they have no e-mail or extension."""
    key, web, type_id = BOARD
    page = f"{WWW}/Ar/{web}/Pages/AllStaff.aspx?staffid={type_id}"
    s.get(page, timeout=TIMEOUT)
    h = {"Accept": "application/json; odata=nometadata", "Referer": page}
    lst = f"{WWW}/En/{web}/_api/web/lists/getbytitle('AllStaff')/items"
    r = s.get(lst + f"?$top=500&$orderby=Order0 asc&$filter=StaffTypeId eq {type_id}", headers=h, timeout=TIMEOUT)
    r.raise_for_status()
    out = []
    for it in sorted(r.json()["value"], key=lambda x: x.get("Order0") or 99):
        name = short_title(clean(it.get("TitleAR")) or clean(it.get("Title"))).replace('"', "")
        # the site puts the board role in either field ("رئيس المجلس" / "عضو" / "أمين سر المجلس")
        parts = []
        for v in (clean(it.get("PositionAR")), clean(it.get("RankAR"))):
            v = re.sub(r"^عضو(اً?)?$", "عضو مجلس الأمناء", v)
            v = re.sub(r"^(رئيس|أمين سر) المجلس$", r"\1 مجلس الأمناء", v)
            if v and v not in parts:
                parts.append(v)
        job = " – ".join(parts)
        photo = ""
        try:
            html = s.get(f"{lst}({it['ID']})/FieldValuesAsHtml", headers=h, timeout=TIMEOUT).json().get("PublishingPageImage") or ""
            m = re.search(r'src="([^"]+)"', html)
            if m:
                photo = m.group(1) if m.group(1).startswith("http") else WWW + quote(m.group(1), safe="/%:")
        except Exception:
            pass
        role, _order = role_of(job)
        out.append({
            "id": f"B:{key}:{it['ID']}", "type": "board", "faculty": key,
            "name": name, "name_en": clean(it.get("Title")).replace('"', ""),
            "job": job, "rank": "", "rank_order": 99, "role": role, "sort": int(it.get("Order0") or 99),
            "department": "", "specialization": "", "qualification": "",
            "ext": clean(it.get("Ext")), "office": "", "email": clean(it.get("Email")).lower(),
            "photo": photo, "profile": page, "source": f"board_{key}",
        })
    log(f"board of trustees: {len(out)}")
    return out


CORRECTIONS = os.path.join(os.path.dirname(__file__), "..", "data", "corrections.json")
CORRECTABLE = ("department", "job", "rank", "ext", "office")


def apply_corrections(members, log):
    """Known corrections to the official data (data/corrections.json), matched by e-mail. The official values are
    kept in "corrected" so the page can say what the official site shows."""
    if not os.path.exists(CORRECTIONS):
        return []
    with open(CORRECTIONS, encoding="utf-8") as f:
        fixes = json.load(f)
    by_mail = {m["email"]: m for m in members if m["email"]}
    for fx in fixes:
        m = by_mail.get(fx["email"].lower())
        if not m:
            log(f"correction for {fx['email']}: no such person in the official data")
            continue
        official = {k: m[k] for k in CORRECTABLE if k in fx and fx[k] != m[k]}
        if not official:
            continue  # the official site now says the same: nothing to correct
        m.update({k: fx[k] for k in official})
        m["role"], order = role_of(m["job"])
        m["sort"] = order + (20 if m["type"] == "admin" else 0)
        m["corrected"] = {"official": official, "note": fx.get("note", "")}
    log(f"corrections applied: {sum(1 for m in members if m.get('corrected'))}")
    return fixes


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
    units = discover_units(s, log)
    names = {key: ar for key, ar, *_ in units}
    admin_pages = [(MERGED.get(key, key), names.get(MERGED.get(key), ar), key, page, api) for key, ar, _en, page, api in units] + [
        (fid, fac[0], fac[2], f"{site_url(fac[2])}/Ar/Pages/AllAdministrativeStaff.aspx", site_url(fac[2])) for fid, fac in faculties.items()]
    for fid, name, key, page, api in admin_pages:
        try:
            adm = fetch_admin(s, fid, key, name, page, api, log)
            members += adm
            label = f"الكادر الإداري – {name}" + (" (صفحة إضافية)" if key in MERGED else "")
            sources.append({"key": f"admin_{key}", "name": label, "kind": "admin",
                            "url": page, "count": len(adm), "faculty": fid})
        except Exception as e:
            failed.append(f"{name}: {e}")
            log(f"FAILED {name}: {e}")
    # board members come after the staff lists, so a member who is also on a staff list keeps that entry (same e-mail)
    if not any(u[0] == BOARD[0] for u in units):
        units.insert(0, next((w.lower(), ar, en, f"{WWW}/Ar/{w}/Pages/AllStaff.aspx?staffid={BOARD[2]}", f"{WWW}/En/{w}")
                             for w, ar, en in UNITS if w.lower() == BOARD[0]))
    try:
        board = fetch_board(s, log)
        members += board
        sources.append({"key": f"board_{BOARD[0]}", "name": "مجلس الأمناء", "kind": "board",
                        "url": f"{WWW}/Ar/{BOARD[1]}/Pages/AllStaff.aspx?staffid={BOARD[2]}", "count": len(board), "faculty": BOARD[0]})
    except Exception as e:
        failed.append(f"board: {e}")
        log(f"FAILED board: {e}")

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

    # one entry per person: the same e-mail on two lists (e.g. a dean listed again by a centre) keeps the first
    seen, unique = set(), []
    for m in members:
        if m["email"] and m["email"] in seen:
            continue
        seen.add(m["email"])
        unique.append(m)
    if len(unique) < len(members):
        log(f"duplicates dropped: {len(members) - len(unique)}")
    members = unique
    # unit lists (e.g. the green-campus team) can include faculty staff: their job or office names the faculty
    for m in members:
        if isinstance(m["faculty"], str):
            fid = next((fid for fid, ar, *_ in FACULTIES if ar in f'{m["job"]} {m["office"]}'), None)
            if fid:
                m["faculty"] = fid

    corrections = apply_corrections(members, log)
    cache_photos(s, members, log)
    order = {fid: i for i, fid in enumerate([u[0] for u in units] + [f[0] for f in FACULTIES])}
    members.sort(key=lambda m: (order.get(m["faculty"], 99), m["sort"], m["rank_order"], m["name"]))
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    data = {
        "updated": now,
        "main_line": "+96265799555", "main_line_display": "06 5799555",
        "faculties": [{"id": key, "name": ar, "name_en": en, "site": WWW, "unit": True} for key, ar, en, *_ in units if any(m["faculty"] == key for m in members)]
                     + [{"id": fid, "name": ar, "name_en": en, "site": site_url(site)} for fid, ar, en, site in FACULTIES],
        "ranks": [r[0] for r in RANKS], "roles": [r[1] for r in ROLES],
        "sources": sources, "failed": failed, "members": members,
        # kept with the data so the page's live update applies them too
        "corrections": corrections,
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
