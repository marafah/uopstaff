#!/usr/bin/env python3
"""Build data/research/*.json, the data behind the research pages (research*.html).

Sources, in the order they are merged:
  1. University of Petra instructor-profile API (services.uop.edu.jo): research links
     (Google Scholar, Scopus author ID, ORCID, JOIP), research interests and the
     publication list each faculty member keeps on their staff page.
  2. OpenAlex (api.openalex.org, free and open): each researcher's works, citations,
     topics, co-authors and collaborating countries, plus the comparison of all
     Jordanian universities.
  3. Scopus (optional):
       * SCOPUS_API_KEY secret  -> author metrics and the university's document list
         (affiliation 60040839) through the Elsevier APIs;
       * CSV files exported from scopus.com and put in data/research/scopus_export/
         (University of Petra organization page -> "Download all" / Export CSV).
  4. Google Scholar (optional, best effort): citations, h-index and i10 from each
     public profile. SERPAPI_KEY gives reliable access; without it the page is read
     politely and the step stops at the first sign of blocking, keeping the last
     values that were read.

Only public academic information is written: no personal e-mail, phone or address.

Usage:  python scripts/update_research.py [--limit N] [--only UID] [--skip-unis]
Env:    OPENALEX_MAILTO, OPENALEX_API_KEY, SCOPUS_API_KEY, SCOPUS_INSTTOKEN,
        SERPAPI_KEY, SCHOLAR (=0 to disable), UOP_OPENALEX_ID, UOP_SCOPUS_AFID
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import csv
import datetime as dt
import difflib
import glob
import hashlib
import html
import json
import os
import random
import re
import sys
import time
import unicodedata
from collections import Counter, defaultdict

import requests

csv.field_size_limit(1 << 30)   # Scopus exports carry very long author/affiliation fields

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
OUT = os.path.join(DATA, 'research')
UOP_API = 'https://services.uop.edu.jo/InstructorProfile/Services/api/'
OA = 'https://api.openalex.org/'
UOP_OA = os.environ.get('UOP_OPENALEX_ID', 'I36622005')        # Petra University in OpenAlex
UOP_AFID = os.environ.get('UOP_SCOPUS_AFID', '60040839')       # University of Petra in Scopus
MAILTO = os.environ.get('OPENALEX_MAILTO', 'mohammad.arafah@uop.edu.jo')
OA_KEY = os.environ.get('OPENALEX_API_KEY', '')
SCOPUS_KEY = os.environ.get('SCOPUS_API_KEY', '')
SCOPUS_TOKEN = os.environ.get('SCOPUS_INSTTOKEN', '')
SERPAPI_KEY = os.environ.get('SERPAPI_KEY', '')
WOS_KEY = os.environ.get('WOS_API_KEY', '')
SCHOLAR_ON = os.environ.get('SCHOLAR', '1') != '0'
THIS_YEAR = dt.date.today().year

S = requests.Session()
S.headers.update({'User-Agent': f'uopstaff-research/1.0 (+https://marafah.github.io/uopstaff/; mailto:{MAILTO})'})

# Arabic names for the Jordanian universities OpenAlex lists (matched on a lower-case fragment)
UNI_AR = [
    ('university of jordan', 'الجامعة الأردنية'), ('jordan university of science', 'جامعة العلوم والتكنولوجيا الأردنية'),
    ('yarmouk', 'جامعة اليرموك'), ('balqa', 'جامعة البلقاء التطبيقية'), ('hashemite', 'الجامعة الهاشمية'),
    ('applied science', 'جامعة العلوم التطبيقية الخاصة'), ('ahliyya', 'جامعة عمان الأهلية'), ('mutah', 'جامعة مؤتة'),
    ("mu'tah", 'جامعة مؤتة'), ('zarqa', 'جامعة الزرقاء'), ('al al-bayt', 'جامعة آل البيت'), ('zaytoonah', 'جامعة الزيتونة الأردنية'),
    ('middle east university', 'جامعة الشرق الأوسط'), ('jadara', 'جامعة جدارا'), ('isra', 'جامعة الإسراء'),
    ('petra', 'جامعة البترا'), ('german jordanian', 'الجامعة الألمانية الأردنية'), ('princess sumaya', 'جامعة الأميرة سمية للتكنولوجيا'),
    ('philadelphia', 'جامعة فيلادلفيا'), ('tafila', 'جامعة الطفيلة التقنية'), ('hussein bin talal', 'جامعة الحسين بن طلال'),
    ('irbid national', 'جامعة إربد الأهلية'), ('amman arab', 'جامعة عمان العربية'), ('jerash', 'جامعة جرش'),
    ('american university of madaba', 'الجامعة الأمريكية في مادبا'), ('ajloun', 'جامعة عجلون الوطنية'),
    ('al-hussein technical', 'جامعة الحسين التقنية'), ('aqaba', 'جامعة العقبة للتكنولوجيا'), ('luminus', 'جامعة لومينوس التقنية'),
    ('world islamic', 'جامعة العلوم الإسلامية العالمية'), ('arab open', 'الجامعة العربية المفتوحة'),
    ('al-ahliyya', 'جامعة عمان الأهلية'), ('amman al-ahliyya', 'جامعة عمان الأهلية'), ('jordan academy', 'أكاديمية'),
    ('al-zaytoonah', 'جامعة الزيتونة الأردنية'), ('national university college', 'كلية الجامعة الوطنية للتكنولوجيا'),
]


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def load_json(path, default=None):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def save_json(name, obj):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, path)
    log(f'wrote {name} ({os.path.getsize(path) // 1024} KB)')


def http(method, url, tries=4, **kw):
    kw.setdefault('timeout', 40)
    for i in range(tries):
        try:
            r = S.request(method, url, **kw)
            if r.status_code == 429 and kw.get('params', {}).get('mailto'):
                return r   # OpenAlex: oa_get() decides (rate limit vs. daily budget)
            if r.status_code in (429, 500, 502, 503, 504):
                raise requests.HTTPError(f'{r.status_code}')
            return r
        except (requests.RequestException, ValueError) as e:
            if i == tries - 1:
                log(f'  ! {method} {url[:110]} failed: {e}')
                return None
            time.sleep(2 ** i + random.random())


# ------------------------------------------------------------------------------- text helpers
def norm_title(t):
    t = unicodedata.normalize('NFKD', html.unescape(t or '')).lower()
    t = re.sub(r'<[^>]+>', ' ', t)
    return re.sub(r'[^a-z0-9؀-ۿ]+', '', t)[:90]


DOI_RE = re.compile(r'10\.\d{4,9}/[^\s"<>]+', re.I)


def clean_doi(s):
    if not s:
        return ''
    m = DOI_RE.search(str(s))
    if not m:
        return ''
    d = m.group(0).rstrip('.,;)]}').lower()
    return d if '/' in d and len(d.split('/', 1)[1]) > 2 else ''


def name_key(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'\b(dr|prof|professor|mr|mrs|ms|eng)\b\.?', ' ', s)
    s = s.replace('-', ' ')
    s = re.sub(r'\b(al|el|abu|bin|ibn)\s+', r'\1', s)   # "al maqousi" == "almaqousi"
    return ' '.join(re.findall(r'[a-z]+', s))


def name_score(a, b):
    a, b = name_key(a), name_key(b)
    if not a or not b:
        return 0.0
    ta, tb = a.split(), b.split()
    full = difflib.SequenceMatcher(None, a, b).ratio()
    # first + last name agreement is the strongest signal for Arabic names in Latin script
    fl = 0.0
    if ta and tb:
        first = difflib.SequenceMatcher(None, ta[0], tb[0]).ratio()
        last = max(difflib.SequenceMatcher(None, ta[-1], x).ratio() for x in tb)
        fl = (first + last) / 2
    return max(full, fl)


def url_or_empty(u):
    u = (u or '').strip()
    if not u or u.lower() in ('null', 'none', '#', '-'):
        return ''
    if not re.match(r'https?://', u, re.I):
        u = 'https://' + u.lstrip('/')
    return u


def scholar_id(u):
    m = re.search(r'[?&]user=([\w-]{6,})', u or '')
    return m.group(1) if m else ''


def scopus_id(u):
    m = re.search(r'authorId=(\d{6,})', u or '', re.I) or re.search(r'/authid/detail\.uri\?.*?(\d{8,})', u or '') \
        or re.search(r'/authors?/(\d{8,})', u or '')
    return m.group(1) if m else ''


def orcid_id(u):
    m = re.search(r'(\d{4}-\d{4}-\d{4}-\d{3}[\dX])', u or '', re.I)
    return m.group(1).upper() if m else ''


def short_id(uid):
    return hashlib.sha1(uid.encode()).hexdigest()[:10]


# ------------------------------------------------------------------------------- 1. University API
def uop_post(path, uid, param='instructorNumber'):
    r = http('POST', f'{UOP_API}{path}?{param}={uid}', headers={'Accept': 'application/json;odata=verbose'})
    if r is None or r.status_code != 200:
        return None
    try:
        return r.json()
    except ValueError:
        return None


def uop_get(path, uid):
    r = http('GET', f'{UOP_API}{path}?instructorNumber={uid}', headers={'Accept': 'application/json'})
    if r is None or r.status_code != 200:
        return None
    try:
        return r.json()
    except ValueError:
        return None


PUB_TYPE = {'Journal Paper': 'article', 'Conference paper': 'conference', 'Conference Paper': 'conference',
            'Chapter in a Book': 'chapter', 'Book': 'book', 'Patent': 'patent'}


def uop_profile(member):
    uid = member['id'].split(':', 1)[1].lower()
    info = uop_get('MemberInfo/GetMember', uid) or {}
    links = uop_post('Links', uid) or {}
    interests = uop_post('ResearchInterests/GetResearchInterests', uid) or []
    pubs = uop_post('Publication/GetPublicationsByMember', uid, 'InstructorNumber') or []
    if not isinstance(pubs, list):
        pubs = []
    if not isinstance(interests, list):
        interests = []
    out_pubs = []
    for p in pubs:
        title = (p.get('Title') or '').strip()
        if not title:
            continue
        authors = [a.get('Title') or a.get('TitleAR') or '' for a in (p.get('objAuthors') or []) if isinstance(a, dict)]
        out_pubs.append({
            'uop_id': p.get('ID'), 't': title, 'y': p.get('Year') or None,
            'v': (p.get('TitleOf') or '').strip(), 'type': PUB_TYPE.get(p.get('PublicationType') or '', 'other'),
            'doi': clean_doi(p.get('DoiOnlineData')) or clean_doi(p.get('Link')),
            'url': url_or_empty(p.get('Link')), 'au': ', '.join(a for a in authors if a)[:300],
            'pub': (p.get('Publisher') or '').strip(), 'vol': (p.get('Volume') or '').strip(),
            'pages': '-'.join(x for x in [str(p.get('FirstPage') or '').strip(), str(p.get('LastPage') or '').strip()] if x),
            'abs': (p.get('DescriptionEN') or '').strip()[:600],
            'sdg': [s.get('Title') or s.get('TitleEN') for s in (p.get('lstSDGItems') or []) if isinstance(s, dict)],
        })
    ln = {
        'scholar': url_or_empty(links.get('GoogleScholarProfile')),
        'scopus': url_or_empty(links.get('ScopusProfile')),
        'orcid': url_or_empty(links.get('OrcidProfile')),
        'joip': url_or_empty(links.get('JOIPProfile')),
        'linkedin': url_or_empty(links.get('LinkedinProfile')),
    }
    for o in links.get('objOtherLinks') or []:
        if isinstance(o, dict):
            u = url_or_empty(o.get('Link') or o.get('URL') or o.get('Url'))
            if 'researchgate' in u.lower():
                ln['researchgate'] = u
            elif 'webofscience' in u.lower() or 'publons' in u.lower():
                ln['wos'] = u
    ln = {k: v for k, v in ln.items() if v}
    return {
        'uid': uid,
        'info': {  # public academic fields only
            'faculty_ar': (info.get('FacultyNameArabic') or '').strip(), 'faculty_en': (info.get('FacultyName') or '').strip(),
            'faculty_id': str(info.get('FacultyID') or ''), 'dept_ar': (info.get('DeptNameArabic') or '').strip(),
            'dept_en': (info.get('DeptName') or '').strip(), 'rank_en': (info.get('AcademicRankEnglish') or '').strip(),
            'spec_en': ' / '.join(x for x in [info.get('GeneralSpecialization'), info.get('SpecificSpecialization')] if x),
        },
        'links': ln,
        'interests': ' '.join((i.get('TitleAR') or i.get('TitleEN') or '').strip() for i in interests if isinstance(i, dict))[:900],
        'interests_en': ' '.join((i.get('TitleEN') or '').strip() for i in interests if isinstance(i, dict))[:900],
        'pubs': out_pubs,
    }


# ------------------------------------------------------------------------------- 2. OpenAlex
OA_STATE = {'down': False, 'calls': 0}
SC_META = {}
WOS_META = {}


def oa_get(path, params=None):
    """GET from OpenAlex. Since 2026 OpenAlex meters use per day (a free API key gives 10x the keyless budget);
    when the budget is spent it answers 429 for the rest of the day, so the run stops asking and reuses the
    previous data instead of recording everyone as unmatched."""
    if OA_STATE['down']:
        return None
    params = dict(params or {})
    params['mailto'] = MAILTO
    if OA_KEY:
        params['api_key'] = OA_KEY
    for attempt in range(4):
        r = http('GET', OA + path, params=params)
        OA_STATE['calls'] += 1
        time.sleep(0.12 if OA_KEY else 0.15)  # under the per-second limit
        if r is not None and r.status_code == 429:
            ra = r.headers.get('Retry-After', '')
            wait = int(ra) if ra.isdigit() else 4 * (attempt + 1)
            if wait > 90 or attempt == 3:
                OA_STATE['down'] = True
                log(f'  ! OpenAlex limit reached after {OA_STATE["calls"]} calls (add an OPENALEX_API_KEY secret for a larger daily budget); '
                    'the remaining researchers keep their previous OpenAlex data')
                return None
            time.sleep(wait)
            continue
        if r is None or r.status_code != 200:
            return None
        try:
            return r.json()
        except ValueError:
            return None
    return None


AUTHOR_SELECT = 'id,display_name,display_name_alternatives,orcid,works_count,cited_by_count,summary_stats,last_known_institutions,affiliations'


def uop_authors():
    """Every OpenAlex author ever affiliated with the university, read once with cheap list calls
    (OpenAlex charges text search 10x more than filtering), then matched to staff names locally."""
    out, cursor = {}, '*'
    while cursor and len(out) < 30000:
        j = oa_get('authors', {'filter': f'affiliations.institution.id:{UOP_OA}', 'per_page': 200, 'cursor': cursor, 'select': AUTHOR_SELECT})
        if not j or not j.get('results'):
            break
        for a in j['results']:
            if a.get('id'):
                a['_names'] = [n for n in [a.get('display_name')] + (a.get('display_name_alternatives') or []) if n]
                out[a['id'].split('/')[-1]] = a
        cursor = (j.get('meta') or {}).get('next_cursor')
    log(f'OpenAlex: {len(out)} authors affiliated with the university')
    return list(out.values())


def oa_find_authors(prof, member, overrides, pool):
    """Return (OpenAlex author IDs, how) for one researcher; several IDs when OpenAlex split the person."""
    ov = overrides.get(prof['uid']) or overrides.get(member.get('email', '').lower()) or {}
    if ov.get('openalex'):
        ids = ov['openalex'] if isinstance(ov['openalex'], list) else [ov['openalex']]
        return [i.split('/')[-1] for i in ids], 'override'
    orcid = orcid_id(prof['links'].get('orcid', ''))
    found, how = [], ''
    if orcid:
        found = [a['id'].split('/')[-1] for a in pool if a.get('orcid') and orcid_id(a['orcid']) == orcid]
        if not found:
            j = oa_get('authors', {'filter': f'orcid:{orcid}', 'select': AUTHOR_SELECT})
            found = [a['id'].split('/')[-1] for a in (j or {}).get('results', []) if a.get('id')]
        if found:
            how = 'orcid'
    name = member.get('name_en') or ''
    if name and pool:
        nk = name_key(name)
        cands = []
        for a in pool:
            if a.get('orcid') and orcid and orcid_id(a['orcid']) != orcid:
                continue  # someone else's ORCID
            full = max(difflib.SequenceMatcher(None, nk, name_key(n)).ratio() for n in a['_names'])
            fl = max(name_score(name, n) for n in a['_names'])
            if fl >= 0.78:
                cands.append((full, fl, a.get('works_count') or 0, a['id'].split('/')[-1]))
        strong = [c for c in cands if c[0] >= 0.86]            # same full name: also catches split profiles
        for c in sorted(strong, reverse=True):
            if c[3] not in found:
                found.append(c[3])
                how = how or 'name'
        if not found:
            loose = sorted([c for c in cands if c[1] >= 0.92], key=lambda c: (-c[1], -c[2]))
            if loose:                                          # first + family name only: shown as "needs checking"
                found, how = [loose[0][3]], 'name~'
    return found[:4], how


WORK_SELECT = ('id,doi,title,publication_year,type,cited_by_count,open_access,primary_location,'
               'authorships,primary_topic,sustainable_development_goals,biblio,fwci')


def oa_works_for(author_ids):
    works, cursor = [], '*'
    flt = 'author.id:' + '|'.join(author_ids)
    while cursor and len(works) < 2500:
        j = oa_get('works', {'filter': flt, 'per_page': 200, 'cursor': cursor, 'select': WORK_SELECT})
        if not j:
            break
        works += j.get('results', [])
        cursor = j.get('meta', {}).get('next_cursor')
        if not j.get('results'):
            break
    return works


def h_index(cites):
    cites = sorted(cites, reverse=True)
    return sum(1 for i, c in enumerate(cites, 1) if c >= i)


# ------------------------------------------------------------------------------- 3. Scopus
def scopus_headers():
    h = {'X-ELS-APIKey': SCOPUS_KEY, 'Accept': 'application/json'}
    if SCOPUS_TOKEN:
        h['X-ELS-Insttoken'] = SCOPUS_TOKEN
    return h


def scopus_author_metrics(sid):
    if not (SCOPUS_KEY and sid):
        return None
    r = http('GET', f'https://api.elsevier.com/content/author/author_id/{sid}', params={'view': 'METRICS'},
             headers=scopus_headers(), tries=2)
    if r is None or r.status_code != 200:
        return None
    try:
        a = r.json()['author-retrieval-response'][0]
        cd = a.get('coredata', {})
        return {'h': int(a.get('h-index') or 0), 'docs': int(cd.get('document-count') or 0),
                'cites': int(cd.get('cited-by-count') or 0), 'citations': int(cd.get('citation-count') or 0)}
    except (KeyError, IndexError, ValueError, TypeError):
        return None


def scopus_affiliation():
    if not SCOPUS_KEY:
        return None
    r = http('GET', f'https://api.elsevier.com/content/affiliation/affiliation_id/{UOP_AFID}', headers=scopus_headers(), tries=2)
    if r is None or r.status_code != 200:
        return None
    try:
        a = r.json()['affiliation-retrieval-response']
        return {'docs': int(a.get('coredata', {}).get('document-count') or 0), 'authors': int(a.get('author-count', {}).get('$', 0) or 0)}
    except (KeyError, ValueError, TypeError, AttributeError):
        return None


def _scopus_page(query, start, full):
    params = {'query': query, 'count': 25, 'start': start}
    if full:   # subscriber access (campus IP or InstToken): author IDs included
        params['view'] = 'COMPLETE'
    r = http('GET', 'https://api.elsevier.com/content/search/scopus', headers=scopus_headers(), tries=2, params=params)
    if r is None:
        return None, 'error'
    if r.status_code in (401, 403):
        return None, 'denied'
    if r.status_code != 200:
        return None, 'error'
    sr = r.json().get('search-results', {})
    entries = [e for e in sr.get('entry', []) if 'error' not in e]
    return (entries, int(sr.get('opensearch:totalResults') or 0)), 'ok'


def _scopus_row(e):
    return {'Title': e.get('dc:title', ''), 'Year': (e.get('prism:coverDate') or '')[:4],
            'Source title': e.get('prism:publicationName', ''), 'DOI': e.get('prism:doi', ''),
            'Cited by': e.get('citedby-count', '0'), 'Document Type': e.get('subtypeDescription', ''),
            'EID': e.get('eid', ''), 'Open Access': 'Yes' if str(e.get('openaccessFlag')).lower() == 'true' else '',
            'ISSN': '; '.join(x for x in [e.get('prism:issn', ''), e.get('prism:eIssn', '')] if x),
            'Author(s) ID': ';'.join(a.get('authid', '') for a in (e.get('author') or [])),
            'Authors': e.get('dc:creator', '')}


def scopus_query_all(query, full, limit=5000):
    rows, start = [], 0
    while start < limit:
        page, state = _scopus_page(query, start, full)
        if state != 'ok':
            return rows, state
        entries, total = page
        rows += [_scopus_row(e) for e in entries]
        start += 25
        if not entries or start >= min(total, limit):
            break
        time.sleep(0.15)
    return rows, 'ok'


def scopus_search_docs(researchers_ids=()):
    """Weekly, with a free Elsevier API key (dev.elsevier.com): every University of Petra document in Scopus,
    with its citations, DOI and ISSN. Off campus without an InstToken Scopus gives the standard view (no author
    lists), so each known Scopus author is also queried once to attribute documents to researchers."""
    if not SCOPUS_KEY:
        return []
    rows, state = scopus_query_all(f'AF-ID({UOP_AFID})', full=True)
    full = state == 'ok' and any(r['Author(s) ID'] for r in rows)
    if not full:
        rows, state = scopus_query_all(f'AF-ID({UOP_AFID})', full=False)
    log(f'scopus api: {len(rows)} documents ({"complete view" if full else "standard view"}, {state})')
    if not rows or full:
        return rows
    by_eid = {r['EID']: r for r in rows if r['EID']}
    for sid in researchers_ids:   # attribute documents to authors
        got, st = scopus_query_all(f'AU-ID({sid}) AND AF-ID({UOP_AFID})', full=False, limit=1000)
        if st == 'denied':
            break
        for g in got:
            r = by_eid.get(g['EID'])
            if r is not None and sid not in r['Author(s) ID'].split(';'):
                r['Author(s) ID'] = ';'.join(x for x in [r['Author(s) ID'], sid] if x)
    return rows


def scopus_csv_rows():
    rows = []
    for path in sorted(glob.glob(os.path.join(OUT, 'scopus_export', '*.csv'))):
        with open(path, encoding='utf-8-sig', newline='') as f:
            rows += list(csv.DictReader(f))
    if rows:
        log(f'scopus csv: {len(rows)} rows')
    return rows


def scopus_author_pool(rows):
    """Authors with a University of Petra affiliation on at least one document of the export:
    Scopus author ID -> names and document count. Used to find researchers whose staff page has no Scopus link."""
    pool = {}
    for row in rows:
        names = [x.strip() for x in (row.get('Author full names') or '').split(';') if x.strip()]
        shorts = [x.strip() for x in (row.get('Authors') or '').split(';') if x.strip()]
        affs = [x.strip() for x in (row.get('Authors with affiliations') or '').split(';') if x.strip()]
        petra = set()   # short names ("Makhadmeh S.N.") whose affiliation text mentions Petra
        for af in affs:
            if 'petra' in af.lower():
                petra.add(af.split(',', 1)[0].strip())
        for i, nm in enumerate(names):
            m = re.match(r'(.+?)\s*\((\d{6,})\)\s*$', nm)
            if not m:
                continue
            full, sid = m.group(1), m.group(2)
            short = shorts[i] if len(shorts) == len(names) else ''
            if not short or short not in petra:
                continue
            if ',' in full:   # "Surname, Given Names" -> "Given Names Surname"
                last, first = full.split(',', 1)
                full = f'{first.strip()} {last.strip()}'
            p = pool.setdefault(sid, {'names': set(), 'docs': 0})
            p['names'].add(full)
            p['docs'] += 1
    return pool


def match_scopus(name, pool):
    """Scopus IDs for a staff name (English) among the university's Scopus authors, and how they were found."""
    if not name or not pool:
        return [], ''
    nk = name_key(name)
    strong, loose = [], []
    for sid, p in pool.items():
        full = max(difflib.SequenceMatcher(None, nk, name_key(n)).ratio() for n in p['names'])
        fl = max(name_score(name, n) for n in p['names'])
        if full >= 0.86:
            strong.append((full, p['docs'], sid))
        elif fl >= 0.92:
            loose.append((fl, p['docs'], sid))
    if strong:
        return [x[2] for x in sorted(strong, reverse=True)][:3], 'name'
    if loose:
        return [sorted(loose, reverse=True)[0][2]], 'name~'
    return [], ''


