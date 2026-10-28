#!/usr/bin/env python3
"""Offline test: runs update_research.py against simulated University / OpenAlex / Scopus / Scholar
responses with FICTIONAL people, so the pipeline and the pages can be checked without network.

    python scripts/test_research_mock.py /tmp/rs-test     # writes /tmp/rs-test/data/research/*.json
"""
import json
import os
import random
import re
import shutil
import sys
import types
from urllib.parse import urlparse, parse_qs

HERE = os.path.dirname(os.path.abspath(__file__))
out_root = sys.argv[1] if len(sys.argv) > 1 else '/tmp/rs-test'
os.makedirs(os.path.join(out_root, 'data', 'research', 'scopus_export'), exist_ok=True)
random.seed(7)

FIRST = ['سامر', 'ليلى', 'خالد', 'رنا', 'عمر', 'هبة', 'يوسف', 'دانا', 'طارق', 'سلمى', 'باسل', 'نور', 'زيد', 'ريم', 'مازن', 'لينا']
LAST = ['الحداد', 'النجار', 'العطار', 'الخطيب', 'السعدي', 'المصري', 'الشامي', 'الزعبي', 'الحسيني', 'العمري', 'الطويل', 'القاضي']
FIRST_EN = ['Samer', 'Layla', 'Khaled', 'Rana', 'Omar', 'Heba', 'Yousef', 'Dana', 'Tareq', 'Salma', 'Basel', 'Nour', 'Zaid', 'Reem', 'Mazen', 'Lina']
LAST_EN = ['Haddad', 'Najjar', 'Attar', 'Khatib', 'Saadi', 'Masri', 'Shami', 'Zoubi', 'Husseini', 'Omari', 'Taweel', 'Qadi']
FACS = [('1', 'تكنولوجيا المعلومات', 'Information Technology', ['أمن المعلومات', 'علم الحاسوب', 'الذكاء الاصطناعي']),
        ('2', 'الهندسة', 'Engineering', ['الهندسة المدنية', 'الهندسة الكهربائية']),
        ('3', 'الصيدلة والعلوم الطبية', 'Pharmacy', ['الصيدلانيات', 'العلوم الطبية المخبرية']),
        ('4', 'العلوم الإدارية والمالية', 'Business', ['المحاسبة', 'التسويق الرقمي', 'إدارة الأعمال']),
        ('5', 'الآداب والعلوم', 'Arts and Sciences', ['اللغة الإنجليزية', 'الرياضيات'])]
FIELDS = {'1': ['Computer Science', 'Engineering'], '2': ['Engineering', 'Materials Science'], '3': ['Pharmacology, Toxicology and Pharmaceutics', 'Medicine'],
          '4': ['Business, Management and Accounting', 'Economics, Econometrics and Finance'], '5': ['Arts and Humanities', 'Mathematics']}
TOPICS = {'Computer Science': ['Network Security and Intrusion Detection', 'Deep Learning in Medical Imaging', 'IoT and Edge Computing'],
          'Engineering': ['Smart Grid Optimization', 'Structural Health Monitoring'], 'Materials Science': ['Concrete Durability'],
          'Pharmacology, Toxicology and Pharmaceutics': ['Drug Delivery Nanoparticles', 'Antimicrobial Resistance'], 'Medicine': ['Diabetes Management'],
          'Business, Management and Accounting': ['Digital Marketing Adoption', 'Corporate Governance'], 'Economics, Econometrics and Finance': ['Islamic Finance'],
          'Arts and Humanities': ['Second Language Acquisition'], 'Mathematics': ['Fractional Differential Equations']}
VENUES = ['IEEE Access', 'Sustainability', 'Heliyon', 'Journal of Theoretical and Applied Information Technology', 'Cogent Business & Management',
          'International Journal of Pharmaceutics', 'Jordan Journal of Mechanical and Industrial Engineering', 'Mathematics', 'PLoS ONE', 'Applied Sciences']
COUNTRIES = ['JO', 'SA', 'AE', 'MY', 'GB', 'US', 'EG', 'IQ', 'QA', 'TR']
RANKS = [('أستاذ', 1, 'Professor'), ('أستاذ مشارك', 2, 'Associate Professor'), ('أستاذ مساعد', 3, 'Assistant Professor'), ('مدرس', 4, 'Lecturer')]

