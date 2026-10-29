#!/usr/bin/env python3
"""Write the research*.html pages from one template so the header, menu and footer stay identical.
Run after changing the template:  python scripts/make_research_pages.py"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V = '202610301700'
CHART = '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>'
D3 = '<script src="https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"></script>'

PAGES = [
    # file, page title, hero title, hero subtitle, icon, script, libs
    ('research.html', 'البحث العلمي', 'البحث العلمي في جامعة البترا',
     'لوحة واحدة لإنتاج أعضاء الهيئة التدريسية البحثي: المنشورات والاقتباسات والمجالات والتعاون، من صفحات المدرسين و OpenAlex و Scopus و Google Scholar',
     'bi-mortarboard-fill', 'rs-hub.js', [CHART]),
    ('researchers.html', 'الباحثون', 'الباحثون',
     'كل عضو هيئة تدريس وملفاته البحثية: ابحث وصفِّ ورتّب حسب h-index والاقتباسات والنشاط، وأضف للمقارنة',
     'bi-person-lines-fill', 'rs-list.js', []),
    ('researcher.html', 'الملف البحثي', 'الملف البحثي',
     'المؤشرات من كل مصدر مع رابط التحقق، والإنتاج السنوي، والمواضيع، والتعاون، والمنشورات',
     'bi-person-badge', 'rs-profile.js', [CHART]),
    ('publications.html', 'المنشورات', 'المنشورات',
     'كل أبحاث أعضاء الهيئة التدريسية بعد دمج المصادر وإزالة التكرار، مع روابط DOI و OpenAlex و Scopus للتحقق',
     'bi-journal-text', 'rs-pubs.js', [CHART]),
    ('publication.html', 'تفاصيل المنشور', 'تفاصيل المنشور',
     'الملخص والمؤلفون والانتماءات وبيانات النشر والتمويل والاقتباسات، مع رابط تحقق لكل مصدر',
     'bi-file-earmark-text', 'rs-doc.js', [CHART]),
    ('jordan.html', 'المرصد البحثي الأردني', 'مقارنة الجامعات الأردنية',
     'كل الجامعات الأردنية في Scopus: قارن حسب المجال والتخصص والفترة والتصنيف والمجلات والتعاون، مع فجوات البترا وفرصها',
     'bi-globe-central-south-asia', 'rs-jordan.js', [CHART]),
    ('journals.html', 'دليل المجلات', 'دليل المجلات',
     'تصنيف كل مجلة وترتيبها ومجالاتها، ومدة القرار والنشر، وأين ينشر الباحثون الأردنيون، ومجلات مقترحة لبحثك',
     'bi-journal-bookmark-fill', 'rs-journals.js', [CHART]),
    ('experts.html', 'ابحث عن خبير', 'ابحث عن خبير',
     'باحثو الجامعات الأردنية حسب الموضوع: لشريك بحثي أو محكّم أو ممتحن خارجي',
     'bi-person-check', 'rs-experts.js', [CHART]),
    ('simulator.html', 'محاكي المؤشرات', 'محاكي المؤشرات',
     'ماذا يحدث لمؤشرات الجامعة وترتيبها بين الجامعات الأردنية لو رفعنا نسبة Q1 أو التعاون الدولي أو الإنتاج',
     'bi-sliders', 'rs-sim.js', [CHART]),
    ('reports.html', 'التقرير الشهري', 'التقرير الشهري',
     'تقرير كل كلية لكل شهر: الأبحاث الجديدة والاقتباسات المكتسبة والباحثون النشطون، جاهز للطباعة',
     'bi-calendar2-check', 'rs-reports.js', [CHART]),
    ('compare.html', 'المقارنة البحثية', 'المقارنة البحثية',
     'قارن حتى 4 باحثين، أو الكليات والأقسام، بالجداول والرسوم',
     'bi-bar-chart-steps', 'rs-compare.js', [CHART]),
    ('universities.html', 'الجامعات الأردنية', 'جامعة البترا بين الجامعات الأردنية',
     'الإنتاج والأثر والنمو والمجالات لكل الجامعات الأردنية حسب Scopus، مع OpenAlex مصدراً مكمّلاً',
     'bi-bank', 'rs-unis.js', [CHART]),
    ('network.html', 'شبكة التعاون البحثي', 'شبكة التعاون البحثي',
     'من يكتب مع من داخل الجامعة: الروابط بين الباحثين والكليات',
     'bi-diagram-3', 'rs-network.js', [D3]),
]

SITE = [  # the site's own menu (same as the other pages): href, icon, full label, short label, items (None = divider)
    ('./', 'bi-search', 'أين أجد؟', '', [('./', 'bi-search', 'أين أجد؟', 'بحث واحد في الأشخاص والمقررات والقاعات والوحدات والمواعيد'), None,
                                     ('changes.html', 'bi-lightning-charge', 'ما الجديد؟', 'ما تغيّر في الجدول والدليل والتقويم، ساعة بساعة')]),
    ('directory.html', 'bi-person-lines-fill', 'دليل الموظفين', 'الدليل', [('directory.html', 'bi-person-lines-fill', 'دليل الموظفين', 'الهيئة التدريسية والكادر الإداري: الفرعي والمكتب والبريد'), None,
                                     ('phones.html', 'bi-telephone', 'دليل الفرعيات', 'الأرقام الفرعية حسب الكلية والقسم، للطباعة على المكاتب'),
                                     ('org.html', 'bi-diagram-3-fill', 'الهيكل التنظيمي', 'من يتبع لمن، ومن المسؤول عن كل وحدة')]),
    ('timetable.html', 'bi-table', 'الجدول الدراسي', 'الجدول', [('timetable.html', 'bi-table', 'الجدول الدراسي', 'شعب الفصل الحالي ومواعيدها وقاعاتها ومدرسوها'), None,
                                     ('room.html', 'bi-door-open', 'صفحة القاعة', 'محاضرات كل قاعة الآن وجدولها، مع بطاقة باب QR'),
                                     ('trends.html', 'bi-graph-up-arrow', 'متابعة التسجيل', 'امتلاء الشعب والمقررات التي تحتاج شعباً إضافية'),
                                     ('load.html', 'bi-bar-chart-line', 'عبء المدرسين', 'شعب كل مدرس وطلبته وساعات تدريسه، حسب القسم'),
                                     ('usage.html', 'bi-grid-3x3-gap-fill', 'إشغال القاعات', 'نسب الإشغال حسب اليوم والساعة والمبنى، للتخطيط'),
                                     ('screen.html', 'bi-display', 'شاشة المبنى', 'للشاشات في مداخل الكليات: الجاري والقادم والشاغر')]),
    ('instructor.html', 'bi-person-badge', 'للمدرس', '', [('instructor.html', 'bi-person-badge', 'صفحة المدرس', 'جدول كل مدرس وأوقات فراغه واشتراك تقويمه'), None,
                                     ('office-hours.html', 'bi-person-raised-hand', 'الساعات المكتبية', 'ساعات كل مدرس حسب القسم والكلية، تصدير وطباعة مع QR'),
                                     ('makeup.html', 'bi-arrow-repeat', 'محاضرة تعويضية', 'وقت لا يتعارض مع محاضرات المدرس، وقاعة شاغرة')]),
    ('planner.html', 'bi-mortarboard', 'للطلبة', '', [('planner.html', 'bi-calendar2-week', 'مخطط جدولي', 'اختر مقرراتك وشعبك بلا تعارض'), None,
                                     ('together.html', 'bi-people', 'جدولنا معاً', 'أوقات فراغ مشتركة لمجموعة طلبة ومشرفهم')]),
    ('research.html', 'bi-mortarboard-fill', 'البحث العلمي', 'البحث', 'RESEARCH'),
    ('#', 'bi-grid-3x3-gap', 'المزيد', '', [('calendar.html', 'bi-calendar3', 'التقويم الجامعي', 'الفصول والعطل والامتحانات، واشتراك التقويم'),
                                     ('now.html', 'bi-broadcast', 'الآن في الجامعة', 'المحاضرات الجارية والقاعات الشاغرة الآن'),
                                     ('notes.html', 'bi-journal-richtext', 'مفكرتي', 'ملاحظاتك ومهامك، محفوظة في متصفحك')]),
]

MENU = [  # research menu items: file, icon, title, description
    ('research.html', 'bi-mortarboard', 'لوحة البحث العلمي', 'ملخص الإنتاج البحثي للجامعة'),
    ('researchers.html', 'bi-person-lines-fill', 'الباحثون', 'بحث وتصفية وترتيب أعضاء الهيئة التدريسية'),
    ('publications.html', 'bi-journal-text', 'المنشورات', 'كل الأبحاث مع روابط التحقق والتصدير'),
    ('compare.html', 'bi-bar-chart-steps', 'المقارنة', 'باحثون أو كليات أو أقسام جنباً إلى جنب'),
    ('jordan.html', 'bi-globe-central-south-asia', 'مقارنة الجامعات الأردنية', 'حسب المجال والتخصص والفترة والتصنيف والمجلات'),
    ('journals.html', 'bi-journal-bookmark-fill', 'دليل المجلات', 'التصنيف ومدة القرار ومجلات مقترحة لبحثك'),
    ('experts.html', 'bi-person-check', 'ابحث عن خبير', 'باحثو الأردن حسب الموضوع'),
    ('simulator.html', 'bi-sliders', 'محاكي المؤشرات', 'أثر رفع Q1 والتعاون الدولي على الترتيب'),
    ('reports.html', 'bi-calendar2-check', 'التقرير الشهري', 'الأبحاث الجديدة واقتباساتها لكل كلية'),
    ('universities.html', 'bi-bank', 'مؤشرات الجامعات الأسبوعية', 'أعداد Scopus و OpenAlex المحدّثة أسبوعياً'),
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
{sitenav}
    </nav>
    <div class="d-flex align-items-center gap-2 my-2 ms-auto">
      <input class="uop-search" id="pg-q" type="search" placeholder="ابحث عن باحث أو موضوع…" aria-label="بحث عن باحث">
      <button type="button" class="btn btn-share" data-bs-toggle="modal" data-bs-target="#shareModal" title="مشاركة الصفحة ورمز QR"><i class="bi bi-qr-code"></i><span class="d-none d-sm-inline"> مشاركة</span></button>
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
        <h6 class="foot-h">عن {title}</h6>
        <div class="foot-brand"><span class="foot-logo"><i class="bi {icon}"></i></span>
          <div><b>{title}</b><small>جامعة البترا</small></div></div>
        <p class="foot-text">روابط الباحثين وقوائم أبحاثهم من صفحات المدرسين على موقع الجامعة، مع OpenAlex و Scopus و Google Scholar، ورابط تحقق لكل رقم. تتحدّث أسبوعياً.</p>
        <div class="foot-tags">
          <span class="foot-tag"><i class="bi bi-collection"></i> <span id="foot-count">—</span></span>
          <span class="foot-tag"><i class="bi bi-arrow-repeat"></i> <span id="foot-updated">—</span></span>
        </div>
        <a class="foot-link" href="https://www.scopus.com/pages/organization/60040839" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-left"></i> جامعة البترا في Scopus</a>
      </section>
      <section class="foot-col">
        <h6 class="foot-h">فريق العمل</h6>
        <div class="credit-card">
          <div class="credit-line">
            <span class="credit-role"><i class="bi bi-code-slash"></i> تصميم وتطوير</span>
            <a class="credit-person lead" href="directory.html?q=%D8%B9%D8%B1%D9%81%D8%A9">د. محمد عرفة</a>
          </div>
          <div class="credit-line">
            <span class="credit-role"><i class="bi bi-compass"></i> بتوجيه ودعم من</span>
            <a class="credit-person" href="directory.html?q=%D8%A7%D9%84%D9%85%D9%82%D9%88%D8%B3%D9%8A">د. علي المقوسي</a>
          </div>
        </div>
      </section>
      <section class="foot-col foot-share">
        <h6 class="foot-h">شارك الموقع</h6>
        <div class="foot-share-row">
          <button type="button" class="foot-qr" id="foot-qr" data-bs-toggle="modal" data-bs-target="#shareModal" title="مشاركة الدليل ورمز QR" aria-label="مشاركة الدليل ورمز QR"></button>
          <div>
            <p class="foot-text mb-2">امسح الرمز بكاميرا الهاتف لفتح الموقع، أو شارك الرابط.</p>
            <div class="foot-url" dir="ltr">marafah.github.io/uopstaff</div>
            <button type="button" class="btn btn-sm btn-light mt-2" data-bs-toggle="modal" data-bs-target="#shareModal"><i class="bi bi-share-fill"></i> مشاركة</button>
            <button type="button" class="btn btn-sm btn-light mt-2 ms-1" id="app-install"><i class="bi bi-phone"></i> ثبّت التطبيق</button>
          </div>
        </div>
      </section>
    </div>
  </div>
  <div class="foot-bottom">
    <div class="container-fluid px-4">
      <span><i class="bi bi-info-circle"></i> صفحة غير رسمية تعرض البيانات المنشورة على الموقع الرسمي للجامعة وفي قواعد البيانات البحثية؛ المرجع المعتمد هو الموقع الرسمي ومنصّة كل مصدر.</span>
      <span class="foot-copy">© <span id="year">2026</span></span>
    </div>
  </div>
</footer>

<div class="modal fade" id="shareModal" tabindex="-1" aria-labelledby="shareTitle" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content share-modal">
      <div class="modal-header"><h5 class="modal-title fw-bold" id="shareTitle"><i class="bi bi-share-fill"></i> مشاركة {title}</h5>
        <button type="button" class="btn-close ms-0" data-bs-dismiss="modal" aria-label="إغلاق"></button></div>
      <div class="modal-body">
        <div class="btn-group w-100 mb-3" role="group" aria-label="ما الذي تشاركه">
          <input type="radio" class="btn-check" name="shareWhat" id="sw-site" value="site" checked><label class="btn btn-outline-primary btn-sm" for="sw-site"><i class="bi bi-house"></i> الموقع</label>
          <input type="radio" class="btn-check" name="shareWhat" id="sw-all" value="all"><label class="btn btn-outline-primary btn-sm" for="sw-all"><i class="bi bi-file-earmark"></i> هذه الصفحة</label>
          <input type="radio" class="btn-check" name="shareWhat" id="sw-view" value="view"><label class="btn btn-outline-primary btn-sm" for="sw-view"><i class="bi bi-funnel"></i> النتيجة الحالية</label>
        </div>
        <div class="qr-card" id="qr-card">
          <div class="qr-head"><b>{title} – جامعة البترا</b><small id="qr-sub">امسح الرمز لفتح الصفحة</small></div>
          <div class="qr-box" id="qr"></div>
          <div class="qr-url" id="share-url-text" dir="ltr"></div>
        </div>
        <div class="input-group input-group-sm mt-3">
          <input class="form-control" id="share-url" readonly dir="ltr" aria-label="الرابط">
          <button class="btn btn-primary" type="button" id="copy-link"><i class="bi bi-clipboard"></i> نسخ الرابط</button>
        </div>
        <div class="share-actions mt-3">
          <a class="btn btn-sm btn-whatsapp" id="share-wa" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i> واتساب</a>
          <a class="btn btn-sm btn-outline-secondary" id="share-mail"><i class="bi bi-envelope"></i> بريد</a>
          <button class="btn btn-sm btn-outline-secondary" type="button" id="share-native" hidden><i class="bi bi-box-arrow-up"></i> مشاركة…</button>
          <button class="btn btn-sm btn-outline-success" type="button" id="qr-download"><i class="bi bi-download"></i> تنزيل رمز QR</button>
          <button class="btn btn-sm btn-outline-dark" type="button" id="qr-print"><i class="bi bi-printer"></i> طباعة بطاقة</button>
        </div>
      </div>
    </div>
  </div>
</div>
<div class="copy-toast" id="copy-toast" role="status" aria-live="polite"><i class="bi bi-clipboard-check-fill"></i> <span></span></div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js"></script>
{libs}
<script src="assets/research.js?v={v}"></script>
<script src="assets/{script}?v={v}"></script>
<script src="assets/common.js?v={v}"></script>
<script src="assets/share.js?v={v}"></script>
<script src="assets/site.js?v={v}"></script>
</body>
</html>
'''


def main():
    menu = '\n'.join(f'          <li><a class="dropdown-item" href="{f}"><i class="bi {i}"></i><span><b>{t}</b><small>{d}</small></span></a></li>'
                     for f, i, t, d in MENU)
    def item(h, i, t, d):
        return f'          <li><a class="dropdown-item" href="{h}"><i class="bi {i}"></i><span><b>{t}</b><small>{d}</small></span></a></li>'
    blocks = []
    for href, icon, full, short, items in SITE:
        label = f'<span class="nav-full">{full}</span><span class="nav-short">{short}</span>' if short else full
        active = ' active" aria-current="page' if href == 'research.html' else ''
        lis = menu if items == 'RESEARCH' else '\n'.join('          <li><hr class="dropdown-divider"></li>' if x is None else item(*x) for x in items)
        blocks.append(f'      <div class="dropdown site-more">\n        <a href="{href}" class="dropdown-toggle{active}" data-bs-toggle="dropdown" aria-expanded="false"><i class="bi {icon}"></i> {label}</a>\n'
                      f'        <ul class="dropdown-menu">\n{lis}\n        </ul>\n      </div>')
    sitenav = '\n'.join(blocks)
    foot = '\n'.join(f'          <li><a href="{f}"><i class="bi {i}"></i> {t}</a></li>' for f, i, t, _ in MENU)
    for f, title, h1, sub, icon, script, libs in PAGES:
        html = TEMPLATE.format(title=title, h1=h1, sub=sub, icon=icon, script=script, libs='\n'.join(libs), sitenav=sitenav, foot=foot, v=V)
        with open(os.path.join(ROOT, f), 'w', encoding='utf-8') as fh:
            fh.write(html)
        print('wrote', f)


if __name__ == '__main__':
    main()
