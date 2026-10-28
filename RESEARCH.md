# صفحات البحث العلمي

ملحق لموقع «أين أجد؟» بنفس الهوية (العنابي #901D23، الكحلي #091B22، خط Tajawal). يعيد استخدام `assets/app.css` و`assets/site.js` (الوضع الليلي)، ويضيف `assets/research.css` و`assets/research.js`.

| الصفحة | الوصف |
|---|---|
| `research.html` | لوحة الجامعة: مؤشرات، إنتاج سنوي، كليات، مجالات، أعلى الباحثين أثراً، مجلات، وصول مفتوح، تعاون دولي، أهداف التنمية المستدامة |
| `researchers.html` | كل أعضاء الهيئة التدريسية: بحث وتصفية (كلية، قسم، رتبة، ملفات بحثية، حالة المطابقة) وترتيب، بطاقات أو جدول، وتصدير CSV |
| `researcher.html?id=…` | الملف البحثي: الأرقام حسب المصدر مع روابط التحقق، المئين بين الزملاء، الإنتاج السنوي، المواضيع، الزملاء المشاركون، الدول، والمنشورات مع تصدير CSV/BibTeX |
| `publications.html` | كل المنشورات بعد إزالة التكرار، مع تصفية وتصدير، وروابط DOI وOpenAlex وScopus والناشر |
| `compare.html` | مقارنة حتى 4 باحثين (جدول، رادار، سنوي، أبحاث مشتركة) أو كليات وأقسام |
| `universities.html` | الجامعات الأردنية من OpenAlex مع إبراز البترا: ترتيب، نمو، حجم مقابل أثر، مقارنة المجالات |
| `network.html` | شبكة التعاون داخل الجامعة ومصفوفة الكليات |

## مصادر البيانات (`scripts/update_research.py`)

1. **واجهة الجامعة** `services.uop.edu.jo/InstructorProfile` (نفس مصدر صفحة المدرس): روابط Scholar وScopus وORCID وJOIP، والاهتمامات، وقائمة الأبحاث. تُحفظ الحقول الأكاديمية العامة فقط، ولا يُكتب البريد الشخصي أو الهاتف أو العنوان.
2. **OpenAlex** (مجاني): يُطابَق الباحث بـ ORCID أولاً، ثم بالاسم والانتماء لجامعة البترا (`I36622005`). تظهر طريقة المطابقة على كل باحث (مطابق بـ ORCID / بالاسم / يحتاج تحقق).
3. **Scopus** (اختياري): السر `SCOPUS_API_KEY` من https://dev.elsevier.com، أو ملفات CSV مصدّرة من صفحة الجامعة (AF-ID 60040839) توضع في `data/research/scopus_export/`.
4. **Google Scholar** (اختياري): يُقرأ الملف العام لكل باحث بأدب ويتوقف عند أول حجب، مع الاحتفاظ بآخر قيم مقروءة وتاريخها. السر `SERPAPI_KEY` يجعلها موثوقة.

كل منشور يحمل روابط التحقق، وكل رقم يُذكر مصدره.

## التشغيل

- يعمل الإجراء `.github/workflows/update-research.yml` أسبوعياً (الأحد)، ويمكن تشغيله يدوياً من **Actions → Update research data → Run workflow**. شغّله مرة بعد الرفع لتوليد `data/research/*.json`.
- تصحيح مطابقة باحث: أضف معرّف OpenAlex في `data/research/overrides.json` (المفتاح = بريد الجامعة).
- تجربة دون شبكة: `python scripts/test_research_mock.py /tmp/rs-test` (بيانات وهمية لأشخاص غير حقيقيين).
- تعديل الهيدر أو القائمة لكل الصفحات: عدّل `scripts/make_research_pages.py` ثم شغّله.

## إضافة البحث العلمي لقائمة الصفحات الأخرى

أضف هذه القائمة داخل `<nav class="site-nav">` في بقية الصفحات (أو في السكربت الذي يولّدها):

```html
<div class="dropdown site-more">
  <a href="research.html" class="dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false"><i class="bi bi-mortarboard-fill"></i> <span class="nav-full">البحث العلمي</span><span class="nav-short">البحث</span></a>
  <ul class="dropdown-menu">
    <li><a class="dropdown-item" href="research.html"><i class="bi bi-mortarboard"></i><span><b>لوحة البحث العلمي</b><small>ملخص الإنتاج البحثي للجامعة</small></span></a></li>
    <li><a class="dropdown-item" href="researchers.html"><i class="bi bi-person-lines-fill"></i><span><b>الباحثون</b><small>بحث وتصفية وترتيب أعضاء الهيئة التدريسية</small></span></a></li>
    <li><a class="dropdown-item" href="publications.html"><i class="bi bi-journal-text"></i><span><b>المنشورات</b><small>كل الأبحاث مع روابط التحقق والتصدير</small></span></a></li>
    <li><a class="dropdown-item" href="compare.html"><i class="bi bi-bar-chart-steps"></i><span><b>المقارنة</b><small>باحثون أو كليات أو أقسام جنباً إلى جنب</small></span></a></li>
    <li><a class="dropdown-item" href="universities.html"><i class="bi bi-bank"></i><span><b>الجامعات الأردنية</b><small>موقع البترا بين الجامعات الأردنية</small></span></a></li>
    <li><a class="dropdown-item" href="network.html"><i class="bi bi-diagram-3"></i><span><b>شبكة التعاون</b><small>من يكتب مع من داخل الجامعة</small></span></a></li>
  </ul>
</div>
```

وفي `instructor.html` يمكن ربط الملف البحثي لكل مدرس بـ `researcher.html?id=<بريد الجامعة>`؛ الصفحة تقبل البريد أيضاً.
