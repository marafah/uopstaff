"""Read, with Claude, the advisory study plans that scripts/update_advisory.py could not read itself (scanned pages or
tables laid out in a way the text reader cannot follow), and add them to data/advisory_manual.json — the same file that
holds the plans entered by hand, which the site shows exactly like a plan read from text (assets/advisory.js).

  * Only plans that are not already verified (data/advisory_plans.json «reads») and not already in advisory_manual.json
    are sent, and only the current file of each plan (not SharePoint's older versions), so a new or replaced plan is
    read once, within the hour after a faculty publishes it.
  * Claude gets the saved page images (data/advisory/<file>-<page>.webp) and returns every course of every semester.
  * A reading is accepted only when the hours of every semester add up to the total printed in the plan itself (the same
    rule as the text reader). Otherwise nothing is published and the site keeps showing the original pages; the attempt
    is logged in data/advisory_ai_log.json and tried again after a month (the file may have been replaced by then).
  * Needs the repository secret ANTHROPIC_API_KEY (Settings → Secrets and variables → Actions). Without it the script
    does nothing. ADVISORY_MODEL can name another Claude model; ADVISORY_AI_MAX limits the plans read per run.

    python scripts/advisory_ai.py
"""
import base64
import json
import os
import re
import sys
import time

import requests

ROOT = os.path.join(os.path.dirname(__file__), "..")
DATA = os.path.join(ROOT, "data")
PLANS = os.path.join(DATA, "advisory_plans.json")
MANUAL = os.path.join(DATA, "advisory_manual.json")
LOG = os.path.join(DATA, "advisory_ai_log.json")
KEY = os.environ.get("ANTHROPIC_API_KEY", "").strip()
MODEL = os.environ.get("ADVISORY_MODEL", "claude-sonnet-4-5")
MAX = int(os.environ.get("ADVISORY_AI_MAX", "6"))
RETRY_DAYS = 30   # a rejected file is tried again after a month; a failed call (network, quota) the next day
TERM_AR = {"first": "الفصل الأول", "second": "الفصل الثاني", "summer": "الفصل الصيفي"}

PROMPT = """These images are the pages of a university advisory study plan (الخطة الاسترشادية) from the University of Petra, Jordan.
Transcribe it exactly as printed into JSON. Accuracy matters more than anything else: do not guess or invent anything.

Pages show tables per year (السنة الأولى، الثانية …) and semester: الفصل الأول = "first", الفصل الثاني = "second",
الفصل الصيفي = "summer". Each semester usually prints its total credit hours (in its header, e.g. "(18 ساعة معتمدة)", or in a
total row). If the file holds more than one track (مسار), return each track as its own plan.

Return ONLY a JSON object, no other text:
{"plans": [
  {"track": null or "<track name as printed>",
   "academic_year": "<as printed, e.g. 2023/2024>" or null,
   "total_printed": <overall total hours printed> or null,
   "years": [
     {"year": 1, "terms": [
       {"term": "first", "hours": <the total printed for this semester, or null if none is printed>,
        "courses": [{"code": "<as printed, '' if none>", "name": "<as printed>", "prereq": "<as printed, '' if none or '-'>", "hours": <number>}]}
     ]}
   ]}
]}
Rules: keep the printed order; keep placeholder codes (xxxxxxx) as printed; skip empty rows; two prerequisite codes in one cell
are joined with "+". Before answering, add up each semester's course hours and compare with its printed total; re-read any
semester that does not match. If the pages are not a year-by-semester plan at all, return {"plans": []}."""


