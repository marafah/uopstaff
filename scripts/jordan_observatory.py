#!/usr/bin/env python3
"""Jordanian research observatory: turns the Scopus CSV exports of every Jordanian university into
   1) one clean table of documents (each document once, with every Jordanian university that signed it),
   2) aggregates for the website (data/research/observatory.json, no personal data),
   3) an Excel workbook of benchmarks and one Excel file of documents per university.

Usage:  python scripts/jordan_observatory.py <folder with scopus_export_*.csv> <output folder> [--site data/research]
Optional: data/research/sjr.csv (SCImago) adds journal quartiles and subject areas;
          data/research/jordan_citations.json (weekly) replaces the export's citation counts with current ones.
"""
from __future__ import annotations

import argparse
import collections
import csv
import datetime as dt
import glob
import json
import math
import os
import re

csv.field_size_limit(1 << 30)

UNIS = [  # Scopus AF-ID, English, Arabic, pattern that recognises the university in an affiliation string
    ('60064180', 'The University of Jordan', 'الجامعة الأردنية', r'(?<!zaytoonah )(?<!al-zaytoonah )(?<!applied science )\buniversity of jordan\b(?! university)'),
    ('60051534', 'Jordan University of Science and Technology', 'جامعة العلوم والتكنولوجيا', r'jordan university of science'),
    ('60044088', 'The Hashemite University', 'الجامعة الهاشمية', r'hashemite university'),
    ('60044065', 'Yarmouk University', 'جامعة اليرموك', r'yarmouk university'),
    ('60062395', 'Al-Balqa Applied University', 'جامعة البلقاء التطبيقية', r'al[- ]?balqa|balqa applied'),
    ('60043655', 'Applied Science Private University', 'جامعة العلوم التطبيقية الخاصة', r'applied science (private )?university'),
    ('60058937', 'Al-Ahliyya Amman University', 'جامعة عمان الأهلية', r'ahliyya amman|amman al[- ]ahliyya'),
    ('60042753', 'Zarqa University', 'جامعة الزرقاء', r'zarqa (private )?university'),
    ('60035301', 'Mutah University', 'جامعة مؤتة', r"mu'?tah university"),
    ('60067411', 'Al-Zaytoonah University of Jordan', 'جامعة الزيتونة الأردنية', r'zaytoonah'),
    ('60036479', 'Al al-Bayt University', 'جامعة آل البيت', r'a{1,2}l[- ]?al[- ]?bayt|al-albayt'),
    ('60109124', 'Middle East University', 'جامعة الشرق الأوسط', r'middle east university'),
    ('60139033', 'Jadara University', 'جامعة جدارا', r'jadara'),
    ('60067706', 'Isra University', 'جامعة الإسراء', r'\b(al[- ])?isra (private )?university'),
    ('60040839', 'University of Petra', 'جامعة البترا', r'university of petra|petra university'),
    ('60056335', 'Princess Sumaya University for Technology', 'جامعة الأميرة سمية للتكنولوجيا', r'princess sumaya'),
    ('60070287', 'German Jordanian University', 'الجامعة الألمانية الأردنية', r'german[- ]jordanian'),
    ('60105841', 'Al-Hussein Bin Talal University', 'جامعة الحسين بن طلال', r'hussein bin talal'),
    ('60087691', 'Amman Arab University', 'جامعة عمان العربية', r'amman arab university'),
    ('60054151', 'Philadelphia University', 'جامعة فيلادلفيا', r'philadelphia university[^;]*jordan'),
    ('60035155', 'Tafila Technical University', 'جامعة الطفيلة التقنية', r'tafila technical'),
    ('60049668', 'Jerash University', 'جامعة جرش', r'jerash (private )?university'),
    ('60070289', 'Irbid National University', 'جامعة إربد الأهلية', r'irbid national'),
    ('60276501', 'Ajloun National University', 'جامعة عجلون الوطنية', r'ajloun national'),
    ('60115127', 'American University of Madaba', 'الجامعة الأمريكية في مادبا', r'american university of madaba'),
    ('60108351', 'The World Islamic Sciences and Education University', 'جامعة العلوم الإسلامية العالمية', r'world islamic sciences'),
    ('60122214', 'Aqaba University of Technology', 'جامعة العقبة للتكنولوجيا', r'aqaba university of technology'),
    ('60276062', 'Al Hussein Technical University', 'جامعة الحسين التقنية', r'al[- ]hussein technical'),
]
PAT = [(a, re.compile(p, re.I)) for a, _, _, p in UNIS]
NAME = {a: (e, ar) for a, e, ar, _ in UNIS}
COUNTRY_FIX = {'United States': 'United States', 'USA': 'United States', 'UK': 'United Kingdom', 'Russian Federation': 'Russia',
               'Viet Nam': 'Vietnam', 'Korea': 'South Korea', 'Republic of Korea': 'South Korea', 'Türkiye': 'Turkey'}
