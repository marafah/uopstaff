"""Publishing from the «جدول الامتحانات» page with the committee's password only.

The page starts the workflow «Publish the exam timetable» (.github/workflows/exam-publish.yml) through the GitHub API
with a key that can only start workflows (Actions: read and write); the key is kept in data/exams/key.json encrypted
with the committee's password, so it opens only after the password. The workflow passes:

  EXAM_ACTION=publish    EXAM_DATA="UOPEXAMS2:" + base64(gzip(indexed timetable)) -> data/exam_schedule.json
  EXAM_ACTION=unpublish                                                          -> data/exam_schedule.json removed
  EXAM_ACTION=setkey     EXAM_DATA={"v":1,"salt","iv","ct","at"} (the encrypted key) -> data/exams/key.json

Everything arriving is checked before it is written. Older requests left as files in data/exams/inbox/ (the earlier
GitHub-page way, "UOPEXAMS1:" + base64(gzip(json))) are still read, newest first, and the folder is emptied.

    EXAM_ACTION=publish EXAM_DATA=... python scripts/exam_inbox.py
"""
import base64
import gzip
import json
import os
import re

ROOT = os.path.join(os.path.dirname(__file__), "..")
INBOX = os.path.join(ROOT, "data", "exams", "inbox")
OUT = os.path.join(ROOT, "data", "exam_schedule.json")
KEY = os.path.join(ROOT, "data", "exams", "key.json")


def unz(text, magic):
    text = "".join(text.split())  # the editor may wrap or add a final newline
    if not text.startswith(magic):
        raise ValueError("not a timetable from the exams page")
    return json.loads(gzip.decompress(base64.b64decode(text[len(magic):])).decode("utf-8"))


def expand(o):
    """the page's indexed form back to the published format read by the screens, «امتحاناتي» and exam_ics.py"""
    H, P, R, D, F = o["H"], o["P"], o["R"], o["D"], o["F"]
    days, periods = H["days"], H["periods"]
    exams = []
    for code, name, d, f, ins, day, per, students, rooms in o["E"]:
        exams.append({"code": str(code), "name": name, "dept": D[d], "fac": F[f], "date": days[day], "from": periods[per][0], "to": periods[per][1],
                      "students": students, "ins": [P[i] for i in ins],
                      "rooms": [{"room": R[r], "lab": bool(lab), "n": n, "secs": secs, "proc": [P[i] for i in proc]} for r, lab, n, secs, proc in rooms]})
    return {**H, "exams": exams}


def check(doc):
    ex = doc.get("exams")
    if not isinstance(ex, list) or not ex:
        raise ValueError("no exams")
    for e in ex:
        if not all(k in e for k in ("code", "date", "from", "to", "rooms")):
            raise ValueError("exam without code/date/time/rooms")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(e["date"])):
            raise ValueError("bad date")
    return doc


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


def from_request(action, data):
    if action == "publish":
        doc = check(expand(unz(data, "UOPEXAMS2:")))
        write_json(OUT, doc)
        return f"published {len(doc['exams'])} exams"
    if action == "unpublish":
        if os.path.exists(OUT):
            os.remove(OUT)
        return "unpublished"
    if action == "setkey":
        k = json.loads(data)
        if not (isinstance(k, dict) and all(isinstance(k.get(x), str) and re.fullmatch(r"[A-Za-z0-9+/=]{8,}", k[x]) for x in ("salt", "iv", "ct"))):
            raise ValueError("not an encrypted key")
        write_json(KEY, {"v": 1, "salt": k["salt"], "iv": k["iv"], "ct": k["ct"], "at": str(k.get("at", ""))[:30]})
        return "publishing key saved"
    raise ValueError(f"unknown action {action!r}")


def from_inbox():
    if not os.path.isdir(INBOX):
        return None
    done = None
    for name in sorted((f for f in os.listdir(INBOX) if f.endswith(".txt")), reverse=True):
        try:
            if name.endswith("-unpublish.txt"):
                done = from_request("unpublish", "")
            elif name.endswith("-publish.txt"):
                with open(os.path.join(INBOX, name), encoding="utf-8") as f:
                    doc = check(unz(f.read(), "UOPEXAMS1:"))
                write_json(OUT, doc)
                done = f"published {len(doc['exams'])} exams"
            else:
                continue
            break
        except (OSError, ValueError) as e:
            print(f"exam inbox: skipped {name}: {e}")
    for name in os.listdir(INBOX):
        os.remove(os.path.join(INBOX, name))
    return done


def main():
    action = os.environ.get("EXAM_ACTION", "").strip()
    if action:
        try:
            print("exam request:", from_request(action, os.environ.get("EXAM_DATA", "")))
        except (ValueError, KeyError, IndexError, TypeError, OSError) as e:
            raise SystemExit(f"exam request rejected: {e}")
    else:
        print("exam inbox:", from_inbox() or "nothing")


if __name__ == "__main__":
    main()
