/* projects.html: research projects funded by the University of Petra (Deanship of Scientific Research, srgs.uop.edu.jo),
   by call year, faculty, department and principal investigator, linked to the researchers' profiles on this site.
   The filters drive every figure and the list; the list reads as cards, a table or a compact list. */
(async function () {
  'use strict';
  const app = R.$('#rs-app');
  let P, data;
  try { [P, data] = await R.loadAll(['projects', 'researchers']); } catch (e) { R.fail(app, e); return; }
  const { list } = R.indexResearchers(data);
  R.updated({ updated: P.updated });
  const esc = R.esc;
  const all = (P.projects || []).map(p => Object.assign({}, p, { title: p.t || p.te, sub: p.t && p.te ? p.te : '' }));
  if (!all.length) { app.innerHTML = '<div class="rs-empty"><i class="bi bi-hourglass"></i>تُجهَّز قائمة المشاريع في التحديث القادم.</div>'; return; }

  // the principal investigator's profile here (research.js)
  R.linkProjects(all, list);
  const key = R.piKey, bare = n => R.piKey(n).split(' ');

  const years = [...new Set(all.map(p => p.year).filter(Boolean))].sort((a, b) => b - a), yAsc = years.slice().reverse();
  const facs = [...new Set(all.map(p => p.fac).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));
  const st = { q: R.param('q'), year: +R.param('year') || 0, fac: R.param('fac'), done: R.param('status'), sort: 'new', view: R.param('view') || R.store.get('rs-pj-view', 'cards') };
  const count = (L, f) => L.filter(f).length;
  const C_DONE = '#1d7a3e', C_RUN = '#b8892b';

  app.innerHTML = `
  <section class="rs-section rs-kpis" id="pj-kpis"></section>

  <section class="rs-section rs-card rs-jf no-print">
    <div class="rs-pj-filters">
      <div class="rs-jf-f"><label class="rs-jf-l" for="pj-q"><i class="bi bi-search"></i> بحث</label><input id="pj-q" class="form-control" type="search" placeholder="عنوان المشروع أو اسم الباحث أو القسم…" value="${esc(st.q)}"></div>
      <div class="rs-jf-f"><label class="rs-jf-l" for="pj-fac"><i class="bi bi-building"></i> الكلية</label><select id="pj-fac" class="form-select"><option value="">كل الكليات</option>${facs.map(f => `<option${f === st.fac ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select></div>
      <div class="rs-jf-f"><span class="rs-jf-l"><i class="bi bi-flag"></i> الحالة</span><div class="rs-seg rs-jf-span" id="pj-done"><button data-d="">الكل</button><button data-d="1">مكتمل</button><button data-d="0">مستمر</button></div></div>
      <div class="rs-jf-f"><label class="rs-jf-l" for="pj-sort"><i class="bi bi-sort-down"></i> الترتيب</label><select id="pj-sort" class="form-select"><option value="new">الأحدث أولاً</option><option value="fac">حسب الكلية</option><option value="pi">حسب الباحث</option><option value="title">حسب العنوان</option></select></div>
    </div>
    <div class="rs-jf-unis"><div class="rs-jf-l"><i class="bi bi-calendar3"></i> دعوة التقديم <button type="button" class="rs-pj-reset ms-auto" id="pj-reset"><i class="bi bi-arrow-counterclockwise"></i> إعادة الضبط</button></div><div class="rs-chips" id="pj-years-f"></div></div>
  </section>
  <div class="rs-print-only rs-jf-sum" id="pj-sum"></div>

  <section class="rs-section rs-pj-figs">
    <div class="rs-card f-a"><h3><i class="bi bi-bar-chart-line"></i>المشاريع حسب سنة الدعوة <small class="fw-normal text-muted">مكتمل ومستمر · اضغط سنة للتصفية</small></h3><div class="rs-chart pj-h"><canvas id="pj-years"></canvas></div></div>
    <div class="rs-card f-b"><h3><i class="bi bi-bar-chart-steps"></i>الكليات عبر الدعوات <small class="fw-normal text-muted">أعمدة مكدّسة</small></h3><div class="rs-chart pj-h"><canvas id="pj-stack"></canvas></div></div>
    <div class="rs-card f-c"><h3><i class="bi bi-graph-up-arrow"></i>النمو التراكمي <small class="fw-normal text-muted">مجموع المشاريع حتى كل دعوة</small></h3><div class="rs-chart pj-h"><canvas id="pj-cum"></canvas></div></div>
    <div class="rs-card f-d"><h3><i class="bi bi-pie-chart"></i>حصة الكليات <small class="fw-normal text-muted">اضغط كلية للتصفية</small></h3><div class="rs-chart pj-h"><canvas id="pj-share"></canvas></div></div>
    <div class="rs-card f-e"><h3><i class="bi bi-diagram-3"></i>الأقسام الأكثر مشاريع</h3><div class="rs-chart pj-h" id="pj-dept-wrap"><canvas id="pj-dept"></canvas></div></div>
    <div class="rs-card f-f"><h3><i class="bi bi-trophy"></i>الباحثون الأكثر مشاريع</h3><ol class="rs-venues pj-top" id="pj-top"></ol></div>
    <div class="rs-card f-g"><h3><i class="bi bi-grid-3x3"></i>الكلية × الدعوة <small class="fw-normal text-muted">عدد المشاريع · الأغمق = أكثر</small></h3><div class="rs-scroll"><table class="rs-table rs-heatmap" id="pj-heat"></table></div></div>
  </section>

  <section class="rs-section">
    <div class="rs-pj-bar"><b id="pj-count"></b>
      <div class="rs-seg no-print ms-auto" id="pj-view"><button data-v="cards"><i class="bi bi-grid-3x2-gap"></i> بطاقات</button><button data-v="table"><i class="bi bi-table"></i> جدول</button><button data-v="list"><i class="bi bi-list-ul"></i> قائمة مختصرة</button></div>
      <span class="d-flex gap-2 no-print"><button class="btn btn-sm btn-rs-o" id="pj-csv"><i class="bi bi-download"></i> CSV</button><button class="btn btn-sm btn-rs-o" type="button" onclick="print()"><i class="bi bi-printer"></i> طباعة</button></span></div>
    <div id="pj-list"></div>
  </section>

  <p class="rs-note">المصدر: <a href="${esc(P.source)}" target="_blank" rel="noopener">قائمة المشاريع البحثية المدعومة — عمادة البحث العلمي، جامعة البترا</a>.
    تُعرض المشاريع المقبولة من الجامعة (ودعوتا 2021 و2022: المقبولة من عمادة البحث العلمي بقرار)، والحالة «مكتمل/مستمر» كما تنشرها العمادة. تُحدَّث القائمة مع كل تحديث للبيانات.</p>`;

  function mostCommon(a) { const c = {}; a.forEach(x => { c[x] = (c[x] || 0) + 1; }); const e = Object.entries(c).sort((x, y) => y[1] - x[1])[0]; return e ? e[0] : '–'; }
  function filtered(ignoreYear) {
    const t = R.norm(st.q).split(' ').filter(Boolean);
    const L = all.filter(p => (ignoreYear || !st.year || p.year === st.year) && (!st.fac || p.fac === st.fac) && (!st.done || String(+p.done) === st.done)
      && (!t.length || t.every(x => R.norm([p.t, p.te, p.pi, p.pie, p.fac, p.dept, p.depte].join(' ')).includes(x))));
    const by = { new: (a, b) => (b.year - a.year) || (+b.id - +a.id), fac: (a, b) => a.fac.localeCompare(b.fac, 'ar') || (b.year - a.year), pi: (a, b) => bare(a.pi).join(' ').localeCompare(bare(b.pi).join(' '), 'ar'), title: (a, b) => a.title.localeCompare(b.title, 'ar') };
    return L.sort(by[st.sort] || by.new);
  }

  // ---------------------------------------------------------------- figures (they follow the filters)
  function kpis(L) {
    const ys = [...new Set(L.map(p => p.year))].sort((a, b) => a - b), d = count(L, p => p.done);
    const k = [
      ['bi-briefcase-fill', R.n(L.length), 'مشروعاً مدعوماً', ys.length ? `في ${ys.length} ${ys.length > 2 ? 'دعوات' : 'دعوة'} (${ys[0]}${ys.length > 1 ? '–' + ys[ys.length - 1] : ''})` : '', ''],
      ['bi-person-workspace', R.n(new Set(L.map(p => key(p.pi) || p.pi)).size), 'باحثاً رئيسياً', `${count(L, p => p.r)} مشروعاً مرتبطاً بملف باحث هنا`, 'teal'],
      ['bi-building', R.n(new Set(L.map(p => p.fac)).size), 'كليات', `أكثرها: ${esc(mostCommon(L.map(p => p.fac)))}`, 'navy'],
      ['bi-check2-circle', R.n(d), 'مكتملة', `${R.n(L.length - d)} مستمرة · ${L.length ? Math.round(100 * d / L.length) : 0}% إنجاز`, 'gold'],
      ['bi-calendar-event', R.n(count(L, p => p.year === years[0])), `في دعوة ${years[0]}`, 'أحدث دعوة', 'scopus'],
    ];
    R.$('#pj-kpis').innerHTML = k.map(x => `<div class="rs-kpi ${x[4]}"><div class="v">${x[1]}</div><div class="l"><i class="bi ${x[0]}"></i>${x[2]}</div><div class="d">${x[3]}</div></div>`).join('');
  }
  function figures(L, LY) {
    // years: status (all years of the other filters, the chosen year highlighted)
    R.chart('pj-years', { type: 'bar', data: { labels: yAsc, datasets: [
      { label: 'مكتمل', data: yAsc.map(y => count(LY, p => p.year === y && p.done)), backgroundColor: yAsc.map(y => !st.year || st.year === y ? C_DONE : R.alpha(C_DONE, .3)), borderRadius: 3 },
      { label: 'مستمر', data: yAsc.map(y => count(LY, p => p.year === y && !p.done)), backgroundColor: yAsc.map(y => !st.year || st.year === y ? C_RUN : R.alpha(C_RUN, .3)), borderRadius: 3 }] },
      options: { maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } },
        onClick: (e, el) => { if (el[0]) { const y = yAsc[el[0].index]; st.year = st.year === y ? 0 : y; render(); } } } });
    // faculties stacked by call
    const fl = facs.filter(f => LY.some(p => p.fac === f)).sort((a, b) => count(LY, p => p.fac === b) - count(LY, p => p.fac === a));
    R.chart('pj-stack', { type: 'bar', data: { labels: yAsc, datasets: fl.map(f => ({ label: f, data: yAsc.map(y => count(LY, p => p.year === y && p.fac === f)), backgroundColor: R.facColor(f), borderRadius: 2 })) },
      options: { maintainAspectRatio: false, plugins: { rsLabels: false, legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } } });
    // cumulative growth: all, completed, and the three largest faculties
    const cum = f => { let s = 0; return yAsc.map(y => (s += count(LY, p => p.year === y && f(p)))); };
    const big = fl.slice(0, 3);
    R.chart('pj-cum', { type: 'line', data: { labels: yAsc, datasets: [
      { label: 'كل المشاريع', data: cum(() => true), borderColor: '#091b22', backgroundColor: R.alpha('#091b22', .08), fill: true, borderWidth: 3, tension: .3, pointRadius: 3 },
      { label: 'مكتمل', data: cum(p => p.done), borderColor: C_DONE, borderDash: [6, 4], borderWidth: 2, tension: .3, pointRadius: 0 },
      ...big.map(f => ({ label: f, data: cum(p => p.fac === f), borderColor: R.facColor(f), borderWidth: 2, tension: .3, pointRadius: 2 }))] },
      options: { maintainAspectRatio: false, plugins: { rsLabels: false, legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
    // faculty share
    const fs = facs.map(f => [f, count(L, p => p.fac === f)]).filter(x => x[1]).sort((a, b) => b[1] - a[1]);
    R.chart('pj-share', { type: 'doughnut', data: { labels: fs.map(x => x[0]), datasets: [{ data: fs.map(x => x[1]), backgroundColor: fs.map(x => R.facColor(x[0])), borderWidth: 2, borderColor: '#fff' }] },
      options: { maintainAspectRatio: false, cutout: '58%', plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 11 } } } },
        onClick: (e, el) => { if (el[0]) { const f = fs[el[0].index][0]; st.fac = st.fac === f ? '' : f; R.$('#pj-fac').value = st.fac; render(); } } } });
    // departments
    const dc = {}; L.forEach(p => { if (p.dept) { const k = p.dept + '|' + p.fac; dc[k] = (dc[k] || 0) + 1; } });
    const ds = Object.entries(dc).sort((a, b) => b[1] - a[1]).slice(0, 10);
    R.chart('pj-dept', { type: 'bar', data: { labels: ds.map(x => x[0].split('|')[0]), datasets: [{ label: 'مشاريع', data: ds.map(x => x[1]), backgroundColor: ds.map(x => R.facColor(x[0].split('|')[1])), borderRadius: 3 }] },
      options: { maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { ticks: { autoSkip: false, font: { size: 11 } } } } } });
    // leading investigators
    const lead = {};
    L.forEach(p => { const k = key(p.pi) || p.pi; const x = (lead[k] = lead[k] || { p, n: 0, d: 0 }); x.n++; x.d += p.done ? 1 : 0; });
    const top = Object.values(lead).sort((a, b) => b.n - a.n).slice(0, 7), tmx = top[0] ? top[0].n : 1;
    R.$('#pj-top').innerHTML = top.map((x, i) => `<li><span class="rk">${i + 1}</span><div class="nm"><div class="t">${x.p.r ? `<a href="${R.profileUrl(x.p.r)}">${esc(x.p.r.name)}</a>` : `<span>${esc(x.p.pi)}</span>`}</div>
      <div class="rs-barwrap"><div class="rs-bar" style="width:${(100 * x.n / tmx).toFixed(0)}%"></div></div></div><b class="ct">${x.n}<small>مشروع</small></b></li>`).join('') || '<li class="text-muted">لا مشاريع</li>';
    // faculty x call heat table
    const hm = Math.max(1, ...facs.flatMap(f => yAsc.map(y => count(LY, p => p.fac === f && p.year === y))));
    R.$('#pj-heat').innerHTML = `<thead><tr><th>الكلية</th>${yAsc.map(y => `<th class="num">${y}</th>`).join('')}<th class="num">المجموع</th></tr></thead><tbody>
      ${fl.map(f => `<tr><td class="rs-ucell"><i class="rs-udot" style="--uc:${R.facColor(f)}"></i><div><b>${esc(f)}</b></div></td>${yAsc.map(y => { const v = count(LY, p => p.fac === f && p.year === y), a = v / hm;
        return `<td class="num rs-hcell"><span style="background:${v ? R.alpha('#1f6f78', .1 + .75 * a) : '#f6f4ef'};color:${a > .55 ? '#fff' : '#17323a'}">${v || '–'}</span></td>`; }).join('')}<td class="num"><b>${count(LY, p => p.fac === f)}</b></td></tr>`).join('')}</tbody>
      <tfoot><tr><td><b>المجموع</b></td>${yAsc.map(y => `<td class="num"><b>${count(LY, p => p.year === y)}</b></td>`).join('')}<td class="num"><b>${LY.length}</b></td></tr></tfoot>`;
  }

  // ---------------------------------------------------------------- the list: cards, table or compact list
  const statusTag = p => `<span class="rs-tag ${p.done ? 'ok' : 'run'}"><i class="bi ${p.done ? 'bi-check2-circle' : 'bi-hourglass-split'}"></i> ${p.done ? 'مكتمل' : 'مستمر'}</span>`;
  const piCell = p => p.r ? `<a class="rs-pj-pi" href="${R.profileUrl(p.r)}">${R.avatar(p.r, 'sm')}<span>${esc(p.r.name)}</span></a>` : `<span class="rs-pj-pi"><span class="rs-avatar sm"><i class="bi bi-person"></i></span><span>${esc(p.pi)}</span></span>`;
  function views(L) {
    if (!L.length) return '<div class="rs-empty"><i class="bi bi-search"></i>لا مشاريع تطابق البحث.</div>';
    if (st.view === 'table') {
      return `<div class="rs-card p-0"><div class="rs-scroll" style="max-height:none"><table class="rs-table rs-pj-table"><thead><tr><th class="num">الدعوة</th><th>المشروع</th><th>الباحث الرئيسي</th><th>الكلية / القسم</th><th class="num">الحالة</th></tr></thead><tbody>
        ${L.map(p => `<tr><td class="num"><span class="rs-tag y">${p.year}</span></td><td class="t"><b dir="auto">${esc(p.title)}</b>${p.sub ? `<small dir="ltr">${esc(p.sub)}</small>` : ''}</td><td>${piCell(p)}</td>
          <td><span class="rs-pj-fac"><i class="rs-udot" style="--uc:${R.facColor(p.fac)}"></i>${esc(p.fac)}</span><small class="d-block text-muted">${esc(p.dept)}</small></td><td class="num">${statusTag(p)}</td></tr>`).join('')}</tbody></table></div></div>`;
    }
    if (st.view === 'list') {
      return `<ol class="rs-pj-list">${L.map(p => `<li style="--fc:${R.facColor(p.fac)}"><span class="rs-tag y">${p.year}</span><span class="t" dir="auto">${esc(p.title)}</span>
        <span class="m">${p.r ? `<a href="${R.profileUrl(p.r)}">${esc(p.r.name)}</a>` : esc(p.pi)} · ${esc(p.fac)}</span>${statusTag(p)}</li>`).join('')}</ol>`;
    }
    const groups = st.sort === 'new' ? years.filter(y => L.some(p => p.year === y)).map(y => [y, L.filter(p => p.year === y)]) : [[null, L]];
    return groups.map(([y, g]) => `${y ? `<h3 class="rs-pj-year"><span>دعوة ${y}</span><small>${g.length} مشروعاً · ${count(g, p => p.done)} مكتمل</small></h3>` : ''}<div class="rs-prj-grid">${g.map(p => R.projectCard(p)).join('')}</div>`).join('');
  }

  function render() {
    R.$$('#pj-done button').forEach(b => b.classList.toggle('on', b.dataset.d === (st.done || '')));
    R.$$('#pj-view button').forEach(b => b.classList.toggle('on', b.dataset.v === st.view));
    const LY = filtered(true), L = filtered();
    R.$('#pj-years-f').innerHTML = [0, ...years].map(y => `<button type="button" class="rs-chip${st.year === y ? ' on' : ''}" data-y="${y}">${y ? 'دعوة ' + y : 'كل الدعوات'} <small>${y ? count(LY, p => p.year === y) : LY.length}</small></button>`).join('');
    kpis(L);
    figures(L, LY);
    R.$('#pj-count').innerHTML = `<i class="bi bi-briefcase"></i> ${R.n(L.length)} مشروعاً${L.length !== all.length ? ` من ${R.n(all.length)}` : ''}`;
    R.$('#pj-list').innerHTML = views(L);
    const u = new URL(location); [['q', st.q], ['year', st.year || ''], ['fac', st.fac], ['status', st.done || ''], ['view', st.view === 'cards' ? '' : st.view]].forEach(([k, v]) => v ? u.searchParams.set(k, v) : u.searchParams.delete(k)); history.replaceState(null, '', u);
  }
  render();
  R.$('#pj-q').addEventListener('input', R.debounce(e => { st.q = e.target.value; render(); }, 200));
  R.$('#pj-fac').onchange = e => { st.fac = e.target.value; render(); };
  R.$('#pj-sort').onchange = e => { st.sort = e.target.value; render(); };
  R.$('#pj-done').onclick = e => { const b = e.target.closest('[data-d]'); if (b) { st.done = b.dataset.d; render(); } };
  R.$('#pj-view').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { st.view = b.dataset.v; R.store.set('rs-pj-view', st.view); render(); } };
  R.$('#pj-years-f').onclick = e => { const b = e.target.closest('[data-y]'); if (b) { st.year = +b.dataset.y; render(); } };
  R.$('#pj-reset').onclick = () => { Object.assign(st, { q: '', year: 0, fac: '', done: '' }); R.$('#pj-q').value = ''; R.$('#pj-fac').value = ''; render(); };
  R.$('#pj-csv').onclick = () => R.csv(filtered().map(p => ({ call_year: p.year, title_ar: p.t, title_en: p.te, principal_investigator: p.pi, faculty: p.fac, department: p.dept,
    decision_date: p.date, status: p.done ? 'completed' : 'ongoing', profile: p.r ? location.origin + location.pathname.replace(/[^/]*$/, '') + R.profileUrl(p.r) : '' })), 'uop-supported-projects.csv');
  R.onPrint(() => {
    R.$('#pj-sum').innerHTML = `<span><b>الدعوة:</b> ${st.year || 'كل الدعوات'}</span><span><b>الكلية:</b> ${esc(st.fac || 'كل الكليات')}</span><span><b>الحالة:</b> ${st.done === '1' ? 'مكتمل' : st.done === '0' ? 'مستمر' : 'الكل'}</span>${st.q ? `<span><b>بحث:</b> ${esc(st.q)}</span>` : ''}<span><b>العدد:</b> ${R.n(filtered().length)}</span>`;
  });
})();