def issn_key(s):
    return re.sub(r'[^0-9X]', '', (s or '').upper())


def sjr_quartiles():
    """ISSN -> best SJR quartile (SCImago, computed from Scopus data). Kept in data/research/sjr.csv and refreshed
    twice a year; a copy placed there by hand is used as is."""
    path = os.path.join(OUT, 'sjr.csv')
    fresh = os.path.exists(path) and time.time() - os.path.getmtime(path) < 180 * 86400
    if not fresh:
        r = http('GET', 'https://www.scimagojr.com/journalrank.php?out=xls', tries=2, timeout=120,
                 headers={'User-Agent': 'Mozilla/5.0 (uopstaff research pages)'})
        if r is not None and r.status_code == 200 and ';' in r.text[:500] and 'Issn' in r.text[:500]:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(r.text)
            log('SJR list downloaded')
        elif not os.path.exists(path):
            log('  ! SJR list not available: journal quartiles are left out this time')
            return {}
    q = {}
    with open(path, encoding='utf-8-sig', newline='') as f:
        for row in csv.DictReader(f, delimiter=';'):
            best = (row.get('SJR Best Quartile') or '').strip()
            if best not in ('Q1', 'Q2', 'Q3', 'Q4'):
                continue
            for i in re.split(r'[,\s]+', row.get('Issn') or ''):
                k = issn_key(i)
                if len(k) == 8 and (k not in q or best < q[k]):
                    q[k] = best
    log(f'SJR quartiles for {len(q)} ISSNs')
    return q


