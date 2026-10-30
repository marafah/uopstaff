"""Builds the extra pages (the home page «أين أجد؟», instructor, planner, now, trends…) from the timetable page's shell,
and writes the same site menu on every page, so all pages share one header, hero, footer and share panel.
The staff directory lives at directory.html; old directory links to the site root are sent there.

    python scripts/make_pages.py
"""
import os
import re

ROOT = os.path.join(os.path.dirname(__file__), "..")
# links made when the directory was the home page carry its filters; the home page forwards them to directory.html
DIR_PARAMS = ["type", "faculty", "dept", "rank", "role", "source", "view", "sort"]
HOME_REDIRECT = ("<script>(function () { var p = new URLSearchParams(location.search);"
                 " if (%s.some(function (k) { return p.has(k); })) location.replace('directory.html' + location.search + location.hash); })();</script>\n"
                 % str(DIR_PARAMS).replace(" ", ""))
# the site menu: eight items; the directory, the timetable, the instructor's pages and the student's pages each open a
# menu of the pages that belong with them
MENU = [
    ("./", "bi-search", "أين أجد؟", "بحث واحد في الأشخاص والمقررات والقاعات والوحدات والمواعيد", [
        ("changes.html", "bi-lightning-charge", "ما الجديد؟", "ما تغيّر في الجدول والدليل والتقويم، ساعة بساعة")]),
    ("directory.html", "bi-person-lines-fill", "دليل الموظفين", "الهيئة التدريسية والكادر الإداري: الفرعي والمكتب والبريد", [
        ("phones.html", "bi-telephone", "دليل الفرعيات", "الأرقام الفرعية حسب الكلية والقسم، للطباعة على المكاتب"),
        ("org.html", "bi-diagram-3-fill", "الهيكل التنظيمي", "من يتبع لمن، ومن المسؤول عن كل وحدة")]),
    ("timetable.html", "bi-table", "الجدول الدراسي", "شعب الفصل الحالي ومواعيدها وقاعاتها ومدرسوها", [
        ("plans.html", "bi-journal-bookmark", "الخطط الدراسية", "خطة كل تخصص: المجموعات والساعات والمقررات وما يُطرح منها هذا الفصل"),
        ("advisory.html", "bi-signpost-split", "الخطط الاسترشادية", "خطة كل برنامج سنةً بسنة وفصلاً بفصل، بكل إصداراتها، مع أداة للمرشد الأكاديمي"),
        ("room.html", "bi-door-open", "صفحة القاعة", "محاضرات كل قاعة الآن وجدولها، مع بطاقة باب QR"),
        ("trends.html", "bi-graph-up-arrow", "متابعة التسجيل", "امتلاء الشعب والمقررات التي تحتاج شعباً إضافية"),
        ("load.html", "bi-bar-chart-line", "عبء المدرسين", "شعب كل مدرس وطلبته وساعات تدريسه، حسب القسم"),
        ("usage.html", "bi-grid-3x3-gap-fill", "إشغال القاعات", "نسب الإشغال حسب اليوم والساعة والمبنى، للتخطيط"),
        ("screen.html", "bi-display", "شاشة المبنى", "للشاشات في مداخل الكليات: الجاري والقادم والشاغر")]),
    ("instructor.html", "bi-person-badge", "للمدرس", "جدول كل مدرس وأوقات فراغه واشتراك تقويمه", [
        ("office-hours.html", "bi-person-raised-hand", "الساعات المكتبية", "ساعات كل مدرس حسب القسم والكلية، تصدير وطباعة مع QR"),
        ("makeup.html", "bi-arrow-repeat", "محاضرة تعويضية", "وقت لا يتعارض مع محاضرات المدرس، وقاعة شاغرة")]),
    ("planner.html", "bi-mortarboard", "للطلبة", "اختر مقرراتك وشعبك بلا تعارض", [
        ("together.html", "bi-people", "جدولنا معاً", "أوقات فراغ مشتركة لمجموعة طلبة ومشرفهم")]),
    ("calendar.html", "bi-calendar3", "التقويم الجامعي", "", []),
    ("now.html", "bi-broadcast", "الآن في الجامعة", "", []),
    ("notes.html", "bi-journal-richtext", "مفكرتي", "", []),
]
# a menu named for its users opens with its main page under that page's own name and icon
HEAD = {"instructor.html": ("bi-person-badge", "صفحة المدرس"), "planner.html": ("bi-calendar2-week", "مخطط جدولي")}
# on phones and tablets the menu is two rows of four, so the long names are shortened there
SHORT = {"directory.html": "الدليل", "timetable.html": "الجدول", "calendar.html": "التقويم", "now.html": "الآن"}
MAIN = [(href, ic, t) for href, ic, t, _, _ in MENU]
MORE = [c for *_, kids in MENU for c in kids]

