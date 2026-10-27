"""Builds the extra pages (instructor, planner, now, trends) from the timetable page's shell, and writes the same
site menu on every page, so all pages share one header, hero, footer and share panel.

    python scripts/make_pages.py
"""
import os
import re

ROOT = os.path.join(os.path.dirname(__file__), "..")
MAIN = [("./", "bi-person-lines-fill", "دليل الموظفين"), ("timetable.html", "bi-table", "الجدول الدراسي"),
        ("calendar.html", "bi-calendar3", "التقويم الجامعي"), ("now.html", "bi-broadcast", "الآن في الجامعة")]
MORE = [("instructor.html", "bi-person-badge", "صفحة المدرس", "جدول كل مدرس وأوقات فراغه واشتراك تقويمه"),
        ("planner.html", "bi-calendar2-week", "مخطط جدولي", "اختر مقرراتك وشعبك بلا تعارض"),
        ("room.html", "bi-door-open", "صفحة القاعة", "محاضرات كل قاعة الآن وجدولها، مع بطاقة باب QR"),
        ("usage.html", "bi-grid-3x3-gap-fill", "إشغال القاعات", "نسب الإشغال حسب اليوم والساعة والمبنى، للتخطيط"),
        ("trends.html", "bi-graph-up-arrow", "متابعة التسجيل", "امتلاء الشعب والمقررات التي تحتاج شعباً إضافية"),
        ("org.html", "bi-diagram-3-fill", "الهيكل التنظيمي", "من يتبع لمن، ومن المسؤول عن كل وحدة")]