members, people = [], {}
N = 48
for i in range(N):
    fid, far, fen, depts = FACS[i % len(FACS)]
    fn, ln = i % 16, (i * 5) % 12
    rank = RANKS[min(3, (i * 7) % 5)] if i % 11 else RANKS[0]
    email = f'user{i}@uop.edu.jo'
    uid = ''.join(f'{ord(c):02x}00' for c in email)
    pid = f'A50{i:05d}'
    n_works = 0 if i % 13 == 7 else random.randint(3, 60 if rank[1] <= 2 else 25)
    people[uid] = {'i': i, 'fid': fid, 'pid': pid, 'n': n_works, 'name_en': f'{FIRST_EN[fn]} {LAST_EN[ln]}',
                   'orcid': f'0000-0002-{1000 + i:04d}-{2000 + i:03d}X'[:19] if i % 3 else '', 'scopus': str(57200000000 + i) if i % 2 else '',
                   'scholar': f'FAKE{i:04d}AAAAJ' if i % 4 != 3 else '', 'dept': depts[i % len(depts)]}
    members.append({'id': f'A:{uid.upper()}', 'type': 'academic', 'faculty': int(fid), 'name': f'د. {FIRST[fn]} {LAST[ln]}', 'name_en': f'{FIRST_EN[fn]} {LAST_EN[ln]}',
                    'rank': rank[0], 'rank_order': rank[1], 'job': rank[0], 'department': depts[i % len(depts)], 'specialization': 'تخصص تجريبي',
                    'email': email, 'photo': '', 'profile': f'https://fit.uop.edu.jo/Ar/Pages/AcademicStaffInfo.aspx?uid={uid.upper()}'})
staff = {'faculties': [{'id': f[0], 'name': 'كلية ' + f[1], 'name_en': f[2]} for f in FACS], 'members': members}
with open(os.path.join(out_root, 'data', 'staff.json'), 'w', encoding='utf-8') as f:
    json.dump(staff, f, ensure_ascii=False)

# a shared pool of works so colleagues co-author
WORKS = {}
wid = 1000
for uid, p in people.items():
    p['works'] = []
    for k in range(p['n']):
        wid += 1
        field = random.choice(FIELDS[p['fid']])
        y = random.choice(range(2008, 2027)) if k % 4 else random.choice(range(2021, 2027))
        w = {'id': f'https://openalex.org/W{wid}', 'doi': f'https://doi.org/10.1234/fake.{wid}' if k % 5 else None,
             'title': f'{random.choice(TOPICS[field])}: a study {wid}', 'publication_year': y, 'type': random.choice(['article', 'article', 'article', 'book-chapter', 'review']),
             'cited_by_count': int(random.paretovariate(1.3) * 3) if y < 2026 else 0,
             'open_access': random.choice([{'oa_status': 'gold', 'oa_url': 'https://example.org/pdf'}, {'oa_status': 'closed'}, {'oa_status': 'green', 'oa_url': 'https://example.org/repo'}, {'oa_status': 'closed'}]),
             'primary_location': {'source': {'display_name': random.choice(VENUES), 'type': 'journal', 'issn_l': '1234-5678'}},
             'authorships': [{'author': {'id': f'https://openalex.org/{p["pid"]}', 'display_name': p['name_en']}, 'countries': ['JO']}]
             + [{'author': {'id': f'https://openalex.org/A9{random.randint(1000, 9999)}', 'display_name': 'External Author'}, 'countries': [random.choice(COUNTRIES)]} for _ in range(random.randint(0, 3))],
             'primary_topic': {'display_name': random.choice(TOPICS[field]), 'field': {'display_name': field}, 'subfield': {'display_name': field}},
             'sustainable_development_goals': [{'display_name': random.choice(['Quality Education', 'Good health and well-being', 'Industry, innovation and infrastructure'])}] if k % 3 == 0 else [],
             'fwci': round(random.uniform(0, 3), 2)}
        WORKS[w['id']] = w
        p['works'].append(w['id'])
# co-authorship: same faculty mostly, some cross-faculty
uids = list(people)
for _ in range(90):
    a = random.choice(uids)
    b = random.choice([u for u in uids if people[u]['fid'] == people[a]['fid']] if random.random() < .75 else uids)
    if a == b or not people[a]['works']:
        continue
    w = WORKS[random.choice(people[a]['works'])]
    if not any(x['author']['id'].endswith(people[b]['pid']) for x in w['authorships']):
        w['authorships'].append({'author': {'id': f'https://openalex.org/{people[b]["pid"]}', 'display_name': people[b]['name_en']}, 'countries': ['JO']})
        people[b]['works'].append(w['id'])

# a Scopus CSV export with part of the works
with open(os.path.join(out_root, 'data', 'research', 'scopus_export', 'scopus.csv'), 'w', encoding='utf-8-sig', newline='') as f:
    import csv
    wr = csv.DictWriter(f, ['Authors', 'Author(s) ID', 'Title', 'Year', 'Source title', 'Cited by', 'DOI', 'Document Type', 'Open Access', 'EID'])
    wr.writeheader()
    for i, w in enumerate(WORKS.values()):
        if i % 3:
            continue
        ids = [people[u]['scopus'] for u in uids if people[u]['scopus'] and w['id'] in people[u]['works']]
        wr.writerow({'Authors': 'X.', 'Author(s) ID': ';'.join(ids), 'Title': w['title'], 'Year': w['publication_year'], 'Source title': w['primary_location']['source']['display_name'],
                     'Cited by': int(w['cited_by_count'] * .8), 'DOI': (w['doi'] or '').replace('https://doi.org/', ''), 'Document Type': 'Article', 'Open Access': '', 'EID': f'2-s2.0-85{i:09d}'})


