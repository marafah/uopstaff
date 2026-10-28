#!/usr/bin/env python3
"""Write the research*.html pages from one template so the header, menu and footer stay identical.
Run after changing the template:  python scripts/make_research_pages.py"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V = '202610281900'
CHART = '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>'
D3 = '<script src="https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"></script>'

PAGES = [
    # file, page title, hero title, hero subtitle, icon, script, libs
    ('research.html', 'البحث العلمي', 'البحث العلمي في جامعة البترا',
     'لوحة واحدة لإنتاج أعضاء الهيئة التدريسية البحثي: المنشورات والاقتباسات والمجالات والتعاون، من صفحات المدرسين وOpenAlex وScopus وGoogle Scholar',
     'bi-mortarboard-fill', 'rs-hub.js', [CHART]),
    ('researchers.html', 'الباحثون', 'الباحثون',
     'كل عضو هيئة تدريس وملفاته البحثية: ابحث وصفِّ ورتّب حسب h-index والاقتباسات والنشاط، وأضف للمقارنة',
     'bi-person-lines-fill', 'rs-list.js', []),
    ('researcher.html', 'الملف البحثي', 'الملف البحثي',
     'المؤشرات من كل مصدر مع رابط التحقق، والإنتاج السنوي، والمواضيع، والتعاون، والمنشورات',
     'bi-person-badge', 'rs-profile.js', [CHART]),
    ('publications.html', 'المنشورات', 'المنشورات',
     'كل أبحاث أعضاء الهيئة التدريسية بعد دمج المصادر وإزالة التكرار، مع روابط DOI وOpenAlex وScopus للتحقق',
     'bi-journal-text', 'rs-pubs.js', [CHART]),
    ('compare.html', 'المقارنة البحثية', 'المقارنة البحثية',
     'قارن حتى 4 باحثين، أو الكليات والأقسام، بالجداول والرسوم',
     'bi-bar-chart-steps', 'rs-compare.js', [CHART]),
    ('universities.html', 'الجامعات الأردنية', 'جامعة البترا بين الجامعات الأردنية',
     'الإنتاج والاقتباس والنمو والمجالات لكل الجامعات الأردنية من مصدر واحد متّسق (OpenAlex)',
     'bi-bank', 'rs-unis.js', [CHART]),
    ('network.html', 'شبكة التعاون البحثي', 'شبكة التعاون البحثي',
     'من يكتب مع من داخل الجامعة: الروابط بين الباحثين والكليات',
     'bi-diagram-3', 'rs-network.js', [D3]),
]

MENU = [  # research menu items: file, icon, title, description
    ('research.html', 'bi-mortarboard', 'لوحة البحث العلمي', 'ملخص الإنتاج البحثي للجامعة'),
    ('researchers.html', 'bi-person-lines-fill', 'الباحثون', 'بحث وتصفية وترتيب أعضاء الهيئة التدريسية'),
    ('publications.html', 'bi-journal-text', 'المنشورات', 'كل الأبحاث مع روابط التحقق والتصدير'),
    ('compare.html', 'bi-bar-chart-steps', 'المقارنة', 'باحثون أو كليات أو أقسام جنباً إلى جنب'),
    ('universities.html', 'bi-bank', 'الجامعات الأردنية', 'موقع البترا بين الجامعات الأردنية'),
    ('network.html', 'bi-diagram-3', 'شبكة التعاون', 'من يكتب مع من داخل الجامعة'),
]

TEMPLATE = '''<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#901d23">
<title>{title} – جامعة البترا</title>
<meta name="description" content="{sub}">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="assets/logo.png">
<script>try {{ if (localStorage.getItem('uop-theme') === 'dark') document.documentElement.dataset.theme = 'dark'; }} catch (e) {{ /* storage unavailable */ }}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.rtl.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
<link rel="stylesheet" href="assets/app.css?v={v}">
<link rel="stylesheet" href="assets/research.css?v={v}">
</head>
<body data-share-title="{title} – جامعة البترا" data-share-what="{title}">
<nav class="navbar uop-topbar py-0 sticky-top no-print">
  <div class="container-fluid gap-2">
    <a class="brand py-2" href="research.html">
      <img src="assets/logo.png" alt="جامعة البترا" onerror="this.remove()">
      <span class="sys"><b>البحث العلمي</b><small>جامعة البترا</small></span>
    </a>
    <nav class="site-nav" aria-label="أقسام الموقع">
      <div class="dropdown site-more">
        <a href="./" class="dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false"><i class="bi bi-search"></i> أين أجد؟</a>
        <ul class="dropdown-menu">
          <li><a class="dropdown-item" href="./"><i class="bi bi-search"></i><span><b>أين أجد؟</b><small>بحث واحد في الأشخاص والمقررات والقاعات والوحدات والمواعيد</small></span></a></li>
          <li><a class="dropdown-item" href="changes.html"><i class="bi bi-lightning-charge"></i><span><b>ما الجديد؟</b><small>آخر التغييرات في البيانات</small></span></a></li>
        </ul>
      </div>
      <div class="dropdown site-more">
        <a href="directory.html" class="dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false"><i class="bi bi-person-lines-fill"></i> <span class="nav-full">دليل الموظفين</span><span class="nav-short">الدليل</span></a>
        <ul class="dropdown-menu">
          <li><a class="dropdown-item" href="directory.html"><i class="bi bi-person-lines-fill"></i><span><b>دليل الموظفين</b><small>الأكاديميون والإداريون وبيانات التواصل</small></span></a></li>
          <li><a class="dropdown-item" href="phones.html"><i class="bi bi-telephone"></i><span><b>دليل الهواتف</b><small>الأرقام الفرعية</small></span></a></li>
          <li><a class="dropdown-item" href="org.html"><i class="bi bi-diagram-3"></i><span><b>الهيكل التنظيمي</b><small>الكليات والوحدات</small></span></a></li>
        </ul>
      </div>
      <div class="dropdown site-more">
        <a href="timetable.html" class="dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false"><i class="bi bi-table"></i> <span class="nav-full">الجدول الدراسي</span><span class="nav-short">الجدول</span></a>
        <ul class="dropdown-menu">
          <li><a class="dropdown-item" href="timetable.html"><i class="bi bi-table"></i><span><b>الجدول الدراسي</b><small>الشعب والقاعات والمواعيد</small></span></a></li>
          <li><a class="dropdown-item" href="load.html"><i class="bi bi-speedometer2"></i><span><b>العبء التدريسي</b><small>ساعات كل مدرس</small></span></a></li>
          <li><a class="dropdown-item" href="usage.html"><i class="bi bi-door-open"></i><span><b>إشغال القاعات</b><small>استخدام القاعات خلال الأسبوع</small></span></a></li>
        </ul>
      </div>
      <div class="dropdown site-more">
        <a href="instructor.html" class="dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false"><i class="bi bi-person-badge"></i> للمدرس</a>
        <ul class="dropdown-menu">
          <li><a class="dropdown-item" href="instructor.html"><i class="bi bi-person-badge"></i><span><b>صفحة المدرس</b><small>التواصل والجدول الأسبوعي</small></span></a></li>
          <li><a class="dropdown-item" href="office-hours.html"><i class="bi bi-clock"></i><span><b>الساعات المكتبية</b><small>أوقات تواجد المدرسين</small></span></a></li>
          <li><a class="dropdown-item" href="makeup.html"><i class="bi bi-calendar-plus"></i><span><b>محاضرة تعويضية</b><small>وقت وقاعة مناسبة</small></span></a></li>
        </ul>
      </div>
      <div class="dropdown site-more">
        <a href="research.html" class="dropdown-toggle active" data-bs-toggle="dropdown" aria-expanded="false" aria-current="page"><i class="bi bi-mortarboard-fill"></i> <span class="nav-full">البحث العلمي</span><span class="nav-short">البحث</span></a>
        <ul class="dropdown-menu">
{menu}
        </ul>
      </div>
      <a href="planner.html"><i class="bi bi-mortarboard"></i> للطلبة</a>
      <a href="calendar.html"><i class="bi bi-calendar3"></i> <span class="nav-full">التقويم الجامعي</span><span class="nav-short">التقويم</span></a>
    </nav>
    <div class="d-flex align-items-center gap-2 my-2 ms-auto">
      <input class="uop-search" id="pg-q" type="search" placeholder="ابحث عن باحث أو موضوع…" aria-label="بحث عن باحث">
    </div>
  </div>
</nav>

<header class="uop-hero">
  <div class="container-fluid px-4 hero-row">
    <div class="hero-text">
      <h1 id="pg-title"><i class="bi {icon}"></i> {h1}</h1>
      <p id="pg-sub">{sub}</p>
    </div>
    <aside class="update-box no-print" aria-label="تحديث البيانات">
      <small class="update-when" id="pg-updated">جارٍ التحميل…</small>
    </aside>
  </div>
</header>

<main class="container-fluid px-4 rs-main">
  <div id="rs-app"><div class="rs-loading"><div class="spinner-border text-danger" role="status"></div><div class="mt-2">جارٍ تحميل البيانات…</div></div></div>
</main>

<footer class="site-footer no-print">
  <div class="container-fluid px-4">
    <div class="foot-grid">
      <section class="foot-col">
        <h6 class="foot-h">عن صفحات البحث العلمي</h6>
        <div class="foot-brand"><span class="foot-logo"><i class="bi bi-mortarboard-fill"></i></span>
          <div><b>البحث العلمي</b><small>جامعة البترا</small></div></div>
        <p class="foot-text">تجمع روابط الباحثين وقوائم أبحاثهم من صفحات المدرسين على موقع الجامعة، وتكمّلها من OpenAlex وScopus وGoogle Scholar، مع رابط تحقق لكل رقم. تُحدَّث أسبوعياً.</p>
      </section>
      <section class="foot-col">
        <h6 class="foot-h">صفحات البحث</h6>
        <ul class="list-unstyled small mb-0">
{foot}
        </ul>
      </section>
      <section class="foot-col">
        <h6 class="foot-h">المصادر</h6>
        <ul class="list-unstyled small mb-0">
          <li><a href="https://openalex.org/institutions/I36622005" target="_blank" rel="noopener">جامعة البترا في OpenAlex</a></li>
          <li><a href="https://www.scopus.com/pages/organization/60040839" target="_blank" rel="noopener">جامعة البترا في Scopus</a></li>
          <li><a href="https://www.uop.edu.jo" target="_blank" rel="noopener">موقع الجامعة الرسمي</a></li>
        </ul>
      </section>
    </div>
    <p class="foot-text mt-3 mb-0 small">صفحة غير رسمية. المرجع المعتمد لبيانات أعضاء الهيئة التدريسية هو موقع جامعة البترا، ولأرقام الاقتباس منصّة كل مصدر.</p>
  </div>
</footer>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
{libs}
<script src="assets/research.js?v={v}"></script>
<script src="assets/{script}?v={v}"></script>
<script src="assets/site.js?v={v}"></script>
</body>
</html>
'''


def main():
    menu = '\n'.join(f'          <li><a class="dropdown-item" href="{f}"><i class="bi {i}"></i><span><b>{t}</b><small>{d}</small></span></a></li>'
                     for f, i, t, d in MENU)
    foot = '\n'.join(f'          <li><a href="{f}"><i class="bi {i}"></i> {t}</a></li>' for f, i, t, _ in MENU)
    for f, title, h1, sub, icon, script, libs in PAGES:
        html = TEMPLATE.format(title=title, h1=h1, sub=sub, icon=icon, script=script, libs='\n'.join(libs), menu=menu, foot=foot, v=V)
        with open(os.path.join(ROOT, f), 'w', encoding='utf-8') as fh:
            fh.write(html)
        print('wrote', f)


if __name__ == '__main__':
    main()
