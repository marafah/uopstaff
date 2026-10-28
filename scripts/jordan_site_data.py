#!/usr/bin/env python3
"""Compact data for the website from the Jordanian observatory (no personal data beyond public Scopus author names):
   data/research/jordan/cube.json      university x year x field/speciality: documents, citations, Q1-Q4, international, open access
   data/research/jordan/unis.json      university profiles (journals, countries, partners, rising topics, top researchers, Petra gaps)
   data/research/jordan/experts.json   Jordanian researchers with 2+ documents (name, university, output, topics, Scopus ID)
   data/research/journals.json         SCImago journal list + how Jordanian researchers use each journal
   data/research/jordan/journal_dois.json  sample of recent DOIs per journal (the weekly job reads their review times from Crossref)
Usage: python scripts/jordan_site_data.py <observatory folder> <sjr.csv> <repo root>"""
from __future__ import annotations

import collections
import csv
import json
import os
import pickle
import re
import sys

obs_dir, sjr_path, root = sys.argv[1:4]
OUT = os.path.join(root, 'data', 'research', 'jordan')
os.makedirs(OUT, exist_ok=True)
O = json.load(open(os.path.join(obs_dir, 'observatory.json'), encoding='utf-8'))
recs = pickle.load(open(os.path.join(obs_dir, 'recs.pkl'), 'rb'))


def dump(path, obj):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
    print(os.path.relpath(path, root), round(os.path.getsize(path) / 1e6, 2), 'MB')


# ------------------------------------------------------------------ SCImago journals
journals, by_issn = [], {}
with open(sjr_path, encoding='utf-8', errors='replace') as f:
    rd = csv.reader(f, delimiter=';')
    head = next(rd)
    ix = {h: i for i, h in reversed(list(enumerate(head)))}   # first occurrence of duplicated headers
    for r in rd:
        g = lambda k: r[ix[k]].strip() if k in ix and ix[k] < len(r) else ''
        cats = []
        for c in g('Categories').split(';'):
            m = re.match(r'\s*(.*?)\s*\((Q\d)\)\s*$', c)
            if m:
                cats.append([m.group(1), m.group(2)])
            elif c.strip():
                cats.append([c.strip(), ''])
        issns = [x.strip().upper() for x in g('Issn').split(',') if x.strip() and x.strip() != '-']
        try:
            sjr = float(g('SJR').replace(',', '.') or 0)
        except ValueError:
            sjr = 0
        j = {'id': g('Sourceid'), 't': g('Title'), 'type': g('Type'), 'issn': issns, 'pub': g('Publisher'),
             'oa': g('Open Access') == 'Yes', 'diamond': g('Open Access Diamond') == 'Yes', 'sjr': sjr,
             'q': g('SJR Best Quartile') if g('SJR Best Quartile') in ('Q1', 'Q2', 'Q3', 'Q4') else '',
             'h': int(g('H index') or 0) if g('H index').isdigit() else 0, 'rank': int(g('Rank') or 0) if g('Rank').isdigit() else 0,
             'cpd2': g('Citations / Doc. (2years)').replace(',', '.'), 'docs': g('Total Docs. (2025)'),
             'country': g('Country'), 'cov': g('Coverage'), 'cats': cats, 'areas': [a.strip() for a in g('Areas').split(';') if a.strip()]}
        journals.append(j)
        for i in issns:
            by_issn[i] = j
print(len(journals), 'SCImago sources')

# ------------------------------------------------------------------ attach journal + categories to every document
cat_names, area_names = {}, {}
for x in recs:
    j = next((by_issn[i] for i in x['issn'] if i in by_issn), None)
    x['_j'] = j
    x['_cats'] = [c for c, _ in j['cats']] if j else []

U = O['universities']
uni_ids = [u['afid'] for u in U]
uidx = {a: i for i, a in enumerate(uni_ids)}
areas = sorted({a for x in recs for a in x['areas']})
cats = sorted({c for x in recs for c in x['_cats']})
aidx = {a: i for i, a in enumerate(areas)}
cidx = {c: i for i, c in enumerate(cats)}
cat_area = collections.defaultdict(collections.Counter)
for j in journals:
    for c, _ in j['cats']:
        for a in j['areas']:
            cat_area[c][a] += 1

QI = {'Q1': 0, 'Q2': 1, 'Q3': 2, 'Q4': 3}


