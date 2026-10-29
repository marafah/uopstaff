/* projects.html: research projects funded by the University of Petra (Deanship of Scientific Research, srgs.uop.edu.jo),
   by call year, faculty and principal investigator, linked to the researchers' profiles on this site */
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

  // the principal investigator's profile here: same first and last name, titles left out
  const bare = n => R.norm(String(n || '').replace(/(الأستاذ|الاستاذ|الدكتورة|الدكتوره|الدكتور|البروفيسور|المدرسة|المدرس|المهندس|دولة|أ\.\s*د\.?|د\.|م\.|dr\.?|prof\.?)\s*/gi, ' ')).split(' ').filter(Boolean);
  const key = n => { const t = bare(n); return t.length ? t[0] + ' ' + t[t.length - 1] : ''; };
  const byName = {};
  list.forEach(r => { [r.name, r.name_en].forEach(n => { const k = key(n); if (k && !byName[k]) byName[k] = r; }); });
  all.forEach(p => { p.r = byName[key(p.pi)] || byName[key(p.pie)] || null; });

  const years = [...new Set(all.map(p => p.year).filter(Boolean))].sort((a, b) => b - a);
  const facs = [...new Set(all.map(p => p.fac).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));
  const st = { q: R.param('q'), year: +R.param('year') || 0, fac: R.param('fac'), done: R.param('status'), sort: 'new' };

  const pis = new Set(all.map(p => key(p.pi) || p.pi)).size;
  const done = all.filter(p => p.done).length;
  const kp = [
    ['bi-briefcase-fill', R.n(all.length), 'مشروعاً مدعوماً', `في ${years.length} دعوات (${years[years.length - 1]}–${years[0]})`, ''],
    ['bi-person-workspace', R.n(pis), 'باحثاً رئيسياً', `${all.filter(p => p.r).length} مشروعاً مرتبطاً بملف باحث هنا`, 'teal'],
    ['bi-building', R.n(facs.length), 'كليات', `أكثرها: ${esc(mostCommon(all.map(p => p.fac)))}`, 'navy'],
    ['bi-check2-circle', R.n(done), 'مكتملة', `${R.n(all.length - done)} مستمرة`, 'gold'],
    ['bi-calendar-event', R.n(all.filter(p => p.year === years[0]).length), `مشروعاً في دعوة ${years[0]}`, 'أحدث دعوة', 'scopus'],
  ];
  function mostCommon(a) { const c = {}; a.forEach(x => { c[x] = (c[x] || 0) + 1; }); return Object.entries(c).sort((x, y) => y[1] - x[1])[0][0]; }

  app.innerHTML = `
  <section class="rs-section rs-kpis">${kp.map(k => `<div class="rs-kpi ${k[4]}"><div class="v">${k[1]}</div><div class="l"><i class="bi ${k[0]}"></i>${k[2]}</div><div class="d">${k[3]}</div></div>`).join('')}</section>

  <section class="rs-section rs-grid rs-prj-charts">
    <div class="rs-card"><h3><i class="bi bi-bar-chart-line"></i>المشاريع حسب سنة الدعوة</h3><div class="rs-chart short"><canvas id="pj-years"></canvas></div></div>
    <div class="rs-card"><h3><i class="bi bi-building"></i>المشاريع حسب الكلية</h3><div class="rs-chart short"><canvas id="pj-facs"></canvas></div></div>
    <div class="rs-card"><h3><i class="bi bi-trophy"></i>الأكثر مشاريع مدعومة</h3><ol class="rs-venues" id="pj-top"></ol></div>
  </section>

  <section class="rs-section rs-card rs-jf no-print">
    <div class="rs-pj-filters">
      <div class="rs-jf-f"><label class="rs-jf-l" for="pj-q"><i class="bi bi-search"></i> بحث</label><input id="pj-q" class="form-control" type="search" placeholder="عنوان المشروع أو اسم الباحث أو القسم…" value="${esc(st.q)}"></div>
      <div class="rs-jf-f"><label class="rs-jf-l" for="pj-fac"><i class="bi bi-building"></i> الكلية</label><select id="pj-fac" class="form-select"><option value="">كل الكليات</option>${facs.map(f => `<option${f === st.fac ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select></div>
      <div class="rs-jf-f"><span class="rs-jf-l"><i class="bi bi-flag"></i> الحالة</span><div class="rs-seg rs-jf-span" id="pj-done"><button data-d="">الكل</button><button data-d="1">مكتمل</button><button data-d="0">مستمر</button></div></div>
      <div class="rs-jf-f"><label class="rs-jf-l" for="pj-sort"><i class="bi bi-sort-down"></i> الترتيب</label><select id="pj-sort" class="form-select"><option value="new">الأحدث أولاً</option><option value="fac">حسب الكلية</option><option value="pi">حسب الباحث</option><option value="title">حسب العنوان</option></select></div>
    </div>
    <div class="rs-jf-unis"><div class="rs-jf-l"><i class="bi bi-calendar3"></i> دعوة التقديم</div><div class="rs-chips" id="pj-years-f"></div></div>
  </section>
  <div class="rs-print-only rs-jf-sum" id="pj-sum"></div>

  <section class="rs-section">
    <div class="rs-pj-bar"><b id="pj-count"></b><span class="ms-auto d-flex gap-2 no-print"><button class="btn btn-sm btn-rs-o" id="pj-csv"><i class="bi bi-download"></i> CSV</button><button class="btn btn-sm btn-rs-o" type="button" onclick="print()"><i class="bi bi-printer"></i> طباعة</button></span></div>
    <div id="pj-list"></div>
  </section>

  <p class="rs-note">المصدر: <a href="${esc(P.source)}" target="_blank" rel="noopener">قائمة المشاريع البحثية المدعومة — عمادة البحث العلمي، جامعة البترا</a>.
    تُعرض المشاريع المقبولة من الجامعة (ودعوتا 2021 و2022: المقبولة من عمادة البحث العلمي بقرار)، والحالة «مكتمل/مستمر» كما تنشرها العمادة. تُحدَّث القائمة مع كل تحديث للبيانات.</p>`;

  // ---------------------------------------------------------------- charts and leaders (all projects)
  const yAsc = years.slice().reverse();
  R.chart('pj-years', { type: 'bar', data: { labels: yAsc, datasets: [
    { label: 'مكتمل', data: yAsc.map(y => all.filter(p => p.year === y && p.done).length), backgroundColor: '#1d7a3e', borderRadius: 3 },
    { label: 'مستمر', data: yAsc.map(y => all.filter(p => p.year === y && !p.done).length), backgroundColor: '#b8892b', borderRadius: 3 }] },
    options: { scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } },
      onClick: (e, el) => { if (el[0]) { st.year = yAsc[el[0].index]; render(); } } } });
  const fc = facs.map(f => [f, all.filter(p => p.fac === f).length]).sort((a, b) => b[1] - a[1]);
  R.chart('pj-facs', { type: 'bar', data: { labels: fc.map(x => x[0]), datasets: [{ label: 'مشاريع', data: fc.map(x => x[1]), backgroundColor: fc.map(x => R.facColor(x[0])), borderRadius: 3 }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { y: { ticks: { autoSkip: false } } },
      onClick: (e, el) => { if (el[0]) { st.fac = fc[el[0].index][0]; R.$('#pj-fac').value = st.fac; render(); } } } });
  const lead = {};
  all.forEach(p => { const k = key(p.pi) || p.pi; (lead[k] = lead[k] || { p, n: 0 }).n++; });
  const top = Object.values(lead).sort((a, b) => b.n - a.n).slice(0, 8), tmx = top[0] ? top[0].n : 1;
  R.$('#pj-top').innerHTML = top.map((x, i) => `<li><span class="rk">${i + 1}</span><div class="nm"><div class="t">${x.p.r ? `<a href="${R.profileUrl(x.p.r)}">${esc(x.p.r.name)}</a>` : `<span>${esc(x.p.pi)}</span>`}</div>
    <div class="rs-barwrap"><div class="rs-bar" style="width:${(100 * x.n / tmx).toFixed(0)}%"></div></div></div><b class="ct">${x.n}<small>مشروع</small></b></li>`).join('');

  // ---------------------------------------------------------------- the list
  function filtered() {
    const t = R.norm(st.q).split(' ').filter(Boolean);
    const L = all.filter(p => (!st.year || p.year === st.year) && (!st.fac || p.fac === st.fac) && (st.done === '' || st.done === undefined || String(+p.done) === st.done)
      && (!t.length || t.every(x => R.norm([p.t, p.te, p.pi, p.pie, p.fac, p.dept, p.depte].join(' ')).includes(x))));
    const by = { new: (a, b) => (b.year - a.year) || (+b.id - +a.id), fac: (a, b) => a.fac.localeCompare(b.fac, 'ar') || (b.year - a.year), pi: (a, b) => bare(a.pi).join(' ').localeCompare(bare(b.pi).join(' '), 'ar'), title: (a, b) => a.title.localeCompare(b.title, 'ar') };
    return L.sort(by[st.sort] || by.new);
  }
  const card = p => `<article class="rs-prj" style="--fc:${R.facColor(p.fac)}">
      <div class="top"><span class="rs-tag y">دعوة ${p.year || '–'}</span><span class="rs-tag ${p.done ? 'ok' : 'run'}"><i class="bi ${p.done ? 'bi-check2-circle' : 'bi-hourglass-split'}"></i> ${p.done ? 'مكتمل' : 'مستمر'}</span>${p.date ? `<span class="rs-tag"><i class="bi bi-calendar-check"></i> قرار ${esc(p.date)}</span>` : ''}</div>
      <h4 dir="auto">${esc(p.title)}</h4>${p.sub ? `<p class="en" dir="ltr">${esc(p.sub)}</p>` : ''}
      <div class="pi">${p.r ? `<a href="${R.profileUrl(p.r)}" title="الملف البحثي">${R.avatar(p.r, 'sm')}<span><b>${esc(p.r.name)}</b><small>${esc([p.r.rank, p.r.dept].filter(Boolean).join(' · '))}</small></span></a>`
        : `<span class="rs-avatar sm"><i class="bi bi-person"></i></span><span><b>${esc(p.pi)}</b><small>${esc(p.dept)}</small></span>`}<em>الباحث الرئيسي</em></div>
      <div class="ft"><span class="rs-chip"><i class="rs-udot" style="--uc:${R.facColor(p.fac)}"></i>${esc(p.fac)}</span>${p.dept ? `<span class="rs-chip">${esc(p.dept)}</span>` : ''}</div>
    </article>`;
  function render() {
    R.$$('#pj-done button').forEach(b => b.classList.toggle('on', b.dataset.d === (st.done || '')));
    R.$('#pj-years-f').innerHTML = [0, ...years].map(y => `<button type="button" class="rs-chip${st.year === y ? ' on' : ''}" data-y="${y}">${y ? 'دعوة ' + y : 'كل الدعوات'} <small>${y ? all.filter(p => p.year === y).length : all.length}</small></button>`).join('');
    const L = filtered();
    R.$('#pj-count').innerHTML = `<i class="bi bi-briefcase"></i> ${R.n(L.length)} مشروعاً${L.length !== all.length ? ` من ${R.n(all.length)}` : ''}`;
    // newest first: grouped by call, so each year reads as a block
    const groups = st.sort === 'new' ? years.filter(y => L.some(p => p.year === y)).map(y => [y, L.filter(p => p.year === y)]) : [[null, L]];
    R.$('#pj-list').innerHTML = L.length ? groups.map(([y, g]) => `${y ? `<h3 class="rs-pj-year"><span>دعوة ${y}</span><small>${g.length} مشروعاً</small></h3>` : ''}<div class="rs-prj-grid">${g.map(card).join('')}</div>`).join('')
      : '<div class="rs-empty"><i class="bi bi-search"></i>لا مشاريع تطابق البحث.</div>';
    const u = new URL(location); [['q', st.q], ['year', st.year || ''], ['fac', st.fac], ['status', st.done || '']].forEach(([k, v]) => v ? u.searchParams.set(k, v) : u.searchParams.delete(k)); history.replaceState(null, '', u);
  }
  render();
  R.$('#pj-q').addEventListener('input', R.debounce(e => { st.q = e.target.value; render(); }, 200));
  R.$('#pj-fac').onchange = e => { st.fac = e.target.value; render(); };
  R.$('#pj-sort').onchange = e => { st.sort = e.target.value; render(); };
  R.$('#pj-done').onclick = e => { const b = e.target.closest('[data-d]'); if (b) { st.done = b.dataset.d; render(); } };
  R.$('#pj-years-f').onclick = e => { const b = e.target.closest('[data-y]'); if (b) { st.year = +b.dataset.y; render(); } };
  R.$('#pj-csv').onclick = () => R.csv(filtered().map(p => ({ call_year: p.year, title_ar: p.t, title_en: p.te, principal_investigator: p.pi, faculty: p.fac, department: p.dept,
    decision_date: p.date, status: p.done ? 'completed' : 'ongoing', profile: p.r ? location.origin + location.pathname.replace(/[^/]*$/, '') + R.profileUrl(p.r) : '' })), 'uop-supported-projects.csv');
  R.onPrint(() => {
    R.$('#pj-sum').innerHTML = `<span><b>الدعوة:</b> ${st.year || 'كل الدعوات'}</span><span><b>الكلية:</b> ${esc(st.fac || 'كل الكليات')}</span><span><b>الحالة:</b> ${st.done === '1' ? 'مكتمل' : st.done === '0' ? 'مستمر' : 'الكل'}</span>${st.q ? `<span><b>بحث:</b> ${esc(st.q)}</span>` : ''}<span><b>العدد:</b> ${R.n(filtered().length)}</span>`;
  });
})();
