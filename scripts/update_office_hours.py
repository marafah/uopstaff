"""Hourly backup of the office hours into the site (data/office_hours.json).

The office hours live in a Google Sheet behind a small web app (office-hours/Code.gs); its address is in
data/office_hours_config.json. This copy is what the site shows when the web app cannot be reached, and every
hourly commit keeps a version of it in the repository history. An unreachable or invalid answer leaves the
previous copy untouched, so a failure never empties it.

    python scripts/update_office_hours.py
"""
import json
import os
import sys

import requests

ROOT = os.path.join(os.path.dirname(__file__), "..")
CFG = os.path.join(ROOT, "data", "office_hours_config.json")
OUT = os.path.join(ROOT, "data", "office_hours.json")


def main():
    with open(CFG, encoding="utf-8") as f:
        api = json.load(f).get("api", "").strip()
    if not api:
        print("office hours: storage service not configured yet")
        return
    try:
        r = requests.get(api, timeout=60, headers={"User-Agent": "uop-staff-directory"})
        r.raise_for_status()
        d = r.json()
        if not d.get("ok") or not isinstance(d.get("entries"), list):
            raise ValueError("unexpected answer")
    except Exception as e:
        print(f"office hours: service unreachable ({e}); previous copy kept", file=sys.stderr)
        return
    entries = sorted(d["entries"], key=lambda e: e.get("id", ""))
    old = {}
    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as f:
            old = json.load(f)
    if old.get("entries") == entries:
        print(f"office hours: no changes ({len(entries)} instructors)")
        return
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"updated": d.get("updated"), "source": "google-sheet", "entries": entries}, f, ensure_ascii=False, indent=0)
    print(f"office hours: {len(entries)} instructors saved")


if __name__ == "__main__":
    main()
