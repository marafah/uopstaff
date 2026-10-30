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
QUICK = os.environ.get('QUICK', '0') == '1'   # an upload (manual edits, exports): skip the heavy weekly Scopus steps
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


def name_score(a, b, last_only=False):
    """last_only: the surname must match the other name's last part, not any of its parts
    ("Ahmed ... Ali" is not "Ahmed S.A. Ali Agha")."""
    a, b = name_key(a), name_key(b)
    if not a or not b:
        return 0.0
    ta, tb = a.split(), b.split()
    full = difflib.SequenceMatcher(None, a, b).ratio()
    # first + last name agreement is the strongest signal for Arabic names in Latin script
    fl = 0.0
    if ta and tb:
        first = difflib.SequenceMatcher(None, ta[0], tb[0]).ratio()
        last = difflib.SequenceMatcher(None, ta[-1], tb[-1]).ratio() if last_only else max(difflib.SequenceMatcher(None, ta[-1], x).ratio() for x in tb)
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


WORK_SELECT_BASIC = ('id,doi,title,publication_year,type,cited_by_count,open_access,primary_location,'
                     'authorships,primary_topic,sustainable_development_goals,biblio,fwci')
# the document page also shows the abstract, keywords, topics, language, references and citations per year
WORK_SELECT = WORK_SELECT_BASIC + ',abstract_inverted_index,keywords,topics,language,publication_date,referenced_works_count,counts_by_year,ids'
SEL = {'works': WORK_SELECT}


def oa_works_for(author_ids):
    works, cursor = [], '*'
    flt = 'author.id:' + '|'.join(author_ids)
    while cursor and len(works) < 2500:
        j = oa_get('works', {'filter': flt, 'per_page': 200, 'cursor': cursor, 'select': SEL['works']})
        if not j and SEL['works'] != WORK_SELECT_BASIC and not OA_STATE['down'] and not works:
            SEL['works'] = WORK_SELECT_BASIC   # an unknown field must never cost the whole run
            log('  ! OpenAlex refused the detailed field list; using the basic one')
            continue
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


# Jordanian universities in Scopus (affiliation IDs from Scopus' own affiliation facet for AFFILCOUNTRY(jordan))
JO_SCOPUS = [
    ('60064180', 'The University of Jordan', 'الجامعة الأردنية'), ('60051534', 'Jordan University of Science and Technology', 'جامعة العلوم والتكنولوجيا الأردنية'),
    ('60044088', 'Hashemite University', 'الجامعة الهاشمية'), ('60044065', 'Yarmouk University', 'جامعة اليرموك'),
    ('60062395', 'Al-Balqa Applied University', 'جامعة البلقاء التطبيقية'), ('60043655', 'Applied Science Private University', 'جامعة العلوم التطبيقية الخاصة'),
    ('60058937', 'Al-Ahliyya Amman University', 'جامعة عمان الأهلية'), ('60042753', 'Zarqa University', 'جامعة الزرقاء'),
    ('60035301', 'Mutah University', 'جامعة مؤتة'), ('60067411', 'Al-Zaytoonah University of Jordan', 'جامعة الزيتونة الأردنية'),
    ('60036479', 'Al al-Bayt University', 'جامعة آل البيت'), ('60109124', 'Middle East University', 'جامعة الشرق الأوسط'),
    ('60139033', 'Jadara University', 'جامعة جدارا'), ('60067706', 'Isra University', 'جامعة الإسراء'),
    ('60040839', 'University of Petra', 'جامعة البترا'), ('60056335', 'Princess Sumaya University for Technology', 'جامعة الأميرة سمية للتكنولوجيا'),
    ('60070287', 'German Jordanian University', 'الجامعة الألمانية الأردنية'), ('60105841', 'Al-Hussein Bin Talal University', 'جامعة الحسين بن طلال'),
    ('60087691', 'Amman Arab University', 'جامعة عمان العربية'), ('60054151', 'Philadelphia University', 'جامعة فيلادلفيا'),
    ('60035155', 'Tafila Technical University', 'جامعة الطفيلة التقنية'), ('60049668', 'Jerash University', 'جامعة جرش'),
    ('60070289', 'Irbid National University', 'جامعة إربد الأهلية'), ('60276501', 'Ajloun National University', 'جامعة عجلون الوطنية'),
    ('60115127', 'American University of Madaba', 'الجامعة الأمريكية في مادبا'), ('60108351', 'The World Islamic Sciences and Education University', 'جامعة العلوم الإسلامية العالمية'),
    ('60122214', 'Aqaba University of Technology', 'جامعة العقبة للتكنولوجيا'), ('60276062', 'Al Hussein Technical University', 'جامعة الحسين التقنية'),
]
SUBJ = {'AGRI': 'العلوم الزراعية والحيوية', 'ARTS': 'الآداب والعلوم الإنسانية', 'BIOC': 'الكيمياء الحيوية والوراثة', 'BUSI': 'الأعمال والإدارة والمحاسبة',
        'CENG': 'الهندسة الكيميائية', 'CHEM': 'الكيمياء', 'COMP': 'علم الحاسوب', 'DECI': 'علوم القرار', 'DENT': 'طب الأسنان',
        'EART': 'علوم الأرض والكواكب', 'ECON': 'الاقتصاد والمالية', 'ENER': 'الطاقة', 'ENGI': 'الهندسة', 'ENVI': 'العلوم البيئية',
        'HEAL': 'المهن الصحية', 'IMMU': 'المناعة والأحياء الدقيقة', 'MATE': 'علوم المواد', 'MATH': 'الرياضيات', 'MEDI': 'الطب',
        'NEUR': 'علم الأعصاب', 'NURS': 'التمريض', 'PHAR': 'الصيدلة والسموم', 'PHYS': 'الفيزياء والفلك', 'PSYC': 'علم النفس',
        'SOCI': 'العلوم الاجتماعية', 'VETE': 'الطب البيطري', 'MULT': 'متعدد التخصصات'}

SC_BUDGET = {'used': 0, 'remaining': None}
CITES = {}


def scopus_count(query):
    """Number of Scopus documents matching a query: one request, nothing downloaded."""
    if SC_BUDGET['remaining'] is not None and SC_BUDGET['remaining'] < 300:
        return None   # keep a safety margin of the weekly quota
    for attempt in range(4):
        r = http('GET', 'https://api.elsevier.com/content/search/scopus', headers=scopus_headers(), tries=2,
                 params={'query': query, 'count': 1, 'field': 'eid'})
        SC_BUDGET['used'] += 1
        time.sleep(0.25)   # about 4 requests a second, under Scopus' limit of 9
        if r is None:
            return None
        rem = r.headers.get('X-RateLimit-Remaining')
        if rem and rem.isdigit():
            SC_BUDGET['remaining'] = int(rem)
        if r.status_code == 429:
            time.sleep(min(60, 5 * (attempt + 1)))
            continue
        if r.status_code != 200:
            return None
        try:
            return int(r.json()['search-results']['opensearch:totalResults'])
        except (KeyError, ValueError, TypeError):
            return None
    return None


def scopus_h_index(afid):
    """Institution h-index in Scopus: documents sorted by citations, read until citations < rank."""
    h, start = 0, 0
    while start < 2000:
        r = http('GET', 'https://api.elsevier.com/content/search/scopus', headers=scopus_headers(), tries=2,
                 params={'query': f'AF-ID({afid})', 'count': 25, 'start': start, 'sort': '-citedby-count', 'field': 'citedby-count'})
        SC_BUDGET['used'] += 1
        time.sleep(0.25)
        if r is None or r.status_code != 200:
            return None
        cites = [int(e.get('citedby-count') or 0) for e in r.json().get('search-results', {}).get('entry', []) if 'error' not in e]
        if not cites:
            break
        for i, c in enumerate(cites, start + 1):
            if c >= i:
                h = i
            else:
                return h
        start += 25
    return h


