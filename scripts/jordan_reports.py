#!/usr/bin/env python3
"""Excel reports from the Jordanian observatory (run after jordan_observatory.py):
   - المرصد_البحثي_الأردني.xlsx : benchmarks, trends, subjects, collaboration, journals, rising topics,
                                   leading researchers, experts directory, and University of Petra gaps & opportunities
   - universities/<n>_<name>.xlsx : every document of one university with all details
Usage: python scripts/jordan_reports.py <observatory folder> <output folder> [--home 60040839]"""
from __future__ import annotations

import argparse
import collections
import json
import os
import pickle
import re

import xlsxwriter

AR_AREA = {
    'Medicine': 'الطب', 'Engineering': 'الهندسة', 'Computer Science': 'علم الحاسوب', 'Social Sciences': 'العلوم الاجتماعية',
    'Mathematics': 'الرياضيات', 'Business, Management and Accounting': 'الأعمال والإدارة والمحاسبة',
    'Pharmacology, Toxicology and Pharmaceutics': 'الصيدلة والسموم', 'Biochemistry, Genetics and Molecular Biology': 'الكيمياء الحيوية والوراثة',
    'Chemistry': 'الكيمياء', 'Materials Science': 'علوم المواد', 'Physics and Astronomy': 'الفيزياء والفلك',
    'Agricultural and Biological Sciences': 'العلوم الزراعية والحيوية', 'Environmental Science': 'العلوم البيئية',
    'Energy': 'الطاقة', 'Economics, Econometrics and Finance': 'الاقتصاد والمالية', 'Arts and Humanities': 'الآداب والعلوم الإنسانية',
    'Chemical Engineering': 'الهندسة الكيميائية', 'Decision Sciences': 'علوم القرار', 'Immunology and Microbiology': 'المناعة والأحياء الدقيقة',
    'Earth and Planetary Sciences': 'علوم الأرض', 'Health Professions': 'المهن الصحية', 'Nursing': 'التمريض',
    'Psychology': 'علم النفس', 'Neuroscience': 'علم الأعصاب', 'Dentistry': 'طب الأسنان', 'Veterinary': 'الطب البيطري',
    'Multidisciplinary': 'متعدد التخصصات',
}
COUNTRY_AR = {'Saudi Arabia': 'السعودية', 'United Arab Emirates': 'الإمارات', 'Malaysia': 'ماليزيا', 'United Kingdom': 'المملكة المتحدة',
              'United States': 'الولايات المتحدة', 'Germany': 'ألمانيا', 'Egypt': 'مصر', 'Iraq': 'العراق', 'India': 'الهند',
              'Qatar': 'قطر', 'Oman': 'عُمان', 'Kuwait': 'الكويت', 'Turkey': 'تركيا', 'Pakistan': 'باكستان', 'China': 'الصين',
              'Canada': 'كندا', 'Australia': 'أستراليا', 'France': 'فرنسا', 'Italy': 'إيطاليا', 'Lebanon': 'لبنان', 'Palestine': 'فلسطين',
              'Bahrain': 'البحرين', 'Spain': 'إسبانيا', 'South Korea': 'كوريا الجنوبية', 'Iran': 'إيران', 'Algeria': 'الجزائر',
              'Morocco': 'المغرب', 'Tunisia': 'تونس', 'Netherlands': 'هولندا', 'Sweden': 'السويد', 'Japan': 'اليابان'}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('obs')
    ap.add_argument('out')
    ap.add_argument('--home', default='60040839')
    a = ap.parse_args()
    os.makedirs(os.path.join(a.out, 'universities'), exist_ok=True)
    O = json.load(open(os.path.join(a.obs, 'observatory.json'), encoding='utf-8'))
    recs = pickle.load(open(os.path.join(a.obs, 'recs.pkl'), 'rb'))
    U = O['universities']
    byid = {u['afid']: u for u in U}
    nm = {u['afid']: u['name_ar'] for u in U}
    home = byid[a.home]
    years = sorted(home['by_year'])

    wb = xlsxwriter.Workbook(os.path.join(a.out, 'المرصد_البحثي_الأردني.xlsx'), {'strings_to_urls': False})
    F = {
        'title': wb.add_format({'bold': True, 'font_size': 16, 'font_color': '#901D23', 'reading_order': 2}),
        'sub': wb.add_format({'italic': True, 'font_color': '#555555', 'reading_order': 2, 'text_wrap': True, 'valign': 'top'}),
        'h': wb.add_format({'bold': True, 'bg_color': '#091B22', 'font_color': '#FFFFFF', 'border': 1, 'text_wrap': True, 'valign': 'vcenter', 'align': 'center', 'reading_order': 2}),
        't': wb.add_format({'border': 1, 'reading_order': 2, 'valign': 'top'}),
        'tw': wb.add_format({'border': 1, 'reading_order': 2, 'text_wrap': True, 'valign': 'top'}),
        'n': wb.add_format({'border': 1, 'num_format': '#,##0'}),
        'd': wb.add_format({'border': 1, 'num_format': '0.00'}),
        'p': wb.add_format({'border': 1, 'num_format': '0.0%'}),
        'home': wb.add_format({'bg_color': '#F6E7E8', 'bold': True}),
        'note': wb.add_format({'font_color': '#555555', 'text_wrap': True, 'reading_order': 2, 'valign': 'top'}),
        'sec': wb.add_format({'bold': True, 'font_size': 13, 'font_color': '#091B22', 'reading_order': 2}),
    }

    def sheet(name, title, sub=''):
        ws = wb.add_worksheet(name)
        ws.right_to_left()
        ws.write(0, 0, title, F['title'])
        if sub:
            ws.merge_range(1, 0, 1, 10, sub, F['sub'])
            ws.set_row(1, 32)
        return ws

    def table(ws, r0, headers, rows, fmts, widths=None, home_col=None):
        for j, h in enumerate(headers):
            ws.write(r0, j, h, F['h'])
        ws.set_row(r0, 36)
        for i, row in enumerate(rows, r0 + 1):
            for j, v in enumerate(row):
                ws.write(i, j, v, F[fmts[j]])
        if widths:
            for j, w in enumerate(widths):
                ws.set_column(j, j, w)
        ws.autofilter(r0, 0, r0 + len(rows), len(headers) - 1)
        ws.freeze_panes(r0 + 1, 2)
        if home_col is not None:
            ws.conditional_format(r0 + 1, 0, r0 + len(rows), len(headers) - 1,
                                  {'type': 'formula', 'criteria': f'=${chr(65 + home_col)}{r0 + 2}="{home["name_ar"]}"', 'format': F['home']})
        return r0 + len(rows) + 1

    # 0. read me
    ws = sheet('اقرأني', 'المرصد البحثي للجامعات الأردنية (Scopus)',
               f'بيانات {O["total"]["docs"]:,} وثيقة فريدة لـ {len(U)} جامعة أردنية، مُصدّرة من Scopus بتاريخ {O["updated"]} عبر اشتراك جامعة البترا. '
               'تصنيف المجلات Q1–Q4 من SCImago (SJR 2025). الوثيقة المشتركة بين جامعتين تُحسب لكل منهما وتظهر مرة واحدة في المجموع.')
    lines = [
        ('ترتيب الجامعات', 'مؤشرات الحجم والأثر والجودة والانفتاح لكل جامعة، مع إبراز جامعة البترا.'),
        ('الإنتاج السنوي', 'عدد الوثائق في كل سنة لآخر 15 سنة، ورسم بياني للبترا مقابل أكبر الجامعات.'),
        ('المجالات', 'نسبة وثائق كل جامعة في كل مجال (حسب تصنيف SCImago للمجلة): نقاط القوة والتخصص.'),
        ('التعاون الأردني', 'عدد الوثائق المشتركة بين كل جامعتين أردنيتين.'),
        ('الدول الشريكة', 'أكثر الدول تعاوناً مع كل جامعة.'),
        ('المجلات', 'أكثر المجلات والمؤتمرات نشراً لكل جامعة مع متوسط الاقتباس والتصنيف.'),
        ('الموضوعات الصاعدة', 'الكلمات المفتاحية الأسرع نمواً في آخر 4 سنوات مقارنة بالسنوات الست قبلها.'),
        ('أبرز الباحثين', 'أعلى 25 باحثاً اقتباساً في كل جامعة (حسب رقم مؤلف Scopus).'),
        ('دليل الخبراء', 'كل باحث أردني له وثيقتان أو أكثر: جامعته وإنتاجه وكلماته المفتاحية، للبحث عن شريك أو محكّم أو خبير.'),
        ('البترا - الفجوات والفرص', 'مقارنة البترا بالمتوسط الأردني: مجالات أقل من المتوسط، موضوعات وطنية صاعدة، شركاء محتملون، ومجلات مستهدفة.'),
        ('الممولون', 'أكثر جهات التمويل ذكراً في وثائق كل جامعة.'),
    ]
    ws.write(3, 0, 'الأوراق', F['sec'])
    for i, (k, v) in enumerate(lines, 4):
        ws.write(i, 0, k, F['t'])
        ws.write(i, 1, v, F['tw'])
    r = len(lines) + 6
    ws.write(r, 0, 'تعريفات', F['sec'])
    defs = [('h-index', 'أكبر عدد h بحيث توجد h وثيقة اقتُبست كل منها h مرة على الأقل.'),
            ('h5', 'h-index لوثائق آخر 5 سنوات فقط.'),
            ('Q1 و Q2 %', 'نسبة الوثائق المنشورة في مجلات الربع الأول والثاني من الوثائق التي لمجلتها تصنيف.'),
            ('التعاون الدولي %', 'نسبة الوثائق التي يشارك فيها مؤلف من خارج الأردن.'),
            ('غير مقتبسة %', 'نسبة الوثائق التي لم تُقتبس بعد (طبيعية للوثائق الحديثة).'),
            ('الاقتباسات', 'كما في Scopus يوم التصدير؛ تُحدَّث أسبوعياً في الموقع.')]
    for i, (k, v) in enumerate(defs, r + 1):
        ws.write(i, 0, k, F['t'])
        ws.write(i, 1, v, F['tw'])
    ws.set_column(0, 0, 26)
    ws.set_column(1, 1, 110)

    # 1. ranking
    ws = sheet('ترتيب الجامعات', 'ترتيب الجامعات الأردنية في Scopus', 'رتّب أي عمود من أسهم الترشيح. الصف المظلل: جامعة البترا.')
    hdr = ['#', 'الجامعة', 'University', 'الوثائق', 'آخر 5 سنوات', 'الاقتباسات', 'اقتباس/وثيقة', 'h-index', 'h5', 'Q1 و Q2 %',
           'تعاون دولي %', 'وصول مفتوح %', 'ممولة %', 'غير مقتبسة %', 'الباحثون', 'رابط Scopus']
    rows = [[i + 1, u['name_ar'], u['name'], u['docs'], u['recent'], u['cites'], u['cpd'], u['h'], u['h5'], u['q12_share'], u['intl_share'],
             u['oa_share'], u['funded_share'], u['uncited_share'], u['authors'], f'https://www.scopus.com/pages/organization/{u["afid"]}']
            for i, u in enumerate(U)]
    end = table(ws, 3, hdr, rows, ['n', 't', 't', 'n', 'n', 'n', 'd', 'n', 'n', 'p', 'p', 'p', 'p', 'p', 'n', 't'],
                [4, 30, 34, 10, 10, 12, 10, 8, 8, 10, 10, 10, 9, 10, 10, 42], home_col=1)
    for c in (3, 5, 7, 9, 10):
        ws.conditional_format(4, c, end - 1, c, {'type': 'data_bar', 'bar_color': '#901D23' if c < 9 else '#1F6F78', 'bar_solid': True})
    # Petra rank summary
    r = end + 1
    ws.write(r, 1, 'ترتيب جامعة البترا بين الجامعات الأردنية', F['sec'])
    for i, (k, lab) in enumerate([('docs', 'عدد الوثائق'), ('cites', 'الاقتباسات'), ('cpd', 'الاقتباس لكل وثيقة'), ('h', 'h-index'),
                                  ('h5', 'h5'), ('q12_share', 'نسبة Q1 و Q2'), ('intl_share', 'التعاون الدولي'), ('recent', 'إنتاج آخر 5 سنوات')], r + 1):
        rank = sorted(U, key=lambda u: -u[k]).index(home) + 1
        ws.write(i, 1, lab, F['t'])
        ws.write(i, 2, f'{rank} من {len(U)}', F['t'])

    # 2. yearly
    ws = sheet('الإنتاج السنوي', 'عدد الوثائق سنوياً', 'السنة الحالية غير مكتملة.')
    hdr = ['الجامعة'] + years
    rows = [[u['name_ar']] + [u['by_year'][y] for y in years] for u in U]
    end = table(ws, 3, hdr, rows, ['t'] + ['n'] * len(years), [30] + [8] * len(years), home_col=0)
    ws.conditional_format(4, 1, end - 1, len(years), {'type': '3_color_scale', 'min_color': '#FFFFFF', 'mid_color': '#F3D9DA', 'max_color': '#901D23'})
    ch = wb.add_chart({'type': 'line'})
    pick = [0, 1, 2, 3] + [U.index(home)]
    for i in pick:
        ch.add_series({'name': ['الإنتاج السنوي', 4 + i, 0], 'categories': ['الإنتاج السنوي', 3, 1, 3, len(years) - 1],
                       'values': ['الإنتاج السنوي', 4 + i, 1, 4 + i, len(years) - 1],
                       'line': {'width': 3.25 if i == pick[-1] else 1.75, 'color': '#901D23' if i == pick[-1] else None}})
    ch.set_title({'name': 'البترا مقابل أكبر أربع جامعات'})
    ch.set_size({'width': 900, 'height': 380})
    ws.insert_chart(end + 2, 1, ch)

    # 3. subject areas (share of each university's documents)
    areas = [a_ for a_, _ in O['total']['areas']]
    ws = sheet('المجالات', 'التوزيع على المجالات (نسبة من وثائق كل جامعة)', 'المجال حسب تصنيف SCImago للمجلة؛ قد تُصنّف المجلة في أكثر من مجال، فلا يُشترط أن يكون المجموع 100%.')
    hdr = ['الجامعة'] + [AR_AREA.get(a_, a_) for a_ in areas]
    rows = []
    for u in U:
        m = dict(u['areas'])
        rows.append([u['name_ar']] + [m.get(a_, 0) / u['docs'] for a_ in areas])
    # u['areas'] holds only the top 15: recompute fully from records
    full = collections.defaultdict(collections.Counter)
    for x in recs:
        for afid in x['unis']:
            full[afid].update(x['areas'])
    rows = [[u['name_ar']] + [full[u['afid']].get(a_, 0) / u['docs'] for a_ in areas] for u in U]
    nat = collections.Counter(a_ for x in recs for a_ in x['areas'])
    rows.append(['المتوسط الأردني'] + [nat.get(a_, 0) / len(recs) for a_ in areas])
    end = table(ws, 3, hdr, rows, ['t'] + ['p'] * len(areas), [30] + [11] * len(areas), home_col=0)
    ws.conditional_format(4, 1, end - 1, len(areas), {'type': '2_color_scale', 'min_color': '#FFFFFF', 'max_color': '#1F6F78'})

    # 4. collaboration matrix
    ids, M = O['matrix']['ids'], O['matrix']['m']
    ws = sheet('التعاون الأردني', 'الوثائق المشتركة بين الجامعات الأردنية', 'الخلية = عدد الوثائق التي يشترك فيها مؤلفون من الجامعتين.')
    hdr = ['الجامعة'] + [nm[i] for i in ids]
    rows = [[nm[i]] + M[k] for k, i in enumerate(ids)]
    end = table(ws, 3, hdr, rows, ['t'] + ['n'] * len(ids), [30] + [7] * len(ids), home_col=0)
    ws.set_row(3, 120)
    ws.conditional_format(4, 1, end - 1, len(ids), {'type': '2_color_scale', 'min_color': '#FFFFFF', 'max_color': '#901D23'})

    # 5. countries
    ws = sheet('الدول الشريكة', 'أكثر الدول تعاوناً مع كل جامعة (عدد الوثائق المشتركة)')
    rows = []
    for u in U:
        for rank_, (c, n) in enumerate(u['countries'][:15], 1):
            rows.append([u['name_ar'], rank_, COUNTRY_AR.get(c, c), c, n, n / u['docs']])
    table(ws, 3, ['الجامعة', '#', 'الدولة', 'Country', 'وثائق مشتركة', 'من وثائق الجامعة'], rows, ['t', 'n', 't', 't', 'n', 'p'], [30, 5, 18, 22, 12, 14], home_col=0)

    # 6. journals
    ws = sheet('المجلات', 'أكثر المجلات والمؤتمرات نشراً لكل جامعة')
    rows = []
    for u in U:
        for rank_, (s, n, cpd, q) in enumerate(u['journals'], 1):
            rows.append([u['name_ar'], rank_, s, q or '–', n, cpd])
    table(ws, 3, ['الجامعة', '#', 'المجلة / المؤتمر', 'التصنيف', 'الوثائق', 'اقتباس/وثيقة'], rows, ['t', 'n', 't', 't', 'n', 'd'], [30, 5, 70, 9, 9, 12], home_col=0)

    # 7. rising topics
    ws = sheet('الموضوعات الصاعدة', 'الموضوعات الأسرع نمواً (الكلمات المفتاحية للمؤلفين)', 'معامل النمو = حصة الكلمة في آخر 4 سنوات ÷ حصتها في السنوات الست السابقة.')
    rows = []
    for u in U:
        for k, n, g in u['rising'][:12]:
            rows.append([u['name_ar'], k, n, g])
    table(ws, 3, ['الجامعة', 'الموضوع', 'وثائق آخر 4 سنوات', 'معامل النمو'], rows, ['t', 't', 'n', 'd'], [30, 40, 16, 12], home_col=0)

    # 8. leading researchers
    ws = sheet('أبرز الباحثين', 'أعلى الباحثين اقتباساً في كل جامعة', 'حسب الوثائق التي تحمل انتماء الجامعة. الرابط يفتح ملف المؤلف في Scopus.')
    rows = []
    for u in U:
        for rank_, t in enumerate(u['top_authors'], 1):
            rows.append([u['name_ar'], rank_, t['n'], t['docs'], t['recent'], t['c'], '; '.join(t['kw']),
                         f'https://www.scopus.com/authid/detail.uri?authorId={t["sid"]}'])
    table(ws, 3, ['الجامعة', '#', 'الباحث', 'الوثائق', 'آخر 5 سنوات', 'الاقتباسات', 'أبرز الموضوعات', 'ملف Scopus'], rows,
          ['t', 'n', 't', 'n', 'n', 'n', 'tw', 't'], [30, 5, 32, 9, 11, 11, 60, 55], home_col=0)

    # 9. experts directory
    ws = sheet('دليل الخبراء', 'دليل الباحثين في الجامعات الأردنية', 'استخدم ترشيح عمود «الموضوعات» (يحتوي على…) للعثور على خبراء أو شركاء أو محكّمين في أي موضوع.')
    rows = [[e[1], nm.get(e[2], e[2]), e[3], e[5], e[4], e[6], e[7], f'https://www.scopus.com/authid/detail.uri?authorId={e[0]}'] for e in O['experts']]
    table(ws, 3, ['الباحث', 'الجامعة', 'الوثائق', 'آخر 5 سنوات', 'الاقتباسات', 'آخر سنة نشر', 'الموضوعات', 'ملف Scopus'], rows,
          ['t', 't', 'n', 'n', 'n', 'n', 'tw', 't'], [32, 28, 9, 11, 11, 11, 70, 55])

    # 10. Petra: gaps and opportunities
    ws = sheet('البترا - الفجوات والفرص', f'{home["name_ar"]}: الفجوات والفرص', 'مقارنة بالمتوسط الأردني وبالجامعات الخاصة المماثلة؛ للاستخدام في التخطيط البحثي والتوظيف والشراكات.')
    r = 3
    ws.write(r, 0, '1) المجالات: حصة البترا مقابل الحصة الأردنية', F['sec'])
    hrow = []
    for a_ in areas:
        share_h = full[a.home].get(a_, 0) / home['docs']
        share_n = nat.get(a_, 0) / len(recs)
        hrow.append([AR_AREA.get(a_, a_), full[a.home].get(a_, 0), share_h, share_n, share_h - share_n])
    hrow.sort(key=lambda z: z[4])
    r = table(ws, r + 1, ['المجال', 'وثائق البترا', 'حصة البترا', 'الحصة الأردنية', 'الفرق'], hrow, ['t', 'n', 'p', 'p', 'p'], [34, 12, 12, 14, 10]) + 2
    ws.conditional_format(5, 4, 4 + len(hrow), 4, {'type': '3_color_scale', 'min_color': '#C0392B', 'mid_color': '#FFFFFF', 'max_color': '#1D7A3E'})

    ws.write(r, 0, '2) موضوعات صاعدة وطنياً وحضور البترا فيها', F['sec'])
    kw_new = collections.Counter(k.lower() for x in recs if x['y'] and x['y'] >= int(years[-1]) - 3 for k in x['kw'])
    kw_old = collections.Counter(k.lower() for x in recs if x['y'] and int(years[-1]) - 9 <= x['y'] < int(years[-1]) - 3 for k in x['kw'])
    n_new, n_old = sum(kw_new.values()) or 1, sum(kw_old.values()) or 1
    home_kw = collections.Counter(k.lower() for x in recs if a.home in x['unis'] for k in x['kw'])
    rising = sorted(((k, v, (v / n_new) / ((kw_old.get(k, 0) + 1) / n_old)) for k, v in kw_new.items() if v >= 40 and k not in ('jordan',)),
                    key=lambda t: -t[2])[:40]
    rows = [[k, v, round(g, 2), home_kw.get(k, 0)] for k, v, g in rising]
    r = table(ws, r + 1, ['الموضوع', 'وثائق أردنية (آخر 4 سنوات)', 'معامل النمو', 'وثائق البترا'], rows, ['t', 'n', 'd', 'n']) + 2

    ws.write(r, 0, '3) شركاء أردنيون مقترحون (قوة في مجالات ضعف البترا + تعاون قائم)', F['sec'])
    weak = [z for z in hrow if z[4] < 0][:6]
    weak_en = [k for k, v in AR_AREA.items() if v in {z[0] for z in weak}]
    co = dict((p, n) for p, n in home['partners_jo'])
    rows = []
    for u in U:
        if u['afid'] == a.home or u['docs'] < 1500:
            continue
        strength = sum(full[u['afid']].get(a_, 0) for a_ in weak_en) / u['docs']
        rows.append([u['name_ar'], co.get(u['afid'], 0), strength, u['cpd'], u['q12_share']])
    rows.sort(key=lambda z: -(z[2] * 2 + z[1] / max(1, home['docs'])))
    r = table(ws, r + 1, ['الجامعة', 'وثائق مشتركة مع البترا', 'حصتها في مجالات ضعف البترا', 'اقتباس/وثيقة', 'Q1 و Q2 %'], rows[:12],
              ['t', 'n', 'p', 'd', 'p']) + 2

    ws.write(r, 0, '4) مجلات مستهدفة: مجلات Q1/Q2 ينشر فيها الباحثون الأردنيون في مجالات البترا', F['sec'])
    strong = [k for k, _ in sorted(full[a.home].items(), key=lambda kv: -kv[1])[:8]]
    jcount = collections.Counter()
    jc, jq, jarea = collections.Counter(), {}, {}
    for x in recs:
        if x['q'] in ('Q1', 'Q2') and x['src'] and set(x['areas']) & set(strong) and (x['y'] or 0) >= int(years[-1]) - 4:
            jcount[x['src']] += 1
            jc[x['src']] += x['c']
            jq[x['src']] = x['q']
            jarea[x['src']] = AR_AREA.get(x['areas'][0], x['areas'][0])
    home_j = collections.Counter(x['src'] for x in recs if a.home in x['unis'])
    rows = [[s, jq[s], jarea[s], n, round(jc[s] / n, 1), home_j.get(s, 0)] for s, n in jcount.most_common(40)]
    r = table(ws, r + 1, ['المجلة', 'التصنيف', 'المجال', 'وثائق أردنية (5 سنوات)', 'اقتباس/وثيقة', 'وثائق البترا'], rows, ['t', 't', 't', 'n', 'd', 'n']) + 2

    ws.write(r, 0, '5) مؤشرات جودة للمراجعة', F['sec'])
    L = [x for x in recs if a.home in x['unis']]
    T = len(L)
    conf = sum(1 for x in L if x['type'] in ('Conference paper', 'Conference review'))
    chap = sum(1 for x in L if x['type'] in ('Book chapter', 'Book'))
    q4 = sum(1 for x in L if x['q'] == 'Q4')
    nq = sum(1 for x in L if not x['q'])
    natL = recs
    rows = [
        ['أوراق المؤتمرات', conf / T, sum(1 for x in natL if x['type'] in ('Conference paper', 'Conference review')) / len(natL)],
        ['فصول وكتب', chap / T, sum(1 for x in natL if x['type'] in ('Book chapter', 'Book')) / len(natL)],
        ['مجلات Q4', q4 / T, sum(1 for x in natL if x['q'] == 'Q4') / len(natL)],
        ['مصادر بلا تصنيف SJR', nq / T, sum(1 for x in natL if not x['q']) / len(natL)],
        ['وثائق غير مقتبسة', home['uncited_share'], sum(1 for x in natL if x['c'] == 0) / len(natL)],
        ['تعاون دولي', home['intl_share'], O['total']['intl_share']],
    ]
    table(ws, r + 1, ['المؤشر', 'البترا', 'الأردن'], rows, ['t', 'p', 'p'])
    ws.set_column(0, 0, 60)
    ws.set_column(1, 5, 16)

    # 11. funders
    ws = sheet('الممولون', 'أكثر جهات التمويل ذكراً')
    rows = [[u['name_ar'], i, f, n] for u in U for i, (f, n) in enumerate(u['funders'][:10], 1)]
    table(ws, 3, ['الجامعة', '#', 'الجهة الممولة', 'الوثائق'], rows, ['t', 'n', 't', 'n'], [30, 5, 70, 10], home_col=0)
    wb.close()
    print('workbook written')

    # ------------------------------------------------------------------ one documents file per university
    cols = [('EID', 'المعرّف EID', 22), ('Year', 'السنة', 7), ('Title', 'العنوان', 60), ('Source title', 'المجلة / المصدر', 36),
            ('Document Type', 'النوع', 14), ('_c', 'الاقتباسات', 10), ('_q', 'التصنيف', 8), ('_areas', 'المجالات', 28),
            ('_unis', 'الجامعات الأردنية', 34), ('_ctry', 'الدول', 26), ('_intl', 'دولي', 6), ('Authors', 'المؤلفون', 40),
            ('Author full names', 'المؤلفون (الأسماء الكاملة ورقم Scopus)', 50), ('Affiliations', 'الانتماءات', 60),
            ('Author Keywords', 'الكلمات المفتاحية', 40), ('Index Keywords', 'كلمات الفهرسة', 40), ('Abstract', 'الملخص', 90),
            ('Funding Details', 'التمويل', 40), ('Volume', 'المجلد', 7), ('Issue', 'العدد', 7), ('Page start', 'من صفحة', 8),
            ('Page end', 'إلى صفحة', 8), ('Art. No.', 'رقم المقالة', 10), ('DOI', 'DOI', 28), ('Publisher', 'الناشر', 28),
            ('ISSN', 'ISSN', 12), ('Language of Original Document', 'اللغة', 10), ('Open Access', 'الوصول المفتوح', 20),
            ('Conference name', 'المؤتمر', 40), ('Link', 'رابط Scopus', 40)]
    by_u = collections.defaultdict(list)
    for x in recs:
        for afid in x['unis']:
            by_u[afid].append(x)
    for n_, u in enumerate(U, 1):
        L = sorted(by_u[u['afid']], key=lambda z: (-(z['y'] or 0), -z['c']))
        parts = [L] if len(L) <= 12000 else [L[i:i + 12000] for i in range(0, len(L), 12000)]
        for pi, part in enumerate(parts, 1):
            safe = re.sub(r'[^\w]+', '_', u['name']).strip('_')
            fn = f'{n_:02d}_{safe}' + (f'_part{pi}' if len(parts) > 1 else '') + '.xlsx'
            wbu = xlsxwriter.Workbook(os.path.join(a.out, 'universities', fn), {'strings_to_urls': False, 'constant_memory': True})
            wsu = wbu.add_worksheet('الوثائق')
            wsu.right_to_left()
            hf = wbu.add_format({'bold': True, 'bg_color': '#091B22', 'font_color': '#FFFFFF', 'text_wrap': True, 'valign': 'vcenter'})
            for j, (_, h, w) in enumerate(cols):
                wsu.write(0, j, h, hf)
                wsu.set_column(j, j, w)
            for i, x in enumerate(part, 1):
                rr = x['row']
                vals = {'_c': x['c'], '_q': x['q'], '_areas': '; '.join(x['areas']), '_unis': '; '.join(nm.get(k, k) for k in x['unis']),
                        '_ctry': '; '.join(x['ctry']), '_intl': 'نعم' if x['intl'] else ''}
                for j, (k, _, _) in enumerate(cols):
                    v = vals[k] if k in vals else (rr.get(k) or '')
                    if k == 'Year' and str(v).isdigit():
                        v = int(v)
                    if isinstance(v, str) and len(v) > 32000:
                        v = v[:32000]
                    wsu.write(i, j, v)
            wsu.autofilter(0, 0, len(part), len(cols) - 1)
            wsu.freeze_panes(1, 3)
            wbu.close()
            print(fn, len(part), round(os.path.getsize(os.path.join(a.out, 'universities', fn)) / 1e6, 1), 'MB')


if __name__ == '__main__':
    main()