def wos_rows():
    """Records exported from Web of Science (tab-delimited, Full Record) into data/research/wos_export/."""
    rows = []
    for path in sorted(glob.glob(os.path.join(OUT, 'wos_export', '*.txt'))):
        with open(path, encoding='utf-8-sig', newline='') as f:
            rows += list(csv.DictReader(f, delimiter='\t', quoting=csv.QUOTE_NONE))
    seen, out = set(), []
    for r in rows:
        ut = (r.get('UT') or '').strip()
        if ut and ut not in seen:
            seen.add(ut)
            out.append(r)
    if out:
        log(f'web of science: {len(out)} records')
    return out


def wos_api_rows(dois):
    """Weekly, with a free Web of Science Starter API key (developer.clarivate.com, "Free Institutional Member"
    plan for subscribing universities): which of the researchers' DOIs are in the Web of Science Core Collection,
    and their times-cited counts. About one request per 40 DOIs."""
    if not WOS_KEY or not dois:
        return []
    rows, dois = [], sorted(dois)
    for i in range(0, len(dois), 40):
        q = 'DO=(' + ' OR '.join(f'"{d}"' for d in dois[i:i + 40]) + ')'
        page = 1
        while True:
            r = http('GET', 'https://api.clarivate.com/apis/wos-starter/v1/documents', tries=3,
                     params={'db': 'WOS', 'q': q, 'limit': 50, 'page': page}, headers={'X-ApiKey': WOS_KEY})
            if r is None or r.status_code != 200:
                if r is not None and r.status_code in (401, 403, 429):
                    log(f'  ! Web of Science API: {r.status_code}; using the export files only')
                    return rows
                break
            j = r.json()
            for h in j.get('hits', []):
                src, ids = h.get('source') or {}, h.get('identifiers') or {}
                tc = next((c.get('count', 0) for c in h.get('citations') or [] if c.get('db') == 'WOS'), 0)
                rows.append({'UT': h.get('uid', ''), 'TI': h.get('title', ''), 'PY': str(src.get('publishYear') or ''),
                             'SO': src.get('sourceTitle', ''), 'DI': ids.get('doi', ''), 'TC': str(tc),
                             'DT': ', '.join(h.get('types') or []), 'C1': '', 'OI': '',
                             'AU': '; '.join(a.get('wosStandard') or a.get('displayName', '') for a in ((h.get('names') or {}).get('authors') or []))})
            total = (j.get('metadata') or {}).get('total', 0)
            if page * 50 >= total:
                break
            page += 1
        time.sleep(0.25)
    log(f'web of science api: {len(rows)} of {len(dois)} DOIs indexed')
    return rows