def load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def ask(images):
    content = []
    for name in images:
        with open(os.path.join(DATA, "advisory", name), "rb") as f:
            content.append({"type": "image", "source": {"type": "base64", "media_type": "image/webp", "data": base64.b64encode(f.read()).decode()}})
    content.append({"type": "text", "text": PROMPT})
    r = requests.post("https://api.anthropic.com/v1/messages", timeout=600, headers={
        "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
        json={"model": MODEL, "max_tokens": 16000, "messages": [{"role": "user", "content": content}]})
    r.raise_for_status()
    text = "".join(b.get("text", "") for b in r.json().get("content", []))
    m = re.search(r"\{.*\}", text, re.S)
    return json.loads(m.group(0)) if m else {"plans": []}


def to_read(plan):
    """the reply in the shape of data/advisory_plans.json «reads»; None unless every printed semester total matches"""
    years, checks, bad = [], [], []
    for y in plan.get("years") or []:
        terms = []
        for t in y.get("terms") or []:
            cs = [{"code": str(c.get("code") or "").strip(), "name": (c.get("name") or "").strip(),
                   "prereq": "" if str(c.get("prereq") or "").strip() in ("-", "—", "–") else str(c.get("prereq") or "").strip(),
                   "mark": "", "hours": c.get("hours") or 0} for c in t.get("courses") or [] if (c.get("name") or c.get("code"))]
            if not cs:
                continue
            read = sum(c["hours"] or 0 for c in cs)
            printed = t.get("hours")
            if printed is not None:
                checks.append({"year": y.get("year"), "term": t.get("term"), "printed": printed, "read": read})
                if printed != read:
                    bad.append(f"السنة {y.get('year')} · {TERM_AR.get(t.get('term'), t.get('term'))}")
            terms.append({"term": t.get("term"), "courses": cs, "hours": printed if printed is not None else read})
        if terms:
            rh = sum(sum(c["hours"] or 0 for c in t["courses"]) for t in terms)
            years.append({"year": y.get("year"), "hours": sum(t["hours"] for t in terms), "terms": terms, "read_hours": rh})
    total = sum(y["read_hours"] for y in years)
    if not years or bad or not checks or (plan.get("total_printed") and plan["total_printed"] != total):
        return None, bad or ["لا مجاميع مطبوعة للمطابقة" if not checks else f"المجموع الكلي {total} لا يطابق {plan.get('total_printed')}"]
    return {"edition": None, "academic_year": plan.get("academic_year"), "pages": [1], "years": years, "checks": checks, "ok": True,
            "manual": True, "source": "ai", "model": MODEL, "track": plan.get("track"), "notes": [], "warn": [],
            "npages": 1, "text_pages": 0, "total_printed": plan.get("total_printed")}, []


def main():
    if not KEY:
        print("ANTHROPIC_API_KEY is not set: nothing to do.")
        return
    a = load(PLANS, None)
    if not a:
        print("no advisory_plans.json")
        return
    manual, log = load(MANUAL, {}), load(LOG, {})
    todo = []
    for p in a["programs"]:
        for did in p["docs"]:
            d = a["docs"].get(did)
            if not d or d.get("kind") != "advisory" or not d.get("versions"):
                continue
            v = next((x for x in d["versions"] if x.get("label") == "current"), d["versions"][-1])
            sha, imgs = v.get("sha"), v.get("images") or []
            r = a["reads"].get(sha) or {}
            if not sha or not imgs or r.get("ok") or sha in manual:
                continue
            last = log.get(sha, {}).get("at", 0)
            if time.time() - last < RETRY_DAYS * 86400:
                continue
            todo.append((p["id"], d.get("lang"), sha, imgs))
    todo.sort(key=lambda x: x[1] != "ar")   # Arabic plans first
    print(f"{len(todo)} plan(s) to read; reading up to {MAX}")
    changed = False
    for pid, lang, sha, imgs in todo[:MAX]:
        try:
            reply = ask(imgs)
        except Exception as e:  # network, quota, bad JSON: try again next run
            print(f"{pid}: {e}")
            log[sha] = {"program": pid, "at": time.time() - (RETRY_DAYS - 1) * 86400, "result": f"error: {e}"[:300]}
            continue
        plans = reply.get("plans") or []
        good, why = [], []
        for pl in plans:
            read, bad = to_read(pl)
            (good.append(read) if read else why.extend(bad))
        if plans and len(good) == len(plans):
            for i, read in enumerate(good):
                manual[sha if i == 0 else f"{sha}__{i + 1}"] = read
            log[sha] = {"program": pid, "at": time.time(), "result": f"accepted ({len(good)} track(s))"}
            print(f"{pid}: accepted, {sum(len(t['courses']) for r in good for y in r['years'] for t in y['terms'])} courses")
            changed = True
        else:
            log[sha] = {"program": pid, "at": time.time(), "result": "rejected: " + ("؛ ".join(why) if why else "not a year/semester plan")}
            print(f"{pid}: rejected — {log[sha]['result']}")
    if changed:
        with open(MANUAL, "w", encoding="utf-8") as f:
            json.dump(manual, f, ensure_ascii=False)
    with open(LOG, "w", encoding="utf-8") as f:
        json.dump(log, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    sys.exit(main())
