"""External collaboration of University of Petra (data/research/collab.json), from the official Scopus export of the
university (data/research/scopus_export/*.csv, column «Affiliations»): every co-authoring institution and country per
document, linked to the Petra researchers of this site; plus, from the Jordan comparison (jordan/docs.tsv), how strong
each Jordanian university is in every Scopus subject area and how much it already publishes with Petra.

Run on its own (python scripts/research_collab.py) or from update_research.py; it only reads local files."""
import csv
import datetime
import glob
import html
import json
import os
import re
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'research')
HOME_AFID = '60040839'
HOME = re.compile(r'\b(university of petra|petra university)\b', re.I)
UNI = re.compile(r'universit|universidad|università|universiti|univ\.', re.I)
ORG = re.compile(r'college|institut|hospital|academy|polytechn|centre|center|ministry|company|laborator|council|corporation|agency|'
                 r'foundation|organi[sz]ation|clinic|\binc\b|\bltd\b|\bllc\b|school', re.I)
# Scopus country names -> ISO 3166-1 alpha-2 (Arabic names come from Intl.DisplayNames in the page)
ISO = {'Jordan': 'JO', 'India': 'IN', 'Saudi Arabia': 'SA', 'Malaysia': 'MY', 'United States': 'US', 'United Arab Emirates': 'AE',
       'United Kingdom': 'GB', 'Egypt': 'EG', 'Nigeria': 'NG', 'Iran': 'IR', 'Iraq': 'IQ', 'Pakistan': 'PK', 'Ethiopia': 'ET',
       'Australia': 'AU', 'China': 'CN', 'Germany': 'DE', 'Italy': 'IT', 'Lebanon': 'LB', 'Canada': 'CA', 'Bahrain': 'BH',
       'Indonesia': 'ID', 'Qatar': 'QA', 'Kuwait': 'KW', 'Oman': 'OM', 'Bangladesh': 'BD', 'Thailand': 'TH', 'Uzbekistan': 'UZ',
       'Turkey': 'TR', 'Türkiye': 'TR', 'South Korea': 'KR', 'Palestine': 'PS', 'Kazakhstan': 'KZ', 'South Africa': 'ZA', 'Brazil': 'BR',
       'Tunisia': 'TN', 'Viet Nam': 'VN', 'France': 'FR', 'Algeria': 'DZ', 'Spain': 'ES', 'Sri Lanka': 'LK', 'Japan': 'JP',
       'Ghana': 'GH', 'Sudan': 'SD', 'Portugal': 'PT', 'Poland': 'PL', 'Hungary': 'HU', 'Greece': 'GR', 'Yemen': 'YE', 'Taiwan': 'TW',
       'Finland': 'FI', 'Nepal': 'NP', 'Romania': 'RO', 'Russian Federation': 'RU', 'Sweden': 'SE', 'Colombia': 'CO',
       'Singapore': 'SG', 'Austria': 'AT', 'Norway': 'NO', 'Ireland': 'IE', 'Mexico': 'MX', 'Philippines': 'PH', 'Chile': 'CL',
       'Netherlands': 'NL', 'Uganda': 'UG', 'Serbia': 'RS', 'Ukraine': 'UA', 'Morocco': 'MA', 'Rwanda': 'RW', 'Somalia': 'SO',
       'Cameroon': 'CM', 'Cyprus': 'CY', 'Syrian Arab Republic': 'SY', 'Syria': 'SY', 'Switzerland': 'CH', 'Denmark': 'DK',
       'Ecuador': 'EC', 'Hong Kong': 'HK', 'Czech Republic': 'CZ', 'Czechia': 'CZ', 'Libya': 'LY', 'Libyan Arab Jamahiriya': 'LY',
       'Estonia': 'EE', 'Peru': 'PE', 'Croatia': 'HR', 'Tanzania': 'TZ', 'Belgium': 'BE', 'Sierra Leone': 'SL', 'Azerbaijan': 'AZ',
       'Bosnia and Herzegovina': 'BA', 'Bulgaria': 'BG', 'Afghanistan': 'AF', 'Gambia': 'GM', 'Kenya': 'KE', 'Kyrgyzstan': 'KG',
       'New Zealand': 'NZ', 'Zambia': 'ZM', 'Cambodia': 'KH', 'Slovakia': 'SK', 'Argentina': 'AR', 'Grenada': 'GD',
       'Saint Vincent and the Grenadines': 'VC', 'Botswana': 'BW', 'Trinidad and Tobago': 'TT', 'Mauritania': 'MR', 'Panama': 'PA',
       'Guyana': 'GY', 'North Macedonia': 'MK', 'Georgia': 'GE', 'Bolivia': 'BO', 'Congo': 'CG', 'Malawi': 'MW', 'Malta': 'MT',
       'Namibia': 'NA', 'Moldova': 'MD', 'Guinea': 'GN', 'Mozambique': 'MZ', 'Costa Rica': 'CR', 'Central African Republic': 'CF',
       'Israel': 'IL', 'Armenia': 'AM', 'Albania': 'AL', 'Slovenia': 'SI', 'Lithuania': 'LT', 'Latvia': 'LV', 'Luxembourg': 'LU',
       'Iceland': 'IS', 'Venezuela': 'VE', 'Uruguay': 'UY', 'Zimbabwe': 'ZW', 'Senegal': 'SN', 'Tajikistan': 'TJ',
       'Turkmenistan': 'TM', 'Mongolia': 'MN', 'Myanmar': 'MM', 'Brunei Darussalam': 'BN', 'Maldives': 'MV', 'Bhutan': 'BT',
       'Belarus': 'BY', 'Montenegro': 'ME', 'Kosovo': 'XK', 'Macao': 'MO', 'Puerto Rico': 'PR', 'Jamaica': 'JM', 'Fiji': 'FJ',
       'Benin': 'BJ', 'Burkina Faso': 'BF', 'Niger': 'NE', 'Mali': 'ML', 'Togo': 'TG', 'Liberia': 'LR', 'Madagascar': 'MG',
       'Mauritius': 'MU', 'Eritrea': 'ER', 'Djibouti': 'DJ', 'Burundi': 'BI', 'Lesotho': 'LS', 'Eswatini': 'SZ', 'Angola': 'AO',
       'Gabon': 'GA', "Cote d'Ivoire": 'CI', 'Democratic Republic Congo': 'CD', 'Papua New Guinea': 'PG', 'Laos': 'LA',
       'Dominican Republic': 'DO', 'Cuba': 'CU', 'Guatemala': 'GT', 'Honduras': 'HN', 'Paraguay': 'PY', 'El Salvador': 'SV',
       'Nicaragua': 'NI', 'Barbados': 'BB', 'Bahamas': 'BS', 'Haiti': 'HT', 'Monaco': 'MC', 'Liechtenstein': 'LI'}