def wos_petra_authors(row):
    """Full names ("Given Surname") of the record's authors whose address is the University of Petra."""
    names = set()
    for m in re.finditer(r'\[([^\]]+)\]\s*([^\[]+)', row.get('C1') or ''):
        if 'petra' in m.group(2).lower():
            for nm in m.group(1).split(';'):
                nm = nm.strip()
                if ',' in nm:
                    last, first = nm.split(',', 1)
                    nm = f'{first.strip()} {last.strip()}'
                if nm:
                    names.add(nm)
    return names


def wos_orcids(row):
    """ORCID iDs listed on the record (OI field: "Name/0000-0000-0000-0000; ...")."""
    return {orcid_id(x) for x in re.findall(r'\d{4}-\d{4}-\d{4}-\d{3}[\dX]', row.get('OI') or '')}


# ------------------------------------------------------------------------------- 4. Google Scholar
class ScholarBlocked(Exception):
    pass


def scholar_metrics(gid):
    if SERPAPI_KEY:
        r = http('GET', 'https://serpapi.com/search.json', params={'engine': 'google_scholar_author', 'author_id': gid,
                                                                    'api_key': SERPAPI_KEY, 'num': 1}, tries=2)
        if r is None or r.status_code != 200:
            return None
        j = r.json().get('cited_by', {})
        t = {list(x.keys())[0]: list(x.values())[0] for x in j.get('table', [])}
        g = {str(x['year']): x['citations'] for x in j.get('graph', [])}
        return {'cites': t.get('citations', {}).get('all'), 'cites5': t.get('citations', {}).get('since_2021') or next(iter([v for k, v in t.get('citations', {}).items() if k.startswith('since')]), None),
                'h': t.get('h_index', {}).get('all'), 'i10': t.get('i10_index', {}).get('all'), 'by_year': g}
    r = S.get('https://scholar.google.com/citations', params={'user': gid, 'hl': 'en'}, timeout=30,
              headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
                       'Accept-Language': 'en-US,en;q=0.9'})
    if r.status_code in (429, 403) or 'gs_captcha' in r.text or 'unusual traffic' in r.text:
        raise ScholarBlocked()
    if r.status_code != 200:
        return None
    nums = [int(x) for x in re.findall(r'<td class="gsc_rsb_std">(\d+)</td>', r.text)]
    years = re.findall(r'<span class="gsc_g_t"[^>]*>(\d{4})</span>', r.text)
    counts = re.findall(r'<span class="gsc_g_al">(\d+)</span>', r.text)
    if len(nums) < 6:
        return None
    # The bars only list non-empty years from the right, so align from the end.
    by_year = dict(zip(years[-len(counts):], (int(c) for c in counts))) if counts else {}
    return {'cites': nums[0], 'cites5': nums[1], 'h': nums[2], 'h5': nums[3], 'i10': nums[4], 'i10_5': nums[5], 'by_year': by_year}


