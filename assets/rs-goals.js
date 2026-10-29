/* goals.html: the university's research indicators against targets the deanship sets. Values come from the official
   Scopus export of the university (collab.json: documents, quartiles, international co-authorship, citations), the
   staff records of this site (active researchers, output per member) and the deanship's list of funded projects.
   Targets are kept in this browser and travel in the link, so a target set can be shared and printed. */
(async function () {
  'use strict';
  const app = R.$('#rs-app');
  let C, data, wdata, pdata = { projects: [] };
  try { [C, data, wdata] = await R.loadAll(['collab', 'researchers', 'works']); } catch (e) { R.fail(app, e); return; }
  try { pdata = await R.load('projects'); } catch (e) { /* optional */ }
  const { list, byId } = R.indexResearchers(data);
  R.updated(data.meta || {});
  const esc = R.esc, thisYear = new Date().getFullYear(), works = wdata.works || [];
  const I = Object.fromEntries(C.cols.map((c, i) => [c, i]));
  const JO = C.countries.findIndex(c => c[1] === 'JO');
  const docs = C.docs.map(d => ({ y: d[I.y], c: d[I.c], q: d[I.q], intl: d[I.ctry].some(x => x !== JO), r: d[I.r] }));
  const staff = list.filter(r => (r.rank_order || 9) <= 4);
  const facOf = id => byId[id] && byId[id].faculty;
  // the share of the year gone, to project this year's counts to a full year
  const now = new Date(), frac = (now - new Date(thisYear, 0, 1)) / (new Date(thisYear + 1, 0, 1) - new Date(thisYear, 0, 1));

  // ---------------------------------------------------------------- indicators: value(year, faculty?) -> number
  const D = (y, f) => docs.filter(d => d.y === y && (!f || d.r.some(id => facOf(id) === f)));
  const share = (a, b) => b ? 100 * a / b : 0;
  const IND = [
    { k: 'docs', t: 'وثائق Scopus', icon: 'bi-journal-text', unit: '', count: true, v: (y, f) => D(y, f).length, tip: 'كل وثائق الجامعة في Scopus المنشورة في السنة (التصدير الرسمي)' },
    { k: 'q1', t: 'نسبة Q1', icon: 'bi-award', unit: '%', v: (y, f) => { const d = D(y, f), r = d.filter(x => x.q); return share(r.filter(x => x.q === 'Q1').length, r.length); }, tip: 'من الوثائق المنشورة في مجلات مصنفة (SJR)' },
    { k: 'q12', t: 'نسبة Q1–Q2', icon: 'bi-bar-chart-line', unit: '%', v: (y, f) => { const d = D(y, f), r = d.filter(x => x.q); return share(r.filter(x => x.q === 'Q1' || x.q === 'Q2').length, r.length); } },
    { k: 'intl', t: 'التعاون الدولي', icon: 'bi-globe2', unit: '%', v: (y, f) => { const d = D(y, f); return share(d.filter(x => x.intl).length, d.length); }, tip: 'وثائق فيها مؤلف من مؤسسة خارج الأردن' },
    { k: 'cpd', t: 'الاقتباسات لكل وثيقة', icon: 'bi-quote', unit: '', dec: 1, v: (y, f) => { const d = D(y, f); return d.length ? d.reduce((t, x) => t + x.c, 0) / d.length : 0; }, tip: 'اقتباسات Scopus الحالية لوثائق تلك السنة؛ ترتفع مع الوقت' },
    { k: 'active', t: 'الباحثون النشطون', icon: 'bi-activity', unit: '%', v: (y, f) => { const S = staff.filter(r => !f || r.faculty === f), act = new Set(); works.forEach(w => { if (w.y === y) (w.r || []).forEach(id => act.add(id)); }); return share(S.filter(r => act.has(r.id)).length, S.length); }, tip: 'أعضاء الهيئة التدريسية الحاليون الذين لهم منشور في السنة' },
    { k: 'per', t: 'وثائق Scopus لكل عضو', icon: 'bi-person-up', unit: '', dec: 2, count: true, v: (y, f) => { const S = staff.filter(r => !f || r.faculty === f).length; return S ? D(y, f).length / S : 0; } },
    { k: 'proj', t: 'مشاريع بحثية مدعومة', icon: 'bi-briefcase', unit: '', count: true, v: (y, f) => (pdata.projects || []).filter(p => +p.year === y && (!f || p.fac === f)).length, tip: 'حسب سنة الدعوة في قائمة عمادة البحث العلمي' },
  ];
  // default target: the last full year plus 10% for counts, plus 3 points for shares
  const last = thisYear - 1;
  const defTarget = ind => { const v = ind.v(last); return ind.unit === '%' ? Math.min(100, Math.round(v + 3)) : +(v * 1.1).toFixed(ind.dec || 0); };
  let saved = R.store.get('rs-goals', {});
  try { const g = R.param('g'); if (g) saved = Object.assign(saved, JSON.parse(decodeURIComponent(escape(atob(g))))); } catch (e) { /* bad link: keep the saved targets */ }
  const st = { y: +R.param('y') || thisYear, fac: R.param('fac'), T: Object.fromEntries(IND.map(i => [i.k, saved[i.k] != null ? +saved[i.k] : defTarget(i)])) };

  app.innerHTML = `
  <section class="rs-section rs-card rs-pr-intro">
    <div><h3><i class="bi bi-bullseye"></i>مؤشرات أهداف البحث العلمي</h3>
      <p class="mb-0">قِس الإنتاج البحثي للجامعة أو لكل كلية مقابل أهداف تضعها العمادة: حجم النشر، وجودة المجلات، والتعاون الدولي، والأثر، ونشاط الباحثين، والمشاريع المدعومة. عدّل أي هدف بالنقر عليه؛ تُحفظ الأهداف في متصفحك وتنتقل مع رابط المشاركة.</p></div>
    <div class="d-flex gap-2 flex-wrap no-print"><button class="btn btn-rs-o" id="gl-share"><i class="bi bi-link-45deg"></i> رابط بالأهداف</button><button class="btn btn-rs-o" id="gl-reset"><i class="bi bi-arrow-counterclockwise"></i> الأهداف المقترحة</button><button class="btn btn-rs" onclick="print()"><i class="bi bi-printer"></i> التقرير</button></div>
  </section>
  <section class="rs-section rs-card rs-jf no-print"><div class="rs-pr-form">
    <div class="rs-jf-f"><label class="rs-jf-l" for="gl-y"><i class="bi bi-calendar3"></i> السنة</label><select id="gl-y" class="form-select">${Array.from({ length: 6 }, (_, i) => thisYear - i).map(y => `<option${y === st.y ? ' selected' : ''} value="${y}">${y}${y === thisYear ? ' (حتى تاريخه)' : ''}</option>`).join('')}</select></div>
    <div class="rs-jf-f"><label class="rs-jf-l" for="gl-fac"><i class="bi bi-building"></i> النطاق</label><select id="gl-fac" class="form-select"><option value="">الجامعة كلها</option>${R.faculties(staff).map(f => `<option${f === st.fac ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select></div>
  </div></section>
  <section class="rs-section rs-gl-grid" id="gl-cards"></section>
  <section class="rs-section rs-card"><h3><i class="bi bi-table"></i>الكليات مقابل الأهداف <small class="fw-normal text-muted" id="gl-tsub"></small></h3><div class="rs-scroll full" id="gl-table"></div></section>
  <p class="rs-note">المصادر: تصدير Scopus الرسمي للجامعة (${esc(C.source || '')}) للوثائق والتصنيف والتعاون الدولي والاقتباسات، مع تصنيف SCImago للمجلات؛ وسجلات هذا الموقع لأعضاء الهيئة التدريسية الحاليين؛ وقائمة عمادة البحث العلمي للمشاريع المدعومة. للسنة الجارية تُعرض القيمة حتى تاريخه مع تقدير لنهاية السنة للمؤشرات العددية. الأهداف الافتراضية مقترحة (السنة السابقة +10% للأعداد، +3 نقاط للنسب) إلى أن تعتمد العمادة أهدافها.</p>`;

  const fmt = (ind, v) => v == null ? '–' : (ind.unit === '%' ? v.toFixed(1) + '%' : ind.dec ? v.toFixed(ind.dec) : R.n(v));
  function render() {
    const y = st.y, ytd = y === thisYear;
    R.$('#gl-cards').innerHTML = IND.map(ind => {
      const v = ind.v(y, st.fac), proj = ytd && ind.count && frac > 0.05 ? v / frac : null, cmp = proj != null ? proj : v, T = st.T[ind.k], p = T ? Math.min(150, 100 * cmp / T) : 0;
      const prev = ind.v(y - 1, st.fac), ok = cmp >= T, near = !ok && p >= 85;
      const s = ok ? ['ok', 'محقق', 'bi-check-circle-fill'] : near ? ['warn', ytd ? 'قريب من الهدف' : 'قريب', 'bi-dash-circle-fill'] : ['no', ytd ? 'دون المسار' : 'لم يتحقق', 'bi-x-circle-fill'];
      return `<div class="rs-card rs-gl ${s[0]}" title="${esc(ind.tip || '')}">
        <div class="h"><i class="bi ${ind.icon}"></i><b>${ind.t}</b><span class="rs-tag ${s[0]}"><i class="bi ${s[2]}"></i> ${s[1]}</span></div>
        <div class="v">${fmt(ind, v)}${proj != null ? `<small>تقدير نهاية السنة ${fmt(ind, proj)}</small>` : ''}</div>
        <div class="bar"><i style="width:${Math.min(100, p).toFixed(0)}%"></i><em style="inset-inline-start:${(100 * 100 / Math.max(100, p)).toFixed(0)}%"></em></div>
        <div class="f"><span>الهدف <input type="number" step="any" min="0" class="no-print" data-t="${ind.k}" value="${T}"><b class="print-only">${fmt(ind, T)}</b>${ind.unit}</span><span>${y - 1}: <b>${fmt(ind, prev)}</b></span></div>
        <div class="rs-gl-chart"><canvas id="gl-c-${ind.k}"></canvas></div></div>`;
    }).join('');
    IND.forEach(ind => {
      const ys = []; for (let i = y - 5; i <= y; i++) ys.push(i);
      R.chart('gl-c-' + ind.k, { type: 'line', data: { labels: ys, datasets: [
        { label: ind.t, data: ys.map(v => +ind.v(v, st.fac).toFixed(2)), borderColor: '#901d23', backgroundColor: R.alpha('#901d23', .12), fill: true, tension: .3, pointRadius: ys.map(v => v === y ? 4 : 2), borderWidth: 2 },
        { label: 'الهدف', data: ys.map(v => v === y ? st.T[ind.k] : null), borderColor: '#1d7a3e', backgroundColor: '#1d7a3e', pointStyle: 'line', pointRadius: 10, pointBorderWidth: 3, showLine: false }] },
        options: { animation: false, plugins: { legend: { display: false }, rsLabels: false }, scales: { x: { ticks: { font: { size: 10 } } }, y: { beginAtZero: true, ticks: { font: { size: 10 }, maxTicksLimit: 4 } } } } });
    });
    // faculties: each indicator for the year, green where the faculty reaches the university target
    const facs = R.faculties(staff);
    R.$('#gl-tsub').textContent = `${y}${ytd ? ' حتى تاريخه' : ''} · الأخضر = يبلغ الهدف`;
    R.$('#gl-table').innerHTML = `<table class="rs-table rs-gl-table"><thead><tr><th>الكلية</th>${IND.map(i => `<th class="num">${i.t}</th>`).join('')}</tr></thead><tbody>
      ${facs.map(f => `<tr><th>${esc(f)}</th>${IND.map(ind => { const v = ind.v(y, f); const tv = ind.count && ind.k !== 'per' ? null : st.T[ind.k]; const cmp = ytd && ind.count && frac > 0.05 ? v / frac : v;
        return `<td class="num ${tv != null && cmp >= tv ? 'hit' : ''}">${fmt(ind, v)}</td>`; }).join('')}</tr>`).join('')}
      <tr class="tot"><th>الجامعة</th>${IND.map(ind => `<td class="num"><b>${fmt(ind, ind.v(y))}</b></td>`).join('')}</tr></tbody></table>
      <p class="rs-note mt-2 mb-0">أهداف الأعداد (الوثائق، المشاريع) للجامعة كلها، فلا تُلوَّن للكليات؛ تُلوَّن النسب والمعدلات.</p>`;
    const u = new URL(location); [['y', y === thisYear ? '' : y], ['fac', st.fac]].forEach(([k, v]) => v ? u.searchParams.set(k, v) : u.searchParams.delete(k)); u.searchParams.delete('g'); history.replaceState(null, '', u);
  }
  render();
  R.$('#gl-y').onchange = e => { st.y = +e.target.value; render(); };
  R.$('#gl-fac').onchange = e => { st.fac = e.target.value; render(); };
  R.$('#gl-cards').addEventListener('change', e => { const k = e.target.dataset.t; if (!k) return; st.T[k] = +e.target.value || 0; R.store.set('rs-goals', st.T); render(); });
  R.$('#gl-reset').onclick = () => { st.T = Object.fromEntries(IND.map(i => [i.k, defTarget(i)])); R.store.set('rs-goals', {}); render(); };
  R.$('#gl-share').onclick = async () => {
    const u = new URL(location); u.searchParams.set('g', btoa(unescape(encodeURIComponent(JSON.stringify(st.T)))));
    try { await navigator.clipboard.writeText(u.href); R.$('#gl-share').innerHTML = '<i class="bi bi-check2"></i> نُسخ الرابط'; } catch (e) { prompt('انسخ الرابط:', u.href); }
    setTimeout(() => { R.$('#gl-share').innerHTML = '<i class="bi bi-link-45deg"></i> رابط بالأهداف'; }, 2000);
  };
})();