PAGES = {
    "instructor.html": dict(
        title="صفحة المدرس", short="صفحة المدرس", what="صفحة المدرس", app="ins-app", js="instructor.js",
        desc="صفحة كل مدرس في جامعة البترا: التواصل، الجدول الأسبوعي، أوقات الفراغ، واشتراك محاضراته في تقويم الهاتف.",
        hero="صفحة المدرس", sub="التواصل، الجدول الأسبوعي، أوقات الفراغ، واشتراك المحاضرات في تقويم الهاتف",
        search="ابحث عن مدرس بالاسم…", about="جدول كل مدرس من بوابة الجامعة وبيانات تواصله من دليل الموظفين، مع اشتراك تقويم يتحدّث تلقائياً كل ساعة."),
    "planner.html": dict(
        title="مخطط جدولي", short="مخطط جدولي", what="مخطط الجدول", app="pl-app", js="planner.js",
        desc="مخطط جدول الطالب لجامعة البترا: اختر المقررات والشعب، شاهد جدولك الأسبوعي، وتجنّب التعارض.",
        hero="مخطط جدولي", sub="اختر مقرراتك، قارن الشعب، وابنِ جدولاً أسبوعياً بلا تعارض — ثم احفظه في تقويمك",
        search="ابحث عن مقرر: رمز أو اسم…", about="أداة تخطيط تساعدك قبل التسجيل؛ التسجيل الفعلي يتم من بوابة الجامعة."),
    "now.html": dict(
        title="الآن في الجامعة", short="الآن في الجامعة", what="الآن في الجامعة", app="now-app", js="now.js",
        desc="ما يجري الآن في جامعة البترا: المحاضرات الجارية والقادمة، القاعات الشاغرة، والمواعيد القريبة.",
        hero="الآن في الجامعة", sub="المحاضرات الجارية والقادمة، القاعات الشاغرة، والمواعيد القريبة — تتحدّث كل دقيقة",
        search="ابحث: مقرر، مدرس، قاعة…", about="لوحة حيّة من الجدول الدراسي والتقويم الجامعي، تصلح للعرض على شاشات الكليات (?kiosk=1)."),
    "room.html": dict(
        title="صفحة القاعة", short="صفحة القاعة", what="صفحة القاعة", app="room-app", js="room.js",
        desc="صفحة كل قاعة في جامعة البترا: المحاضرة الجارية الآن، محاضرات اليوم، الجدول الأسبوعي، وأوقات الشغور.",
        hero="صفحة القاعة", sub="ما يجري في كل قاعة الآن، جدولها الأسبوعي، ومتى تكون شاغرة",
        search="ابحث عن قاعة برقمها…", about="جدول كل قاعة من بوابة الجامعة، مع بطاقة باب برمز QR تفتح هذه الصفحة."),
    "usage.html": dict(
        title="إشغال القاعات", short="إشغال القاعات", what="إشغال القاعات", app="oc-app", js="usage.js",
        desc="إشغال قاعات التدريس في جامعة البترا حسب اليوم والساعة والمبنى، القاعات الأقل استخداماً وأوقات الذروة.",
        hero="إشغال القاعات", sub="كم تُستخدم قاعات التدريس حسب اليوم والساعة والمبنى — لتوزيع القاعات والتخطيط للفصل القادم",
        search="ابحث عن قاعة برقمها…", about="محسوب من الجدول الدراسي على بوابة الجامعة، ويتحدّث كل ساعة."),
    "trends.html": dict(
        title="متابعة التسجيل", short="متابعة التسجيل", what="متابعة التسجيل", app="tr-app", js="trends.js",
        desc="متابعة التسجيل في جامعة البترا: امتلاء الشعب عبر الوقت، أسرع المقررات امتلاءً، والمقررات التي تحتاج شعباً إضافية.",
        hero="متابعة التسجيل", sub="امتلاء الشعب عبر الوقت، أسرع المقررات امتلاءً، والمقررات التي تحتاج شعباً إضافية",
        search="ابحث: رمز أو اسم مقرر…", about="لقطة من أعداد المسجلين تُحفظ مع كل تحديث ساعي للجدول الدراسي، فتظهر حركة التسجيل عبر الأيام."),
    "org.html": dict(
        title="الهيكل التنظيمي", short="الهيكل التنظيمي", what="الهيكل التنظيمي", app="org-app", js="org.js",
        desc="الهيكل التنظيمي لجامعة البترا: من يتبع لمن، ومن المسؤول عن كل وحدة، مربوطاً بدليل الموظفين.",
        hero="الهيكل التنظيمي", sub="من يتبع لمن، ومن المسؤول عن كل وحدة — حسب المخطط الرسمي ومربوطاً بدليل الموظفين",
        search="ابحث عن وحدة أو شخص…", about="المخطط الرسمي المنشور على موقع الجامعة، مربوطاً بدليل الموظفين، ويُقارن بالنسخة الرسمية كل ساعة."),
}


def nav(active):
    cur = 'class="active" '
    here = ' aria-current="page"'
    main = "\n".join('      <a %shref="%s"%s><i class="bi %s"></i> %s</a>' % (cur if href == active else "", href, here if href == active else "", ic, t)
                     for href, ic, t in MAIN)
    in_more = " active" if any(href == active for href, *_ in MORE) else ""
    items = "\n".join('          <li><a class="dropdown-item%s" href="%s"><i class="bi %s"></i><span><b>%s</b><small>%s</small></span></a></li>'
                      % (" active" if href == active else "", href, ic, t, d) for href, ic, t, d in MORE)
    return f'''    <nav class="site-nav" aria-label="أقسام الموقع">
{main}
      <div class="dropdown site-more">
        <a href="#" class="dropdown-toggle{in_more}" data-bs-toggle="dropdown" aria-expanded="false"><i class="bi bi-grid-3x3-gap-fill"></i> المزيد</a>
        <ul class="dropdown-menu dropdown-menu-end">
{items}
        </ul>
      </div>
    </nav>'''


def set_nav(html, active):
    return re.sub(r'    <nav class="site-nav".*?\n    </nav>', lambda m: nav(active), html, count=1, flags=re.S)


