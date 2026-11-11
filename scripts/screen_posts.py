"""Announcements on the screens: applies one signed request from «إعلانات الشاشات» (screen-posts.html).

Run by .github/workflows/screen-posts.yml. The page sends SCREEN_REQ = {"p": "<payload JSON>", "s": "<signature>"}.
Nothing in the request is trusted until it is checked here, on GitHub's side, not in the browser:

  1. the signature: every account has its own key pair (ECDSA P-256). The private key stays encrypted with the account's
     password (data/screens/accounts.json); only the public key is used here. A request is accepted only when it is
     signed by the account named in it, so knowing the publishing key alone does not allow posting anything.
  2. freshness: the request must be recent (30 minutes) and its nonce never seen before (no replay).
  3. permissions: the account must be active; a faculty may post only the types and only to the screens the admin
     allowed it, for at most its allowed number of days and active posts; review, settings, emergency message and
     accounts are for admins only.
  4. content: lengths, dates, times, icons, colours and links are checked; an image is opened and saved again (WebP,
     at most 1920x1080) so only a plain image is ever written. The screens show every text as text.

Posts by an account that is not «trusted» wait for the admin's approval (status "pending"). Every request (accepted
or refused, when correctly signed) is written to data/screens/log.json with who, what and when.
Without SCREEN_REQ (the daily run) it only removes posts that ended more than 14 days ago and their images.

    SCREEN_REQ='{"p": ..., "s": ...}' python scripts/screen_posts.py
    python scripts/screen_posts.py --notify      # after the push: opens / closes the GitHub issue for pending posts
"""
import base64
import datetime as dt
import io
import json
import os
import re
import secrets
import subprocess
import sys
from zoneinfo import ZoneInfo

ROOT = os.path.join(os.path.dirname(__file__), "..")
POSTS = os.path.join(ROOT, "data", "screen_posts.json")
DIR = os.path.join(ROOT, "data", "screens")
ACCOUNTS = os.path.join(DIR, "accounts.json")
LOG = os.path.join(DIR, "log.json")
MEDIA = os.path.join(DIR, "media")
TIMETABLE = os.path.join(ROOT, "data", "timetable.json")
TMP = os.environ.get("RUNNER_TEMP") or "/tmp"
NOTIFY = os.path.join(TMP, "screen_notify.json")
MSG = os.path.join(TMP, "screen_msg")

AMMAN = ZoneInfo("Asia/Amman")
TYPES = ["ticker", "notice", "poster", "event", "urgent"]
TONES = ["info", "gold", "maroon", "green", "violet"]
ICONS = ["bi-megaphone", "bi-info-circle", "bi-calendar-event", "bi-mortarboard", "bi-trophy", "bi-people", "bi-briefcase", "bi-journal-text",
         "bi-mic", "bi-easel", "bi-heart-pulse", "bi-lightbulb", "bi-globe2", "bi-award", "bi-cash-coin", "bi-exclamation-circle", "bi-clock-history", "bi-geo-alt"]
SERVICES = ["registration", "finance", "library", "research"]
DAYS = ["ح", "ن", "ث", "ر", "خ", "س", "ج"]
MAX_IMG = 48000          # bytes of the image as sent (one request is at most 65,535 characters)
WINDOW = 30 * 60 * 1000  # ms: how old a request may be
KEEP = 14                # days a finished post stays listed
USER_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{2,31}$")
B64_RE = re.compile(r"^[A-Za-z0-9+/=_-]+$")


class Refused(Exception):
    pass


def load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, ValueError):
        return default


