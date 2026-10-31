/* annual.html «ملفي البحثي»: one researcher's year on one page, for the annual review and promotion files: output and
   its quality, citations, collaboration, projects funded by the university, and where the year leaves them under the
   university's instructions (reward estimate م7 تعليمات البحث العلمي المعدلة بقرار 6841، award points م8 تعليمات الجائزة، and the five-year
   rule of م12 نظام الهيئة التدريسية). Prints as a report with the QR header. */
(async function () {
  'use strict';
  const app = R.$('#rs-app');
  let data, wdata, pdata = { projects: [] };
  try { [data, wdata] = await R.loadAll(['researchers', 'works']); } catch (e) { R.fail(app, e); return; }
  try { pdata = await R.load('projects'); } catch (e) { /* projects are optional */ }
  const { list, byId } = R.indexResearchers(data);
  const PJ = R.linkProjects((pdata.projects || []).map(p => Object.assign({}, p)), list);
  R.updated(data.meta || {});
  const esc = R.esc, works = wdata.works || [], thisYear = new Date().getFullYear();
  const ref = (a, d) => `<a class="rs-ref" href="regulations.html?doc=${d}&a=${a}" target="_blank" rel="noopener">م(${a})</a>`;
  const SC = { Q1: [400, 1200], Q2: [400, 800], Q3: [200, 500], Q4: [200, 200], NA: [200, 200] };   // تعليمات البحث العلمي م(7/4) بعد قرار 6841
  const shares = n => n <= 1 ? [1] : n === 2 ? [0.6, 0.4] : n === 3 ? [0.5, 0.25, 0.25] : [0.35, ...Array(n - 1).fill(0.65 / (n - 1))];
  const AWARD = { Q1: [60, 30], Q2: [50, 25], Q3: [40, 20], Q4: [30, 15], NA: [20, 10] };
  const SKIP = R.SKIP_TYPES;   // not research output (research.js)
  const st = { rid: R.param('id'), y: +R.param('y') || thisYear - (new Date().getMonth() < 2 ? 1 : 0) };

  const posOf = (w, r) => { const au = (w.au || '').replace(/ …$/, '').split(/,\s*/).filter(Boolean); const last = R.norm(r.name_en || '').split(' ').pop();
    const i = au.findIndex(a => last && R.norm(a).includes(last)); return { n: w.na || au.length || 1, me: i >= 0 ? i + 1 : 1 }; };
  const mine = r => works.filter(w => (w.r || []).includes(r.id) && !SKIP.includes(w.type));
  const cit = w => w.sc != null ? w.sc : (w.c || 0);

  app.innerHTML = `
  <section class="rs-section rs-card rs-jf no-print"><div class="rs-pr-form">
    <div class="rs-jf-f"><label class="rs-jf-l" for="an-who"><i class="bi bi-person"></i> الباحث</label><input id="an-who" class="form-control" list="an-names" placeholder="اكتب اسمك…" autocomplete="off"><datalist id="an-names">${list.map(r => `<option value="${esc(r.name)}">`).join('')}</datalist></div>
    <div class="rs-jf-f"><label class="rs-jf-l" for="an-y"><i class="bi bi-calendar3"></i> السنة</label><select id="an-y" class="form-select">${Array.from({ length: 8 }, (_, i) => thisYear - i).map(y => `<option${y === st.y ? ' selected' : ''}>${y}</option>`).join('')}</select></div>
    <div class="rs-jf-f"><span class="rs-jf-l"><i class="bi bi-printer"></i> التقرير</span><button class="btn btn-rs" onclick="print()"><i class="bi bi-file-earmark-pdf"></i> طباعة / PDF</button></div>
  </div></section>
  <div id="an-body"></div>`;

  function render() {
    const body = R.$('#an-body'), r = byId[st.rid], y = st.y;
    if (!r) { body.innerHTML = `<div class="rs-empty"><i class="bi bi-person-vcard"></i>اختر اسمك لعرض ملفك البحثي لسنة ${y}.</div>`; return; }
    const all = mine(r), yr = all.filter(w => w.y === y).sort((a, b) => (a.q || 'Q9').localeCompare(b.q || 'Q9') || cit(b) - cit(a)), prev = all.filter(w => w.y === y - 1);
    const sc = yr.filter(w => w.eid || (w.src || '').includes('s')), q12 = yr.filter(w => w.q === 'Q1' || w.q === 'Q2');
    const intl = yr.filter(w => (w.cc || []).some(c => c !== 'JO')), oa = yr.filter(R.isOA), lead = yr.filter(w => posOf(w, r).me === 1);
    const fw = yr.map(w => w.fwci).filter(x => x != null), fwci = fw.length ? fw.reduce((a, b) => a + b, 0) / fw.length : null;
    const byY = r.by_year || {}, citesY = byY[y] ? byY[y][1] : null, citesP = byY[y - 1] ? byY[y - 1][1] : null;
    const qs = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 }; yr.forEach(w => { if (qs[w.q] != null) qs[w.q]++; });
    // reward estimate (max of the table, the researcher's share by position) and award points of the year's journal papers
    const jpapers = yr.filter(w => /article|review/.test(w.type) && (w.q || (w.src || '').includes('s')));
    const rew = jpapers.reduce((t, w) => { const q = w.q || 'NA', p = posOf(w, r), intlX = (w.cc || []).some(c => c !== 'JO') ? 200 : 0; return t + (SC[q][0] + SC[q][1] + intlX) * shares(p.n)[Math.min(p.n, p.me) - 1]; }, 0);
    const award = jpapers.reduce((t, w) => t + AWARD[w.q || 'NA'][posOf(w, r).me === 1 ? 0 : 1], 0);
    // the five-year rule
    const lastY = Math.max(0, ...all.filter(w => w.y <= thisYear).map(w => w.y || 0)), quiet = lastY ? thisYear - lastY : null;
    const ruleRank = (r.rank_order || 9) <= 3;
    const projs = PJ.filter(p => p.r === r).sort((a, b) => (b.year || 0) - (a.year || 0));
    const pY = projs.filter(p => +p.year === y);
    const ctry = {}; yr.forEach(w => (w.cc || []).filter(c => c !== 'JO').forEach(c => { ctry[c] = (ctry[c] || 0) + 1; }));
    const dn = (() => { try { return new Intl.DisplayNames(['ar'], { type: 'region' }); } catch (e) { return { of: c => c }; } })();
    const mates = {}; yr.forEach(w => (w.r || []).filter(id => id !== r.id).forEach(id => { mates[id] = (mates[id] || 0) + 1; }));
    const delta = (a, b) => b == null || a == null ? '' : a === b ? '<small class="d eq">= السنة السابقة</small>' : `<small class="d ${a > b ? 'up' : 'down'}"><i class="bi bi-arrow-${a > b ? 'up' : 'down'}-short"></i>${R.n(Math.abs(a - b))} عن ${y - 1}</small>`;
    const kpi = (v, l, icon, d, cls = '') => `<div class="rs-kpi ${cls}"><div class="v">${v}</div><div class="l"><i class="bi ${icon}"></i>${l}</div>${d ? `<div class="d">${d}</div>` : ''}</div>`;

    body.innerHTML = `
    <section class="rs-section rs-card rs-an-head">
      ${R.avatar(r, 'lg')}<div><h2>${esc(r.name)}</h2><p class="mb-1">${esc(r.rank || '')}${r.dept ? ' · ' + esc(r.dept) : ''}${r.faculty ? ' · ' + esc(r.faculty) : ''}</p>
        <span class="rs-tag y"><i class="bi bi-calendar3"></i> الملف البحثي لسنة ${y}${y === thisYear ? ' (حتى تاريخه)' : ''}</span> <a class="rs-tag no-print" href="${R.profileUrl(r)}"><i class="bi bi-person-badge"></i> الملف الكامل</a></div>
    </section>
    <section class="rs-section rs-kpis">
      ${kpi(R.n(yr.length), 'منشور في السنة', 'bi-journal-text', delta(yr.length, prev.length))}
      ${kpi(R.n(sc.length), 'في Scopus', 'bi-bar-chart-line', `${R.n(q12.length)} في Q1–Q2`, 'teal')}
      ${kpi(citesY == null ? '–' : R.n(citesY), 'اقتباس خلال السنة', 'bi-quote', citesY == null ? 'OpenAlex' : delta(citesY, citesP), 'navy')}
      ${kpi(fwci == null ? '–' : fwci.toFixed(2), 'متوسط FWCI', 'bi-speedometer2', fwci == null ? '' : fwci >= 1 ? 'فوق المتوسط العالمي (1.0)' : 'دون المتوسط العالمي (1.0)', 'gold')}
      ${kpi(R.n(intl.length), 'بتعاون دولي', 'bi-globe2', yr.length ? R.pct(intl.length / yr.length) + ' من منشورات السنة' : '')}
      ${kpi(R.n(lead.length), 'باحثاً أول', 'bi-person-up', yr.length ? `${R.n(oa.length)} وصول مفتوح` : '')}
    </section>
    <section class="rs-section rs-grid">
      <div class="rs-card rs-span-2"><h3><i class="bi bi-bar-chart"></i>المنشورات والاقتباسات في آخر 6 سنوات</h3><div class="rs-chart"><canvas id="an-trend"></canvas></div></div>
      <div class="rs-card"><h3><i class="bi bi-award"></i>تصنيف مجلات ${y}</h3>${Object.values(qs).some(Boolean) ? '<div class="rs-chart short"><canvas id="an-q"></canvas></div>' : '<p class="text-muted">لا أبحاث مصنفة في هذه السنة.</p>'}</div>
    </section>
    <section class="rs-section rs-card"><h3><i class="bi bi-clipboard-check"></i>السنة وفق تعليمات الجامعة</h3>
      <div class="rs-pr-checklist">
        <div class="ok"><i class="bi bi-cash-coin" style="color:#1d7a3e"></i><div><b>دعم النشر وحوافزه (تقدير)</b><span>${R.n(rew)} دينار لـ ${jpapers.length} ${jpapers.length === 1 ? 'بحث' : 'أبحاث'} في مجلات Scopus، حصتك حسب ترتيبك</span><em><a href="reward.html">احسب كل بحث بالتفصيل</a></em></div><small>${ref('7', '06')}/4</small></div>
        ${(() => { const lead = q12.filter(w => posOf(w, r).me === 1).length; return `<div class="${lead >= 6 ? 'ok' : ''}"><i class="bi bi-hourglass-bottom" style="color:${lead >= 6 ? '#1d7a3e' : '#8a5300'}"></i><div><b>تخفيض العبء التدريسي 3 ساعات</b><span>${R.n(lead)} من 6 أبحاث Q1–Q2 في Scopus باحثاً أول في هذا العام الميلادي${lead >= 6 ? ' — مؤهل للتقدم للفصلين التاليين' : ''} (أو ما يعادلها من مشروع مدعوم خارجياً: بحث لكل 10,000 دينار وبحد أقصى أربعة)</span></div><small>${ref('14', '06')}</small></div>`; })()}
        <div class="ok"><i class="bi bi-trophy" style="color:#b8892b"></i><div><b>نقاط جائزة الباحث المتميز من أبحاث السنة</b><span>${R.n(award)} نقطة من الأبحاث وحدها (تُحتسب ثلاث سنوات مع الاستشهادات)</span><em><a href="award.html?id=${encodeURIComponent(r.id)}">نقاطك الكاملة وترتيبك في القسم</a></em></div><small>${ref('8', '11')}/د</small></div>
        <div class="ok"><i class="bi bi-ladder" style="color:#2b5ea7"></i><div><b>الترقية</b><span>${R.n(q12.length)} في الفئة الأولى (Q1–Q2) و${R.n(yr.filter(w => w.q === 'Q3' || w.q === 'Q4').length)} في الفئة الثانية (Q3–Q4) هذه السنة</span><em><a href="promotion.html?id=${encodeURIComponent(r.id)}">ما لديك وما ينقصك للترقية</a></em></div><small>${ref('23', '05')}</small></div>
        ${ruleRank ? `<div class="${quiet != null && quiet < 5 ? 'ok' : 'no'}"><i class="bi ${quiet != null && quiet < 5 ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'}"></i><div><b>استمرار الإنتاج العلمي (خمس سنوات)</b><span>${lastY ? `آخر إنتاج منشور مسجّل: ${lastY}` : 'لا إنتاج منشور مسجّل في مصادر الموقع'}</span>${quiet != null && quiet >= 3 && quiet < 5 ? `<em>لم يُسجَّل إنتاج منذ ${quiet} سنوات؛ تتوقف الزيادة السنوية إذا توقف الإنتاج خمس سنوات</em>` : quiet == null || quiet >= 5 ? '<em>تحقّق من إنتاجك: قد لا تُظهر المصادر كل ما نشرته</em>' : ''}</div><small>${ref('12', '02')}</small></div>` : ''}
      </div></section>
    <section class="rs-section rs-card"><h3><i class="bi bi-journal-text"></i>منشورات ${y} <span class="rs-tag y">${yr.length}</span></h3>
      ${yr.length ? `<div class="rs-scroll" style="max-height:none"><table class="rs-table rs-an-pubs"><thead><tr><th>#</th><th>المنشور</th><th class="num">التصنيف</th><th class="num">ترتيبك</th><th class="num">الاقتباسات</th></tr></thead><tbody>
        ${yr.map((w, i) => { const p = posOf(w, r); return `<tr><td class="num">${i + 1}</td><td class="t"><a href="${R.docUrl(w)}" dir="auto"><b>${esc(w.t)}</b></a><small class="ltr">${esc(w.v || '')}</small></td><td class="num">${w.q ? R.qTag(w.q) : '<small class="text-muted">–</small>'}</td><td class="num">${p.me} من ${p.n}</td><td class="num">${R.n(cit(w))}</td></tr>`; }).join('')}</tbody></table></div>`
        : `<p class="text-muted mb-0">لا منشورات مسجّلة لسنة ${y}. إن كان لديك منشورات غير ظاهرة، أضفها عبر <a href="researcher.html?id=${encodeURIComponent(r.id)}">صفحتك</a>.</p>`}</section>
    <section class="rs-section rs-grid">
      <div class="rs-card"><h3><i class="bi bi-people"></i>التعاون في ${y}</h3>
        ${Object.keys(mates).length ? `<p class="mb-1"><b>زملاء من البترا:</b></p><div class="d-flex flex-wrap gap-1 mb-2">${Object.entries(mates).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id, n]) => byId[id] ? `<a class="rs-chip" href="${R.profileUrl(byId[id])}">${esc(byId[id].name)} <b>${n}</b></a>` : '').join('')}</div>` : ''}
        ${Object.keys(ctry).length ? `<p class="mb-1"><b>دول الشركاء:</b></p><div class="d-flex flex-wrap gap-1">${Object.entries(ctry).sort((a, b) => b[1] - a[1]).map(([c, n]) => `<span class="rs-chip">${esc(dn.of(c) || c)} <b>${n}</b></span>`).join('')}</div>` : '<p class="text-muted mb-0">لا تعاون دولي مسجّل في هذه السنة.</p>'}</div>
      <div class="rs-card"><h3><i class="bi bi-briefcase"></i>مشاريع مدعومة من الجامعة</h3>
        ${projs.length ? `<p class="mb-2">${pY.length ? `<b>${pY.length}</b> في ${y}` : `لا مشاريع في ${y}`} · ${projs.length} إجمالاً</p>${(pY.length ? pY : projs.slice(0, 3)).map(p => R.projectCard(p, { compact: true })).join('')}` : '<p class="text-muted mb-0">لا مشاريع مدعومة باسمك في قائمة عمادة البحث العلمي.</p>'}</div>
    </section>
    <p class="rs-note rs-skipnote">${R.skipNote(works.filter(w => (w.r || []).includes(r.id)))}</p>
    <p class="rs-note">المصادر: منشورات الباحث كما يجمعها هذا الموقع من Scopus وOpenAlex وWeb of Science وصفحة المدرس؛ الاقتباسات السنوية من OpenAlex، وتصنيف المجلات من SCImago. المبالغ والنقاط تقديرية حسب جداول التعليمات، والقرار للجهات المختصة.</p>`;

    const ys = []; for (let i = y - 5; i <= y; i++) ys.push(i);
    const cnt = yy => all.filter(w => w.y === yy).length;
    R.chart('an-trend', { type: 'bar', data: { labels: ys, datasets: [
      { label: 'المنشورات', data: ys.map(cnt), backgroundColor: ys.map(v => v === y ? '#901d23' : R.alpha('#901d23', .45)), borderRadius: 4, yAxisID: 'y' },
      { type: 'line', label: 'الاقتباسات خلال السنة', data: ys.map(v => byY[v] ? byY[v][1] : null), borderColor: '#1f6f78', backgroundColor: '#1f6f78', borderWidth: 2, pointRadius: 4, yAxisID: 'y1' }] },
      options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: 'منشورات' } }, y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'اقتباسات' } } } } });
    if (Object.values(qs).some(Boolean)) R.chart('an-q', { type: 'doughnut', data: { labels: Object.keys(qs), datasets: [{ data: Object.values(qs), backgroundColor: ['#1d7a3e', '#1f6f78', '#b8892b', '#c75b12'], borderColor: '#fff', borderWidth: 2 }] }, options: { cutout: '55%' } });
    document.title = `الملف البحثي ${y} – ${r.name}`;
    const u = new URL(location); u.searchParams.set('id', r.id); u.searchParams.set('y', y); history.replaceState(null, '', u);
  }
  if (st.rid && byId[st.rid]) R.$('#an-who').value = byId[st.rid].name;
  render();
  R.$('#an-who').addEventListener('change', e => { const r = list.find(x => x.name === e.target.value.trim()); if (r) { st.rid = r.id; render(); } });
  R.$('#an-y').onchange = e => { st.y = +e.target.value; render(); };
})();