# ------------------------------------------------------------------------------- 5. Jordanian universities
def universities():
    j = oa_get('institutions', {'filter': 'country_code:JO,type:education', 'per_page': 100, 'sort': 'works_count:desc',
                                'select': 'id,display_name,display_name_acronyms,works_count,cited_by_count,summary_stats,counts_by_year,homepage_url,ror'})
    out = []
    for inst in (j or {}).get('results', []):
        iid = inst['id'].split('/')[-1]
        if inst.get('works_count', 0) < 150 and iid != UOP_OA:
            continue
        name = inst['display_name']
        ar = next((a for k, a in UNI_AR if k in name.lower()), '')
        base = f'authorships.institutions.lineage:{iid}'
        years = oa_get('works', {'filter': base, 'group_by': 'publication_year'}) or {}
        fields = oa_get('works', {'filter': base, 'group_by': 'primary_topic.field.id'}) or {}
        oa_g = oa_get('works', {'filter': base, 'group_by': 'open_access.is_oa'}) or {}
        intl = oa_get('works', {'filter': base + ',publication_year:' + f'{THIS_YEAR - 5}-{THIS_YEAR}', 'group_by': 'authorships.countries'}) or {}
        by_year = {}
        for g in years.get('group_by', []):
            y = int(g['key']) if str(g['key']).isdigit() else 0
            if 2000 <= y <= THIS_YEAR:
                by_year[y] = [g['count'], 0]
        for c in inst.get('counts_by_year', []):  # citations per year (OpenAlex keeps about the last decade)
            by_year.setdefault(c['year'], [c.get('works_count', 0), 0])[1] = c.get('cited_by_count', 0)
        oa_count = sum(g['count'] for g in oa_g.get('group_by', []) if str(g.get('key')).lower() == 'true')
        total = sum(g['count'] for g in oa_g.get('group_by', [])) or inst.get('works_count', 0)
        countries = [[(g.get('key') or '').split('/')[-1], g['count']] for g in intl.get('group_by', [])][:40]
        out.append({
            'id': iid, 'name': name, 'name_ar': ar, 'acr': (inst.get('display_name_acronyms') or [''])[0],
            'url': inst.get('homepage_url') or '', 'ror': inst.get('ror') or '',
            'works': inst.get('works_count', 0), 'cites': inst.get('cited_by_count', 0),
            'h': inst.get('summary_stats', {}).get('h_index', 0), 'i10': inst.get('summary_stats', {}).get('i10_index', 0),
            'mean2y': round(inst.get('summary_stats', {}).get('2yr_mean_citedness', 0) or 0, 2),
            'oa_share': round(oa_count / total, 3) if total else 0,
            'by_year': {str(k): v for k, v in sorted(by_year.items())},
            'fields': [[g.get('key_display_name'), g['count']] for g in fields.get('group_by', []) if g.get('key_display_name')][:26],
            'countries': countries,
        })
        log(f'  uni {name}: {out[-1]["works"]} works')
    return out


def institution_extras():
    base = f'authorships.institutions.lineage:{UOP_OA}'
    sub = oa_get('works', {'filter': base, 'group_by': 'primary_topic.subfield.id'}) or {}
    sdg = oa_get('works', {'filter': base, 'group_by': 'sustainable_development_goals.id'}) or {}
    src = oa_get('works', {'filter': base, 'group_by': 'primary_location.source.id'}) or {}
    typ = oa_get('works', {'filter': base, 'group_by': 'type'}) or {}
    oas = oa_get('works', {'filter': base, 'group_by': 'open_access.oa_status'}) or {}
    ctry = oa_get('works', {'filter': base, 'group_by': 'authorships.countries'}) or {}
    funders = oa_get('works', {'filter': base, 'group_by': 'grants.funder'}) or {}
    pick = lambda j, n=30: [[g.get('key_display_name') or g.get('key'), g['count']] for g in j.get('group_by', []) if g.get('key') not in (None, 'unknown')][:n]
    return {'subfields': pick(sub), 'sdgs': pick(sdg, 17), 'sources': pick(src, 40), 'types': pick(typ),
            'oa_status': pick(oas), 'countries': [[(g.get('key') or '').split('/')[-1], g['count']] for g in ctry.get('group_by', [])][:80],
            'funders': pick(funders, 25)}


