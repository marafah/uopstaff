/* jordan.html: compare Jordanian universities in Scopus by field, speciality, period, quartile, journals and collaboration */
(async function () {
  'use strict';
  const app = window.RS_JO_MOUNT || R.$('#rs-app');   // compare.html mounts this view inside its own page
  let C, D;
  try { [C, D] = await R.loadAll(['jordan/cube', 'jordan/unis']); } catch (e) { R.fail(app, e); return; }
  R.updated({ updated: C.cites_updated || C.updated });
  const U = C.unis.map(([afid, en, ar], i) => ({ i, afid, en, ar }));
  const HOME = U.find(u => u.afid === R.HOME_AFID) || U[0];
  const prof = Object.fromEntries((D.universities || []).map(u => [u.afid, u]));
  const Y = Math.min(D.year || 9999, new Date().getFullYear());   // the next year holds only articles in press
  const AREAS = C.areas, CATS = C.cats;
  const COLS = Object.fromEntries(C.cols.map((c, i) => [c, i]));
  const esc = R.esc, pct = v => R.pct(v, 0);

  // default selection: Petra and the four universities closest in size
  const sizeOf = u => C.all.filter(r => r[0] === u.i).reduce((s, r) => s + r[3], 0);
  U.forEach(u => { u.size = sizeOf(u); });
  const near = U.filter(u => u !== HOME).sort((a, b) => Math.abs(a.size - HOME.size) - Math.abs(b.size - HOME.size)).slice(0, 4).map(u => u.i);
  const st = {
    sel: (R.store.get('rs-jo-sel', null) || [HOME.i, ...near]).filter(i => U[i]),
    from: +R.param('from') || Y - 9, to: +R.param('to') || Y, area: R.param('area') === '' ? -1 : (+R.param('area') || -1),
    cat: -1, metric: 'docs', sort: 'docs'
  };

  // ---------------------------------------------------------------- aggregation for the current filters
  function rowsFor() {
    if (st.cat >= 0) return C.cat.filter(r => r[2] === st.cat);
    if (st.area >= 0) return C.area.filter(r => r[2] === st.area);
    return C.all;
  }
  function stats() {
    const out = U.map(u => ({ u, docs: 0, cites: 0, q1: 0, q2: 0, q3: 0, q4: 0, intl: 0, oa: 0, conf: 0, years: {} }));
    for (const r of rowsFor()) {
      const y = r[1];
      if (y < st.from || y > st.to) continue;
      const o = out[r[0]];
      o.docs += r[3]; o.cites += r[4]; o.q1 += r[5]; o.q2 += r[6]; o.q3 += r[7]; o.q4 += r[8]; o.intl += r[9]; o.oa += r[10]; o.conf += r[11];
      o.years[y] = (o.years[y] || [0, 0]); o.years[y][0] += r[3]; o.years[y][1] += r[4];
    }
    const span = st.from <= 1990 ? 'all' : (Y - st.from + 1 <= 5 && st.to >= Y - 1 ? '5' : (Y - st.from + 1 <= 10 && st.to >= Y - 1 ? '10' : ''));
    const hk = st.cat >= 0 ? null : st.area;
    for (const o of out) {
      const qk = o.q1 + o.q2 + o.q3 + o.q4;
      Object.assign(o, { cpd: o.docs ? o.cites / o.docs : 0, q1s: qk ? o.q1 / qk : 0, q12: qk ? (o.q1 + o.q2) / qk : 0, intls: o.docs ? o.intl / o.docs : 0,
        oas: o.docs ? o.oa / o.docs : 0, confs: o.docs ? o.conf / o.docs : 0, qk });
      const h = span && hk !== null ? (D.h || []).find(r => r[0] === o.u.i && r[1] === span && r[2] === hk) : null;
      o.h = h ? h[3] : null;
    }
    return { out, span };
  }

  const M = {
    docs: ['الوثائق', v => R.n(v)], cites: ['الاقتباسات', v => R.n(v)], cpd: ['اقتباس لكل وثيقة', v => v.toFixed(1)], h: ['h-index', v => v == null ? '–' : R.n(v)],
    q1s: ['نسبة Q1', pct], q12: ['نسبة Q1 و Q2', pct], intls: ['تعاون دولي', pct], oas: ['وصول مفتوح', pct], confs: ['أوراق مؤتمرات', pct]
  };
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
    </div>
    <div class="rs-jf-unis"><div class="rs-jf-l"><i class="bi bi-bank2"></i> الجامعات المختارة للمقارنة <small>اضغط لإضافة جامعة أو إزالتها · حتى 8 · لكل جامعة اللون نفسه في كل الرسوم</small></div>
    <div class="rs-chips" id="j-unis"></div></div>
  </section>
  <div class="rs-print-only rs-jf-sum" id="j-sum"></div>

  <nav class="rs-tabs no-print" id="j-tabs">
    <button data-t="overview"><i class="bi bi-speedometer2"></i> نظرة عامة</button><button data-t="charts"><i class="bi bi-bar-chart-line"></i> الرسوم البيانية</button>
    <button data-t="tables"><i class="bi bi-table"></i> الجداول</button><button data-t="fields"><i class="bi bi-diagram-3"></i> المجالات والتخصصات</button>
    <button data-t="journals"><i class="bi bi-journal-bookmark"></i> المجلات</button><button data-t="collab"><i class="bi bi-people"></i> التعاون</button>
    <button data-t="quality"><i class="bi bi-shield-check"></i> جودة النشر</button><button data-t="gaps"><i class="bi bi-lightbulb"></i> فرص البترا</button>
    <button data-t="all"><i class="bi bi-layout-text-window-reverse"></i> عرض الكل</button></nav>

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
  <section data-tab="charts" class="rs-section rs-card"><h3><i class="bi bi-sort-down"></i>ترتيب كل الجامعات الأردنية حسب
    <select id="j-metric" class="form-select form-select-sm d-inline-block w-auto">${Object.entries(M).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select></h3>
    <div class="rs-chart" id="j-rank-wrap" style="height:${U.length * 22 + 60}px"><canvas id="j-rank"></canvas></div></section>
  <section data-tab="tables" class="rs-section rs-card"><h3><i class="bi bi-table"></i>المقارنة <small class="fw-normal text-muted" id="j-scope"></small></h3>
    <div class="rs-scroll"><table class="rs-table" id="j-table"></table></div>
    <p class="rs-note mt-2 mb-0" id="j-hnote"></p></section>
  <section data-tab="tables" class="rs-section rs-card"><h3><i class="bi bi-list-ol"></i>كل الجامعات الأردنية <small class="fw-normal text-muted">للفترة والمجال المختارين · اضغط عنوان العمود للترتيب</small>
    <button class="btn btn-sm btn-rs-o ms-auto" id="j-csv"><i class="bi bi-download"></i> CSV</button></h3>
    <div class="rs-scroll" style="max-height:620px"><table class="rs-table" id="j-alltable"></table></div></section>
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
    const scope = [st.cat >= 0 ? CATS[st.cat] : st.area >= 0 ? R.areaAr(AREAS[st.area]) : 'كل المجالات', `${st.from}–${st.to}`].join(' · ');
    R.$('#j-scope').textContent = scope;
    R.$('#j-hnote').textContent = S.span && st.cat < 0 ? 'h-index محسوب لكل جامعة على الوثائق المطابقة للفترة والمجال.' : 'h-index يظهر للفترات: كل السنوات، آخر 5 سنوات، آخر 10 سنوات، وعلى مستوى المجال (لا التخصص الدقيق).';
    // ranks among all universities under the same filters
    const rank = k => { const s = S.out.filter(o => o.docs).sort((a, b) => (b[k] ?? -1) - (a[k] ?? -1)); return o => s.indexOf(o) + 1; };
    const rk = Object.fromEntries(Object.keys(M).map(k => [k, rank(k)]));
    const cols = ['docs', 'cites', 'cpd', 'h', 'q1s', 'q12', 'intls', 'oas', 'confs'];
    const rows = sel.slice().sort((a, b) => (b[st.sort] ?? -1) - (a[st.sort] ?? -1));
    R.$('#j-table').innerHTML = `<thead><tr><th>الجامعة</th>${cols.map(k => `<th class="num${st.sort === k ? ' sorted' : ''}" data-sort="${k}">${M[k][0]}</th>`).join('')}<th>تحقق</th></tr></thead><tbody>
      ${rows.map(o => `<tr class="${o.u.i === HOME.i ? 'me' : ''}"><td><b>${esc(o.u.ar)}</b><br><small class="text-muted ltr">${esc(o.u.en)}</small></td>
        ${cols.map(k => `<td class="num">${M[k][1](o[k])}${o.docs && o[k] != null ? `<br><small class="text-muted">#${rk[k](o)}</small>` : ''}</td>`).join('')}
        <td>${R.srcBadge('Scopus', R.scopusOrgUrl(o.u.afid), 'bi-bar-chart-line')}</td></tr>`).join('')}</tbody>`;
    // yearly
    const ys = []; for (let y = st.from; y <= Math.min(st.to, Y); y++) ys.push(y);
    R.chart('j-years', { type: 'line', data: { labels: ys, datasets: sel.map((o, k) => ({ label: o.u.ar, data: ys.map(y => (o.years[y] || [0])[0]), borderColor: color(o.u, k), backgroundColor: color(o.u, k), borderWidth: o.u.i === HOME.i ? 3.5 : 2, tension: .3 })) }, options: { interaction: { mode: 'index', intersect: false } } });
    // quartiles
    const qc = ['#1d7a3e', '#1f6f78', '#b8892b', '#c75b12'];
    R.chart('j-q', { type: 'bar', data: { labels: sel.map(o => o.u.ar), datasets: ['q1', 'q2', 'q3', 'q4'].map((q, k) => ({ label: q.toUpperCase(), data: sel.map(o => o.qk ? +(100 * o[q] / o.qk).toFixed(1) : 0), backgroundColor: qc[k] })) },
      options: { indexAxis: 'y', scales: { x: { stacked: true, max: 100, ticks: { callback: v => v + '%' } }, y: { stacked: true } } } });
    R.chart('j-cpd', { type: 'bar', data: { labels: sel.map(o => o.u.ar), datasets: [{ label: 'اقتباس لكل وثيقة', data: sel.map(o => +o.cpd.toFixed(2)), backgroundColor: sel.map((o, k) => color(o.u, k)), borderRadius: 4 }] }, options: { plugins: { legend: { display: false } } } });
    R.chart('j-open', { type: 'bar', data: { labels: sel.map(o => o.u.ar), datasets: [{ label: 'تعاون دولي %', data: sel.map(o => +(100 * o.intls).toFixed(1)), backgroundColor: '#1f6f78', borderRadius: 3 }, { label: 'وصول مفتوح %', data: sel.map(o => +(100 * o.oas).toFixed(1)), backgroundColor: '#b8892b', borderRadius: 3 }] }, options: { scales: { y: { ticks: { callback: v => v + '%' } } } } });
    rankChart();
    overview(sel);
    allTable();
    heat();
    fields();
    journals();
    matrix();
    gaps();
    const u = new URL(location); u.searchParams.set('from', st.from); u.searchParams.set('to', st.to); st.area >= 0 ? u.searchParams.set('area', st.area) : u.searchParams.delete('area'); history.replaceState(null, '', u);
  }
  function rankChart() {
    const k = st.metric, s = S.out.filter(o => o.docs && o[k] != null).sort((a, b) => b[k] - a[k]);
    R.$('#j-rank-wrap').style.height = (s.length * 22 + 60) + 'px';
    R.chart('j-rank', { type: 'bar', data: { labels: s.map(o => o.u.ar), datasets: [{ label: M[k][0], data: s.map(o => /s$|12$/.test(k) ? +(100 * o[k]).toFixed(1) : +(+o[k]).toFixed(2)), backgroundColor: s.map(o => o.u.i === HOME.i ? '#901d23' : st.sel.includes(o.u.i) ? '#b8892b' : '#c9c2b2'), borderRadius: 3 }] },
      options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { y: { ticks: { autoSkip: false, font: { size: 12 } } } }, onClick: (e, el) => { if (el[0]) window.open(R.scopusOrgUrl(s[el[0].index].u.afid), '_blank', 'noopener'); } } });
  }
  // fields or specialities inside the chosen field, for the selected universities
  function fields() {
    const inCat = st.area >= 0;
    R.$('#j-fields-title').textContent = inCat ? `التخصصات الدقيقة في مجال ${R.areaAr(AREAS[st.area])}` : 'المجالات المعرفية: عدد الوثائق والحصة والأثر';
    const src = inCat ? C.cat : C.area, names = inCat ? CATS : AREAS;
    const keep = inCat ? new Set(CATS.map((c, i) => i).filter(i => (C.cat_area[i] || []).includes(st.area))) : null;
    const t = {};
    const tot = Object.fromEntries(st.sel.map(i => [i, S.out[i].docs || 1]));
    for (const r of src) {
      if (r[1] < st.from || r[1] > st.to || !st.sel.includes(r[0]) || (keep && !keep.has(r[2]))) continue;
      const x = (t[r[2]] = t[r[2]] || {}); const v = (x[r[0]] = x[r[0]] || [0, 0]); v[0] += r[3]; v[1] += r[4];
    }
    const keys = Object.keys(t).map(Number).sort((a, b) => Object.values(t[b]).reduce((s, v) => s + v[0], 0) - Object.values(t[a]).reduce((s, v) => s + v[0], 0)).slice(0, 30);
    const totAll = inCat ? null : Object.fromEntries(st.sel.map(i => [i, S.out[i].docs || 1]));
    R.$('#j-fields').innerHTML = `<thead><tr><th>${inCat ? 'التخصص' : 'المجال'}</th>${st.sel.map(i => `<th class="num">${esc(U[i].ar)}<br><small class="fw-normal">وثائق · ${inCat ? 'اقتباس/وثيقة' : 'الحصة · اقتباس/وثيقة'}</small></th>`).join('')}</tr></thead><tbody>
      ${keys.map(k => `<tr><td class="${inCat ? 'ltr' : ''}"><a href="#" data-pick="${k}">${esc(inCat ? names[k] : R.areaAr(names[k]))}</a></td>${st.sel.map(i => { const v = (t[k] || {})[i]; return v ? `<td class="num"><b>${R.n(v[0])}</b><br><small class="text-muted">${inCat ? '' : pct(v[0] / totAll[i]) + ' · '}${(v[1] / v[0]).toFixed(1)}</small></td>` : '<td class="num text-muted">–</td>'; }).join('')}</tr>`).join('')}</tbody>`;
  }
  function journals() {
    const pick = R.$('#j-ju'), cur = +pick.value || st.sel[0];
    pick.innerHTML = st.sel.map(i => `<option value="${i}"${i === cur ? ' selected' : ''}>${esc(U[i].ar)}</option>`).join('');
    const u = +pick.value;
    const list = (D.journals || []).filter(r => r[0] === u).sort((a, b) => b[2] - a[2]).slice(0, 40);
    R.$('#j-journals').innerHTML = `<thead><tr><th>المجلة / المصدر</th><th>التصنيف</th><th class="num">الوثائق</th><th class="num">اقتباس/وثيقة</th></tr></thead><tbody>
      ${list.map(r => { const m = D.jmeta[r[1]] || [D.jnames[r[1]] || r[1].replace(/^n:/, ''), '', 0, 0]; const isS = !String(r[1]).startsWith('n:');
        const fl = FLAGS && isS ? FLAGS.verdict(FLAGS.F[r[1]] || null) : null;
        return `<tr><td class="ltr">${isS ? `<a href="journals.html?id=${r[1]}">${esc(m[0])}</a>` : esc(m[0])}${m[3] ? ' <span class="rs-tag oa">OA</span>' : ''}${fl ? ` <span class="rs-tag ${fl[2]}" title="${esc(fl[1])}">${esc(fl[0])}</span>` : ''}</td><td>${R.qTag(m[1]) || '<small class="text-muted">—</small>'}</td><td class="num">${R.n(r[2])}</td><td class="num">${(r[3] / r[2]).toFixed(1)}</td></tr>`; }).join('')}</tbody>`;
  }
  function matrix() {
    const ids = D.matrix.ids, m = D.matrix.m, pos = Object.fromEntries(ids.map((a, i) => [a, i]));
    const sel = st.sel.map(i => U[i]);
    const mx = Math.max(1, ...sel.flatMap(a => sel.map(b => a === b ? 0 : m[pos[a.afid]][pos[b.afid]])));
    R.$('#j-matrix').innerHTML = `<thead><tr><th></th>${sel.map(u => `<th class="num"><small>${esc(u.ar)}</small></th>`).join('')}</tr></thead><tbody>${sel.map(a => `<tr><th><small>${esc(a.ar)}</small></th>${sel.map(b => { if (a === b) return '<td class="num text-muted">—</td>'; const v = m[pos[a.afid]][pos[b.afid]]; return `<td class="num" style="background:${R.alpha('#901d23', .08 + .7 * v / mx)};color:${v / mx > .55 ? '#fff' : 'inherit'}">${R.n(v)}</td>`; }).join('')}</tr>`).join('')}</tbody>`;
    R.$('#j-countries').innerHTML = sel.map(u => { const p = prof[u.afid]; if (!p) return ''; return `<div class="mb-2"><b class="small">${esc(u.ar)}</b><div class="rs-chips mt-1">${(p.countries || []).slice(0, 8).map(([c, n]) => `<span class="rs-chip"><span class="ltr">${esc(c)}</span> <small class="text-muted">${R.n(n)}</small></span>`).join('')}</div></div>`; }).join('');
  }
  function gaps() {
    const tot = {}, home = {};
    let nTot = 0, nHome = 0;
    for (const r of C.area) {
      if (r[1] < st.from || r[1] > st.to) continue;
      tot[r[2]] = (tot[r[2]] || 0) + r[3];
      if (r[0] === HOME.i) home[r[2]] = (home[r[2]] || 0) + r[3];
    }
    for (const r of C.all) { if (r[1] < st.from || r[1] > st.to) continue; nTot += r[3]; if (r[0] === HOME.i) nHome += r[3]; }
    // national total counts each document once per university: share is close enough for profile comparison
    const rows = AREAS.map((a, i) => [R.areaAr(a), (home[i] || 0) / (nHome || 1), (tot[i] || 0) / (nTot || 1)]).map(r => [r[0], r[1] - r[2], r[1], r[2]]).sort((a, b) => a[1] - b[1]);
    R.chart('j-gap-areas', { type: 'bar', data: { labels: rows.map(r => r[0]), datasets: [{ label: 'الفرق بالنقاط المئوية', data: rows.map(r => +(100 * r[1]).toFixed(1)), backgroundColor: rows.map(r => r[1] < 0 ? '#c0392b' : '#1d7a3e'), borderRadius: 3 }] },
      options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => { const r = rows[c.dataIndex]; return `البترا ${pct(r[2])} · الأردن ${pct(r[3])}`; } } } }, scales: { y: { ticks: { autoSkip: false, font: { size: 12 } } } } } });
    R.$('#j-rising').innerHTML = `<thead><tr><th>الموضوع</th><th class="num">وثائق أردنية</th><th class="num">النمو</th><th class="num">البترا</th><th>الأنشط</th></tr></thead><tbody>
      ${(D.rising || []).slice(0, 60).map(([k, n, g, by]) => { const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([i]) => U[i] ? U[i].ar : '').join('، ');
        return `<tr><td class="ltr"><a href="experts.html?q=${encodeURIComponent(k)}" title="خبراء في هذا الموضوع">${esc(k)}</a></td><td class="num">${R.n(n)}</td><td class="num">×${g}</td><td class="num ${by[HOME.i] ? '' : 'text-danger fw-bold'}">${R.n(by[HOME.i] || 0)}</td><td><small>${esc(top)}</small></td></tr>`; }).join('')}</tbody>`;
  }

  // ---------------------------------------------------------------- tabs
  st.tab = R.param('tab') || R.store.get('rs-jo-tab', 'overview');
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
        <div class="big">${R.n(o.docs)}<small>وثيقة · #${R6.docs(o)}</small></div>
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
  // ---------------------------------------------------------------- all universities table
  let allSort = 'docs';
  function allTable() {
    const cols = ['docs', 'cites', 'cpd', 'h', 'q1s', 'q12', 'intls', 'oas', 'confs'];
    const L = S.out.filter(o => o.docs).sort((a, b) => (b[allSort] ?? -1) - (a[allSort] ?? -1));
    const mx = Object.fromEntries(cols.map(k => [k, Math.max(1e-9, ...L.map(o => o[k] || 0))]));
    R.$('#j-alltable').innerHTML = `<thead><tr><th class="num">#</th><th>الجامعة</th>${cols.map(k => `<th class="num${allSort === k ? ' sorted' : ''}" data-asort="${k}">${M[k][0]}</th>`).join('')}</tr></thead><tbody>
      ${L.map((o, i) => `<tr class="${o.u.i === HOME.i ? 'me' : st.sel.includes(o.u.i) ? 'sel' : ''}"><td class="num">${i + 1}</td><td><b>${esc(o.u.ar)}</b></td>${cols.map(k => `<td class="num rs-barcell" style="--w:${o[k] == null ? 0 : (100 * o[k] / mx[k]).toFixed(0)}%">${M[k][1](o[k])}</td>`).join('')}</tr>`).join('')}</tbody>`;
  }
  // ---------------------------------------------------------------- field heat map (selected universities x fields)
  function heat() {
    if (R.$('#j-heat').closest('[hidden]')) return;
    const t = {}, tot = {};
    for (const r of C.area) { if (r[1] < st.from || r[1] > st.to || !st.sel.includes(r[0])) continue; t[r[0]] = t[r[0]] || {}; t[r[0]][r[2]] = (t[r[0]][r[2]] || 0) + r[3]; }
    st.sel.forEach(i => { tot[i] = S.out[i].docs || 1; });
    const areas = AREAS.map((a, k) => [k, st.sel.reduce((s2, i) => s2 + ((t[i] || {})[k] || 0) / tot[i], 0)]).sort((a, b) => b[1] - a[1]).map(x => x[0]);
    const mx = Math.max(1e-9, ...st.sel.flatMap(i => areas.map(k => ((t[i] || {})[k] || 0) / tot[i])));
    R.$('#j-heat').innerHTML = `<thead><tr><th>المجال</th>${st.sel.map(i => `<th class="num"><small>${esc(U[i].ar)}</small></th>`).join('')}</tr></thead><tbody>
      ${areas.map(k => `<tr><td><a href="#" data-pick="${k}">${esc(R.areaAr(AREAS[k]))}</a></td>${st.sel.map(i => { const v = ((t[i] || {})[k] || 0) / tot[i]; const a = v / mx;
        return `<td class="num" style="background:${R.alpha(i === HOME.i ? '#901d23' : '#1f6f78', .06 + .8 * a)};color:${a > .55 ? '#fff' : 'inherit'}" title="${R.n((t[i] || {})[k] || 0)} وثيقة">${v ? R.pct(v, 0) : '–'}</td>`; }).join('')}</tr>`).join('')}</tbody>`;
  }
  R.$('#j-alltable').addEventListener('click', e => { const th = e.target.closest('th[data-asort]'); if (th) { allSort = th.dataset.asort; allTable(); } });
  R.$('#j-heat').addEventListener('click', e => { const a = e.target.closest('[data-pick]'); if (!a) return; e.preventDefault(); st.area = +a.dataset.pick; st.cat = -1; R.$('#j-area').value = st.area; R.$('#j-cat').innerHTML = catOpts(); showTab('fields'); render(); });
  R.$('#j-csv').onclick = () => R.csv(S.out.filter(o => o.docs).map(o => ({ university: o.u.ar, university_en: o.u.en, from: st.from, to: st.to, field: st.cat >= 0 ? CATS[st.cat] : st.area >= 0 ? AREAS[st.area] : 'all',
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
    R.$('#j-disc').innerHTML = `<div class="rs-scroll" style="max-height:460px"><table class="rs-table"><thead><tr><th>الجامعة</th><th class="num">أبحاث في مجلات محذوفة</th><th class="num">من كل أبحاثها</th><th>أكثر هذه المجلات</th></tr></thead><tbody>
      ${rows.map(x => `<tr class="${x.u.i === HOME.i ? 'me' : ''}"><td><b>${esc(x.u.ar)}</b></td><td class="num">${R.n(x.n)}</td><td class="num">${R.pct(x.s, 1)}</td><td class="ltr"><small>${(top[x.u.i] || []).sort((a, b) => b[1] - a[1]).slice(0, 3).map(t => `${esc(t[0])} (${t[1]}${t[2] ? ', ' + t[2] : ''})`).join('<br>')}</small></td></tr>`).join('')}</tbody></table></div>
      <p class="rs-note mt-2 mb-0">من قائمة Scopus الرسمية للمجلات المحذوفة (Discontinued). الأبحاث المنشورة قبل تاريخ الحذف تبقى في Scopus، لكن ارتفاع النسبة مؤشر جودة يستحق المراجعة. <a href="journals.html">تحقّق من أي مجلة قبل الإرسال</a>.</p>`;
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
    R.$('#j-sum').innerHTML = `<span><b>الفترة:</b> ${R.esc(txt('j-from'))}–${R.esc(txt('j-to'))}</span><span><b>المجال:</b> ${R.esc(txt('j-area'))}</span><span><b>التخصص:</b> <span class="ltr">${R.esc(txt('j-cat'))}</span></span>${unis.length ? `<span><b>الجامعات:</b> ${unis.map(R.esc).join('، ')}</span>` : ''}`;
  });
  R.$('#j-span').onclick = e => { const b = e.target.closest('[data-s]'); if (!b) return; const s = b.dataset.s; st.to = Y; st.from = s === 'all' ? 1990 : Y - +s + 1; R.$('#j-from').value = st.from; R.$('#j-to').value = st.to; render(); };
  R.$('#j-area').onchange = e => { st.area = +e.target.value; st.cat = -1; R.$('#j-cat').innerHTML = catOpts(); render(); };
  R.$('#j-cat').onchange = e => { st.cat = +e.target.value; render(); };
  R.$('#j-metric').onchange = e => { st.metric = e.target.value; rankChart(); };
  R.$('#j-ju').onchange = journals;
  R.$('#j-table').addEventListener('click', e => { const t = e.target.closest('th[data-sort]'); if (t) { st.sort = t.dataset.sort; render(); } });
  R.$('#j-fields').addEventListener('click', e => { const a = e.target.closest('[data-pick]'); if (!a) return; e.preventDefault(); const k = +a.dataset.pick;
    if (st.area < 0) { st.area = k; R.$('#j-area').value = k; R.$('#j-cat').innerHTML = catOpts(); } else { st.cat = k; R.$('#j-cat').value = k; } render(); R.$('#j-scope').scrollIntoView({ behavior: 'smooth' }); });
})();