def cube(dim):
    """rows: [uni, year, dim index (-1 = all), docs, cites, q1, q2, q3, q4, intl, oa, conf]"""
    acc = collections.defaultdict(lambda: [0] * 9)
    for x in recs:
        y = x['y'] if x['y'] and x['y'] >= 1990 else 1989
        keys = [-1] if dim is None else ([aidx[a] for a in x['areas']] if dim == 'area' else [cidx[c] for c in x['_cats']])
        for u in x['unis']:
            if u not in uidx:
                continue
            for k in keys:
                v = acc[(uidx[u], y, k)]
                v[0] += 1
                v[1] += x['c']
                if x['q'] in QI:
                    v[2 + QI[x['q']]] += 1
                v[6] += x['intl']
                v[7] += x['oa']
                v[8] += x['type'] in ('Conference paper', 'Conference review')
    return [[k[0], k[1], k[2]] + v for k, v in acc.items()]


# compact per-document index: the weekly job rebuilds cube.json from it with current citations
with open(os.path.join(OUT, 'docs.tsv'), 'w', encoding='utf-8') as f:
    f.write('eid\ty\tunis\tareas\tcats\tq\tintl\toa\tconf\tc\n')
    for x in recs:
        f.write('\t'.join([x['eid'][7:] if x['eid'].startswith('2-s2.0-') else x['eid'], str(x['y'] or ''),
                           ','.join(str(uidx[u]) for u in x['unis'] if u in uidx), ','.join(str(aidx[a]) for a in x['areas']),
                           ','.join(str(cidx[c]) for c in x['_cats']), x['q'], '1' if x['intl'] else '', '1' if x['oa'] else '',
                           '1' if x['type'] in ('Conference paper', 'Conference review') else '', str(x['c'])]) + '\n')
print('docs.tsv', round(os.path.getsize(os.path.join(OUT, 'docs.tsv')) / 1e6, 2), 'MB')
dump(os.path.join(OUT, 'cube.json'), {
    'cols': ['u', 'y', 'k', 'docs', 'cites', 'q1', 'q2', 'q3', 'q4', 'intl', 'oa', 'conf'],
    'unis': [[u['afid'], u['name'], u['name_ar']] for u in U], 'areas': areas, 'cats': cats,
    'cat_area': [[aidx[a] for a, _ in cat_area[c].most_common(2) if a in aidx] for c in cats],
    'all': cube(None), 'area': cube('area'), 'cat': cube('cat'), 'updated': O['updated']})

# h-index needs the citation list: per university x period (all, last 5, last 10 years) x area
h_tab = collections.defaultdict(list)
Y = max(x['y'] or 0 for x in recs)
for x in recs:
    for u in x['unis']:
        for span in ('all', '10', '5'):
            if span != 'all' and not (x['y'] and x['y'] > Y - int(span)):
                continue
            h_tab[(u, span, -1)].append(x['c'])
            for a in x['areas']:
                h_tab[(u, span, aidx[a])].append(x['c'])


def h_index(c):
    c = sorted(c, reverse=True)
    return sum(1 for i, v in enumerate(c, 1) if v >= i)


hrows = [[uidx[u], s, k, h_index(c)] for (u, s, k), c in h_tab.items() if u in uidx]

# journals per university (with area), Jordanian use of each journal
jj = collections.defaultdict(lambda: [0, 0])
j_uses = collections.defaultdict(lambda: {'docs': 0, 'c': 0, 'unis': collections.Counter(), 'y': collections.Counter(), 'kw': collections.Counter(), 'dois': []})
for x in recs:
    j = x['_j']
    key = j['id'] if j else 'n:' + (x['src'] or '').lower()
    for u in x['unis']:
        if u in uidx:
            v = jj[(uidx[u], key)]
            v[0] += 1
            v[1] += x['c']
    if j:
        s = j_uses[j['id']]
        s['docs'] += 1
        s['c'] += x['c']
        s['unis'].update(u for u in x['unis'] if u in uidx)
        if x['y']:
            s['y'][x['y']] += 1
        s['kw'].update(k.lower() for k in x['kw'][:6])
        if x['doi'] and (x['y'] or 0) >= Y - 3:
            s['dois'].append(x['doi'])
names = {}
for x in recs:
    if not x['_j'] and x['src']:
        names['n:' + x['src'].lower()] = x['src']
jrows = [[u, k, d, c] for (u, k), (d, c) in jj.items() if d >= 3]
jmeta = {}
for j in journals:
    if j['id'] in {r[1] for r in jrows}:
        jmeta[j['id']] = [j['t'], j['q'], j['sjr'], 1 if j['oa'] else 0]