def _scopus_eids(query):
    """Every (EID, citations) for a query: 25 per request, standard view (works off-campus with the free key).
    The search API pages up to 5,000 results per query, so callers split larger sets by year."""
    out, start, total = {}, 0, None
    while total is None or start < min(total, 5000):
        if SC_BUDGET['remaining'] is not None and SC_BUDGET['remaining'] < 300:
            return out, total, 'quota'
        r = http('GET', 'https://api.elsevier.com/content/search/scopus', headers=scopus_headers(), tries=3,
                 params={'query': query, 'count': 25, 'start': start, 'field': 'eid,citedby-count'})
        SC_BUDGET['used'] += 1
        time.sleep(0.25)
        if r is None:
            return out, total, 'error'
        rem = r.headers.get('X-RateLimit-Remaining')
        if rem and rem.isdigit():
            SC_BUDGET['remaining'] = int(rem)
        if r.status_code == 429:
            time.sleep(30)
            continue
        if r.status_code != 200:
            return out, total, 'error'
        sr = r.json().get('search-results', {})
        total = int(sr.get('opensearch:totalResults') or 0)
        entries = [e for e in sr.get('entry', []) if 'error' not in e]
        if not entries:
            break
        for e in entries:
            if e.get('eid'):
                out[e['eid']] = int(e.get('citedby-count') or 0)
        start += 25
    return out, total, 'ok'


def _scopus_range(afid, y0, y1, acc):
    """Collect a university's documents published y0..y1, halving the range while it holds more than 5,000."""
    q = f'AF-ID({afid}) AND PUBYEAR > {y0 - 1} AND PUBYEAR < {y1 + 1}'
    n = scopus_count(q)
    if n is None:
        return 'error'
    if n == 0:
        return 'ok'
    if n > 5000 and y1 > y0:
        mid = (y0 + y1) // 2
        a = _scopus_range(afid, y0, mid, acc)
        return a if a != 'ok' else _scopus_range(afid, mid + 1, y1, acc)
    got, _, state = _scopus_eids(q)
    acc.update(got)
    return state


def jordan_citations(prev_path):
    """Weekly: citations of every Scopus document of every Jordanian university (EID -> times cited).
    About 5,500 requests for ~136,000 documents; the export files under data/research/universities_export
    hold the full details, this keeps their citations current."""
    old = load_json(prev_path, {}) or {}
    if not SCOPUS_KEY:
        return old
    out = {'updated': dt.date.today().isoformat(), 'universities': {}, 'eid': dict(old.get('eid') or {})}
    for afid, name, _ in JO_SCOPUS:
        acc = {}
        state = _scopus_range(afid, 1950, THIS_YEAR + 1, acc)
        prev_u = (old.get('universities') or {}).get(afid) or {}
        if state != 'ok' and len(acc) < (prev_u.get('docs') or 0):   # incomplete: keep last week's figures
            out['universities'][afid] = prev_u
            log(f'  citations {name}: incomplete ({state}), kept previous')
            if state == 'quota':
                break
            continue
        for eid, c in acc.items():
            out['eid'][eid[7:] if eid.startswith('2-s2.0-') else eid] = c
        cites = sorted(acc.values(), reverse=True)
        out['universities'][afid] = {'docs': len(acc), 'cites': sum(cites), 'h': h_index(cites),
                                     'cited_share': round(sum(1 for c in cites if c) / len(cites), 3) if cites else 0,
                                     'eids': sorted(e[7:] if e.startswith('2-s2.0-') else e for e in acc)}
        log(f'  citations {name}: {len(acc)} documents, {sum(cites)} citations, h {h_index(cites)}')
    log(f'jordan citations: {len(out["eid"])} documents, {SC_BUDGET["used"]} requests, quota left {SC_BUDGET["remaining"]}')
    return out


def _cr_date(v):
    try:
        parts = (v.get('date-parts') or [[]])[0]
        if len(parts) == 3:
            return dt.date(*parts)
    except (TypeError, ValueError, AttributeError):
        return None
    return None


def _assert_date(s):
    for fmt in ('%d %B %Y', '%d %b %Y', '%Y-%m-%d', '%B %d, %Y', '%d/%m/%Y'):
        try:
            return dt.datetime.strptime(s.strip(), fmt).date()
        except (ValueError, AttributeError):
            continue
    return None