def main():
    with open(os.path.join(ROOT, "timetable.html"), encoding="utf-8") as f:
        shell = f.read()
    for page, p in PAGES.items():
        h = shell
        h = re.sub(r"<title>.*?</title>", f"<title>{p['title']} – جامعة البترا</title>", h)
        h = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{p["desc"]}">', h)
        h = re.sub(r'<meta property="og:title" content="[^"]*">', f'<meta property="og:title" content="{p["title"]} – جامعة البترا">', h)
        h = re.sub(r'<meta property="og:description" content="[^"]*">', f'<meta property="og:description" content="{p["desc"]}">', h)
        h = h.replace("https://marafah.github.io/uopstaff/timetable.html", f"https://marafah.github.io/uopstaff/{page}")
        h = re.sub(r'data-share-title="[^"]*" data-share-what="[^"]*"', f'data-share-title="{p["title"]} – جامعة البترا" data-share-what="{p["what"]}"', h)
        h = h.replace('<span class="sys"><b>الجدول الدراسي</b>', f'<span class="sys"><b>{p["short"]}</b>')
        h = re.sub(r'<input class="uop-search" id="tt-top-q"[^>]*>',
                   f'<input class="uop-search" id="pg-q" type="search" placeholder="{p["search"]}" aria-label="بحث">', h)
        h = re.sub(r'<header class="uop-hero">.*?</header>', f'''<header class="uop-hero">
  <div class="container-fluid px-4 hero-row">
    <div class="hero-text">
      <h1 id="pg-title">{p["hero"]}</h1>
      <p id="pg-sub">{p["sub"]}</p>
    </div>
    <aside class="update-box no-print" id="pg-actions" aria-label="إجراءات">
      <small class="update-when" id="pg-updated">—</small>
    </aside>
  </div>
</header>''', h, flags=re.S)
        h = re.sub(r'<main class="container-fluid px-4" id="tt-app">.*?</main>', f'''<main class="container-fluid px-4" id="{p["app"]}">
  <div class="loading"><div><div class="spinner-border text-secondary"></div><div class="mt-2">جارٍ التحميل…</div></div></div>
</main>''', h, flags=re.S)
        h = re.sub(r'(<h6 class="foot-h">)عن الجدول(</h6>)', rf'\g<1>عن {p["short"]}\2', h)
        h = re.sub(r'<div><b>الجدول الدراسي</b><small>جامعة البترا</small></div>', f'<div><b>{p["short"]}</b><small>جامعة البترا</small></div>', h)
        icon = next(ic for href, ic, *_ in MAIN + MORE if href == page)
        h = h.replace('<span class="foot-logo"><i class="bi bi-table"></i></span>', f'<span class="foot-logo"><i class="bi {icon}"></i></span>')
        h = re.sub(r'(<p class="foot-text">)شعب الفصل الحالي كما تنشرها.*?(</p>)', rf'\g<1>{p["about"]}\2', h, flags=re.S)
        h = h.replace('مشاركة الجدول الدراسي</h5>', f'مشاركة {p["short"]}</h5>').replace('الجدول كاملاً</label>', 'هذه الصفحة</label>')
        h = h.replace('<b>الجدول الدراسي – جامعة البترا</b>', f'<b>{p["title"]} – جامعة البترا</b>')
        h = re.sub(r'<script src="https://cdn.jsdelivr.net/npm/xlsx@[^"]+" defer></script>\n', '', h)
        h = re.sub(r'<script src="assets/timetable\.js\?v=(\d+)"></script>',
                   rf'<script src="assets/common.js?v=\1"></script>\n<script src="assets/{p["js"]}?v=\1"></script>', h)
        h = set_nav(h, page)
        with open(os.path.join(ROOT, page), "w", encoding="utf-8") as f:
            f.write(h)
    for page, active in (("index.html", "./"), ("timetable.html", "timetable.html"), ("calendar.html", "calendar.html")):
        path = os.path.join(ROOT, page)
        with open(path, encoding="utf-8") as f:
            h = f.read()
        with open(path, "w", encoding="utf-8") as f:
            f.write(set_nav(h, active))
    print("pages:", ", ".join(PAGES))


if __name__ == "__main__":
    main()
