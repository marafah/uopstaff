/* jordan.html: compare Jordanian universities in Scopus by field, speciality, period, quartile, journals and collaboration */
(async function () {
  'use strict';
  const app = window.RS_JO_MOUNT || R.$('#rs-app');   // compare.html mounts this view inside its own page
  let C, D, T, SU;
  try { [C, D, T, SU] = await Promise.all([R.load('jordan/cube'), R.load('jordan/unis'), R.loadText('jordan/docs.tsv'), R.load('universities').catch(() => ({}))]); } catch (e) { R.fail(app, e); return; }
  R.updated({ updated: C.cites_updated || C.updated });
  const U = C.unis.map(([afid, en, ar], i) => ({ i, afid, en, ar }));
  const HOME = U.find(u => u.afid === R.HOME_AFID) || U[0];
  const prof = Object.fromEntries((D.universities || []).map(u => [u.afid, u]));
  const Y = Math.min(D.year || 9999, new Date().getFullYear());   // the next year holds only articles in press
  const AREAS = C.areas, CATS = C.cats;
  const COLS = Object.fromEntries(C.cols.map((c, i) => [c, i]));
  const esc = R.esc, pct = v => R.pct(v, 0);
  const SCOPUS = Object.fromEntries(((SU || {}).scopus_universities || []).map(u => [u.afid, u]));   // this week's official counts
  // one record per Scopus document: year, Jordanian universities, fields, specialities, quartile, international, open
  // access, conference, citations (this week's)
  const QI = { Q1: 0, Q2: 1, Q3: 2, Q4: 3 };
  const ints = x => x ? x.split(',').map(Number) : [];
  const DOCS = T.split('\n').slice(1).filter(Boolean).map(l => { const f = l.split('\t');
    return { y: +f[1] || 0, u: ints(f[2]), a: ints(f[3]), k: ints(f[4]), q: f[5] in QI ? QI[f[5]] : -1, intl: f[6] === '1', oa: f[7] === '1', conf: f[8] === '1', c: +f[9] || 0 }; });
  const JO = { i: -1, afid: '', en: 'Jordan (all universities)', ar: 'الأردن: كل الجامعات' };

  // default selection: Petra and the four universities closest in size
  const sizeOf = u => C.all.filter(r => r[0] === u.i).reduce((s, r) => s + r[3], 0);
  U.forEach(u => { u.size = sizeOf(u); });
  const near = U.filter(u => u !== HOME).sort((a, b) => Math.abs(a.size - HOME.size) - Math.abs(b.size - HOME.size)).slice(0, 4).map(u => u.i);
  const st = {
    sel: (R.store.get('rs-jo-sel', null) || [HOME.i, ...near]).filter(i => U[i]),
    from: +R.param('from') || 1990, to: +R.param('to') || Y, area: R.param('area') === '' ? -1 : (+R.param('area') || -1),
    cat: -1, sort: 'docs',
    frac: (R.param('count') || R.store.get('rs-jo-count', 'full')) === 'frac',   // without duplicates: each paper counted once
    scope: R.param('scope') || R.store.get('rs-jo-scope', 'all'),                 // the comparison: all universities or the chosen
    crit: R.param('m') || 'docs'
  };

  st.sort = st.crit;
  // ---------------------------------------------------------------- aggregation for the current filters
  // "with duplicates" (Scopus' own way): a paper shared by two universities counts fully for each, and a paper in two
  // fields counts in each. "Without duplicates": each paper counts once in all, split equally between its Jordanian
  // universities (and between its fields when a field is chosen), so the universities add up to the Jordanian total.
  // «all years» has no lower bound (as Scopus counts); up to this year includes articles in press
  const inPeriod = y => (st.from <= 1990 || y >= st.from) && (y <= st.to || (st.to >= Y && y > Y));
  const fieldW = d => {
    if (st.cat >= 0) return d.k.includes(st.cat) ? (st.frac ? 1 / d.k.length : 1) : 0;
    if (st.area >= 0) return d.a.includes(st.area) ? (st.frac ? 1 / d.a.length : 1) : 0;
    return 1;
  };
  const blank = () => ({ docs: 0, cites: 0, q1: 0, q2: 0, q3: 0, q4: 0, intl: 0, oa: 0, conf: 0 });
  function add(o, d, w) {
    o.docs += w; o.cites += w * d.c; if (d.q >= 0) o['q' + (d.q + 1)] += w; if (d.intl) o.intl += w; if (d.oa) o.oa += w; if (d.conf) o.conf += w;
  }
  function fin(o) {
    const qk = o.q1 + o.q2 + o.q3 + o.q4;
    return Object.assign(o, { qk, cpd: o.docs ? o.cites / o.docs : 0, q1s: qk ? o.q1 / qk : 0, q12: qk ? (o.q1 + o.q2) / qk : 0,
      intls: o.docs ? o.intl / o.docs : 0, oas: o.docs ? o.oa / o.docs : 0, confs: o.docs ? o.conf / o.docs : 0 });
  }
  const hIndex = cl => { cl.sort((a, b) => b - a); let h = 0; while (h < cl.length && cl[h] >= h + 1) h++; return h; };
  function stats() {
    const mk = u => Object.assign({ u, years: {}, cl: [] }, blank());
    const out = U.map(mk), jo = mk(JO);
    for (const d of DOCS) {
      if (!d.u.length || !inPeriod(d.y)) continue;
      const fw = fieldW(d); if (!fw) continue;
      const uw = st.frac ? 1 / d.u.length : 1;
      add(jo, d, fw); jo.cl.push(d.c); add(jo.years[d.y] || (jo.years[d.y] = blank()), d, fw);
      for (const i of d.u) { const o = out[i]; add(o, d, fw * uw); o.cl.push(d.c); add(o.years[d.y] || (o.years[d.y] = blank()), d, fw * uw); }
    }
    for (const o of out.concat(jo)) { fin(o); o.h = o.cl.length ? hIndex(o.cl) : null; o.cl = null; Object.values(o.years).forEach(fin); }
    return { out, jo };
  }
  // papers of a set of universities: how many are shared, i.e. what counting "with duplicates" adds
  function dupInfo(set) {
    let uniq = 0, full = 0;
    for (const d of DOCS) {
      if (!d.u.length || !inPeriod(d.y)) continue;
      if (!fieldW(d)) continue;
      const n = d.u.reduce((t, i) => t + (set.has(i) ? 1 : 0), 0);
      if (n) { uniq += 1; full += n; }
    }
    return { uniq, full };
  }
  // fields (or specialities of the chosen field) x universities: [documents, citations], with the Jordanian total under 'jo'
  function breakdown(level) {
    const t = {};
    for (const d of DOCS) {
      if (!d.u.length || !inPeriod(d.y)) continue;
      const keys = level === 'area' ? d.a : d.k.filter(k => (C.cat_area[k] || []).includes(st.area));
      if (!keys.length) continue;
      const kw = st.frac ? 1 / (level === 'area' ? d.a.length : d.k.length) : 1, uw = st.frac ? 1 / d.u.length : 1;
      for (const k of keys) {
        const x = t[k] || (t[k] = { jo: [0, 0] }); x.jo[0] += kw; x.jo[1] += kw * d.c;
        for (const i of d.u) { const v = x[i] || (x[i] = [0, 0]); v[0] += kw * uw; v[1] += kw * uw * d.c; }
      }
    }
    return t;
  }
  const periodTxt = () => st.from <= 1990 ? 'كل السنوات' : `${st.from}–${st.to}`;
  const fieldTxt = () => st.cat >= 0 ? CATS[st.cat] : st.area >= 0 ? R.areaAr(AREAS[st.area]) : 'كل المجالات';

  const M = {
    docs: ['الوثائق', v => fmtN(v)], cites: ['الاقتباسات', v => R.n(v)], cpd: ['اقتباس لكل وثيقة', v => v.toFixed(1)], h: ['h-index', v => v == null ? '–' : R.n(v)],
    q1s: ['نسبة Q1', pct], q12: ['نسبة Q1 و Q2', pct], intls: ['تعاون دولي', pct], oas: ['وصول مفتوح', pct], confs: ['أوراق مؤتمرات', pct]
  };
  // table pieces: a university's colour dot, its column heading, a rank badge, a thin bar, an icon per measure
  const ucol = i => i === HOME.i ? '#901d23' : st.sel.includes(i) ? color(U[i], st.sel.indexOf(i)) : '#7d8f95';
  const udot = i => `<i class="rs-udot" style="--uc:${ucol(i)}"></i>`;
  const uth = i => `<th class="num rs-uth">${udot(i)}<span>${esc(U[i].ar)}</span></th>`;
  const rkb = r => `<span class="rs-rk${r <= 3 ? ' r' + r : ''}">#${r}</span>`;
  const gbar = (w, c) => `<span class="rs-gbar"><i style="width:${Math.max(2, Math.min(100, w)).toFixed(0)}%${c ? ';background:' + c : ''}"></i></span>`;
  const MI = { docs: 'bi-file-earmark-text', cites: 'bi-quote', cpd: 'bi-graph-up-arrow', h: 'bi-award', q1s: 'bi-trophy', q12: 'bi-star-half', intls: 'bi-globe2', oas: 'bi-unlock', confs: 'bi-easel' };
  const fmtN = v => v == null ? '–' : Number.isInteger(+v) || v >= 100 ? R.n(v) : (+v).toFixed(1);
  const color = (u, k) => u.i === HOME.i ? '#901d23' : R.colors[(k % (R.colors.length - 1)) + 1];
  const yearOpts = sel => { let h = ''; for (let y = Y; y >= 1990; y--) h += `<option value="${y}"${y === sel ? ' selected' : ''}>${y}</option>`; return h; };
  const areaOpts = () => `<option value="-1">كل المجالات</option>` + AREAS.map((a, i) => [i, a]).sort((x, y) => R.areaAr(x[1]).localeCompare(R.areaAr(y[1]), 'ar'))
    .map(([i, a]) => `<option value="${i}"${i === st.area ? ' selected' : ''}>${esc(R.areaAr(a))}</option>`).join('');
  const catOpts = () => {
    const list = CATS.map((c, i) => [i, c]).filter(([i]) => st.area < 0 || (C.cat_area[i] || []).includes(st.area)).sort((a, b) => a[1].localeCompare(b[1]));
    return `<option value="-1">كل التخصصات${st.area >= 0 ? ' في المجال' : ''}</option>` + list.map(([i, c]) => `<option value="${i}"${i === st.cat ? ' selected' : ''}>${esc(c)}</option>`).join('');
  };

  app.innerHTML = `
  <section class="rs-section rs-card rs-jf no-print">
    <div class="rs-jf-grid">
      <div class="rs-jf-f"><span class="rs-jf-l"><i class="bi bi-calendar3"></i> الفترة</span>
        <div class="rs-jf-yrs"><select id="j-from" class="form-select" aria-label="من سنة">${yearOpts(st.from)}</select><span>إلى</span><select id="j-to" class="form-select" aria-label="إلى سنة">${yearOpts(st.to)}</select></div>
        <div class="rs-seg rs-jf-span" id="j-span" aria-label="فترة سريعة"><button data-s="5">آخر 5 سنوات</button><button data-s="10">آخر 10 سنوات</button><button data-s="all">كل السنوات</button></div></div>
      <div class="rs-jf-f"><label class="rs-jf-l" for="j-area"><i class="bi bi-diagram-3"></i> المجال المعرفي</label><select id="j-area" class="form-select">${areaOpts()}</select></div>
      <div class="rs-jf-f"><label class="rs-jf-l" for="j-cat"><i class="bi bi-tags"></i> التخصص الدقيق <small>فئات SCImago</small></label><select id="j-cat" class="form-select ltr">${catOpts()}</select></div>
      <div class="rs-jf-f"><span class="rs-jf-l"><i class="bi bi-intersect"></i> طريقة العدّ</span>
        <div class="rs-seg rs-jf-span" id="j-count"><button data-c="full">مع التكرار</button><button data-c="frac">بدون تكرار</button></div>
        <small class="rs-jf-hint" id="j-count-hint"></small></div>
    </div>
    <div class="rs-jf-unis"><div class="rs-jf-l"><i class="bi bi-bank2"></i> الجامعات المختارة للمقارنة <small>اضغط لإضافة جامعة أو إزالتها · حتى 8 · لكل جامعة اللون نفسه في كل الرسوم</small></div>
    <div class="rs-chips" id="j-unis"></div></div>
  </section>
  <div class="rs-print-only rs-jf-sum" id="j-sum"></div>

  <nav class="rs-tabs no-print" id="j-tabs">
    <button data-t="compare"><i class="bi bi-sliders2"></i> المقارنة الشاملة</button><button data-t="overview"><i class="bi bi-speedometer2"></i> نظرة عامة</button>
    <button data-t="charts"><i class="bi bi-bar-chart-line"></i> الرسوم البيانية</button><button data-t="fields"><i class="bi bi-diagram-3"></i> المجالات والتخصصات</button>
    <button data-t="journals"><i class="bi bi-journal-bookmark"></i> المجلات</button><button data-t="collab"><i class="bi bi-people"></i> التعاون</button>
    <button data-t="quality"><i class="bi bi-shield-check"></i> جودة النشر</button><button data-t="gaps"><i class="bi bi-lightbulb"></i> فرص البترا</button>
    <button data-t="all"><i class="bi bi-layout-text-window-reverse"></i> عرض الكل</button></nav>

  <section data-tab="compare" class="rs-section rs-card rs-cmp">
    <div class="rs-cmp-bar">
      <div class="rs-jf-f"><label class="rs-jf-l" for="j-crit"><i class="bi bi-rulers"></i> قارن حسب</label>
        <select id="j-crit" class="form-select">${Object.entries(M).map(([k, v]) => `<option value="${k}"${k === st.crit ? ' selected' : ''}>${v[0]}</option>`).join('')}</select></div>
      <div class="rs-jf-f"><span class="rs-jf-l"><i class="bi bi-bank2"></i> الجامعات</span>
        <div class="rs-seg rs-jf-span" id="j-scope-seg"><button data-sc="all">كل الجامعات (${U.length})</button><button data-sc="sel">المختارة فقط (<span id="j-nsel"></span>)</button></div></div>
      <div class="rs-cmp-sum" id="j-cmp-sum"></div>
    </div>
    <div class="rs-grid two mt-3">
      <div><h4 class="rs-sub" id="j-crank-t"></h4><div class="rs-chart" id="j-crank-wrap"><canvas id="j-crank"></canvas></div></div>
      <div><h4 class="rs-sub" id="j-ctrend-t"></h4><div class="rs-chart tall"><canvas id="j-ctrend"></canvas></div><p class="rs-note mt-2 mb-0" id="j-ctrend-n"></p></div>
    </div>
  </section>
  <section data-tab="compare" class="rs-section rs-card"><h3><i class="bi bi-table"></i>كل المعايير <small class="fw-normal text-muted" id="j-ctab-sc"></small>
    <button class="btn btn-sm btn-rs-o ms-auto" id="j-csv"><i class="bi bi-download"></i> CSV</button></h3>
    <div class="rs-scroll" style="max-height:680px"><table class="rs-table rs-ctable" id="j-ctable"></table></div>
    <p class="rs-note mt-2 mb-0" id="j-dupnote"></p></section>

  <section data-tab="overview" class="rs-section"><div class="rs-scorecards" id="j-cards"></div></section>
  <section data-tab="overview" class="rs-section rs-grid two">
    <div class="rs-card"><h3><i class="bi bi-bullseye"></i>الملف البحثي <small class="fw-normal text-muted">كل مؤشر نسبةً لأعلى جامعة أردنية (100)</small></h3><div class="rs-chart tall"><canvas id="j-radar"></canvas></div></div>
    <div class="rs-card"><h3><i class="bi bi-circle-half"></i>الحجم مقابل الأثر <small class="fw-normal text-muted">كل الجامعات · حجم الدائرة = h-index</small></h3><div class="rs-chart tall"><canvas id="j-bubble"></canvas></div></div>
  </section>
  <section data-tab="charts" class="rs-section rs-grid two">
    <div class="rs-card"><h3><i class="bi bi-graph-up"></i>الوثائق سنوياً</h3><div class="rs-chart"><canvas id="j-years"></canvas></div></div>
    <div class="rs-card"><h3><i class="bi bi-bar-chart-steps"></i>توزيع التصنيف Q1–Q4 <small class="fw-normal text-muted">نسبة من الوثائق المصنّفة</small></h3><div class="rs-chart"><canvas id="j-q"></canvas></div></div>
    <div class="rs-card"><h3><i class="bi bi-award"></i>الأثر: اقتباس لكل وثيقة</h3><div class="rs-chart"><canvas id="j-cpd"></canvas></div></div>
    <div class="rs-card"><h3><i class="bi bi-globe2"></i>الانفتاح: تعاون دولي ووصول مفتوح</h3><div class="rs-chart"><canvas id="j-open"></canvas></div></div>
  </section>
  <section data-tab="fields" class="rs-section rs-card"><h3><i class="bi bi-grid-3x3"></i>خريطة المجالات <small class="fw-normal text-muted">نسبة وثائق كل جامعة في كل مجال · الأغمق = تركيز أعلى · اضغط مجالاً لتصفية الصفحة</small></h3>
    <div class="rs-scroll"><table class="rs-table rs-heatmap" id="j-heat"></table></div></section>
  <section data-tab="fields" class="rs-section rs-card" id="j-fields-card"><h3><i class="bi bi-diagram-3"></i><span id="j-fields-title"></span></h3>
    <div class="rs-scroll"><table class="rs-table" id="j-fields"></table></div></section>
  <section data-tab="journals" class="rs-section rs-grid wide">
    <div class="rs-card"><h3><i class="bi bi-journal-bookmark"></i>أكثر المجلات نشراً <select id="j-ju" class="form-select form-select-sm d-inline-block w-auto"></select> <small class="fw-normal text-muted">كل السنوات</small></h3>
      <div class="rs-scroll" style="max-height:440px"><table class="rs-table" id="j-journals"></table></div></div>
  </section>
  <section data-tab="collab" class="rs-section rs-grid wide">
    <div class="rs-card"><h3><i class="bi bi-people"></i>التعاون بين الجامعات المختارة <small class="fw-normal text-muted">وثائق مشتركة، كل السنوات</small></h3>
      <div class="rs-scroll"><table class="rs-table rs-heat" id="j-matrix"></table></div>
      <h4 class="rs-sub mt-3">أكثر الدول تعاوناً</h4><div id="j-countries"></div></div>
  </section>
  <section data-tab="quality" class="rs-section rs-card" id="j-disc-card"><h3><i class="bi bi-shield-exclamation"></i>النشر في مجلات حذفها Scopus <small class="fw-normal text-muted">كل السنوات · مجلات نشرت فيها الجامعة 3 أبحاث أو أكثر</small></h3>
    <div id="j-disc"><div class="rs-loading">جارٍ التحميل…</div></div></section>
  <section data-tab="gaps" class="rs-section rs-card" id="j-gaps"><h3><i class="bi bi-lightbulb"></i>${esc(HOME.ar)}: الفجوات والفرص <small class="fw-normal text-muted">للفترة المختارة</small></h3>
    <div class="rs-grid wide">
      <div><h4 class="rs-sub">حصة المجالات مقارنة بالأردن</h4><div class="rs-chart tall"><canvas id="j-gap-areas"></canvas></div>
        <p class="rs-note">الأعمدة الحمراء: مجالات حصة البترا فيها أقل من الحصة الأردنية (فرص توسّع أو توظيف).</p></div>
      <div><h4 class="rs-sub">موضوعات صاعدة في الأردن (آخر 4 سنوات) وحضور البترا</h4>
        <div class="rs-scroll" style="max-height:420px"><table class="rs-table" id="j-rising"></table></div>
        <p class="rs-note">معامل النمو = حصة الموضوع في آخر 4 سنوات ÷ حصته في السنوات الست قبلها. <a href="experts.html">ابحث عن خبير</a> في أي موضوع.</p></div>
    </div></section>

  <p class="rs-note">المصدر: تصدير Scopus لكل الجامعات الأردنية (${R.n(D.total.docs)} وثيقة فريدة) بتاريخ ${esc(D.updated)}، والاقتباسات تُحدَّث أسبوعياً${C.cites_updated ? ` (آخر تحديث ${esc(C.cites_updated)})` : ''}. التصنيف والمجالات من SCImago SJR. الوثيقة المشتركة تُحسب لكل جامعة مشاركة. للتفاصيل الكاملة: <a href="journals.html">دليل المجلات</a> · <a href="experts.html">ابحث عن خبير</a> · <a href="universities.html">مؤشرات أسبوعية</a>.</p>`;

  function chips() {
    R.$('#j-unis').innerHTML = U.slice().sort((a, b) => b.size - a.size).map(u => { const on = st.sel.includes(u.i), c = on ? color(u, st.sel.indexOf(u.i)) : ''; return `<button type="button" class="rs-uchip${on ? ' on' : ''}${u.i === HOME.i ? ' home' : ''}" data-u="${u.i}"${on ? ` style="--uc:${c}"` : ''} aria-pressed="${on}"><i class="bi ${on ? 'bi-check-circle-fill' : 'bi-plus-circle'}"></i> ${esc(u.ar)}</button>`; }).join('');
  }
  let S;
  function render() {
    R.$$('#j-span button').forEach(b => { const n = b.dataset.s; b.classList.toggle('on', st.to === Y && (n === 'all' ? st.from <= 1990 : st.from === Y - +n + 1)); });
    R.store.set('rs-jo-sel', st.sel);
    S = stats();
    const sel = st.sel.map(i => S.out[i]);
    R.$$('#j-count button').forEach(b => b.classList.toggle('on', (b.dataset.c === 'frac') === st.frac));
    R.$('#j-count-hint').textContent = st.frac ? 'كل بحث يُحسب مرة واحدة ويُقسَّم بالتساوي بين جامعاته ومجالاته' : 'كما في Scopus: البحث المشترك يُحسب كاملاً لكل جامعة ولكل مجال';
    // yearly
    const ys = []; for (let y = st.from; y <= Math.min(st.to, Y); y++) ys.push(y);
    R.chart('j-years', { type: 'line', data: { labels: ys, datasets: sel.map((o, k) => ({ label: o.u.ar, data: ys.map(y => +((o.years[y] || {}).docs || 0).toFixed(1)), borderColor: color(o.u, k), backgroundColor: color(o.u, k), borderWidth: o.u.i === HOME.i ? 3.5 : 2, tension: .3 })) }, options: { interaction: { mode: 'index', intersect: false } } });
    // quartiles
    const qc = ['#1d7a3e', '#1f6f78', '#b8892b', '#c75b12'];
    R.chart('j-q', { type: 'bar', data: { labels: sel.map(o => o.u.ar), datasets: ['q1', 'q2', 'q3', 'q4'].map((q, k) => ({ label: q.toUpperCase(), data: sel.map(o => o.qk ? +(100 * o[q] / o.qk).toFixed(1) : 0), backgroundColor: qc[k] })) },
      options: { indexAxis: 'y', scales: { x: { stacked: true, max: 100, ticks: { callback: v => v + '%' } }, y: { stacked: true } } } });
    R.chart('j-cpd', { type: 'bar', data: { labels: sel.map(o => o.u.ar), datasets: [{ label: 'اقتباس لكل وثيقة', data: sel.map(o => +o.cpd.toFixed(2)), backgroundColor: sel.map((o, k) => color(o.u, k)), borderRadius: 4 }] }, options: { plugins: { legend: { display: false } } } });
    R.chart('j-open', { type: 'bar', data: { labels: sel.map(o => o.u.ar), datasets: [{ label: 'تعاون دولي %', data: sel.map(o => +(100 * o.intls).toFixed(1)), backgroundColor: '#1f6f78', borderRadius: 3 }, { label: 'وصول مفتوح %', data: sel.map(o => +(100 * o.oas).toFixed(1)), backgroundColor: '#b8892b', borderRadius: 3 }] }, options: { scales: { y: { ticks: { callback: v => v + '%' } } } } });
    compare();
    overview(sel);
    heat();
    fields();
    journals();
    matrix();
    gaps();
    const u = new URL(location); u.searchParams.set('from', st.from); u.searchParams.set('to', st.to); st.area >= 0 ? u.searchParams.set('area', st.area) : u.searchParams.delete('area');
    st.frac ? u.searchParams.set('count', 'frac') : u.searchParams.delete('count'); u.searchParams.set('m', st.crit); history.replaceState(null, '', u);
  }
  const isShare = k => ['q1s', 'q12', 'intls', 'oas', 'confs'].includes(k);
  const val = (o, k) => o[k] == null ? null : isShare(k) ? +(100 * o[k]).toFixed(1) : k === 'cpd' ? +o[k].toFixed(2) : +(+o[k]).toFixed(1);
  function compare() {
    const k = st.crit, name = M[k][0], all = S.out.filter(o => o.docs);
    const list = (st.scope === 'sel' ? st.sel.map(i => S.out[i]) : all).filter(o => o.docs);
    R.$$('#j-scope-seg button').forEach(b => b.classList.toggle('on', b.dataset.sc === st.scope));
    R.$('#j-nsel').textContent = st.sel.length;
    const rankOf = kk => { const s2 = all.slice().sort((a, b) => (b[kk] ?? -1) - (a[kk] ?? -1)); return o => s2.indexOf(o) + 1; };
    const RK = Object.fromEntries(Object.keys(M).map(kk => [kk, rankOf(kk)]));
    // one measure, ranked; for shares and averages the Jordanian value is drawn as a reference bar
    const ranked = list.slice().sort((a, b) => (b[k] ?? -1) - (a[k] ?? -1)).filter(o => o[k] != null);
    const rows = ranked.concat(isShare(k) || k === 'cpd' ? [S.jo] : []).sort((a, b) => (b[k] ?? -1) - (a[k] ?? -1));
    R.$('#j-crank-t').textContent = `${name}: ترتيب ${st.scope === 'sel' ? 'الجامعات المختارة' : 'كل الجامعات الأردنية'}`;
    R.$('#j-crank-wrap').style.height = (rows.length * 24 + 60) + 'px';
    R.chart('j-crank', { type: 'bar', data: { labels: rows.map(o => o === S.jo ? 'متوسط الأردن' : o.u.ar), datasets: [{ label: name, data: rows.map(o => val(o, k)),
      backgroundColor: rows.map(o => o === S.jo ? '#091b22' : o.u.i === HOME.i ? '#901d23' : st.sel.includes(o.u.i) ? '#b8892b' : '#9fb3b9'), borderRadius: 3 }] },
      options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { callback: v => isShare(k) ? v + '%' : v } }, y: { ticks: { autoSkip: false, font: { size: 12 } } } },
        onClick: (e, el) => { const o = el[0] && rows[el[0].index]; if (o && o !== S.jo && !st.sel.includes(o.u.i)) { st.sel = st.sel.concat(o.u.i).slice(-8); chips(); render(); } } } });
    // the same measure year by year for the chosen universities (and Jordan for shares and averages)
    const ys = []; for (let y = Math.max(st.from, Y - 14); y <= st.to; y++) ys.push(y);
    const tl = st.sel.map(i => S.out[i]).filter(o => o.docs);
    R.$('#j-ctrend-t').textContent = `${name} سنة بسنة: الجامعات المختارة`;
    R.$('#j-ctrend-n').textContent = k === 'h' ? 'h-index لا يُحسب سنة بسنة؛ الرسم يعرض عدد الوثائق بدلاً منه.' : st.from <= Y - 15 ? 'تعرض آخر 15 سنة من الفترة.' : '';
    const kk = k === 'h' ? 'docs' : k;
    const sets = tl.map(o => ({ label: o.u.ar, data: ys.map(y => o.years[y] && o.years[y].docs ? val(o.years[y], kk) : null), borderColor: color(o.u, st.sel.indexOf(o.u.i)),
      backgroundColor: color(o.u, st.sel.indexOf(o.u.i)), borderWidth: o.u.i === HOME.i ? 3.5 : 2, tension: .3, pointRadius: 2, spanGaps: true }));
    if (isShare(kk) || kk === 'cpd') sets.push({ label: 'متوسط الأردن', data: ys.map(y => S.jo.years[y] ? val(S.jo.years[y], kk) : null), borderColor: '#091b22', borderDash: [6, 4], borderWidth: 2, pointRadius: 0, tension: .3 });
    R.chart('j-ctrend', { type: 'line', data: { labels: ys, datasets: sets }, options: { plugins: { rsLabels: false }, scales: { y: { beginAtZero: true, ticks: { callback: v => isShare(kk) ? v + '%' : v } } } } });
    // every measure: the scope, sorted by the chosen column, with each value's rank among all universities
    const cols = Object.keys(M);
    const T2 = list.slice().sort((a, b) => (b[st.sort] ?? -1) - (a[st.sort] ?? -1));
    const mx = Object.fromEntries(cols.map(c => [c, Math.max(1e-9, ...all.map(o => o[c] || 0))]));
    R.$('#j-ctab-sc').textContent = `${st.scope === 'sel' ? 'الجامعات المختارة' : 'كل الجامعات'} · ${fieldTxt()} · ${periodTxt()} · ${st.frac ? 'بدون تكرار' : 'مع التكرار'} · اضغط عنوان العمود للترتيب`;
    const sc = o => { const x = SCOPUS[o.u.afid]; return x && st.from <= 1990 && st.to >= Y && st.area < 0 && st.cat < 0 && !st.frac && x.docs && Math.abs(x.docs - o.docs) > .01 * x.docs ? `<small class="rs-official" title="العدد الرسمي في صفحة الجامعة على Scopus">Scopus: ${R.n(x.docs)}</small>` : ''; };
    R.$('#j-ctable').innerHTML = `<thead><tr><th class="num">#</th><th>الجامعة</th>${cols.map(c => `<th class="num rs-mth${st.sort === c ? ' sorted' : ''}${c === k ? ' crit' : ''}" data-sort="${c}"><i class="bi ${MI[c]}"></i><span>${M[c][0]}</span></th>`).join('')}<th class="num">تحقق</th></tr></thead><tbody>
      <tr class="jo"><td class="num"><i class="bi bi-flag-fill"></i></td><td><b>${esc(JO.ar)}</b><small class="d-block text-muted">كل بحث مرة واحدة</small></td>${cols.map(c => `<td class="num"><b>${M[c][1](S.jo[c])}</b></td>`).join('')}<td></td></tr>
      ${T2.map((o, n) => `<tr class="${o.u.i === HOME.i ? 'me' : st.scope === 'all' && st.sel.includes(o.u.i) ? 'sel' : ''}"><td class="num">${rkb(n + 1)}</td>
        <td class="rs-ucell">${udot(o.u.i)}<div><b>${esc(o.u.ar)}</b><small class="ltr">${esc(o.u.en)}</small></div></td>
        ${cols.map(c => `<td class="num rs-vcell${c === k ? ' crit' : ''}"><b>${M[c][1](o[c])}</b>${o[c] == null ? '' : gbar(100 * o[c] / mx[c], c === k ? '' : '#b9c6ca') + `<small class="rk">#${RK[c](o)}</small>`}${c === 'docs' ? sc(o) : ''}</td>`).join('')}
        <td class="num">${R.srcBadge('Scopus', R.scopusOrgUrl(o.u.afid), 'bi-bar-chart-line')}</td></tr>`).join('')}</tbody>`;
    // what counting with duplicates adds for this scope
    const dup = dupInfo(new Set(list.map(o => o.u.i)));
    const sumDocs = list.reduce((t, o) => t + o.docs, 0);
    R.$('#j-cmp-sum').innerHTML = `<div><b>${R.n(dup.uniq)}</b><small>بحثاً فريداً</small></div><div><b>${R.n(dup.full)}</b><small>مع التكرار</small></div><div><b>${R.n(dup.full - dup.uniq)}</b><small>تكرار بين الجامعات</small></div>`;
    R.$('#j-dupnote').innerHTML = (st.frac
      ? `بدون تكرار: البحث المشترك بين جامعتين يُحسب نصفاً لكل منهما${st.area >= 0 || st.cat >= 0 ? '، والبحث في أكثر من مجال يُقسَّم بين مجالاته' : ''}، فمجموع كل الجامعات يساوي عدد الأبحاث الأردنية الفريدة (${R.n(S.jo.docs)}). حصص الجامعات المعروضة: ${fmtN(sumDocs)}.`
      : `مع التكرار (كما في Scopus): ${R.n(dup.full - dup.uniq)} من أبحاث هذه الجامعات مشتركة بين أكثر من جامعة، فتُحسب لكل منها؛ لذلك مجموع العمود (${R.n(sumDocs)}) أكبر من عدد الأبحاث الفريدة (${R.n(dup.uniq)}). اختر «بدون تكرار» ليُحسب كل بحث مرة واحدة.`)
      + ` h-index لا يتأثر بطريقة العدّ.${st.from <= 1990 && st.to >= Y && st.area < 0 && st.cat < 0 && !st.frac ? ' أعداد الوثائق من تصدير Scopus الرسمي لكل جامعة؛ إن اختلف عدد صفحة الجامعة على Scopus هذا الأسبوع بأكثر من 1% يظهر تحته.' : ''}`;
  }
  // fields or specialities inside the chosen field, for the selected universities
  function fields() {
    const inCat = st.area >= 0;
    R.$('#j-fields-title').textContent = inCat ? `التخصصات الدقيقة في مجال ${R.areaAr(AREAS[st.area])}` : 'المجالات المعرفية: عدد الوثائق والحصة والأثر';
    const names = inCat ? CATS : AREAS;
    const t = breakdown(inCat ? 'cat' : 'area');
    const tot = Object.fromEntries(st.sel.map(i => [i, S.out[i].docs || 1]));
    const selSum = k => st.sel.reduce((s2, i) => s2 + ((t[k] || {})[i] || [0])[0], 0);
    const keys = Object.keys(t).map(Number).filter(k => selSum(k) > 0).sort((a, b) => selSum(b) - selSum(a)).slice(0, 30);
    const totAll = inCat ? null : Object.fromEntries(st.sel.map(i => [i, S.out[i].docs || 1]));
    const fmx = Math.max(1e-9, ...keys.flatMap(k => st.sel.map(i => ((t[k] || {})[i] || [0])[0])));
    R.$('#j-fields').innerHTML = `<thead><tr><th>${inCat ? 'التخصص' : 'المجال'}</th>${st.sel.map(uth).join('')}</tr></thead><tbody>
      ${keys.map(k => `<tr><td class="rs-name ${inCat ? 'ltr' : ''}"><a href="#" data-pick="${k}">${esc(inCat ? names[k] : R.areaAr(names[k]))}</a></td>${st.sel.map(i => { const v = (t[k] || {})[i]; return v ? `<td class="num rs-vcell"><b>${fmtN(v[0])}</b>${gbar(100 * v[0] / fmx, ucol(i))}
        <span class="rs-minis">${inCat ? '' : `<span class="rs-mini" title="حصة المجال من أبحاث الجامعة">${pct(v[0] / totAll[i])}</span>`}<span class="rs-mini c" title="اقتباس لكل وثيقة"><i class="bi bi-quote"></i>${(v[1] / v[0]).toFixed(1)}</span></span></td>` : '<td class="num text-muted">–</td>'; }).join('')}</tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="${st.sel.length + 1}"><span class="rs-mini">الحصة</span> نسبة المجال من أبحاث الجامعة · <span class="rs-mini c"><i class="bi bi-quote"></i>اقتباس/وثيقة</span> متوسط الاقتباس لكل بحث</td></tr></tfoot>`;
  }
  function journals() {
    const pick = R.$('#j-ju'), cur = +pick.value || st.sel[0];
    pick.innerHTML = st.sel.map(i => `<option value="${i}"${i === cur ? ' selected' : ''}>${esc(U[i].ar)}</option>`).join('');
    const u = +pick.value;
    const list = (D.journals || []).filter(r => r[0] === u).sort((a, b) => b[2] - a[2]).slice(0, 40);
    const jmx = Math.max(1, ...list.map(r => r[2]));
    R.$('#j-journals').innerHTML = `<thead><tr><th class="num">#</th><th>المجلة / المصدر</th><th class="num">التصنيف</th><th class="num">الوثائق</th><th class="num">اقتباس/وثيقة</th></tr></thead><tbody>
      ${list.map((r, n) => { const m = D.jmeta[r[1]] || [D.jnames[r[1]] || r[1].replace(/^n:/, ''), '', 0, 0]; const isS = !String(r[1]).startsWith('n:');
        const fl = FLAGS && isS ? FLAGS.verdict(FLAGS.F[r[1]] || null) : null;
        const cpd = r[3] / r[2];
        return `<tr><td class="num">${rkb(n + 1)}</td><td class="ltr rs-jname"><i class="bi ${isS ? 'bi-journal-bookmark' : 'bi-easel'}"></i>${isS ? `<a href="journals.html?id=${r[1]}">${esc(m[0])}</a>` : `<span>${esc(m[0])}</span>`}${m[3] ? ' <span class="rs-tag oa"><i class="bi bi-unlock"></i> OA</span>' : ''}${fl ? ` <span class="rs-tag ${fl[2]}" title="${esc(fl[1])}">${esc(fl[0])}</span>` : ''}</td>
          <td class="num">${R.qTag(m[1]) || '<span class="rs-tag">غير مصنّف</span>'}</td><td class="num rs-vcell"><b>${R.n(r[2])}</b>${gbar(100 * r[2] / jmx, '#1f6f78')}</td>
          <td class="num"><span class="rs-mini c${cpd >= 10 ? ' hi' : cpd < 3 ? ' lo' : ''}"><i class="bi bi-quote"></i>${cpd.toFixed(1)}</span></td></tr>`; }).join('')}</tbody>`;
  }
  function matrix() {
    const ids = D.matrix.ids, m = D.matrix.m, pos = Object.fromEntries(ids.map((a, i) => [a, i]));
    const sel = st.sel.map(i => U[i]);
    const mx = Math.max(1, ...sel.flatMap(a => sel.map(b => a === b ? 0 : m[pos[a.afid]][pos[b.afid]])));
    R.$('#j-matrix').innerHTML = `<thead><tr><th></th>${sel.map(u => uth(u.i)).join('')}</tr></thead><tbody>${sel.map(a => `<tr><td class="rs-ucell">${udot(a.i)}<div><b>${esc(a.ar)}</b></div></td>${sel.map(b => { if (a === b) return '<td class="num rs-hcell self"><span><i class="bi bi-dash-lg"></i></span></td>'; const v = m[pos[a.afid]][pos[b.afid]]; const x = v / mx;
      return `<td class="num rs-hcell"><span style="background:${R.alpha('#901d23', .1 + .75 * x)};color:${x > .5 ? '#fff' : '#3a1013'}" title="${R.n(v)} بحثاً مشتركاً">${R.n(v)}</span></td>`; }).join('')}</tr>`).join('')}</tbody>`;
    const ctryAr = R.ctryAr || (R.ctryAr = (() => { try { const dn = new Intl.DisplayNames(['ar'], { type: 'region' }), dnEn = new Intl.DisplayNames(['en'], { type: 'region' }), codes = { 'Russian Federation': 'RU', 'South Korea': 'KR', 'Viet Nam': 'VN', 'Turkey': 'TR', 'Iran': 'IR', 'Syrian Arab Republic': 'SY', 'Palestine': 'PS', 'Czech Republic': 'CZ', 'Taiwan': 'TW', 'Hong Kong': 'HK' }; for (let a = 65; a < 91; a++) for (let b = 65; b < 91; b++) { const cc = String.fromCharCode(a, b); try { const en = dnEn.of(cc); if (en && en !== cc && !codes[en]) codes[en] = cc; } catch (e) { /* not a region */ } } return c => { const cc = codes[c]; return cc ? [dn.of(cc), cc] : [c, '']; }; } catch (e) { return c => [c, '']; } })());
    R.$('#j-countries').innerHTML = sel.map(u => { const p = prof[u.afid]; if (!p) return ''; const L = (p.countries || []).slice(0, 8), cmx = Math.max(1, ...L.map(x => x[1]));
      return `<div class="rs-ctry"><div class="hd">${udot(u.i)}<b>${esc(u.ar)}</b></div><div class="rs-cchips">${L.map(([c, n]) => { const [ar, cc] = ctryAr(c); return `<span class="rs-cchip" style="--w:${(100 * n / cmx).toFixed(0)}%" title="${esc(c)}"><i class="bi bi-globe2"></i>${esc(ar)}<b>${R.n(n)}</b></span>`; }).join('')}</div></div>`; }).join('');
  }
  function gaps() {
    const tot = {}, home = {};
    let nTot = 0, nHome = 0;
    const bd = breakdown('area');
    for (const [k, x] of Object.entries(bd)) { tot[k] = x.jo[0]; home[k] = (x[HOME.i] || [0])[0]; }
    for (const d of DOCS) { if (!d.u.length || !inPeriod(d.y)) continue; nTot += 1; if (d.u.includes(HOME.i)) nHome += st.frac ? 1 / d.u.length : 1; }
    // shares: every field's share of the university's papers against its share of all Jordanian papers
    const rows = AREAS.map((a, i) => [R.areaAr(a), (home[i] || 0) / (nHome || 1), (tot[i] || 0) / (nTot || 1)]).map(r => [r[0], r[1] - r[2], r[1], r[2]]).sort((a, b) => a[1] - b[1]);
    R.chart('j-gap-areas', { type: 'bar', data: { labels: rows.map(r => r[0]), datasets: [{ label: 'الفرق بالنقاط المئوية', data: rows.map(r => +(100 * r[1]).toFixed(1)), backgroundColor: rows.map(r => r[1] < 0 ? '#c0392b' : '#1d7a3e'), borderRadius: 3 }] },
      options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => { const r = rows[c.dataIndex]; return `البترا ${pct(r[2])} · الأردن ${pct(r[3])}`; } } } }, scales: { y: { ticks: { autoSkip: false, font: { size: 12 } } } } } });
    R.$('#j-rising').innerHTML = `<thead><tr><th>الموضوع</th><th class="num">وثائق أردنية</th><th class="num">النمو</th><th class="num">${esc(HOME.ar)}</th><th>الأنشط</th></tr></thead><tbody>
      ${(D.rising || []).slice(0, 60).map(([k, n, g, by]) => { const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 2).filter(([i]) => U[i]);
        return `<tr><td class="ltr rs-name"><a href="experts.html?q=${encodeURIComponent(k)}" title="خبراء في هذا الموضوع">${esc(k)}</a></td><td class="num"><b>${R.n(n)}</b></td>
          <td class="num"><span class="rs-mini up"><i class="bi bi-graph-up-arrow"></i>×${g}</span></td>
          <td class="num">${by[HOME.i] ? `<span class="rs-mini home">${R.n(by[HOME.i])}</span>` : '<span class="rs-mini zero" title="لا أبحاث للبترا في هذا الموضوع بعد"><i class="bi bi-exclamation-circle"></i>0</span>'}</td>
          <td>${top.map(([i, v]) => `<span class="rs-uchip-s">${udot(+i)}${esc(U[i].ar)} <b>${v}</b></span>`).join('')}</td></tr>`; }).join('')}</tbody>`;
  }

  // ---------------------------------------------------------------- tabs
  st.tab = R.param('tab') || R.store.get('rs-jo-tab', 'compare');
  if (!R.$(`#j-tabs [data-t="${st.tab}"]`)) st.tab = 'compare';
  function showTab(t) {
    st.tab = t; R.store.set('rs-jo-tab', t);
    R.$$('#j-tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    R.$$('[data-tab]', app).forEach(el => { el.hidden = t !== 'all' && el.dataset.tab !== t; });
    const u = new URL(location); u.searchParams.set('tab', t); history.replaceState(null, '', u);
  }
  R.$('#j-tabs').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (!b) return; showTab(b.dataset.t); render(); });

  // ---------------------------------------------------------------- overview: scorecards, radar, bubble
  const RADAR = [['docs', 'الحجم'], ['cpd', 'الأثر'], ['h', 'h-index'], ['q12', 'Q1 و Q2'], ['intls', 'تعاون دولي'], ['oas', 'وصول مفتوح']];
  function overview(sel) {
    const all = S.out.filter(o => o.docs);
    const rk = k => { const s2 = all.slice().sort((a, b) => (b[k] ?? -1) - (a[k] ?? -1)); return o => s2.indexOf(o) + 1; };
    const R6 = Object.fromEntries(['docs', 'cpd', 'h', 'q12', 'intls'].map(k => [k, rk(k)]));
    const card = (o, k) => `<div class="rs-scorecard${o.u.i === HOME.i ? ' home' : ''}" style="--c:${color(o.u, k)}">
        <div class="hd"><b>${esc(o.u.ar)}</b><a href="${R.scopusOrgUrl(o.u.afid)}" target="_blank" rel="noopener" title="Scopus"><i class="bi bi-box-arrow-up-left"></i></a></div>
        <div class="big">${fmtN(o.docs)}<small>وثيقة · #${R6.docs(o)}</small></div>
        <div class="per">${periodTxt()} · ${esc(fieldTxt())}${st.frac ? ' · بدون تكرار' : ''}</div>
        <div class="rows">
          <div><span>اقتباس/وثيقة</span><b>${o.cpd.toFixed(1)}</b><i>#${R6.cpd(o)}</i></div>
          <div><span>h-index</span><b>${o.h == null ? '–' : R.n(o.h)}</b><i>${o.h == null ? '' : '#' + R6.h(o)}</i></div>
          <div><span>Q1 و Q2</span><b>${pct(o.q12)}</b><i>#${R6.q12(o)}</i></div>
          <div><span>تعاون دولي</span><b>${pct(o.intls)}</b><i>#${R6.intls(o)}</i></div>
        </div>
        <div class="bar" title="نسبة Q1/Q2/Q3/Q4">${['q1', 'q2', 'q3', 'q4'].map((q, j) => `<span style="flex:${o[q] || 0};background:${['#1d7a3e', '#1f6f78', '#b8892b', '#c75b12'][j]}"></span>`).join('')}</div></div>`;
    R.$('#j-cards').innerHTML = sel.filter(o => o.docs).sort((a, b) => b.docs - a.docs).map(o => card(o, st.sel.indexOf(o.u.i))).join('') || '<div class="rs-empty">لا وثائق للفترة والمجال المختارين</div>';
    if (R.$('#j-radar').closest('[hidden]')) return;
    const mx = Object.fromEntries(RADAR.map(([k]) => [k, Math.max(1e-9, ...all.map(o => o[k] || 0))]));
    R.chart('j-radar', { type: 'radar', data: { labels: RADAR.map(r => r[1]), datasets: sel.filter(o => o.docs).map(o => { const k = st.sel.indexOf(o.u.i); return { label: o.u.ar, data: RADAR.map(([key]) => +(100 * (o[key] || 0) / mx[key]).toFixed(1)), borderColor: color(o.u, k), backgroundColor: R.alpha(color(o.u, k), o.u.i === HOME.i ? .25 : .06), borderWidth: o.u.i === HOME.i ? 3 : 1.5, pointRadius: 2 }; }) },
      options: { scales: { r: { min: 0, max: 100, ticks: { display: false }, pointLabels: { font: { size: 12, weight: 'bold' } } } } } });
    R.chart('j-bubble', { type: 'bubble', data: { datasets: [{ label: 'الجامعات', data: all.map(o => ({ x: o.docs, y: +o.cpd.toFixed(2), r: Math.max(4, Math.sqrt(o.h || 1) * 1.8), o })),
      backgroundColor: all.map(o => o.u.i === HOME.i ? R.alpha('#901d23', .85) : st.sel.includes(o.u.i) ? R.alpha('#b8892b', .7) : R.alpha('#1f6f78', .25)), borderColor: all.map(o => o.u.i === HOME.i ? '#901d23' : st.sel.includes(o.u.i) ? '#b8892b' : '#1f6f78') }] },
      options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.raw.o.u.ar}: ${R.n(c.raw.x)} وثيقة · ${c.raw.y} اقتباس/وثيقة · h ${c.raw.o.h ?? '–'}` } } },
        scales: { x: { type: 'logarithmic', title: { display: true, text: 'عدد الوثائق (لوغاريتمي)' } }, y: { title: { display: true, text: 'اقتباس لكل وثيقة' } } },
        onClick: (e, el) => { if (!el[0]) return; const i = all[el[0].index].u.i; if (!st.sel.includes(i)) { st.sel = st.sel.concat(i).slice(-8); chips(); render(); } } } });
  }
  // ---------------------------------------------------------------- field heat map (selected universities x fields)
  function heat() {
    if (R.$('#j-heat').closest('[hidden]')) return;
    const t = {}, tot = {};
    const bd = breakdown('area');
    for (const [k, x] of Object.entries(bd)) for (const i of st.sel) if (x[i]) { t[i] = t[i] || {}; t[i][k] = x[i][0]; }
    st.sel.forEach(i => { tot[i] = S.out[i].docs || 1; });
    const areas = AREAS.map((a, k) => [k, st.sel.reduce((s2, i) => s2 + ((t[i] || {})[k] || 0) / tot[i], 0)]).sort((a, b) => b[1] - a[1]).map(x => x[0]);
    const mx = Math.max(1e-9, ...st.sel.flatMap(i => areas.map(k => ((t[i] || {})[k] || 0) / tot[i])));
    R.$('#j-heat').innerHTML = `<thead><tr><th>المجال</th>${st.sel.map(uth).join('')}</tr></thead><tbody>
      ${areas.map(k => `<tr><td class="rs-name"><a href="#" data-pick="${k}">${esc(R.areaAr(AREAS[k]))}</a></td>${st.sel.map(i => { const v = ((t[i] || {})[k] || 0) / tot[i]; const a = v / mx;
        return `<td class="num rs-hcell"><span style="background:${R.alpha(i === HOME.i ? '#901d23' : '#1f6f78', .07 + .8 * a)};color:${a > .55 ? '#fff' : '#17323a'}" title="${fmtN((t[i] || {})[k] || 0)} وثيقة">${v ? R.pct(v, 0) : '–'}</span></td>`; }).join('')}</tr>`).join('')}</tbody>`;
  }
  R.$('#j-heat').addEventListener('click', e => { const a = e.target.closest('[data-pick]'); if (!a) return; e.preventDefault(); st.area = +a.dataset.pick; st.cat = -1; R.$('#j-area').value = st.area; R.$('#j-cat').innerHTML = catOpts(); showTab('fields'); render(); });
  R.$('#j-csv').onclick = () => R.csv((st.scope === 'sel' ? st.sel.map(i => S.out[i]) : S.out).filter(o => o.docs).map(o => ({ counting: st.frac ? 'fractional (no duplicates)' : 'full (as Scopus)', university: o.u.ar, university_en: o.u.en, from: st.from, to: st.to, field: st.cat >= 0 ? CATS[st.cat] : st.area >= 0 ? AREAS[st.area] : 'all',
    documents: o.docs, citations: o.cites, citations_per_doc: o.cpd.toFixed(2), h_index: o.h ?? '', q1_share: o.q1s.toFixed(3), q1q2_share: o.q12.toFixed(3), international: o.intls.toFixed(3), open_access: o.oas.toFixed(3), conference_share: o.confs.toFixed(3), scopus: R.scopusOrgUrl(o.u.afid) })), `jordan-universities-${st.from}-${st.to}.csv`);

  let FLAGS = null;
  function disc() {
    if (!FLAGS) return;
    const tot = {}, bad = {}, top = {};
    for (const r of D.journals || []) {
      tot[r[0]] = (tot[r[0]] || 0) + r[2];
      const f = FLAGS.F[r[1]];
      if (f && f.d) { bad[r[0]] = (bad[r[0]] || 0) + r[2]; (top[r[0]] = top[r[0]] || []).push([f.t, r[2], f.dy || f.end || '']); }
    }
    const rows = U.map(u => ({ u, n: bad[u.i] || 0, s: (bad[u.i] || 0) / (U[u.i].size || 1) })).sort((a, b) => b.s - a.s);
    R.$('#j-disc').innerHTML = `<div class="rs-scroll" style="max-height:460px"><table class="rs-table rs-tbl2"><thead><tr><th>الجامعة</th><th class="num">أبحاث في مجلات محذوفة</th><th class="num">من كل أبحاثها</th><th>أكثر هذه المجلات</th></tr></thead><tbody>
      ${rows.map(x => `<tr class="${x.u.i === HOME.i ? 'me' : ''}"><td class="rs-ucell">${udot(x.u.i)}<div><b>${esc(x.u.ar)}</b></div></td><td class="num"><b>${R.n(x.n)}</b></td>
        <td class="num"><span class="rs-mini ${x.s >= .05 ? 'zero' : x.s >= .02 ? 'warn' : 'ok'}">${R.pct(x.s, 1)}</span></td>
        <td class="ltr"><div class="rs-dj">${(top[x.u.i] || []).sort((a, b) => b[1] - a[1]).slice(0, 3).map(t => `<span><i class="bi bi-journal-x"></i>${esc(t[0])}<b>${t[1]}</b>${t[2] ? `<small>حُذفت ${esc(t[2])}</small>` : ''}</span>`).join('')}</div></td></tr>`).join('')}</tbody></table></div>
      <p class="rs-note mt-2 mb-0">من قائمة Scopus الرسمية للمجلات المحذوفة (Discontinued). الأبحاث المنشورة قبل تاريخ الحذف تبقى في Scopus، لكن ارتفاع النسبة مؤشر جودة يستحق المراجعة. <a href="journals.html">تحقّق من أي مجلة قبل الإرسال</a> · <a href="integrity.html?tab=journals"><i class="bi bi-shield-exclamation"></i> كل المجلات المحذوفة والأبحاث المسحوبة لكل جامعة</a>.</p>`;
  }
  R.scopusFlags().then(F => { FLAGS = F; disc(); journals(); }).catch(() => { R.$('#j-disc').innerHTML = '<div class="rs-note">تعذّر تحميل قائمة Scopus.</div>'; });

  chips();
  showTab(st.tab);
  render();
  R.$('#j-unis').addEventListener('click', e => { const b = e.target.closest('[data-u]'); if (!b) return; const i = +b.dataset.u; st.sel = st.sel.includes(i) ? st.sel.filter(x => x !== i) : st.sel.concat(i).slice(-8); if (!st.sel.length) st.sel = [HOME.i]; chips(); render(); });
  R.$('#j-from').onchange = e => { st.from = +e.target.value; if (st.from > st.to) st.to = st.from; render(); };
  R.$('#j-to').onchange = e => { st.to = +e.target.value; if (st.to < st.from) st.from = st.to; render(); };
  // on paper, the choices made above in one line
  R.onPrint(() => {
    const txt = id => { const e = R.$('#' + id); return e && e.selectedIndex >= 0 ? e.options[e.selectedIndex].text : ''; };
    const unis = R.$$('#j-unis .on').map(b => b.textContent.trim());
    R.$('#j-sum').innerHTML = `<span><b>الفترة:</b> ${R.esc(txt('j-from'))}–${R.esc(txt('j-to'))}</span><span><b>المجال:</b> ${R.esc(txt('j-area'))}</span><span><b>التخصص:</b> <span class="ltr">${R.esc(txt('j-cat'))}</span></span><span><b>طريقة العدّ:</b> ${st.frac ? 'بدون تكرار (كل بحث مرة واحدة)' : 'مع التكرار (كما في Scopus)'}</span>${unis.length ? `<span><b>الجامعات:</b> ${unis.map(R.esc).join('، ')}</span>` : ''}`;
  });
  R.$('#j-span').onclick = e => { const b = e.target.closest('[data-s]'); if (!b) return; const s = b.dataset.s; st.to = Y; st.from = s === 'all' ? 1990 : Y - +s + 1; R.$('#j-from').value = st.from; R.$('#j-to').value = st.to; render(); };
  R.$('#j-area').onchange = e => { st.area = +e.target.value; st.cat = -1; R.$('#j-cat').innerHTML = catOpts(); render(); };
  R.$('#j-cat').onchange = e => { st.cat = +e.target.value; render(); };
  R.$('#j-crit').onchange = e => { st.crit = st.sort = e.target.value; compare(); };
  R.$('#j-scope-seg').onclick = e => { const b = e.target.closest('[data-sc]'); if (!b) return; st.scope = b.dataset.sc; R.store.set('rs-jo-scope', st.scope); compare(); };
  R.$('#j-count').onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; st.frac = b.dataset.c === 'frac'; R.store.set('rs-jo-count', st.frac ? 'frac' : 'full'); render(); };
  R.$('#j-ctable').addEventListener('click', e => { const t = e.target.closest('th[data-sort]'); if (!t) return; st.sort = st.crit = t.dataset.sort; R.$('#j-crit').value = st.crit; compare(); });
  R.$('#j-ju').onchange = journals;
  R.$('#j-fields').addEventListener('click', e => { const a = e.target.closest('[data-pick]'); if (!a) return; e.preventDefault(); const k = +a.dataset.pick;
    if (st.area < 0) { st.area = k; R.$('#j-area').value = k; R.$('#j-cat').innerHTML = catOpts(); } else { st.cat = k; R.$('#j-cat').value = k; } render(); R.$('#j-fields-card').scrollIntoView({ behavior: 'smooth' }); });
})();
