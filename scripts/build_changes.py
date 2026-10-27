"""«ما الجديد؟»: what changed in the timetable, the staff directory and the academic calendar.

Each run compares the current data with a compact snapshot of the previous run (data/snapshot.json) and adds the
differences to data/changes.json (newest first, the last 120 days), plus an Atom feed (data/changes.xml).

    python scripts/build_changes.py   # after the hourly updates

The log starts empty (the first run only takes the snapshot). It is not rebuilt from the repository's history: early
commits also hold changes in how the sources were read (spelling fixes, new sources), which are not changes at the
university.

Guards against a bad fetch: when a source loses more than 30% of its records in one run, that source is left out of
this run (its snapshot is kept), and a field that changes on more than a quarter of the records at once (a change in
how the source is read, not in the data) is not logged.
"""
import json
import os
from datetime import datetime, timedelta, timezone
from xml.sax.saxutils import escape

ROOT = os.path.join(os.path.dirname(__file__), "..")
DATA = os.path.join(ROOT, "data")
SNAP = os.path.join(DATA, "snapshot.json")
OUT = os.path.join(DATA, "changes.json")
FEED = os.path.join(DATA, "changes.xml")
SITE = "https://marafah.github.io/uopstaff/"
KEEP_DAYS, KEEP_MAX = 120, 6000
DAYS = {"ح": "الأحد", "ن": "الاثنين", "ث": "الثلاثاء", "ر": "الأربعاء", "خ": "الخميس", "س": "السبت", "ج": "الجمعة"}
DAY_ORDER = "حنثرخسج"
SEC_FIELDS = [("instructor", "المدرس"), ("times", "الموعد"), ("room", "القاعة"), ("building", "المبنى"), ("status", "الحالة"), ("capacity", "السعة")]
STAFF_FIELDS = [("job", "الوظيفة"), ("ext", "الفرعي"), ("office", "المكتب"), ("department", "القسم"), ("faculty", "الكلية / الوحدة")]
CAL_FIELDS = [("start", "من"), ("end", "إلى")]


# ---------------------------------------------------------------- compact states
def clean(v):
    return " ".join(str(v if v is not None else "").replace("‏", "").replace("‎", "").split())


def sections(tt):
    out = {}
    for s in tt.get("sections", []):
        meets = sorted(s.get("meetings", []), key=lambda m: (DAY_ORDER.find(m["day"]), m.get("start", "")))
        times = "؛ ".join(f'{DAYS.get(m["day"], m["day"])} {m["start"]}–{m["end"]}' + (f' ({m["mode"]})' if m.get("mode") and m["mode"] != "وجاهي" else "")
                         if m.get("start") else f'{m.get("mode", "")}' for m in meets)
        key = "|".join(clean(s.get(k)) for k in ("code", "section", "activity", "degree", "study_type"))
        out[key] = {"code": clean(s["code"]), "name": clean(s["name"]), "section": clean(s["section"]), "activity": clean(s.get("activity")),
                    "degree": clean(s.get("degree")), "faculty": clean(s.get("faculty")), "department": clean(s.get("department")),
                    "instructor": clean(s.get("instructor")), "times": times, "room": clean(s.get("room")), "building": clean(s.get("building")),
                    "status": clean(s.get("status")), "capacity": str(s.get("capacity", ""))}
    return out


def staff(sd):
    fac = {f["id"]: f["name"] for f in sd.get("faculties", [])}
    out = {}
    for m in sd.get("members", []):
        key = (m.get("email") or "").lower() or clean(m["name"])
        out[key] = {"name": clean(m["name"]), "job": clean(m.get("job")), "ext": clean(m.get("ext")), "office": clean(m.get("office")),
                    "department": clean(m.get("department")), "faculty": fac.get(m.get("faculty"), clean(m.get("faculty"))), "type": m.get("type", "")}
    return out


def calendar(cd):
    out = {}
    for sem in cd.get("semesters", []):
        for e in sem.get("events", []):
            out[e["id"]] = {"title": clean(e["title"]), "semester": clean(sem["name"]), "start": e.get("start", ""), "end": e.get("end", ""), "category": e.get("category", "")}
    return out