STOP_KW = {'human', 'humans', 'article', 'female', 'male', 'adult', 'controlled study', 'priority journal', 'nonhuman',
           'major clinical study', 'procedures', 'animals', 'animal', 'jordan', 'middle aged', 'cross-sectional study',
           'cross-sectional studies', 'questionnaire', 'young adult', 'aged', 'adolescent', 'child', 'methodology'}


def unis_in(text):
    t = (text or '').lower()
    return {a for a, p in PAT if p.search(t)}


def country(aff):
    c = aff.rsplit(',', 1)[-1].strip()
    return COUNTRY_FIX.get(c, c)


def split_authors(row):
    """[(name, scopus_id, [affiliations])] from 'Author full names' and 'Authors with affiliations'."""
    full = [x.strip() for x in (row.get('Author full names') or '').split(';') if x.strip()]
    short = [x.strip() for x in (row.get('Authors') or '').split(';') if x.strip()]
    segs = [x.strip() for x in (row.get('Authors with affiliations') or '').split(';') if x.strip()]
    affs, cur, i = [[] for _ in short], -1, 0
    for s in segs:   # a new author starts when the segment begins with the next short name
        if i < len(short) and s.startswith(short[i] + ','):
            cur, i = i, i + 1
            s = s[len(short[cur]) + 1:].strip()
        elif i < len(short) and s == short[i]:
            cur, i = i, i + 1
            continue
        if cur >= 0:
            affs[cur].append(s)
    out = []
    for k, f in enumerate(full or short):
        m = re.match(r'(.*?)\s*\((\d+)\)\s*$', f)
        name, sid = (m.group(1), m.group(2)) if m else (f, '')
        out.append((name, sid, affs[k] if k < len(affs) else []))
    return out


def load_sjr(path):
    """ISSN -> (quartile, [subject areas]) from SCImago's journal ranking file."""
    q = {}
    if not path or not os.path.exists(path):
        return q
    with open(path, encoding='utf-8', errors='replace') as f:
        for r in csv.DictReader(f, delimiter=';'):
            quart = (r.get('SJR Best Quartile') or '').strip()
            areas = [a.strip() for a in (r.get('Areas') or '').split(';') if a.strip()]
            for issn in (r.get('Issn') or '').split(','):
                issn = issn.strip().replace('-', '').upper()
                if issn:
                    q[issn] = (quart if quart in ('Q1', 'Q2', 'Q3', 'Q4') else '', areas)
    return q