class Resp:
    def __init__(self, obj, status=200, text=None):
        self.status_code, self._o = status, obj
        self.text = text if text is not None else json.dumps(obj)

    def json(self):
        return self._o


def by_pid(pid):
    return next((p for p in people.values() if p['pid'] == pid), None)


def fake_http(method, url, tries=4, **kw):
    u = urlparse(url)
    q = {k: v[0] for k, v in parse_qs(u.query).items()}
    q.update({k: str(v) for k, v in (kw.get('params') or {}).items()})
    path = u.path
    if 'services.uop.edu.jo' in u.netloc:
        uid = (q.get('instructorNumber') or q.get('InstructorNumber') or '').lower()
        p = people.get(uid)
        if not p:
            return Resp({}, 404)
        if path.endswith('GetMember'):
            fid, far, fen, _ = FACS[int(p['fid']) - 1]
            return Resp({'FacultyID': fid, 'FacultyName': fen, 'FacultyNameArabic': 'كلية ' + far, 'DeptNameArabic': p['dept'], 'DeptName': 'Dept',
                         'AcademicRankEnglish': 'Associate Professor', 'PersonalEmail': 'secret@x.com', 'Mobile': '0790000000', 'HomeAddress': 'secret'})
        if path.endswith('Links'):
            return Resp({'GoogleScholarProfile': f'https://scholar.google.com/citations?user={p["scholar"]}&hl' if p['scholar'] else None,
                         'ScopusProfile': f'https://www.scopus.com/authid/detail.uri?authorId={p["scopus"]}' if p['scopus'] else '',
                         'OrcidProfile': f'https://orcid.org/{p["orcid"]}' if p['orcid'] else None, 'JOIPProfile': '', 'LinkedinProfile': 'www.linkedin.com/in/fake ', 'objOtherLinks': []})
        if 'ResearchInterests' in path:
            return Resp([{'TitleAR': 'اهتمامات بحثية تجريبية في المجال.', 'TitleEN': 'Sample research interests.'}])
        if 'Publication' in path:
            pubs = []
            for k, w_id in enumerate(p['works'][:max(0, len(p['works']) - 2)]):
                w = WORKS[w_id]
                pubs.append({'ID': 50000 + int(w_id.split('W')[-1]), 'PublicationType': 'Journal Paper', 'Title': w['title'] if k % 4 else w['title'].upper(),
                             'TitleOf': w['primary_location']['source']['display_name'], 'Year': w['publication_year'],
                             'DoiOnlineData': ('DOI: ' + w['doi'].replace('https://doi.org/', '')) if (w['doi'] and k % 2) else '', 'Link': 'https://example.org/paper', 'objAuthors': [{'Title': p['name_en']}]})
            pubs.append({'ID': 99000 + p['i'], 'PublicationType': 'Conference paper', 'Title': f'Unindexed local conference paper {p["i"]}', 'TitleOf': 'Local Conf', 'Year': 2019, 'DoiOnlineData': '', 'Link': '', 'objAuthors': []})
            return Resp(pubs)
    if 'openalex.org' in u.netloc:
        if path == '/authors':
            flt = q.get('filter', '')
            m = re.search(r'orcid:([\dX-]+)', flt)
            if m:
                return Resp({'results': [{'id': 'https://openalex.org/' + p['pid'], 'orcid': p['orcid']} for p in people.values() if p['orcid'] == m.group(1)]})
            s = q.get('search', '')
            res = [{'id': 'https://openalex.org/' + p['pid'], 'display_name': p['name_en'], 'display_name_alternatives': [], 'orcid': ('https://orcid.org/' + p['orcid']) if p['orcid'] else None}
                   for p in people.values() if p['name_en'].lower().replace(' ', '') in s.replace(' ', '') or s.replace(' ', '') in p['name_en'].lower().replace(' ', '')]
            return Resp({'results': res})
        if path.startswith('/authors/'):
            p = by_pid(path.split('/')[-1])
            years = {}
            for w_id in p['works']:
                for y in range(WORKS[w_id]['publication_year'], 2027):
                    years[y] = years.get(y, 0) + max(0, WORKS[w_id]['cited_by_count'] // max(1, 2027 - WORKS[w_id]['publication_year']))
            return Resp({'counts_by_year': [{'year': y, 'cited_by_count': c} for y, c in years.items() if y >= 2012]})
        if path == '/works' and 'group_by' in q:
            gb = q['group_by']
            if gb == 'publication_year':
                return Resp({'group_by': [{'key': str(y), 'count': random.randint(50, 400) + (y - 2000) * 9} for y in range(2000, 2027)]})
            if 'field' in gb:
                return Resp({'group_by': [{'key': f'f{i}', 'key_display_name': f, 'count': random.randint(20, 900)} for i, f in enumerate(sorted({x for v in FIELDS.values() for x in v}))]})
            if gb == 'open_access.is_oa':
                return Resp({'group_by': [{'key': 'true', 'count': random.randint(300, 900)}, {'key': 'false', 'count': random.randint(500, 1500)}]})
            if 'countries' in gb:
                return Resp({'group_by': [{'key': 'https://openalex.org/countries/' + c, 'count': random.randint(10, 300)} for c in COUNTRIES]})
            return Resp({'group_by': [{'key': 'x' + str(i), 'key_display_name': f'Item {i}', 'count': 100 - i * 3} for i in range(12)]})
        if path == '/works':
            ids = re.search(r'author\.id:([\w|]+)', q.get('filter', '')).group(1).split('|')
            res = [w for w in WORKS.values() if any(a['author']['id'].split('/')[-1] in ids for a in w['authorships'])]
            return Resp({'results': res, 'meta': {'next_cursor': None}})
        if path == '/institutions':
            unis = [('I36622005', 'Petra University', 3784, 58307, 86), ('I114972647', 'University of Jordan', 38033, 1119541, 276), ('I156983542', 'Jordan University of Science and Technology', 25885, 1060505, 261),
                    ('I85507684', 'Yarmouk University', 15906, 283679, 168), ('I146367977', 'Applied Science Private University', 9511, 173843, 131), ('I104941359', 'Al-Ahliyya Amman University', 8427, 152795, 130),
                    ('I153687341', 'Zarqa University', 7678, 101948, 105), ('I91633459', 'Middle East University', 4585, 83925, 102), ('I92449659', 'Isra University', 4092, 72121, 95),
                    ('I230091363', 'German Jordanian University', 3537, 83897, 100), ('I158749337', 'Princess Sumaya University for Technology', 3420, 77463, 98)]
            return Resp({'results': [{'id': 'https://openalex.org/' + a, 'display_name': n, 'works_count': w, 'cited_by_count': c, 'summary_stats': {'h_index': h, 'i10_index': h * 9, '2yr_mean_citedness': c / w / 6},
                                      'counts_by_year': [{'year': y, 'works_count': w // 25, 'cited_by_count': c // 14 + (y - 2015) * 90} for y in range(2015, 2027)], 'homepage_url': 'https://example.org'} for a, n, w, c, h in unis]})
    return Resp({}, 404)


class FakeSession:
    headers = {}

    def get(self, url, params=None, **kw):
        gid = (params or {}).get('user', '')
        if gid.endswith('0007AAAAJ'):
            return Resp(None, 429, 'blocked')
        nums = [random.randint(50, 900), random.randint(20, 400), random.randint(3, 20), random.randint(2, 15), random.randint(1, 30), random.randint(0, 20)]
        html = ''.join(f'<td class="gsc_rsb_std">{n}</td>' for n in nums) + ''.join(f'<span class="gsc_g_t" style="">{y}</span>' for y in range(2019, 2027)) + ''.join(f'<span class="gsc_g_al">{random.randint(5, 90)}</span>' for _ in range(8))
        return Resp(None, 200, html)


sys.path.insert(0, HERE)
import update_research as ur  # noqa: E402

ur.ROOT, ur.DATA, ur.OUT = out_root, os.path.join(out_root, 'data'), os.path.join(out_root, 'data', 'research')
ur.http = fake_http
ur.S = FakeSession()
ur.time.sleep = lambda s: None
sys.argv = ['update_research.py']
ur.main()

r = json.load(open(os.path.join(ur.OUT, 'researchers.json'), encoding='utf-8'))
w = json.load(open(os.path.join(ur.OUT, 'works.json'), encoding='utf-8'))
txt = json.dumps(r, ensure_ascii=False)
assert 'secret' not in txt and '0790000000' not in txt, 'private fields leaked'
print('researchers', len(r['researchers']), 'works', len(w['works']), 'matched', r['meta']['matched_openalex'])
print('match kinds', {k: sum(1 for x in r['researchers'] if x['oa_match'] == k) for k in {x['oa_match'] for x in r['researchers']}})
print('sources', {s: sum(1 for x in w['works'] if s in x.get('src', '')) for s in 'ous'}, 'u-only', sum(1 for x in w['works'] if x.get('src') == 'u'))
print('with scholar metrics', sum(1 for x in r['researchers'] if x.get('scholar')))
dups = len(w['works']) - len({x.get('doi') or x['id'] for x in w['works']})
print('duplicate keys', dups)