PAGES = {
    "instructor.html": dict(
        title="صفحة المدرس", short="صفحة المدرس", what="صفحة المدرس", app="ins-app", js="instructor.js", extra=["officehours.js"],
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
    "index.html": dict(
        title="أين أجد؟", short="أين أجد؟", what="البحث الشامل", app="fd-app", js="find.js",
        desc="بحث واحد في كل موقع جامعة البترا غير الرسمي: الأشخاص والفرعيات، المقررات، القاعات، الوحدات، ومواعيد التقويم.",
        hero="أين أجد…؟", sub="بحث واحد في كل الموقع: الأشخاص والفرعيات، المقررات والشعب، القاعات والمباني، الوحدات، ومواعيد التقويم",
        search="ابحث في كل الموقع…", about="يبحث في دليل الموظفين والجدول الدراسي والهيكل التنظيمي والتقويم الجامعي معاً."),
    "screen.html": dict(
        title="شاشة المبنى", short="شاشة المبنى", what="شاشة المبنى", app="scr-app", js="screen.js", v="202611021100", extra=["screen-reg.js", "screen-units.js"],
        desc="شاشة لمداخل مباني جامعة البترا: المحاضرات الجارية والقادمة، القاعات الشاغرة، والمواعيد القريبة، تتحدّث تلقائياً.",
        hero="شاشة المبنى", sub="للعرض على الشاشات في مداخل الكليات: ما يجري الآن في المبنى وما يبدأ قريباً والقاعات الشاغرة",
        search="ابحث عن قاعة…", about="تُعرض على شاشة في مدخل المبنى وتتحدّث وحدها كل دقيقة."),
    "office-hours.html": dict(
        title="الساعات المكتبية", short="الساعات المكتبية", what="الساعات المكتبية", app="ohl-app", js="oh-list.js", extra=["officehours.js"],
        desc="الساعات المكتبية لمدرسي جامعة البترا حسب الكلية والقسم، كما يُدخلها كل مدرس من صفحته، مع التصدير والطباعة.",
        hero="الساعات المكتبية", sub="ساعات كل مدرس كما يُدخلها من صفحته — حسب الكلية والقسم، مع التصدير إلى Excel وطباعة منظمة برموز QR",
        search="ابحث عن مدرس…", about="يُدخل كل مدرس ساعاته من صفحته بعد التحقق من بريده الجامعي، وتُحفظ خارج ملفات الموقع مع نسخة احتياطية كل ساعة."),
    "notes.html": dict(
        title="مفكرتي", short="مفكرتي", what="مفكرتي", app="nb-app", js="notes.js",
        desc="مفكرة شخصية للمدرس والمدير والموظف: مكالمات، اجتماعات، مذكرات، بلاغات، متابعات، مؤتمرات، ندوات، تذكيرات ومهام، محفوظة على جهازك فقط.",
        hero="مفكرتي", sub="مكالماتك واجتماعاتك ومتابعاتك وتذكيراتك في مكان واحد — بشريط زمني وتقويم ولوحة مهام، محفوظة على جهازك فقط",
        search="ابحث في سجلاتك…", about="سجلاتك تبقى في متصفحك على هذا الجهاز ولا تُرسل إلى أي مكان؛ صدّر نسخة احتياطية لنقلها أو حفظها."),
    "trends.html": dict(
        title="متابعة التسجيل", short="متابعة التسجيل", what="متابعة التسجيل", app="tr-app", js="trends.js",
        desc="متابعة التسجيل في جامعة البترا: امتلاء الشعب عبر الوقت، أسرع المقررات امتلاءً، والمقررات التي تحتاج شعباً إضافية.",
        hero="متابعة التسجيل", sub="امتلاء الشعب عبر الوقت، أسرع المقررات امتلاءً، والمقررات التي تحتاج شعباً إضافية",
        search="ابحث: رمز أو اسم مقرر…", about="لقطة من أعداد المسجلين تُحفظ مع كل تحديث ساعي للجدول الدراسي، فتظهر حركة التسجيل عبر الأيام."),
    "changes.html": dict(
        title="ما الجديد؟", short="ما الجديد؟", what="ما الجديد؟", app="cg-app", js="changes.js", v="202611012100",
        desc="ما تغيّر في جامعة البترا: شعب أُضيفت أو أُلغيت، تغيير مدرس أو قاعة أو موعد، موظفون جدد وتغيير الفرعيات، ومواعيد التقويم الجامعي.",
        hero="ما الجديد؟", sub="ما تغيّر في الجدول الدراسي ودليل الموظفين والتقويم الجامعي — يُفحص كل ساعة",
        search="ابحث في التغييرات…", about="يقارن الموقع بياناته كل ساعة بما كانت عليه، ويسجّل ما تغيّر مع إمكانية الطباعة والتصدير والاشتراك."),
    "makeup.html": dict(
        title="محاضرة تعويضية", short="محاضرة تعويضية", what="المحاضرة التعويضية", app="mk-app", js="makeup.js",
        desc="إيجاد وقت لمحاضرة تعويضية في جامعة البترا: لا يتعارض مع محاضرات المدرس، وقاعة شاغرة تتسع للشعبة، مع إشعار للطباعة ورسالة للطلبة.",
        hero="محاضرة تعويضية", sub="اختر المدرس والشعبة: الأيام والأوقات التي لا يكون فيها للمدرس محاضرة، والقاعات الشاغرة فيها",
        search="ابحث عن مدرس…", about="من الجدول الدراسي المنشور: محاضرات المدرس وإشغال القاعات. جداول الطلبة في مقرراتهم الأخرى غير منشورة."),
    "load.html": dict(
        title="عبء المدرسين", short="عبء المدرسين", what="عبء المدرسين", app="ld-app", js="load.js",
        desc="عبء التدريس في جامعة البترا حسب الكلية والقسم: الشعب والمقررات والطلبة وساعات التدريس الأسبوعية لكل مدرس، من الجدول المنشور.",
        hero="عبء المدرسين", sub="الشعب والمقررات والطلبة وساعات التدريس الأسبوعية لكل مدرس — من الجدول الدراسي المنشور، دون تقدير",
        search="ابحث عن مدرس…", about="محسوب من الجدول الدراسي على بوابة الجامعة، ويتحدّث كل ساعة."),
    "phones.html": dict(
        title="دليل الفرعيات", short="دليل الفرعيات", what="دليل الفرعيات", app="ph-app", js="phones.js",
        desc="الأرقام الفرعية لموظفي جامعة البترا حسب الكلية والوحدة والقسم، بصيغة مطبوعة من عمودين مع رمز QR للنسخة الحية.",
        hero="دليل الفرعيات", sub="الأرقام الفرعية حسب الكلية والقسم — للشاشة، أو ورقة A4 من عمودين للمكاتب",
        search="ابحث: اسم، وظيفة، فرعي…", about="من دليل الموظفين المأخوذ من الموقع الرسمي للجامعة، ويتحدّث كل ساعة."),
    "together.html": dict(
        title="جدولنا معاً", short="جدولنا معاً", what="جدولنا معاً", app="tg-app", js="together.js",
        desc="جداول مجموعة من الطلبة ومدرسيهم في أسبوع واحد، مع أوقات الفراغ المشتركة — لفرق المشاريع ومجموعات الدراسة.",
        hero="جدولنا معاً", sub="ضع جداول أعضاء المجموعة معاً: أوقات فراغ الجميع لاجتماعات المشروع والدراسة ولقاء المشرف",
        search="ابحث عن مدرس…", about="من خطط «مخطط جدولي» والجدول الدراسي المنشور؛ المجموعة محفوظة في الرابط فقط."),
    "advisory.html": dict(
        title="الخطط الاسترشادية", short="الخطط الاسترشادية", what="الخطط الاسترشادية", app="ad-app", js="advisory.js", v="202611010700",
        desc="الخطط الاسترشادية لبرامج جامعة البترا كما تنشرها مواقع الكليات: السنوات والفصول والمتطلبات، بكل إصداراتها، مع أداة للمرشد الأكاديمي.",
        hero="الخطط الاسترشادية", sub="خطة كل برنامج سنةً بسنة وفصلاً بفصل، بكل إصداراتها المنشورة — مع المقارنة بين الإصدارات، وما يُطرح هذا الفصل، وأداة للمرشد الأكاديمي",
        search="ابحث: رمز أو اسم مادة…", about="من صفحات الأقسام على مواقع الكليات؛ تُعرض الخطة جدولاً فقط حين تطابق ساعاتها كل المجاميع المطبوعة فيها، وإلا فصفحاتها الأصلية."),
    "plans.html": dict(
        title="الخطط الدراسية", short="الخطط الدراسية", what="الخطط الدراسية", app="sp-app", js="plans.js", v="202611020900",
        desc="الخطط الدراسية لكل تخصصات جامعة البترا: متطلبات الجامعة والكلية والتخصص، الساعات المعتمدة، المقررات، وما يُطرح منها هذا الفصل.",
        hero="الخطط الدراسية", sub="خطة كل تخصص في كل الكليات: المجموعات والساعات والمقررات، وما يُطرح منها هذا الفصل — مع البحث والمقارنة والتصدير",
        search="ابحث: رمز أو اسم مقرر…", about="من الخطط الدراسية المنشورة على بوابة الجامعة، مربوطة بالجدول الدراسي، وتُراجَع مع كل تحديث للموقع."),
    "org.html": dict(
        title="الهيكل التنظيمي", short="الهيكل التنظيمي", what="الهيكل التنظيمي", app="org-app", js="org.js",
        desc="الهيكل التنظيمي لجامعة البترا: من يتبع لمن، ومن المسؤول عن كل وحدة، مربوطاً بدليل الموظفين.",
        hero="الهيكل التنظيمي", sub="من يتبع لمن، ومن المسؤول عن كل وحدة — حسب المخطط الرسمي ومربوطاً بدليل الموظفين",
        search="ابحث عن وحدة أو شخص…", about="المخطط الرسمي المنشور على موقع الجامعة، مربوطاً بدليل الموظفين، ويُقارن بالنسخة الرسمية كل ساعة."),
}


def nav(active):
    out = []
    # a menu opens toward the middle of the bar: all but the last of each phone row of four (at its left edge, in Arabic) from their start
    for n, (href, ic, t, desc, kids) in enumerate(MENU):
        on = active == href or any(c[0] == active for c in kids)
        label = f'<span class="nav-full">{t}</span><span class="nav-short">{SHORT[href]}</span>' if href in SHORT else t
        if not kids:
            out.append('      <a %shref="%s"%s><i class="bi %s"></i> %s</a>' % ('class="active" ' if on else "", href, ' aria-current="page"' if on else "", ic, label))
            continue
        item = lambda h, i, tt, d: ('          <li><a class="dropdown-item%s" href="%s"%s><i class="bi %s"></i><span><b>%s</b><small>%s</small></span></a></li>'
                                    % (" active" if h == active else "", h, ' aria-current="page"' if h == active else "", i, tt, d))
        out.append(f'''      <div class="dropdown site-more">
        <a href="{href}" class="dropdown-toggle{' active' if on else ''}" data-bs-toggle="dropdown" aria-expanded="false"><i class="bi {ic}"></i> {label}</a>
        <ul class="dropdown-menu{'' if n % 4 < 3 else ' dropdown-menu-end'}">
{item(href, *HEAD.get(href, (ic, t)), desc)}
          <li><hr class="dropdown-divider"></li>
{chr(10).join(item(*c) for c in kids)}
        </ul>
      </div>''')
    return '    <nav class="site-nav" aria-label="أقسام الموقع">\n' + "\n".join(out) + "\n    </nav>"


# every page: installable as an app (manifest, icons, offline copy through sw.js), the light / dark choice applied
# before the page draws, and assets/site.js (install button, offline note, theme switch)
APP_HEAD = """<!-- app -->
  <link rel="manifest" href="manifest.webmanifest">
  <meta name="theme-color" content="#901d23">
  <link rel="icon" href="assets/icons/favicon-32.png" sizes="32x32">
  <link rel="apple-touch-icon" href="assets/icons/apple-touch-icon.png">
  <script>try { if (localStorage.getItem('uop-theme') === 'dark') document.documentElement.dataset.theme = 'dark'; } catch (e) { /* storage unavailable */ }</script>
  <!-- /app -->"""


def app_shell(html):
    html = re.sub(r"\s*<!-- app -->.*?<!-- /app -->", "", html, flags=re.S)
    html = re.sub(r'(<meta name="viewport"[^>]*>)', lambda m: m.group(1) + "\n  " + APP_HEAD, html, count=1)
    html = re.sub(r'\n<script src="assets/site\.js\?v=\d+"></script>', "", html)
    v = re.search(r'assets/app\.css\?v=(\d+)', html).group(1)
    html = re.sub(r'(<script src="assets/share\.js\?v=\d+"></script>)', lambda m: m.group(1) + f'\n<script src="assets/site.js?v={v}"></script>', html, count=1)
    return add_voice(html)


VOICE_V = "202611021100"


def add_voice(html):
    """the voice search (assets/voice.js) right after site.js, on every page that has the site's header"""
    html = re.sub(r'\n<script src="assets/voice\.js\?v=\d+"></script>', "", html)
    return re.sub(r'(<script src="assets/site\.js\?v=\d+"></script>)', lambda m: m.group(1) + f'\n<script src="assets/voice.js?v={VOICE_V}"></script>', html, count=1)


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
        h = h.replace("https://marafah.github.io/uopstaff/timetable.html", "https://marafah.github.io/uopstaff/" + ("" if page == "index.html" else page))
        h = re.sub(r'data-share-title="[^"]*" data-share-what="[^"]*"', f'data-share-title="{p["title"]} – جامعة البترا" data-share-what="{p["what"]}"', h)
        h = h.replace('<span class="sys"><b>الجدول الدراسي</b>', f'<span class="sys"><b>{p["short"]}</b>')
        h = re.sub(r'<input class="uop-search" id="tt-top-q"[^>]*>',
                   f'<input class="uop-search" id="pg-q" type="search" placeholder="{p["search"]}" aria-label="بحث">', h)
        h = re.sub(r'<header class="uop-hero">.*?</header>', f'''<header class="uop-hero{' home-hero' if page == 'index.html' else ''}">
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
        href_of = "./" if page == "index.html" else page
        icon = HEAD[href_of][0] if href_of in HEAD else next(ic for href, ic, *_ in MAIN + MORE if href == href_of)
        h = h.replace('<span class="foot-logo"><i class="bi bi-table"></i></span>', f'<span class="foot-logo"><i class="bi {icon}"></i></span>')
        h = re.sub(r'(<p class="foot-text">)شعب الفصل الحالي كما تنشرها.*?(</p>)', rf'\g<1>{p["about"]}\2', h, flags=re.S)
        h = h.replace('مشاركة الجدول الدراسي</h5>', f'مشاركة {p["short"]}</h5>').replace('الجدول كاملاً</label>', 'هذه الصفحة</label>')
        h = h.replace('<b>الجدول الدراسي – جامعة البترا</b>', f'<b>{p["title"]} – جامعة البترا</b>')
        h = re.sub(r'<script src="https://cdn.jsdelivr.net/npm/xlsx@[^"]+" defer></script>\n', '', h)
        h = re.sub(r'<script src="assets/timetable\.js\?v=(\d+)"></script>',
                   lambda m: "\n".join(f'<script src="assets/{js}?v={p.get("v", m.group(1)) if js == p["js"] else m.group(1)}"></script>' for js in ["common.js"] + p.get("extra", []) + [p["js"]]), h)
        h = app_shell(set_nav(h, href_of))
        if page == "index.html":
            h = h.replace("<head>\n", "<head>\n" + HOME_REDIRECT, 1)
            h = h.replace("<body", '<body data-home="1"', 1)
        with open(os.path.join(ROOT, page), "w", encoding="utf-8") as f:
            f.write(h)
    # the old address of «أين أجد؟» keeps working
    with open(os.path.join(ROOT, "find.html"), "w", encoding="utf-8") as f:
        f.write('<!doctype html>\n<html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>أين أجد؟ – جامعة البترا</title>\n'
                '<link rel="canonical" href="https://marafah.github.io/uopstaff/">\n'
                '<script>location.replace("./" + location.search + location.hash);</script>\n'
                '<meta http-equiv="refresh" content="0; url=./"></head><body><a href="./">أين أجد؟</a></body></html>\n')
    for page, active in (("directory.html", "directory.html"), ("timetable.html", "timetable.html"), ("calendar.html", "calendar.html")):
        path = os.path.join(ROOT, page)
        with open(path, encoding="utf-8") as f:
            h = f.read()
        with open(path, "w", encoding="utf-8") as f:
            f.write(app_shell(set_nav(h, active)))
    # every other page of the site (research pages and the rest) gets the voice search too
    for name in sorted(os.listdir(ROOT)):
        if name.endswith(".html"):
            path = os.path.join(ROOT, name)
            with open(path, encoding="utf-8") as f:
                h = f.read()
            n = add_voice(h)
            if n != h:
                with open(path, "w", encoding="utf-8") as f:
                    f.write(n)
    print("pages:", ", ".join(PAGES))


if __name__ == "__main__":
    main()