# national rising topics and the home university's presence in them
kw_new = collections.Counter(k.lower() for x in recs if x['y'] and x['y'] > Y - 4 for k in x['kw'])
kw_old = collections.Counter(k.lower() for x in recs if x['y'] and Y - 10 < x['y'] <= Y - 4 for k in x['kw'])
n_new, n_old = sum(kw_new.values()) or 1, sum(kw_old.values()) or 1
by_kw_uni = collections.defaultdict(collections.Counter)
for x in recs:
    if x['y'] and x['y'] > Y - 4:
        for k in x['kw']:
            for u in x['unis']:
                if u in uidx:
                    by_kw_uni[k.lower()][uidx[u]] += 1
national_rising = sorted(([k, v, round((v / n_new) / ((kw_old.get(k, 0) + 1) / n_old), 1), dict(by_kw_uni[k].most_common())]
                          for k, v in kw_new.items() if v >= 30 and k not in ('jordan',)), key=lambda t: -t[2])[:80]
dump(os.path.join(OUT, 'unis.json'), {
    'updated': O['updated'], 'total': O['total'], 'universities': [{k: v for k, v in u.items() if k not in ('top_docs',)} for u in U],
    'matrix': O['matrix'], 'h': hrows, 'journals': jrows, 'jmeta': jmeta, 'rising': national_rising, 'year': Y,
    'jnames': {k: names[k] for k in {r[1] for r in jrows} if k.startswith('n:') and k in names}})

# experts
dump(os.path.join(OUT, 'experts.json'), {'cols': O['experts_cols'], 'rows': O['experts'], 'updated': O['updated']})

# journal directory: every SCImago source; Jordanian usage where any
out = []
area_ix = {a: i for i, a in enumerate(sorted({a for j in journals for a in j['areas']}))}
pubs = collections.Counter(j['pub'] for j in journals)
pub_ix = {p: i for i, (p, _) in enumerate(pubs.most_common())}
countries = sorted({j['country'] for j in journals})
c_ix = {c: i for i, c in enumerate(countries)}
for j in journals:
    s = j_uses.get(j['id'])
    jo = 0
    if s:
        jo = [s['docs'], round(s['c'] / s['docs'], 1), sum(n for y, n in s['y'].items() if y > Y - 5),
              [[uidx[u], n] for u, n in s['unis'].most_common(8)], [k for k, _ in s['kw'].most_common(12) if k != 'jordan']]
    out.append([j['id'], j['t'], j['type'][:1], ' '.join(j['issn']), pub_ix[j['pub']], (2 if j['diamond'] else 1) if j['oa'] else 0,
                j['q'], j['sjr'], j['h'], j['rank'], c_ix[j['country']], '; '.join(f'{c}|{q}' for c, q in j['cats']),
                [area_ix[a] for a in j['areas']], j['cpd2'], j['cov'], jo])
dump(os.path.join(root, 'data', 'research', 'journals.json'), {
    'updated': O['updated'], 'sjr_year': 2025,
    'cols': ['id', 't', 'type', 'issn', 'pub', 'oa', 'q', 'sjr', 'h', 'rank', 'country', 'cats', 'areas', 'cpd2', 'cov', 'jo'],
    'jo_cols': ['docs', 'cpd', 'docs_5y', 'unis', 'kw'], 'areas': list(area_ix), 'publishers': list(pub_ix), 'countries': countries,
    'universities': [[u['afid'], u['name_ar']] for u in U], 'rows': out})
dump(os.path.join(OUT, 'journal_dois.json'), {jid: s['dois'][-15:] for jid, s in j_uses.items() if len(s['dois']) >= 3})
raise SystemExit
for j in journals:
    s = j_uses.get(j['id'])
    row = {k: j[k] for k in ('id', 't', 'type', 'issn', 'pub', 'oa', 'q', 'sjr', 'h', 'rank', 'country', 'cats', 'areas', 'cpd2', 'cov')}
    if j['diamond']:
        row['diamond'] = 1
    if s:
        row['jo'] = {'docs': s['docs'], 'cpd': round(s['c'] / s['docs'], 1),
                     'unis': [[uidx[u], n] for u, n in s['unis'].most_common(8)],
                     'y5': sum(n for y, n in s['y'].items() if y > Y - 5),
                     'kw': [k for k, _ in s['kw'].most_common(12) if k != 'jordan']}
    out.append(row)
dump(os.path.join(root, 'data', 'research', 'journals.json'), {'updated': O['updated'], 'sjr_year': 2025, 'areas': areas, 'universities': [[u['afid'], u['name_ar']] for u in U], 'journals': out})
dump(os.path.join(OUT, 'journal_dois.json'), {jid: s['dois'][-15:] for jid, s in j_uses.items() if len(s['dois']) >= 3})