# ------------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=0, help='only the first N researchers (testing)')
    ap.add_argument('--only', default='', help='only this instructor uid (hex) or e-mail')
    ap.add_argument('--skip-unis', action='store_true')
    ap.add_argument('--workers', type=int, default=6)
    args = ap.parse_args()

    staff = load_json(os.path.join(DATA, 'staff.json'))
    if not staff:
        sys.exit('data/staff.json is missing: run scripts/update_data.py first')
    faculties = {str(f.get('id')): f for f in staff.get('faculties', [])}
    members = [m for m in staff.get('members', []) if m.get('type') == 'academic' and str(m.get('id', '')).startswith('A:')]
    if args.only:
        members = [m for m in members if args.only.lower() in (m['id'].lower(), (m.get('email') or '').lower())]
    if args.limit:
        members = members[:args.limit]
    log(f'{len(members)} academic staff')

    prev = load_json(os.path.join(OUT, 'researchers.json'), {}) or {}
    prev_by_uid = {r['uid']: r for r in prev.get('researchers', [])}
    overrides = load_json(os.path.join(OUT, 'overrides.json'), {}) or {}
    overrides = {k.lower(): v for k, v in overrides.items() if not k.startswith('_')}

    # -- 1. university profiles (parallel; the API is quick)
    profiles = {}
    with cf.ThreadPoolExecutor(args.workers) as ex:
        futs = {ex.submit(uop_profile, m): m for m in members}
        for i, f in enumerate(cf.as_completed(futs), 1):
            m = futs[f]
            try:
                profiles[m['id']] = f.result()
            except Exception as e:  # keep going: one bad profile must not stop the run
                log(f'  ! profile {m.get("name")}: {e}')
            if i % 25 == 0:
                log(f'  profiles {i}/{len(members)}')

    # -- 2. OpenAlex per researcher
    researchers, all_works = [], {}   # work key -> merged work
    title_index = {}

    def add_work(key, w, rid):
        cur = all_works.get(key)
        if cur is None:
            w['r'] = [rid]
            all_works[key] = w
            if w.get('nt'):
                title_index.setdefault(w['nt'] + str(w.get('y') or ''), key)
            return key
        if rid not in cur['r']:
            cur['r'].append(rid)
        for k, v in w.items():  # fill gaps only
            if k not in cur or cur[k] in ('', None, [], 0):
                cur[k] = v
        cur['src'] = ''.join(sorted(set(cur.get('src', '') + w.get('src', ''))))
        return key

    pool = uop_authors()
    prev_works = defaultdict(list)
    for w in (load_json(os.path.join(OUT, 'works.json'), {}) or {}).get('works', []):
        for r_ in w.get('r', []):
            prev_works[r_].append(w)

    def safe_works(prof, m, rid, oa_ids):
        try:
            return oa_works_for(oa_ids) if oa_ids else []
        except Exception as e:  # noqa: BLE001
            log(f'  ! works for {m.get("name_en")}: {e}')
            return []

    for n, m in enumerate(members, 1):
        prof = profiles.get(m['id'])
        if not prof:
            continue
        rid = short_id(prof['uid'])
        old = prev_by_uid.get(prof['uid'], {})
        reused = False
        if OA_STATE['down'] and old.get('oa_ids'):
            oa_ids, how, works, reused = old['oa_ids'], old.get('oa_match', ''), [], True
        else:
            oa_ids, how = oa_find_authors(prof, m, overrides, pool)
            works = safe_works(prof, m, short_id(prof['uid']), oa_ids)
            if OA_STATE['down'] and old.get('oa_ids'):   # the limit was hit during this researcher
                oa_ids, how, works, reused = old['oa_ids'], old.get('oa_match', ''), [], True
        my_keys, topics, countries, coauth_ext, sdgs = [], Counter(), Counter(), Counter(), Counter()
        if reused:   # keep last run's OpenAlex works for this researcher
            for pw in prev_works.get(old.get('id', ''), []):
                if 'o' not in (pw.get('src') or ''):
                    continue
                rec = {k: v for k, v in pw.items() if k != 'r'}
                rec['src'], rec['nt'] = 'o', norm_title(rec.get('t'))
                key = 'd:' + rec['doi'] if rec.get('doi') else 'w:' + (rec.get('oid') or rec['id'])
                my_keys.append(add_work(key, rec, rid))
                if rec.get('topic'):
                    topics[(rec['topic'], rec.get('f', ''))] += 1
        for w in works:
            if not isinstance(w, dict):
                continue
            wid = (w.get('id') or '').split('/')[-1]
            if not wid:
                continue
            loc = w.get('primary_location') or {}
            srcd = loc.get('source') or {}
            auths = [a for a in (w.get('authorships') or []) if isinstance(a, dict)]
            cc = sorted({c for a in auths for c in (a.get('countries') or []) if c})
            names = [(a.get('author') or {}).get('display_name') or '' for a in auths]
            topic = (w.get('primary_topic') or {})
            rec = {
                'id': wid, 't': html.unescape(w.get('title') or '')[:400], 'y': w.get('publication_year'),
                'v': srcd.get('display_name') or '', 'vt': srcd.get('type') or '', 'issn': srcd.get('issn_l') or '',
                'type': w.get('type') or '', 'doi': clean_doi(w.get('doi')), 'c': w.get('cited_by_count') or 0,
                'oa': (w.get('open_access') or {}).get('oa_status') or 'closed', 'oaurl': (w.get('open_access') or {}).get('oa_url') or '',
                'topic': topic.get('display_name') or '', 'f': (topic.get('field') or {}).get('display_name') or '',
                'sf': (topic.get('subfield') or {}).get('display_name') or '', 'cc': cc,
                'na': len(auths), 'au': ', '.join(names[:8]) + (' …' if len(names) > 8 else ''),
                'fwci': round(w['fwci'], 2) if isinstance(w.get('fwci'), (int, float)) else None,
                'sdg': [s.get('display_name') for s in (w.get('sustainable_development_goals') or []) if s and s.get('display_name')][:3],
                'src': 'o', 'nt': norm_title(w.get('title')), 'oid': wid,
            }
            key = 'd:' + rec['doi'] if rec['doi'] else 'w:' + wid
            if key not in all_works and rec['doi'] == '' and (rec['nt'] + str(rec['y'] or '')) in title_index:
                key = title_index[rec['nt'] + str(rec['y'] or '')]
            my_keys.append(add_work(key, rec, rid))
            if rec['topic']:
                topics[(rec['topic'], rec['f'])] += 1
            for c in cc:
                countries[c] += 1
            for s in rec['sdg']:
                sdgs[s] += 1
            for a in auths:
                aid = ((a.get('author') or {}).get('id') or '').split('/')[-1]
                if aid and aid not in oa_ids:
                    coauth_ext[aid] += 1
        # university-listed publications: match to OpenAlex by DOI, then by title
        matched_uop = 0
        for p in prof['pubs']:
            nt = norm_title(p['t'])
            key = None
            if p['doi'] and 'd:' + p['doi'] in all_works:
                key = 'd:' + p['doi']
            else:
                key = next((k for k in my_keys if all_works[k].get('nt') == nt), None) or \
                      title_index.get(nt + str(p.get('y') or ''))
            if key:
                matched_uop += 1
                w = all_works[key]
                w['src'] = ''.join(sorted(set(w.get('src', '') + 'u')))
                if rid not in w['r']:
                    w['r'].append(rid)
                if p['url'] and not w.get('url'):
                    w['url'] = p['url']
                w.setdefault('uop_ids', []).append(p['uop_id'])
                if key not in my_keys:
                    my_keys.append(key)
            else:
                rec = {'id': f'u{p["uop_id"]}', 't': p['t'][:400], 'y': p['y'], 'v': p['v'], 'type': p['type'], 'doi': p['doi'],
                       'url': p['url'], 'c': 0, 'oa': '', 'au': p['au'], 'src': 'u', 'nt': nt, 'pub': p['pub'],
                       'vol': p['vol'], 'pages': p['pages'], 'sdg': [s for s in p['sdg'] if s][:3]}
                key = 'd:' + p['doi'] if p['doi'] else 'u:' + str(p['uop_id'])
                my_keys.append(add_work(key, rec, rid))

        cites = [all_works[k].get('c') or 0 for k in my_keys]
        by_year = defaultdict(lambda: [0, 0])
        for k in my_keys:
            y = all_works[k].get('y')
            if y:
                by_year[int(y)][0] += 1
        # citations received per year: OpenAlex keeps it on the author records
        if reused:
            for y, v in (old.get('by_year') or {}).items():
                by_year[int(y)][1] = v[1]
        elif oa_ids:
            for aid in oa_ids:
                a = oa_get(f'authors/{aid}', {'select': 'counts_by_year,display_name'}) or {}
                for c in a.get('counts_by_year') or []:
                    if c.get('year'):
                        by_year[int(c['year'])][1] += c.get('cited_by_count') or 0

        links = dict(prof['links'])
        sid = scopus_id(links.get('scopus', ''))
        gid = scholar_id(links.get('scholar', ''))
        fac = faculties.get(str(m.get('faculty')), {})
        r = {
            'id': rid, 'uid': prof['uid'], 'name': m.get('name', ''), 'name_en': m.get('name_en', ''),
            'rank': m.get('rank', ''), 'rank_order': m.get('rank_order', 9), 'rank_en': prof['info']['rank_en'],
            'job': m.get('job', '') if m.get('job') != m.get('rank') else '',
            'faculty': prof['info']['faculty_ar'] or fac.get('name', ''), 'faculty_en': prof['info']['faculty_en'] or fac.get('name_en', ''),
            'faculty_id': prof['info']['faculty_id'] or str(m.get('faculty', '')),
            'dept': m.get('department') or prof['info']['dept_ar'], 'dept_en': prof['info']['dept_en'],
            'spec': m.get('specialization', ''), 'spec_en': prof['info']['spec_en'],
            'photo': m.get('photo', ''), 'email': m.get('email', ''), 'profile': m.get('profile', ''),
            'interests': prof['interests'], 'interests_en': prof['interests_en'],
            'links': links, 'scopus_id': sid, 'orcid_id': orcid_id(links.get('orcid', '')), 'scholar_id': gid,
            'oa_ids': oa_ids, 'oa_match': how,
            'works': len(my_keys), 'cites': sum(cites), 'h': h_index(cites), 'i10': sum(1 for c in cites if c >= 10),
            'w5': sum(1 for k in my_keys if (all_works[k].get('y') or 0) >= THIS_YEAR - 4),
            'c5': sum(v[1] for y, v in by_year.items() if y >= THIS_YEAR - 4),
            'oa_share': round(sum(1 for k in my_keys if all_works[k].get('oa') not in ('', 'closed', None)) / len(my_keys), 3) if my_keys else 0,
            'uop_pubs': len(prof['pubs']), 'uop_matched': matched_uop,
            'by_year': {str(y): v for y, v in sorted(by_year.items()) if 1980 <= y <= THIS_YEAR},
            'topics': [[t, f, c] for (t, f), c in topics.most_common(12)],
            'countries': countries.most_common(25), 'sdgs': sdgs.most_common(8),
            'ext_coauthors': len(coauth_ext),
            'scopus': scopus_author_metrics(sid) or old.get('scopus'),
            'scholar': old.get('scholar'), 'scholar_at': old.get('scholar_at'),
        }
        r['_keys'] = my_keys
        researchers.append(r)
        log(f'[{n}/{len(members)}] {r["name_en"] or r["name"]}: oa={",".join(oa_ids) or "-"} ({how or "no match"}) '
            f'works={r["works"]} cites={r["cites"]} h={r["h"]} uop={r["uop_pubs"]}/{matched_uop}' + (' [previous OpenAlex data]' if reused else ''))

    # -- 3. Scopus (the university's reference source): documents from the API or the CSV export
    saved_pool = load_json(os.path.join(OUT, 'scopus_authors.json'), {}) or {}
    known_ids = sorted({r['scopus_id'] for r in researchers if r['scopus_id']} |
                       {sid for r in prev.get('researchers', []) for sid in (r.get('scopus_ids') or [])})
    sc_rows = scopus_search_docs(known_ids) + scopus_csv_rows()
    seen_eid, uniq = set(), []
    for row in sc_rows:   # several exports may overlap
        k = row.get('EID') or norm_title(row.get('Title')) + str(row.get('Year'))
        if k not in seen_eid:
            seen_eid.add(k)
            uniq.append(row)
    sc_rows = uniq
    sc_pool = scopus_author_pool(sc_rows)
    for sid, v in saved_pool.items():   # names learned from earlier full exports stay usable for matching
        p = sc_pool.setdefault(sid, {'names': set(), 'docs': 0})
        p['names'] |= set(v.get('names', []))
        p['docs'] = max(p['docs'], v.get('docs', 0))
    if sc_pool:
        save_json('scopus_authors.json', {sid: {'names': sorted(v['names']), 'docs': v['docs']} for sid, v in sc_pool.items()})
    quart = sjr_quartiles()
    for r in researchers:   # Scopus author IDs: the staff-page link first, then the name among the university's Scopus authors
        ids = [r['scopus_id']] if r['scopus_id'] else []
        how = 'link' if ids else ''
        if not ids:
            ids, how = match_scopus(r['name_en'], sc_pool)
        r['scopus_ids'], r['scopus_match'] = ids, how
    sid_to_rid = {sid: r['id'] for r in researchers for sid in r['scopus_ids']}
    by_rid = {r['id']: r for r in researchers}
    sc_flagged = 0
    for row in sc_rows:
        doi = clean_doi(row.get('DOI'))
        nt = norm_title(row.get('Title'))
        y = str(row.get('Year') or '')
        key = 'd:' + doi if doi and 'd:' + doi in all_works else title_index.get(nt + y)
        rids = list(dict.fromkeys(sid_to_rid[a.strip()] for a in re.split(r'[;,]', row.get('Author(s) ID') or '') if a.strip() in sid_to_rid))
        try:
            sc_c = int(str(row.get('Cited by') or '0').strip() or 0)
        except ValueError:
            sc_c = 0
        issns = [issn_key(x) for x in re.split(r'[;,\s]+', row.get('ISSN') or '') if x.strip()]
        q = next((quart[i] for i in issns if i in quart), '')
        if key:
            w = all_works[key]
            w['src'] = ''.join(sorted(set(w.get('src', '') + 's')))
            sc_flagged += 1
        elif rids:
            key = 'd:' + doi if doi else 's:' + (row.get('EID') or nt)
            add_work(key, {'id': row.get('EID') or ('s' + nt[:12]), 't': row.get('Title', '')[:400], 'y': int(y) if y.isdigit() else None,
                           'v': row.get('Source title', ''), 'type': (row.get('Document Type') or '').lower(), 'doi': doi, 'c': sc_c,
                           'oa': 'oa' if row.get('Open Access') else 'closed', 'au': (row.get('Authors') or '')[:300], 'src': 's', 'nt': nt}, rids[0])
        else:
            continue   # a university document whose authors are not current staff
        w = all_works[key]
        w['sc'] = max(w.get('sc') or 0, sc_c)
        if row.get('EID'):
            w['eid'] = row['EID']
        if q:
            w['q'] = q
        if row.get('Document Type'):
            w['st'] = row['Document Type']
        for rid in rids:
            if rid not in w['r']:
                w['r'].append(rid)
            if key not in by_rid[rid]['_keys']:
                by_rid[rid]['_keys'].append(key)
    for w in all_works.values():   # quartiles for journals of works Scopus did not list (e.g. older papers)
        if 'q' not in w and w.get('issn') and issn_key(w['issn']) in quart:
            w['q'] = quart[issn_key(w['issn'])]
    if sc_rows:
        log(f'scopus: {len(sc_rows)} documents, {len(sc_pool)} university authors, {sc_flagged} matched to existing works')
    for r in researchers:   # Scopus metrics over the documents with the university's affiliation
        ks = [k for k in r['_keys'] if 's' in all_works[k].get('src', '')]
        cites = [all_works[k].get('sc') or 0 for k in ks]
        by = Counter(all_works[k].get('y') for k in ks if all_works[k].get('y'))
        qs = Counter(all_works[k].get('q') for k in ks if all_works[k].get('q'))
        r['in_scopus'] = len(ks)
        r['sc'] = {'docs': len(ks), 'cites': sum(cites), 'h': h_index(cites), 'i10': sum(1 for c in cites if c >= 10),
                   'w5': sum(1 for k in ks if (all_works[k].get('y') or 0) >= THIS_YEAR - 4),
                   'q': {k: qs.get(k, 0) for k in ('Q1', 'Q2', 'Q3', 'Q4')},
                   'by_year': {str(y): n for y, n in sorted(by.items())}} if ks else None
    SC_META.update({'docs': len(sc_rows), 'cites': sum(int(str(x.get('Cited by') or 0) or 0) for x in sc_rows),
                    'by_year': dict(sorted(Counter(str(x.get('Year')) for x in sc_rows if x.get('Year')).items())),
                    'types': Counter(x.get('Document Type') for x in sc_rows if x.get('Document Type')).most_common(10),
                    'sources': Counter(x.get('Source title') for x in sc_rows if x.get('Source title')).most_common(25),
                    'quartiles': dict(Counter(next((quart[i] for i in [issn_key(z) for z in re.split(r'[;,\s]+', x.get('ISSN') or '')] if i in quart), 'none') for x in sc_rows)),
                    'authors': len(sc_pool), 'has_quartiles': bool(quart)})

    # -- 3b. Web of Science (the university's other reference source): CSV/TXT exports
    wrows = wos_rows()
    have = {clean_doi(x.get('DI')) for x in wrows}
    api = wos_api_rows({w['doi'] for w in all_works.values() if w.get('doi') and w['doi'] not in have})
    wrows += api
    if wrows:
        wpool = {}
        for row in wrows:
            for nm in wos_petra_authors(row):
                wpool.setdefault(nm.lower(), {'names': {nm}, 'docs': 0})['docs'] += 1
        pool_by_key = {k: v for k, v in wpool.items()}
        orcid_to_rid = {r['orcid_id']: r['id'] for r in researchers if r['orcid_id']}
        name_to_rid = {}
        for r in researchers:   # match staff names among the university's WoS authors
            ids, how = match_scopus(r['name_en'], pool_by_key)
            r['wos_match'] = how
            for k in ids:
                name_to_rid.setdefault(k, r['id'])
        w_flag = 0
        for row in wrows:
            doi = clean_doi(row.get('DI'))
            nt = norm_title(row.get('TI'))
            y = str(row.get('PY') or '')
            rids = list(dict.fromkeys([orcid_to_rid[o] for o in wos_orcids(row) if o in orcid_to_rid] +
                                      [name_to_rid[n.lower()] for n in wos_petra_authors(row) if n.lower() in name_to_rid]))
            key = 'd:' + doi if doi and 'd:' + doi in all_works else title_index.get(nt + y)
            try:
                tc = int((row.get('TC') or '0').strip() or 0)
            except ValueError:
                tc = 0
            if not key and rids:
                key = 'd:' + doi if doi else 'wos:' + (row.get('UT') or nt)
                add_work(key, {'id': row.get('UT') or ('w' + nt[:12]), 't': (row.get('TI') or '')[:400], 'y': int(y) if y.isdigit() else None,
                               'v': (row.get('SO') or '').title(), 'type': (row.get('DT') or '').lower(), 'doi': doi, 'c': tc,
                               'au': (row.get('AU') or '')[:300], 'src': 'w', 'nt': nt}, rids[0])
            if not key:
                continue
            w = all_works[key]
            w['src'] = ''.join(sorted(set(w.get('src', '') + 'w')))
            w['wc'] = max(w.get('wc') or 0, tc)
            if row.get('UT'):
                w['ut'] = row['UT'].strip()
            w_flag += 1
            for rid in rids:
                if rid not in w['r']:
                    w['r'].append(rid)
                if key not in by_rid[rid]['_keys']:
                    by_rid[rid]['_keys'].append(key)
        for r in researchers:
            ks = [k for k in r['_keys'] if 'w' in all_works[k].get('src', '')]
            cites = [all_works[k].get('wc') or 0 for k in ks]
            r['wos'] = {'docs': len(ks), 'cites': sum(cites), 'h': h_index(cites),
                        'w5': sum(1 for k in ks if (all_works[k].get('y') or 0) >= THIS_YEAR - 4)} if ks else None
        WOS_META.update({'docs': len(wrows), 'cites': sum(int((x.get('TC') or '0').strip() or 0) for x in wrows),
                         'by_year': dict(sorted(Counter(str(x.get('PY')).strip() for x in wrows if (x.get('PY') or '').strip()).items())),
                         'authors': len(wpool), 'matched_works': w_flag})
        log(f'web of science: {w_flag} records matched to works, {len(wpool)} university authors')

    # -- 4. Google Scholar (best effort; previous values are kept when blocked)
    if SCHOLAR_ON:
        todo = [r for r in researchers if r['scholar_id']]
        todo.sort(key=lambda r: r.get('scholar_at') or '')   # the oldest first, so blocking rotates fairly
        done = 0
        for r in todo:
            try:
                s = scholar_metrics(r['scholar_id'])
            except ScholarBlocked:
                log(f'scholar: blocked after {done} profiles; keeping earlier values for the rest')
                break
            except requests.RequestException:
                continue
            if s:
                r['scholar'] = s
                r['scholar_at'] = dt.date.today().isoformat()
                done += 1
            time.sleep(0.5 if SERPAPI_KEY else random.uniform(6, 12))
        log(f'scholar: {done} profiles refreshed')

    # -- 5. co-authorship inside the university
    pair = Counter()
    for w in all_works.values():
        rs = sorted(set(w['r']))
        for i in range(len(rs)):
            for j in range(i + 1, len(rs)):
                pair[(rs[i], rs[j])] += 1
    co = defaultdict(list)
    for (a, b), c in pair.items():
        co[a].append([b, c])
        co[b].append([a, c])
    for r in researchers:
        r['coauthors'] = sorted(co.get(r['id'], []), key=lambda x: -x[1])[:30]
        r.pop('_keys', None)

    works_out = []
    for w in all_works.values():
        w.pop('nt', None)
        works_out.append({k: v for k, v in w.items() if v not in ('', None, [])})
    works_out.sort(key=lambda w: (-(w.get('y') or 0), -(w.get('c') or 0)))

    now = dt.datetime.now(dt.timezone.utc).isoformat(timespec='minutes')
    covered = [r for r in researchers]
    meta = {
        'updated': now, 'openalex_institution': UOP_OA, 'scopus_afid': UOP_AFID,
        'researchers': len(covered), 'works': len(works_out),
        'with': {k: sum(1 for r in covered if r['links'].get(k)) for k in ('scholar', 'scopus', 'orcid', 'joip', 'researchgate')},
        'matched_scopus': sum(1 for r in covered if r.get('scopus_ids')),
        'matched_openalex': sum(1 for r in covered if r['oa_ids']),
        'openalex_calls': OA_STATE['calls'], 'openalex_limited': OA_STATE['down'],
        'wos_export': WOS_META or (prev.get('meta') or {}).get('wos_export'),
        'scopus_export': SC_META or (prev.get('meta') or {}).get('scopus_export'),
        'scopus_mode': 'api' if SCOPUS_KEY else ('csv' if glob.glob(os.path.join(OUT, 'scopus_export', '*.csv')) else 'links'),
        'scholar_mode': 'serpapi' if SERPAPI_KEY else ('direct' if SCHOLAR_ON else 'off'),
        'scopus_affiliation': scopus_affiliation() or (prev.get('meta') or {}).get('scopus_affiliation'),
        'year': THIS_YEAR,
    }
    if not args.limit and not args.only:
        meta['institution'] = institution_extras()
    save_json('researchers.json', {'meta': meta, 'researchers': researchers})
    save_json('works.json', {'updated': now, 'works': works_out})
    if not args.skip_unis and not args.limit and not args.only:
        save_json('universities.json', {'updated': now, 'uop': UOP_OA, 'universities': universities()})


if __name__ == '__main__':
    main()