ALIAS = {'al ahilya amman university': 'al ahliyya amman university', 'al ahliyya amman university, jordan': 'al ahliyya amman university',
         'university of jordan, amman': 'university of jordan', 'zaytoonah university of jordan': 'al zaytoonah university of jordan'}


def key(name):
    s = html.unescape(name).lower().replace('-', ' ').replace('’', "'")
    s = re.sub(r'\([^)]*\)', ' ', s)
    s = re.sub(r'^the\s+', '', s.strip())
    s = re.sub(r'\s+', ' ', s).strip()
    return ALIAS.get(s, s)


def institution(aff):
    """(institution, country) of one Scopus affiliation string, or None when it names no organisation"""
    parts = [p.strip() for p in html.unescape(aff).split(',') if p.strip()]
    if len(parts) < 2:
        return None
    country = parts[-1]
    if country not in ISO:
        return None
    body = parts[:-1]
    uni = [p for p in body if UNI.search(p) and not re.match(r'(faculty|department|dept|school|college) of', p, re.I)]
    pick = uni[-1] if uni else next((p for p in reversed(body) if ORG.search(p) and not re.match(r'(department|dept|faculty) ', p, re.I)), None)
    if not pick:
        return None
    pick = re.sub(r'\s*\([A-Z&.\- ]{2,12}\)\s*$', '', pick).strip()
    return pick, country


def quartiles():
    """ISSN or normalised title -> SJR quartile, from the journal directory of this site (journals.json)"""
    path = os.path.join(OUT, 'journals.json')
    if not os.path.exists(path):
        return {}, {}
    J = json.load(open(path, encoding='utf-8'))
    K = {c: i for i, c in enumerate(J['cols'])}
    by_issn, by_title = {}, {}
    for r in J['rows']:
        q = r[K['q']]
        if not q:
            continue
        for x in (r[K['issn']] or '').split():
            by_issn.setdefault(x.replace('-', '').upper(), q)
        by_title.setdefault(re.sub(r'[^a-z0-9]+', ' ', (r[K['t']] or '').lower()).strip(), q)
    return by_issn, by_title


