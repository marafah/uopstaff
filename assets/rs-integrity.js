/* integrity.html: research integrity at every Jordanian university, public and private:
   retracted papers (Scopus document type «Retracted», with reason, date and notice from Retraction Watch) and papers in
   journals Scopus discontinued (official Scopus Source List). Filters by sector, university, period, reason, faculty and
   free text; views by paper, researcher, university, faculty/department and journal. Every record links to its source. */
(async function () {
  'use strict';
  const app = R.$('#rs-app');
  let D;
  try { D = await R.load('integrity'); } catch (e) { R.fail(app, e); return; }
  let RS = null; try { RS = await R.load('researchers'); } catch (e) { RS = null; }
  const UOP = {}; ((RS || {}).researchers || []).forEach(r => { UOP[r.id] = r; });
  R.updated(D);
  const esc = R.esc, N = R.n, U = D.unis, HOME = U.findIndex(u => u.afid === R.HOME_AFID);
  const G = Object.fromEntries(D.reason_groups.map(([k, a, i]) => [k, { a, i }]));
  const RAR = D.reason_ar || {}, FAR = D.fac_ar || {};
  const NOW = new Date().getFullYear();
  const ucol = i => i === HOME ? '#901d23' : R.colors[(i % (R.colors.length - 1)) + 1];

  // one list of retracted papers: Scopus records, then Retraction Watch records Scopus does not mark as retracted
  const P = D.papers.map(p => Object.assign(p, { src: 's' })).concat((D.rw_only || []).map(p => Object.assign(p, {
    au: p.au.map(n => ({ n, u: [] })), c: null, src: 'rw' })));
  P.forEach((p, k) => {
    p.k = k;
    p.ry = p.rw && p.rw.date ? +p.rw.date.slice(0, 4) : 0;
    p.lag = p.ry && p.y ? Math.max(0, p.ry - p.y) : null;
    p.jo = p.au.filter(a => (a.u || []).length);                                   // the Jordanian authors
    p.fg = [...new Set(p.jo.flatMap(a => (a.fa ? [a.fa] : []).concat((a.f || []).map(f => FAR[f] || f))).filter(Boolean))];
    p.dp = [...new Set(p.jo.flatMap(a => a.da ? [a.da] : (a.d || [])))];
    p.g = p.g || [];
    p.txt = R.norm([p.t, p.j, p.pub, p.doi, p.eid, ...p.au.map(a => a.n + ' ' + (a.an || '')), ...(p.rw ? p.rw.r : []), ...p.dp, ...(p.inst ? [p.inst] : [])].join(' '));
  });
  const years = P.map(p => p.y).filter(Boolean), Y0 = Math.min(...years, NOW), Y1 = Math.max(...years, NOW);
  const FACS = [...new Set(P.flatMap(p => p.fg))].sort((a, b) => a.localeCompare(b, 'ar'));

  const st = {
    tab: R.param('tab') || 'overview', sec: R.param('sec') || 'all', u: R.param('u') === '' ? -1 : +R.param('u'),
    y1: +R.param('from') || Y0, y2: +R.param('to') || Y1, ym: R.param('ym') || 'pub', g: R.param('g'), fac: R.param('fac'),
    q: R.param('q'), src: R.param('src') || 'all', n: 25, sort: R.param('sort') || 'new'
  };
  if (!(st.u >= 0 && U[st.u])) st.u = -1;

  const TABS = [
    ['overview', 'bi-speedometer2', 'نظرة عامة'], ['papers', 'bi-file-earmark-x', 'الأبحاث المسحوبة'], ['people', 'bi-people', 'الباحثون'],
    ['unis', 'bi-bank', 'الجامعات'], ['facs', 'bi-diagram-3', 'الكليات والأقسام'], ['journals', 'bi-journal-x', 'المجلات المحذوفة من Scopus'],
    ['method', 'bi-info-circle', 'المصادر والمنهجية']
  ];
  const secLbl = { all: 'كل الجامعات', pub: 'الحكومية', priv: 'الخاصة' };
  const uniOpts = () => U.map((u, i) => [u, i]).filter(([u]) => st.sec === 'all' || (st.sec === 'pub') === !!u.pub)
    .sort((a, b) => a[0].ar.localeCompare(b[0].ar, 'ar'))
    .map(([u, i]) => `<option value="${i}"${i === st.u ? ' selected' : ''}>${esc(u.ar)}</option>`).join('');
  const yOpts = v => { let s = ''; for (let y = Y1; y >= Y0; y--) s += `<option${y === v ? ' selected' : ''}>${y}</option>`; return s; };

  app.innerHTML = `
  <section class="rs-section no-print ig2" aria-label="تصفية">
    <div class="ig2-r1">
      <div class="ig2-f"><span class="ig2-l">القطاع</span><div class="rs-seg ig2-seg" id="ig-sec" role="group" aria-label="القطاع">${Object.entries(secLbl).map(([k, v]) => `<button type="button" data-s="${k}">${v}</button>`).join('')}</div></div>
      <label class="ig2-f grow"><span class="ig2-l">الجامعة</span><select id="ig-u" class="form-select"><option value="-1">الكل</option>${uniOpts()}</select></label>
      <div class="ig2-f"><span class="ig2-l">الفترة</span><div class="ig2-per"><select id="ig-y1" class="form-select" aria-label="من سنة">${yOpts(st.y1)}</select><span class="ig2-dash">–</span><select id="ig-y2" class="form-select" aria-label="إلى سنة">${yOpts(st.y2)}</select>
        <div class="rs-seg ig2-seg sm" id="ig-ym" role="group" aria-label="السنة حسب"><button type="button" data-m="pub" title="حسب سنة نشر البحث">النشر</button><button type="button" data-m="ret" title="حسب سنة إعلان السحب (Retraction Watch)">السحب</button></div></div></div>
      <label class="ig2-f grow"><span class="ig2-l">سبب السحب</span><select id="ig-g" class="form-select"><option value="">كل الأسباب</option>${D.reason_groups.map(([k, a]) => `<option value="${k}"${k === st.g ? ' selected' : ''}>${esc(a)}</option>`).join('')}<option value="none"${st.g === 'none' ? ' selected' : ''}>السبب غير منشور</option></select></label>
      <label class="ig2-f grow"><span class="ig2-l">الكلية</span><select id="ig-fac" class="form-select"><option value="">كل الكليات</option>${FACS.map(f => `<option${f === st.fac ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select></label>
    </div>
    <div class="ig2-r2">
      <label class="ig2-q"><i class="bi bi-search"></i><input id="ig-q" class="form-control" type="search" placeholder="ابحث بعنوان، باحث، مجلة، ناشر، DOI، قسم…" value="${esc(st.q)}" aria-label="بحث"></label>
      <div class="rs-seg ig2-seg" id="ig-src" role="group" aria-label="المصدر"><button type="button" data-v="all">كل المصادر</button><button type="button" data-v="s">مسحوبة في Scopus</button><button type="button" data-v="rw">Retraction Watch فقط</button></div>
      <span class="ig2-count" id="ig-count"></span>
      <div class="ig2-acts"><button type="button" class="ig2-ib" id="ig-reset" title="إعادة الضبط"><i class="bi bi-arrow-counterclockwise"></i><span>إعادة الضبط</span></button><button type="button" class="ig2-ib" id="ig-csv" title="تصدير CSV"><i class="bi bi-filetype-csv"></i><span>تصدير</span></button><button type="button" class="ig2-ib" onclick="print()" title="طباعة"><i class="bi bi-printer"></i><span>طباعة</span></button></div>
    </div>
  </section>
  <div class="rs-print-only" id="ig-sum"></div>
  <nav class="rs-tabs no-print" id="ig-tabs">${TABS.map(([k, i, t]) => `<button data-t="${k}"><i class="bi ${i}"></i> ${t}</button>`).join('')}</nav>

  <div data-tab="overview">
    <section class="rs-section ig2-kpis" id="ig-kpis"></section>
    <section class="rs-section ig-insights" id="ig-ins"></section>
    <section class="rs-section rs-grid wide">
      <div class="rs-card"><h3><i class="bi bi-bar-chart"></i>الأبحاث المسحوبة حسب السنة <small class="fw-normal text-muted" id="ig-ylbl"></small></h3><div class="rs-chart"><canvas id="c-year"></canvas></div></div>
      <div class="rs-card"><h3><i class="bi bi-exclamation-diamond"></i>أسباب السحب <a class="rs-src" href="https://retractionwatch.com/retraction-watch-database-user-guide/" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-left"></i> Retraction Watch</a></h3><div class="rs-chart"><canvas id="c-reason"></canvas></div><p class="rs-note mb-0">قد يكون للبحث أكثر من سبب، فمجموع الأسباب أكبر من عدد الأبحاث.</p></div>
      <div class="rs-card"><h3><i class="bi bi-building"></i>أكثر الناشرين سحباً</h3><div class="rs-chart"><canvas id="c-pub"></canvas></div></div>
      <div class="rs-card"><h3><i class="bi bi-hourglass-split"></i>المدة بين النشر والسحب</h3><div class="rs-chart"><canvas id="c-lag"></canvas></div><p class="rs-note mb-0" id="ig-lagnote"></p></div>
      <div class="rs-card"><h3><i class="bi bi-pie-chart"></i>القطاع</h3><div class="rs-chart short"><canvas id="c-sec"></canvas></div></div>
      <div class="rs-card"><h3><i class="bi bi-grid-3x3-gap"></i>المجالات البحثية <small class="fw-normal text-muted">حسب تصنيف المجلة في Scopus</small></h3><div class="rs-chart"><canvas id="c-area"></canvas></div></div>
    </section>
  </div>

  <div data-tab="papers">
    <section class="rs-section"><div class="ig-listbar no-print"><span class="ig-count2" id="ig-pcount"></span>
      <label class="small text-muted">ترتيب</label><select id="ig-sort" class="form-select form-select-sm w-auto">
        <option value="new">الأحدث نشراً</option><option value="ret">الأحدث سحباً</option><option value="cite">الأكثر اقتباساً</option><option value="old">الأقدم</option></select></div>
      <div id="ig-list" class="ig-list"></div></section>
  </div>

  <div data-tab="people"><section class="rs-section rs-card"><h3><i class="bi bi-people"></i>الباحثون الأردنيون في الأبحاث المسحوبة <small class="fw-normal text-muted">المؤلفون الذين يرد لهم انتماء لجامعة أردنية في البحث نفسه</small></h3>
    <div class="rs-scroll" style="max-height:70vh"><table class="rs-table rs-tbl2 ig-table" id="ig-people"></table></div>
    <p class="rs-note mt-2 mb-0"><i class="bi bi-info-circle"></i> سحب البحث قرار من المجلة أو الناشر، وأسبابه لا تعني دائماً خطأً من كل مؤلف (أخطاء الناشر أو التحكيم أو طرف ثالث). الرقم «إجمالي وثائقه» من Scopus للباحثين الذين لهم وثيقتان أو أكثر بانتماء أردني.</p></section></div>

  <div data-tab="unis">
    <section class="rs-section rs-grid wide">
      <div class="rs-card"><h3><i class="bi bi-bar-chart-steps"></i>الأبحاث المسحوبة لكل 10,000 وثيقة</h3><div class="rs-chart tall" id="c-urate-w"><canvas id="c-urate"></canvas></div></div>
      <div class="rs-card"><h3><i class="bi bi-journal-x"></i>نسبة الأبحاث في مجلات حذفها Scopus</h3><div class="rs-chart tall" id="c-udisc-w"><canvas id="c-udisc"></canvas></div></div>
    </section>
    <section class="rs-section rs-card"><h3><i class="bi bi-table"></i>الجامعات الأردنية <small class="fw-normal text-muted">اضغط اسم جامعة لتصفية الصفحة كلها عليها</small></h3>
      <div class="rs-scroll"><table class="rs-table rs-tbl2 ig-table" id="ig-unis"></table></div></section>
  </div>

  <div data-tab="facs">
    <section class="rs-section rs-grid wide">
      <div class="rs-card"><h3><i class="bi bi-diagram-3"></i>الكليات <small class="fw-normal text-muted">حسب انتماء الباحثين الأردنيين في البحث</small></h3><div class="rs-chart tall"><canvas id="c-fac"></canvas></div></div>
      <div class="rs-card"><h3><i class="bi bi-diagram-2"></i>الأقسام</h3><div class="rs-scroll" style="max-height:420px"><table class="rs-table rs-tbl2 ig-table" id="ig-depts"></table></div></div>
    </section>
    <p class="rs-note"><i class="bi bi-info-circle"></i> الكلية والقسم كما كتبهما الباحث في انتمائه على Scopus، وتُجمع الكليات المتشابهة تحت اسم عربي واحد (مثل Faculty of Pharmacy و College of Pharmacy ← الصيدلة). لباحثي جامعة البترا تُستخدم الكلية والقسم من ملفاتهم الرسمية.</p>
  </div>

  <div data-tab="journals">
    <section class="rs-section rs-kpis" id="ig-jkpis"></section>
    <section class="rs-section rs-grid wide">
      <div class="rs-card"><h3><i class="bi bi-graph-up"></i>الأبحاث في مجلات محذوفة سنوياً <small class="fw-normal text-muted" id="ig-jscope"></small></h3><div class="rs-chart"><canvas id="c-jyear"></canvas></div></div>
      <div class="rs-card"><h3><i class="bi bi-calendar-x"></i>سنة حذف المجلات</h3><div class="rs-chart"><canvas id="c-jend"></canvas></div></div>
    </section>
    <section class="rs-section rs-card"><h3><i class="bi bi-journal-x"></i>المجلات المحذوفة التي نشر فيها باحثون أردنيون <a class="rs-src" href="https://www.elsevier.com/products/scopus/content/content-policy-and-selection" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-left"></i> قائمة Scopus الرسمية</a></h3>
      <div class="ig-listbar no-print"><input id="ig-jq" class="form-control form-control-sm" style="max-width:320px" type="search" placeholder="ابحث في المجلات والناشرين…"></div>
      <div class="rs-scroll" style="max-height:75vh"><table class="rs-table rs-tbl2 ig-table" id="ig-jt"></table></div>
      <p class="rs-note mt-2 mb-0"><i class="bi bi-info-circle"></i> يحذف Scopus المجلة (Discontinued) غالباً لأسباب تتعلق بالجودة أو أخلاقيات النشر. ما نُشر فيها قبل سنة الحذف يبقى مفهرساً ويُحسب، وما بعدها لا يُفهرس. الأعداد من تصدير Scopus لكل جامعة، والوثيقة المشتركة بين جامعتين تُحسب لكل منهما وتُحسب مرة واحدة في المجموع.</p></section>
  </div>

  <div data-tab="method"><section class="rs-section rs-card ig-method" id="ig-method"></section></div>`;

  // ---------------------------------------------------------------- filtering
  const inSec = i => st.sec === 'all' || (st.sec === 'pub') === !!(U[i] && U[i].pub);
  const uniOk = p => st.u >= 0 ? p.u.includes(st.u) : (st.sec === 'all' ? true : p.u.some(inSec));
  const yearOf = p => st.ym === 'ret' ? p.ry : p.y;
  function pick(skip) {
    const q = R.norm(st.q);
    return P.filter(p => uniOk(p)
      && (skip === 'y' || ((!yearOf(p) && st.y1 <= Y0) || (yearOf(p) >= st.y1 && yearOf(p) <= st.y2)))
      && (st.src === 'all' || p.src === st.src)
      && (!st.g || (st.g === 'none' ? !p.g.length : p.g.includes(st.g)))
      && (!st.fac || p.fg.includes(st.fac))
      && (!q || q.split(' ').every(w => p.txt.includes(w))));
  }
  // documents and papers in discontinued journals of the current scope, each document counted once
  const scopeTot = () => st.u >= 0 ? U[st.u] : D.tot[st.sec];
  const scopeTxt = () => st.u >= 0 ? U[st.u].ar : secLbl[st.sec];

  // ---------------------------------------------------------------- small renderers
  const uchip = (i, opt) => `<a class="ig-uchip${U[i].pub ? ' pub' : ' priv'}${i === HOME ? ' home' : ''}" href="#" data-uni="${i}" title="${esc(U[i].en)} · ${U[i].pub ? 'جامعة حكومية' : 'جامعة خاصة'}${opt ? '' : ' — اضغط للتصفية'}"><span class="d" style="background:${ucol(i)}"></span>${esc(U[i].ar)}</a>`;
  const secBadge = u => `<span class="ig-sec ${u.pub ? 'pub' : 'priv'}">${u.pub ? '<i class="bi bi-bank2"></i> حكومية' : '<i class="bi bi-briefcase"></i> خاصة'}</span>`;
  const gchip = k => G[k] ? `<span class="ig-g g-${k}"><i class="bi ${G[k].i}"></i>${esc(G[k].a)}</span>` : '';
  const rAr = r => RAR[r] || r;
  const fmtD = d => d ? new Date(d + 'T00:00:00Z').toLocaleDateString('ar-JO-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
  function author(a) {
    const jo = (a.u || []).length, p = a.p && UOP[a.p];
    const href = p ? R.profileUrl(p) : a.id && jo ? `experts.html?q=${encodeURIComponent(a.n)}` : a.id ? R.scopusAuthorUrl(a.id) : '';
    const meta = [a.da || (a.d || [])[0], a.fa || (a.f || [])[0], jo ? a.u.map(i => U[i].ar).join('، ') : ''].filter(Boolean).join(' · ');
    const inner = `${p ? R.avatar(p, 'sm') : `<i class="bi ${jo ? 'bi-person-fill' : 'bi-person'}"></i>`}<span>${esc(p ? p.name : a.n)}</span>`;
    return `<span class="ig-au${jo ? ' jo' : ''}${p ? ' uop' : ''}" title="${esc(meta)}">${href ? `<a href="${esc(href)}"${href.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}>${inner}</a>` : inner}${a.id ? `<a class="sc" href="${R.scopusAuthorUrl(a.id)}" target="_blank" rel="noopener" title="ملف المؤلف في Scopus">Sc</a>` : ''}</span>`;
  }
  function card(p) {
    const rw = p.rw || {};
    const links = [
      p.doi ? `<a href="https://doi.org/${esc(p.doi)}" target="_blank" rel="noopener"><i class="bi bi-link-45deg"></i> البحث (DOI)</a>` : '',
      rw.ndoi ? `<a href="https://doi.org/${esc(rw.ndoi)}" target="_blank" rel="noopener"><i class="bi bi-file-earmark-x"></i> إشعار السحب</a>` : '',
      p.eid ? `<a href="${R.scopusDocUrl(p.eid)}" target="_blank" rel="noopener"><i class="bi bi-bar-chart-line"></i> Scopus</a>` : '',
      rw.id ? `<a href="http://retractiondatabase.org/RetractionSearch.aspx#?AllIDs=${encodeURIComponent(rw.id)}" target="_blank" rel="noopener"><i class="bi bi-database-exclamation"></i> Retraction Watch #${esc(rw.id)}</a>` : '',
      p.jid ? `<a href="journals.html?id=${encodeURIComponent(p.jid)}"><i class="bi bi-journal-bookmark"></i> المجلة في الدليل</a>` : ''
    ].filter(Boolean).join('');
    const reasons = (rw.r || []).filter(r => !/^(Investigation|Notice|Date of|Upgrade|Retract and Replace)/i.test(r));
    return `<article class="ig-card${p.src === 'rw' ? ' rwonly' : ''}">
      <div class="ig-side"><span class="ig-stamp"><i class="bi bi-x-octagon-fill"></i>${rw.nat && rw.nat !== 'Retraction' ? esc(rw.nat) : 'مسحوب'}</span>
        <b class="ig-y">${p.y || '—'}</b><small>سنة النشر</small>${p.ry ? `<b class="ig-y r">${p.ry}</b><small>سنة السحب</small>` : ''}${p.lag != null ? `<span class="ig-lag" title="المدة بين النشر والسحب">${p.lag ? p.lag + ' سنة' : 'السنة نفسها'}</span>` : ''}</div>
      <div class="ig-body">
        <div class="ig-t ltr" dir="auto">${esc((p.t || '').replace(/^RETRACTED:\s*/i, '')) || '<span class="text-muted">العنوان غير متوفر في التصدير</span>'}</div>
        <div class="ig-m"><span class="ig-j ltr" dir="ltr"><i class="bi bi-journal-text"></i> ${esc(p.j || '')}</span>${p.q ? R.qTag(p.q) : ''}${p.disc ? `<span class="rs-tag bad" title="حذفها Scopus ${esc(p.disc_end)}"><i class="bi bi-journal-x"></i> مجلة محذوفة ${esc(p.disc_end)}</span>` : ''}${p.pub ? `<span class="rs-tag">${esc(p.pub)}</span>` : ''}${p.oa ? '<span class="rs-tag oa"><i class="bi bi-unlock"></i> مفتوح</span>' : ''}${p.c != null ? `<span class="rs-tag" title="اقتباسات Scopus رغم السحب"><i class="bi bi-quote"></i> ${N(p.c)}</span>` : ''}${p.src === 'rw' ? '<span class="rs-tag warn" title="مسجّل في Retraction Watch ولا يظهر مسحوباً في Scopus (غير مفهرس فيه أو لم يُحدَّث بعد)"><i class="bi bi-exclamation-triangle"></i> Retraction Watch فقط</span>' : ''}</div>
        <div class="ig-unis">${p.u.map(i => uchip(i)).join('')}</div>
        ${p.g.length ? `<div class="ig-gs">${p.g.map(gchip).join('')}</div>` : (p.rw ? '' : '<div class="ig-gs"><span class="ig-g none"><i class="bi bi-question-circle"></i>السبب غير منشور في Retraction Watch</span></div>')}
        ${reasons.length ? `<details class="ig-why"><summary><i class="bi bi-list-ul"></i> تفاصيل السبب${rw.date ? ` · أُعلن ${fmtD(rw.date)}` : ''}</summary><ul>${reasons.map(r => `<li>${esc(rAr(r))}<small class="ltr"> ${esc(r)}</small></li>`).join('')}</ul>${rw.notes ? `<p class="ltr" dir="ltr">${esc(rw.notes)}</p>` : ''}</details>` : (rw.date ? `<div class="small text-muted">أُعلن السحب ${fmtD(rw.date)}</div>` : '')}
        <div class="ig-aus">${p.au.map(author).join('')}${p.inst && !p.au.length ? `<small class="ltr">${esc(p.inst)}</small>` : ''}</div>
        <div class="ig-links no-print">${links}</div>
      </div></article>`;
  }

  // ---------------------------------------------------------------- views
  function kpis(L) {
    const jo = new Set(L.flatMap(p => p.jo.map(a => a.id || a.n))), us = new Set(L.flatMap(p => p.u.filter(inSec)));
    const known = L.filter(p => p.g.length).length, lags = L.map(p => p.lag).filter(x => x != null);
    const sel = U.map((u, i) => i).filter(i => st.u >= 0 ? i === st.u : inSec(i));
    const T = scopeTot(), docs = T.docs, disc = T.disc;
    const k = [
      ['bi-file-earmark-x', N(L.length), 'بحثاً مسحوباً', `${N(L.filter(p => p.src === 's').length)} في Scopus · ${N(L.filter(p => p.src === 'rw').length)} في Retraction Watch فقط`, 'm'],
      ['bi-people', N(jo.size), 'باحثاً أردنياً', 'مؤلفون بانتماء لجامعة أردنية', 'n'],
      ['bi-bank', N(us.size), 'جامعة', st.u >= 0 ? scopeTxt() : `من ${sel.length} ${secLbl[st.sec] === 'كل الجامعات' ? 'جامعة' : 'جامعة ' + secLbl[st.sec].replace('ال', '')}`, 'n'],
      ['bi-exclamation-diamond', R.pct(L.length ? known / L.length : 0), 'سببها معروف', `${N(known)} بحثاً لها سبب في Retraction Watch`, 't'],
      ['bi-hourglass-split', lags.length ? R.median(lags).toFixed(1) : '–', 'سنة حتى السحب', lags.length ? `الوسيط · من ${N(lags.length)} بحثاً بتاريخ سحب` : '', 't'],
      ['bi-quote', N(R.sum(L.map(p => p.c || 0))), 'اقتباساً لها', 'ما زالت تُقتبس في Scopus', 'n'],
      ['bi-journal-x', R.pct(docs ? disc / docs : 0, 1), 'في مجلات محذوفة', `${N(disc)} من ${N(docs)} وثيقة · ${scopeTxt()}`, 'm'],
    ];
    R.$('#ig-kpis').innerHTML = k.map(x => `<div class="ig2-k ${x[4]}"><span class="ic"><i class="bi ${x[0]}"></i></span><div class="tx"><div class="v">${x[1]}</div><div class="l">${x[2]}</div>${x[3] ? `<div class="d" title="${esc(x[3].replace(/<[^>]+>/g, ''))}">${x[3]}</div>` : ''}</div></div>`).join('');
    // findings in words
    const gc = {}; L.forEach(p => p.g.forEach(g => { gc[g] = (gc[g] || 0) + 1; }));
    const topG = Object.entries(gc).sort((a, b) => b[1] - a[1])[0];
    const pc = {}; L.forEach(p => { if (p.pub) pc[p.pub] = (pc[p.pub] || 0) + 1; });
    const topP = Object.entries(pc).sort((a, b) => b[1] - a[1])[0];
    const recent = L.filter(p => p.y >= NOW - 4).length;
    const uc = {}; L.forEach(p => p.u.filter(inSec).forEach(i => { uc[i] = (uc[i] || 0) + 1; }));
    const topU = Object.entries(uc).sort((a, b) => b[1] - a[1])[0];
    const ins = [
      topG && ['bi-exclamation-diamond', `أكثر أسباب السحب: <b>${esc(G[topG[0]].a)}</b> في ${N(topG[1])} بحثاً (${R.pct(topG[1] / Math.max(1, known))} من الأبحاث معروفة السبب).`],
      L.length && ['bi-calendar-event', `<b>${R.pct(recent / L.length)}</b> من الأبحاث المسحوبة نُشرت في آخر 5 سنوات (${NOW - 4}–${NOW}).`],
      topP && ['bi-building', `أكثر ناشر سحب أبحاثاً أردنية: <b class="ltr">${esc(topP[0])}</b> (${N(topP[1])}).`],
      st.u < 0 && topU && ['bi-bank', `أعلى عدد: <b>${esc(U[topU[0]].ar)}</b> (${N(topU[1])})، ونسبةً إلى حجم الإنتاج انظر تبويب <a href="#" data-go="unis">الجامعات</a>.`],
      L.filter(p => p.disc).length && ['bi-journal-x', `<b>${N(L.filter(p => p.disc).length)}</b> من الأبحاث المسحوبة منشورة في مجلات حذفها Scopus لاحقاً.`],
    ].filter(Boolean);
    R.$('#ig-ins').innerHTML = ins.length ? `<div class="rs-card ig-ins"><h3><i class="bi bi-lightbulb"></i>أبرز الملاحظات <small class="fw-normal text-muted">${esc(scopeTxt())}${st.fac ? ' · ' + esc(st.fac) : ''} · ${st.y1}–${st.y2}</small></h3><ul>${ins.map(([i, t]) => `<li><i class="bi ${i}"></i><span>${t}</span></li>`).join('')}</ul></div>` : '';
  }

  function charts(L) {
    // by year, public vs private
    const ys = []; for (let y = st.y1; y <= st.y2; y++) ys.push(y);
    const cnt = pub => ys.map(y => L.filter(p => yearOf(p) === y && (pub ? p.u.some(i => U[i].pub) : p.u.some(i => !U[i].pub))).length);
    R.$('#ig-ylbl').textContent = st.ym === 'ret' ? 'حسب سنة إعلان السحب' : 'حسب سنة نشر البحث';
    R.chart('c-year', { type: 'bar', data: { labels: ys, datasets: [
      { label: 'جامعات حكومية', data: cnt(true), backgroundColor: '#1f6f78', stack: 's' },
      { label: 'جامعات خاصة', data: cnt(false), backgroundColor: '#b8892b', stack: 's' }] },
      options: { maintainAspectRatio: false, plugins: { rsLabels: false, legend: { position: 'bottom' } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } } });
    const gc = D.reason_groups.map(([k, a]) => [a, L.filter(p => p.g.includes(k)).length, k]).filter(x => x[1]).sort((a, b) => b[1] - a[1]);
    const none = L.filter(p => !p.g.length).length; if (none) gc.push(['غير منشور', none, 'none']);
    R.chart('c-reason', { type: 'bar', data: { labels: gc.map(x => x[0]), datasets: [{ data: gc.map(x => x[1]), backgroundColor: gc.map(x => x[2] === 'none' ? '#c9c3b6' : '#901d23') }] },
      options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
        onClick: (e, el) => { if (!el.length) return; st.g = gc[el[0].index][2]; R.$('#ig-g').value = st.g; st.tab = 'papers'; render(); } } });
    const pc = {}; L.forEach(p => { const k = p.pub || 'غير معروف'; pc[k] = (pc[k] || 0) + 1; });
    const tp = Object.entries(pc).sort((a, b) => b[1] - a[1]).slice(0, 10);
    R.chart('c-pub', { type: 'bar', data: { labels: tp.map(x => x[0].length > 34 ? x[0].slice(0, 33) + '…' : x[0]), datasets: [{ data: tp.map(x => x[1]), backgroundColor: '#091b22' }] },
      options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } } });
    const bins = ['السنة نفسها', 'سنة', 'سنتان', '3 سنوات', '4 سنوات', '5 سنوات أو أكثر'], lb = [0, 0, 0, 0, 0, 0];
    L.forEach(p => { if (p.lag != null) lb[Math.min(5, p.lag)]++; });
    R.chart('c-lag', { type: 'bar', data: { labels: bins, datasets: [{ data: lb, backgroundColor: '#6b4c9a' }] }, options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
    R.$('#ig-lagnote').textContent = `للأبحاث التي يعرف Retraction Watch تاريخ سحبها (${N(L.filter(p => p.lag != null).length)}).`;
    const pubN = L.filter(p => p.u.some(i => U[i].pub) && !p.u.some(i => !U[i].pub)).length, privN = L.filter(p => p.u.some(i => !U[i].pub) && !p.u.some(i => U[i].pub)).length, both = L.filter(p => p.u.some(i => U[i].pub) && p.u.some(i => !U[i].pub)).length, nou = L.filter(p => !p.u.length).length;
    R.chart('c-sec', { type: 'doughnut', data: { labels: ['حكومية فقط', 'خاصة فقط', 'حكومية وخاصة معاً', 'انتماء غير محدد'], datasets: [{ data: [pubN, privN, both, nou], backgroundColor: ['#1f6f78', '#b8892b', '#6b4c9a', '#c9c3b6'] }] }, options: { maintainAspectRatio: false } });
    const ac = {}; L.forEach(p => (p.ar || []).forEach(a => { ac[a] = (ac[a] || 0) + 1; }));
    const ta = Object.entries(ac).sort((a, b) => b[1] - a[1]).slice(0, 10);
    R.chart('c-area', { type: 'bar', data: { labels: ta.map(x => R.areaAr(x[0])), datasets: [{ data: ta.map(x => x[1]), backgroundColor: '#1f6f78' }] }, options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } } });
  }

  function list(L) {
    const S = { new: (a, b) => (b.y - a.y) || (b.ry - a.ry), ret: (a, b) => (b.ry - a.ry) || (b.y - a.y), cite: (a, b) => (b.c || 0) - (a.c || 0), old: (a, b) => (a.y - b.y) };
    const rows = L.slice().sort(S[st.sort] || S.new);
    R.$('#ig-sort').value = st.sort;
    R.$('#ig-pcount').innerHTML = `<b>${N(rows.length)}</b> بحثاً · ${esc(scopeTxt())}`;
    R.$('#ig-list').innerHTML = rows.length ? rows.slice(0, st.n).map(card).join('') + (rows.length > st.n ? `<button class="btn btn-rs-o w-100 no-print" id="ig-more">عرض ${N(Math.min(25, rows.length - st.n))} أخرى (من ${N(rows.length - st.n)})</button>` : '')
      : '<div class="rs-empty"><i class="bi bi-check2-circle"></i>لا أبحاث مسحوبة بهذه الشروط.</div>';
    const m = R.$('#ig-more'); if (m) m.onclick = () => { st.n += 25; list(L); };
  }

  function peopleRows(L) {
    const M = {};
    L.forEach(p => p.jo.forEach(a => {
      const key = a.id || a.n, o = M[key] || (M[key] = { a, n: 0, ys: [], u: new Set(), k: [] });
      o.n++; o.ys.push(p.y); a.u.forEach(i => o.u.add(i)); o.k.push(p);
    }));
    const ppl = Object.fromEntries((D.people || []).map(x => [x.id, x]));
    return Object.values(M).filter(o => st.u < 0 || o.u.has(st.u)).map(o => Object.assign(o, { x: ppl[o.a.id] || {} })).sort((a, b) => b.n - a.n || a.a.n.localeCompare(b.a.n));
  }
  function people(L) {
    const rows = peopleRows(L);
    R.$('#ig-people').innerHTML = `<thead><tr><th>#</th><th>الباحث</th><th>الجامعة</th><th>الكلية</th><th>القسم</th><th class="num">مسحوبة</th><th class="num">إجمالي وثائقه</th><th>السنوات</th><th class="no-print">روابط</th></tr></thead><tbody>
      ${rows.slice(0, 400).map((o, k) => { const a = o.a, p = a.p && UOP[a.p], fac = a.fa || (a.f || [])[0] || o.x.f || '', dep = a.da || (a.d || [])[0] || o.x.d || '';
        return `<tr class="${p ? 'me' : ''}"><td class="num">${k + 1}</td><td><div class="ig-pname">${author(a)}</div></td><td>${[...o.u].map(i => uchip(i)).join('')}</td>
        <td><span class="ig-fac">${esc(FAR[fac] || fac)}</span>${FAR[fac] && FAR[fac] !== fac ? `<small class="d-block text-muted ltr">${esc(fac)}</small>` : ''}</td><td class="ltr small" dir="auto">${esc(dep)}</td>
        <td class="num"><a href="#" class="ig-n${o.n >= 3 ? ' hi' : ''}" data-who="${esc(a.n)}">${o.n}</a></td><td class="num">${o.x.docs ? `${N(o.x.docs)} <small class="text-muted">(${R.pct(o.n / o.x.docs, 1)})</small>` : '–'}</td>
        <td class="small">${[...new Set(o.ys)].sort().join('، ')}</td>
        <td class="no-print">${a.id ? `<a class="rs-src" href="${R.scopusAuthorUrl(a.id)}" target="_blank" rel="noopener">Scopus</a>` : ''} ${p ? `<a class="rs-src" href="${R.profileUrl(p)}">الملف البحثي</a>` : a.id ? `<a class="rs-src" href="experts.html?q=${encodeURIComponent(a.n)}">دليل الخبراء</a>` : ''}</td></tr>`; }).join('')}</tbody>`;
    if (!rows.length) R.$('#ig-people').innerHTML = '<tbody><tr><td class="rs-empty">لا باحثين بهذه الشروط.</td></tr></tbody>';
  }

  function unis(L) {
    const ret = {}; L.forEach(p => p.u.forEach(i => { ret[i] = (ret[i] || 0) + 1; }));
    const rows = U.map((u, i) => {
      const yd = R.sum(Object.entries(u.docs_y).filter(([y]) => +y >= st.y1 && +y <= st.y2).map(x => x[1]));
      const yj = R.sum(Object.entries(u.disc_y).filter(([y]) => +y >= st.y1 && +y <= st.y2).map(x => x[1]));
      const gs = {}; L.filter(p => p.u.includes(i)).forEach(p => p.g.forEach(g => { gs[g] = (gs[g] || 0) + 1; }));
      return { u, i, n: ret[i] || 0, docs: yd, rate: yd ? 1e4 * (ret[i] || 0) / yd : 0, disc: yj, ds: yd ? yj / yd : 0, top: Object.entries(gs).sort((a, b) => b[1] - a[1])[0] };
    }).filter(r => inSec(r.i)).sort((a, b) => b.rate - a.rate);
    R.$('#ig-unis').innerHTML = `<thead><tr><th>#</th><th>الجامعة</th><th>القطاع</th><th class="num">وثائقها في Scopus</th><th class="num">مسحوبة</th><th class="num">لكل 10 آلاف</th><th class="num">في مجلات محذوفة</th><th class="num">النسبة</th><th>أبرز سبب</th><th class="no-print"></th></tr></thead><tbody>
      ${rows.map((r, k) => `<tr class="${r.i === HOME ? 'me' : ''}${r.i === st.u ? ' sel' : ''}"><td class="num">${k + 1}</td><td>${uchip(r.i)}</td><td>${secBadge(r.u)}</td><td class="num">${N(r.docs)}</td>
        <td class="num"><b>${N(r.n)}</b></td><td class="num"><span class="rs-mini ${r.rate >= 40 ? 'zero' : r.rate >= 15 ? 'warn' : 'ok'}">${r.rate.toFixed(1)}</span></td>
        <td class="num">${N(r.disc)}</td><td class="num"><span class="rs-mini ${r.ds >= .08 ? 'zero' : r.ds >= .03 ? 'warn' : 'ok'}">${R.pct(r.ds, 1)}</span></td>
        <td>${r.top ? gchip(r.top[0]) : '<span class="text-muted small">–</span>'}</td>
        <td class="no-print"><a class="rs-src" href="https://www.scopus.com/pages/organization/${r.u.afid}" target="_blank" rel="noopener">Scopus</a> <a class="rs-src" href="jordan.html">المقارنة</a></td></tr>`).join('')}</tbody>`;
    const h = Math.max(380, rows.length * 22);
    R.$('#c-urate-w').style.height = h + 'px'; R.$('#c-udisc-w').style.height = h + 'px';
    const bar = (id, key, fmt) => { const s = rows.slice().sort((a, b) => b[key] - a[key]);
      R.chart(id, { type: 'bar', data: { labels: s.map(r => r.u.ar), datasets: [{ data: s.map(r => +fmt(r[key])), backgroundColor: s.map(r => r.i === HOME ? '#901d23' : r.u.pub ? '#1f6f78' : '#b8892b') }] },
        options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } } }); };
    bar('c-urate', 'rate', v => v.toFixed(1));
    bar('c-udisc', 'ds', v => (100 * v).toFixed(1));
    return rows;
  }

  function facs(L) {
    const fc = {}, dc = {};
    L.forEach(p => { p.fg.forEach(f => { fc[f] = (fc[f] || 0) + 1; });
      p.jo.forEach(a => (a.da ? [a.da] : (a.d || []).slice(0, 1)).forEach(d => { const k = d + '|' + (a.u[0] ?? ''); const o = dc[k] || (dc[k] = { d, u: a.u[0], ps: new Set() }); o.ps.add(p.k); })); });
    const f = Object.entries(fc).sort((a, b) => b[1] - a[1]).slice(0, 18);
    R.chart('c-fac', { type: 'bar', data: { labels: f.map(x => x[0]), datasets: [{ data: f.map(x => x[1]), backgroundColor: f.map(x => R.facColor(x[0])) }] },
      options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
        onClick: (e, el) => { if (!el.length) return; st.fac = f[el[0].index][0]; R.$('#ig-fac').value = st.fac; render(); } } });
    const ds = Object.values(dc).sort((a, b) => b.ps.size - a.ps.size);
    R.$('#ig-depts').innerHTML = ds.length ? `<thead><tr><th>القسم</th><th>الجامعة</th><th class="num">أبحاث</th></tr></thead><tbody>${ds.slice(0, 300).map(o => `<tr><td class="ltr small" dir="auto">${esc(o.d)}</td><td>${o.u != null && U[o.u] ? uchip(o.u) : ''}</td><td class="num"><a href="#" class="ig-n" data-who="${esc(o.d)}">${o.ps.size}</a></td></tr>`).join('')}</tbody>`
      : '<tbody><tr><td class="rs-empty">لا تتوفر الأقسام لهذه الأبحاث (تحتاج تصدير Scopus الكامل بالانتماءات).</td></tr></tbody>';
  }

  function journals() {
    const sel = U.map((u, i) => i).filter(i => st.u >= 0 ? i === st.u : inSec(i)), S = new Set(sel), q = R.norm(R.$('#ig-jq').value);
    const J = D.disc_journals.map(o => ({ o, n: st.u >= 0 ? (o.u[st.u] || 0) : st.sec === 'all' ? o.n : ((o.s || {})[st.sec] || 0) }))
      .filter(x => x.n && (!q || R.norm(o2s(x.o)).includes(q))).sort((a, b) => b.n - a.n);
    function o2s(o) { return [o.t, o.pub, o.issn].join(' '); }
    const T = scopeTot(), docs = T.docs, disc = T.disc;
    R.$('#ig-jscope').textContent = scopeTxt();
    R.$('#ig-jkpis').innerHTML = [
      ['bi-journal-x', N(J.length), 'مجلة محذوفة نشر فيها الباحثون', scopeTxt(), ''],
      ['bi-file-earmark-text', N(disc), 'بحثاً في مجلات محذوفة', `من ${N(docs)} وثيقة في Scopus`, 'gold'],
      ['bi-percent', R.pct(docs ? disc / docs : 0, 1), 'من كل الأبحاث', st.sec !== 'all' || st.u >= 0 ? `المعدل الأردني ${R.pct(D.tot.all.disc / Math.max(1, D.tot.all.docs), 1)}` : 'كل وثيقة تُحسب مرة واحدة', 'navy'],
      ['bi-calendar-x', N(J.filter(x => +x.o.end >= NOW - 2).length), `مجلة حُذفت منذ ${NOW - 2}`, 'حذف حديث: انتبه قبل الإرسال إليها', 'teal'],
    ].map(x => `<div class="rs-kpi ${x[4]}"><div class="v">${x[1]}</div><div class="l"><i class="bi ${x[0]}"></i>${x[2]}</div>${x[3] ? `<div class="d">${x[3]}</div>` : ''}</div>`).join('');
    const ys = []; for (let y = Math.max(st.y1, 2000); y <= st.y2; y++) ys.push(y);
    R.chart('c-jyear', { type: 'bar', data: { labels: ys, datasets: [
      { type: 'bar', label: 'أبحاث في مجلات محذوفة', data: ys.map(y => T.disc_y[y] || 0), backgroundColor: '#b8892b', yAxisID: 'y' },
      { type: 'line', label: 'النسبة من الإنتاج %', data: ys.map(y => { const d = T.docs_y[y] || 0; return d ? +(100 * (T.disc_y[y] || 0) / d).toFixed(1) : null; }), borderColor: '#901d23', backgroundColor: '#901d23', yAxisID: 'y2', tension: .3 }] },
      options: { maintainAspectRatio: false, plugins: { rsLabels: false, legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true }, y2: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: v => v + '%' } } } } });
    const ec = {}; J.forEach(x => { if (x.o.end) ec[x.o.end] = (ec[x.o.end] || 0) + x.n; });
    const ek = Object.keys(ec).sort();
    R.chart('c-jend', { type: 'bar', data: { labels: ek, datasets: [{ label: 'أبحاث أردنية في مجلات حُذفت في هذه السنة', data: ek.map(k => ec[k]), backgroundColor: '#6b4c9a' }] }, options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } } });
    R.$('#ig-jt').innerHTML = `<thead><tr><th>#</th><th>المجلة</th><th>الناشر</th><th>آخر تصنيف</th><th class="num">حُذفت</th><th class="num">أبحاث أردنية</th><th>أكثر الجامعات نشراً فيها</th><th class="num">اقتباسات</th><th class="no-print">روابط</th></tr></thead><tbody>
      ${J.slice(0, 400).map((x, k) => { const o = x.o, top = Object.entries(o.u).filter(([i]) => S.has(+i)).sort((a, b) => b[1] - a[1]).slice(0, 4);
        return `<tr><td class="num">${k + 1}</td><td class="ltr" dir="ltr"><b>${esc(o.t)}</b><small class="d-block text-muted">ISSN ${esc(o.issn)}</small></td><td class="ltr small" dir="ltr">${esc(o.pub || '')}</td><td>${o.q ? R.qTag(o.q) : '–'}</td>
          <td class="num"><span class="rs-tag bad">${esc(o.end || '?')}</span></td><td class="num"><b>${N(x.n)}</b>${st.u < 0 && st.sec === 'all' ? '' : `<small class="d-block text-muted">من ${N(o.n)} أردنياً</small>`}</td>
          <td><div class="ig-utop">${top.map(([i, n]) => `${uchip(+i)}<b>${n}</b>`).join('')}</div></td><td class="num">${N(o.c)}</td>
          <td class="no-print"><a class="rs-src" href="https://www.scopus.com/sourceid/${o.id}" target="_blank" rel="noopener">Scopus</a> <a class="rs-src" href="journals.html?id=${encodeURIComponent(o.id)}">الدليل</a></td></tr>`; }).join('')}</tbody>`;
    return J;
  }

  function method() {
    const s = D.sources;
    R.$('#ig-method').innerHTML = `<h3><i class="bi bi-info-circle"></i>المصادر والمنهجية</h3>
      <div class="ig-srcs">
        <div class="ig-srcc"><i class="bi bi-bar-chart-line"></i><b>Scopus</b><p>كل وثيقة يصنّفها Scopus «Retracted» ولها انتماء أردني، بالاستعلام <code dir="ltr">${esc(D.query)}</code>: <b>${N(s.scopus_total)}</b> بحثاً، منها ${N(s.scopus_full)} بسجل كامل (المؤلفون والانتماءات). تُجلب الجديدة مع كل تحديث عبر Scopus API.</p></div>
        <div class="ig-srcc"><i class="bi bi-database-exclamation"></i><b>Retraction Watch</b><p>قاعدة بيانات السحب المفتوحة (Crossref): <b>${N(s.rw_jordan)}</b> سجلاً بانتماء أردني، طوبق منها ${N(s.rw_matched)} مع Scopus عبر الـ DOI، و${N(s.rw_only)} غير ظاهرة كمسحوبة في Scopus. منها السبب وتاريخ السحب ورابط الإشعار. تُحدَّث مع كل تحديث للموقع.</p></div>
        <div class="ig-srcc"><i class="bi bi-journal-x"></i><b>قائمة مصادر Scopus</b><p>${esc(s.flags || '')}: المجلات المحذوفة (Discontinued) وسنة حذفها، مطابقةً بالـ ISSN مع ${N(s.docs)} وثيقة أردنية من تصدير Scopus لكل جامعة.</p></div>
        <div class="ig-srcc"><i class="bi bi-people"></i><b>الباحثون</b><p>الانتماء من حقل «Authors with affiliations» في Scopus لكل مؤلف في البحث نفسه؛ والكلية والقسم من نص الانتماء، ولباحثي جامعة البترا من ملفاتهم الرسمية.</p></div>
      </div>
      <h3 class="mt-3"><i class="bi bi-check2-square"></i>كيف تُقرأ الأرقام</h3>
      <ul class="ig-rules">
        <li>البحث المشترك بين جامعتين يُحسب لكل منهما، ويُحسب مرة واحدة في المجموع.</li>
        <li>«لكل 10 آلاف وثيقة» يقارن الجامعات مهما اختلف حجم إنتاجها، ضمن الفترة المختارة.</li>
        <li>«سبب السحب» من Retraction Watch، وقد يكون للبحث أكثر من سبب. حين لا يرد البحث فيه يظهر «السبب غير منشور».</li>
        <li>السحب قرار من المجلة أو الناشر، وبعض أسبابه لا تتعلق بالمؤلفين (خطأ الناشر، اختراق التحكيم في عدد خاص، تدخل طرف ثالث). اقرأ الإشعار قبل أي حكم.</li>
        <li>تشابه الأسماء ممكن. لذلك يرتبط كل باحث برقم مؤلفه في Scopus، ويُعرض الانتماء كما ورد في البحث.</li>
        <li>«Retraction Watch فقط»: بحث مسحوب في Retraction Watch لا يظهر مسحوباً في Scopus، إما لأنه غير مفهرس فيه أو لأن Scopus لم يحدّث سجله بعد.</li>
      </ul>
      <p class="rs-note mb-0">آخر تحديث للبيانات: ${esc(D.updated)}. لملاحظة أو تصحيح، أرسل رابط البحث ورقم EID أو DOI.</p>`;
  }

  // ---------------------------------------------------------------- render
  let LAST = [], ULAST = [], JLAST = [];
  function render() {
    R.$$('#ig-tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === st.tab));
    R.$$('[data-tab]', app).forEach(el => { el.hidden = el.dataset.tab !== st.tab; });
    R.$$('#ig-sec button').forEach(b => b.classList.toggle('on', b.dataset.s === st.sec));
    R.$$('#ig-ym button').forEach(b => b.classList.toggle('on', b.dataset.m === st.ym));
    R.$$('#ig-src button').forEach(b => b.classList.toggle('on', b.dataset.v === st.src));
    const L = LAST = pick();
    R.$('#ig-count').innerHTML = `<i class="bi bi-funnel"></i> <b>${N(L.length)}</b> بحثاً مسحوباً · ${esc(scopeTxt())}${st.fac ? ' · ' + esc(st.fac) : ''}${st.g ? ' · ' + esc(st.g === 'none' ? 'السبب غير منشور' : G[st.g].a) : ''}`;
    if (st.tab === 'overview') { kpis(L); charts(L); }
    if (st.tab === 'papers') list(L);
    if (st.tab === 'people') people(L);
    if (st.tab === 'unis') ULAST = unis(L);
    if (st.tab === 'facs') facs(L);
    if (st.tab === 'journals') JLAST = journals();
    if (st.tab === 'method') method();
    const u = new URL(location);
    [['tab', st.tab === 'overview' ? '' : st.tab], ['sec', st.sec === 'all' ? '' : st.sec], ['u', st.u >= 0 ? String(st.u) : ''], ['from', st.y1 === Y0 ? '' : st.y1], ['to', st.y2 === Y1 ? '' : st.y2],
      ['ym', st.ym === 'pub' ? '' : st.ym], ['g', st.g], ['fac', st.fac], ['q', st.q], ['src', st.src === 'all' ? '' : st.src], ['sort', st.sort === 'new' ? '' : st.sort]]
      .forEach(([k, v]) => v ? u.searchParams.set(k, v) : u.searchParams.delete(k));
    history.replaceState(null, '', u);
  }
  R.onPrint(() => {
    R.$('#ig-sum').innerHTML = `<div class="rs-print-head"><b>النزاهة البحثية</b> · ${esc(scopeTxt())} · ${st.y1}–${st.y2}${st.fac ? ' · ' + esc(st.fac) : ''}${st.g ? ' · ' + esc(st.g === 'none' ? 'السبب غير منشور' : G[st.g].a) : ''}${st.q ? ' · بحث: ' + esc(st.q) : ''}</div>`;
    if (st.tab === 'papers') { st.n = 100000; list(LAST); }
  });

  // ---------------------------------------------------------------- events
  R.$('#ig-tabs').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { st.tab = b.dataset.t; st.n = 25; render(); } };
  R.$('#ig-sec').onclick = e => { const b = e.target.closest('[data-s]'); if (!b) return; st.sec = b.dataset.s; if (st.u >= 0 && !inSec(st.u)) st.u = -1; R.$('#ig-u').innerHTML = '<option value="-1">الكل</option>' + uniOpts(); render(); };
  R.$('#ig-u').onchange = e => { st.u = +e.target.value; st.n = 25; render(); };
  R.$('#ig-y1').onchange = e => { st.y1 = +e.target.value; if (st.y1 > st.y2) { st.y2 = st.y1; R.$('#ig-y2').value = st.y2; } render(); };
  R.$('#ig-y2').onchange = e => { st.y2 = +e.target.value; if (st.y2 < st.y1) { st.y1 = st.y2; R.$('#ig-y1').value = st.y1; } render(); };
  R.$('#ig-ym').onclick = e => { const b = e.target.closest('[data-m]'); if (b) { st.ym = b.dataset.m; render(); } };
  R.$('#ig-src').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { st.src = b.dataset.v; render(); } };
  R.$('#ig-g').onchange = e => { st.g = e.target.value; st.n = 25; render(); };
  R.$('#ig-fac').onchange = e => { st.fac = e.target.value; st.n = 25; render(); };
  R.$('#ig-q').oninput = R.debounce(e => { st.q = e.target.value.trim(); st.n = 25; render(); }, 250);
  R.$('#ig-sort').onchange = e => { st.sort = e.target.value; list(LAST); render(); };
  R.$('#ig-jq').oninput = R.debounce(() => { JLAST = journals(); }, 250);
  R.$('#ig-reset').onclick = () => { Object.assign(st, { sec: 'all', u: -1, y1: Y0, y2: Y1, ym: 'pub', g: '', fac: '', q: '', src: 'all', n: 25 });
    R.$('#ig-u').innerHTML = '<option value="-1">الكل</option>' + uniOpts(); R.$('#ig-y1').value = Y0; R.$('#ig-y2').value = Y1; R.$('#ig-g').value = ''; R.$('#ig-fac').value = ''; R.$('#ig-q').value = ''; render(); };
  app.addEventListener('click', e => {
    const u = e.target.closest('[data-uni]');
    if (u) { e.preventDefault(); st.u = +u.dataset.uni; if (!inSec(st.u)) { st.sec = 'all'; R.$('#ig-u').innerHTML = '<option value="-1">الكل</option>' + uniOpts(); } R.$('#ig-u').value = st.u; if (st.tab === 'unis') st.tab = 'overview'; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const w = e.target.closest('[data-who]');
    if (w) { e.preventDefault(); st.q = w.dataset.who; R.$('#ig-q').value = st.q; st.tab = 'papers'; st.n = 25; render(); return; }
    const g = e.target.closest('[data-go]');
    if (g) { e.preventDefault(); st.tab = g.dataset.go; render(); }
  });
  R.$('#ig-csv').onclick = () => {
    if (st.tab === 'unis') return R.csv(ULAST.map(r => ({ university: r.u.ar, university_en: r.u.en, sector: r.u.pub ? 'public' : 'private', scopus_documents: r.docs, retracted: r.n, per_10000: r.rate.toFixed(2), in_discontinued_journals: r.disc, discontinued_share: r.ds.toFixed(4), scopus: `https://www.scopus.com/pages/organization/${r.u.afid}` })), `jordan-integrity-universities-${st.y1}-${st.y2}.csv`);
    if (st.tab === 'journals') return R.csv(JLAST.map(x => ({ journal: x.o.t, issn: x.o.issn, publisher: x.o.pub || '', last_quartile: x.o.q || '', discontinued: x.o.end, jordanian_papers: x.n, citations: x.o.c, scopus: `https://www.scopus.com/sourceid/${x.o.id}` })), 'jordan-discontinued-journals.csv');
    if (st.tab === 'people') return R.csv(peopleRows(LAST).map(o => ({ researcher: o.a.n, scopus_author_id: o.a.id || '', universities: [...o.u].map(i => U[i].ar).join('; '), faculty: o.a.fa || (o.a.f || [])[0] || '', department: o.a.da || (o.a.d || [])[0] || '', retracted: o.n, total_documents: o.x.docs || '', years: [...new Set(o.ys)].join('; ') })), 'jordan-retractions-researchers.csv');
    R.csv(LAST.map(p => ({ title: p.t, year: p.y, retraction_date: (p.rw || {}).date || '', journal: p.j, publisher: p.pub, quartile: p.q || '', journal_discontinued: p.disc ? p.disc_end : '',
      jordanian_universities: p.u.map(i => U[i].ar).join('; '), jordanian_authors: p.jo.map(a => a.n).join('; '), all_authors: p.au.map(a => a.n).join('; '),
      reasons: ((p.rw || {}).r || []).join('; '), reason_groups: p.g.map(g => G[g].a).join('; '), citations: p.c ?? '', doi: p.doi ? 'https://doi.org/' + p.doi : '',
      retraction_notice: (p.rw || {}).ndoi ? 'https://doi.org/' + p.rw.ndoi : '', scopus: p.eid ? R.scopusDocUrl(p.eid) : '', retraction_watch_id: (p.rw || {}).id || '', source: p.src === 's' ? 'Scopus' : 'Retraction Watch' })), `jordan-retractions-${st.y1}-${st.y2}.csv`);
  };
  if (!TABS.some(t => t[0] === st.tab)) st.tab = 'overview';
  render();
  R.$('#foot-count') && (R.$('#foot-count').textContent = `${N(P.length)} بحثاً مسحوباً`);
})();
