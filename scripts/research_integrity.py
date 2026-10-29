#!/usr/bin/env python3
"""Research integrity for every Jordanian university: retracted papers and papers in journals that Scopus discontinued.

Writes data/research/integrity.json for integrity.html.

Sources (each record keeps a link to its source so every number can be checked):
  1. Scopus, retracted documents with a Jordanian affiliation: AFFILCOUNTRY(jordan) AND DOCTYPE(tb)
       - data/research/retractions/scopus_*.csv  (Scopus web export, all fields: the most complete record)
       - refreshed on every run through the Scopus Search API when SCOPUS_API_KEY is set; new retractions are
         appended to retractions/scopus_api.csv, so the page follows Scopus week by week
  2. Retraction Watch database (Crossref, open): reason, date and notice of each retraction
       - downloaded on every run from api.labs.crossref.org; the Jordanian rows are kept in
         retractions/retraction_watch_jordan.csv (also the fallback when the download fails)
  3. The Scopus exports of the Jordanian universities (universities_export/, scopus_export/): which university each
     document belongs to (Scopus affiliation ID), how many documents each university has, and the journals
  4. The official Scopus Source List (scopus_flags.json): journals Scopus discontinued, and since when
  5. researchers.json (University of Petra profiles) and jordan/experts.json (Jordanian authors in Scopus)

Usage:  python scripts/research_integrity.py            (network optional)
        OFFLINE=1 python scripts/research_integrity.py  (local files only)
"""
from __future__ import annotations

import collections
import csv
import datetime as dt
import glob
import io
import json
import os
import re
import sys
import time
import unicodedata

csv.field_size_limit(1 << 30)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'research')
RET = os.path.join(OUT, 'retractions')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from jordan_observatory import UNIS  # noqa: E402  (AF-ID, English, Arabic, affiliation pattern)

OFFLINE = os.environ.get('OFFLINE', '0') == '1'
SCOPUS_KEY = os.environ.get('SCOPUS_API_KEY', '')
SCOPUS_TOKEN = os.environ.get('SCOPUS_INSTTOKEN', '')
MAILTO = os.environ.get('OPENALEX_MAILTO', 'mohammad.arafah@uop.edu.jo')
RW_URL = f'https://api.labs.crossref.org/data/retractionwatch?{MAILTO}'
QUERY = 'AFFILCOUNTRY(jordan) AND DOCTYPE(tb)'

# public (government) universities; the others are private
PUBLIC = {'60064180', '60051534', '60044065', '60044088', '60062395', '60035301', '60036479', '60105841', '60035155',
          '60070287', '60108351'}
PAT = [(a, re.compile(p, re.I)) for a, _, _, p in UNIS]
UIDX = {a: i for i, (a, *_rest) in enumerate(UNIS)}


def log(*a):
    print(*a, flush=True)