def journal_times(max_calls=4000):
    """Weekly, free: how long journals take, read from Crossref for a sample of recent Jordanian papers.
    Publishers deposit 'received', 'accepted' and online-publication dates (Elsevier, Springer, Taylor & Francis, MDPI, ...).
    Results accumulate in data/research/jordan/journal_times.json; a few thousand DOIs per run."""
    src = load_json(os.path.join(OUT, 'jordan', 'journal_dois.json'), {}) or {}
    path = os.path.join(OUT, 'jordan', 'journal_times.json')
    cache = load_json(path, {}) or {}
    done = cache.setdefault('_dois', {})
    todo = [(jid, d) for jid, ds in src.items() for d in ds if d.lower() not in done]
    random.shuffle(todo)
    calls = 0
    for jid, doi in todo[:max_calls]:
        r = http('GET', f'https://api.crossref.org/works/{requests.utils.quote(doi)}', tries=2,
                 params={'mailto': MAILTO}, headers={'User-Agent': f'uopstaff-research (mailto:{MAILTO})'})
        calls += 1
        time.sleep(0.12)
        if r is None or r.status_code != 200:
            if r is not None and r.status_code == 429:
                time.sleep(30)
            done[doi.lower()] = None
            continue
        m = r.json().get('message', {})
        a = {(x.get('name') or '').lower(): x.get('value') for x in m.get('assertion') or [] if isinstance(x, dict)}
        rec = _assert_date(a.get('received', '') or '') if a.get('received') else None
        acc = _assert_date(a.get('accepted', '') or '') if a.get('accepted') else None
        pub = _cr_date(m.get('published-online') or {}) or _cr_date(m.get('published-print') or {})
        if not pub and a.get('published'):
            pub = _assert_date(a['published'])
        done[doi.lower()] = [jid, (acc - rec).days if rec and acc else None, (pub - acc).days if acc and pub else None,
                             (pub - rec).days if rec and pub else None]
    stats = defaultdict(lambda: [[], [], []])
    for v in done.values():
        if not v:
            continue
        for i in range(3):
            if v[i + 1] is not None and 0 <= v[i + 1] <= 1500:
                stats[v[0]][i].append(v[i + 1])

    def med(xs):
        xs = sorted(xs)
        return xs[len(xs) // 2] if xs else None
    cache['journals'] = {jid: {'n': max(len(x) for x in v), 'accept': med(v[0]), 'publish': med(v[1]), 'total': med(v[2])}
                         for jid, v in stats.items() if any(v)}
    cache['updated'] = dt.date.today().isoformat()
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(cache, f, separators=(',', ':'))
    log(f'journal times: {calls} Crossref lookups, timings for {len(cache["journals"])} journals')


def simulator_base(rows, Y):
    """Inputs for the indicator simulator (last five complete-ish years, Y-4..Y): per university the counts and
    citations by journal quartile x international collaboration, plus open access and the h-index of the window."""
    keys = ['Q1', 'Q2', 'Q3', 'Q4', '']
    per = defaultdict(lambda: {'n': [[0, 0] for _ in keys], 'c': [[0, 0] for _ in keys], 'oa': 0, 'cites': []})
    for y, us, ar, ca, q, intl, oa, conf, c in rows:
        if not y or y < Y - 4 or y > Y:
            continue
        qi = keys.index(q) if q in keys else 4
        for u in us:
            p = per[u]
            p['n'][qi][int(intl)] += 1
            p['c'][qi][int(intl)] += c
            p['oa'] += oa
            p['cites'].append(c)
    out = {}
    for u, p in per.items():
        out[u] = {'n': p['n'], 'c': p['c'], 'oa': p['oa'], 'h': h_index(p['cites']), 'docs': len(p['cites']), 'cites': sum(p['cites'])}
    return {'years': [Y - 4, Y], 'keys': keys, 'unis': out}


SRGS_API = 'https://srgs.uop.edu.jo/ar/api/get_supported_research_projects/'
SRGS_PAGE = 'https://srgs.uop.edu.jo/ar/supported_research_projects/'


def supported_projects():
    """Research projects funded by the University of Petra, from the Deanship of Scientific Research's public list
    (srgs.uop.edu.jo). The list holds every grant application, so only funded ones are kept: approved by the
    university, or (2021-2022 calls, before university approval was a step) approved by the deanship with a decision.
    Only what the public page shows is kept: title, principal investigator, faculty, department, call, decision
    date, status. Budgets, reviewers and evaluations are never stored."""
    r = http('GET', SRGS_API, tries=3, headers={'X-Requested-With': 'XMLHttpRequest', 'User-Agent': 'Mozilla/5.0'},
             params={'draw': 1, 'start': 0, 'length': -1, 'order[0][column]': 0, 'order[0][dir]': 'desc'})
    if r is None or r.status_code != 200:
        log('  ! supported projects: deanship list not reachable, kept the previous file')
        return None
    try:
        rows = r.json().get('data') or []
    except ValueError:
        return None
    test = re.compile(r'^(test|dresearch|dasdsa|admin|gfgnbjb|lxbfyeaa|zainab_test)$', re.I)
    out = []
    for x in rows:
        if not isinstance(x, list) or len(x) < 28:
            continue
        call_en, status = x[2] or '', x[14] or ''
        year = int(re.search(r'(\d{4})', call_en).group(1)) if re.search(r'(\d{4})', call_en) else None
        funded = status == 'Approved by university' or (status == 'Approved by Scientific research Deanship' and year and year <= 2022 and x[15])
        clean = lambda v: re.sub(r'\s+', ' ', html.unescape(str(v or ''))).strip().strip('"\'«»“”-– ').strip()  # noqa: E731
        t_ar, t_en = clean(x[25]), clean(x[26])
        if not funded or not (t_ar or t_en) or test.match(t_ar or t_en) or test.match((x[3] or '').strip()):
            continue
        out.append({'id': x[0], 'year': year, 't': t_ar, 'te': t_en, 'pi': clean(x[3]), 'pie': clean(x[4]),
                    'fac': clean(x[5]), 'face': clean(x[6]), 'dept': clean(x[7]), 'depte': clean(x[8]),
                    'date': (x[16] or '')[:10], 'done': str(x[27]) == '1'})
    out.sort(key=lambda p: (-(p['year'] or 0), p['t'] or p['te']))
    log(f'  supported projects: {len(out)} funded of {len(rows)} applications')
    return {'updated': dt.date.today().isoformat(), 'source': SRGS_PAGE, 'projects': out}


def sjr_by_issn():
    """ISSN -> {'q', 'areas', 'cats'} from data/research/sjr.csv (SCImago journal list, ';'-separated)."""
    out, path = {}, os.path.join(OUT, 'sjr.csv')
    if not os.path.exists(path):
        return out
    with open(path, encoding='utf-8', errors='replace') as f:
        rd = csv.reader(f, delimiter=';')
        head = next(rd)
        ix = {h: i for i, h in reversed(list(enumerate(head)))}
        for r in rd:
            g = lambda k: r[ix[k]].strip() if k in ix and ix[k] < len(r) else ''  # noqa: E731
            q = g('SJR Best Quartile')
            j = {'q': q if q in ('Q1', 'Q2', 'Q3', 'Q4') else '', 'areas': [a.strip() for a in g('Areas').split(';') if a.strip()],
                 'cats': [re.sub(r'\s*\(Q\d\)\s*$', '', c).strip() for c in g('Categories').split(';') if c.strip()]}
            for i in g('Issn').split(','):
                if i.strip() and i.strip() != '-':
                    out[i.strip().upper()] = j
    return out


def official_exports(cube):
    """{university index in cube.json: {EID: export row}} from each university's own Scopus export:
    the University of Petra's in data/research/scopus_export, the others' in data/research/universities_export.
    A file is matched to its university by the Scopus AF-ID in its name (e.g. 60064180.csv), else by the
    university's English name in its name, else by the university named on (nearly) every row."""
    unis = cube.get('unis') or []
    uidx = {u[0]: i for i, u in enumerate(unis)}
    norm = lambda t: re.sub(r'[^a-z]', '', (t or '').lower().replace('the ', ''))  # noqa: E731
    names = sorted(((norm(u[1]), i) for i, u in enumerate(unis)), key=lambda x: -len(x[0]))

    def named(text):   # the universities named in a text, a longer name winning over one it contains
        t, hit = norm(text), []
        for n, i in names:
            if n in t and not any(n in names[k][0] for k in range(len(names)) if names[k][1] in hit):
                hit.append(i)
        return hit

    out = {}
    files = [(p, uidx.get(UOP_AFID)) for p in sorted(glob.glob(os.path.join(OUT, 'scopus_export', '*.csv')))]
    files += [(p, None) for p in sorted(glob.glob(os.path.join(OUT, 'universities_export', '*.csv')))]
    for p, u in files:
        with open(p, encoding='utf-8-sig', newline='') as f:
            rows_ = [r for r in csv.DictReader(f) if r.get('EID')]
        if not rows_:
            continue
        base = os.path.basename(p)
        if u is None:
            m = re.search(r'60\d{6}', base)
            u = uidx.get(m.group(0)) if m else None
        if u is None:
            hit = named(base.rsplit('.', 1)[0].replace('_', ' '))
            u = hit[0] if len(hit) == 1 else None
        if u is None:
            votes = Counter(i for r in rows_ for i in set(named(r.get('Affiliations'))))
            if votes:
                i, n = votes.most_common(1)[0]
                u = i if n >= 0.8 * len(rows_) else None
        if u is None:
            log(f'  ! {base}: could not tell which university this export belongs to (put its Scopus AF-ID in the name)')
            continue
        got = out.setdefault(u, {})
        for r in rows_:
            got[r['EID'].replace('2-s2.0-', '')] = r
        log(f'  jordan: {base} -> {unis[u][1]}, {len(rows_)} documents')
    return out


def rebuild_jordan_cube():
    """Recompute the university comparison (jordan/cube.json and h-index rows) from jordan/docs.tsv with this
    week's citations (jordan_citations.json)."""
    d = os.path.join(OUT, 'jordan')
    path, cpath = os.path.join(d, 'docs.tsv'), os.path.join(d, 'cube.json')
    if not os.path.exists(path) or not os.path.exists(cpath):
        return
    cube = load_json(cpath, {})
    now = (CITES or {}).get('eid') or {}
    # a university with its own Scopus export is credited with exactly the documents Scopus lists under its affiliation
    # ID (as its Scopus page counts them), not with papers that only mention its name; papers in an export that the
    # file does not hold yet are added from the export
    official = official_exports(cube)
    newer = {}
    for rows_ in official.values():
        newer.update(rows_)
    rows, lines = [], []

    def keep(e, y, ul, ar, ca, q, intl, oa, conf, c):
        lines.append('\t'.join([e, str(y or ''), ','.join(map(str, ul)), ','.join(map(str, ar)), ','.join(map(str, ca)), q,
                                '1' if intl else '', '1' if oa else '', '1' if conf else '', str(c)]))
        rows.append((int(y) if y else 0, ul, ar, ca, q, bool(intl), bool(oa), bool(conf), c))

    with open(path, encoding='utf-8') as f:
        head = next(f)
        for line in f:
            e, y, us, ar, ca, q, intl, oa, conf, c = line.rstrip('\n').split('\t')
            ul = [u for u in (int(x) for x in us.split(',') if x) if u not in official or e in official[u]]
            ul += [u for u, rows_ in official.items() if e in rows_ and u not in ul]
            newer.pop(e, None)
            keep(e, y, ul, [int(x) for x in ar.split(',') if x], [int(x) for x in ca.split(',') if x], q,
                 intl == '1', oa == '1', conf == '1', int(now.get(e, c) or 0))
    if newer:
        sj = sjr_by_issn()
        aidx = {a: i for i, a in enumerate(cube.get('areas') or [])}
        cidx = {c: i for i, c in enumerate(cube.get('cats') or [])}
        for e, r in newer.items():
            issns = [x.strip().upper() for x in re.split(r'[;,\s]+', r.get('ISSN') or '') if x.strip()]
            j = next((sj[i] for i in issns if i in sj), None) or {}
            ctry = {a.rsplit(',', 1)[-1].strip() for a in (r.get('Affiliations') or '').split(';') if a.strip()}
            try:
                c = int(now.get(e, r.get('Cited by') or 0) or 0)
            except ValueError:
                c = 0
            keep(e, int(r['Year']) if (r.get('Year') or '').isdigit() else 0,
                 sorted(u for u, rows_ in official.items() if e in rows_),
                 [aidx[a] for a in j.get('areas', []) if a in aidx], [cidx[c_] for c_ in j.get('cats', []) if c_ in cidx],
                 j.get('q', ''), any(x and x != 'Jordan' for x in ctry), bool((r.get('Open Access') or '').strip()),
                 (r.get('Document Type') or '') in ('Conference paper', 'Conference review'), c)
        log(f'  jordan: {len(newer)} documents added from the universities\' own Scopus exports')
    # the pages compute their comparisons from this file, so it carries the corrected universities and this week's citations
    with open(path, 'w', encoding='utf-8') as f:
        f.write(head + '\n'.join(lines) + '\n')
    QI = {'Q1': 0, 'Q2': 1, 'Q3': 2, 'Q4': 3}

    def build(which):
        acc = defaultdict(lambda: [0] * 9)
        for y, us, ar, ca, q, intl, oa, conf, c in rows:
            y = y if y >= 1990 else 1989
            for u in us:
                for k in ([-1] if which == 'all' else ar if which == 'area' else ca):
                    v = acc[(u, y, k)]
                    v[0] += 1
                    v[1] += c
                    if q in QI:
                        v[2 + QI[q]] += 1
                    v[6] += intl
                    v[7] += oa
                    v[8] += conf
        return [[k[0], k[1], k[2]] + v for k, v in acc.items()]
    cube.update({'all': build('all'), 'area': build('area'), 'cat': build('cat'), 'cites_updated': dt.date.today().isoformat()})
    save_json(os.path.join('jordan', 'cube.json'), cube)
    upath = os.path.join(d, 'unis.json')
    unis = load_json(upath, {})
    if unis:
        Y = min(max(r[0] for r in rows), THIS_YEAR)   # next year's rows are articles in press
        tab = defaultdict(list)
        for y, us, ar, ca, q, intl, oa, conf, c in rows:
            for u in us:
                for span in ('all', '10', '5'):
                    if span != 'all' and not (y and y > Y - int(span)):
                        continue
                    tab[(u, span, -1)].append(c)
                    for a in ar:
                        tab[(u, span, a)].append(c)
        unis['h'] = [[u, s_, k, h_index(c)] for (u, s_, k), c in tab.items()]
        unis['sim'] = simulator_base(rows, Y)
        save_json(os.path.join('jordan', 'unis.json'), unis)
    log(f'jordan comparison rebuilt from {len(rows)} documents')


def scopus_universities(prev):
    """Weekly Scopus profile of every Jordanian university: documents per year, open access, subject areas, h-index.
    About 50 requests per university (≈1,500 a week, well inside the free key's 20,000 weekly quota)."""
    if not SCOPUS_KEY:
        return (prev or {}).get('scopus_universities') or []
    old = {u['afid']: u for u in (prev or {}).get('scopus_universities') or []}
    out, years = [], range(THIS_YEAR - 14, THIS_YEAR + 1)
    for afid, name, ar in JO_SCOPUS:
        base = f'AF-ID({afid})'
        total = scopus_count(base)
        if total is None:   # quota or access problem: keep last week's figures
            if afid in old:
                out.append(old[afid])
            continue
        by_year = {}
        for y in years:
            n = scopus_count(f'{base} AND PUBYEAR IS {y}')
            if n is not None:
                by_year[str(y)] = n
        oa = scopus_count(f'{base} AND OPENACCESS(1)')
        subj = {}
        for code in SUBJ:
            n = scopus_count(f'{base} AND SUBJAREA({code})')
            if n:
                subj[code] = n
        cu = (CITES.get('universities') or {}).get(afid) or {}
        h = cu.get('h') if cu else scopus_h_index(afid)
        out.append({'afid': afid, 'name': name, 'name_ar': ar, 'docs': total, 'by_year': by_year,
                    'cites': cu.get('cites'), 'cpd': round(cu['cites'] / cu['docs'], 2) if cu.get('docs') else None,
                    'cited_share': cu.get('cited_share'),
                    'oa_share': round(oa / total, 3) if oa is not None and total else None,
                    'subjects': sorted(subj.items(), key=lambda x: -x[1]), 'h': h if h is not None else (old.get(afid) or {}).get('h')})
        log(f'  scopus {name}: {total} documents, h {h}')
    log(f'scopus universities: {len(out)} universities, {SC_BUDGET["used"]} requests, quota left {SC_BUDGET["remaining"]}')
    return out


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


def name_simple(tok):
    """A spelling-tolerant form of one Latin-script Arabic name part: Nasser/Naser, Al Jamal/Jamal, Muna/Mona, Mater/Matar."""
    t = re.sub(r'^(al|el)(?=[a-z]{3,})', '', tok)
    for a, b in (('ou', 'u'), ('oo', 'u'), ('ee', 'i'), ('ei', 'i'), ('ph', 'f'), ('q', 'k'), ('e', 'a'), ('o', 'u'), ('y', 'i'), ('dh', 'd'), ('th', 't')):
        t = t.replace(a, b)
    return re.sub(r'(.)\1+', r'\1', t)


def name_parts_match(staff, scopus):
    """Same first name and surname after spelling normalisation; Scopus usually drops the middle names
    ("Naser Jamal" for "Nasser Mustafa Al Jamal")."""
    a, b = [name_simple(x) for x in name_key(staff).split()], [name_simple(x) for x in name_key(scopus).split()]
    if len(a) < 2 or len(b) < 2 or a[0] != b[0] or b[-1] not in a[1:]:
        return False
    return a[-1] == b[-1] or len(b) == 2 or all(x in a for x in b)


def match_scopus(name, pool):
    """Scopus IDs for a staff name (English) among the university's Scopus authors, and how they were found."""
    if not name or not pool:
        return [], ''
    nk = name_key(name)
    strong, loose = [], []
    for sid, p in pool.items():
        full = max(difflib.SequenceMatcher(None, nk, name_key(n)).ratio() for n in p['names'])
        fl = max(name_score(name, n, last_only=True) for n in p['names'])
        if full >= 0.86:
            strong.append((full, p['docs'], sid))
        elif fl >= 0.92:
            loose.append((fl, p['docs'], sid))
    if strong:
        return [x[2] for x in sorted(strong, reverse=True)][:3], 'name'
    if loose:
        return [sorted(loose, reverse=True)[0][2]], 'name~'
    parts = [sid for sid, p in pool.items() if any(name_parts_match(name, n) for n in p['names'])]
    if len(parts) == 1:
        return parts, 'name≈'
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
# ------------------------------------------------------------------------------- document details
DETAIL_SHARDS = 64


def detail_shard(wid):
    """FNV-1a over the id, so the page computes the same file number (assets/rs-doc.js)."""
    h = 2166136261
    for ch in str(wid):
        h = ((h ^ ord(ch)) * 16777619) & 0xFFFFFFFF
    return h % DETAIL_SHARDS


def oa_abstract(inv):
    """OpenAlex keeps abstracts as an inverted index (word -> positions)."""
    if not isinstance(inv, dict) or not inv:
        return ''
    pos = {}
    for word, idx in inv.items():
        for i in idx or []:
            pos[i] = word
    return ' '.join(pos[i] for i in sorted(pos))


def clip(s, n):
    s = re.sub(r'\s+', ' ', html.unescape(str(s or ''))).strip()
    return s if len(s) <= n else s[:n].rsplit(' ', 1)[0] + ' …'


def split_list(s, sep=';'):
    return [x.strip() for x in html.unescape(str(s or '')).split(sep) if x.strip()]


def oa_detail(w, rid_by_oa):
    """Everything the document page shows that OpenAlex knows about a work."""
    loc = w.get('primary_location') or {}
    src = loc.get('source') or {}
    bib = w.get('biblio') or {}
    authors, insts = [], {}
    for a in w.get('authorships') or []:
        if not isinstance(a, dict):
            continue
        au = a.get('author') or {}
        aff = []
        for inst in a.get('institutions') or []:
            nm = (inst or {}).get('display_name')
            if not nm:
                continue
            iid = (inst.get('id') or '').split('/')[-1]
            insts.setdefault(nm, {'n': nm, 'cc': inst.get('country_code') or '', 'id': iid, 'uop': iid == UOP_OA})
            aff.append(nm)
        if not aff:
            aff = [clip(x, 200) for x in (a.get('raw_affiliation_strings') or [])[:2]]
        aid = (au.get('id') or '').split('/')[-1]
        authors.append({'n': au.get('display_name') or a.get('raw_author_name') or '', 'aff': aff,
                        'orcid': orcid_id(au.get('orcid') or ''), 'oa': aid, 'rid': rid_by_oa.get(aid, ''),
                        'corr': bool(a.get('is_corresponding')), 'uop': any(insts.get(x, {}).get('uop') for x in aff)})
    topics = []
    for t in (w.get('topics') or [])[:3]:
        topics.append({'t': t.get('display_name', ''), 'sf': (t.get('subfield') or {}).get('display_name', ''),
                       'f': (t.get('field') or {}).get('display_name', ''), 'd': (t.get('domain') or {}).get('display_name', ''),
                       's': round(t.get('score') or 0, 2)})
    ids = w.get('ids') or {}
    fp, lp = bib.get('first_page') or '', bib.get('last_page') or ''
    return {
        'abs': clip(oa_abstract(w.get('abstract_inverted_index')), 4000), 'abs_src': 'OpenAlex',
        'kw': [k.get('display_name') for k in (w.get('keywords') or []) if k.get('display_name')][:12],
        'authors': authors, 'insts': list(insts.values()), 'topics': topics,
        'sdg': [{'n': x.get('display_name'), 's': round(x.get('score') or 0, 2)} for x in (w.get('sustainable_development_goals') or []) if x.get('display_name')],
        'vol': bib.get('volume') or '', 'iss': bib.get('issue') or '', 'pages': f'{fp}–{lp}' if fp and lp and fp != lp else fp,
        'issn': src.get('issn') or ([src['issn_l']] if src.get('issn_l') else []), 'pub': src.get('host_organization_name') or '',
        'lang': w.get('language') or '', 'date': w.get('publication_date') or '', 'refs': w.get('referenced_works_count'),
        'cby': sorted([[c['year'], c.get('cited_by_count', 0)] for c in (w.get('counts_by_year') or []) if c.get('year')]),
        'pmid': (ids.get('pmid') or '').split('/')[-1], 'land': loc.get('landing_page_url') or '', 'lic': loc.get('license') or '',
        'pdf': loc.get('pdf_url') or '', 'doaj': True if src.get('is_in_doaj') else '',
    }


def scopus_detail(row, sid_to_rid):
    """Details from a Scopus export row (or the API's standard view, which carries fewer fields)."""
    authors = []
    full = split_list(row.get('Author full names'))
    affs = split_list(row.get('Authors with affiliations'))
    for i, a in enumerate(full or split_list(row.get('Authors'))):
        m = re.match(r'(.*?)\s*\((\d+)\)\s*$', a)
        name, sid = (m.group(1), m.group(2)) if m else (a, '')
        if ',' in name:
            last, first = name.split(',', 1)
            name = f'{first.strip()} {last.strip()}'
        aff = affs[i].split(',', 1)[1].strip() if i < len(affs) and ',' in affs[i] else ''
        authors.append({'n': name, 'sc': sid, 'aff': [aff] if aff else [], 'rid': sid_to_rid.get(sid, ''),
                        'uop': 'petra' in aff.lower()})
    ps, pe = (row.get('Page start') or '').strip(), (row.get('Page end') or '').strip()
    return {
        'abs': clip(row.get('Abstract'), 4000) if (row.get('Abstract') or '').strip() not in ('', '[No abstract available]') else '',
        'abs_src': 'Scopus', 'kw_a': split_list(row.get('Author Keywords'))[:15], 'kw_i': split_list(row.get('Index Keywords'))[:15],
        'sc_authors': authors, 'vol': row.get('Volume') or '', 'iss': row.get('Issue') or '', 'art': row.get('Art. No.') or '',
        'pages': f'{ps}–{pe}' if ps and pe else ps, 'issn': split_list(row.get('ISSN'), ';'), 'isbn': split_list(row.get('ISBN')),
        'pub': row.get('Publisher') or '', 'lang': row.get('Language of Original Document') or '',
        'fund': split_list(row.get('Funding Details'))[:12], 'fund_txt': clip(row.get('Funding Texts') or row.get('Funding Text 1'), 1500),
        'conf': row.get('Conference name') or '', 'stage': row.get('Publication Stage') or '', 'sc_type': row.get('Document Type') or '',
        'sc_oa': row.get('Open Access') or '', 'pmid': row.get('PubMed ID') or '', 'sc_link': row.get('Link') or '',
        'corr': clip(row.get('Correspondence Address'), 300),
    }


def wos_detail(row):
    """Details from a Web of Science full record (tab-delimited export)."""
    authors, by_name = [], {}
    for m in re.finditer(r'\[([^\]]+)\]\s*([^\[]+)', row.get('C1') or ''):
        addr = m.group(2).strip().rstrip(';').strip()
        for nm in m.group(1).split(';'):
            by_name.setdefault(nm.strip(), []).append(addr)
    for nm in split_list(row.get('AF') or row.get('AU')):
        disp = nm
        if ',' in nm:
            last, first = nm.split(',', 1)
            disp = f'{first.strip()} {last.strip()}'
        aff = by_name.get(nm, [])
        authors.append({'n': disp, 'aff': aff[:3], 'uop': any('petra' in a.lower() for a in aff)})
    bp, ep = (row.get('BP') or '').strip(), (row.get('EP') or '').strip()
    try:
        nr = int((row.get('NR') or '').strip())
    except ValueError:
        nr = None
    return {
        'abs': clip(row.get('AB'), 4000), 'abs_src': 'Web of Science', 'kw_a': split_list(row.get('DE'))[:15],
        'kw_plus': split_list(row.get('ID'))[:15], 'wos_authors': authors, 'vol': (row.get('VL') or '').strip(),
        'iss': (row.get('IS') or '').strip(), 'art': (row.get('AR') or '').strip(), 'pages': f'{bp}–{ep}' if bp and ep else bp,
        'pub': (row.get('PU') or '').strip().title(), 'lang': (row.get('LA') or '').strip(), 'refs': nr,
        'fund': split_list(row.get('FU'))[:12], 'fund_txt': clip(row.get('FX'), 1500), 'wos_cat': split_list(row.get('WC')),
        'wos_area': split_list(row.get('SC')), 'wos_index': split_list(row.get('WE')), 'pmid': (row.get('PM') or '').strip(),
        'wos_type': (row.get('DT') or '').strip(), 'conf': (row.get('CT') or '').strip(), 'pdate': (row.get('PD') or '').strip(),
        'issn': [x for x in [(row.get('SN') or '').strip(), (row.get('EI') or '').strip()] if x],
        'rp': clip(re.sub(r'\(corresponding author\)', '', row.get('RP') or ''), 300),
        'z9': (row.get('Z9') or '').strip(), 'u2': (row.get('U2') or '').strip(), 'wos_oa': (row.get('OA') or '').strip(),
    }


def merge_detail(store, key, d):
    cur = store.setdefault(key, {})
    rank = {'Scopus': 3, 'Web of Science': 2, 'OpenAlex': 1}   # the reference databases' abstracts first
    if d.get('abs') and (not cur.get('abs') or rank.get(d.get('abs_src'), 0) > rank.get(cur.get('abs_src'), 0)):
        cur['abs'], cur['abs_src'] = d['abs'], d.get('abs_src', '')
    for k, v in d.items():
        if v in ('', None, [], {}) or k in ('abs', 'abs_src'):
            continue
        if k not in cur or cur[k] in ('', None, [], {}):
            cur[k] = v


# ------------------------------------------------------------------------------- manual edits and the full export
# One row per document. Columns marked (read only) always come from the databases and are ignored on import.
DOC_COLS = [
    ('id', 'id'), ('title', 't'), ('year', 'y'), ('type', 'type'), ('venue', 'v'), ('quartile', 'q'),
    ('volume', 'vol'), ('issue', 'iss'), ('pages', 'pages'), ('publisher', 'pub'), ('issn', 'issn'), ('language', 'lang'),
    ('doi', 'doi'), ('scopus_eid', 'eid'), ('wos_ut', 'ut'), ('url', 'url'), ('open_access', 'oa'),
    ('uop_researchers', 'r'), ('uop_names (read only)', None), ('authors', 'authors'), ('affiliations', 'affs'),
    ('author_keywords', 'kw_a'), ('keywords_plus', 'kw_plus'), ('abstract', 'abs'), ('funding', 'fund'),
    ('scopus_citations (read only)', None), ('wos_citations (read only)', None), ('openalex_citations (read only)', None),
    ('fwci (read only)', None), ('sources (read only)', None), ('wos_categories (read only)', None), ('topic (read only)', None),
    ('openalex_id (read only)', None), ('details_page (read only)', None), ('hide', 'hide'), ('note', 'note'),
]
WORK_FIELDS = {'t', 'y', 'type', 'v', 'q', 'doi', 'eid', 'ut', 'url', 'oa'}
LIST_FIELDS = {'issn', 'authors', 'affs', 'kw_a', 'kw_plus', 'fund'}
DOC_AR = {'id': 'المعرّف', 'title': 'العنوان', 'year': 'السنة', 'type': 'النوع', 'venue': 'المجلة أو المؤتمر', 'quartile': 'تصنيف المجلة Q', 'volume': 'المجلد', 'issue': 'العدد', 'pages': 'الصفحات', 'publisher': 'الناشر', 'issn': 'ISSN', 'language': 'اللغة', 'doi': 'DOI', 'scopus_eid': 'رقم Scopus EID', 'wos_ut': 'رقم WoS UT', 'url': 'رابط', 'open_access': 'الوصول المفتوح', 'uop_researchers': 'باحثو البترا (البريد الجامعي)', 'uop_names (read only)': 'أسماء باحثي البترا', 'authors': 'المؤلفون', 'affiliations': 'الانتماءات', 'author_keywords': 'الكلمات المفتاحية', 'keywords_plus': 'كلمات الفهرسة', 'abstract': 'الملخص', 'funding': 'التمويل', 'scopus_citations (read only)': 'اقتباسات Scopus', 'wos_citations (read only)': 'اقتباسات WoS', 'openalex_citations (read only)': 'اقتباسات OpenAlex', 'fwci (read only)': 'FWCI', 'sources (read only)': 'المصادر', 'wos_categories (read only)': 'فئات WoS', 'topic (read only)': 'الموضوع', 'openalex_id (read only)': 'معرّف OpenAlex', 'details_page (read only)': 'صفحة التفاصيل', 'hide': 'إخفاء', 'note': 'ملاحظة'}


def doc_header(col):
    """Arabic header with the English key in brackets; read-only columns say so."""
    ro = col.endswith(' (read only)')
    return f'{DOC_AR.get(col, col)}{" – للقراءة فقط" if ro else ""} ({col.replace(" (read only)", "")})'


def doc_key(header):
    """Column key from a header: the English name in brackets, or the header itself."""
    m = re.search(r'\(([^()]+)\)\s*$', header or '')
    key = (m.group(1) if m else header or '').strip()
    ro = {c.replace(' (read only)', ''): c for c, _ in DOC_COLS}
    return ro.get(key, key)


SITE_URL = os.environ.get('SITE_URL', 'https://marafah.github.io/uopstaff/')


def manual_rows():
    """data/research/manual/*.csv: rows edited or added by hand (same columns as export/documents.csv)."""
    rows = []
    for path in sorted(glob.glob(os.path.join(OUT, 'manual', '*.csv'))):
        with open(path, encoding='utf-8-sig', newline='') as f:
            for row in csv.DictReader(f):
                row = {doc_key(k): (v or '').strip() for k, v in row.items() if k}
                if any(row.get(c) for c, f_ in DOC_COLS if f_):
                    rows.append(row)
    if rows:
        log(f'manual edits: {len(rows)} rows')
    return rows


def apply_manual(rows, all_works, DET, researchers, title_index):
    """Manual rows fix or add documents: a filled cell replaces the database value, `uop_researchers` (staff e-mails)
    attributes the document to staff, `hide` = yes removes it. Returns the keys to hide."""
    if not rows:
        return set()
    rid_by_email = {(r.get('email') or '').lower(): r['id'] for r in researchers if r.get('email')}
    by_rid = {r['id']: r for r in researchers}
    index = {}
    for k, w in all_works.items():
        for f in ('id', 'eid', 'ut', 'oid'):
            if w.get(f):
                index[str(w[f]).lower()] = k
        if w.get('doi'):
            index['doi:' + w['doi'].lower()] = k
    hidden, edited, added = set(), 0, 0
    for row in rows:
        doi = clean_doi(row.get('doi'))
        key = next((index[x] for x in [row.get('id', '').lower(), 'doi:' + doi.lower() if doi else '',
                                         row.get('scopus_eid', '').lower(), row.get('wos_ut', '').lower()] if x and x in index), None)
        if key is None:
            if not row.get('title'):
                continue
            nt = norm_title(row['title'])
            key = title_index.get(nt + row.get('year', ''))
        if key is None:   # a new document
            mid = 'm' + hashlib.md5((row.get('title', '') + row.get('year', '')).encode()).hexdigest()[:10]
            key = 'd:' + doi if doi else 'm:' + mid
            all_works[key] = {'id': mid, 't': row['title'], 'src': 'm', 'r': [], 'c': 0, 'nt': norm_title(row['title'])}
            title_index.setdefault(norm_title(row['title']) + row.get('year', ''), key)
            added += 1
        else:
            edited += 1
        w = all_works[key]
        if row.get('hide', '').lower() in ('yes', 'y', '1', 'true', 'نعم', 'x'):
            hidden.add(key)
            continue
        changed = []
        for col, f in DOC_COLS:
            val = row.get(col, '')
            if not f or f in ('id', 'hide') or not val:
                continue
            if f == 'r':
                rids = [rid_by_email.get(e.strip().lower()) for e in re.split(r'[;,\s]+', val) if e.strip()]
                for rid in filter(None, rids):
                    if rid not in w['r']:
                        w['r'].append(rid)
                        changed.append('r')
                    if key not in by_rid[rid]['_keys']:
                        by_rid[rid]['_keys'].append(key)
                continue
            if f == 'note':
                DET.setdefault(key, {})['note'] = val
                continue
            if f in WORK_FIELDS:
                v = clean_doi(val) if f == 'doi' else (int(val) if f == 'y' and val.isdigit() else val)
                if f == 'q':
                    v = v.upper()
                if w.get(f) != v:
                    w[f] = v
                    changed.append(f)
                continue
            d = DET.setdefault(key, {})
            if f in LIST_FIELDS:
                items = [x.strip() for x in val.split(';') if x.strip()]
                if f == 'authors':
                    if [a.get('n') for a in d.get('authors') or []] != items:
                        d['authors'] = [{'n': n, 'aff': []} for n in items]
                        w['au'] = ', '.join(items[:8]) + (' …' if len(items) > 8 else '')
                        changed.append(f)
                elif d.get(f) != items:
                    d[f] = items
                    changed.append(f)
            elif d.get(f) != val:
                d[f] = val
                if f == 'abs':
                    d['abs_src'] = 'إدخال يدوي'
                changed.append(f)
        if changed:
            w['man'] = 1   # shown on the pages as a manual correction
    log(f'manual edits: {edited} documents matched, {added} added, {len(hidden)} hidden')
    return hidden


def export_documents(works_out, merged, researchers):
    """data/research/export/documents.csv: every document with all its details, for Excel (UTF-8 with BOM)."""
    email = {r['id']: r.get('email', '') for r in researchers}
    name = {r['id']: r.get('name', '') for r in researchers}
    path = os.path.join(OUT, 'export')
    os.makedirs(path, exist_ok=True)
    with open(os.path.join(path, 'documents.csv'), 'w', encoding='utf-8-sig', newline='') as f:
        wr = csv.writer(f)
        wr.writerow([doc_header(c) for c, _ in DOC_COLS])
        for w in works_out:
            d = merged.get(w['id'], {})
            auth = d.get('authors') or d.get('sc_authors') or d.get('wos_authors') or []
            affs = list(dict.fromkeys(a for x in auth for a in x.get('aff') or []))
            val = {
                'id': w['id'], 'title': w.get('t', ''), 'year': w.get('y', ''), 'type': w.get('type', ''), 'venue': w.get('v', ''),
                'quartile': w.get('q', ''), 'volume': d.get('vol', ''), 'issue': d.get('iss', ''), 'pages': d.get('pages') or d.get('art', ''),
                'publisher': d.get('pub', ''), 'issn': '; '.join(d.get('issn') or ([w['issn']] if w.get('issn') else [])),
                'language': d.get('lang', ''), 'doi': w.get('doi', ''), 'scopus_eid': w.get('eid', ''), 'wos_ut': w.get('ut', ''),
                'url': w.get('url', ''), 'open_access': w.get('oa', ''),
                'uop_researchers': '; '.join(email.get(r, '') for r in w.get('r', []) if email.get(r)),
                'uop_names (read only)': '; '.join(name.get(r, '') for r in w.get('r', []) if name.get(r)),
                'authors': '; '.join(a.get('n', '') for a in auth) or w.get('au', ''), 'affiliations': '; '.join(affs),
                'author_keywords': '; '.join(d.get('kw_a') or d.get('kw') or []), 'keywords_plus': '; '.join(d.get('kw_plus') or d.get('kw_i') or []),
                'abstract': d.get('abs') or d.get('uop_abs', ''), 'funding': '; '.join(d.get('fund') or []),
                'scopus_citations (read only)': w.get('sc', ''), 'wos_citations (read only)': w.get('wc', ''),
                'openalex_citations (read only)': w.get('c', '') if 'o' in w.get('src', '') else '', 'fwci (read only)': w.get('fwci', ''),
                'sources (read only)': w.get('src', ''), 'wos_categories (read only)': '; '.join(d.get('wos_cat') or []),
                'topic (read only)': w.get('topic', ''), 'openalex_id (read only)': w.get('oid', ''),
                'details_page (read only)': f'{SITE_URL}publication.html?id={w["id"]}', 'hide': '', 'note': d.get('note', ''),
            }
            wr.writerow([val.get(c, '') for c, _ in DOC_COLS])
    log(f'export: {len(works_out)} documents in export/documents.csv')


MONTHS_EN = {m: i + 1 for i, m in enumerate(['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'])}


def wos_month(pdate, year):
    """Web of Science 'PD' field ("NOV 2025", "NOV 15", "SPR") -> 'YYYY-MM' or ''."""
    if not pdate or not year:
        return ''
    m = MONTHS_EN.get(str(pdate).strip().upper()[:3])
    return f'{year}-{m:02d}' if m else ''


def track_months(works_out, details):
    """Monthly faculty reports (reports.html): when each work first appeared ('fs'), its publication date ('pd'),
    and a citation snapshot per month (data/research/cites_monthly.json) so the report can show citations gained."""
    today = dt.date.today().isoformat()
    path = os.path.join(OUT, 'first_seen.json')
    first = load_json(path, None)
    boot = first is None   # first run: date existing works by their publication date, not by today
    first = first or {}
    for w in works_out:
        d = details.get(w['id']) or {}
        pd = (d.get('date') or '')[:10] or wos_month(d.get('pdate'), w.get('y'))
        if pd and len(pd) >= 7 and (not w.get('y') or pd[:4] == str(w['y'])):
            w['pd'] = pd
        else:
            pd = ''
        if w.get('y') and first.get(w['id']) == f"{w['y']}-01-01":
            first[w['id']] = pd   # undo the old bootstrap guess (year only -> January)
        if w['id'] not in first:
            first[w['id']] = (pd or '') if boot else today   # first run: an unknown month stays unknown, not January
        if first[w['id']]:
            w['fs'] = first[w['id']]
    save_json('first_seen.json', first)
    cpath = os.path.join(OUT, 'cites_monthly.json')
    cm = load_json(cpath, {}) or {}
    month = today[:7]
    cm[month] = {w['id']: [w.get('sc') or 0, w.get('c') or 0, w.get('wc') or 0] for w in works_out}
    for k in sorted(cm)[:-14]:   # keep about a year of snapshots
        cm.pop(k)
    with open(cpath, 'w', encoding='utf-8') as f:
        json.dump(cm, f, separators=(',', ':'))
    log(f'monthly tracking: {len(first)} works, snapshots for {", ".join(sorted(cm))}')


def save_details(works_out, details, prev_dir):
    """data/research/details/<n>.json: one small file per shard, read only by the document page."""
    ddir = os.path.join(OUT, 'details')
    os.makedirs(ddir, exist_ok=True)
    old = {}
    for path in glob.glob(os.path.join(prev_dir, '*.json')):
        old.update(load_json(path, {}) or {})
    shards = defaultdict(dict)
    for w in works_out:
        d = dict(details.get(w.get('_key'), {}))
        for k, v in (old.get(w['id']) or {}).items():   # keep what an earlier run knew (e.g. when OpenAlex was limited)
            if k not in d or d[k] in ('', None, [], {}):
                d[k] = v
        if d:
            shards[detail_shard(w['id'])][w['id']] = d
    merged = {}
    for n in range(DETAIL_SHARDS):
        merged.update(shards.get(n, {}))
    for n in range(DETAIL_SHARDS):
        with open(os.path.join(ddir, f'{n}.json'), 'w', encoding='utf-8') as f:
            json.dump(shards.get(n, {}), f, ensure_ascii=False, separators=(',', ':'))
    log(f'details: {sum(len(x) for x in shards.values())} documents in {DETAIL_SHARDS} files')
    return merged


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
    DET = {}   # work key -> details for the document page
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
            try:
                merge_detail(DET, key, oa_detail(w, {a: rid for a in oa_ids}))
            except Exception as e:  # noqa: BLE001  (details are extra; never lose the work for them)
                log(f'  ! details {wid}: {e}')
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
                if p.get('abs'):
                    merge_detail(DET, key, {'uop_abs': p['abs']})
            else:
                rec = {'id': f'u{p["uop_id"]}', 't': p['t'][:400], 'y': p['y'], 'v': p['v'], 'type': p['type'], 'doi': p['doi'],
                       'url': p['url'], 'c': 0, 'oa': '', 'au': p['au'], 'src': 'u', 'nt': nt, 'pub': p['pub'],
                       'vol': p['vol'], 'pages': p['pages'], 'sdg': [s for s in p['sdg'] if s][:3]}
                key = 'd:' + p['doi'] if p['doi'] else 'u:' + str(p['uop_id'])
                my_keys.append(add_work(key, rec, rid))
                if p.get('abs'):
                    merge_detail(DET, key, {'uop_abs': p['abs']})

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
    seen_eid, uniq = {}, []
    for row in sc_rows:   # several exports may overlap: keep one row, but join what each one knows
        k = row.get('EID') or norm_title(row.get('Title')) + str(row.get('Year'))
        if k not in seen_eid:
            seen_eid[k] = row
            uniq.append(row)
            continue
        first = seen_eid[k]   # the API's standard view has no author lists; the CSV export does
        ids = [x.strip() for x in re.split(r'[;,]', (first.get('Author(s) ID') or '') + ';' + (row.get('Author(s) ID') or '')) if x.strip()]
        first['Author(s) ID'] = ';'.join(dict.fromkeys(ids))
        for f in ('Authors', 'Author full names', 'Authors with affiliations', 'ISSN', 'DOI', 'Document Type'):
            if not (first.get(f) or '').strip() and (row.get(f) or '').strip():
                first[f] = row[f]
    sc_rows = uniq
    sc_pool = scopus_author_pool(sc_rows)
    for sid, v in saved_pool.items():   # names learned from earlier full exports stay usable for matching
        p = sc_pool.setdefault(sid, {'names': set(), 'docs': 0})
        p['names'] |= set(v.get('names', []))
        p['docs'] = max(p['docs'], v.get('docs', 0))
    if sc_pool:
        save_json('scopus_authors.json', {sid: {'names': sorted(v['names']), 'docs': v['docs']} for sid, v in sc_pool.items()})
    quart = sjr_quartiles()
    sc_over = {k.lower(): v.get('scopus') for k, v in (load_json(os.path.join(OUT, 'overrides.json'), {}) or {}).items()
               if not k.startswith('_') and isinstance(v, dict) and v.get('scopus')}
    for r in researchers:   # Scopus author IDs: a manual override, the staff-page link, then the name among the university's Scopus authors
        ov = sc_over.get((r.get('email') or '').lower()) or sc_over.get((r.get('uid') or '').lower())
        ids = [str(x) for x in ov] if ov else ([r['scopus_id']] if r['scopus_id'] else [])
        how = 'manual' if ov else 'link' if ids else ''
        if not ids:
            ids, how = match_scopus(r['name_en'], sc_pool)
        r['scopus_ids'], r['scopus_match'] = ids, how
    claimed = {}   # an ID found only by a name may not also belong to another researcher
    for r in researchers:
        for sid in r['scopus_ids']:
            claimed.setdefault(sid, []).append(r)
    for sid, rs in claimed.items():
        if len(rs) > 1:
            for r in rs:
                if r['scopus_match'] in ('name~', 'name≈') and any(x['scopus_match'] in ('manual', 'link', 'name') for x in rs if x is not r):
                    r['scopus_ids'] = [x for x in r['scopus_ids'] if x != sid]
    sid_to_rid = {sid: r['id'] for r in researchers for sid in r['scopus_ids']}
    by_rid = {r['id']: r for r in researchers}
    HIDDEN = apply_manual(manual_rows(), all_works, DET, researchers, title_index)

    def drop_hidden():
        for r_ in researchers:
            r_['_keys'] = [k for k in r_['_keys'] if k not in HIDDEN]
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
        merge_detail(DET, key, scopus_detail(row, sid_to_rid))
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
    drop_hidden()
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
            merge_detail(DET, key, wos_detail(row))
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
        drop_hidden()
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
        # a few dozen profiles a week, slowly: every profile is refreshed about once a month and Scholar sees
        # far fewer requests (it blocks bursts, not a handful of visits)
        todo = todo[:int(os.environ.get('SCHOLAR_MAX', '0') or 0) or (len(todo) if SERPAPI_KEY else 40)]
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
    drop_hidden()
    for k in HIDDEN:
        all_works.pop(k, None)
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
    for key, w in all_works.items():
        w.pop('nt', None)
        works_out.append({k: v for k, v in w.items() if v not in ('', None, [])})
        works_out[-1]['_key'] = key
        if DET.get(key):
            works_out[-1]['det'] = 1   # the document page has more to show
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
    if not args.limit and not args.only:
        merged = save_details(works_out, DET, os.path.join(OUT, 'details'))
        export_documents(works_out, merged, researchers)
        track_months(works_out, merged)
    for w in works_out:
        w.pop('_key', None)
    save_json('works.json', {'updated': now, 'works': works_out})
    if not QUICK and not args.limit and not args.only and os.path.exists(os.path.join(OUT, 'jordan', 'journal_dois.json')):
        try:
            journal_times()
        except Exception as e:  # noqa: BLE001  (an extra; never fail the run for it)
            log(f'  ! journal times: {e}')
    if QUICK:
        log('quick run: universities and Jordan-wide citations kept from the weekly run')
        if not args.limit and not args.only:   # still rebuild the comparison locally from the cached citations (no API calls)
            CITES.update(load_json(os.path.join(OUT, 'jordan_citations.json'), {}) or {})
            try:
                rebuild_jordan_cube()
            except Exception as e:  # noqa: BLE001
                log(f'  ! jordan comparison: {e}')
    if not args.limit and not args.only:   # funded projects (deanship list): small, refreshed on every run
        try:
            sp = supported_projects()
            if sp:
                save_json('projects.json', sp)
        except Exception as e:  # noqa: BLE001
            log(f'  ! supported projects: {e}')
        try:   # research integrity (integrity.json): retracted papers (Scopus API + Retraction Watch) and discontinued journals
            import research_integrity
            research_integrity.main()
        except Exception as e:  # noqa: BLE001
            log(f'  ! research integrity: {e}')
        try:   # external collaboration (collab.json): local files only
            import research_collab
            research_collab.main()
        except Exception as e:  # noqa: BLE001
            log(f'  ! external collaboration: {e}')
    if not args.skip_unis and not args.limit and not args.only and not QUICK:
        cpath = os.path.join(OUT, 'jordan_citations.json')
        CITES.update(jordan_citations(cpath))
        if CITES:
            with open(cpath, 'w', encoding='utf-8') as f:   # compact: ~3 MB for every Jordanian document
                json.dump(CITES, f, separators=(',', ':'))
        try:
            rebuild_jordan_cube()
        except Exception as e:  # noqa: BLE001
            log(f'  ! jordan comparison: {e}')
        prev_u = load_json(os.path.join(OUT, 'universities.json'), {}) or {}
        save_json('universities.json', {'updated': now, 'uop': UOP_OA, 'uop_afid': UOP_AFID, 'universities': universities(),
                                         'scopus_universities': scopus_universities(prev_u), 'subjects': SUBJ})


if __name__ == '__main__':
    main()
