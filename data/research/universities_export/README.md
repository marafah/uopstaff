# تصديرات Scopus للجامعات الأردنية

ضع هنا تصدير Scopus الرسمي لكل جامعة أردنية (غير جامعة البترا، فتصديرها في `../scopus_export`).
عند رفع ملف هنا يُعاد بناء مقارنة الجامعات تلقائياً، فتُنسب لكل جامعة الأبحاث التي يسجّلها Scopus تحت رقم انتمائها
(AF-ID) فقط، كما في صفحتها على Scopus، وتُضاف الأبحاث الأحدث من ملف التحليل.

## خطوات التصدير لكل جامعة

1. افتح صفحة الجامعة على Scopus (الرابط في الجدول أدناه) ثم اضغط عدد الوثائق **Documents** لفتح قائمتها.
2. حدّد كل النتائج (**Select all**) ثم **Export → CSV**.
3. اختر الحقول التالية على الأقل:
   **EID، Year، Source title، ISSN، Affiliations، Document Type، Open Access، Cited by**
   (لا حاجة للملخصات أو المراجع؛ الملف يبقى صغيراً).
4. Scopus يصدّر حتى 20,000 وثيقة في المرة الواحدة. للجامعات الأكبر (الجامعة الأردنية، جامعة العلوم والتكنولوجيا)
   صفِّ القائمة حسب السنوات (مثلاً حتى 2015، ثم 2016–2021، ثم 2022 وما بعد) وصدّر كل جزء في ملف.
5. سمِّ كل ملف برقم انتماء الجامعة (AF-ID) في أوله، مثل `60064180.csv` أو `60064180_part2.csv`، ثم ارفعه إلى هذا المجلد.
   (الملف الذي لا يحمل الرقم يُتعرَّف على جامعته من اسمه الإنجليزي أو من الانتماء المتكرر في صفوفه.)

## الجامعات وأرقام انتمائها

| الجامعة | الاسم في Scopus | AF-ID | عدد الوثائق في Scopus (هذا الأسبوع) | |
|---|---|---|---|---|
| الجامعة الأردنية | The University of Jordan | `60064180` | 31,353 | [صفحتها](https://www.scopus.com/pages/organization/60064180) |
| جامعة العلوم والتكنولوجيا | Jordan University of Science and Technology | `60051534` | 23,315 | [صفحتها](https://www.scopus.com/pages/organization/60051534) |
| جامعة اليرموك | Yarmouk University | `60044065` | 11,869 | [صفحتها](https://www.scopus.com/pages/organization/60044065) |
| الجامعة الهاشمية | The Hashemite University | `60044088` | 11,748 | [صفحتها](https://www.scopus.com/pages/organization/60044088) |
| جامعة البلقاء التطبيقية | Al-Balqa Applied University | `60062395` | 11,365 | [صفحتها](https://www.scopus.com/pages/organization/60062395) |
| جامعة العلوم التطبيقية الخاصة | Applied Science Private University | `60043655` | 9,391 | [صفحتها](https://www.scopus.com/pages/organization/60043655) |
| جامعة عمان الأهلية | Al-Ahliyya Amman University | `60058937` | 8,514 | [صفحتها](https://www.scopus.com/pages/organization/60058937) |
| جامعة الزرقاء | Zarqa University | `60042753` | 7,105 | [صفحتها](https://www.scopus.com/pages/organization/60042753) |
| جامعة مؤتة | Mutah University | `60035301` | 6,098 | [صفحتها](https://www.scopus.com/pages/organization/60035301) |
| جامعة الزيتونة الأردنية | Al-Zaytoonah University of Jordan | `60067411` | 5,087 | [صفحتها](https://www.scopus.com/pages/organization/60067411) |
| جامعة آل البيت | Al al-Bayt University | `60036479` | 4,661 | [صفحتها](https://www.scopus.com/pages/organization/60036479) |
| جامعة الشرق الأوسط | Middle East University | `60109124` | 4,216 | [صفحتها](https://www.scopus.com/pages/organization/60109124) |
| جامعة جدارا | Jadara University | `60139033` | 4,144 | [صفحتها](https://www.scopus.com/pages/organization/60139033) |
| جامعة الإسراء | Isra University | `60067706` | 3,437 | [صفحتها](https://www.scopus.com/pages/organization/60067706) |
| جامعة الأميرة سمية للتكنولوجيا | Princess Sumaya University for Technology | `60056335` | 3,290 | [صفحتها](https://www.scopus.com/pages/organization/60056335) |
| الجامعة الألمانية الأردنية | German Jordanian University | `60070287` | 3,270 | [صفحتها](https://www.scopus.com/pages/organization/60070287) |
| جامعة الحسين بن طلال | Al-Hussein Bin Talal University | `60105841` | 2,849 | [صفحتها](https://www.scopus.com/pages/organization/60105841) |
| جامعة عمان العربية | Amman Arab University | `60087691` | 2,398 | [صفحتها](https://www.scopus.com/pages/organization/60087691) |
| جامعة فيلادلفيا | Philadelphia University | `60054151` | 2,185 | [صفحتها](https://www.scopus.com/pages/organization/60054151) |
| جامعة الطفيلة التقنية | Tafila Technical University | `60035155` | 2,179 | [صفحتها](https://www.scopus.com/pages/organization/60035155) |
| جامعة جرش | Jerash University | `60049668` | 1,302 | [صفحتها](https://www.scopus.com/pages/organization/60049668) |
| جامعة إربد الأهلية | Irbid National University | `60070289` | 1,257 | [صفحتها](https://www.scopus.com/pages/organization/60070289) |
| جامعة عجلون الوطنية | Ajloun National University | `60276501` | 964 | [صفحتها](https://www.scopus.com/pages/organization/60276501) |
| الجامعة الأمريكية في مادبا | American University of Madaba | `60115127` | 786 | [صفحتها](https://www.scopus.com/pages/organization/60115127) |
| جامعة العلوم الإسلامية العالمية | The World Islamic Sciences and Education University | `60108351` | 687 | [صفحتها](https://www.scopus.com/pages/organization/60108351) |
| جامعة العقبة للتكنولوجيا | Aqaba University of Technology | `60122214` | 544 | [صفحتها](https://www.scopus.com/pages/organization/60122214) |
| جامعة الحسين التقنية | Al Hussein Technical University | `60276062` | 512 | [صفحتها](https://www.scopus.com/pages/organization/60276062) |

جامعة البترا (`60040839`): تصديرها في `data/research/scopus_export` ومطابق لـ Scopus.

---

**English:** put each Jordanian university's own Scopus CSV export here, named with its AF-ID (`60064180.csv`,
`60064180_part2.csv`, …). Fields needed: EID, Year, Source title, ISSN, Affiliations, Document Type, Open Access, Cited by.
Pushing a file rebuilds the comparison (`scripts/update_research.py`, `official_exports()`): a university is then
credited with exactly the documents in its export, and documents not yet in `jordan/docs.tsv` are added from it.