# ---------------------------------------------------------------- differences
def diff(old, new, fields):
    """(added keys, removed keys, {key: [(field, label, old, new)]}); a field changing on more than a quarter of the
    records at once is a change in how the source is read and is dropped."""
    added = [k for k in new if k not in old]
    removed = [k for k in old if k not in new]
    changed = {}
    for k in new:
        if k in old:
            ch = [(f, label, old[k].get(f, ""), new[k].get(f, "")) for f, label in fields if old[k].get(f, "") != new[k].get(f, "")]
            if ch:
                changed[k] = ch
    common = len([k for k in new if k in old]) or 1
    for f, _ in fields:
        n = sum(1 for ch in changed.values() if any(c[0] == f for c in ch))
        if n > max(40, common // 4):
            print(f"  skipped field {f}: {n} of {common} records at once")
            for k in list(changed):
                changed[k] = [c for c in changed[k] if c[0] != f]
                if not changed[k]:
                    del changed[k]
    return added, removed, changed


def lost_too_much(old, new):
    return bool(old) and sum(1 for k in old if k not in new) > 0.3 * len(old)


def events_for(at, old, new):
    """change events between two states ({'sections', 'staff', 'calendar'})"""
    ev = []
    # sections: a class the portal lists under two degrees is one class (one event, both degrees)
    if "sections" in new and not lost_too_much(old.get("sections"), new["sections"]):
        o, n = old.get("sections"), new["sections"]
        if o is not None:
            a, r, c = diff(o, n, SEC_FIELDS)
            grouped = {}
            for op, keys, src in (("add", a, n), ("remove", r, o)):
                for k in keys:
                    s = src[k]
                    grouped.setdefault((op, s["code"], s["section"], s["activity"], ""), []).append(s)
            for k, ch in c.items():
                s = n[k]
                sig = json.dumps([x[0:4] for x in ch], ensure_ascii=False)
                grouped.setdefault(("change", s["code"], s["section"], s["activity"], sig), []).append((s, ch))
            for (op, code, sec, act, _), items in grouped.items():
                s = items[0][0] if op == "change" else items[0]
                degrees = sorted({(x[0] if op == "change" else x)["degree"] for x in items})
                e = {"at": at, "kind": "section", "op": op, "title": f'{s["code"]} {s["name"]}', "section": sec, "activity": act,
                     "degrees": degrees, "faculty": s["faculty"], "department": s["department"], "instructor": s["instructor"],
                     "link": f'timetable.html?q={s["code"]}'}
                if op == "change":
                    e["fields"] = [[label, ov, nv] for _, label, ov, nv in items[0][1]]
                else:
                    e["detail"] = [["المدرس", s["instructor"]], ["الموعد", s["times"]], ["القاعة", s["room"]]]
                ev.append(e)
    if "staff" in new and not lost_too_much(old.get("staff"), new["staff"]):
        o, n = old.get("staff"), new["staff"]
        if o is not None:
            a, r, c = diff(o, n, STAFF_FIELDS)
            for op, keys, src in (("add", a, n), ("remove", r, o)):
                for k in keys:
                    m = src[k]
                    ev.append({"at": at, "kind": "staff", "op": op, "title": m["name"], "sub": m["job"], "faculty": m["faculty"], "department": m["department"],
                               "detail": [["الفرعي", m["ext"]], ["المكتب", m["office"]]], "link": f'directory.html?q={m["name"]}'})
            for k, ch in c.items():
                m = n[k]
                ev.append({"at": at, "kind": "staff", "op": "change", "title": m["name"], "sub": m["job"], "faculty": m["faculty"], "department": m["department"],
                           "fields": [[label, ov, nv] for _, label, ov, nv in ch], "link": f'directory.html?q={m["name"]}'})
    if "calendar" in new and not lost_too_much(old.get("calendar"), new["calendar"]):
        o, n = old.get("calendar"), new["calendar"]
        if o is not None:
            a, r, c = diff(o, n, CAL_FIELDS)
            # an event whose dates moved comes back under a new id: pair it with the removed one of the same title
            for k in list(a):
                e = n[k]
                twin = next((x for x in r if o[x]["title"] == e["title"] and o[x]["semester"] == e["semester"]), None)
                if twin:
                    a.remove(k); r.remove(twin)
                    c[k] = [(f, label, o[twin][f], e[f]) for f, label in CAL_FIELDS if o[twin][f] != e[f]]
            for op, keys, src in (("add", a, n), ("remove", r, o)):
                for k in keys:
                    e = src[k]
                    ev.append({"at": at, "kind": "calendar", "op": op, "title": e["title"], "sub": e["semester"],
                               "detail": [["من", e["start"]], ["إلى", e["end"]]], "link": "calendar.html"})
            for k, ch in c.items():
                if ch:
                    e = n[k]
                    ev.append({"at": at, "kind": "calendar", "op": "change", "title": e["title"], "sub": e["semester"],
                               "fields": [[label, ov, nv] for _, label, ov, nv in ch], "link": "calendar.html"})
    return ev


def state_of(tt, sd, cd):
    st = {}
    if tt is not None:
        st["sections"] = sections(tt)
    if sd is not None:
        st["staff"] = staff(sd)
    if cd is not None:
        st["calendar"] = calendar(cd)
    return st


def merged(old, new):
    """the snapshot to keep: a source left out of this run (a bad fetch) keeps its previous state"""
    out = dict(old)
    for k, v in new.items():
        if not lost_too_much(old.get(k), v):
            out[k] = v
    return out


# ---------------------------------------------------------------- output
def save(log):
    cut = (datetime.now(timezone.utc) - timedelta(days=KEEP_DAYS)).isoformat()
    log["events"] = [e for e in log["events"] if e["at"] >= cut][:KEEP_MAX]
    log["updated"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(log, f, ensure_ascii=False, separators=(",", ":"))
    kinds = {"section": "الجدول الدراسي", "staff": "دليل الموظفين", "calendar": "التقويم الجامعي"}
    ops = {"add": "جديد", "remove": "حُذف", "change": "تغيّر"}
    entries = []
    for i, e in enumerate(log["events"][:150]):
        what = "؛ ".join(f"{label}: {ov or '—'} ← {nv or '—'}" for label, ov, nv in e.get("fields", [])) or "؛ ".join(f"{k}: {v}" for k, v in e.get("detail", []) if v)
        title = f'{kinds[e["kind"]]} · {ops[e["op"]]}: {e["title"]}' + (f' (شعبة {e["section"]})' if e.get("section") else "")
        entries.append(f'<entry><id>{SITE}changes.html#{escape(e["at"])}-{i}</id><title>{escape(title)}</title><updated>{e["at"]}</updated>'
                       f'<link href="{SITE}{escape(e.get("link", "changes.html"))}"/><content type="text">{escape(what)}</content></entry>')
    with open(FEED, "w", encoding="utf-8") as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="ar">'
                f'<title>ما الجديد؟ – جامعة البترا (غير رسمي)</title><id>{SITE}changes.html</id><link href="{SITE}changes.html"/>'
                f'<updated>{log["updated"]}</updated><author><name>marafah.github.io/uopstaff</name></author>' + "".join(entries) + "</feed>\n")


def load(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def stamp(d, fallback):
    return (d or {}).get("updated") or fallback


def run():
    tt, sd, cd = (load(os.path.join(DATA, n)) for n in ("timetable.json", "staff.json", "calendar.json"))
    new = state_of(tt, sd, cd)
    old = load(SNAP)
    log = load(OUT) or {"started": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "events": []}
    if old is None:
        print("first run: snapshot only")
    else:
        at = max(stamp(tt, ""), stamp(sd, ""), stamp(cd, "")) or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        ev = events_for(at, old, new)
        print(f"{len(ev)} changes")
        log["events"] = ev + log["events"]
        new = merged(old, new)
    with open(SNAP, "w", encoding="utf-8") as f:
        json.dump(new, f, ensure_ascii=False, separators=(",", ":"))
    save(log)


if __name__ == "__main__":
    run()
