# الأبحاث المسحوبة (integrity.html)

- `scopus_*.csv`: تصدير Scopus الكامل للاستعلام `AFFILCOUNTRY(jordan) AND DOCTYPE(tb)`، أي كل الأبحاث المسحوبة ذات الانتماء الأردني، بكل الحقول (Citation + Bibliographical information). عند رفع تصدير أحدث يُعاد بناء الصفحة تلقائياً.
- `scopus_api.csv`: يكتبه `scripts/research_integrity.py` تلقائياً (Scopus Search API بمفتاح `SCOPUS_API_KEY`)، وتُضاف إليه الأبحاث المسحوبة الجديدة يومياً.
- `retraction_watch_jordan.csv`: السجلات الأردنية من قاعدة Retraction Watch (Crossref)، تُحدَّث في كل تشغيل من
  https://api.labs.crossref.org/data/retractionwatch

بناء يدوي: `python scripts/research_integrity.py` (أو `RW_FILE=retractions.csv` لاستخدام نسخة منزّلة من قاعدة Retraction Watch كاملة).
