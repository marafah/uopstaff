/* reward.html: research rewards under تعليمات البحث العلمي، وبراءات الاختراع، والمشاركة في المؤتمرات العلمية (رقم 4 لسنة 2022),
   article 5 (publication support and incentives, books, funded projects) and article 6 (conferences). Amounts are the
   tables' maxima; payment follows the research council's recommendation and the financial system (article 5/و, 5/ح/4). */
(async function () {
  'use strict';
  const app = R.$('#rs-app');
  let data, wdata;
  try { [data, wdata] = await R.loadAll(['researchers', 'works']); } catch (e) { R.fail(app, e); return; }
  const { list, byId } = R.indexResearchers(data);
  R.updated(data.meta || {});
  const esc = R.esc, works = wdata.works || [];
  const ref = (a, d = '06') => `<a class="rs-ref" href="regulations.html?doc=${d}&a=${a}" target="_blank" rel="noopener">م(${a})</a>`;
  const JD = v => `${R.n(Math.round(v))} دينار`;

  // المادة (5/د/1): impact factor (Clarivate Web of Science) -> [support, incentive]
  const IF = [[0.5, 100, 200], [1, 200, 400], [1.5, 200, 500], [2, 300, 600], [2.5, 300, 700], [3, 400, 800], [3.5, 400, 900], [4, 600, 1000], [5, 600, 1200], [6, 600, 1400], [7, 600, 1700], [Infinity, 800, 2000]];
  const IF_BAND = ['IF ≤ 0.5', '0.5 < IF ≤ 1', '1 < IF ≤ 1.5', '1.5 < IF ≤ 2', '2 < IF ≤ 2.5', '2.5 < IF ≤ 3', '3 < IF ≤ 3.5', '3.5 < IF ≤ 4', '4 < IF ≤ 5', '5 < IF ≤ 6', '6 < IF ≤ 7', 'IF > 7'];
  const SC = { Q1: [200, 800], Q2: [200, 600], Q3: [200, 400], Q4: [200, 200], NA: [200, 200] };          // المادة (5/د/4)
  const AR = { local: [75, 200], global: [100, 300] };                                                         // المادة (5/د/2)
  const NOIF = { local: [75, 0], global: [100, 0] };                                                           // المادة (5/د/3)
  // المادة (5/د/7): share of each author by position
  const shares = n => n <= 1 ? [1] : n === 2 ? [0.6, 0.4] : n === 3 ? [0.5, 0.25, 0.25] : [0.35, ...Array(n - 1).fill(0.65 / (n - 1))];

  const st = Object.assign({ mode: 'paper', rid: '', wid: '', q: 'Q1', ifv: '', ar: '', noif: '', intl: false, fee: '', n: 1, me: 1, ext: '',
    pub: 'global', role: 'book', grant: '', salary: '', team: 1, ticket: '', regfee: '', perdiem: '', days: 3 },
    Object.fromEntries([...new URLSearchParams(location.search)].map(([k, v]) => [k, /^(n|me|team|days)$/.test(k) ? +v : k === 'intl' ? v === '1' : v])));

  app.innerHTML = `
  <section class="rs-section rs-card rs-pr-intro">
    <div><h3><i class="bi bi-calculator"></i>حاسبة مكافآت البحث العلمي</h3>
      <p class="mb-0">احسب دعم النشر وحوافزه ومكافآت الكتب والمشاريع والمؤتمرات حسب ${ref('5')} و${ref('6')} من تعليمات البحث العلمي رقم (4) لسنة 2022، مع نص كل شرط ومصدره، وتقرير قابل للطباعة برمز QR.</p></div>
    <a class="btn btn-rs-o" href="regulations.html?doc=06&a=5"><i class="bi bi-book"></i> نص المادة (5)</a>
  </section>
  <nav class="rs-tabs no-print" id="rw-tabs"><button data-m="paper"><i class="bi bi-journal-text"></i> بحث في مجلة</button><button data-m="book"><i class="bi bi-book"></i> كتاب أو فصل</button>
    <button data-m="project"><i class="bi bi-briefcase"></i> مشروع بحث مدعوم</button><button data-m="conf"><i class="bi bi-airplane"></i> مؤتمر علمي</button></nav>
  <section class="rs-section rs-rw-grid"><div class="rs-card rs-jf no-print" id="rw-form"></div><div class="rs-card rs-rw-out" id="rw-out"></div></section>
  <section class="rs-section rs-card" id="rw-rules"></section>
  <p class="rs-note">المبالغ هي الحد الأعلى في جداول التعليمات؛ يُصرف الدعم والحوافز بتنسيب من مجلس البحث العلمي ووفق النظام المالي وفي حدود الموازنة (${ref('5')}/و، ح/4). الدعم موجّه للباحثين في جامعة البترا، ويُشترط ذكر جامعة البترا في عنوان الباحث (${ref('5')}/ج). أداة تقديرية غير رسمية.</p>`;

  const sel = (id, opts, v) => `<select class="form-select" id="${id}">${opts.map(([k, l]) => `<option value="${k}"${String(k) === String(v) ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
  const fld = (label, icon, inner, hint) => `<div class="rs-jf-f"><span class="rs-jf-l"><i class="bi ${icon}"></i> ${label}</span>${inner}${hint ? `<small class="rs-jf-hint">${hint}</small>` : ''}</div>`;
  const num = (id, v, ph, min = 0, step = 'any') => `<input class="form-control" id="${id}" type="number" min="${min}" step="${step}" value="${v}" placeholder="${ph || ''}">`;
  const authorsBlock = () => fld('الباحثون', 'bi-people', `<div class="rs-rw-auth"><label>العدد ${num('rw-n', st.n, '', 1, 1)}</label><label>ترتيبي ${num('rw-me', st.me, '', 1, 1)}</label></div>
      <input class="form-control mt-2" id="rw-ext" value="${esc(st.ext)}" placeholder="ترتيب الباحثين من خارج الجامعة، مثل: 3,4">`, 'حصة الباحث من خارج الجامعة تُصرف للباحث الأول إن كان من جامعة البترا');

  // ---------------------------------------------------------------- forms
  function form() {
    R.$$('#rw-tabs button').forEach(b => b.classList.toggle('on', b.dataset.m === st.mode));
    const mine = byId[st.rid] ? works.filter(w => (w.r || []).includes(st.rid) && /article|review|journal/.test(w.type)).sort((a, b) => (b.y || 0) - (a.y || 0)) : [];
    const html = {
      paper: `${fld('استيراد بحث من ملفك (اختياري)', 'bi-person', `<input class="form-control" id="rw-who" list="rw-names" placeholder="اسمك…" value="${esc(byId[st.rid] ? byId[st.rid].name : '')}"><datalist id="rw-names">${list.map(r => `<option value="${esc(r.name)}">`).join('')}</datalist>
          ${mine.length ? sel('rw-wid', [['', `اختر بحثاً (${mine.length})…`], ...mine.map(w => [w.id, `${w.y || ''} · ${(w.q || 'غير مصنف')} · ${w.t.slice(0, 70)}`])], st.wid).replace('class="form-select"', 'class="form-select mt-2"') : ''}`)}
        ${fld('تصنيف المجلة في Scopus (SJR)', 'bi-bar-chart-line', sel('rw-q', [['', 'غير مفهرسة في Scopus'], ['Q1', 'Q1'], ['Q2', 'Q2'], ['Q3', 'Q3'], ['Q4', 'Q4'], ['NA', 'مفهرسة وغير مصنفة ضمن Q']], st.q))}
        ${fld('معامل التأثير في Web of Science (اختياري)', 'bi-graph-up', num('rw-if', st.ifv, 'مثل 3.2'), 'من Journal Citation Reports (Clarivate)')}
        ${fld('مجلة عربية في التخصصات الإنسانية', 'bi-translate', sel('rw-ar', [['', 'لا'], ['local', 'محلية أو إقليمية'], ['global', 'عالمية']], st.ar), 'معتمدة في الجامعة الأردنية، ولا معامل تأثير لها')}
        ${fld('مجلة معتمدة بلا معامل تأثير', 'bi-journal', sel('rw-noif', [['', 'لا'], ['local', 'محلية أو إقليمية'], ['global', 'عالمية']], st.noif))}
        ${fld('رسوم النشر المدفوعة (اختياري)', 'bi-receipt', num('rw-fee', st.fee, 'بالدينار'), 'دعم النشر لا يتجاوز الحد الأعلى في الجدول')}
        <label class="rs-pr-chk"><input type="checkbox" id="rw-intl"${st.intl ? ' checked' : ''}> منشور مع باحثين دوليين من جامعات أو مراكز بحثية عالمية (+200)</label>
        ${authorsBlock()}`,
      book: `${fld('دار النشر', 'bi-building', sel('rw-pub', [['global', 'دار نشر عالمية'], ['arab', 'دار نشر عربية']], st.pub))}
        ${fld('نوع المساهمة', 'bi-bookmark', sel('rw-role', [['book', 'تأليف كتاب'], ['editor', 'محرر الكتاب (الباحث الأول)'], ['chapter', 'فصل في كتاب']], st.role))}
        ${authorsBlock()}`,
      project: `${fld('إجمالي قيمة الدعم المقرر للمشروع', 'bi-cash-stack', num('rw-grant', st.grant, 'بالدينار'))}
        ${fld('إجمالي الراتب السنوي (اختياري)', 'bi-wallet2', num('rw-salary', st.salary, 'بالدينار'), 'تُحسب النسبة من الأقل بين الراتب السنوي والموازنة')}
        ${fld('عدد الباحثين في الفريق', 'bi-people', sel('rw-team', [[1, 'باحث منفرد'], [2, 'باحثان اثنان'], [3, 'ثلاثة باحثين أو أكثر']], st.team))}`,
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
  function calc() {
    if (st.mode === 'paper') {
      const opts = [];
      const v = parseFloat(st.ifv);
      if (!isNaN(v) && v >= 0) { const i = IF.findIndex(b => v <= b[0]); opts.push(['معامل التأثير ' + IF_BAND[i], IF[i][1], IF[i][2], '5/د/1']); }
      if (st.q) opts.push([st.q === 'NA' ? 'Scopus غير مصنفة ضمن Q' : 'Scopus ' + st.q, SC[st.q][0], SC[st.q][1], '5/د/4']);
      if (st.ar) opts.push(['مجلة عربية ' + (st.ar === 'local' ? 'محلية أو إقليمية' : 'عالمية'), AR[st.ar][0], AR[st.ar][1], '5/د/2']);
      if (st.noif) opts.push(['مجلة معتمدة بلا معامل تأثير ' + (st.noif === 'local' ? 'محلية أو إقليمية' : 'عالمية'), NOIF[st.noif][0], 0, '5/د/3']);
      if (!opts.length) return { empty: 'اختر تصنيف المجلة (Scopus، أو معامل التأثير، أو نوع المجلة).' };
      const sup = opts.reduce((a, b) => b[1] > a[1] ? b : a), inc = opts.reduce((a, b) => b[2] > a[2] ? b : a);
      const fee = parseFloat(st.fee), support = !isNaN(fee) && fee >= 0 ? Math.min(fee, sup[1]) : sup[1];
      const lines = [[`دعم النشر (الأعلى: ${sup[0]})`, support, sup[3], !isNaN(fee) && fee < sup[1] ? `محدود برسوم النشر المدفوعة؛ الحد الأعلى ${sup[1]}` : `الحد الأعلى للدعم`],
        [`حافز النشر (الأعلى: ${inc[0]})`, inc[2], inc[3], inc[2] ? '' : 'لا حافز لهذا التصنيف']];
      if (st.intl) lines.push(['التعاون مع باحثين دوليين', 200, '5/د/6', 'يضاف إلى مجموع مبلغ دعم الورقة']);
      const total = lines.reduce((t, l) => t + l[1], 0), A = authorsSplit(total);
      return { lines, total, A, opts, note: opts.length > 1 ? `المجلة مدرجة في أكثر من تصنيف: يُصرف المبلغ الأعلى ولا يُجمع بينها (${ref('5')}/د/5).` : '' };
    }
    if (st.mode === 'book') {
      const amt = { global: { book: 2000, editor: 1000, chapter: 1000 }, arab: { book: 1000, editor: 500, chapter: 500 } }[st.pub][st.role];
      const lab = { book: 'حافز نشر كتاب', editor: 'محرر الكتاب', chapter: 'فصل في كتاب' }[st.role] + (st.pub === 'global' ? ' (دار نشر عالمية)' : ' (دار نشر عربية)');
      const lines = [[lab, amt, '5/ز', st.role === 'chapter' ? 'بحد أقصى فصل في كتاب عن كل سنة' : 'بحد أقصى كتاب واحد عن كل سنة؛ عند الجمع بين التأليف والتحرير في الكتاب نفسه تُمنح المكافأة الأعلى']];
      return { lines, total: amt, A: authorsSplit(amt) };
    }
    if (st.mode === 'project') {
      const g = parseFloat(st.grant), s = parseFloat(st.salary);
      if (isNaN(g) || g <= 0) return { empty: 'أدخل إجمالي قيمة الدعم المقرر للمشروع.' };
      const base = !isNaN(s) && s > 0 ? Math.min(g, s) : g, pct = { 1: 0.10, 2: 0.15, 3: 0.20 }[st.team] || 0.2, raw = base * pct, amt = Math.min(raw, 2000);
      return { lines: [[`مكافأة الفريق: ${pct * 100}% من ${base === g ? 'إجمالي قيمة الدعم' : 'إجمالي الراتب السنوي (الأقل)'}`, raw, '5/ح/1', ''], ...(raw > 2000 ? [['الحد الأعلى للمكافأة', amt - raw, '5/ح/2', 'لا تتجاوز قيمة المكافأة 2000 دينار']] : [])],
        total: amt, team: true };
    }
    const t = +st.ticket || 0, f = +st.regfee || 0, d = Math.min(3, Math.max(0, st.days | 0)), pd = (+st.perdiem || 0) * d, sum = t + f + pd, amt = Math.min(sum, 2000);
    if (!sum) return { empty: 'أدخل تكاليف المشاركة في المؤتمر.' };
    return { lines: [['تذكرة السفر ورسوم التأشيرة', t, '6/و/1', ''], ['رسوم الاشتراك في المؤتمر', f, '6/و/2', ''], [`المياومات (${d} ${d > 2 ? 'أيام' : 'يوم'})`, pd, '6/و/3', 'بحد أقصى ثلاثة أيام عمل'],
      ...(sum > 2000 ? [['الحد الأعلى', amt - sum, '6/و/4', 'ألا تتجاوز النفقات 2000 دينار']] : [])], total: amt, conf: true };
  }

  // ---------------------------------------------------------------- result and rules
  const RULES = {
    paper: ['يُقدَّم طلب دعم النشر إلكترونياً مرفقاً بنسخة من البحث المنشور (5/أ).', 'الدعم لمجلات محكمة، مفهرسة، لها معامل تأثير أو تصنيف، ولباحثين من داخل الجامعة فقط (5/ب).',
      'يحتوي البحث على عنوان الباحث الأول أو الرئيسي وجامعة البترا في مكان بارز في الصفحة الأولى (5/ج).', 'المجلة في أكثر من تصنيف: يُصرف المبلغ الأعلى، ولا يجوز الجمع بينها (5/د/5).',
      'يضاف 200 دينار للبحث المنشور مع باحثين دوليين حسب تصنيف الجامعات المعتمد من مجلس البحث العلمي (5/د/6).', 'توزَّع المكافأة على الباحثين حسب جدول (5/د/7)، وحصة الباحثين من خارج الجامعة للباحث الأول إن كان من جامعة البترا.',
      'البحوث المستلة من رسائل طلبة الدراسات العليا الذين أشرف عليهم عضو الهيئة التدريسية تُكافأ حسب النسب نفسها (5/هـ).'],
    book: ['ألا يكون محتوى الكتاب مستخلصاً من رسالة ماجستير أو دكتوراه، وألا يكون قد سبق نشره.', 'أن يكون المؤلف على رأس عمله، وأن يُشار إلى جامعة البترا في عنوان المؤلف، وأن يقدم ثلاث نسخ لمكتبة الجامعة.',
      'دار نشر عالمية: أن يكون الكتاب محكماً ومعتمداً في دور نشر عالمية. دار نشر عربية: أن يكون النشر في مجال التخصص، ويُحكَّم من عمادة البحث العلمي بمعدل لا يقل عن 80% لثلاثة محكمين.',
      'ألا يكون الباحث قد دُعم من الجامعة لنشر الكتاب نفسه (5/هـ)، وتوزَّع المكافأة حسب جدول (5/د/7).'],
    project: ['تُحسب المكافأة للفريق من الأقل بين إجمالي الراتب السنوي ومجموع الموازنة، ولا تتجاوز 2000 دينار، وتُصرف للباحثين من جامعة البترا (5/ح/2).',
      'تُصرف بعد تقديم تقرير مفصّل ومقبول لدى مجلس البحث العلمي، وبتنسيب الباحث الرئيسي بنسب التوزيع المقرّة في طلب الدعم (5/ح/3).', 'تُصرف المكافآت والحوافز جميعها بتنسيب من مجلس البحث العلمي (5/ح/4).'],
    conf: ['مؤتمر علمي متخصص، محكّم، مرموق دولياً ومفهرس، وللمشارك بحث مقبول للإلقاء شفوياً لم يُنشر سابقاً (6/ب).', 'مؤتمر واحد في العام الدراسي إلا في حالات استثنائية يقررها الرئيس (6/د).',
      'ألا تتجاوز مدة المؤتمر ثلاثة أيام عمل في الفصلين الأول والثاني (6/هـ).', 'تقديم حلقة بحث (Seminar) في الكلية وتقرير للمجلس بعد العودة (6/ز).'],
  };
  function render() {
    form();
    const C = calc(), out = R.$('#rw-out');
    if (C.empty) out.innerHTML = `<div class="rs-empty py-4"><i class="bi bi-calculator"></i>${C.empty}</div>`;
    else {
      const A = C.A;
      out.innerHTML = `<div class="rs-rw-total"><small>${st.mode === 'project' ? 'مكافأة الفريق البحثي' : st.mode === 'conf' ? 'مخصصات المؤتمر' : A ? `حصتك (الباحث ${A.me} من ${st.n})` : 'المبلغ'}</small>
          <b>${JD(A ? A.mine.paid : C.total)}</b>${A && st.n > 1 ? `<span>من مجموع ${JD(C.total)}</span>` : ''}</div>
        <table class="rs-table rs-rw-lines"><tbody>${C.lines.map(l => `<tr><td>${esc(l[0])}${l[3] ? `<small class="d-block text-muted">${esc(l[3])}</small>` : ''}</td><td class="num"><b>${l[1] < 0 ? '−' : ''}${JD(Math.abs(l[1]))}</b></td><td class="num">${ref(l[2].split('/')[0])}<small class="d-block text-muted">${l[2]}</small></td></tr>`).join('')}
          <tr class="jo"><td><b>المجموع</b></td><td class="num"><b>${JD(C.total)}</b></td><td></td></tr></tbody></table>
        ${C.note ? `<div class="rs-alert-warn mt-2 small">${C.note}</div>` : ''}
        ${A && st.n > 1 ? `<h4 class="rs-sub mt-3">التوزيع على الباحثين (${ref('5')}/د/7)</h4><table class="rs-table rs-rw-split"><thead><tr><th class="num">الترتيب</th><th class="num">النسبة</th><th class="num">المبلغ</th><th>ملاحظة</th></tr></thead><tbody>
          ${A.rows.map(r => `<tr class="${r.pos === A.me ? 'me' : ''}"><td class="num">${r.pos}${r.pos === A.me ? ' (أنت)' : ''}</td><td class="num">${(r.s * 100).toFixed(r.s * 100 % 1 ? 1 : 0)}%</td><td class="num"><b>${JD(r.paid)}</b></td>
            <td><small>${r.ext ? 'من خارج الجامعة: تُصرف حصته للباحث الأول' + (A.firstUop ? '' : ' (غير مستحقة: الباحث الأول من خارج الجامعة)') : r.pos === 1 && A.extSum && A.firstUop ? `يشمل ${JD(A.extSum)} حصة الباحثين من خارج الجامعة` : ''}</small></td></tr>`).join('')}</tbody></table>` : ''}`;
    }
    R.$('#rw-rules').innerHTML = `<h3><i class="bi bi-list-check"></i>الشروط والأحكام ذات الصلة</h3><ul class="rs-rw-rules">${RULES[st.mode].map(r => `<li>${esc(r).replace(/\((\d+\/[^)]+)\)/, (m, a) => `(${ref(a.split('/')[0])}/${a.split('/').slice(1).join('/')})`)}</li>`).join('')}</ul>`;
    const u = new URL(location); u.search = ''; Object.entries(st).forEach(([k, v]) => { if (v !== '' && v !== false && v !== undefined) u.searchParams.set(k, v === true ? 1 : v); }); history.replaceState(null, '', u);
  }
  render();
  R.$('#rw-tabs').onclick = e => { const b = e.target.closest('[data-m]'); if (b) { st.mode = b.dataset.m; render(); } };
  const MAP = { 'rw-q': 'q', 'rw-if': 'ifv', 'rw-ar': 'ar', 'rw-noif': 'noif', 'rw-fee': 'fee', 'rw-n': 'n', 'rw-me': 'me', 'rw-ext': 'ext', 'rw-pub': 'pub', 'rw-role': 'role', 'rw-grant': 'grant', 'rw-salary': 'salary', 'rw-team': 'team', 'rw-ticket': 'ticket', 'rw-regfee': 'regfee', 'rw-perdiem': 'perdiem', 'rw-days': 'days' };
  R.$('#rw-form').addEventListener('change', e => {
    const id = e.target.id;
    if (id === 'rw-intl') st.intl = e.target.checked;
    else if (id === 'rw-who') { const r = list.find(x => x.name === e.target.value.trim()); st.rid = r ? r.id : ''; st.wid = ''; }
    else if (id === 'rw-wid') { st.wid = e.target.value; const w = works.find(x => x.id === st.wid), r = byId[st.rid];
      if (w) { st.q = w.q || ((w.src || '').includes('s') ? 'NA' : ''); const au = (w.au || '').replace(/ …$/, '').split(/,\s*/).filter(Boolean); st.n = w.na || au.length || 1;
        const last = r ? R.norm(r.name_en || '').split(' ').pop() : ''; const pos = au.findIndex(a => last && R.norm(a).includes(last)); st.me = pos >= 0 ? pos + 1 : 1; st.intl = (w.cc || []).some(c => c !== 'JO'); } }
    else if (MAP[id]) st[MAP[id]] = /^(n|me|team|days)$/.test(MAP[id]) ? +e.target.value : e.target.value;
    render();
  });
})();
