"""Publishing from the «جدول الامتحانات» page without keys or files.

The page opens GitHub (where the committee member is already signed in) on a new file under data/exams/inbox/ and the
member commits it. The file name says what to do:

  * <time>-publish.txt   - "UOPEXAMS1:" + base64(gzip(the timetable JSON)) -> written to data/exam_schedule.json
  * <time>-unpublish.txt - data/exam_schedule.json is removed (screens go back to lectures, «امتحاناتي» empties)

Only accounts that can write to the repository can commit, so only they can publish. The newest request wins; every
request file is removed afterwards. Runs from .github/workflows/exam-publish.yml right after such a commit.

    python scripts/exam_inbox.py
"""
import base64
import gzip
import json
import os

ROOT = os.path.join(os.path.dirname(__file__), "..")
INBOX = os.path.join(ROOT, "data", "exams", "inbox")
OUT = os.path.join(ROOT, "data", "exam_schedule.json")
MAGIC = "UOPEXAMS1:"


def read(path):
    with open(path, encoding="utf-8") as f:
        text = "".join(f.read().split())  # the editor may wrap or add a final newline
    if not text.startswith(MAGIC):
        raise ValueError("not a timetable from the exams page")
    doc = json.loads(gzip.decompress(base64.b64decode(text[len(MAGIC):])).decode("utf-8"))
    ex = doc.get("exams")
    if not isinstance(ex, list) or not ex:
        raise ValueError("no exams")
    for e in ex:
        if not all(k in e for k in ("code", "date", "from", "to", "rooms")):
            raise ValueError("exam without code/date/time/rooms")
    return doc


def main():
    if not os.path.isdir(INBOX):
        print("exam inbox: empty")
        return
    files = sorted(f for f in os.listdir(INBOX) if f.endswith(".txt"))
    done = None
    for name in reversed(files):  # newest first; the first valid request decides
        path = os.path.join(INBOX, name)
        try:
            if name.endswith("-unpublish.txt"):
                if os.path.exists(OUT):
                    os.remove(OUT)
                done = f"unpublished ({name})"
            elif name.endswith("-publish.txt"):
                doc = read(path)
                with open(OUT, "w", encoding="utf-8") as f:
                    json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
                done = f"published {len(doc['exams'])} exams ({name})"
            else:
                continue
            break
        except (OSError, ValueError) as e:
            print(f"exam inbox: skipped {name}: {e}")
    for name in os.listdir(INBOX):
        os.remove(os.path.join(INBOX, name))
    print("exam inbox:", done or "nothing valid")


if __name__ == "__main__":
    main()