def h_index(c):
    c = sorted(c, reverse=True)
    return sum(1 for i, x in enumerate(c, 1) if x >= i)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('out')
    ap.add_argument('--site', default='')
    ap.add_argument('--sjr', default='')
    ap.add_argument('--cites', default='')
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    sjr = load_sjr(a.sjr)
    cites_now = (json.load(open(a.cites)) if a.cites and os.path.exists(a.cites) else {}).get('eid', {})
    year_now = dt.date.today().year

    docs = {}
    files = sorted(glob.glob(os.path.join(a.src, '*.csv')))
    file_uni = {}
    for p in files:
        with open(p, encoding='utf-8-sig', newline='') as f:
            rd = csv.DictReader(f)
            if 'EID' not in (rd.fieldnames or []):
                continue   # not a Scopus document export (e.g. the SJR list)
            rows = list(rd)
        votes = collections.Counter()
        for r in rows:
            votes.update(unis_in(r.get('Affiliations')))
        home = max(votes, key=lambda k: votes[k] / max(1, 1)) if votes else ''
        # the exporting university is the one present on (nearly) every row
        home = max(votes.items(), key=lambda kv: kv[1])[0] if votes else ''
        file_uni[os.path.basename(p)] = (home, len(rows), round(votes[home] / max(1, len(rows)), 3))
        for r in rows:
            eid = r.get('EID')
            if not eid:
                continue
            d = docs.get(eid)
            if d is None:
                d = docs[eid] = {'row': r, 'unis': set()}
            d['unis'].add(home)
            d['unis'] |= unis_in(r.get('Affiliations'))
    print('files:')
    for k, v in file_uni.items():
        print(' ', k[-40:], NAME.get(v[0], ('?',))[0], v[1], 'rows, coverage', v[2])

    # ------------------------------------------------------------------ per-document derived fields
    recs = []
    for eid, d in docs.items():
        r = d['row']
        y = int(r['Year']) if (r.get('Year') or '').isdigit() else None
        affs = [x.strip() for x in (r.get('Affiliations') or '').split(';') if x.strip()]
        ctry = sorted({country(x) for x in affs if x})
        issns = [x.strip().upper() for x in re.split(r'[;,\s]+', r.get('ISSN') or '') if x.strip()]
        q, areas = next((sjr[i] for i in issns if i in sjr), ('', []))
        try:
            c = int(r.get('Cited by') or 0)
        except ValueError:
            c = 0
        key = eid[7:] if eid.startswith('2-s2.0-') else eid
        c = int(cites_now.get(key, c))
        kws = [k.strip() for k in (r.get('Author Keywords') or '').split(';') if k.strip()]
        fund = [f.strip() for f in (r.get('Funding Details') or '').split(';') if f.strip()]
        recs.append({
            'eid': eid, 'y': y, 't': r.get('Title', ''), 'src': r.get('Source title', ''), 'type': r.get('Document Type', ''),
            'c': c, 'doi': r.get('DOI', ''), 'oa': bool((r.get('Open Access') or '').strip()), 'q': q, 'areas': areas,
            'unis': sorted(u for u in d['unis'] if u), 'ctry': ctry, 'intl': any(x != 'Jordan' for x in ctry),
            'kw': kws, 'fund': fund, 'authors': split_authors(r), 'issn': issns, 'pub': r.get('Publisher', ''),
            'lang': r.get('Language of Original Document', ''), 'row': r,
        })
    print(len(recs), 'unique documents')

    # ------------------------------------------------------------------ aggregates per university
    by_uni = collections.defaultdict(list)
    for x in recs:
        for u in x['unis']:
            by_uni[u].append(x)
    years = list(range(year_now - 14, year_now + 1))
    unis_out = []
    for afid, (en, ar) in NAME.items():
        L = by_uni.get(afid, [])
        if not L:
            continue
        cs = [x['c'] for x in L]
        recent = [x for x in L if x['y'] and x['y'] >= year_now - 5]
        qn = collections.Counter(x['q'] for x in L if x['q'])
        auth = collections.defaultdict(lambda: {'n': '', 'docs': 0, 'c': 0, 'recent': 0, 'kw': collections.Counter()})
        for x in L:
            for name, sid, affs in x['authors']:
                if sid and any(afid in unis_in(af) for af in affs) or (sid and not any(affs) and afid in x['unis'] and len(x['unis']) == 1):
                    au = auth[sid]
                    au['n'] = name
                    au['docs'] += 1
                    au['c'] += x['c']
                    au['recent'] += 1 if x['y'] and x['y'] >= year_now - 5 else 0
                    au['kw'].update(k.lower() for k in x['kw'][:6])
        partners_jo = collections.Counter(u for x in L for u in x['unis'] if u != afid)
        partners_c = collections.Counter(c for x in L for c in x['ctry'] if c != 'Jordan')
        kw_old = collections.Counter(k.lower() for x in L if x['y'] and year_now - 10 <= x['y'] < year_now - 4 for k in x['kw'])
        kw_new = collections.Counter(k.lower() for x in L if x['y'] and x['y'] >= year_now - 4 for k in x['kw'])
        n_old, n_new = max(1, sum(kw_old.values())), max(1, sum(kw_new.values()))
        rising = sorted(((k, v, round((v / n_new) / ((kw_old.get(k, 0) + 1) / n_old), 2)) for k, v in kw_new.items()
                         if v >= 5 and k not in STOP_KW), key=lambda t: -t[2])[:20]
        unis_out.append({
            'afid': afid, 'name': en, 'name_ar': ar, 'docs': len(L), 'cites': sum(cs), 'cpd': round(sum(cs) / len(L), 2),
            'h': h_index(cs), 'h5': h_index([x['c'] for x in recent]), 'recent': len(recent),
            'by_year': {str(y): sum(1 for x in L if x['y'] == y) for y in years},
            'cites_by_year': {str(y): sum(x['c'] for x in L if x['y'] == y) for y in years},
            'q': {k: qn.get(k, 0) for k in ('Q1', 'Q2', 'Q3', 'Q4')}, 'q_known': sum(qn.values()),
            'q12_share': round((qn.get('Q1', 0) + qn.get('Q2', 0)) / max(1, sum(qn.values())), 3),
            'intl_share': round(sum(1 for x in L if x['intl']) / len(L), 3),
            'oa_share': round(sum(1 for x in L if x['oa']) / len(L), 3),
            'funded_share': round(sum(1 for x in L if x['fund']) / len(L), 3),
            'uncited_share': round(sum(1 for x in L if x['c'] == 0) / len(L), 3),
            'types': collections.Counter(x['type'] for x in L).most_common(8),
            'areas': collections.Counter(a_ for x in L for a_ in x['areas']).most_common(15),
            'journals': [[s, n, round(sum(x['c'] for x in L if x['src'] == s) / n, 1),
                          next((x['q'] for x in L if x['src'] == s and x['q']), '')]
                         for s, n in collections.Counter(x['src'] for x in L if x['src']).most_common(20)],
            'publishers': collections.Counter(x['pub'] for x in L if x['pub']).most_common(10),
            'countries': partners_c.most_common(25), 'partners_jo': partners_jo.most_common(27),
            'funders': collections.Counter(f.split(',')[0][:120] for x in L for f in x['fund']).most_common(15),
            'keywords': collections.Counter(k.lower() for x in L for k in x['kw'] if k.lower() not in STOP_KW).most_common(30),
            'rising': rising,
            'top_authors': sorted(({'sid': s, 'n': v['n'], 'docs': v['docs'], 'c': v['c'], 'recent': v['recent'],
                                    'kw': [k for k, _ in v['kw'].most_common(5)]} for s, v in auth.items()),
                                  key=lambda z: (-z['c'], -z['docs']))[:25],
            'authors': len(auth),
            'top_docs': [{'eid': x['eid'], 't': x['t'][:220], 'y': x['y'], 'src': x['src'], 'c': x['c'], 'doi': x['doi']}
                         for x in sorted(L, key=lambda z: -z['c'])[:10]],
        })
    unis_out.sort(key=lambda u: -u['docs'])

    # collaboration matrix between Jordanian universities
    ids = [u['afid'] for u in unis_out]
    mat = [[0] * len(ids) for _ in ids]
    pos = {u: i for i, u in enumerate(ids)}
    for x in recs:
        us = [u for u in x['unis'] if u in pos]
        for i in us:
            for j in us:
                if i != j:
                    mat[pos[i]][pos[j]] += 1

    # experts directory: every author with a Jordanian affiliation (for finding collaborators by topic)
    experts = {}
    for x in recs:
        for name, sid, affs in x['authors']:
            if not sid:
                continue
            us = set().union(*[unis_in(af) for af in affs]) if affs else set()
            if not us:
                continue
            e = experts.setdefault(sid, {'n': name, 'u': collections.Counter(), 'docs': 0, 'c': 0, 'recent': 0, 'kw': collections.Counter(), 'y1': 9999, 'y2': 0})
            e['u'].update(us)
            e['docs'] += 1
            e['c'] += x['c']
            if x['y']:
                e['recent'] += x['y'] >= year_now - 5
                e['y1'], e['y2'] = min(e['y1'], x['y']), max(e['y2'], x['y'])
            e['kw'].update(k.lower() for k in x['kw'][:8] if k.lower() not in STOP_KW)
    exp_out = [[sid, e['n'], e['u'].most_common(1)[0][0], e['docs'], e['c'], e['recent'], e['y2'],
                '; '.join(k for k, _ in e['kw'].most_common(8))]
               for sid, e in experts.items() if e['docs'] >= 2]
    exp_out.sort(key=lambda z: -z[4])
    print(len(exp_out), 'researchers with 2+ documents')

    total = {'docs': len(recs), 'cites': sum(x['c'] for x in recs), 'intl_share': round(sum(1 for x in recs if x['intl']) / len(recs), 3),
             'by_year': {str(y): sum(1 for x in recs if x['y'] == y) for y in years}, 'authors': len(experts),
             'countries': collections.Counter(c for x in recs for c in x['ctry'] if c != 'Jordan').most_common(30),
             'areas': collections.Counter(a_ for x in recs for a_ in x['areas']).most_common(27)}
    obs = {'updated': dt.date.today().isoformat(), 'source': 'Scopus exports (University of Petra subscription)',
           'total': total, 'universities': unis_out, 'matrix': {'ids': ids, 'm': mat}, 'experts_cols':
           ['scopus_id', 'name', 'afid', 'docs', 'cites', 'docs_5y', 'last_year', 'keywords'], 'experts': exp_out,
           'files': {k: list(v) for k, v in file_uni.items()}}
    with open(os.path.join(a.out, 'observatory.json'), 'w', encoding='utf-8') as f:
        json.dump(obs, f, ensure_ascii=False, separators=(',', ':'))
    if a.site:
        site = dict(obs)
        site.pop('files')
        with open(os.path.join(a.site, 'observatory.json'), 'w', encoding='utf-8') as f:
            json.dump(site, f, ensure_ascii=False, separators=(',', ':'))

    # flat documents table for Excel / further analysis
    with open(os.path.join(a.out, 'documents_all.tsv'), 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f, delimiter='\t')
        w.writerow(['EID', 'Year', 'Title', 'Source', 'Type', 'Citations', 'Quartile', 'Subject areas', 'Open access',
                    'Jordanian universities', 'Countries', 'International', 'Author keywords', 'Funding', 'DOI', 'Publisher', 'Language'])
        for x in recs:
            w.writerow([x['eid'], x['y'], x['t'], x['src'], x['type'], x['c'], x['q'], '; '.join(x['areas']), 'yes' if x['oa'] else '',
                        '; '.join(NAME[u][0] for u in x['unis'] if u in NAME), '; '.join(x['ctry']), 'yes' if x['intl'] else '',
                        '; '.join(x['kw']), '; '.join(x['fund']), x['doi'], x['pub'], x['lang']])
    import pickle
    with open(os.path.join(a.out, 'recs.pkl'), 'wb') as f:
        pickle.dump(recs, f)


if __name__ == '__main__':
    main()
