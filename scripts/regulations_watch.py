#!/usr/bin/env python3
"""Watch the University of Petra's official research regulations for changes.

Reads the research regulations page and the university's legislation guide, downloads every research-related
document, and compares each file's SHA-256 with the copy the site's text was transcribed from
(data/research/regulations/sources.json). A changed, new or removed document is recorded under "changes" and
the run ends with exit code 3, so the workflow opens a review issue; the regulations page shows a notice next to
that document until its text is re-transcribed and the new fingerprint is accepted (--accept DOC).

Usage:  python scripts/regulations_watch.py            check and record
        python scripts/regulations_watch.py --accept 06   the text of document 06 now matches the current file
"""
from __future__ import annotations

import datetime as dt
import hashlib
import html
import json
import os
import re
import sys
import urllib.parse as up

import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, 'data', 'research', 'regulations')
SRC = os.path.join(DIR, 'sources.json')
BASE = 'https://www.uop.edu.jo'
PAGES = [BASE + '/Ar/UOPResearch/Pages/RegulationsInstructions.aspx',
         BASE + '/Ar/GraduateStudies/Pages/LegislationsBylawsRegulations.aspx']
# documents of interest to researchers: matched on their title in the university's lists
WANT = ['قانون التعليم العالي', 'نظام الهيئة التدريسية', 'نظام البحث العلمي', 'نظام الدراسات العليا', 'تعليمات الهيئة التدريسية',
        'تعليمات البحث العلمي', 'منحة بحث علمي صيفي', 'منح درجة الماجستير', 'التفرغ العلمي', 'دعم البحث العلمي لطلبة', 'للباحث المتميز']
UA = {'User-Agent': 'Mozilla/5.0 (uopstaff regulations watch)'}


def fetch(url):
    r = requests.get(url, headers=UA, timeout=60)
    r.raise_for_status()
    return r


def file_url(href):
    """The working address of a document: the guide links to /Ar/AboutUOP/... copies that no longer exist, the same
    files are served from /Ar/MoreAbout/Documents or /Ar/UOPResearch/Documents."""
    href = html.unescape(href)
    name = up.unquote(up.urlsplit(href).path).split('/')[-1]
    urls = [href if href.startswith('http') else BASE + href]
    urls += [BASE + up.quote(b + name) for b in ('/Ar/MoreAbout/Documents/', '/Ar/UOPResearch/Documents/')]
    for u in urls:
        u = up.urlunsplit(up.urlsplit(u)._replace(path=up.quote(up.unquote(up.urlsplit(u).path))))
        try:
            r = fetch(u)
        except requests.RequestException:
            continue
        if r.content[:4] == b'%PDF':
            return u, r.content
    return None, None


def listed():
    """{title: href} of the research-related documents on the official pages (first occurrence of each title)."""
    out = {}
    for page in PAGES:
        s = fetch(page).text
        for m in re.finditer(r'<a[^>]+href="([^"]+\.pdf)"[^>]*>(.*?)</a>', s, re.S | re.I):
            t = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', html.unescape(m.group(2)))).replace('​', '').replace('جا معة', 'جامعة').strip()
            if any(w in t.replace(' ', '') or w in t for w in WANT) and t not in out:
                out[t] = m.group(1)
    return out


def main():
    src = json.load(open(SRC, encoding='utf-8'))
    today = dt.date.today().isoformat()
    accept = sys.argv[sys.argv.index('--accept') + 1] if '--accept' in sys.argv else None
    found, problems = listed(), []
    for d in src['docs']:
        href = next((h for t, h in found.items() if d['match'] in t), None)
        if not href:
            problems.append((d, 'removed', 'لم تعد الوثيقة مدرجة في صفحات الجامعة'))
            continue
        url, body = file_url(href)
        if not body:
            problems.append((d, 'unreachable', 'تعذّر تنزيل الوثيقة من موقع الجامعة'))
            continue
        h = hashlib.sha256(body).hexdigest()
        d['url'], d['checked'] = url, today
        if accept == d['id']:
            d.update({'sha256': h, 'pending': None, 'accepted': today})
            open(os.path.join(DIR, 'pdf', d['id'] + '.pdf'), 'wb').write(body)
        elif h != d['sha256']:
            problems.append((d, 'changed', 'تغيّر ملف الوثيقة الرسمي عن النسخة التي نُقل منها النص'))
            d['pending'] = {'since': (d.get('pending') or {}).get('since') or today, 'sha256': h}
    known = {d['match'] for d in src['docs']}
    new = [t for t in found if not any(k in t for k in known)]
    src['new_titles'] = new
    src['checked'] = today
    src['changes'] = [{'id': d['id'], 'title': d['title'], 'kind': k, 'note': n, 'since': (d.get('pending') or {}).get('since', today)} for d, k, n in problems]
    with open(SRC, 'w', encoding='utf-8') as f:
        json.dump(src, f, ensure_ascii=False, indent=1)
    for d, k, n in problems:
        print(f'{k}: {d["id"]} {d["title"]} — {n}')
    for t in new:
        print('new:', t)
    if problems or new:
        sys.exit(3)
    print('all', len(src['docs']), 'documents unchanged')


if __name__ == '__main__':
    main()