def build():
    csv.field_size_limit(10 ** 9)
    files = sorted(glob.glob(os.path.join(OUT, 'scopus_export', '*.csv')))
    if not files:
        return None
    rows = list(csv.DictReader(open(files[-1], encoding='utf-8-sig')))
    works = json.load(open(os.path.join(OUT, 'works.json'), encoding='utf-8'))['works']
    by_eid = {w['eid'].replace('2-s2.0-', ''): w for w in works if w.get('eid')}
    by_issn, by_title = quartiles()
    names = defaultdict(Counter)          # institution key -> display names
    country_of = {}
    docs = []
    for r in rows:
        eid = (r.get('EID') or '').replace('2-s2.0-', '')
        try:
            y = int(r.get('Year') or 0)
        except ValueError:
            y = 0
        inst, ctry = set(), set()
        for a in (r.get('Affiliations') or '').split(';'):
            got = institution(a)
            if not got:
                p = [x.strip() for x in a.split(',') if x.strip()]
                if p and p[-1] in ISO:
                    ctry.add(p[-1])
                continue
            nm, c = got
            ctry.add(c)
            if HOME.search(nm):
                continue
            k = key(nm)
            names[k][nm] += 1
            country_of.setdefault(k, Counter())[c] += 1
            inst.add(k)
        w = by_eid.get(eid) or {}
        q = w.get('q', '')
        if not q:
            for x in re.split(r'[;,\s]+', r.get('ISSN') or ''):
                q = by_issn.get(x.replace('-', '').upper(), '')
                if q:
                    break
            q = q or by_title.get(re.sub(r'[^a-z0-9]+', ' ', (r.get('Source title') or '').lower()).strip(), '')
        docs.append({'eid': eid, 'y': y, 'c': int(r.get('Cited by') or 0), 't': r.get('Title', ''), 'v': r.get('Source title', ''),
                     'f': w.get('f', ''), 'q': q, 'id': w.get('id', ''), 'r': w.get('r', []), 'inst': inst, 'ctry': ctry})
    # indexes: institutions by documents, countries by documents
    inst_docs = Counter(k for d in docs for k in d['inst'])
    keep = [k for k, n in inst_docs.most_common() if n >= 2]
    ix = {k: i for i, k in enumerate(keep)}
    ctry_docs = Counter(c for d in docs for c in d['ctry'])
    clist = [c for c, _ in ctry_docs.most_common()]
    cx = {c: i for i, c in enumerate(clist)}
    fields = sorted({d['f'] for d in docs if d['f']})
    fx = {f: i for i, f in enumerate(fields)}
    out_docs = []
    for d in docs:
        out_docs.append([d['y'], d['c'], fx.get(d['f'], -1), d['q'], sorted(ix[k] for k in d['inst'] if k in ix),
                         sorted(cx[c] for c in d['ctry']), d['r'], d['id'], d['t'][:220], d['v'][:120]])
    insts = [[names[k].most_common(1)[0][0], country_of[k].most_common(1)[0][0]] for k in keep]
    out = {'source': os.path.basename(files[-1]), 'docs_total': len(docs), 'fields': fields,
           'countries': [[c, ISO.get(c, '')] for c in clist], 'insts': insts, 'docs': out_docs,
           'cols': ['y', 'c', 'f', 'q', 'inst', 'ctry', 'r', 'id', 't', 'v'], 'jo': jordan_partners()}
    return out


def jordan_partners():
    """for each Scopus area: every Jordanian university's documents in the last five years and its joint documents with Petra"""
    cpath, dpath = os.path.join(OUT, 'jordan', 'cube.json'), os.path.join(OUT, 'jordan', 'docs.tsv')
    if not (os.path.exists(cpath) and os.path.exists(dpath)):
        return None
    cube = json.load(open(cpath, encoding='utf-8'))
    unis, areas = cube['unis'], cube['areas']
    home = next((i for i, u in enumerate(unis) if u[0] == HOME_AFID), None)
    if home is None:
        return None
    last = datetime.date.today().year   # in-press documents of next year count with this year
    since = last - 4
    docs5, joint, home5 = Counter(), Counter(), Counter()
    with open(dpath, encoding='utf-8') as f:
        next(f)
        for line in f:
            p = line.rstrip('\n').split('\t')
            if len(p) < 4 or not p[1].isdigit() or not p[2]:
                continue
            us = [int(x) for x in p[2].split(',') if x != '']
            ar = [int(x) for x in p[3].split(',') if x != '']
            recent = since <= int(p[1])
            for a in ar:
                if recent:
                    for u in us:
                        docs5[(u, a)] += 1
                if home in us:
                    if recent:
                        home5[a] += 1
                    for u in us:
                        if u != home:
                            joint[(u, a)] += 1
    by_area = {}
    for a in range(len(areas)):
        if not home5[a]:
            continue
        by_area[a] = [[u, docs5[(u, a)], joint[(u, a)]] for u in range(len(unis)) if u != home and docs5[(u, a)] >= 5]
        by_area[a].sort(key=lambda x: -x[1])
    return {'since': since, 'until': last, 'unis': [[u[0], u[1], u[2]] for u in unis], 'areas': areas,
            'home': {a: home5[a] for a in by_area}, 'by_area': by_area}


def main():
    out = build()
    if not out:
        print('collab: no Scopus export')
        return
    with open(os.path.join(OUT, 'collab.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print(f"collab: {out['docs_total']} documents, {len(out['insts'])} institutions, {len(out['countries'])} countries")


if __name__ == '__main__':
    main()
