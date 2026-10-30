/* reward.html: research rewards under تعليمات البحث العلمي، وبراءات الاختراع، والمشاركة في المؤتمرات العلمية (رقم 4 لسنة 2022)
   as amended by the Deans' Council decision 438-2025/2024 (President's letter No. 6841, 2025/09/03): publication support and
   incentives (م7), the journal conditions (م8, new), funded projects (م9), citations (م10), Nature/Science (م11), conferences
   (م12), patents (م13/ج), affiliation and the three-year limit (م15) and innovative projects (م16). Amounts are the tables'
   maxima; payment follows the research council's recommendation and the financial system (م5/و، م9/4). */
(async function () {
  'use strict';
  const app = R.$('#rs-app');
  let data, wdata;
  try { [data, wdata] = await R.loadAll(['researchers', 'works']); } catch (e) { R.fail(app, e); return; }
  const { list, byId } = R.indexResearchers(data);
  R.updated(data.meta || {});
  const esc = R.esc, works = wdata.works || [], NOW = new Date().getFullYear();
  const ref = (a, d = '06') => `<a class="rs-ref" href="regulations.html?doc=${d}&a=${a}" target="_blank" rel="noopener">م(${a})</a>`;
  const JD = v => `${R.n(Math.round(v))} دينار`;

  // م(7/1): impact factor (Clarivate Web of Science) -> [support, incentive]
  const IF = [[0.5, 100, 200], [1, 200, 400], [1.5, 200, 500], [2, 300, 600], [2.5, 300, 700], [3, 400, 800], [3.5, 400, 900], [4, 600, 1000], [5, 600, 1200], [6, 600, 1400], [7, 600, 1700], [Infinity, 800, 2000]];
  const IF_BAND = ['IF ≤ 0.5', '0.5 < IF ≤ 1', '1 < IF ≤ 1.5', '1.5 < IF ≤ 2', '2 < IF ≤ 2.5', '2.5 < IF ≤ 3', '3 < IF ≤ 3.5', '3.5 < IF ≤ 4', '4 < IF ≤ 5', '5 < IF ≤ 6', '6 < IF ≤ 7', 'IF > 7'];
  const SC = { Q1: [400, 1200], Q2: [400, 800], Q3: [200, 500], Q4: [200, 200], NA: [200, 200] };         // م(7/4)
  const AR = { local: [75, 200], global: [100, 300] };                                                         // م(7/2)
  const NOIF = { local: [75, 0], global: [100, 0] };                                                           // م(7/3)
  const BASAER = 400, INTL = 200;                                                                              // م(7/6)، م(7/7)
  const CITE = c => c >= 40 ? 500 : c >= 20 ? 300 : 0;                                                         // م(10)
  // م(7/8): share of each author by position
  const shares = n => n <= 1 ? [1] : n === 2 ? [0.6, 0.4] : n === 3 ? [0.5, 0.25, 0.25] : [0.35, ...Array(n - 1).fill(0.65 / (n - 1))];

  const NUM = /^(n|me|team|days)$/, BOOL = /^(intl|ns|bas|idx|emp)$/;
  const st = Object.assign({ mode: 'paper', rid: '', wid: '', q: 'Q1', ifv: '', ar: '', noif: '', bas: false, ns: false, intl: false, fee: '', n: 1, me: 1, ext: '',
    aff: '1', s5: '', grow: '', py: '', cites: '', emp: true, pub: 'global', role: 'book', idx: true, kind: 'std', grant: '', salary: '', team: 1,
    ptype: 'pct', pstage: 'pub', ticket: '', regfee: '', perdiem: '', days: 3 },
    Object.fromEntries([...new URLSearchParams(location.search)].map(([k, v]) => [k, NUM.test(k) ? +v : BOOL.test(k) ? v === '1' : v])));
  let cov = null; // Scopus coverage of the imported paper's journal: {start, years, txt}

  app.innerHTML = `
  <section class="rs-section rs-card rs-pr-intro">
    <div><h3><i class="bi bi-calculator"></i>حاسبة مكافآت البحث العلمي</h3>
      <p class="mb-0">احسب دعم النشر وحوافزه، وحوافز الاستشهاد، ومكافآت الكتب والمشاريع وبراءات الاختراع والمؤتمرات حسب تعليمات البحث العلمي رقم (4) لسنة 2022
        <b>بعد تعديلها بقرار مجلس العمداء رقم (438–2025/2024) — كتاب رئيس الجامعة رقم 6841 بتاريخ 2025/09/03</b>، مع نص كل شرط ومصدره.</p></div>
    <a class="btn btn-rs-o" href="regulations.html?doc=06#rg-dec"><i class="bi bi-book"></i> نص التعليمات المعدّل</a>
  </section>
  <nav class="rs-tabs no-print" id="rw-tabs"><button data-m="paper"><i class="bi bi-journal-text"></i> بحث في مجلة</button><button data-m="cite"><i class="bi bi-quote"></i> حافز الاستشهاد</button>
    <button data-m="book"><i class="bi bi-book"></i> كتاب أو فصل</button><button data-m="project"><i class="bi bi-briefcase"></i> مشروع بحث</button>
    <button data-m="patent"><i class="bi bi-patch-check"></i> براءة اختراع</button><button data-m="conf"><i class="bi bi-airplane"></i> مؤتمر علمي</button></nav>
  <section class="rs-section rs-rw-grid"><div class="rs-card rs-jf no-print" id="rw-form"></div><div class="rs-card rs-rw-out" id="rw-out"></div></section>
  <section class="rs-section rs-card" id="rw-rules"></section>
  <p class="rs-note">المبالغ هي الحد الأعلى في جداول التعليمات؛ تُصرف المكافآت والحوافز بتنسيب من مجلس البحث العلمي ووفق النظام المالي وفي حدود الموازنة (${ref('5')}/و، ${ref('9')}/4). الدعم موجّه للباحثين في جامعة البترا، ويُشترط ذكر جامعة البترا في عنوان الباحث (${ref('6')}/ج، ${ref('15')}). أداة تقديرية غير رسمية.</p>`;

  const sel = (id, opts, v) => `<select class="form-select" id="${id}">${opts.map(([k, l]) => `<option value="${k}"${String(k) === String(v) ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
  const fld = (label, icon, inner, hint) => `<div class="rs-jf-f"><span class="rs-jf-l"><i class="bi ${icon}"></i> ${label}</span>${inner}${hint ? `<small class="rs-jf-hint">${hint}</small>` : ''}</div>`;
  const num = (id, v, ph, min = 0, step = 'any') => `<input class="form-control" id="${id}" type="number" min="${min}" step="${step}" value="${v}" placeholder="${ph || ''}">`;
  const chk = (id, on, label) => `<label class="rs-pr-chk"><input type="checkbox" id="${id}"${on ? ' checked' : ''}> ${label}</label>`;
  const authorsBlock = () => fld('الباحثون', 'bi-people', `<div class="rs-rw-auth"><label>العدد ${num('rw-n', st.n, '', 1, 1)}</label><label>ترتيبي ${num('rw-me', st.me, '', 1, 1)}</label></div>
      <input class="form-control mt-2" id="rw-ext" value="${esc(st.ext)}" placeholder="ترتيب الباحثين من خارج الجامعة، مثل: 3,4">`, 'حصة الباحث من خارج الجامعة تُصرف للباحث الأول إن كان من جامعة البترا');
  const affBlock = () => fld('ترتيب جامعة البترا في عنوانك (Affiliation)', 'bi-building-check', sel('rw-aff', [['1', 'الارتباط الأول — الحافز كاملاً'], ['2', 'الارتباط الثاني — 50% من الحافز'], ['3', 'أكثر من ارتباطين — غير مسموح']], st.aff), 'المادة (15/أ)');
  const yearBlock = (hint) => fld('سنة النشر والفهرسة', 'bi-calendar3', num('rw-py', st.py, 'مثل ' + NOW, 1990, 1), hint);
  const importBlock = () => {
    const mine = byId[st.rid] ? works.filter(w => (w.r || []).includes(st.rid) && /article|review|journal/.test(w.type)).sort((a, b) => (b.y || 0) - (a.y || 0)) : [];
    return fld('استيراد بحث من ملفك (اختياري)', 'bi-person', `<input class="form-control" id="rw-who" list="rw-names" placeholder="اسمك…" value="${esc(byId[st.rid] ? byId[st.rid].name : '')}"><datalist id="rw-names">${list.map(r => `<option value="${esc(r.name)}">`).join('')}</datalist>
      ${mine.length ? sel('rw-wid', [['', `اختر بحثاً (${mine.length})…`], ...mine.map(w => [w.id, `${w.y || ''} · ${(w.q || 'غير مصنف')}${w.sc != null ? ' · ' + w.sc + ' استشهاد' : ''} · ${w.t.slice(0, 64)}`])], st.wid).replace('class="form-select"', 'class="form-select mt-2"') : ''}`);
  };

  // ---------------------------------------------------------------- forms
  function form() {
    R.$$('#rw-tabs button').forEach(b => b.classList.toggle('on', b.dataset.m === st.mode));
    const html = {
      paper: `${importBlock()}
        ${fld('تصنيف المجلة في Scopus (SJR)', 'bi-bar-chart-line', sel('rw-q', [['', 'غير مفهرسة في Scopus'], ['Q1', 'Q1'], ['Q2', 'Q2'], ['Q3', 'Q3'], ['Q4', 'Q4'], ['NA', 'مفهرسة وغير مصنفة ضمن Q']], st.q))}
        ${st.q ? fld('إدراج المجلة في Scopus (المادة 8/1)', 'bi-clock-history', sel('rw-s5', [['', 'لم أتحقق بعد'], ['y', 'مدرجة منذ 5 سنوات على الأقل وبشكل مستمر'], ['n', 'مدرجة منذ أقل من 5 سنوات أو بتغطية منقطعة']], st.s5),
          cov ? `<span class="${cov.ok ? 'text-success' : 'text-danger'}">${esc(cov.txt)}</span>` : 'من صفحة المجلة في Scopus (Coverage)') : ''}
        ${fld('انتظام المجلة (المادة 8/2)', 'bi-activity', sel('rw-grow', [['', 'لم أتحقق بعد'], ['y', 'منتظمة الصدور، والزيادة في الأبحاث المنشورة ≤ 20% سنوياً'], ['n', 'غير منتظمة أو الزيادة أكثر من 20% سنوياً']], st.grow))}
        ${fld('معامل التأثير في Web of Science (اختياري)', 'bi-graph-up', num('rw-if', st.ifv, 'مثل 3.2'), 'من Journal Citation Reports (Clarivate)')}
        ${fld('مجلة عربية في التخصصات الإنسانية', 'bi-translate', sel('rw-ar', [['', 'لا'], ['local', 'محلية أو إقليمية'], ['global', 'عالمية']], st.ar), 'معتمدة في الجامعة الأردنية، ولا معامل تأثير لها')}
        ${fld('مجلة معتمدة بلا معامل تأثير', 'bi-journal', sel('rw-noif', [['', 'لا'], ['local', 'محلية أو إقليمية'], ['global', 'عالمية']], st.noif))}
        ${fld('رسوم النشر المدفوعة (اختياري)', 'bi-receipt', num('rw-fee', st.fee, 'بالدينار'), 'دعم النشر لا يتجاوز الحد الأعلى في الجدول')}
        ${yearBlock('لا يُنظر في الطلب بعد مرور أكثر من ثلاث سنوات على النشر والفهرسة (15/ج)')}
        ${chk('rw-bas', st.bas, 'مقبول للنشر في مجلة البصائر لأبحاث الأعمال (حافز 400)')}
        ${chk('rw-ns', st.ns, 'بحث أصيل أو مراجعة كاملة في مجلة Nature أو Science الأصلية (ضعف المكافأة)')}
        ${chk('rw-intl', st.intl, 'منشور مع باحثين دوليين من جامعات أو مراكز بحثية عالمية (+200)')}
        ${affBlock()}${authorsBlock()}`,
      cite: `${importBlock()}
        ${fld('عدد مرات الاستشهاد بالبحث في Scopus', 'bi-quote', num('rw-cites', st.cites, 'مثل 25', 0, 1), '20–39: 300 دينار · 40 فأكثر: 500 دينار، ولمرة واحدة للبحث')}
        ${yearBlock('للأبحاث المنشورة في عام 2022 وما بعده')}
        ${chk('rw-emp', st.emp, 'ما زلت على رأس عملي في الجامعة')}
        ${affBlock()}${authorsBlock()}`,
      book: `${fld('دار النشر', 'bi-building', sel('rw-pub', [['global', 'دار نشر عالمية'], ['arab', 'دار نشر عربية']], st.pub))}
        ${fld('نوع المساهمة', 'bi-bookmark', sel('rw-role', [['book', 'تأليف كتاب'], ['editor', st.pub === 'global' ? 'محرر الكتاب (الباحث الأول)' : 'محرر الكتاب'], ['chapter', 'فصل في كتاب']], st.role))}
        ${st.pub === 'global' && st.role === 'chapter' ? chk('rw-idx', st.idx, 'الكتاب محكم ومفهرس في Web of Science أو Scopus، ولم يُنشر محتوى الفصل سابقاً') : ''}
        ${yearBlock('لا يُنظر في الطلب بعد مرور أكثر من ثلاث سنوات على النشر (15/ج)')}
        ${affBlock()}${authorsBlock()}`,
      project: `${fld('نوع المشروع', 'bi-diagram-3', sel('rw-kind', [['std', 'مشروع بحث علمي مدعوم من الجامعة (المادة 9)'], ['innov', 'مشروع ابتكاري (المادة 16)']], st.kind))}
        ${fld(st.kind === 'innov' ? 'قيمة دعم المشروع الابتكاري' : 'إجمالي قيمة الدعم المقرر للمشروع', 'bi-cash-stack', num('rw-grant', st.grant, 'بالدينار'), st.kind === 'innov' ? 'تتراوح من 7,000 إلى 10,000 دينار، ويمكن زيادتها إن اقتضت الحاجة' : '')}
        ${st.kind === 'std' ? fld('إجمالي الراتب السنوي (اختياري)', 'bi-wallet2', num('rw-salary', st.salary, 'بالدينار'), 'تُحسب النسبة من الأقل بين الراتب السنوي والموازنة') : ''}
        ${fld('عدد الباحثين في الفريق', 'bi-people', sel('rw-team', [[1, 'باحث منفرد'], [2, 'باحثان اثنان'], [3, 'ثلاثة باحثين أو أكثر']], st.team))}`,
      patent: `${fld('نوع طلب البراءة', 'bi-globe', sel('rw-ptype', [['pct', 'طلب براءة دولي PCT/WIPO'], ['nat', 'براءة اختراع محلية (National)'], ['both', 'كلاهما للاختراع نفسه']], st.ptype))}
        ${fld('المرحلة التي بلغتها البراءة', 'bi-signpost-split', sel('rw-pstage', [['pub', st.ptype === 'nat' ? 'نُشرت البراءة' : 'نُشرت بتقرير إيجابي من هيئة البحث الدولي (ISA)'], ['grant', 'المنح النهائي']], st.pstage))}
        ${authorsBlock()}`,
      conf: `${fld('تذكرة السفر (سياحية) ورسوم التأشيرة', 'bi-airplane', num('rw-ticket', st.ticket, 'بالدينار'))}
        ${fld('رسوم الاشتراك في المؤتمر', 'bi-ticket-perforated', num('rw-regfee', st.regfee, 'بالدينار'))}
        ${fld('المياومة اليومية', 'bi-calendar-day', `<div class="rs-rw-auth"><label>المبلغ ${num('rw-perdiem', st.perdiem, 'دينار/يوم')}</label><label>الأيام ${num('rw-days', st.days, '', 0, 1)}</label></div>`, 'حسب تعليمات الانتقال والسفر، وبحد أقصى ثلاثة أيام عمل')}`,
    }[st.mode];
    R.$('#rw-form').innerHTML = `<h3><i class="bi bi-sliders"></i>المدخلات</h3><div class="rs-rw-form">${html}</div>`;
  }

  // ---------------------------------------------------------------- the calculation
  function authorsSplit(total) {
    const n = Math.max(1, st.n | 0), me = Math.min(n, Math.max(1, st.me | 0)), sh = shares(n);
    const ext = new Set(String(st.ext || '').split(/[,،\s]+/).map(Number).filter(x => x >= 1 && x <= n));
    const firstUop = !ext.has(1);
    const rows = sh.map((s, i) => ({ pos: i + 1, s, amt: total * s, ext: ext.has(i + 1) }));
    const extSum = rows.filter(r => r.ext).reduce((t, r) => t + r.amt, 0);
    rows.forEach(r => { if (r.ext) r.paid = 0; else r.paid = r.amt + (r.pos === 1 && firstUop ? extSum : 0); });
    return { rows, mine: rows[me - 1], me, firstUop, extSum };
  }
  // م(15/أ): Petra as the second affiliation halves the incentive; more than two affiliations are not allowed
  function affiliation(lines) {
    if (st.aff === '3') return 'لا يجوز وضع أكثر من ارتباطين للباحث ضمن عنوانه (Affiliation)، فلا يُصرف الحافز (المادة 15/أ).';
    if (st.aff === '2') { const sum = lines.reduce((t, l) => t + l[1], 0); lines.push(['جامعة البترا الارتباط الثاني: يُمنح 50%', -sum / 2, '15/أ', 'بحيث يكون ذلك مبرراً للمجلس']); }
    return '';
  }
  // م(15/ج): not considered more than three years after publication and indexing (citations excepted)
  function tooOld(warns) {
    const y = parseInt(st.py, 10); if (!y) return '';
    if (NOW - y > 3) return `مضى على النشر أكثر من ثلاث سنوات (${y})، فلا يُنظر في طلب الحافز (المادة 15/ج).`;
    if (NOW - y === 3) warns.push(`نُشر البحث في ${y}: قدّم الطلب قبل مرور ثلاث سنوات على نشره وفهرسته (${ref('15')}/ج).`);
    return '';
  }
  function calc() {
    const warns = [];
    if (st.mode === 'paper') {
      const opts = [];
      const v = parseFloat(st.ifv);
      if (!isNaN(v) && v >= 0) { const i = IF.findIndex(b => v <= b[0]); opts.push(['معامل التأثير ' + IF_BAND[i], IF[i][1], IF[i][2], '7/1']); }
      if (st.q) opts.push([st.q === 'NA' ? 'Scopus غير مصنفة ضمن Q' : 'Scopus ' + st.q, SC[st.q][0], SC[st.q][1], '7/4']);
      if (st.ar) opts.push(['مجلة عربية ' + (st.ar === 'local' ? 'محلية أو إقليمية' : 'عالمية'), AR[st.ar][0], AR[st.ar][1], '7/2']);
      if (st.noif) opts.push(['مجلة معتمدة بلا معامل تأثير ' + (st.noif === 'local' ? 'محلية أو إقليمية' : 'عالمية'), NOIF[st.noif][0], 0, '7/3']);
      if (st.bas) opts.push(['مجلة البصائر لأبحاث الأعمال', 0, BASAER, '7/6']);
      if (!opts.length) return { empty: 'اختر تصنيف المجلة (Scopus، أو معامل التأثير، أو نوع المجلة).' };
      // م(8): conditions for paying publication support and incentive (added by decision 6841)
      if (st.q && st.s5 === 'n') return { blocked: 'المجلة المصنفة في Scopus يجب أن تكون مدرجة على موقع Scopus منذ 5 سنوات على الأقل وبشكل مستمر، فلا يُصرف دعم النشر ولا حافزه (المادة 8/1).' };
      if (st.grow === 'n') return { blocked: 'يُشترط أن تصدر المجلة بتكرار منتظم وألا تزيد الأبحاث المنشورة فيها على 20% سنوياً، فلا يُصرف دعم النشر ولا حافزه (المادة 8/2).' };
      if (st.q && !st.s5) warns.push(`تحقق من أن المجلة مدرجة في Scopus منذ 5 سنوات على الأقل وبشكل مستمر (${ref('8')}/1).`);
      if (!st.grow) warns.push(`تحقق من انتظام صدور المجلة وألا تزيد أبحاثها المنشورة على 20% سنوياً (${ref('8')}/2).`);
      const old = tooOld(warns); if (old) return { blocked: old };
      const sup = opts.reduce((a, b) => b[1] > a[1] ? b : a), inc = opts.reduce((a, b) => b[2] > a[2] ? b : a);
      const fee = parseFloat(st.fee), support = !isNaN(fee) && fee >= 0 ? Math.min(fee, sup[1]) : sup[1];
      const lines = [];
      if (sup[1]) lines.push([`دعم النشر (الأعلى: ${sup[0]})`, support, sup[3], !isNaN(fee) && fee < sup[1] ? `محدود برسوم النشر المدفوعة؛ الحد الأعلى ${sup[1]}` : `الحد الأعلى للدعم`]);
      lines.push([`حافز النشر (الأعلى: ${inc[0]})`, inc[2], inc[3], inc[2] ? '' : 'لا حافز لهذا التصنيف']);
      if (st.ns) lines.push(['مضاعفة المكافأة: Nature أو Science', lines.reduce((t, l) => t + l[1], 0), '11', 'ضعف المكافأة لبحث أصيل أو مراجعة كاملة']);
      if (st.intl) lines.push(['التعاون مع باحثين دوليين', INTL, '7/7', 'يضاف إلى مجموع مبلغ دعم الورقة']);
      const bad = affiliation(lines); if (bad) return { blocked: bad };
      const total = lines.reduce((t, l) => t + l[1], 0), A = authorsSplit(total);
      if (opts.length > 1) warns.unshift(`المجلة مدرجة في أكثر من تصنيف: يُصرف المبلغ الأعلى ولا يُجمع بينها (${ref('7')}/5).`);
      return { lines, total, A, warns };
    }
    if (st.mode === 'cite') {
      const c = parseInt(st.cites, 10), y = parseInt(st.py, 10);
      if (isNaN(c)) return { empty: 'أدخل عدد مرات الاستشهاد بالبحث في Scopus.' };
      if (y && y < 2022) return { blocked: 'حوافز الاستشهاد للأبحاث المنشورة في عام 2022 وما بعده فقط (المادة 10).' };
      if (!st.emp) return { blocked: 'تُصرف حوافز الاستشهاد للباحثين الذين ما زالوا على رأس عملهم في الجامعة (المادة 10).' };
      const amt = CITE(c);
      if (!amt) return { blocked: `عدد الاستشهادات (${c}) أقل من 20؛ يبدأ الحافز من 20 استشهاداً في Scopus (المادة 10).` };
      const lines = [[`حافز الاستشهاد: ${c} استشهاداً في Scopus (${c >= 40 ? '40 فأكثر' : '20–39'})`, amt, '10', 'لمرة واحدة للبحث الواحد']];
      const bad = affiliation(lines); if (bad) return { blocked: bad };
      if (!y) warns.push(`حوافز الاستشهاد للأبحاث المنشورة في عام 2022 وما بعده، ويُحتسب الاستشهاد خلال آخر خمس سنوات (${ref('10')}).`);
      warns.push(`تصرف الجامعة الحافز لمرة واحدة للبحث الواحد (${ref('10')}). ولا تنطبق مهلة الثلاث سنوات على حوافز الاستشهاد (${ref('15')}/ج).`);
      const total = lines.reduce((t, l) => t + l[1], 0);
      return { lines, total, A: authorsSplit(total), warns };
    }
    if (st.mode === 'book') {
      if (st.pub === 'global' && st.role === 'chapter' && !st.idx) return { blocked: 'مكافأة الفصل (500 دينار) تُصرف إذا نُشر في كتاب محكم ومفهرس في Web of Science أو Scopus، ولم يُنشر محتواه أو أي جزء منه سابقاً (المادة 7/12).' };
      const old = tooOld(warns); if (old) return { blocked: old };
      const amt = { global: { book: 2000, editor: 1000, chapter: 500 }, arab: { book: 1000, editor: 500, chapter: 500 } }[st.pub][st.role];
      const lab = { book: 'حافز نشر كتاب', editor: 'محرر الكتاب', chapter: 'فصل في كتاب' }[st.role] + (st.pub === 'global' ? ' (دار نشر عالمية)' : ' (دار نشر عربية)');
      const lines = [[lab, amt, '7/12', st.role === 'chapter' ? (st.pub === 'global' ? 'كتاب محكم ومفهرس في Web of Science أو Scopus' : 'بحد أقصى فصل في كتاب واحد عن كل سنة') : 'بحد أقصى كتاب واحد عن كل سنة؛ عند الجمع بين التأليف والتحرير في الكتاب نفسه تُمنح المكافأة الأعلى']];
      const bad = affiliation(lines); if (bad) return { blocked: bad };
      const total = lines.reduce((t, l) => t + l[1], 0);
      return { lines, total, A: authorsSplit(total), warns };
    }
    if (st.mode === 'project') {
      const g = parseFloat(st.grant), s = parseFloat(st.salary);
      if (isNaN(g) || g <= 0) return { empty: 'أدخل قيمة الدعم المقرر للمشروع.' };
      if (st.kind === 'innov') {
        const pct = { 1: 0.20, 2: 0.30, 3: 0.40 }[st.team] || 0.4;
        if (g < 7000 || g > 10000) warns.push(`تتراوح قيمة دعم المشروع الابتكاري من 7,000 إلى 10,000 دينار، ويمكن زيادتها إن اقتضت الحاجة (${ref('16')}/ي).`);
        warns.push(`يمكن زيادة نسبة المكافآت إذا اقتضت الحاجة بعد موافقة مجلس البحث العلمي ورئيس الجامعة (${ref('16')}/ك).`);
        return { lines: [[`مكافأة الباحثين والمشاركين: ${pct * 100}% من قيمة دعم المشروع الابتكاري`, g * pct, '16/ي', st.team === 1 ? 'باحث واحد' : st.team === 2 ? 'باحثان' : 'ثلاثة باحثين أو أكثر']], total: g * pct, team: true, warns };
      }
      const base = !isNaN(s) && s > 0 ? Math.min(g, s) : g, pct = { 1: 0.10, 2: 0.15, 3: 0.20 }[st.team] || 0.2, raw = base * pct, amt = Math.min(raw, 2000);
      return { lines: [[`مكافأة الفريق: ${pct * 100}% من ${base === g ? 'إجمالي قيمة الدعم' : 'إجمالي الراتب السنوي (الأقل)'}`, raw, '9/1', ''], ...(raw > 2000 ? [['الحد الأعلى للمكافأة', amt - raw, '9/2', 'لا تتجاوز قيمة المكافأة 2000 دينار']] : [])],
        total: amt, team: true, warns };
    }
    if (st.mode === 'patent') {
      const t = st.ptype === 'nat' ? 'nat' : 'pct', P = { pct: [1000, 2000], nat: [500, 500] }[t];
      const nm = t === 'pct' ? 'طلب براءة دولي PCT/WIPO' : 'براءة اختراع محلية';
      const lines = [[`${nm}: عند ${t === 'pct' ? 'النشر بتقرير إيجابي من هيئة البحث الدولي' : 'نشر البراءة'}`, P[0], '13/ج', '']];
      if (st.pstage === 'grant') lines.push([`${nm}: عند المنح النهائي`, P[1], '13/ج', t === 'pct' ? 'في إحدى الدول المنظمة لمعاهدة PCT' : '']);
      if (st.pstage === 'grant') warns.push(`مكافأة المنح النهائي تُصرف بعد مكافأة النشر؛ ولا يجوز منح أكثر من مكافأة لنفس الاختراع، والتنسيب لمجلس البحث العلمي (${ref('13')}/ج/3، ${ref('9')}/4).`);
      if (st.ptype === 'both') warns.push(`لا يجوز منح أكثر من مكافأة لنفس الاختراع، وتُمنح المكافأة الأعلى (PCT) ولمرة واحدة فقط (${ref('13')}/ج/3).`);
      const total = lines.reduce((x, l) => x + l[1], 0);
      return { lines, total, A: authorsSplit(total), warns };
    }
    const t = +st.ticket || 0, f = +st.regfee || 0, d = Math.min(3, Math.max(0, st.days | 0)), pd = (+st.perdiem || 0) * d, sum = t + f + pd, amt = Math.min(sum, 2000);
    if (!sum) return { empty: 'أدخل تكاليف المشاركة في المؤتمر.' };
    return { lines: [['تذكرة السفر ورسوم التأشيرة', t, '12/و/1', ''], ['رسوم الاشتراك في المؤتمر', f, '12/و/2', ''], [`المياومات (${d} ${d > 2 ? 'أيام' : 'يوم'})`, pd, '12/و/3', 'بحد أقصى ثلاثة أيام عمل'],
      ...(sum > 2000 ? [['الحد الأعلى', amt - sum, '12/و/4', 'ألا تتجاوز النفقات 2000 دينار']] : [])], total: amt, conf: true, warns };
  }

  // ---------------------------------------------------------------- result and rules
  const AFF = 'جامعة البترا (University of Petra) ارتباطاً أول في عنوان الباحث، وإن كانت الارتباط الثاني يُمنح 50% من الحافز، ولا يجوز أكثر من ارتباطين (15/أ).';
  const RULES = {
    paper: ['يُقدَّم طلب دعم النشر إلكترونياً مرفقاً بنسخة إلكترونية من البحث المنشور (6/أ).', 'الدعم للمجلات المحكمة، المفهرسة، أو التي لها معامل تأثير أو تصنيف، ولباحثين من داخل الجامعة فقط (6/ب).',
      'يحتوي البحث على عنوان الباحث الأول أو الرئيسي وجامعة البترا في مكان بارز في الصفحة الأولى (6/ج).',
      'شرط جديد: أن تكون المجلة المصنفة في Scopus مدرجة على موقع Scopus منذ 5 سنوات على الأقل وبشكل مستمر (8/1).',
      'شرط جديد: أن تصدر المجلة بتكرار منتظم ويبقى عدد البحوث في كل عدد شبه منتظم، وألا تزيد الأبحاث المنشورة على 20% سنوياً (8/2)؛ ولمجلس البحث العلمي توجيه نصائح حول المجلات غير السوية (8/3).',
      'المجلة في أكثر من تصنيف: يُصرف المبلغ الأعلى، ولا يجوز الجمع بينها (7/5).', 'حافز 400 دينار لمن تُقبل أبحاثهم للنشر في مجلة البصائر لأبحاث الأعمال (7/6).',
      'يضاف 200 دينار إلى مجموع مبلغ دعم الورقة المنشورة مع باحثين دوليين من جامعات أو مراكز بحثية عالمية (7/7) — حُذف شرط تصنيف الجامعات بقرار 6841.',
      'توزَّع المكافأة على الباحثين حسب جدول (7/8)، وحصة الباحثين من خارج الجامعة للباحث الأول إن كان من جامعة البترا (7/9).',
      'البحوث المستلة من رسائل طلبة الدراسات العليا الذين أشرف عليهم عضو الهيئة التدريسية تُكافأ حسب النسب نفسها (7/10).',
      'ضعف المكافأة لبحث أصيل أو مراجعة كاملة في مجلتي Nature أو Science الأصليتين (11).', AFF,
      'ألا يتجاوز العدد الكلي لارتباطات الباحثين على البحث الحد الأقصى لكل تخصص (Affiliation Caps per Subject) وقت التقدم بالطلب (15/ب).',
      'لا يُنظر في طلب الحوافز بعد مرور أكثر من ثلاث سنوات على النشر والفهرسة، ويُشترط أن يكون المتقدم عضو هيئة تدريس في الجامعة (15/ج).'],
    cite: ['تُصرف الحوافز لمرة واحدة للبحث الواحد، للباحثين الذين ما زالوا على رأس عملهم في الجامعة (10).', 'للأبحاث المنشورة في عام 2022 وما بعده، والمستشهد بها خلال آخر خمس سنوات، حسب عدد الاستشهادات في Scopus: 20–39 = 300 دينار، 40 فأكثر = 500 دينار (10).',
      'توزَّع قيمة الحافز حسب النسب في الجدول في المادة (7) البند 8 (10).', AFF, 'تُستثنى حوافز الاستشهاد من مهلة الثلاث سنوات (15/ج).'],
    book: ['ألا يكون محتوى الكتاب مستخلصاً من رسالة ماجستير أو دكتوراه، وألا يكون قد سبق نشره (7/12).', 'أن يكون المؤلف على رأس عمله، وأن يُشار إلى جامعة البترا في عنوان المؤلف، وأن يقدم ثلاث نسخ لمكتبة الجامعة (7/12).',
      'دار نشر عالمية: كتاب 2000 دينار، أو 1000 إن كان الباحث الأول محرراً، وفصل 500 دينار في كتاب محكم ومفهرس في Web of Science أو Scopus (7/12).',
      'دار نشر عربية: كتاب 1000 دينار، أو 500 إن كان الباحث محرراً، وفصل 500 دينار؛ والنشر في مجال التخصص، ويُحكَّم من عمادة البحث العلمي بمعدل لا يقل عن 80% لثلاثة محكمين (7/12).',
      'ألا يكون الباحث قد دُعم من الجامعة لنشر الكتاب نفسه (المادة 5/هـ)، وتوزَّع المكافأة حسب جدول (7/8).', AFF],
    project: ['مشروع البحث (المادة 9): 10% لباحث منفرد، 15% لباحثين، 20% لثلاثة فأكثر؛ من الأقل بين إجمالي الراتب السنوي ومجموع الموازنة، ولا تتجاوز 2000 دينار، وتُصرف للباحثين من جامعة البترا (9/2).',
      'تُصرف بعد تقديم تقرير مفصّل ومقبول لدى مجلس البحث العلمي، وبتنسيب الباحث الرئيسي بنسب التوزيع المقرّة في طلب الدعم (9/3).', 'تُصرف المكافآت والحوافز جميعها بتنسيب من مجلس البحث العلمي (9/4).',
      'المشروع الابتكاري (المادة 16): دعم من 7,000 إلى 10,000 دينار، ومكافأة 20% لباحث واحد، 30% لباحثين، 40% لثلاثة فأكثر من قيمة الدعم (16/ي)، ومدته عام قابل للتمديد إلى عامين (16/م).',
      'يُشترط أن يكون المتقدم للمشروع الابتكاري عضو هيئة تدريس في جامعة البترا، وأن يتضمن المقترح توصية من مركز الريادة والإبداع وحاضنة الأعمال (16/ج).'],
    patent: ['PCT/WIPO: 1000 دينار عند نشر البراءة الحاصلة على تقرير إيجابي من هيئة البحث الدولي، و2000 دينار عند المنح النهائي (13/ج/1).', 'براءة محلية: 500 دينار عند نشر البراءة و500 عند المنح النهائي (13/ج/2).',
      'لا يجوز منح أكثر من مكافأة لنفس الاختراع، وتُمنح المكافأة الأعلى ولمرة واحدة فقط (13/ج/3).', 'تنطبق على طلبات البراءات التي لا تزال قيد الدراسة (patent pending) (13/ج/4).',
      'عند وجود أكثر من باحث، تُصرف المكافأة للباحثين من داخل جامعة البترا حسب النسب في جدول (7/8) (13/ج/5).'],
    conf: ['مؤتمر علمي متخصص، محكّم، مرموق دولياً ومفهرس، وللمشارك بحث مقبول للإلقاء شفوياً لم يُنشر سابقاً (12/ب).', 'مؤتمر واحد في العام الدراسي إلا في حالات استثنائية يقررها الرئيس (12/د).',
      'ألا تتجاوز مدة المؤتمر ثلاثة أيام عمل في الفصلين الأول والثاني (12/هـ).', 'تقديم حلقة بحث (Seminar) في الكلية وتقرير للمجلس بعد العودة (12/ز).'],
  };
  const TITLE = { paper: 'حصتك', cite: 'حصتك من حافز الاستشهاد', book: 'حصتك', patent: 'حصتك من مكافأة البراءة' };
  function render() {
    form();
    const C = calc(), out = R.$('#rw-out');
    if (C.empty) out.innerHTML = `<div class="rs-empty py-4"><i class="bi bi-calculator"></i>${C.empty}</div>`;
    else if (C.blocked) out.innerHTML = `<div class="rs-rw-total"><small>المبلغ المستحق</small><b>${JD(0)}</b></div><div class="rs-alert-warn mt-2"><i class="bi bi-x-octagon"></i> ${esc(C.blocked).replace(/\(المادة (\d+)([^)]*)\)/, (m, a, r) => `(${ref(a)}${r})`)}</div>`;
    else {
      const A = C.A;
      out.innerHTML = `<div class="rs-rw-total"><small>${C.team ? 'مكافأة الفريق البحثي' : C.conf ? 'مخصصات المؤتمر' : A ? `${TITLE[st.mode] || 'حصتك'} (الباحث ${A.me} من ${st.n})` : 'المبلغ'}</small>
          <b>${JD(A ? A.mine.paid : C.total)}</b>${A && st.n > 1 ? `<span>من مجموع ${JD(C.total)}</span>` : ''}</div>
        <table class="rs-table rs-rw-lines"><tbody>${C.lines.map(l => `<tr><td>${esc(l[0])}${l[3] ? `<small class="d-block text-muted">${esc(l[3])}</small>` : ''}</td><td class="num"><b>${l[1] < 0 ? '−' : ''}${JD(Math.abs(l[1]))}</b></td><td class="num">${ref(l[2].split('/')[0])}<small class="d-block text-muted">${l[2]}</small></td></tr>`).join('')}
          <tr class="jo"><td><b>المجموع</b></td><td class="num"><b>${JD(C.total)}</b></td><td></td></tr></tbody></table>
        ${(C.warns || []).map(w => `<div class="rs-alert-warn mt-2 small">${w}</div>`).join('')}
        ${A && st.n > 1 ? `<h4 class="rs-sub mt-3">التوزيع على الباحثين (${ref('7')}/8)</h4><table class="rs-table rs-rw-split"><thead><tr><th class="num">الترتيب</th><th class="num">النسبة</th><th class="num">المبلغ</th><th>ملاحظة</th></tr></thead><tbody>
          ${A.rows.map(r => `<tr class="${r.pos === A.me ? 'me' : ''}"><td class="num">${r.pos}${r.pos === A.me ? ' (أنت)' : ''}</td><td class="num">${(r.s * 100).toFixed(r.s * 100 % 1 ? 1 : 0)}%</td><td class="num"><b>${JD(r.paid)}</b></td>
            <td><small>${r.ext ? 'من خارج الجامعة: تُصرف حصته للباحث الأول' + (A.firstUop ? '' : ' (غير مستحقة: الباحث الأول من خارج الجامعة)') : r.pos === 1 && A.extSum && A.firstUop ? `يشمل ${JD(A.extSum)} حصة الباحثين من خارج الجامعة` : ''}</small></td></tr>`).join('')}</tbody></table>` : ''}`;
    }
    R.$('#rw-rules').innerHTML = `<h3><i class="bi bi-list-check"></i>الشروط والأحكام ذات الصلة</h3><ul class="rs-rw-rules">${RULES[st.mode].map(r => `<li>${esc(r).replace(/\((\d+)(\/[^)]*)?\)(?=[^()]*$)/, (m, a, rest) => `(${ref(a)}${rest || ''})`)}</li>`).join('')}</ul>`;
    const u = new URL(location); u.search = ''; Object.entries(st).forEach(([k, v]) => { if (v !== '' && v !== false && v !== undefined) u.searchParams.set(k, v === true ? 1 : v); }); history.replaceState(null, '', u);
  }

  // Scopus coverage of a journal (journals.json "cov", e.g. "1952, 1968-1975, 1991-2026") for م(8/1)
  let JR = null;
  async function coverage(w) {
    cov = null; if (!w || !w.issn) return;
    try {
      if (!JR) { const J = await R.load('journals'), K = Object.fromEntries(J.cols.map((c, i) => [c, i])), m = {};
        J.rows.forEach(r => String(r[K.issn] || '').split(/\s+/).filter(Boolean).forEach(i => { m[i.toUpperCase()] = r[K.cov]; })); JR = m; }
      const c = String(w.issn).split(/[,\s]+/).map(i => JR[i.replace('-', '').toUpperCase()]).find(Boolean);
      if (!c) return;
      const last = c.split(',').pop().trim().split('-').map(Number), start = last[0], end = last[1] || last[0], ry = w.y || NOW, yrs = ry - start;
      const ok = yrs >= 5 && end >= Math.min(ry, NOW - 1);
      cov = { ok, txt: `تغطية Scopus: ${c} — ${ok ? `متصلة منذ ${start} (${yrs} سنوات قبل ${ry})` : `متصلة منذ ${start} فقط (${Math.max(0, yrs)} ${yrs > 2 ? 'سنوات' : 'سنة'} قبل ${ry})`}` };
      st.s5 = ok ? 'y' : 'n';
    } catch (e) { cov = null; }
  }

  render();
  R.$('#rw-tabs').onclick = e => { const b = e.target.closest('[data-m]'); if (b) { st.mode = b.dataset.m; render(); } };
  const MAP = { 'rw-q': 'q', 'rw-if': 'ifv', 'rw-ar': 'ar', 'rw-noif': 'noif', 'rw-fee': 'fee', 'rw-n': 'n', 'rw-me': 'me', 'rw-ext': 'ext', 'rw-pub': 'pub', 'rw-role': 'role', 'rw-grant': 'grant', 'rw-salary': 'salary', 'rw-team': 'team',
    'rw-ticket': 'ticket', 'rw-regfee': 'regfee', 'rw-perdiem': 'perdiem', 'rw-days': 'days', 'rw-aff': 'aff', 'rw-s5': 's5', 'rw-grow': 'grow', 'rw-py': 'py', 'rw-cites': 'cites', 'rw-kind': 'kind', 'rw-ptype': 'ptype', 'rw-pstage': 'pstage' };
  const CHK = { 'rw-intl': 'intl', 'rw-ns': 'ns', 'rw-bas': 'bas', 'rw-idx': 'idx', 'rw-emp': 'emp' };
  R.$('#rw-form').addEventListener('change', async e => {
    const id = e.target.id;
    if (CHK[id]) st[CHK[id]] = e.target.checked;
    else if (id === 'rw-who') { const r = list.find(x => x.name === e.target.value.trim()); st.rid = r ? r.id : ''; st.wid = ''; }
    else if (id === 'rw-wid') { st.wid = e.target.value; const w = works.find(x => x.id === st.wid), r = byId[st.rid];
      if (w) { st.q = w.q || ((w.src || '').includes('s') ? 'NA' : ''); const au = (w.au || '').replace(/ …$/, '').split(/,\s*/).filter(Boolean); st.n = w.na || au.length || 1;
        const last = r ? R.norm(r.name_en || '').split(' ').pop() : ''; const pos = au.findIndex(a => last && R.norm(a).includes(last)); st.me = pos >= 0 ? pos + 1 : 1; st.intl = (w.cc || []).some(c => c !== 'JO');
        st.py = w.y ? String(w.y) : ''; st.cites = w.sc != null ? String(w.sc) : ''; st.s5 = '';
        if (st.mode === 'paper' && st.q) { R.$('#rw-out').innerHTML = '<div class="rs-empty py-4"><i class="bi bi-hourglass-split"></i>جارٍ التحقق من تغطية المجلة في Scopus…</div>'; await coverage(w); } } }
    else if (MAP[id]) { st[MAP[id]] = NUM.test(MAP[id]) ? +e.target.value : e.target.value; if (id === 'rw-s5' || id === 'rw-q') cov = null; }
    render();
  });
})();