def read_csv(path):
    with open(path, encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


def load_json(path, default=None):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def norm_doi(d):
    d = (d or '').strip().lower()
    d = re.sub(r'^https?://(dx\.)?doi\.org/', '', d)
    return d.rstrip('.') if d.startswith('10.') else ''


def unis_in(text):
    return [a for a, p in PAT if p.search(text or '')]


# ------------------------------------------------------------------------------------------------ Retraction Watch
def refresh_retraction_watch():
    """Download the whole Retraction Watch database and keep the rows with a Jordanian institution or country."""
    path = os.path.join(RET, 'retraction_watch_jordan.csv')
    local = os.environ.get('RW_FILE', '')   # a downloaded copy of the whole database (manual run)
    if local:
        with open(local, encoding='utf-8-sig', errors='replace') as f:
            text = f.read()
    elif OFFLINE:
        return
    else:
        try:
            import requests
            r = requests.get(RW_URL, timeout=300)
            r.raise_for_status()
            text = r.content.decode('utf-8-sig', 'replace')
        except Exception as e:  # noqa: BLE001  (keep the previous file)
            log(f'  ! retraction watch download failed, keeping the saved file: {e}')
            return
    rows = list(csv.DictReader(io.StringIO(text)))
    if len(rows) < 10000:   # a truncated or wrong response: never replace good data with it
        log(f'  ! retraction watch: only {len(rows)} rows, keeping the saved file')
        return
    jo = [x for x in rows if re.search(r'jordan', (x.get('Country') or '') + ' ' + (x.get('Institution') or ''), re.I)]
    cols = [c for c in rows[0].keys() if c and c != 'URLS']
    with open(path, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction='ignore')
        w.writeheader()
        w.writerows(jo)
    log(f'retraction watch: {len(rows)} records, {len(jo)} Jordanian')
    journal_risk(rows)


def jkey(t):
    """journal title -> matching key (same rule as R.jkey in research.js)"""
    t = unicodedata.normalize('NFKD', (t or '').lower()).replace('&', ' and ')
    t = re.sub(r'[^0-9a-z\u0600-\u06ff]+', ' ', t).strip()
    return re.sub(r'^the ', '', t)


def journal_risk(rows):
    """Retractions worldwide per journal and per publisher (all countries, Retraction Watch), so a researcher can see
    before submitting whether a journal or publisher has a record of retractions, and why (rw_journals.json)."""
    this = dt.date.today().year
    J, P = {}, {}
    for x in rows:
        if (x.get('RetractionNature') or '').strip() != 'Retraction':
            continue
        y = rw_date(x.get('RetractionDate'))[:4]
        y = int(y) if y.isdigit() else 0
        gs = reason_groups(reason_list(x.get('Reason')))
        for D, k, name in ((J, jkey(x.get('Journal')), (x.get('Journal') or '').strip()), (P, jkey(x.get('Publisher')), (x.get('Publisher') or '').strip())):
            if not k:
                continue
            o = D.setdefault(k, {'t': name, 'n': 0, 'n5': 0, 'y': 0, 'g': collections.Counter(), 'yy': collections.Counter(), 'sys': 0})
            o['n'] += 1
            o['n5'] += y >= this - 4
            o['y'] = max(o['y'], y)
            o['g'].update(gs)
            o['sys'] += bool(set(gs) & {'peer', 'mill', 'gen', 'cite'})
            o['yy'][y] += 1
    def pack(D, minimum):
        out = {}
        for k, o in D.items():
            if o['n'] < minimum:
                continue
            sysn = o['sys']
            out[k] = [o['t'], o['n'], o['n5'], o['y'], [g for g, _ in o['g'].most_common(3)], round(sysn / o['n'], 2),
                      max(o['yy'].values()) if o['yy'] else 0]
        return out
    res = {'updated': dt.date.today().isoformat(), 'cols': ['title', 'retractions', 'since_5y', 'last_year', 'top_reasons', 'systematic_share', 'max_in_one_year'],
           'journals': pack(J, 3), 'publishers': pack(P, 5)}
    with open(os.path.join(OUT, 'rw_journals.json'), 'w', encoding='utf-8') as f:
        json.dump(res, f, ensure_ascii=False, separators=(',', ':'))
    log(f"retraction watch: {len(res['journals'])} journals and {len(res['publishers'])} publishers with retractions")


# ------------------------------------------------------------------------------------------------ Scopus API
def scopus_api_refresh():
    """New retracted Jordanian documents from the Scopus Search API, appended to retractions/scopus_api.csv."""
    if OFFLINE or not SCOPUS_KEY:
        return
    import requests
    h = {'X-ELS-APIKey': SCOPUS_KEY, 'Accept': 'application/json'}
    if SCOPUS_TOKEN:
        h['X-ELS-Insttoken'] = SCOPUS_TOKEN

    def run(view):
        out, start, total = [], 0, None
        while total is None or start < total:
            p = {'query': QUERY, 'count': 25, 'start': start}
            if view:
                p['view'] = view
            try:
                r = requests.get('https://api.elsevier.com/content/search/scopus', headers=h, params=p, timeout=60)
            except requests.RequestException as e:
                log(f'  ! scopus api: {e}')
                return None
            if r.status_code != 200:
                return None
            sr = r.json().get('search-results', {})
            total = int(sr.get('opensearch:totalResults') or 0)
            ents = [e for e in sr.get('entry', []) if 'error' not in e]
            out += ents
            if not ents:
                break
            start += 25
            time.sleep(0.2)
        return out

    ents = run('COMPLETE') or run(None)
    if not ents:
        log('  ! scopus api: no result (key, quota or access)')
        return
    path = os.path.join(RET, 'scopus_api.csv')
    old = {x['EID']: x for x in read_csv(path)} if os.path.exists(path) else {}
    for e in ents:
        affs = {a.get('afid'): ', '.join(x for x in [a.get('affilname'), a.get('affiliation-city'), a.get('affiliation-country')] if x)
                for a in (e.get('affiliation') or [])}
        au = e.get('author') or []
        names = [a.get('authname', '') for a in au]
        ids = [a.get('authid', '') for a in au]
        awa = []
        for a in au:
            af = [affs.get(x.get('$')) for x in (a.get('afid') or []) if affs.get(x.get('$'))]
            for x in (af or ['']):
                awa.append(f"{a.get('authname', '')}, {x}".rstrip(', '))
        row = {'EID': e.get('eid', ''), 'Title': e.get('dc:title', ''), 'Year': (e.get('prism:coverDate') or '')[:4],
               'Source title': e.get('prism:publicationName', ''), 'DOI': e.get('prism:doi', ''),
               'ISSN': '; '.join(x for x in [e.get('prism:issn', ''), e.get('prism:eIssn', '')] if x),
               'Cited by': e.get('citedby-count', '0'), 'Document Type': 'Retracted',
               'Authors': '; '.join(names) or e.get('dc:creator', ''), 'Author(s) ID': '; '.join(ids),
               'Author full names': '; '.join(f'{n} ({i})' for n, i in zip(names, ids)),
               'Affiliations': '; '.join(affs.values()), 'Authors with affiliations': '; '.join(awa),
               'Publisher': '', 'Open Access': 'All Open Access' if str(e.get('openaccessFlag')).lower() == 'true' else ''}
        prev = old.get(row['EID'])
        if prev:   # keep richer fields from an earlier run, refresh the citations
            for k, v in row.items():
                if v and (k == 'Cited by' or not prev.get(k)):
                    prev[k] = v
        else:
            old[row['EID']] = row
    cols = list(next(iter(old.values())).keys())
    with open(path, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction='ignore')
        w.writeheader()
        w.writerows(old.values())
    log(f'scopus api: {len(ents)} retracted Jordanian documents ({len(old)} saved)')


# ------------------------------------------------------------------------------------------------ parsing helpers
DEPT_RE = re.compile(r'^(department|dept\.?|division|section|unit|programs?|programme)\b', re.I)
FAC_RE = re.compile(r'\b(faculty|college|school|institute|centre|center)\b', re.I)
SKIP_PART = re.compile(r'\b(university|jordan|amman|irbid|zarqa|karak|salt|aqaba|mafraq|madaba|tafila|ma.?an|jerash|ajloun|p\.?\s?o\.?\s?box|street|st\.)\b', re.I)
FAC_AR = [  # keyword in the faculty name -> a common Arabic heading, so the same faculty is grouped across universities
    (r'pharm', 'الصيدلة'), (r'dent', 'طب الأسنان'), (r'nurs', 'التمريض'), (r'veterin', 'الطب البيطري'),
    (r'rehab', 'علوم التأهيل'), (r'allied|applied medical|health (science|professions)|public health', 'العلوم الطبية المساندة والصحية'),
    (r'medic|patholog|immunolog', 'الطب'), (r'information technology|computer|computing|informatics|artificial intelligence|cyber|communication technology', 'تكنولوجيا المعلومات والحاسوب'),
    (r'(?-i:\b(ICT|IT)\b)', 'تكنولوجيا المعلومات والحاسوب'),
    (r'architect|design|fine arts|arts and design', 'العمارة والتصميم والفنون'), (r'engineer', 'الهندسة'),
    (r'business|admin|financ|economic|management|account|commerce|banking', 'الأعمال والعلوم الإدارية والمالية'),
    (r'law', 'الحقوق'), (r'shari|islamic|da.?wa|fiqh', 'الشريعة والدراسات الإسلامية'), (r'educat', 'العلوم التربوية'),
    (r'agricult|food', 'الزراعة'), (r'sport|physical education', 'علوم الرياضة'), (r'media|journalism|mass comm', 'الإعلام'),
    (r'tourism|hospitality|archaeolog', 'السياحة والآثار'), (r'language|literature|letters|english|arabic', 'اللغات والآداب'),
    (r'social studies|international studies|humanit', 'الآداب والعلوم الإنسانية'), (r'arts', 'الآداب والعلوم'),
    (r'science|mathemat|physics|statist|chemistry|biolog', 'العلوم'), (r'graduate|doctoral', 'الدراسات العليا'),
    (r'community college|applied college|technical college|college of ajloun|amman faculty', 'الكليات الجامعية المتوسطة والتطبيقية'),
    (r'research|cent(er|re)\b|institute|laborator', 'المراكز والمعاهد البحثية'), (r'technolog', 'التكنولوجيا'),
]
FAC_AR = [(re.compile(p, re.I), a) for p, a in FAC_AR]


def fac_ar(name):
    for p, a in FAC_AR:
        if p.search(name or ''):
            return a
    return 'أخرى' if name else ''


def tidy(s):
    s = re.sub(r'\s+', ' ', (s or '').strip(' .;,'))
    s = re.sub(r'^Dept\.?\s+', 'Department ', s, flags=re.I)
    return s


def split_aff(aff):
    """'Department of X, Faculty of Y, University of Z, Amman, Jordan' -> (department, faculty, Jordanian AF-IDs)"""
    parts = [p.strip() for p in (aff or '').split(',') if p.strip()]
    dept = next((tidy(p) for p in parts if DEPT_RE.search(p) and not SKIP_PART.search(p)), '')
    fac = next((tidy(p) for p in parts if FAC_RE.search(p) and not DEPT_RE.search(p) and not re.search(r'university', p, re.I)), '')
    return dept, fac, unis_in(aff)


def author_entries(row):
    """[(name, scopus id, [affiliation strings])] from a full Scopus export row"""
    names = [n.strip() for n in (row.get('Authors') or '').split(';') if n.strip()]
    ids = [i.strip() for i in (row.get('Author(s) ID') or '').split(';') if i.strip()]
    full = {}
    for m in re.finditer(r'([^;]+?)\s*\((\d{6,})\)', row.get('Author full names') or ''):
        full[m.group(2)] = m.group(1).strip()
    affs = collections.defaultdict(list)
    for seg in (row.get('Authors with affiliations') or '').split('; '):
        seg = seg.strip()
        if not seg:
            continue
        nm, _, af = seg.partition(', ')
        affs[nm.strip()].append(af.strip())
    out = []
    for k, n in enumerate(names):
        sid = ids[k] if k < len(ids) else ''
        out.append((full.get(sid) or n, sid, affs.get(n, [])))
    return out


# reasons (Retraction Watch wording) -> an Arabic group, so the page can count and filter them
REASON_GROUPS = [
    ('peer', 'تلاعب بالتحكيم', 'bi-person-x', r'peer review'),
    ('mill', 'مصانع الأبحاث', 'bi-building-exclamation', r'paper mill'),
    ('gen', 'محتوى مولّد آلياً', 'bi-robot', r'computer-aided|computer-generated|randomly generated|generated content'),
    ('plag', 'انتحال', 'bi-files', r'plagiari'),
    ('dup', 'نشر مكرر', 'bi-copy', r'duplicat'),
    ('fab', 'تلفيق أو تزوير', 'bi-exclamation-octagon', r'falsification|fabrication|manipulation of (images|results)'),
    ('data', 'مشكلات في البيانات أو النتائج', 'bi-clipboard-data', r'data|results|image|analys|reproduc|unreliable'),
    ('cite', 'تلاعب بالاقتباسات أو المراجع', 'bi-quote', r'citation|referencing|attribution'),
    ('auth', 'مشكلات التأليف', 'bi-people', r'author|consent|approval from'),
    ('ethic', 'مخالفات أخلاقية', 'bi-shield-exclamation', r'ethic|irb|iacuc|conflict of interest|misconduct'),
    ('third', 'تدخل طرف ثالث', 'bi-diagram-2', r'third party'),
    ('err', 'أخطاء', 'bi-bug', r'error|mistake'),
    ('scope', 'خارج نطاق المجلة أو سياستها', 'bi-signpost', r'scope|journal policy|rogue editor|guest editor|special issue'),
    ('info', 'إشعار بلا تفاصيل', 'bi-question-circle', r'limited or no information|no information|withdrawal'),
]
REASON_GROUPS = [(k, a, i, re.compile(p, re.I)) for k, a, i, p in REASON_GROUPS]
PROCESS = re.compile(r'investigation|retract and replace|upgrade/update|notice|date of|doing the right thing|objections|'
                     r'author unresponsive|lack of approval from third|removed|updated to retraction|cites retracted|'
                     r'temporary removal|unknown|withdrawn|original paper|not peer reviewed', re.I)
REASON_AR = {
    'Fake Peer Review': 'تحكيم مزيف', 'Concerns/Issues with Peer Review': 'مشكلات في عملية التحكيم', 'Paper Mill': 'مصنع أبحاث (Paper mill)',
    'Computer-Aided Content or Computer-Generated Content': 'محتوى مولّد بالحاسوب', 'Randomly Generated Content': 'محتوى عشوائي مولّد',
    'Plagiarism of Article': 'انتحال بحث كامل', 'Plagiarism of Text': 'انتحال نصوص', 'Plagiarism of Data': 'انتحال بيانات',
    'Plagiarism of Image': 'انتحال صور', 'Euphemisms for Plagiarism': 'انتحال (بتعبير ملطّف)', 'Duplication of Article': 'نشر البحث نفسه مرتين',
    'Duplication of Text': 'تكرار نصوص', 'Duplication of Data': 'تكرار بيانات', 'Duplication of Image': 'تكرار صور',
    'Euphemisms for Duplication': 'نشر مكرر (بتعبير ملطّف)', 'Concerns/Issues About Data': 'شكوك حول البيانات',
    'Concerns/Issues About Results and/or Conclusions': 'شكوك حول النتائج أو الاستنتاجات', 'Concerns/Issues about Results and/or Conclusions': 'شكوك حول النتائج أو الاستنتاجات',
    'Unreliable Results and/or Conclusions': 'نتائج أو استنتاجات غير موثوقة', 'Unreliable Data': 'بيانات غير موثوقة',
    'Concerns/Issues About Image': 'شكوك حول الصور', 'Error in Data': 'خطأ في البيانات', 'Error in Analyses': 'خطأ في التحليل',
    'Error in Results and/or Conclusions': 'خطأ في النتائج', 'Error in Text': 'خطأ في النص', 'Error in Methods': 'خطأ في المنهجية',
    'Error by Journal/Publisher': 'خطأ من المجلة أو الناشر', 'Falsification/Fabrication of Data': 'تلفيق أو تزوير بيانات',
    'Falsification/Fabrication of Results': 'تلفيق أو تزوير نتائج', 'Falsification/Fabrication of Image': 'تزوير صور',
    'Manipulation of Images': 'تلاعب بالصور', 'Manipulation of Results': 'تلاعب بالنتائج', 'Citation Manipulation': 'تلاعب بالاقتباسات',
    'Concerns/Issues with Referencing/Attributions': 'مشكلات في المراجع والإسناد', 'Concerns/Issues about Authorship/Affiliation': 'شكوك حول التأليف أو الانتماء',
    'Concerns/Issues About Authorship': 'شكوك حول التأليف', 'Forged Authorship': 'تأليف مزوّر', 'Lack of Approval from Author': 'دون موافقة أحد المؤلفين',
    'Complaints about Author': 'شكاوى ضد المؤلف', 'Ethical Violations by Author': 'مخالفات أخلاقية من المؤلف', 'Lack of IRB/IACUC Approval and/or Material Transfer Agreement': 'دون موافقة لجنة أخلاقيات',
    'Concerns/Issues with Informed/Patient Consent': 'مشكلات في الموافقة المستنيرة', 'Conflict of Interest': 'تضارب مصالح', 'Misconduct by Author': 'سوء سلوك من المؤلف',
    'Misconduct - Official Investigation/Finding': 'سوء سلوك: نتيجة تحقيق رسمي', 'Concerns/Issues about Third Party Involvement': 'تدخل طرف ثالث',
    'Investigation by Journal/Publisher': 'تحقيق من المجلة أو الناشر', 'Investigation by Third Party': 'تحقيق من طرف ثالث',
    'Investigation by Company/Institution': 'تحقيق من المؤسسة', 'Investigation by ORI': 'تحقيق ORI', 'Notice - Limited or No Information': 'إشعار بلا تفاصيل',
    'Notice - Unable to Access via current resources': 'الإشعار غير متاح', 'Withdrawal': 'سحب من المؤلفين', 'Retract and Replace': 'سحب واستبدال',
    'Upgrade/Update of Prior Notice(s)': 'تحديث إشعار سابق', 'Author Unresponsive': 'المؤلف لم يستجب', 'Date of Article and/or Notice Unknown': 'تاريخ غير معروف',
    'Rogue Editor': 'محرر غير نزيه', 'Concerns/Issues with Peer Review ': 'مشكلات في عملية التحكيم', 'Objections by Author(s)': 'اعتراض المؤلفين',
    'Doing the Right Thing': 'تصحيح بمبادرة المؤلفين', 'Original Data not Provided': 'لم تُقدَّم البيانات الأصلية', 'Results Not Reproducible': 'نتائج غير قابلة للتكرار',
    'Hoax Paper': 'بحث خادع', 'Sabotage of Materials': 'تخريب مواد', 'Bias Issues or Lack of Balance': 'تحيّز', 'Salami Slicing': 'تجزئة البحث (Salami slicing)',
    'Taken from Dissertation/Thesis': 'مأخوذ من أطروحة', 'Copyright Claims': 'حقوق نشر', 'Legal Reasons/Legal Threats': 'أسباب قانونية',
    'Concerns/Issues about Article': 'شكوك حول البحث', 'Cites Retracted Work': 'يستشهد بأبحاث مسحوبة', 'Breach of Policy by Author': 'مخالفة سياسة المجلة',
    'Lack of Balance/Bias Issues': 'تحيّز', 'Error by Third Party': 'خطأ من طرف ثالث', 'Removed': 'أُزيل', 'Temporary Removal': 'إزالة مؤقتة',
    'Unreliable Image': 'صور غير موثوقة', 'Lack of Approval from Company/Institution': 'دون موافقة المؤسسة', 'Notice - Lack of': 'إشعار ناقص', 'Concerns/Issues about Referencing/Attributions': 'مشكلات في المراجع والإسناد (اقتباسات غير ذات صلة)',
    'Concerns/Issues about Peer Review': 'مشكلات في عملية التحكيم', 'Concerns/Issues about Data': 'شكوك حول البيانات', 'Compromised Peer Review': 'تحكيم مُخترَق',
    'Concerns/Issues about Image': 'شكوك حول الصور', 'Plagiarism of/in Article': 'انتحال في البحث', 'Duplication of/in Article': 'نشر مكرر للبحث',
    'Duplication of/in Image': 'صور مكررة', 'Lack of IRB/IACUC Approval and/or Compliance': 'دون موافقة لجنة الأخلاقيات', 'Concerns/Issues about Methods': 'شكوك حول المنهجية',
    'False/Forged Authorship': 'تأليف زائف أو مزوّر', 'Original Data and/or Images not Provided and/or not Available': 'لم تُقدَّم البيانات أو الصور الأصلية',
    'Informed/Patient Consent - None/Withdrawn': 'دون موافقة مستنيرة', 'Lack of Approval from Third Party': 'دون موافقة طرف ثالث', 'Error in Image': 'خطأ في الصور',
    'Error in Materials': 'خطأ في المواد', 'Withdrawn to Publish in Different Journal': 'سُحب لنشره في مجلة أخرى',
    'Duplication of Content through Error by Journal/Publisher': 'تكرار بخطأ من المجلة أو الناشر', 'Plagiarism of/in Image': 'انتحال صور', 'Plagiarism of/in Data': 'انتحال بيانات',
    'Duplication of/in Data': 'بيانات مكررة', 'Duplication of/in Text': 'نصوص مكررة', 'Plagiarism of/in Text': 'انتحال نصوص', 'Concerns/Issues about Results and/or Conclusions': 'شكوك حول النتائج',
    'Concerns/Issues about Authorship/Affiliation': 'شكوك حول التأليف أو الانتماء', 'Error in Results and/or Conclusions': 'خطأ في النتائج', 'Error in Analyses': 'خطأ في التحليل', 'Concerns/Issues About Human Subject Welfare': 'سلامة المشاركين', 'Updated to Retraction': 'حُدّث إلى سحب',
}


def reason_list(s):
    return [r.strip().lstrip('+').strip() for r in (s or '').split(';') if r.strip().lstrip('+').strip()]


def reason_groups(reasons):
    gs = []
    for r in reasons:
        if PROCESS.search(r) and not re.search(r'limited or no information|withdrawal', r, re.I):
            continue
        for k, _a, _i, p in REASON_GROUPS:
            if p.search(r):
                if k not in gs:
                    gs.append(k)
                break
    return gs


def rw_date(s):
    m = re.match(r'(\d{1,2})/(\d{1,2})/(\d{4})', s or '')
    return f'{m.group(3)}-{int(m.group(1)):02d}-{int(m.group(2)):02d}' if m else (s or '')[:10]


# ------------------------------------------------------------------------------------------------ build
def main():
    os.makedirs(RET, exist_ok=True)
    refresh_retraction_watch()
    scopus_api_refresh()

    # documents of the Jordanian universities (official exports): EID -> universities, year, journal
    docs = {}
    uni_docs = collections.Counter()
    for f in sorted(glob.glob(os.path.join(OUT, 'universities_export', '*.csv')) + glob.glob(os.path.join(OUT, 'scopus_export', '*.csv'))):
        base = os.path.basename(f)
        afid = '60040839' if 'scopus_export' in f else base.split('_')[0].split('.')[0]
        if afid not in UIDX:
            continue
        for r in read_csv(f):
            eid = r.get('EID', '')
            if not eid:
                continue
            d = docs.setdefault(eid, {'u': set(), 'y': 0, 'src': '', 'issn': '', 'type': '', 'c': 0})
            if afid not in d['u']:
                d['u'].add(afid)
                uni_docs[afid] += 1
            d['y'] = d['y'] or int((r.get('Year') or '0')[:4] or 0)
            d['src'] = d['src'] or r.get('Source title', '')
            d['issn'] = d['issn'] or r.get('ISSN', '')
            d['type'] = d['type'] or r.get('Document Type', '')
            d['c'] = max(d['c'], int(r.get('Cited by') or 0))
    log(f'{len(docs)} Jordanian documents in the university exports')
    cites = load_json(os.path.join(OUT, 'jordan_citations.json'), {}) or {}

    # retracted documents: full Scopus records (web export first, then API rows), plus the university exports
    full = {}
    for f in sorted(glob.glob(os.path.join(RET, 'scopus_*.csv')), key=lambda p: (os.path.basename(p) == 'scopus_api.csv', p)):
        for r in read_csv(f):
            if r.get('EID') and r['EID'] not in full:
                full[r['EID']] = r
    for eid, d in docs.items():
        if d['type'] == 'Retracted' and eid not in full:
            full[eid] = {'EID': eid, 'Year': str(d['y']), 'Source title': d['src'], 'ISSN': d['issn'], 'Cited by': str(d['c']), 'Document Type': 'Retracted'}
    log(f'{len(full)} retracted documents with a Jordanian affiliation in Scopus')

    # Retraction Watch, by the DOI of the original paper
    rw_rows = read_csv(os.path.join(RET, 'retraction_watch_jordan.csv')) if os.path.exists(os.path.join(RET, 'retraction_watch_jordan.csv')) else []
    rw = {}
    for x in rw_rows:
        nat = (x.get('RetractionNature') or '').strip()
        k = norm_doi(x.get('OriginalPaperDOI'))
        if k and (k not in rw or nat == 'Retraction'):
            rw[k] = x

    # people: University of Petra profiles and the Jordanian Scopus authors
    R = load_json(os.path.join(OUT, 'researchers.json'), {}) or {}
    uop = {}
    for r in R.get('researchers', []):
        for sid in (r.get('scopus_ids') or ([r['scopus_id']] if r.get('scopus_id') else [])):
            uop[str(sid)] = r
    E = load_json(os.path.join(OUT, 'jordan', 'experts.json'), {}) or {}
    ex = {row[0]: row for row in E.get('rows', [])}

    # journals (quartile, publisher, subject areas) and the Scopus source list
    J = load_json(os.path.join(OUT, 'journals.json'), {}) or {}
    jc = {c: i for i, c in enumerate(J.get('cols', []))}
    jmap = {}
    for row in J.get('rows', []):
        for i in str(row[jc['issn']] or '').split():
            jmap[i.upper()] = row
    FL = (load_json(os.path.join(OUT, 'scopus_flags.json'), {}) or {})
    fl_issn = {}
    for sid, f in (FL.get('flags') or {}).items():
        f['id'] = sid
        for i in f.get('issn') or []:
            fl_issn[i.upper()] = f

    def issns(s):
        return [x.replace('-', '').strip().upper() for x in re.split(r'[;,\s]+', s or '') if x.strip()]

    def journal(issn_s):
        for i in issns(issn_s):
            if i in jmap:
                return jmap[i]
        return None

    def flag(issn_s):
        for i in issns(issn_s):
            if i in fl_issn:
                return fl_issn[i]
        return None

    areas = J.get('areas', [])
    pubs = J.get('publishers', [])
    papers, authors = [], {}
    matched_rw = set()
    for eid, r in full.items():
        d = docs.get(eid, {})
        doi = norm_doi(r.get('DOI'))
        x = rw.get(doi) if doi else None
        if x:
            matched_rw.add(doi)
        aff_text = (r.get('Affiliations') or '') + ' ; ' + (r.get('Authors with affiliations') or '')
        us = sorted(set(d.get('u', set())) | set(unis_in(aff_text)), key=lambda a: UIDX[a])
        jr = journal(r.get('ISSN'))
        fg = flag(r.get('ISSN'))
        au = []
        for name, sid, affs in author_entries(r):
            depts, facs, aus = [], [], []
            for af in affs:
                dp, fc, u = split_aff(af)
                if dp and dp not in depts:
                    depts.append(dp)
                if fc and fc not in facs:
                    facs.append(fc)
                aus += [a for a in u if a not in aus]
            if not aus and sid in ex and ex[sid][2] in UIDX and not affs:
                aus = [ex[sid][2]]
            p = uop.get(sid)
            a = {'n': name, 'id': sid, 'u': [UIDX[a] for a in aus], 'd': depts[:2], 'f': facs[:2]}
            if p:
                a['p'] = p['id']
                a['an'] = p.get('name', '')
                a['fa'] = p.get('faculty', '')
                a['da'] = p.get('dept', '')
            au.append(a)
            if aus and sid:
                o = authors.setdefault(sid, {'n': name, 'id': sid, 'u': collections.Counter(), 'd': collections.Counter(), 'f': collections.Counter(), 'k': [], 'p': a.get('p', ''), 'an': a.get('an', ''), 'fa': a.get('fa', ''), 'da': a.get('da', '')})
                o['u'].update(aus)
                o['d'].update(depts[:1])
                o['f'].update(facs[:1])
                o['k'].append(eid)
        reasons = reason_list(x.get('Reason')) if x else []
        y = int((r.get('Year') or '0')[:4] or 0) or d.get('y', 0)
        c = cites.get(eid.replace('2-s2.0-', '')) if isinstance(cites, dict) else None
        c = (c[0] if isinstance(c, list) else c) if c is not None else None
        rec = {
            'eid': eid, 't': (r.get('Title') or '').strip(), 'y': y, 'j': r.get('Source title') or d.get('src', ''),
            'issn': ' '.join(issns(r.get('ISSN'))), 'doi': doi, 'c': int(c if isinstance(c, int) else (r.get('Cited by') or d.get('c') or 0) or 0),
            'pub': (r.get('Publisher') or (x or {}).get('Publisher') or (pubs[jr[jc['pub']]] if jr and isinstance(jr[jc['pub']], int) and jr[jc['pub']] < len(pubs) else '')).strip(),
            'u': [UIDX[a] for a in us], 'au': au, 'oa': 1 if (r.get('Open Access') or '').strip() else 0,
            'q': jr[jc['q']] if jr else '', 'jid': jr[jc['id']] if jr else (fg or {}).get('id', ''),
            'ar': sorted({areas[a] for a in (jr[jc['areas']] if jr else []) if isinstance(a, int) and a < len(areas)}),
            'disc': 1 if fg and fg.get('d') else 0, 'disc_end': (fg or {}).get('end') or (fg or {}).get('dy') or '',
        }
        if x:
            rec['rw'] = {'id': x.get('Record ID', ''), 'date': rw_date(x.get('RetractionDate')), 'orig': rw_date(x.get('OriginalPaperDate')),
                         'ndoi': norm_doi(x.get('RetractionDOI')), 'nat': x.get('RetractionNature', ''), 'r': reasons,
                         'pay': x.get('Paywalled', ''), 'type': x.get('ArticleType', ''), 'subj': x.get('Subject', ''),
                         'notes': (x.get('Notes') or '').strip()[:400]}
            rec['g'] = reason_groups(reasons)
        papers.append(rec)

    # Retraction Watch records with a Jordanian institution that Scopus does not list as retracted (not indexed in
    # Scopus, or Scopus has not updated the record yet)
    rw_only = []
    for k, x in rw.items():
        if k in matched_rw or (x.get('RetractionNature') or '') != 'Retraction':
            continue
        inst = x.get('Institution') or ''
        us = sorted(set(unis_in(inst)), key=lambda a: UIDX[a])
        reasons = reason_list(x.get('Reason'))
        rw_only.append({'t': x.get('Title', '').strip(), 'y': int((rw_date(x.get('OriginalPaperDate')) or '0')[:4] or 0), 'j': x.get('Journal', ''),
                        'pub': x.get('Publisher', ''), 'doi': k, 'u': [UIDX[a] for a in us], 'au': [a.strip() for a in (x.get('Author') or '').split(';') if a.strip()],
                        'inst': inst[:600], 'rw': {'id': x.get('Record ID', ''), 'date': rw_date(x.get('RetractionDate')), 'ndoi': norm_doi(x.get('RetractionDOI')),
                                                    'nat': x.get('RetractionNature', ''), 'r': reasons, 'type': x.get('ArticleType', ''), 'subj': x.get('Subject', ''),
                                                    'notes': (x.get('Notes') or '').strip()[:400]}, 'g': reason_groups(reasons), 'src': 'rw'})

    # papers in journals that Scopus discontinued, per university, year and journal
    dj = {}
    du = collections.Counter()
    tot = {k: {'docs': 0, 'disc': 0, 'docs_y': collections.Counter(), 'disc_y': collections.Counter()} for k in ('all', 'pub', 'priv')}
    for d in docs.values():   # each document once: all universities, and each sector
        secs = ['all'] + (['pub'] if any(a in PUBLIC for a in d['u']) else []) + (['priv'] if any(a not in PUBLIC for a in d['u']) else [])
        d['secs'] = secs
        for k in secs:
            tot[k]['docs'] += 1
            tot[k]['docs_y'][d['y']] += 1
    dy = collections.defaultdict(collections.Counter)
    for eid, d in docs.items():
        f = None
        for i in issns(d['issn']):
            if i in fl_issn:
                f = fl_issn[i]
                break
        if not f or not f.get('d'):
            continue
        o = dj.setdefault(f['id'], {'id': f['id'], 't': f.get('t', ''), 'end': f.get('end') or f.get('dy') or '', 'issn': ' '.join(f.get('issn') or []),
                                    'n': 0, 'u': collections.Counter(), 'y': collections.Counter(), 'c': 0, 'after': 0})
        jr = journal(' '.join(f.get('issn') or []))
        o['q'] = jr[jc['q']] if jr else ''
        o['pub'] = (pubs[jr[jc['pub']]] if jr and isinstance(jr[jc['pub']], int) and jr[jc['pub']] < len(pubs) else '')
        o['n'] += 1
        o['c'] += d['c']
        o.setdefault('s', collections.Counter()).update([k for k in d['secs'] if k != 'all'])
        for k in d['secs']:
            tot[k]['disc'] += 1
            tot[k]['disc_y'][d['y']] += 1
        if o['end'] and d['y'] and d['y'] > int(o['end']):
            o['after'] += 1
        o['y'][d['y']] += 1
        for a in d['u']:
            o['u'][UIDX[a]] += 1
            du[a] += 1
            dy[a][d['y']] += 1
    djl = sorted(dj.values(), key=lambda o: -o['n'])
    for o in djl:
        o['u'] = dict(o['u'])
        o['s'] = dict(o.get('s') or {})
        o['y'] = {str(k): v for k, v in sorted(o['y'].items()) if k}

    # universities: totals and per year
    uy_docs = collections.defaultdict(collections.Counter)
    for d in docs.values():
        for a in d['u']:
            uy_docs[a][d['y']] += 1
    unis = []
    for a, en, ar, _p in UNIS:
        unis.append({'afid': a, 'en': en, 'ar': ar, 'pub': 1 if a in PUBLIC else 0, 'docs': uni_docs.get(a, 0),
                     'disc': du.get(a, 0), 'disc_y': {str(k): v for k, v in sorted(dy[a].items()) if k},
                     'docs_y': {str(k): v for k, v in sorted(uy_docs[a].items()) if k}})

    people = []
    for sid, o in authors.items():
        e = ex.get(sid)
        people.append({'id': sid, 'n': o['n'], 'u': [UIDX[a] for a, _ in o['u'].most_common()], 'd': o['d'].most_common(1)[0][0] if o['d'] else '',
                       'f': o['f'].most_common(1)[0][0] if o['f'] else '', 'k': o['k'], 'docs': e[3] if e else None,
                       'p': o['p'], 'an': o['an'], 'fa': o['fa'], 'da': o['da']})
    people.sort(key=lambda p: (-len(p['k']), p['n']))
    papers.sort(key=lambda p: (-p['y'], p['t']))

    out = {
        'updated': dt.date.today().isoformat(),
        'query': QUERY,
        'sources': {
            'scopus_full': len([1 for r in full.values() if r.get('Authors')]),
            'scopus_total': len(full),
            'rw_jordan': len(rw_rows), 'rw_matched': len(matched_rw), 'rw_only': len(rw_only),
            'flags': FL.get('source') or '', 'flags_updated': FL.get('updated') or '',
            'docs': len(docs),
        },
        'unis': unis,
        'tot': {k: {'docs': v['docs'], 'disc': v['disc'], 'docs_y': {str(y): n for y, n in sorted(v['docs_y'].items()) if y},
                    'disc_y': {str(y): n for y, n in sorted(v['disc_y'].items()) if y}} for k, v in tot.items()},
        'reason_groups': [[k, a, i] for k, a, i, _ in REASON_GROUPS],
        'reason_ar': REASON_AR,
        'fac_ar': {f: fac_ar(f) for p in papers for a in p['au'] if a['u'] for f in a['f']},
        'papers': papers,
        'rw_only': rw_only,
        'people': people,
        'disc_journals': djl,
    }
    with open(os.path.join(OUT, 'integrity.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    log(f'integrity.json: {len(papers)} retracted (Scopus), {len(rw_only)} more in Retraction Watch, '
        f'{len(people)} Jordanian authors, {len(djl)} discontinued journals with Jordanian papers')


if __name__ == '__main__':
    main()