def save(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")


def now_amman():
    return dt.datetime.now(AMMAN)


def today():
    return now_amman().date()


def iso_now():
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def b64d(s):
    s = str(s)
    if not B64_RE.match(s):
        raise Refused("ترميز غير صالح")
    s = s.replace("-", "+").replace("_", "/")
    return base64.b64decode(s + "=" * (-len(s) % 4))


# ---------------------------------------------------------------- the signature
def verify(pub, payload, sig):
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
    x, y = int.from_bytes(b64d(pub["x"]), "big"), int.from_bytes(b64d(pub["y"]), "big")
    key = ec.EllipticCurvePublicNumbers(x, y, ec.SECP256R1()).public_key()
    raw = b64d(sig)
    if len(raw) != 64:
        return False
    try:
        key.verify(encode_dss_signature(int.from_bytes(raw[:32], "big"), int.from_bytes(raw[32:], "big")), payload.encode("utf-8"), ec.ECDSA(hashes.SHA256()))
        return True
    except InvalidSignature:
        return False


# ---------------------------------------------------------------- checks
def text(v, n, need=False, lines=1, what="النص"):
    v = re.sub(r"[\x00-\x08\x0b-\x1f\x7f​-‏‪-‮⁦-⁩]", "", str(v or "")).strip()
    v = "\n".join(re.sub(r"[ \t]+", " ", x).strip() for x in v.split("\n") if x.strip())
    if lines == 1:
        v = v.replace("\n", " ")
    elif v.count("\n") >= lines:
        raise Refused(f"{what}: {lines} أسطر على الأكثر")
    if need and not v:
        raise Refused(f"{what} مطلوب")
    if len(v) > n:
        raise Refused(f"{what}: {n} حرفاً على الأكثر")
    return v


def date(v, what):
    try:
        return dt.date.fromisoformat(str(v))
    except ValueError:
        raise Refused(f"{what}: تاريخ غير صالح")


def hhmm(v, what):
    v = str(v or "")
    if not v:
        return ""
    if not re.match(r"^([01]\d|2[0-3]):[0-5]\d$", v):
        raise Refused(f"{what}: وقت غير صالح")
    return v


def link(v):
    v = str(v or "").strip()
    if not v:
        return ""
    if not re.match(r"^https://[^\s\"'<>]{3,300}$", v):
        raise Refused("الرابط يجب أن يبدأ بـ https:// ودون مسافات")
    return v


def buildings():
    t = load(TIMETABLE, {})
    return {s.get("building") for s in t.get("sections", []) if s.get("building") and not re.match(r"^-+$", s.get("building"))}


def screen_ok(k, known):
    return k in ("*", "g:buildings", "g:services", "others", "exams") or k in SERVICES or k in known


def allowed(acc, target):
    """may this account post to this target? (a group only if the account has the group or all screens)"""
    have = acc.get("screens") or []
    if acc.get("role") == "admin" or "*" in have:
        return True
    if target in have:
        return True
    if target in SERVICES and "g:services" in have:
        return True
    if target not in SERVICES and not target.startswith("g:") and target not in ("*", "exams") and "g:buildings" in have:
        return True
    return False


def image(b64, pid):
    from PIL import Image
    raw = b64d(b64)
    if len(raw) > MAX_IMG:
        raise Refused("الصورة كبيرة")
    if not (raw[:4] == b"RIFF" and raw[8:12] == b"WEBP" or raw[:3] == b"\xff\xd8\xff" or raw[:8] == b"\x89PNG\r\n\x1a\n"):
        raise Refused("الملف ليس صورة")
    Image.MAX_IMAGE_PIXELS = 12_000_000
    try:
        im = Image.open(io.BytesIO(raw))
        if im.format not in ("WEBP", "JPEG", "PNG") or im.width > 4000 or im.height > 4000:
            raise Refused("صورة غير مقبولة")
        im.load()
        im = im.convert("RGB")
        im.thumbnail((1920, 1080))
    except Refused:
        raise
    except Exception:
        raise Refused("تعذّر فتح الصورة")
    name = f"{pid}-{secrets.token_hex(4)}.webp"
    os.makedirs(MEDIA, exist_ok=True)
    im.save(os.path.join(MEDIA, name), "WEBP", quality=85, method=4)
    return f"data/screens/media/{name}"


def post_from(d, acc, user, old, known):
    admin = acc.get("role") == "admin"
    t = d.get("type")
    if t not in TYPES:
        raise Refused("نوع غير معروف")
    if not admin and (t == "urgent" or t not in (acc.get("types") or [])):
        raise Refused("هذا النوع غير مسموح لحسابك")
    p = {"type": t}
    p["title"] = text(d.get("title"), 90, need=t in ("notice", "event", "urgent"), what="العنوان") if t != "ticker" else ""
    p["text"] = text(d.get("text"), {"ticker": 160, "notice": 300, "poster": 160, "event": 300, "urgent": 200}[t], need=t == "ticker",
                     lines=4 if t in ("notice", "event") else 1)
    p["icon"] = d.get("icon") if d.get("icon") in ICONS else "bi-megaphone"
    p["tone"] = d.get("tone") if d.get("tone") in TONES else "maroon"
    p["link"] = link(d.get("link")) if t in ("notice", "poster", "event") else ""
    if t == "event":
        p["place"] = text(d.get("place"), 80, what="المكان")
        at = str(d.get("at") or "")
        if not re.match(r"^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$", at):
            raise Refused("موعد الفعالية مطلوب")
        date(at[:10], "موعد الفعالية")
        p["at"] = at
    scr = d.get("screens")
    if not isinstance(scr, list) or not scr or len(scr) > 40:
        raise Refused("اختر شاشة واحدة على الأقل")
    scr = list(dict.fromkeys(str(s) for s in scr))
    for s in scr:
        if not screen_ok(s, known):
            raise Refused(f"شاشة غير معروفة: {s}")
        if not allowed(acc, s):
            raise Refused(f"لا يحق لحسابك النشر على: {s}")
    p["screens"] = scr
    a, b = date(d.get("start"), "تاريخ البداية"), date(d.get("end"), "تاريخ النهاية")
    if b < a:
        raise Refused("تاريخ النهاية قبل البداية")
    if b < today():
        raise Refused("تاريخ النهاية مضى")
    most = 365 if admin else int(acc.get("maxDays") or 30)
    if (b - a).days + 1 > most:
        raise Refused(f"مدة الإعلان {most} يوماً على الأكثر")
    if t == "event" and p["at"][:10] < a.isoformat():
        raise Refused("موعد الفعالية قبل بداية العرض")
    p["start"], p["end"] = a.isoformat(), b.isoformat()
    days = d.get("days") or []
    if not isinstance(days, list) or any(x not in DAYS for x in days):
        raise Refused("أيام غير صالحة")
    p["days"] = [x for x in DAYS if x in days]
    p["from"], p["to"] = hhmm(d.get("from"), "من الساعة"), hhmm(d.get("to"), "حتى الساعة")
    if p["from"] and p["to"] and p["from"] >= p["to"]:
        raise Refused("وقت النهاية قبل البداية")
    p["pin"] = bool(d.get("pin")) if admin else bool(old and old.get("pin"))
    return p


# ---------------------------------------------------------------- the request
def apply(req, posts, accs, log):
    try:
        env = json.loads(req)
        payload, sig = env["p"], env["s"]
        q = json.loads(payload)
    except (ValueError, KeyError, TypeError):
        raise SystemExit("request is not readable")
    user, action, d = str(q.get("u") or ""), q.get("a"), q.get("d") or {}
    users = accs.setdefault("users", {})
    # the first admin account: only while there is none; signed by its own new key
    if action == "init":
        if users:
            raise SystemExit("already set up")
        acc = d.get("account") or {}
        if not USER_RE.match(user) or not verify(acc.get("pub") or {}, payload, sig):
            raise SystemExit("bad init")
    else:
        acc = users.get(user)
        if not acc or not verify(acc["pub"], payload, sig):
            raise SystemExit("signature not valid for this account")  # nothing written: not from an account
    entry = {"at": iso_now(), "u": user, "a": action, "n": str(q.get("n") or "")[:40]}
    try:
        ts = int(q.get("ts") or 0)
        now = int(dt.datetime.now(dt.timezone.utc).timestamp() * 1000)
        if ts < now - WINDOW or ts > now + 5 * 60 * 1000:
            raise Refused("الطلب قديم؛ أعد المحاولة (تحقق من ساعة جهازك)")
        if not entry["n"] or any(x.get("n") == entry["n"] for x in log["log"]):
            raise Refused("طلب مكرر")
        if action != "init" and not acc.get("active", True):
            raise Refused("الحساب موقوف")
        msg = do(action, d, user, acc, posts, accs)
        entry.update(ok=True, **msg)
    except Refused as e:
        entry.update(ok=False, why=str(e))
    log["log"].insert(0, entry)
    del log["log"][600:]
    return entry


def need_admin(acc):
    if acc.get("role") != "admin":
        raise Refused("هذا الإجراء للمسؤول فقط")


def find(posts, pid):
    p = next((x for x in posts["posts"] if x.get("id") == pid), None)
    if not p:
        raise Refused("الإعلان غير موجود")
    return p


def account_fields(d, old):
    a = dict(old or {})
    a["name"] = text(d.get("name"), 60, need=True, what="اسم الجهة")
    role = d.get("role", a.get("role", "unit"))
    if role not in ("admin", "unit"):
        raise Refused("دور غير صالح")
    a["role"] = role
    known = buildings()
    scr = d.get("screens") or []
    if not isinstance(scr, list) or any(not screen_ok(str(s), known) for s in scr):
        raise Refused("شاشات غير صالحة")
    a["screens"] = list(dict.fromkeys(str(s) for s in scr))
    ty = d.get("types") or []
    if not isinstance(ty, list) or any(t not in TYPES[:4] for t in ty):
        raise Refused("أنواع غير صالحة")
    a["types"] = [t for t in TYPES[:4] if t in ty]
    a["trusted"] = bool(d.get("trusted"))
    a["max"] = max(1, min(30, int(d.get("max") or 6)))
    a["maxDays"] = max(1, min(90, int(d.get("maxDays") or 30)))
    a["active"] = bool(d.get("active", True))
    if d.get("pub") or d.get("box"):
        a["pub"], a["box"] = keyparts(d.get("pub"), d.get("box"))
    if not a.get("pub"):
        raise Refused("مفتاح الحساب مفقود")
    return a


def keyparts(pub, box):
    if not isinstance(pub, dict) or len(b64d(pub.get("x", ""))) != 32 or len(b64d(pub.get("y", ""))) != 32:
        raise Refused("مفتاح عام غير صالح")
    if not isinstance(box, dict) or len(b64d(box.get("salt", ""))) != 16 or len(b64d(box.get("iv", ""))) != 12 or not 64 < len(b64d(box.get("ct", ""))) < 1000:
        raise Refused("صندوق المفتاح غير صالح")
    return {"x": pub["x"], "y": pub["y"]}, {"salt": box["salt"], "iv": box["iv"], "ct": box["ct"]}


def tokbox(t):
    if not isinstance(t, dict) or len(b64d(t.get("iv", ""))) != 12 or not 20 < len(b64d(t.get("ct", ""))) < 600:
        raise Refused("مفتاح النشر غير صالح")
    return {"iv": t["iv"], "ct": t["ct"], "at": iso_now()}


def do(action, d, user, acc, posts, accs):
    admin = acc.get("role") == "admin"
    users = accs["users"]
    if action == "init":
        a = {"name": text((d.get("account") or {}).get("name"), 60, need=True, what="الاسم"), "role": "admin", "screens": ["*"], "types": TYPES[:4],
             "trusted": True, "max": 30, "maxDays": 365, "active": True, "created": iso_now(), "by": user}
        a["pub"], a["box"] = keyparts((d.get("account") or {}).get("pub"), (d.get("account") or {}).get("box"))
        users[user] = a
        accs["tok"] = tokbox(d.get("tok"))
        return {"note": "إعداد أول حساب مسؤول"}

    if action == "submit":
        known = buildings()
        pid = d.get("id")
        old = find(posts, pid) if pid else None
        if old and old.get("owner") != user and not admin:
            raise Refused("ليس إعلانك")
        p = post_from(d, acc, user, old, known)
        mine = [x for x in posts["posts"] if x.get("owner") == (old or {}).get("owner", user) and x.get("status") in ("pending", "live")
                and x.get("end", "") >= today().isoformat() and x.get("id") != pid]
        if not admin and len(mine) >= int(acc.get("max") or 6):
            raise Refused(f"لديك {len(mine)} إعلانات نشطة؛ الحد {acc.get('max') or 6}")
        if not old:
            pid = "p" + now_amman().strftime("%y%m%d%H%M") + secrets.token_hex(2)
        if p["type"] == "poster":
            if d.get("image"):
                p["image"] = image(d["image"], pid)
                if old and old.get("image"):
                    drop_media(old["image"])
            elif old and old.get("image") and old.get("type") == "poster":
                p["image"] = old["image"]
            else:
                raise Refused("البوستر يحتاج صورة")
        elif old and old.get("image"):
            drop_media(old["image"])
        live = admin or acc.get("trusted")
        rec = dict(old or {}, **p, id=pid, owner=(old or {}).get("owner", user), ownerName=(old or {}).get("ownerName", acc.get("name", user)),
                   status="live" if live else "pending", updated=iso_now())
        rec.setdefault("created", iso_now())
        if not live:
            rec.pop("review", None)
        if old:
            posts["posts"][posts["posts"].index(old)] = rec
        else:
            posts["posts"].insert(0, rec)
        if not live:
            notify({"op": "open", "id": pid, "title": rec.get("title") or rec.get("text", "")[:60], "who": rec["ownerName"], "type": rec["type"]})
        return {"id": pid, "note": ("نُشر" if live else "بانتظار الموافقة") + (" (تعديل)" if old else "")}

    if action == "withdraw":
        p = find(posts, d.get("id"))
        if p.get("owner") != user and not admin:
            raise Refused("ليس إعلانك")
        remove(posts, p)
        notify({"op": "close", "id": p["id"], "note": "سُحب الإعلان"})
        return {"id": p["id"]}

    if action == "review":
        need_admin(acc)
        ok, note = bool(d.get("ok")), text(d.get("note"), 200, what="الملاحظة")
        ids = d.get("ids") or []
        if not isinstance(ids, list) or not ids:
            raise Refused("لا إعلانات")
        for pid in ids[:50]:
            p = find(posts, pid)
            p["status"] = "live" if ok else "rejected"
            p["review"] = {"by": user, "at": iso_now(), "ok": ok, "note": note}
            notify({"op": "close", "id": pid, "note": ("تمت الموافقة" if ok else "رُفض") + (f": {note}" if note else "")})
        return {"id": ",".join(ids[:50]), "note": ("موافقة" if ok else "رفض") + (f": {note}" if note else "")}

    if action in ("stop", "resume", "pin", "delete"):
        p = find(posts, d.get("id"))
        if action == "stop" and p.get("owner") == user:
            pass  # the owner may stop their own post at any time
        else:
            need_admin(acc)
        if action == "stop":
            p["status"] = "stopped"
            p["review"] = {"by": user, "at": iso_now(), "ok": False, "note": text(d.get("note"), 200) or "أوقف"}
        elif action == "resume":
            p["status"] = "live"
        elif action == "pin":
            p["pin"] = bool(d.get("on"))
        else:
            remove(posts, p)
            notify({"op": "close", "id": p["id"], "note": "حُذف"})
        return {"id": p["id"]}

    if action == "settings":
        need_admin(acc)
        known = buildings()

        def one(s):
            if not isinstance(s, dict):
                raise Refused("إعدادات غير صالحة")
            o = {}
            if "mode" in s:
                if s["mode"] not in ("on", "off"):
                    raise Refused("وضع غير صالح")
                o["mode"] = s["mode"]
            if "every" in s:
                o["every"] = max(1, min(30, int(s["every"])))
            if "secs" in s:
                o["secs"] = max(5, min(60, int(s["secs"])))
            if "exams" in s:
                o["exams"] = bool(s["exams"])
            if "map" in s:
                o["map"] = bool(s["map"])
            return o
        scr = d.get("screens") or {}
        if not isinstance(scr, dict) or any(not screen_ok(k, known) or k.startswith("g:") or k == "*" for k in scr):
            raise Refused("شاشات غير صالحة")
        posts["settings"] = {"default": one(d.get("default") or {}), "screens": {k: one(v) for k, v in scr.items() if one(v)}}
        return {"note": "إعدادات الشاشات"}

    if action == "alert":
        need_admin(acc)
        if not d.get("on"):
            posts["alert"] = None
            return {"note": "إلغاء رسالة الطوارئ"}
        known = buildings()
        scr = d.get("screens") or ["*"]
        if not isinstance(scr, list) or any(not screen_ok(str(s), known) for s in scr):
            raise Refused("شاشات غير صالحة")
        hours = max(1, min(72, int(d.get("hours") or 12)))
        posts["alert"] = {"title": text(d.get("title"), 80, need=True, what="العنوان"), "text": text(d.get("text"), 300, lines=4), "screens": scr,
                          "by": user, "since": iso_now(),
                          "until": (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M:%SZ")}
        return {"note": "رسالة طوارئ: " + posts["alert"]["title"]}

    if action == "account":
        need_admin(acc)
        u = str(d.get("user") or "").strip().lower()
        if not USER_RE.match(u):
            raise Refused("اسم المستخدم: حروف إنجليزية صغيرة وأرقام (3–32)")
        if d.get("remove"):
            if u == user:
                raise Refused("لا يمكنك حذف حسابك")
            users.pop(u, None)
            return {"note": "حذف الحساب " + u}
        if u == user and (d.get("role") != "admin" or not d.get("active", True)):
            raise Refused("لا يمكنك إيقاف حسابك أو تغيير دوره")
        old = users.get(u)
        if not old and not (d.get("pub") and d.get("box")):
            raise Refused("حساب جديد بلا مفتاح")
        a = account_fields(d, old)
        a.setdefault("created", iso_now())
        a.setdefault("by", user)
        a["updated"] = iso_now()
        users[u] = a
        return {"note": ("تحديث" if old else "إنشاء") + " الحساب " + u + (" وكلمة مرور جديدة" if d.get("box") and old else "")}

    if action == "passwd":
        pub, box = keyparts(acc["pub"], d.get("box"))
        acc["box"] = box
        return {"note": "تغيير كلمة المرور"}

    if action == "token":
        need_admin(acc)
        accs["tok"] = tokbox(d.get("tok"))
        return {"note": "تجديد مفتاح النشر"}

    raise Refused("إجراء غير معروف")


def drop_media(path):
    if re.match(r"^data/screens/media/[A-Za-z0-9._-]+$", path or ""):
        try:
            os.remove(os.path.join(ROOT, path))
        except FileNotFoundError:
            pass


def remove(posts, p):
    posts["posts"].remove(p)
    if p.get("image"):
        drop_media(p["image"])


def prune(posts):
    """posts that ended (or were refused / stopped) more than 14 days ago go, with their images"""
    cut = (today() - dt.timedelta(days=KEEP)).isoformat()
    for p in list(posts["posts"]):
        if p.get("end", "") < cut or (p.get("status") in ("rejected", "stopped") and (p.get("updated") or "")[:10] < cut):
            remove(posts, p)
    used = {p.get("image") for p in posts["posts"]}
    if os.path.isdir(MEDIA):
        for f in os.listdir(MEDIA):
            if f"data/screens/media/{f}" not in used:
                os.remove(os.path.join(MEDIA, f))
    if posts.get("alert") and posts["alert"].get("until", "9") < iso_now():
        posts["alert"] = None


_notes = []


def notify(x):
    _notes.append(x)


def send_notifications():
    """a GitHub issue per post waiting for approval (GitHub emails the site owner); closed when it is reviewed"""
    todo = load(NOTIFY, [])
    for x in todo:
        try:
            if x["op"] == "open":
                kind = {"ticker": "شريط أخبار", "notice": "إعلان", "poster": "بوستر", "event": "فعالية"}.get(x.get("type"), "")
                subprocess.run(["gh", "issue", "create", "--title", f"[إعلان بانتظار الموافقة] {x['title']} [{x['id']}]",
                                "--body", f"{kind} من **{x['who']}** ينتظر موافقتك.\n\nراجعه في صفحة «إعلانات الشاشات» ← بانتظار الموافقة:\n"
                                          f"https://marafah.github.io/uopstaff/screen-posts.html\n\nتُغلق هذه الرسالة وحدها عند الموافقة أو الرفض."], check=False)
            else:
                out = subprocess.run(["gh", "issue", "list", "--state", "open", "--search", f"[{x['id']}] in:title", "--json", "number"],
                                     capture_output=True, text=True, check=False).stdout or "[]"
                for i in json.loads(out):
                    subprocess.run(["gh", "issue", "close", str(i["number"]), "--comment", x.get("note") or "تمت المراجعة"], check=False)
        except Exception as e:  # a notification never stops the publishing
            print("notify:", e)


def main():
    if "--notify" in sys.argv:
        send_notifications()
        return
    posts = load(POSTS, {})
    posts.setdefault("v", 1)
    posts.setdefault("settings", {"default": {}, "screens": {}})
    posts.setdefault("alert", None)
    posts.setdefault("posts", [])
    accs = load(ACCOUNTS, {"v": 1, "users": {}})
    log = load(LOG, {"log": []})
    log.setdefault("log", [])
    req = os.environ.get("SCREEN_REQ", "").strip()
    msg = "daily clean-up"
    if req:
        e = apply(req, posts, accs, log)
        msg = f"{e['a']} by {e['u']}" + ("" if e["ok"] else " (refused)")
        print(json.dumps(e, ensure_ascii=False))
        save(LOG, log)
        save(ACCOUNTS, accs)
    before = json.dumps(posts, ensure_ascii=False, sort_keys=True)
    prune(posts)
    if req or json.dumps(posts, ensure_ascii=False, sort_keys=True) != before or not os.path.exists(POSTS):
        posts["updated"] = iso_now()
        save(POSTS, posts)
    with open(MSG, "w", encoding="utf-8") as f:
        f.write(msg)
    save(NOTIFY, _notes)


if __name__ == "__main__":
    main()
